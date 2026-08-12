import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getAddress, isAddress } from 'viem';
import { getPublicDb as getDb } from '../publicFirestore';
import { toMillis } from '../firestoreTime';
import { addressReadVariants } from '../monetization/types';

/**
 * Odczyt publicznego profilu PO STRONIE SERWERA, na potrzeby trasy /u/[address].
 *
 * PO CO: do tej pory tozsamosc istniala wylacznie wewnatrz feedu. Nie bylo
 * niczego, co mozna wkleic w odpowiedzi na pytanie "kim jestes" - a to jest
 * najtansza dystrybucja, jaka ten produkt moze miec. Profil to jednoczesnie
 * wizytowka dla czlowieka i rekord do odczytu maszynowego.
 *
 * Czemu wlasny, minimalny klient Firestore, a nie app/utils/firebase.ts:
 * tamten modul ma ~5800 linii, ciagnie firebase/auth, localStorage i logike
 * kliencka. Ten sam powod, dla ktorego osobno stoi getPostForShare.ts.
 *
 * WIELKOSC LITER W ADRESACH: kolekcje historycznie zapisuja adres tak, jak
 * podal go portfel - raz w checksumie, raz malymi literami. Kazde zapytanie
 * odpytuje wiec OBA warianty. Bez tego polowa profili wyszlaby pusta.
 */

export type ProfilePost = {
  id: string;
  content: string;
  timestamp: number;
  likes: number;
  commentCount: number;
  network?: string;
};

export type Profile = {
  /** Adres w checksumie - kanoniczna forma do wyswietlania i linkowania. */
  address: string;
  /** Nazwa zapisana w profilu (nie Basename - ten rozwiazujemy osobno). */
  storedName?: string;
  avatar?: string;
  bio?: string;
  joinedAt?: number;
  postCount: number;
  likesReceived: number;
  tips: {
    receivedCount: number;
    sentCount: number;
    /** Sumy per token - kwoty w roznych tokenach nie sa dodawalne. */
    received: Record<string, number>;
  };
  /**
   * `true` = przynajmniej jeden odczyt sie wywrocil, wiec liczby ponizej sa
   * NIEPELNE. Strona ma wtedy powiedziec, ze czegos nie udalo sie wczytac,
   * zamiast twierdzic "Nothing posted yet" o czlowieku, ktory mogl napisac
   * dwiescie postow. Puste liczby to twierdzenie o swiecie i nie wolno go
   * stawiac w momencie, w ktorym wlasnie nie udalo sie go sprawdzic.
   */
  partial: boolean;
  recentPosts: ProfilePost[];
};

// Warianty pisowni adresu maja w repo JEDNA implementacje - patrz
// `addressReadVariants` w app/utils/monetization/types.ts.

/** Ile ostatnich postow pokazujemy na profilu. */
const RECENT_POSTS = 12;

