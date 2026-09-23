import 'server-only';
import {
  listingEntry,
  shareFromView,
  uncheckedListingEntry,
  type AskShare,
  type ListedAsk,
} from '../../utils/asks/askPublicView';
import { isDocId } from '../../utils/asks/askSealCore';
import type { AsksResult } from '../../utils/asks/asks';
import {
  ASKS_COLLECTION,
  askBundleFromSnapshots,
  openAskStore,
  readAcceptances,
  readAskBundle,
  stateRef,
  type AskStore,
} from './askStore';

/**
 * Odczyty magazynu Askow dla PUBLICZNYCH wyswietlen: strona /ask/[id]
 * (przez app/utils/asks/getAskForShare.ts) i lista GET /api/asks.
 *
 * Osobny plik z 'server-only', bo strona jest komponentem serwerowym, a admin
 * SDK nie moze trafic do zadnego pakietu klienckiego - import tego pliku
 * z komponentu klienckiego wywroci build, zamiast po cichu wyslac kod
 * z kontem uslugowym do przegladarki.
 *
 * NIC TU NIE ZAPISUJE. Brak magazynu albo awaria odczytu to nie "Ask nie
 * istnieje" - wolajacy dostaje 'unavailable' / checked:false i mowi
 * neutralnie (plan, krok 12).
 */

/** openAskStore bez wyjatkow - strona udostepniania nie moze pasc na braku konfiguracji. */
async function openStoreQuietly(): Promise<AskStore | null> {
  try {
    return await openAskStore();
  } catch (error) {
    console.error('[asks/askPublicRead] Magazyn Askow niedostepny:', error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  STRONA UDOSTEPNIANIA                                               */
/* ------------------------------------------------------------------ */

export type AskShareRead =
  | { kind: 'ok'; share: AskShare }
  /** Nie ma publicznego dokumentu (albo id nie jest identyfikatorem dokumentu). */
  | { kind: 'missing' }
  /** Magazyn niedostepny albo odczyt padl - wolajacy czyta sam dokument. */
  | { kind: 'unavailable' };

export async function readAskShare(askId: string): Promise<AskShareRead> {
  if (!isDocId(askId)) return { kind: 'missing' };
  const store = await openStoreQuietly();
  if (!store) return { kind: 'unavailable' };
  return readAskShareWith(store, askId);
}

/** Jak readAskShare, ale z podanym magazynem (test/asksPublicView.test.ts). */
export async function readAskShareWith(store: AskStore, askId: string): Promise<AskShareRead> {
  try {
    const bundle = await readAskBundle(store, askId);
    // Sam stan bez dokumentu (dokument skasowany skryptem sprzatajacym) nie
    // ma pytania do pokazania - to jest 404, nie pusta karta.
    if (!bundle.pub || !bundle.view) return { kind: 'missing' };
    if (bundle.view.trust !== 'sealed') return { kind: 'ok', share: shareFromView(bundle.view) };
    // Zapieczetowany Ask: zajete miejsca z rekordow przyjec, nie z licznika
    // w lustrze. Maks. 20 dokumentow, a strona i tak ma revalidate 60.
    const records = await readAcceptances(store, askId);
    return {
      kind: 'ok',
      share: shareFromView(bundle.view, { valid: records.valid.size, invalid: records.invalid.length }),
    };
  } catch (error) {
    console.error(`[asks/askPublicRead] Odczyt Aska ${askId} dla strony udostepniania nie powiodl sie:`, error);
    return { kind: 'unavailable' };
  }
}

/* ------------------------------------------------------------------ */
/*  LISTA DLA AGENTOW                                                  */
/* ------------------------------------------------------------------ */

export type OpenAsksListing =
  | { ok: true; checked: boolean; asks: ListedAsk[] }
  /** Zadne zrodlo listy nie odpowiedzialo - trasa odpowiada 503, nie pusta lista. */
  | { ok: false };

/**
 * Otwarte Aski do GET /api/asks, sprawdzone z pieczeciami.
 *
 * Z magazynem: zapytanie admin (status == 'open', najnowsze pierwsze - ten sam
 * indeks co kliencki getOpenAsks) i stany jednym getAll. Pobieramy z zapasem,
 * bo czesc pozycji odpada (listingEntry), i przycinamy do `limit`.
 *
 * Bez magazynu albo po awarii odczytu: `fallback` (kliencki getOpenAsks
 * z trasy - tutaj go nie importujemy, zeby strona udostepniania, ktora tez
 * ciagnie ten plik, nie wciagala klienckiego SDK) i pozycje 'unchecked'.
 */
export async function listOpenAsks(
  limit: number,
  fallback: (limit: number) => Promise<AsksResult>
): Promise<OpenAsksListing> {
  const store = await openStoreQuietly();
  if (store) {
    try {
      const fetchCount = Math.min(limit * 2, limit + 10);
      const asks = await listOpenAsksWith(store, fetchCount);
      return { ok: true, checked: true, asks: asks.slice(0, limit) };
    } catch (error) {
      console.error('[asks/askPublicRead] Sprawdzona lista Askow nie powiodla sie, lista bez pieczeci:', error);
    }
  }

  const { asks, failed } = await fallback(limit);
  if (failed) return { ok: false };
  return { ok: true, checked: false, asks: asks.slice(0, limit).map(uncheckedListingEntry) };
}

/** Jak listOpenAsks z magazynem, bez przyciecia (test/asksPublicView.test.ts). */
export async function listOpenAsksWith(store: AskStore, fetchCount: number): Promise<ListedAsk[]> {
  const snapshot = await store.db
    .collection(ASKS_COLLECTION)
    .where('status', '==', 'open')
    .orderBy('createdAt', 'desc')
    .limit(fetchCount)
    .get();

  // Id spoza isDocId powstaja tylko z zapisu z przegladarki i sa dla tras
  // nieosiagalne (400) - na liscie nie maja czego szukac.
  const docs = snapshot.docs.filter((doc) => isDocId(doc.id));
  if (docs.length === 0) return [];

  const states = await store.db.getAll(...docs.map((doc) => stateRef(store, doc.id)));
  const listed: ListedAsk[] = [];
  docs.forEach((doc, index) => {
    const bundle = askBundleFromSnapshots(store, doc.id, doc, states[index]);
    if (!bundle.pub || !bundle.view) return;
    const entry = listingEntry(bundle.view);
    if (entry) listed.push(entry);
  });
  return listed;
}
