import { cache } from 'react';
import { doc, getDoc, collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { getPublicDb as getDb } from '../publicFirestore';
import { toMillis } from '../firestoreTime';

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
  /**
   * Kwit transakcji. Dla postow z Solany to podpis base58 - trasa Blinka
   * (app/api/actions/tip) odczytuje z niego platnika oplaty, czyli adres
   * Solany autora. Bez tego nie ma komu wyslac napiwku: pole `author` niesie
   * adres EVM, ktory SOL-a nie przyjmie.
   */
  txHash?: string | null;
};

// cache() z Reacta deduplikuje odczyt W OBREBIE JEDNEGO zadania: trase /post/[id]
// wola generateMetadata, sam komponent strony i karta OG, a bez cache() kazde
// z nich placiloby za wlasny odczyt tego samego dokumentu.
export const getPostForShare = cache(async (postId: string): Promise<SharedPost | null> => {
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
      timestamp: toMillis(data.timestamp),
      image: data.image ?? null,
      likes: typeof data.likes === 'number' ? data.likes : 0,
      // Licznik z zapisu ma pierwszenstwo: nowe komentarze nie rosna juz
      // w tablicy dokumentu, wiec sama dlugosc tablicy klamie w dol.
      commentCount:
        typeof data.commentsCount === 'number'
          ? Math.max(0, data.commentsCount)
          : Array.isArray(data.comments) ? data.comments.length : 0,
      network: data.network ?? undefined,
      txHash: data.txHash ?? null,
    };
  } catch (error) {
    console.error('[getPostForShare] Nie udalo sie odczytac posta:', error);
    // RZUCAMY, nie zwracamy null.
    //
    // `null` znaczy tutaj "takiego posta nie ma" i strona zamienia go na
    // notFound(), czyli 404. Dla przegladarki to drobna roznica, dla crawlera
    // - oswiadczenie, ze zasob nie istnieje i mozna go usunac z indeksu.
    // Przejsciowa awaria Firestore kasowalaby w ten sposob udostepnione posty
    // z wyszukiwarek, a te strony istnieja WYLACZNIE po to, zeby dobrze
    // wygladac po wklejeniu linku.
    //
    // Blad daje 500 - a 500 znaczy "sprobuj pozniej", czyli prawde.
    throw error;
  }
});

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
        // Brak daty w sitemapie jest gorszy niz data przyblizona -
        // crawler dostalby wtedy 1970 i uznal wpis za archiwalny.
        timestamp: toMillis(data.timestamp) || Date.now(),
      };
    });
  } catch (error) {
    console.error('[getRecentPostRefs] Nie udalo sie pobrac listy postow:', error);
    // TUTAJ, inaczej niz w getPostForShare i getTipReceipt, pusta lista jest
    // wlasciwa. Sitemapa to PODPOWIEDZ, a nie spis powszechny: brak adresu
    // w sitemapie nie jest oswiadczeniem, ze ten adres nie istnieje, i nie
    // powoduje usuniecia go z indeksu. Za to rzucenie wyjatkiem wywrocilby
    // build (app/sitemap.ts jest generowany statycznie), czyli przejsciowa
    // czkawka Firestore blokowalaby KAZDY deploy. Sitemapa bez czesci postow
    // jest nieszkodliwa; zablokowany deploy nie jest.
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
// cache() z tego samego powodu co przy getPostForShare - strona i karta OG
// pytaja o te same sumy w ramach jednego zadania.
export const getPostTipTotals = cache(async (postId: string): Promise<Record<string, number>> => {
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
});

/** Skrocony adres do wyswietlenia, gdy post nie ma nazwy autora. */
export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address || 'unknown';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export type SharedComment = {
  id: string;
  author: string;
  authorName?: string;
  content: string;
  timestamp: number;
  txHash?: string | null;
  /** Platna odpowiedz z X - napiwek w lamportach (string, u64). */
  tipLamports?: string;
};

/**
 * Komentarze posta na udostepnialnej stronie /post/[id].
 *
 * Do 23.09.2026 ta strona pokazywala tylko liczbe komentarzy - a wlasnie tu
 * odsyla po zapisie platna odpowiedz z X ("See it under the post"). Czlowiek
 * placil, klikal i swojej odpowiedzi nie widzial (znalezisko z przegladu).
 *
 * To samo zapytanie co fetchCommentsForPost w feedzie (postId + timestamp
 * malejaco), wiec korzysta z istniejacego indeksu. Blad nie wywraca strony -
 * post jest wazniejszy niz jego komentarze.
 */
export const getPostCommentsForShare = cache(async (postId: string, max = 50): Promise<SharedComment[]> => {
  try {
    const snap = await getDocs(
      query(collection(getDb(), 'comments'), where('postId', '==', postId), orderBy('timestamp', 'desc'), limit(max))
    );
    return snap.docs
      // Odpowiedzi na komentarze (`replyTo`) pomijamy: lista jest plaska, wiec
      // "a to nieprawda" pod postem wygladaloby na odpowiedz autorowi posta,
      // a nie komentarzowi, ktoremu odpowiada. Feed pokazuje je w watku.
      .filter(d => !d.get('replyTo'))
      .map(d => {
        const data = d.data() as Record<string, any>;
        return {
          id: d.id,
          author: typeof data.author === 'string' ? data.author : '',
          authorName: typeof data.authorName === 'string' ? data.authorName : undefined,
          content: typeof data.content === 'string' ? data.content : '',
          timestamp: toMillis(data.timestamp),
          txHash: typeof data.txHash === 'string' ? data.txHash : null,
          // Tylko cyfry: dopoki reguly `comments` nie sa wdrozone, pole moze
          // wpisac przegladarka, a strona robi z niego liczbe ("NaN SOL").
          tipLamports:
            typeof data.tipLamports === 'string' && /^\d{1,20}$/.test(data.tipLamports) ? data.tipLamports : undefined,
        };
      })
      .filter(c => c.content)
      .reverse();
  } catch (error) {
    console.error('[getPostCommentsForShare] Nie udalo sie odczytac komentarzy:', error);
    return [];
  }
});
