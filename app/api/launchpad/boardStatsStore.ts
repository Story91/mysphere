import 'server-only';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';
import { DB_DEADLINE_MS, withDeadline } from './dbDeadline';
import {
  BOARD_STATS_COLLECTION,
  boardStatsDocId,
  joinPayload,
  MAX_PARTS,
  partId,
  PARTS_SUBCOLLECTION,
  splitPayload,
  stalePartIds,
} from './boardStatsLayout';

/**
 * Cache agregatu tablicy launchpada - kolekcja `launchpadBoardStats`.
 *
 * === CO TU JEST ===
 * Dokladnie ten sam agregat, ktory przegladarka trzymala dotad wylacznie u
 * siebie (`startpad.agg.v1.*`): wolumen, liczba transakcji, zbior handlujacych,
 * naliczenia oplat, ceny do sparkline'a i tasma zdarzen - razem z blokiem, do
 * ktorego jest policzony. Zapis robi WYLACZNIE `/api/launchpad/board/stats`,
 * po skanie lancucha.
 *
 * === CZY TO JEST ZRODLO PRAWDY ===
 * Nie. Zrodlem prawdy jest lancuch. To jest przyspieszenie: ten sam agregat,
 * ktory przegladarka umie policzyc sama (i liczy, gdy tego cache'u nie ma).
 * Podmiana tych dokumentow zaklamalaby WOLUMEN i SPARKLINE - nie stan handlu.
 * Rezerwa krzywej, stan launchu i cena, od ktorych zalezy czyjs pieniadz, ida
 * do tablicy z osobnego `multicall(launchOf)` prosto z lancucha, a panel handlu
 * czyta je jeszcze raz u siebie.
 *
 * Ta sama uwaga o `firestore.rules`, co przy `historyStore`: nazwa kolekcji
 * MUSI byc na liscie w `hasOwnRules`, inaczej `allow write: if false` jest
 * martwa dekoracja i pisze tu kazdy anonimowy klient.
 */

/**
 * Ile milisekund cache uchodzi za swiezy. Ponizej tego progu odpowiadamy tym,
 * co lezy, bez dotykania RPC. Prog jest wyzszy niz przy historii tokena
 * (12 s), bo tablica ma wlasne zrodlo swiezosci: `watchContractEvent` dokłada
 * pojedyncze zdarzenia do stanu, ktory juz jest na ekranie, a ten cache
 * odpowiada wylacznie za to, co widac PRZY WEJSCIU.
 */
export const FRESH_FOR_MS = 20_000;

/**
 * Blokada na czas skanu. Dwoch odwiedzajacych naraz nie przemiata tego samego
 * zakresu dwa razy: drugi dostaje to, co juz jest w bazie, i wraca po nowe za
 * chwile. Wartosc to sufit realnego skanu, nie jego oczekiwany czas - wygasla
 * blokada MUSI sie odblokowac sama, bo padniety proces nie posprzata po sobie.
 *
 * Przy agregacie ta blokada robi wiecej niz oszczednosc: zapis jest
 * READ-MODIFY-WRITE na SUMIE. Dwa zadania, ktore przeczytaja ten sam stan
 * sprzed i dopisza swoje delty, zgubia jedna z nich - a zgubionego wolumenu
 * nikt pozniej nie odrozni od prawdy.
 */
export const SCAN_LOCK_MS = 45_000;

export type BoardStatsMeta = {
  chainId: number;
  /** Launchpad, ktorego dotyczy ten agregat (male litery). */
  launchpad: string;
  /** Najwyzszy blok policzony w tym agregacie; pokrycie jest ciagle od bloku wdrozenia. */
  lastBlock: bigint;
  /**
   * Czy przy ostatnim zapisie `lastBlock` byl GLOWA lancucha.
   *
   * To nie jest ozdobnik, tylko warunek okna swiezosci. Bez tego pola
   * `updatedAt` mowi wylacznie "cos tu niedawno zapisano" - a podczas
   * nadrabiania zaleglosci to jest prawda przy kazdym zapisie, wiec kolejne
   * zadania odbijalyby sie od progu swiezosci i cache NIGDY by nie nadrobil.
   * Nadrabianie ma isc dalej mimo swiezego zapisu; hamowac wolno dopiero stan
   * dogoniony.
   */
  caughtUp: boolean;
  parts: number;
  updatedAt: number;
  scanLockUntil: number;
};