export async function getProfile(rawAddress: string): Promise<Profile | null> {
  if (!rawAddress || !isAddress(rawAddress)) return null;

  const address = getAddress(rawAddress as `0x${string}`);
  const variants = addressReadVariants(address);
  const db = getDb();

  // Kazdy odczyt jest niezalezny - profil ma sie wyswietlic nawet wtedy, gdy
  // jedno zapytanie zawiedzie (np. brak indeksu na jakiejs kolekcji).
  //
  // `failed` liczy odczyty, ktore SIE WYWROCILY - w odroznieniu od tych, ktore
  // po prostu nic nie znalazly. Bez tego rozroznienia awaria Firestore dawala
  // ten sam wynik co nieistniejacy adres, a to konczylo sie realna szkoda:
  // patrz `hasAnyTrace` na dole tej funkcji.
  let failed = 0;
  const onFail = (label: string) => (error: unknown) => {
    failed++;
    console.error(`[getProfile] Odczyt (${label}) nie powiodl sie:`, error);
    return null;
  };

  const [userDoc, postsSnapshot, receivedSnapshot, sentSnapshot] = await Promise.all([
    Promise.all(
      variants.map((variant) => getDoc(doc(db, 'users', variant)).catch(onFail('users')))
    ).then((docs) => docs.find((entry) => entry?.exists()) ?? null),

    getDocs(
      query(
        collection(db, 'posts'),
        where('author', 'in', variants),
        orderBy('timestamp', 'desc'),
        limit(200)
      )
    ).catch(onFail('posts')),

    // limit(500) na obu zapytaniach o tipy: sumy i liczniki powstaja z co
    // najwyzej 500 wpisow, nie z calej historii - bez limitu profil bardzo
    // aktywnego adresu czytalby tysiace dokumentow przy kazdym wejsciu.
    // `orderBy` od 2026-08-13 (wdrozone indeksy tips + timestamp, dzialaja
    // takze z `in`): sufit ucina najstarsze wpisy zamiast arbitralnego
    // podzbioru w kolejnosci po ID dokumentu.
    getDocs(
      query(
        collection(db, 'tips'),
        where('recipientAddress', 'in', variants),
        orderBy('timestamp', 'desc'),
        limit(500)
      )
    ).catch(onFail('tips.received')),

    getDocs(
      query(
        collection(db, 'tips'),
        where('senderAddress', 'in', variants),
        orderBy('timestamp', 'desc'),
        limit(500)
      )
    ).catch(onFail('tips.sent')),
  ]);

  const userData = (userDoc?.data() ?? {}) as Record<string, any>;

  const postDocs = postsSnapshot?.docs ?? [];

  let likesReceived = 0;
  const recentPosts: ProfilePost[] = [];

  for (const entry of postDocs) {
    const data = entry.data() as Record<string, any>;
    const likes = typeof data.likes === 'number' ? data.likes : 0;
    likesReceived += likes;

    if (recentPosts.length < RECENT_POSTS) {
      recentPosts.push({
        id: entry.id,
        content: typeof data.content === 'string' ? data.content : '',
        timestamp: toMillis(data.timestamp),
        likes,
        // Licznik z zapisu przed dlugoscia tablicy - nowe komentarze zyja
        // tylko w kolekcji `comments`, nie w dokumencie posta.
        commentCount:
          typeof data.commentsCount === 'number'
            ? Math.max(0, data.commentsCount)
            : Array.isArray(data.comments) ? data.comments.length : 0,
        network: data.network ?? undefined,
      });
    }
  }

  // Sumy trzymamy per token. Zsumowanie ETH z USDC dalo by liczbe, ktora nic
  // nie znaczy - a profil ma byc rekordem, nie infografika.
  const received: Record<string, number> = {};
  for (const entry of receivedSnapshot?.docs ?? []) {
    const tip = entry.data() as Record<string, any>;
    const amount = Number.parseFloat(String(tip.amount ?? '0'));
    if (!Number.isFinite(amount)) continue;
    const token = typeof tip.token === 'string' ? tip.token : 'ETH';
    received[token] = (received[token] ?? 0) + amount;
  }

  // Profil bez zadnego sladu w bazie nie istnieje - lepiej oddac 404 niz pusta
  // strone, ktora crawler zaindeksuje jako tresc.
  //
  // ALE: "nie znalazlem sladu" i "nie udalo mi sie sprawdzic" to nie to samo.
  // Wczesniej dawaly ten sam wynik, wiec przejsciowa awaria Firestore znaczyla
  // 404 na PUBLICZNYM PROFILU ISTNIEJACEGO CZLOWIEKA. Szkoda jest trwalsza niz
  // sama awaria: 404 to dla crawlera oswiadczenie, ze strona nie istnieje, a
  // ten profil ma jedno zadanie - dobrze wygladac po wklejeniu linku.
  //
  // Gdy ktorykolwiek odczyt sie wywrocil, wolimy oddac profil niepelny niz
  // skasowac czlowieka z internetu na czas awarii.
  const hasAnyTrace =
    Boolean(userDoc) ||
    postDocs.length > 0 ||
    (receivedSnapshot?.size ?? 0) > 0 ||
    (sentSnapshot?.size ?? 0) > 0;

  if (!hasAnyTrace && failed === 0) return null;

  return {
    address,
    storedName: typeof userData.name === 'string' ? userData.name : undefined,
    avatar: typeof userData.avatar === 'string' ? userData.avatar : undefined,
    bio: typeof userData.bio === 'string' ? userData.bio : undefined,
    joinedAt: typeof userData.joinedAt === 'number' ? userData.joinedAt : undefined,
    postCount: postDocs.length,
    likesReceived,
    tips: {
      receivedCount: receivedSnapshot?.size ?? 0,
      sentCount: sentSnapshot?.size ?? 0,
      received,
    },
    recentPosts,
    partial: failed > 0,
  };
}
