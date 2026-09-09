import 'server-only';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';
import { DB_DEADLINE_MS, withDeadline } from './dbDeadline';
import {
  indexDocId,
  mergeIndex,
  TOKEN_INDEX_COLLECTION,
  type IndexedToken,
} from './tokenIndexShape';

/**
 * INDEKS TOKENOW W FIRESTORE - jeden dokument na siec.
 *
 * Uzasadnienie i jedyna wlasnosc, na ktorej to stoi ("raz zapisany token nie
 * moze wypasc z listy"), sa przy `tokenIndexShape`. Tutaj jest wylacznie
 * dojscie do bazy.
 *
 * Dokument jest MALY z natury: piec startow to piec wpisow po ~150 bajtow.
 * Nawet tysiac tokenow zmiesci sie w suficie 1 MB, wiec nie tniemy go na
 * kawalki jak historii transakcji.
 */

export type TokenIndex = {
  chainId: number;
  tokens: IndexedToken[];
  /** Do ktorego bloku zeskanowano zdarzenia `Launched`, liczac W GORE. */
  lastBlock: bigint;
  /** Dokad siega to samo pokrycie W DOL - dno backfillu. Patrz `tokenIndexShape`. */
  scannedDownTo: bigint;
  /** Backfill dosiegnal bloku wdrozenia launchpada; nizej logow nie ma. */
  complete: boolean;
  updatedAt: number;
};

/**
 * Blokada na czas skanu. Do 9 wrzesnia 2026 jej tu nie bylo i nie musialo:
 * zapelnienie indeksu bylo jednym zadaniem albo nie bylo go wcale. Backfill
 * porcjami zmienia rachunek - dopoki jest niedomkniety, KAZDE wejscie ma prawo
 * skanowac, wiec czterech ogladajacych naraz to cztery serie `getLogs` do tego
 * samego endpointu. Na publicznym RPC z limitem tempa (Arc) konczy sie to tak,
 * ze zadna z nich nie przechodzi i nikt nie posuwa indeksu ani o blok.
 *
 * Wartosc to sufit realnego zadania (`maxDuration` trasy), nie jego oczekiwany
 * czas: wygasla blokada MUSI odblokowac sie sama, bo ubity proces nie
 * posprzata po sobie.
 */
export const INDEX_SCAN_LOCK_MS = 30_000;

export async function isTokenIndexAvailable(): Promise<boolean> {
  return (await getAdminDb()) !== null;
}