export type BoardStatsRecord = {
  meta: BoardStatsMeta;
  /**
   * Agregat w postaci, w ktorej zapisal go `serializeAggregate` - JAKO JSON.
   * Ten modul go NIE interpretuje: przechowanie i przeczytanie tego samego
   * ciagu znakow jest cala jego rola. Dzieki temu nie istnieje drugi format,
   * ktory moglby sie rozjechac z tym, co czyta `parseAggregate`.
   */
  payload: string;
};

type MetaDoc = Record<string, unknown>;

const toBigInt = (value: unknown, fallback: bigint): bigint => {
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return fallback;
};

function readMeta(chainId: number, launchpad: string, data: MetaDoc): BoardStatsMeta {
  return {
    chainId,
    launchpad: launchpad.toLowerCase(),
    lastBlock: toBigInt(data.lastBlock, 0n),
    caughtUp: data.caughtUp === true,
    parts: typeof data.parts === 'number' ? data.parts : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    scanLockUntil: typeof data.scanLockUntil === 'number' ? data.scanLockUntil : 0,
  };
}

export async function isBoardStatsAvailable(): Promise<boolean> {
  return (await getAdminDb()) !== null;
}

/**
 * Caly agregat: naglowek plus wszystkie kawalki. Null, gdy bazy nie ma albo ten
 * launchpad nigdy nie byl skanowany.
 *
 * NAGLOWEK BEZ KAWALKOW TO NIE JEST CACHE, TYLKO KLAMSTWO O NIM. Naglowek
 * niesie `lastBlock`, czyli obietnice "policzone od bloku wdrozenia do tego
 * bloku". Gdyby przy brakujacym kawalku oddac sam naglowek, wolajacy doliczylby
 * do NIEPELNEJ sumy delte od `lastBlock` w gore i zapisal ja jako pelna - a
 * dziury w sumie addytywnej nikt pozniej nie odrozni od prawdy.
 *
 * Kawalki czytamy `getAll` po ID - bez indeksu zlozonego i bez skanowania
 * kolekcji, wiec brak wpisu w `firestore.indexes.json` niczego tu nie psuje.
 */
export async function readBoardStats(chainId: number, launchpad: string): Promise<BoardStatsRecord | null> {
  const db = await getAdminDb();
  if (!db) return null;

  try {
    const docRef = db.collection(BOARD_STATS_COLLECTION).doc(boardStatsDocId(chainId, launchpad));
    const snapshot = await withDeadline(docRef.get(), DB_DEADLINE_MS, null);
    if (!snapshot || !snapshot.exists) return null;

    const meta = readMeta(chainId, launchpad, snapshot.data() as MetaDoc);
    if (meta.parts <= 0 || meta.parts > MAX_PARTS) return null;

    const refs = Array.from({ length: meta.parts }, (_, index) =>
      docRef.collection(PARTS_SUBCOLLECTION).doc(partId(index))
    );
    const docs = await withDeadline(db.getAll(...refs), DB_DEADLINE_MS, null);
    if (!docs) return null;

    /**
     * KAWALKI MUSZA POCHODZIC Z TEGO SAMEGO ZAPISU, CO NAGLOWEK.
     *
     * Naglowek i kawalki to DWA odczyty z osobna, a zapis jest jeden atomowy
     * `batch`. Miedzy nimi mieści sie cudzy commit: naglowek moze byc sprzed,
     * a kawalki juz po. Liczba kawalkow czesto sie przy tym nie zmienia, wiec
     * nic tego nie lapie - i wychodzi payload pokrywajacy WIECEJ blokow, niz
     * mowi jego `lastBlock`. Wolajacy dolicza wtedy delte od tego niższego
     * bloku i policzy czesc zdarzen drugi raz. Wolumen jest czysta suma, bez
     * klucza deduplikacji - takiego podwojenia juz nikt nie odkreci.
     *
     * Kazdy kawalek niesie wiec `lastBlock` swojego zapisu. Rozjazd znaczy
     * "zlapales sie w polowie zapisu" - czyli brak cache'u, a nie cache do
     * poskladania.
     */
    const stamp = meta.lastBlock.toString();
    const chunks: string[] = [];
    for (const part of docs) {
      if (!part.exists) return null;
      const data = part.data() as { text?: unknown; lastBlock?: unknown };
      if (typeof data.text !== 'string') return null;
      if (data.lastBlock !== stamp) return null;
      chunks.push(data.text);
    }

    return { meta, payload: joinPayload(chunks) };
  } catch {
    // Awaria bazy ma znaczyc "policz sam", a nie "nie ma wolumenu".
    return null;
  }
}

