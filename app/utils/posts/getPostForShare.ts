import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

/** Skrocony adres do wyswietlenia, gdy post nie ma nazwy autora. */
export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address || 'unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
