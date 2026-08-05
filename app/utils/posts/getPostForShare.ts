import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';

/**
 * Odczyt pojedynczego posta PO STRONIE SERWERA, na potrzeby udostepnialnej
 * trasy /post/[id] i generowanej dla niej karty OG.
 *
 * Czemu osobny plik, a nie app/utils/firebase.ts: tamten modul ma 5800 linii,
 * ciagnie firebase/auth, localStorage i sporo logiki klienckiej. Tutaj potrzeba
 * jednego odczytu, wiec bierzemy minimalny zestaw.
 *
 * To odczyt danych publicznych - post jest widoczny w feedzie dla kazdego.
 */

export type SharedPost = {
  id: string;
  author: string;
  authorName?: string;
  content: string;
  timestamp: number;
  image?: string | null;
  likes: number;
  commentCount: number;
  network?: string;
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Reuzywa aplikacji Firebase, jesli juz istnieje w tym procesie. */
function getDb() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return getFirestore(app);
}

export async function getPostForShare(postId: string): Promise<SharedPost | null> {
  if (!postId) return null;

  try {
    const snapshot = await getDoc(doc(getDb(), 'posts', postId));
    if (!snapshot.exists()) return null;

    const data = snapshot.data() as Record<string, any>;

    return {
      id: snapshot.id,
      author: data.author ?? '',
      authorName: data.authorName ?? undefined,
      content: typeof data.content === 'string' ? data.content : '',
      timestamp: typeof data.timestamp === 'number' ? data.timestamp : 0,
      image: data.image ?? null,
      likes: typeof data.likes === 'number' ? data.likes : 0,
      commentCount: Array.isArray(data.comments) ? data.comments.length : 0,
      network: data.network ?? undefined,
    };
  } catch (error) {
    console.error('[getPostForShare] Nie udalo sie odczytac posta:', error);
    return null;
  }
}

/**
 * Identyfikatory ostatnich postow do sitemapy.
 *
 * Ograniczone celowo: sitemapa ma prowadzic crawlera do swiezej tresci, a nie
 * odtwarzac calego feedu. Przy bledzie odczytu zwracamy pusta liste - sitemapa
 * ze statycznymi trasami jest lepsza niz build wywalony na Firestore.
 */
export async function getRecentPostRefs(
  max = 500
): Promise<{ id: string; timestamp: number }[]> {
  try {
    const snapshot = await getDocs(
      query(collection(getDb(), 'posts'), orderBy('timestamp', 'desc'), limit(max))
    );

    return snapshot.docs.map((entry) => {
      const data = entry.data() as Record<string, any>;
      return {
        id: entry.id,
        timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
      };
    });
  } catch (error) {
    console.error('[getRecentPostRefs] Nie udalo sie pobrac listy postow:', error);
    return [];
  }
}

/**
 * Suma tipow na poscie, per token.
 *
 * PO CO NA KARCIE OG: podglad linku pokazujacy ZYWY STAN jest w 2026 glowna
 * mechanika rozchodzenia sie linkow w krypto - to on napedzil wzrost rynkow
 * predykcyjnych, nie tresc pod nim. Post z widoczna kwota jest obiektem, ktory
 * ktos wysle dalej; post z samym tekstem nie jest.
 *
 * Sumujemy WYLACZNIE w obrebie tokena - dodanie ETH do USDC dalo by liczbe bez
 * znaczenia. Blad odczytu zwraca pusty obiekt: karta ma sie wygenerowac zawsze,
 * bo brak podgladu boli bardziej niz brak jednej liczby.
 */
export async function getPostTipTotals(postId: string): Promise<Record<string, number>> {
  if (!postId) return {};

  try {
    const snapshot = await getDocs(
      query(collection(getDb(), 'tips'), where('postId', '==', postId), limit(500))
    );

    const totals: Record<string, number> = {};
    for (const entry of snapshot.docs) {
      const data = entry.data() as Record<string, any>;
      const amount = Number.parseFloat(String(data.amount ?? '0'));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const token = typeof data.token === 'string' ? data.token : 'ETH';
      totals[token] = (totals[token] ?? 0) + amount;
    }
    return totals;
  } catch (error) {
    console.error('[getPostTipTotals] Nie udalo sie policzyc tipow:', error);
    return {};
  }
}

/** Skrocony adres do wyswietlenia, gdy post nie ma nazwy autora. */
export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address || 'unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