/** Prawda, gdy to zadanie ma prawo skanowac. Falsz - ktos inny wlasnie to robi. */
export async function claimIndexScanLock(chainId: number): Promise<boolean> {
  const db = await getAdminDb();
  if (!db) return false;

  const docRef = db.collection(TOKEN_INDEX_COLLECTION).doc(indexDocId(chainId));
  const now = Date.now();
  try {
    return await withDeadline(
      // `tx` bez typu z tej samej przyczyny, co w `historyStore`: Firestore
      // jest ladowany leniwie, wiec typ transakcji nie jest w zasiegu.
      db.runTransaction(async (tx: any) => {
        const snapshot = await tx.get(docRef);
        const until = snapshot.exists ? (snapshot.data() as { scanLockUntil?: unknown }).scanLockUntil : 0;
        if (typeof until === 'number' && until > now) return false;
        tx.set(docRef, { chainId, scanLockUntil: now + INDEX_SCAN_LOCK_MS }, { merge: true });
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
 * Zwalnia blokade, gdy skan NIC nie zapisal - udany zapis czysci ja sam, w tym
 * samym atomowym `set`. `withDeadline`, bo to wywolanie stoi miedzy policzona
 * odpowiedzia a jej wyslaniem, a blokada i tak wygasa sama.
 */
export async function releaseIndexScanLock(chainId: number): Promise<void> {
  const db = await getAdminDb();
  if (!db) return;
  try {
    await withDeadline(
      db.collection(TOKEN_INDEX_COLLECTION).doc(indexDocId(chainId)).set({ scanLockUntil: 0 }, { merge: true }),
      DB_DEADLINE_MS,
      undefined
    );
  } catch {
    // Nic do zrobienia - blokada wygasnie po `INDEX_SCAN_LOCK_MS`.
  }
}

export async function readTokenIndex(chainId: number): Promise<TokenIndex | null> {
  const db = await getAdminDb();
  if (!db) return null;

  try {
    const snapshot = await withDeadline(
      db.collection(TOKEN_INDEX_COLLECTION).doc(indexDocId(chainId)).get(),
      DB_DEADLINE_MS,
      null
    );
    if (!snapshot || !snapshot.exists) return null;
    const data = snapshot.data() as {
      tokens?: unknown;
      lastBlock?: unknown;
      scannedDownTo?: unknown;
      complete?: unknown;
      updatedAt?: unknown;
    };

    const lastBlock =
      typeof data.lastBlock === 'string' && /^\d+$/.test(data.lastBlock) ? BigInt(data.lastBlock) : 0n;

    /**
     * ZAPIS SPRZED DWOCH ZNACZNIKOW NIE MOZE UCHODZIC ZA KOMPLETNY.
     *
     * Dokument bez `scannedDownTo` powstal w wersji, ktora przesuwala
     * `lastBlock` dopiero po objeciu calego zakresu - wiec teoretycznie znaczyl
     * pelne pokrycie od bloku wdrozenia. Teoretycznie, bo tego juz nie
     * sprawdzimy: zapis nie niesie dna, a zmiana adresu launchpada albo bloku
     * wdrozenia w konfiguracji przesunelaby je i tak. Czytamy wiec
     * NAJOSTROZNIEJ z mozliwych: pokrycie to jeden blok `lastBlock`, backfill
     * niedomkniety. Kosztuje to jedno dociagniecie przy najblizszym wejsciu
     * (na Base miesci sie w jednym zadaniu), a `mergeIndex` i tak niczego nie
     * gubi - w zamian nikt nie oglada listy, ktora CICHO klamie o komplecie.
     */
    const hasFloor = typeof data.scannedDownTo === 'string' && /^\d+$/.test(data.scannedDownTo);
    const floor = hasFloor ? BigInt(data.scannedDownTo as string) : lastBlock;

    return {
      chainId,
      tokens: Array.isArray(data.tokens) ? (data.tokens as IndexedToken[]) : [],
      lastBlock,
      // Dno ponad gora to zapis bez sensu (recznie tkniety dokument) - wtedy
      // pokrycie ma miec zero szerokosci, a nie ujemna.
      scannedDownTo: floor > lastBlock ? lastBlock : floor,
      complete: hasFloor && data.complete === true,
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    };
  } catch {
    // Awaria bazy ma znaczyc "zeskanuj sam", a nie "nie ma tokenow".
    return null;
  }
}

/**
 * Dokleja to, co zobaczyl skan, i przesuwa OBA znaczniki pokrycia.
 *
 * Znaczniki ida tylko na ZEWNATRZ: `lastBlock` w gore, `scannedDownTo` w dol.
 * Skan moze przyjsc z zakresu, ktory juz mamy (po awarii, z drugiej karty, z
 * dwoch zadan naraz) i zwezenie pokrycia kazaloby kolejnym wejsciom robic te
 * sama robote jeszcze raz. Suma dwoch zakresow, z ktorych kazdy przylega do
 * zapisanego, jest ciagla - wiec branie skrajnych koncow jest tu bezpieczne.
 *
 * `complete` raz podniesiony zostaje: ponizej bloku wdrozenia logow tego
 * launchpada nie ma i zaden pozniejszy skan tego nie zmieni.
 *
 * `resetCoverage` sluzy jedynemu przypadkowi, w ktorym zapisane znaczniki nie
 * opisuja NICZEGO: gdy `lastBlock` lezy ponizej bloku wdrozenia, czyli dokument
 * zostal po INNYM launchpadzie (adresy w konfiguracji maja fallbacki i zmieniaja
 * sie przy kolejnych wdrozeniach). Bez tego stare dno wygrywalo kazde minimum i
 * planer uznawal ogon za objety, chociaz nikt go nie zeskanowal - tak wlasnie
 * Arc siedzial z pusta tablica, majac starty tuz nad blokiem wdrozenia.
 * Tozsamosci zostaja, bo `mergeIndex` niczego nie usuwa.
 */
export async function writeTokenIndex(input: {
  chainId: number;
  scanned: IndexedToken[];
  lastBlock: bigint;
  scannedDownTo: bigint;
  complete: boolean;
  resetCoverage?: boolean;
}): Promise<IndexedToken[]> {
  const current = await readTokenIndex(input.chainId);
  const tokens = mergeIndex(current?.tokens ?? [], input.scanned);

  const db = await getAdminDb();
  if (!db) return tokens;

  const prior = input.resetCoverage ? null : current;
  const lastBlock = prior && prior.lastBlock > input.lastBlock ? prior.lastBlock : input.lastBlock;
  // Zapisane dno bierzemy pod uwage TYLKO wtedy, gdy opisuje realne pokrycie.
  // Przy pustym indeksie (`lastBlock` zero) dno jest takze zerem i minimum z
  // niego obiecywaloby pokrycie od bloku zerowego.
  const storedFloor = prior && prior.lastBlock > 0n ? prior.scannedDownTo : null;
  const scannedDownTo = storedFloor !== null && storedFloor < input.scannedDownTo ? storedFloor : input.scannedDownTo;
  const complete = (prior?.complete ?? false) || input.complete;

  try {
    await withDeadline(db.collection(TOKEN_INDEX_COLLECTION).doc(indexDocId(input.chainId)).set(
      {
        chainId: input.chainId,
        tokens,
        lastBlock: lastBlock.toString(),
        scannedDownTo: scannedDownTo.toString(),
        complete,
        updatedAt: Date.now(),
        // Blokada schodzi w TYM SAMYM zapisie, co postep - inaczej miedzy
        // zapisem a osobnym zwolnieniem jest okno, w ktorym nastepne wejscie
        // odbija sie od blokady po skanie, ktory juz sie skonczyl.
        scanLockUntil: 0,
      },
      { merge: true }
    ), DB_DEADLINE_MS, undefined);
  } catch {
    // Nieudany zapis znaczy tylko tyle, ze nastepne wejscie zeskanuje ten sam
    // zakres jeszcze raz. Lista, ktora wlasnie zlozylismy, i tak wraca do
    // wolajacego.
  }

  return tokens;
}