/**
 * Probuje przejac blokade skanu. `false` znaczy: ktos inny wlasnie skanuje ten
 * launchpad, nie powielaj roboty.
 *
 * Transakcja, a nie zwykly zapis - dwa rownolegle zadania musza zobaczyc
 * NAWZAJEM swoja probe, a nie kazde swoja.
 */
export async function claimScanLock(chainId: number, launchpad: string): Promise<boolean> {
  const db = await getAdminDb();
  if (!db) return false;

  const docRef = db.collection(BOARD_STATS_COLLECTION).doc(boardStatsDocId(chainId, launchpad));
  const now = Date.now();
  try {
    return await withDeadline(
      // `tx` bez typu z tej samej przyczyny, co w `historyStore`: Firestore
      // jest tu ladowany leniwie, wiec typ transakcji nie jest w zasiegu.
      db.runTransaction(async (tx: any) => {
        const snapshot = await tx.get(docRef);
        const until = snapshot.exists ? (snapshot.data() as MetaDoc).scanLockUntil : 0;
        if (typeof until === 'number' && until > now) return false;
        tx.set(
          docRef,
          { chainId, launchpad: launchpad.toLowerCase(), scanLockUntil: now + SCAN_LOCK_MS },
          { merge: true }
        );
        return true;
      }),
      DB_DEADLINE_MS,
      false
    );
  } catch {
    return false;
  }
}

/**
 * Zwalnia blokade, gdy skan NIC nie zapisal - `writeBoardStats` czysci ja sam,
 * w tym samym atomowym zapisie.
 *
 * `withDeadline` nie jest tu ozdobnikiem. To jedyne wywolanie tego modulu
 * stojace w `finally` trasy, czyli MIEDZY policzona odpowiedzia a jej wyslaniem.
 * Bez limitu, przy wyczerpanym limicie Firestore, SDK ponawia z rosnacym
 * odstepem (zmierzone: 120 s, potem 372 s - patrz `dbDeadline`), a zadanie,
 * ktore ma juz gotowa odpowiedz, umiera na limicie funkcji. Blokada i tak
 * wygasa sama po `SCAN_LOCK_MS`, wiec czekanie na to zwolnienie nie jest warte
 * ani jednej sekundy odpowiedzi.
 */
export async function releaseScanLock(chainId: number, launchpad: string): Promise<void> {
  const db = await getAdminDb();
  if (!db) return;
  try {
    await withDeadline(
      db
        .collection(BOARD_STATS_COLLECTION)
        .doc(boardStatsDocId(chainId, launchpad))
        .set({ scanLockUntil: 0 }, { merge: true }),
      DB_DEADLINE_MS,
      undefined
    );
  } catch {
    // Blokada wygasa sama po SCAN_LOCK_MS - nieudane zwolnienie kosztuje
    // najwyzej jedno pominiete odswiezenie.
  }
}

