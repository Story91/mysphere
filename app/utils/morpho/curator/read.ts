import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { getPublicDb } from '../../publicFirestore';
import { parseChange, parseSnapshot } from './parse';
import {
  CURATOR_CHANGES_COLLECTION,
  CURATOR_CHANGES_PAGE_LIMIT,
  CURATOR_STATE_COLLECTION,
  CURATOR_STATE_DOC,
  type CuratorChange,
  type CuratorRecordResult,
} from './types';

/**
 * Odczyt rejestru dla strony /curators.
 *
 * Zwyklym klientem (`getPublicDb`), a nie kluczem administracyjnym: te dane sa
 * jawne z zalozenia, a reguly Firestore daja im `allow read: if true`. Klucz
 * administracyjny jest tu potrzebny wylacznie do ZAPISU (store.ts).
 *
 * === KOSZT NA ODWIEDZINY ===
 * 1 odczyt dokumentu stanu + tyle odczytow, ile jest wpisow (najwyzej
 * `CURATOR_CHANGES_PAGE_LIMIT`). Przy pustym rejestrze to JEDEN odczyt.
 * Strona rewaliduje sie co pare minut, wiec to nie mnozy sie przez odwiedziny.
 * Zliczania wpisow NIE MA - `getCountFromServer` na tym projekcie odmawia,
 * a strona i tak pokazuje tyle, ile pobrala.
 *
 * === DLACZEGO JEDEN WSPOLNY WYNIK, A NIE DWA OSOBNE ===
 * Pas Askow na feedzie rozdziela awarie dwoch list, bo tam da sie z jednej
 * wrocic do drugiej. Tutaj oba odczyty ida do TEJ SAMEJ bazy w tym samym
 * momencie - rozdzielenie ich dawaloby dwa komunikaty o jednej awarii.
 * Awaria ma tu wiec jedno wyjscie i strona mowi wprost, ze to nieudany odczyt,
 * a nie pusty rejestr.
 */
export async function getCuratorRecord(): Promise<CuratorRecordResult> {
  try {
    const db = getPublicDb();

    const stateDoc = await getDoc(doc(db, CURATOR_STATE_COLLECTION, CURATOR_STATE_DOC));
    const snapshot = stateDoc.exists() ? parseSnapshot(stateDoc.data()) : null;

    const changesSnap = await getDocs(
      query(
        collection(db, CURATOR_CHANGES_COLLECTION),
        orderBy('observedAt', 'desc'),
        limit(CURATOR_CHANGES_PAGE_LIMIT)
      )
    );

    // Pojedynczy zepsuty dokument wypada, reszta zostaje - ta sama zasada co
    // przy liscie skarbcow. Rejestr z jedna pozycja mniej jest uzyteczny,
    // rejestr wywrocony przez jeden zly wiersz nie jest.
    const changes = changesSnap.docs
      .map((entry) => parseChange(entry.id, entry.data()))
      .filter((change): change is CuratorChange => change !== null);

    return {
      ok: true,
      record: {
        watch: snapshot
          ? {
              firstObservedAt: snapshot.firstObservedAt,
              observedAt: snapshot.observedAt,
              checkCount: snapshot.checkCount,
              vaultCount: snapshot.entries.length,
            }
          : null,
        changes,
      },
    };
  } catch (error) {
    console.error('[curator] Nie udalo sie odczytac rejestru:', error);
    return { ok: false, reason: 'unavailable' };
  }
}
