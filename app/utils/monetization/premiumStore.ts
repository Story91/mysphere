import 'server-only';
import { getAdminDb } from '../auth/firebaseAdmin';
import { normalizeAddress } from './types';

/**
 * Magazyn tresci premium - kolekcja `premiumContent`.
 *
 * PO CO TO ISTNIEJE. Do tej pory `premiumContent` siedzialo w dokumencie posta.
 * Feed czyta posty bezposrednio z Firestore klienckim SDK, wiec kazdy, kto
 * zajrzal w odpowiedz sieciowa, widzial platna tresc bez placenia. Paywall byl
 * zaslona w UI, nie zabezpieczeniem - i bylo to opisane wprost w komentarzu
 * PremiumGate jako dziura do zamkniecia.
 *
 * ZAMKNIECIE: tresc mieszka w osobnej kolekcji, do ktorej klient nie ma dostepu
 * WCALE (`allow read, write: if false` w firestore.rules). Czyta ja i pisze
 * wylacznie serwer, klientem administracyjnym, ktory reguly omija. Dokument
 * posta niesie juz tylko `hasPremium`, `unlockPrice` i `unlockToken` - czyli
 * fakt istnienia platnej czesci i jej cene, nie sama tresc.
 *
 * ID DOKUMENTU = postId. Jeden post ma najwyzej jedna tresc premium, wiec
 * deterministyczne ID daje idempotencje zapisu i odczyt po kluczu.
 *
 * ZGODNOSC WSTECZ: posty sprzed tej zmiany maja tresc w polu `premiumContent`
 * dokumentu posta. Czytamy je nadal (patrz readPremiumContent) - ich tresc jest
 * juz publiczna i nic tego nie cofnie, ale odblokowanie ma dzialac tak samo.
 */

export const PREMIUM_CONTENT_COLLECTION = 'premiumContent';

export interface PremiumContentRecord {
  postId: string;
  /** Autor posta w lowercase - kto ma prawo nadpisac tresc. */
  author: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

/** Czy magazyn w ogole dziala. Bez konta uslugowego nie da sie nic zapisac. */
export function isPremiumStoreAvailable(): boolean {
  return getAdminDb() !== null;
}

/**
 * Zapisuje tresc premium. NIE sprawdza uprawnien - wolajacy musi wczesniej
 * potwierdzic, ze zapisujacy jest autorem posta.
 *
 * Zwraca false, gdy magazyn nie jest skonfigurowany. Wolajacy MA wtedy przerwac
 * i nie oznaczac posta jako platnego - inaczej powstalby post z cena i bez
 * tresci, czyli paywall nad pustka.
 */
export async function savePremiumContent(input: {
  postId: string;
  author: string;
  content: string;
}): Promise<boolean> {
  const db = getAdminDb();
  if (!db) return false;

  const now = Date.now();
  const ref = db.collection(PREMIUM_CONTENT_COLLECTION).doc(input.postId);

  try {
    const existing = await ref.get();
    const record: PremiumContentRecord = {
      postId: input.postId,
      author: normalizeAddress(input.author),
      content: input.content,
      createdAt: existing.exists ? (existing.data()?.createdAt ?? now) : now,
      updatedAt: now,
    };
    await ref.set(record);
    return true;
  } catch (error) {
    console.error('[premiumStore] Zapis tresci premium nie powiodl sie:', error);
    return false;
  }
}

/**
 * Odczytuje tresc premium. NIE sprawdza uprawnien - wolajacy musi wczesniej
 * potwierdzic, ze czytajacy odblokowal post albo jest jego autorem.
 *
 * `legacyInlineContent` to wartosc pola `premiumContent` z dokumentu posta,
 * jesli w ogole tam jest. Sluzy WYLACZNIE postom sprzed tej zmiany.
 */
export async function readPremiumContent(
  postId: string,
  legacyInlineContent?: unknown
): Promise<string | null> {
  const db = getAdminDb();

  if (db) {
    try {
      const snapshot = await db.collection(PREMIUM_CONTENT_COLLECTION).doc(postId).get();
      const content = snapshot.exists ? snapshot.data()?.content : null;
      if (typeof content === 'string' && content.trim() !== '') return content;
    } catch (error) {
      console.error('[premiumStore] Odczyt tresci premium nie powiodl sie:', error);
      // Nie przerywamy - ponizej jeszcze sciezka zgodnosci wstecz.
    }
  }

  if (typeof legacyInlineContent === 'string' && legacyInlineContent.trim() !== '') {
    return legacyInlineContent;
  }

  return null;
}

/** Kto moze nadpisac tresc premium tego posta. */
export async function getPremiumContentAuthor(postId: string): Promise<string | null> {
  const db = getAdminDb();
  if (!db) return null;

  try {
    const snapshot = await db.collection(PREMIUM_CONTENT_COLLECTION).doc(postId).get();
    const author = snapshot.exists ? snapshot.data()?.author : null;
    return typeof author === 'string' ? author : null;
  } catch (error) {
    console.error('[premiumStore] Odczyt autora tresci premium nie powiodl sie:', error);
    return null;
  }
}
