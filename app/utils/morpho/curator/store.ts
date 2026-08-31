import 'server-only';
import { getAdminDb } from '../../auth/firebaseAdmin';
import { parseSnapshot } from './parse';
import {
  CURATOR_CHANGES_COLLECTION,
  CURATOR_STATE_COLLECTION,
  CURATOR_STATE_DOC,
  type CuratorChange,
  type CuratorSnapshot,
} from './types';

/**
 * Zapis migawek i zmian. WYLACZNIE serwer, WYLACZNIE kluczem administracyjnym.
 *
 * ===========================================================================
 * DLACZEGO admin SDK, A NIE ZWYKLY KLIENT
 * ===========================================================================
 * Reguly Firestore dla tych dwoch kolekcji brzmia `allow read: if true` i
 * `allow write: if false` (firestore.rules). Publiczny rejestr, do ktorego
 * kazdy z konsoli przegladarki moze dopisac "Gauntlet podniosl prowizje na
 * 90%", nie jest rejestrem - jest tablica ogloszen. Ten sam blad kosztowal juz
 * kolekcje `tips`, gdzie przez pol roku kazdy mogl przepisac cudzy napiwek.
 *
 * Admin SDK omija reguly z definicji, wiec zapis moze isc TYLKO stad, a stad
 * moze go wywolac tylko trasa z sekretem.
 *
 * ===========================================================================
 * KOSZT - POLICZONY, BO LIMIT JEST NISKI
 * ===========================================================================
 * Projekt ma 50 000 odczytow i 20 000 ZAPISOW dziennie. Jedno uruchomienie:
 *   1 ODCZYT   - dokument stanu (jeden, nie 24: cala migawka siedzi w jednym
 *                dokumencie jako tablica ~24 pozycji, czyli okolo 5 kB)
 *   1 ZAPIS    - nadpisanie tego dokumentu
 *   0..N ZAPISOW - po jednym na wykryta zmiane; w typowej dobie N = 0
 * Raz na dobe daje wiec 1 odczyt i 1-2 zapisy dziennie. Dzien, w ktorym
 * zmieni sie WSZYSTKO w kazdym z 24 skarbcow, to 24 zmiany prowizji + 24
 * zmiany kuratora + 1 stan = 49 zapisow. Czyli 0,25% dziennego limitu
 * w najgorszym mozliwym przypadku.
 *
 * `runTransaction` i `getCountFromServer` na tym projekcie ODMAWIAJA, wiec nie
 * ma ich tu ani jednego. Liczba wpisow nigdzie nie jest zliczana zapytaniem -
 * strona bierze tyle dokumentow, ile pokazuje.
 */

/** Wynik odczytu stanu. `snapshot: null` to "jeszcze nigdy nie patrzylismy". */
export type SnapshotReadResult =
  | { ok: true; snapshot: CuratorSnapshot | null }
  | { ok: false; reason: 'not-configured' | 'unavailable' | 'malformed' };

export type WriteResult = { ok: true } | { ok: false; reason: 'not-configured' | 'unavailable' };

/**
 * Ostatnia migawka.
 *
 * === TRZY WYNIKI, KTORE MUSZA BYC ROZLACZNE ===
 *   snapshot === null      - dokumentu nie ma. Pierwsze uruchomienie w zyciu.
 *   reason 'unavailable'   - nie udalo sie odczytac. NIE WIEMY, czy dokument
 *                            istnieje.
 *   reason 'malformed'     - dokument jest, ale nie da sie go uznac za migawke.
 *
 * Roznica miedzy pierwszym a drugim decyduje o tym, czy wolno cokolwiek
 * zapisac. Potraktowanie awarii odczytu jak braku dokumentu nadpisaloby stan
 * BEZ POROWNANIA - i zmiana, ktora akurat tego dnia zaszla, przepadlaby na
 * zawsze, bo nastepnego dnia porownywalibysmy sie juz do stanu PO zmianie.
 * To jest najgrozniejszy mozliwy blad w tym module: cicha utrata zdarzenia.
 */
export async function readSnapshot(): Promise<SnapshotReadResult> {
  const db = await getAdminDb();
  if (!db) return { ok: false, reason: 'not-configured' };

  try {
    const doc = await db.collection(CURATOR_STATE_COLLECTION).doc(CURATOR_STATE_DOC).get();
    if (!doc.exists) return { ok: true, snapshot: null };

    const snapshot = parseSnapshot(doc.data());
    if (!snapshot) return { ok: false, reason: 'malformed' };

    return { ok: true, snapshot };
  } catch (error) {
    console.error('[curator] Nie udalo sie odczytac migawki:', error);
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Wpisy o zmianach. Identyfikator jest deterministyczny (patrz `diff.ts`), wiec
 * `set` bez scalania jest IDEMPOTENTNY: powtorzone uruchomienie tego samego dnia
 * nadpisuje ten sam dokument zamiast dokladac drugi opis tego samego zdarzenia.
 *
 * Zapisujemy je PRZED nadpisaniem stanu i to jest jedyna poprawna kolejnosc.
 * Gdyby stan poszedl pierwszy i zapis wpisow padl, nastepne porownanie
 * odbywaloby sie juz wzgledem NOWYCH wartosci - zdarzenie zniknieloby bez sladu.
 * Przy tej kolejnosci awaria po drodze konczy sie najwyzej powtorzeniem: wpisy
 * sa, stan zostal stary, jutro to samo porownanie wyjdzie drugi raz i trafi
 * pod ten sam identyfikator.
 *
 * Zapisy ida PO KOLEI, bez `batch`: jest ich zero albo kilka, wiec nie ma czego
 * optymalizowac, a pojedynczy `set` ma prostsze zachowanie przy bledzie.
 */
export async function writeChanges(changes: CuratorChange[]): Promise<WriteResult> {
  if (changes.length === 0) return { ok: true };

  const db = await getAdminDb();
  if (!db) return { ok: false, reason: 'not-configured' };

  try {
    const collection = db.collection(CURATOR_CHANGES_COLLECTION);
    for (const change of changes) {
      const { id, ...payload } = change;
      await collection.doc(id).set(payload);
    }
    return { ok: true };
  } catch (error) {
    console.error('[curator] Nie udalo sie zapisac zmian:', error);
    return { ok: false, reason: 'unavailable' };
  }
}

/** Nadpisanie stanu. Jeden dokument, jeden zapis, zadnej historii migawek. */
export async function writeSnapshot(snapshot: CuratorSnapshot): Promise<WriteResult> {
  const db = await getAdminDb();
  if (!db) return { ok: false, reason: 'not-configured' };

  try {
    await db.collection(CURATOR_STATE_COLLECTION).doc(CURATOR_STATE_DOC).set(snapshot);
    return { ok: true };
  } catch (error) {
    console.error('[curator] Nie udalo sie zapisac migawki:', error);
    return { ok: false, reason: 'unavailable' };
  }
}