/**
 * Zapisuje agregat i blok, do ktorego jest policzony.
 *
 * `lastBlock` przesuwamy TYLKO w gore i tylko razem z trescia - inaczej
 * naglowek obiecywalby pokrycie, ktorego kawalki nie maja.
 *
 * Kawalki przepisujemy w komplecie, a nie roznicowo jak przy historii tokena.
 * Historia jest append-only, wiec raz zapelniony kawalek juz sie nie zmienia;
 * agregat jest SUMA - dopisanie jednej transakcji zmienia wolumen tokena,
 * ktory moze siedziec w dowolnym kawalku. Komplet to najwyzej kilka zapisow,
 * a roznicowosc tutaj bylaby zgadywaniem.
 */
export async function writeBoardStats(input: {
  chainId: number;
  launchpad: string;
  lastBlock: bigint;
  caughtUp: boolean;
  payload: string;
}): Promise<boolean> {
  const db = await getAdminDb();
  if (!db) return false;

  const chunks = splitPayload(input.payload);
  if (chunks.length > MAX_PARTS) {
    // Agregat tej wielkosci znaczy blad w ograniczeniach, nie realny ruch.
    // Zapis czesciowy bylby gorszy niz jego brak: naglowek obiecywalby
    // pokrycie, a tresc bylaby ucieta w losowym miejscu.
    return false;
  }

  const docRef = db.collection(BOARD_STATS_COLLECTION).doc(boardStatsDocId(input.chainId, input.launchpad));

  try {
    const previous = await withDeadline(docRef.get(), DB_DEADLINE_MS, null);
    const previousData = previous && previous.exists ? (previous.data() as MetaDoc) : null;
    const previousParts = previousData && typeof previousData.parts === 'number' ? previousData.parts : 0;
    const previousLastBlock = previousData ? toBigInt(previousData.lastBlock, 0n) : 0n;

    /**
     * `lastBlock` IDZIE TYLKO W GORE - i to jest tu sprawdzone, a nie tylko
     * opisane.
     *
     * Zapis, ktory cofa pokrycie, nie jest "starszym stanem" - jest STRATA.
     * Dokument opisuje pokrycie ciagle od bloku wdrozenia, wiec cofniecie
     * `lastBlock` z glowy lancucha do bloku o kilkaset tysiecy nizej kasuje z
     * sumy wolumen, ktory juz byl policzony, i kaze go policzyc od nowa
     * wszystkim urzadzeniom naraz.
     *
     * Zdarza sie to bez zadnej awarii: wystarczy, ze `getBlockNumber` trafi na
     * wezel odstajacy o kilka blokow. Wtedy skan nie moze wznowic (zapis siega
     * "nad glowe"), rusza od bloku wdrozenia i konczy sie na suficie okien -
     * czyli plytszym pokryciem niz to, ktore wlasnie nadpisuje.
     */
    const stamp = input.lastBlock.toString();
    if (previousData && input.lastBlock < previousLastBlock) return false;

    const batch = db.batch();
    chunks.forEach((text, index) => {
      // `lastBlock` w kazdym kawalku - patrz `readBoardStats`: to po nim
      // odczyt poznaje, ze naglowek i tresc pochodza z tego samego zapisu.
      batch.set(docRef.collection(PARTS_SUBCOLLECTION).doc(partId(index)), { text, lastBlock: stamp });
    });
    for (const id of stalePartIds(previousParts, chunks.length)) {
      batch.delete(docRef.collection(PARTS_SUBCOLLECTION).doc(id));
    }
    batch.set(
      docRef,
      {
        chainId: input.chainId,
        launchpad: input.launchpad.toLowerCase(),
        lastBlock: stamp,
        caughtUp: input.caughtUp,
        parts: chunks.length,
        updatedAt: Date.now(),
        // Blokade zwalniamy TYM SAMYM zapisem, co tresc - tak jak
        // `writeHistory`. Osobne wywolanie po commicie stalo w `finally` trasy
        // i opozniało gotowa juz odpowiedz o kolejna podroz do bazy.
        scanLockUntil: 0,
      },
      { merge: true }
    );

    await withDeadline(batch.commit(), DB_DEADLINE_MS, undefined);
    return true;
  } catch {
    // Nieudany zapis znaczy tylko tyle, ze nastepne wejscie zeskanuje ten sam
    // zakres jeszcze raz. Wynik skanu i tak wraca do wolajacego.
    return false;
  }
}
