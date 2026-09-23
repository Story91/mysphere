import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  collection,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy as firestoreOrderBy,
  serverTimestamp,
  increment,
  Timestamp,
  arrayUnion,
  arrayRemove,
  limit as firestoreLimit,
  writeBatch,
  deleteField,
  deleteDoc,
  startAfter as firestoreStartAfter,
  documentId,
  DocumentData,
  QueryDocumentSnapshot,
  runTransaction
} from 'firebase/firestore';
import { getAuth, TwitterAuthProvider } from 'firebase/auth';
import { UserProfile, Post, Comment } from '../types';
import { DEFAULT_REFERRAL_CONFIG } from './referrals/types';
// Jedyna normalizacja adresu w repo. types.ts nie ciagnie za soba Firestore
// ani niczego ciezkiego (sam viem), wiec import jest bezpieczny takze tutaj.
import { normalizeAddress, addressReadVariants } from './monetization/types';

// Adres admina zyje w ./adminAddress (plik bez importow, zeby trasy serwerowe
// mogly go czytac bez odpalania klienta Firebase). Re-eksport trzyma przy
// zyciu wszystkie dotychczasowe importy `ADMIN_ADDRESS` z tego pliku.
// Pelny opis bramy uprawnien - w tamtym pliku.
import { ADMIN_ADDRESS } from './adminAddress';
export { ADMIN_ADDRESS };
// Czyste funkcje bez importow serwerowych - ta sama definicja "platnej
// odpowiedzi" co w trasie moderacji i w regulach Firestore.
import { PAID_REPLY_MODERATION_PATH, isPaidReplyData } from './solana/moderation';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const twitterProvider = new TwitterAuthProvider();

// ===============================================
// PRYWATNE HELPERY - wzorce powtarzane w calym pliku
// ===============================================

/** Dzieli tablice na kawalki - Firestore przyjmuje max 30 wartosci w operatorze "in". */
const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

/**
 * Pobiera dokumenty po ID: jedno zapytanie na kazde 30 sztuk zamiast getDoc()
 * per dokument. Zwraca mape id -> dane; dokumenty, ktorych nie ma, po prostu
 * nie trafiaja do mapy (getDoc na nieistniejacy dokument tez kosztuje odczyt).
 */
const fetchDocsByIds = async (
  collectionName: string,
  ids: string[]
): Promise<Map<string, DocumentData>> => {
  const result = new Map<string, DocumentData>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return result;

  const snapshots = await Promise.all(
    chunkArray(unique, 30).map(chunk =>
      getDocs(query(collection(db, collectionName), where(documentId(), 'in', chunk)))
    )
  );
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(docSnap => result.set(docSnap.id, docSnap.data()));
  });
  return result;
};

/**
 * Czas w tej bazie siedzi raz jako Timestamp, raz jako liczba milisekund,
 * raz jako ISO string. Kazde miejsce robilo wlasny `instanceof Timestamp ? ... : ...`.
 */
const toMillis = (value: any): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return undefined;
};

/**
 * Kwoty tipow leza w Firestore jako stringi. Jeden rekord z pusta albo
 * uszkodzona kwota dawal NaN, ktore zjadalo CALA sume w statystykach.
 */
const parseAmount = (value: unknown): number => {
  const amount = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(amount) ? amount : 0;
};

/**
 * Komentarze z LEGACY tablicy `posts/{id}.comments` bez pol platnej odpowiedzi.
 *
 * Platna odpowiedz (tipLamports, via) zapisuje WYLACZNIE serwer i WYLACZNIE do
 * kolekcji `comments` (app/utils/solana/replyStore.ts) - w tablicy posta nie
 * lezy nigdy. Tablice zapisuje za to kazda przegladarka, wiec wpis z tymi
 * polami to podrobka, ktora dorysowalaby sobie odznake "paid reply · X SOL"
 * pod dowolnym postem. Zdejmujemy je przy odczycie. Wpisy niebedace obiektami
 * odpadaja z tego samego powodu - feed zrobilby na nich `.id` i sie wywrocil.
 */
const legacyCommentsWithoutPaidFields = (raw: unknown): Comment[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map(({ tipLamports: _tipLamports, via: _via, ...rest }) => rest as unknown as Comment);
};

/**
 * Mapowanie dokumentu posta na obiekt feedu. Bylo skopiowane znak w znak
 * w fetchPosts i fetchBaseNameFeedPosts - dwie kopie rozjezdzaly sie przy
 * kazdym nowym polu posta.
 */
const mapPostDoc = (postDoc: QueryDocumentSnapshot): ExtendedPost => {
  const postData = postDoc.data();
  return {
    id: postDoc.id,
    author: postData.author,
    content: postData.content,
    timestamp: toMillis(postData.timestamp) || Date.now(),
    likes: postData.likes || 0,
    likedBy: postData.likedBy || [],
    // Tablica w dokumencie to LEGACY: nowe komentarze zyja tylko w kolekcji
    // `comments` i dociagaja sie przy rozwinieciu sekcji (PostList). Tablicy
    // nie ruszamy, bo stare komentarze moga istniec wylacznie w niej - ale
    // bez pol platnej odpowiedzi (patrz legacyCommentsWithoutPaidFields).
    comments: legacyCommentsWithoutPaidFields(postData.comments),
    // Liczba do plakietki: licznik z zapisu, a dla postow sprzed licznikow
    // dlugosc tablicy, ktora i tak przyjechala z dokumentem. Clamp do zera,
    // bo atomowy decrement przy podwojnym usunieciu moze zejsc ponizej.
    commentsCount: Math.max(
      0,
      typeof postData.commentsCount === 'number'
        ? postData.commentsCount
        : (postData.comments || []).length
    ),
    tags: postData.tags || [],
    mentions: postData.mentions || [],
    image: postData.image || null,
    video: postData.video || null,
    txHash: postData.txHash || null,
    lastEdited: postData.lastEdited || null,
    zoraCoinAddress: postData.zoraCoinAddress || null,
    network: postData.network || 'base',
    musicTrack: postData.musicTrack || null,
    isPinned: postData.isPinned || false,
    pinnedAt: toMillis(postData.pinnedAt),
    pinnedBy: postData.pinnedBy || undefined,
    isPaidPin: postData.isPaidPin || false,
    paidPinExpiresAt: toMillis(postData.paidPinExpiresAt),

    /**
     * === BEZ TYCH DWOCH POL PLATNY POST BYL NIEWIDOCZNY DLA KUPUJACEGO ===
     *
     * To mapowanie jest JEDYNA droga, ktora dokument posta pokonuje z Firestore
     * do feedu - i nie przepisywalo ono ANI hasPremium, ANI unlockPrice. Feed
     * decyduje o narysowaniu bramki przez hasPremiumContent(), ktore pyta
     * dokladnie o te pola, wiec dla KAZDEGO posta wczytanego z bazy wychodzilo
     * "to nie jest platny post". Czytelnik nie widzial ceny, tokena ani
     * przycisku - nie mial czego kupic, choc dokument w Firestore byl poprawny.
     *
     * Autor widzial bramke tylko dlatego, ze jego wlasny post trafial do stanu
     * Reacta z pominieciem tej funkcji (optymistyczny wpis z kompozytora).
     * Stad dwa rozne widoki tego samego posta.
     *
     * `premiumContent` (tresc starych postow, sprzed przeniesienia jej do
     * zapieczetowanej kolekcji) skladamy TU do flagi zamiast przepisywac tekst:
     * feed i tak go nie renderuje - wydaje go GET /api/premium - a obiekty
     * postow lada potem w localStorage.
     */
    hasPremium:
      postData.hasPremium === true ||
      (typeof postData.premiumContent === 'string' && postData.premiumContent.trim() !== ''),
    // Cena bywa w bazie liczba (rekordy sprzed ustalenia formatu), a feed i
    // bramka licza na stringu dziesietnym. Zamiana zamiast odrzucenia, bo
    // "zly typ" nie moze znaczyc "post nie jest platny".
    unlockPrice:
      typeof postData.unlockPrice === 'string'
        ? postData.unlockPrice
        : typeof postData.unlockPrice === 'number' && Number.isFinite(postData.unlockPrice)
          ? String(postData.unlockPrice)
          : undefined,
    unlockToken:
      postData.unlockToken === 'ETH' || postData.unlockToken === 'USDC'
        ? postData.unlockToken
        : undefined,
  };
};

/** Przypiete na gorze, potem reszta w kolejnosci, jaka dal Firestore. */
const sortPinnedFirst = (posts: ExtendedPost[]): ExtendedPost[] =>
  posts.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    if (a.isPinned && b.isPinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0);
    return 0;
  });

// ✅ FIREBASE OPTIMIZATION: hasBaseName() function REMOVED - replaced with string.endsWith('.base.eth') checks
// This eliminates expensive Firebase reads from 'usernames' collection, saving $100-200/day

// ===============================================
// BONUSY DOMENOWE (.base.eth / .sphere / .camper / .celo / .world)
// ===============================================
// Kazdy z pieciu bonusow mial wlasna kopie tej samej funkcji: 5 x ~65 linii,
// roznica wylacznie w nazwie pola, liczbie punktow i emoji w logu. Teraz jest
// jedna implementacja sterowana tabela ponizej.

interface DomainBonusDefinition {
  /** wartosc parametru `suffix` w saveProfileName */
  key: 'baseName' | 'sphere' | 'camper' | 'celo' | 'world';
  /** pole w users.baseChatPoints */
  field: string;
  points: number;
  /** flaga w kolekcji `usernames`, po ktorej znajdujemy uprawnionych */
  usernamesFlag: string;
  /** koncowka nazwy uprawniajaca do bonusu */
  suffix: string;
  label: string;
}

const DOMAIN_BONUSES: Record<DomainBonusDefinition['key'], DomainBonusDefinition> = {
  baseName: { key: 'baseName', field: 'baseNameBonus', points: 1000, usernamesFlag: 'isBaseName', suffix: '.base.eth', label: 'BaseName' },
  sphere:   { key: 'sphere',   field: 'sphereBonus',   points: 1500, usernamesFlag: 'isSphere',   suffix: '.sphere',   label: '.sphere' },
  camper:   { key: 'camper',   field: 'camperBonus',   points: 1000, usernamesFlag: 'isCamper',   suffix: '.camper',   label: '.camper' },
  celo:     { key: 'celo',     field: 'celoBonus',     points: 1250, usernamesFlag: 'isCelo',     suffix: '.celo',     label: '.celo' },
  world:    { key: 'world',    field: 'worldBonus',    points: 1250, usernamesFlag: 'isWorld',    suffix: '.world',    label: '.world' }
};

const DOMAIN_BONUS_LIST: DomainBonusDefinition[] = Object.values(DOMAIN_BONUSES);

/**
 * Wszystkie skladniki, z ktorych liczy sie totalPoints.
 *
 * UWAGA: wersja dla BaseName sumowala tylko cztery pierwsze, wiec przyznanie
 * bonusu BaseName KASOWALO z sumy bonusy .sphere/.camper/.celo/.world oraz
 * punkty referralowe. Po ujednoliceniu suma jest jedna dla wszystkich piesciu.
 */
const POINT_COMPONENTS = [
  'activityBonus',
  'likePoints',
  'postPoints',
  'baseNameBonus',
  'camperBonus',
  'sphereBonus',
  'celoBonus',
  'worldBonus',
  'referralPoints'
] as const;

/** Dodaje bonus domenowy, o ile uzytkownik jeszcze go nie ma. */
const addDomainBonusToUser = async (userAddress: string, bonus: DomainBonusDefinition): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userAddress);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) return;

    // W bazie baseChatPoints bywa stringiem albo nie ma go wcale.
    const stored = userDoc.data().baseChatPoints;
    const baseChatPoints: Record<string, any> =
      !stored || typeof stored !== 'object' ? {} : { ...stored };

    POINT_COMPONENTS.forEach(component => {
      baseChatPoints[component] = Number(baseChatPoints[component] || 0);
    });

    if (baseChatPoints[bonus.field] > 0) return; // bonus juz przyznany

    baseChatPoints[bonus.field] = bonus.points;
    baseChatPoints.totalPoints = POINT_COMPONENTS.reduce(
      (sum, component) => sum + baseChatPoints[component],
      0
    );

    await updateDoc(userRef, {
      baseChatPoints,
      lastUpdated: serverTimestamp()
    });
  } catch (error) {
    console.error(`Error adding ${bonus.label} bonus:`, error);
  }
};

/**
 * Przyznaje bonus wszystkim uzytkownikom oznaczonym odpowiednia flaga
 * w kolekcji `usernames`.
 */
const addDomainBonusToAllUsers = async (
  bonus: DomainBonusDefinition
): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    const snapshot = await getDocs(
      query(collection(db, 'usernames'), where(bonus.usernamesFlag, '==', true))
    );

    let updatedUsers = 0;
    for (const usernameDoc of snapshot.docs) {
      await addDomainBonusToUser(usernameDoc.id, bonus);
      updatedUsers++;
    }

    console.log(`Zakonczono dodawanie bonusu ${bonus.label}: zaktualizowano ${updatedUsers} uzytkownikow`);
    return { success: true, updatedUsers };
  } catch (error) {
    console.error(`Blad podczas dodawania bonusu ${bonus.label}:`, error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : `Nieznany blad podczas dodawania bonusu ${bonus.label}`
    };
  }
};

type DomainBonusResult = Promise<{success: boolean, updatedUsers: number, error?: string}>;

export const addBaseNameBonusToAllUsers = (): DomainBonusResult => addDomainBonusToAllUsers(DOMAIN_BONUSES.baseName);
export const addSphereBonusToAllUsers = (): DomainBonusResult => addDomainBonusToAllUsers(DOMAIN_BONUSES.sphere);
export const addCamperBonusToAllUsers = (): DomainBonusResult => addDomainBonusToAllUsers(DOMAIN_BONUSES.camper);
export const addCeloBonusToAllUsers = (): DomainBonusResult => addDomainBonusToAllUsers(DOMAIN_BONUSES.celo);
export const addWorldBonusToAllUsers = (): DomainBonusResult => addDomainBonusToAllUsers(DOMAIN_BONUSES.world);

// Funkcja do odświeżenia wszystkich bonusów domenowych dla istniejących użytkowników
export const refreshAllDomainBonuses = async (): Promise<{
  success: boolean;
  sphere: number;
  camper: number;
  celo: number;
  world: number;
  error?: string;
}> => {
  try {
    console.log('🔄 Rozpoczynam odświeżanie wszystkich bonusów domenowych...');
    
    const [sphereResult, camperResult, celoResult, worldResult] = await Promise.all([
      addSphereBonusToAllUsers(),
      addCamperBonusToAllUsers(),
      addCeloBonusToAllUsers(),
      addWorldBonusToAllUsers()
    ]);
    
    const totalUpdated = sphereResult.updatedUsers + camperResult.updatedUsers + 
                        celoResult.updatedUsers + worldResult.updatedUsers;
    
    console.log(`✅ Zakończono odświeżanie wszystkich bonusów domenowych:`);
    console.log(`   🌐 .sphere: ${sphereResult.updatedUsers} użytkowników`);
    console.log(`   🏕️ .camper: ${camperResult.updatedUsers} użytkowników`);
    console.log(`   💛 .celo: ${celoResult.updatedUsers} użytkowników`);
    console.log(`   🌍 .world: ${worldResult.updatedUsers} użytkowników`);
    console.log(`   📊 Łącznie: ${totalUpdated} użytkowników`);
    
    return {
      success: true,
      sphere: sphereResult.updatedUsers,
      camper: camperResult.updatedUsers,
      celo: celoResult.updatedUsers,
      world: worldResult.updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas odświeżania bonusów domenowych:', error);
    return {
      success: false,
      sphere: 0,
      camper: 0,
      celo: 0,
      world: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas odświeżania bonusów domenowych'
    };
  }
};

/**
 * Przelaczenie lajka.
 *
 * === DLACZEGO TO NIE JEST JUZ TRANSAKCJA ===
 * Bylo `runTransaction`. Wygladalo poprawnie i przez to bylo trudne do
 * znalezienia: lajki NIE DZIALALY w produkcji, a przycisk pokazywal
 * "Could not save your like" - komunikat z bloku catch, czyli zlapany wyjatek
 * udajacy odmowe.
 *
 * Zmierzone sonda tylko do odczytu na tej bazie:
 *   - getDoc / getDocs                      -> OK
 *   - getCountFromServer                    -> RESOURCE_EXHAUSTED
 *   - runTransaction NIC NIE ZAPISUJACA     -> RESOURCE_EXHAUSTED
 *
 * Czyli wyczerpany limit obejmuje CALA sciezke transakcyjna, a nie tylko
 * agregacje - dlatego postowanie i komentowanie dzialalo, a lajkowanie nie.
 * Wczesniejsza poprawka (commit 1c6a673) zdjela z agregacji sam LICZNIK
 * globalny i to bylo za malo, bo prawdziwa blokada byla o poziom nizej.
 *
 * === DLACZEGO TRANSAKCJA BYLA TU ZBEDNA OD POCZATKU ===
 * Sluzyla wylacznie do odczytania `likedBy`, zeby wiedziec, czy to lajk czy
 * cofniecie. Ale `arrayUnion` i `arrayRemove` sa IDEMPOTENTNE po stronie
 * serwera - podwojne dodanie tego samego adresu nie robi duplikatu, a
 * usuniecie nieobecnego nie jest bledem. Odczyt pod zamkiem chronil wiec
 * decyzje, ktorej i tak nie da sie zepsuc.
 *
 * === CO SIE PRZEZ TO TRACI (uczciwie) ===
 * Pole `likes` to osobny licznik i `increment` nie jest warunkowy. Przy
 * DWOCH rownoczesnych klknieciach tego samego uzytkownika w tego samego
 * posta `likedBy` zostanie poprawne, a `likes` moze rozjechac sie o jeden.
 * To jest realna cena i swiadomie ja placimy: alternatywa to lajki, ktore
 * nie dzialaja wcale.
 *
 * === PODPOWIEDZI OD WYWOLUJACEGO ===
 * `hints` pozwala pominac odczyt calkowicie. PostList i tak zna `wasLiked`
 * (liczy je z post.likedBy, zeby narysowac serduszko) oraz autora posta -
 * przekazanie ich tutaj zamienia lajk w JEDEN zapis i ZERO odczytow.
 * Bez podpowiedzi spadamy na zwykly getDoc, ktory dziala.
 */
export const toggleLike = async (
  postId: string,
  userId: string,
  hints?: { wasLiked?: boolean; author?: string }
): Promise<boolean> => {
  try {
    const postRef = doc(db, 'posts', postId);

    let isLiked: boolean;
    let author: string | undefined;

    if (typeof hints?.wasLiked === 'boolean' && hints.author) {
      isLiked = hints.wasLiked;
      author = hints.author;
    } else {
      // Zwykly odczyt - ta sciezka NIE jest objeta limitem transakcji.
      const postDoc = await getDoc(postRef);
      if (!postDoc.exists()) {
        throw new Error('Post nie istnieje');
      }
      const postData = postDoc.data();
      isLiked = (postData.likedBy || []).includes(userId);
      author = postData.author as string;
    }

    await updateDoc(postRef, {
      likes: increment(isLiked ? -1 : 1),
      likedBy: isLiked ? arrayRemove(userId) : arrayUnion(userId)
    });

    const outcome = { isLiked, author };

    // Licznik lajkow autora AKTUALIZUJEMY DOPIERO PO zapisie lajka.
    // Wczesniej stal setTimeout wewnatrz callbacku transakcji - a Firestore
    // uruchamia ten callback ponownie przy kazdym konflikcie zapisu, wiec przy
    // dwoch rownoczesnych lajkach autor dostawal +2 za jeden lajk. Zapis osobno
    // jest z zalozenia nieatomowy, ale przynajmniej wykonuje sie raz.
    if (outcome.author && outcome.author !== userId) {
      try {
        await updateDoc(doc(db, 'users', outcome.author), {
          likesReceived: increment(outcome.isLiked ? -1 : 1),
          lastActive: serverTimestamp()
        });
      } catch (error) {
        // Nie przewracamy lajka z powodu statystyk autora - lajk juz sie zapisal.
        console.error('Error updating author stats:', error);
      }
    }

    /**
     * GLOBALNEGO LICZNIKA LAJKOW TU JUZ NIE MA - i nie wolno go przywracac.
     *
     * Stal tu `setDoc(globalStats/current, { likesSince: increment(+-1) })`
     * z przegladarki. Powstal, gdy agregacje w tym projekcie zwracaly
     * RESOURCE_EXHAUSTED i `sum('likes')` bylo niewykonalne. Mial dwie wady,
     * ktorych nie dalo sie naprawic w tym miejscu:
     *   - zapis do licznika, ktory widzi kazdy gosc, szedl z KAZDEJ
     *     przegladarki, wiec mogl go tez zmienic kazdy z konsoli - o dowolna
     *     wartosc, nie o jeden;
     *   - licznik nie znal lajkow sprzed swojego startu, wiec feed musial
     *     skladac go ze stara migawka i pisac "at least".
     *
     * Teraz sume liczy raz na dobe serwer (app/api/stats/recount/route.ts)
     * agregacja po `posts.likes` i zapisuje kluczem administracyjnym. Lajk
     * zmienia wiec liczbe na feedzie dopiero przy nastepnym przeliczeniu,
     * a panel Trends pokazuje date tego przeliczenia.
     */

    return !outcome.isLiked; // true jesli dodano lajka, false jesli usunieto
  } catch (error) {
    console.error('Error toggling like:', error);
    throw error;
  }
};

// Modyfikacja funkcji deletePost aby używała nowego systemu lajków
export const deletePost = async (postId: string, authorAddress: string) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const postData = postSnap.data();
    
    // ✅ NAPRAWKA: Sprawdź czy użytkownik to autor LUB admin
    // Adresy porownujemy bez wzgledu na wielkosc liter: w bazie leza zapisane
    // raz w checksumie, raz malymi. Porownanie znak w znak odbieralo autorowi
    // prawo do skasowania wlasnego posta.
    const isAdmin = authorAddress.toLowerCase() === ADMIN_ADDRESS;
    const isAuthor = typeof postData.author === 'string'
      && postData.author.toLowerCase() === authorAddress.toLowerCase();
    
    if (!isAuthor && !isAdmin) {
      throw new Error('Unauthorized to delete this post');
    }

    // Prepare batch for atomic operations
    const batch = writeBatch(db);

    // Odejmij lajki i postsCount od autora (tylko gdy usuwamy własny post)
    if (isAuthor) {
      const authorRef = doc(db, 'users', authorAddress);
      batch.update(authorRef, {
        likesReceived: increment(-(postData.likes || 0)),
        postsCount: increment(-1),
        'stats.posts': increment(-1),
        lastActive: serverTimestamp()
      });
    }

    // Delete post comments - W TYM SAMYM batchu co post. Platna odpowiedz
    // (tipLamports) wolno skasowac przegladarce tylko wtedy, gdy jej post
    // znika w tej samej operacji (firestore.rules: existsAfter). Rozbicie
    // na dwa zapisy wywrociloby usuwanie kazdego posta z platna odpowiedzia.
    const commentsRef = collection(db, 'comments');
    const commentsQuery = query(commentsRef, where('postId', '==', postId));
    const commentsSnap = await getDocs(commentsQuery);
    commentsSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete the post
    batch.delete(postRef);

    // Execute all operations
    await batch.commit();

    return true;
  } catch (error) {
    console.error('Error deleting post:', error);
    throw error;
  }
};

/*
 * === POWIADOMIENIA MIESZKAJA W app/utils/friends/notifications.ts ===
 *
 * Stal tu DRUGI, rownolegly system powiadomien (addNotification,
 * fetchUnreadNotifications, markNotificationAsRead) piszacy do tej samej
 * subkolekcji users/{id}/notifications, ale INNYM ksztaltem dokumentu:
 * pole `read` zamiast `isRead` i `fromUser` zamiast `fromUserId`. Zaden
 * z tych trzech eksportow nie mial juz ani jednego wolajacego (zweryfikowane
 * grepem po calym repo), a jedyny slad po nim to zakomentowany import
 * w utils/friends/index.ts.
 *
 * Zostawienie go bylo realnym ryzykiem: pierwsze uzycie zapisaloby
 * powiadomienie, ktorego zywy system nie policzy jako nieprzeczytane
 * (pyta o `isRead`), czyli kropka na dzwonku milczalaby o istniejacym
 * wpisie. Jeden system, jeden ksztalt dokumentu, jedno miejsce w kodzie.
 */

// Utwórz nowy post z zaawansowanymi opcjami
/**
 * Post powstal, ale nie udalo sie zapisac jego platnego fragmentu.
 * Wlasna klasa, bo to jest CALKIEM INNY stan niz "post sie nie utworzyl" -
 * uzytkownik nie ma publikowac drugi raz.
 */
export class PremiumContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PremiumContentError';
  }
}

export const createPost = async (post: {
  author: string;
  content: string;
  timestamp: number;
  /**
   * Tresc premium. NIE trafia do dokumentu posta - feed czyta posty klienckim
   * SDK, wiec wszystko, co tam wpiszemy, jest publiczne niezaleznie od UI.
   * Zapisuje ja trasa /api/premium do kolekcji poza zasiegiem przegladarki.
   */
  premiumContent?: string;
  unlockPrice?: string;
  unlockToken?: 'ETH' | 'USDC';
  image?: string | null;
  video?: string | null;
  tags?: string[];
  mentions?: string[];
  visibility?: 'public' | 'followers' | 'private';
  txHash?: string; // Keep this as it now represents the Zora creation tx hash
  zoraCoinAddress?: string; // <-- ADDED
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood' | 'arc' | 'solana' | 'solana'; // Add network parameter to identify the source network
  musicTrack?: { // 🎵 Dodaj obsługę załączników muzycznych
    id: string;
    name: string;
    artists: Array<{
      name: string;
      external_urls?: { spotify: string; };
    }>;
    album: {
      name: string;
      images?: Array<{ url: string; height: number; width: number; }>;
      external_urls?: { spotify: string; };
      release_date?: string;
    };
    duration_ms: number;
    popularity?: number;
    preview_url?: string;
    external_urls?: { spotify: string; };
  };
}): Promise<string> => { // Zmieniamy typ zwracany na Promise<string>
  try {
    // Tresc premium wyjmujemy z danych posta ZANIM cokolwiek trafi do Firestore.
    // Dokument posta niesie tylko fakt istnienia platnej czesci i jej cene;
    // sama tresc idzie osobnym kanalem, do kolekcji, ktorej klient nie czyta.
    const { premiumContent, ...postFields } = post;
    const hasPremium = typeof premiumContent === 'string' && premiumContent.trim() !== '';

    const postData = {
      ...postFields,
      timestamp: serverTimestamp(),
      likes: 0,
      likedBy: [],
      comments: [],
      commentsCount: 0,
      isPinned: false,
      image: post.image || null,
      video: post.video || null,
      tags: post.tags || [],
      mentions: post.mentions || [],
      visibility: post.visibility || 'public',
      txHash: post.txHash || null,
      zoraCoinAddress: post.zoraCoinAddress || null,
      network: post.network || 'base',
      musicTrack: post.musicTrack || null // 🎵 Dodaj pole musicTrack
    };

    // Użyj batcha do operacji atomowych
    const batch = writeBatch(db);

    // 1. Dodaj post do głównej kolekcji `posts`
    const postsCollection = collection(db, 'posts');
    const newPostRef = doc(postsCollection); // Wygeneruj ID posta z góry
    batch.set(newPostRef, postData);

    // 2. Sprawdź, czy autor ma BaseName
    const usernameRef = doc(db, 'usernames', post.author);
    const usernameDoc = await getDoc(usernameRef);
    const hasBaseName = usernameDoc.exists() && usernameDoc.data().isBaseName === true;

    // 3. Jeśli autor ma BaseName, dodaj kopię posta do `baseNameFeed`
    if (hasBaseName) {
      console.log('👤 Autor ma BaseName - post trafia tez do baseNameFeed.');
      const baseNameFeedCollection = collection(db, 'baseNameFeed');
      // Użyj tego samego ID dla posta w obu kolekcjach
      const baseNameFeedPostRef = doc(baseNameFeedCollection, newPostRef.id);
      batch.set(baseNameFeedPostRef, postData);
    }

    // 4. Zaktualizuj statystyki autora (postsCount)
    const authorRef = doc(db, 'users', post.author);
    batch.update(authorRef, {
      postsCount: increment(1),
      'stats.posts': increment(1),
      lastActive: serverTimestamp()
    });

    // 5. Wykonaj wszystkie operacje w batchu
    await batch.commit();
    
    console.log(`✅ Post created with ID: ${newPostRef.id}`);

    // 5b. Tresc premium - osobnym kanalem, po utworzeniu posta.
    //
    // Trasa /api/premium zapisuje ja do kolekcji poza zasiegiem przegladarki
    // i DOPIERO POTEM oznacza post jako platny. Kolejnosc jest celowa: gdy
    // zapis padnie, post zostaje zwyklym postem, zamiast dostac cene bez
    // tresci. Autor dowiaduje sie o tym z rzuconego bledu.
    if (hasPremium) {
      const response = await fetch('/api/premium', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: newPostRef.id,
          content: premiumContent,
          unlockPrice: post.unlockPrice,
          unlockToken: post.unlockToken,
        }),
      });

      if (!response.ok) {
        let detail = 'Premium content could not be saved.';
        try {
          const data = (await response.json()) as { error?: string };
          if (typeof data.error === 'string' && data.error) detail = data.error;
        } catch {
          // odpowiedz bez JSON - zostajemy przy komunikacie domyslnym
        }
        console.error('❌ Zapis tresci premium nie powiodl sie:', response.status, detail);
        throw new PremiumContentError(`${detail} Your post was published without the paid section.`);
      }
    }

    // 6. Check if this is user's first post and award referral bonus.
    //
    // firestoreLimit(2) wystarczy, zeby odroznic "dokladnie jeden post" od
    // "wiecej niz jeden". Bez tego limitu KAZDE opublikowanie posta czytalo
    // CALA historie autora - uzytkownik z 500 postami placil 500 odczytow za
    // sprawdzenie, ktore i tak moze dac tylko odpowiedz "nie, nie pierwszy".
    const userPostsQuery = query(
      collection(db, 'posts'),
      where('author', '==', post.author),
      firestoreLimit(2)
    );
    const userPostsSnapshot = await getDocs(userPostsQuery);

    // If this is user's first post (only the one just created)
    if (userPostsSnapshot.size === 1) {
      // Dynamic import to avoid circular dependencies
      const { awardFirstPostBonus, activateReferral } = await import('./referrals/referralService');
      
      // Activate referral (if user was referred)
      await activateReferral(post.author);
      
      // Award first post bonus
      await awardFirstPostBonus(post.author);
      console.log('🎁 Checked first post bonus and activated referral');
    }
    
    // Zwróć ID nowego posta
    return newPostRef.id;

  } catch (error) {
    // Blad zapisu tresci premium przepuszczamy z wlasnym komunikatem: post
    // ISTNIEJE i jest widoczny, nie powstal tylko jego platny fragment.
    // Zamiana tego na "Failed to create post" mowilaby uzytkownikowi
    // nieprawde i kazalaby publikowac drugi raz.
    if (error instanceof PremiumContentError) throw error;

    console.error('❌ Error creating post:', error);
    throw new Error('Failed to create post in Firebase');
  }
};

// Interfejs dla parametrów funkcji fetchPosts
interface FetchPostsParams {
  userId?: string;
  limit?: number;
  startAfter?: QueryDocumentSnapshot | null;
  orderBy?: 'newest' | 'oldest';
  authorFilter?: string | null;
  /**
   * Lista autorow - feed obserwowanych.
   *
   * Do tej pory zakladka "Follows" przekazywala `authorFilter: address`, czyli
   * WLASNY adres uzytkownika, i pokazywala jego wlasne posty. Etykieta mowila
   * "Follows", tresc byla "moje" - a caly graf obserwowanych nie mial zadnego
   * wplywu na feed.
   *
   * LIMIT: Firestore przyjmuje w `in` najwyzej 30 wartosci. Kto obserwuje
   * wiecej, dostaje 30 pierwszych z listy - wolajacy MA o tym powiedziec,
   * zamiast po cichu ucinac. Cicha wersja tego ograniczenia bylaby feedem,
   * ktory gubi ludzi bez podania powodu.
   */
  authorsIn?: string[] | null;
  tagFilter?: string | null;
  searchTerm?: string | null;
  networkFilter?: 'base' | 'basecamp' | null; // Add network filter parameter
}

// Interfejs zwracany przez funkcję fetchPosts
interface FetchPostsResult {
  posts: ExtendedPost[];
  lastVisible: QueryDocumentSnapshot | null;
}

// Funkcja do pobierania postów z Firestore
export const fetchPosts = async ({ 
  userId, 
  limit = 15,  // ⚡ OPTYMALIZACJA: Zmniejszam domyślny limit z 25 do 15 postów (-40% Firebase reads)
  startAfter = null, 
  orderBy = 'newest',
  authorFilter = null,
  authorsIn = null,
  tagFilter = null,
  searchTerm = null,
  networkFilter = null // Default to null (no filtering)
}: FetchPostsParams = {}): Promise<FetchPostsResult> => {
  try {
    const postsCollection = collection(db, 'posts');
    const queryConstraints = [];
    
    // Sortowanie postów
    if (orderBy === 'newest') {
      queryConstraints.push(firestoreOrderBy('timestamp', 'desc'));
    } else {
      queryConstraints.push(firestoreOrderBy('timestamp', 'asc'));
    }
    
    // Filtrowanie postów
    if (authorFilter) {
      queryConstraints.push(where('author', '==', authorFilter));
    }

    // Feed obserwowanych. `in` ma twardy limit 30 wartosci - wiecej Firestore
    // odrzuca bledem, nie obcieciem, wiec tniemy sami i to jawnie.
    if (authorsIn && authorsIn.length > 0) {
      queryConstraints.push(where('author', 'in', authorsIn.slice(0, 30)));
    }

    if (tagFilter) {
      queryConstraints.push(where('tags', 'array-contains', tagFilter));
    }
    
    // Add network filter - only if specifically requested for filtered views
    // For normal feed, we want to show all posts regardless of network
    if (networkFilter) {
      queryConstraints.push(where('network', '==', networkFilter));
    }
    
    // Ograniczenie liczby postów
    queryConstraints.push(firestoreLimit(limit));
    
    // Paginacja - jeśli startAfter jest zdefiniowany
    if (startAfter) {
      queryConstraints.push(firestoreStartAfter(startAfter));
    }
    
    // Wykonaj zapytanie
    const postsQuery = query(postsCollection, ...queryConstraints);
    const postsSnapshot = await getDocs(postsQuery);
    
    // Mapowanie dokumentow na obiekty postow (wspolne z feedem BaseName)
    const lastVisible: QueryDocumentSnapshot | null = postsSnapshot.empty
      ? null
      : postsSnapshot.docs[postsSnapshot.docs.length - 1];

    const needle = searchTerm ? searchTerm.toLowerCase() : null;
    const posts = sortPinnedFirst(
      postsSnapshot.docs
        .map(mapPostDoc)
        // Doszukiwanie po stronie klienta - Firestore nie umie "zawiera".
        .filter(post => !needle || (typeof post.content === 'string' && post.content.toLowerCase().includes(needle)))
    );
    // Zwróć posty wraz z informacją o ostatnim widocznym dokumencie do paginacji
    return { 
      posts, 
      lastVisible 
    };
    
  } catch (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }
};

// Funkcja do pobierania postów z dedykowanego feedu BaseName
export const fetchBaseNameFeedPosts = async ({ 
  limit = 15,
  startAfter = null,
  orderBy = 'newest'
}: {
  limit?: number;
  startAfter?: QueryDocumentSnapshot | null;
  orderBy?: 'newest' | 'oldest';
} = {}): Promise<FetchPostsResult> => {
  try {
    const postsCollection = collection(db, 'baseNameFeed'); // 🎯 CZYTA Z NOWEJ KOLEKCJI
    const queryConstraints = [];
    
    // Sortowanie postów
    if (orderBy === 'newest') {
      queryConstraints.push(firestoreOrderBy('timestamp', 'desc'));
    } else {
      queryConstraints.push(firestoreOrderBy('timestamp', 'asc'));
    }
    
    // Ograniczenie liczby postów
    queryConstraints.push(firestoreLimit(limit));
    
    // Paginacja
    if (startAfter) {
      queryConstraints.push(firestoreStartAfter(startAfter));
    }
    
    const postsQuery = query(postsCollection, ...queryConstraints);
    const postsSnapshot = await getDocs(postsQuery);
    
    const posts: ExtendedPost[] = postsSnapshot.docs.map(mapPostDoc);

    const lastVisible = postsSnapshot.docs.length > 0 
      ? postsSnapshot.docs[postsSnapshot.docs.length - 1] 
      : null;

    return { posts, lastVisible };
  } catch (error) {
    console.error('Error fetching BaseName feed posts:', error);
    throw error;
  }
};

// Zapisz profil użytkownika
export const saveUserProfile = async (profile: { 
  walletAddress: string; 
  name: string;
  avatar?: string;
}): Promise<void> => {
  const userRef = doc(db, 'users', profile.walletAddress);
  
  // Sprawdź czy profil już istnieje
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    // Aktualizuj istniejący profil
    await updateDoc(userRef, {
      ...profile,
      lastActive: serverTimestamp(),
      lastUpdated: serverTimestamp()
    });
  } else {
    // Utwórz nowy profil
    await setDoc(userRef, {
      ...profile,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      postsCount: 0,
      likesReceived: 0,
      stats: {
        posts: 0,
        likes: 0,
        comments: 0
      }
    });
  }
};

// Dodaj komentarz do posta
export const addComment = async (postId: string, comment: {
  author: string;
  content: string;
  timestamp: number;
  likes: number;
  likedBy: string[];
  mentions: string[];
  txHash?: string | null;
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood' | 'arc' | 'solana';
  /**
   * ZWRACA ID UTWORZONEGO KOMENTARZA.
   *
   * Wczesniej bylo `Promise<void>`, wiec wolajacy nie mial jak poznac
   * identyfikatora i wstawial do listy komentarz z ID "temp-...". Skutek widzial
   * uzytkownik: swiezo dodanego komentarza NIE DALO SIE polubic ani usunac, bo
   * obie operacje szly pod dokument `comments/temp-123`, ktory nie istnieje -
   * i konczyly sie falszywym komunikatem o awarii plus pelnym odswiezeniem feedu.
   *
   * Zmiana jest CZYSTO DODAJACA: kto ignorowal wynik, dziala dalej bez zmian.
   */
}): Promise<string> => {
  // Pobierz nazwę autora komentarza
  const authorName = await getUserName(comment.author);
  
  // Dodaj komentarz do kolekcji comments
  const commentsRef = collection(db, 'comments');
  const commentDoc = await addDoc(commentsRef, {
    ...comment,
    authorName, // Dodaj nazwę autora do komentarza
    postId,
    timestamp: serverTimestamp(),
    likes: 0,
    likedBy: [],
    mentions: [],
    txHash: comment.txHash || null, // Dodaj hash transakcji
    network: comment.network || null, // Dodaj network komentarza
    onchain: comment.txHash ? true : false // Oznacz, czy komentarz jest na blockchainie
  });

  // Post dostaje TYLKO podbicie licznika. Wczesniej caly komentarz byl
  // doklejany do tablicy w dokumencie posta - dokument tyl z kazdym
  // komentarzem i kazdy odczyt feedu ciagnal pelna historie rozmow.
  // Tresc zyje w kolekcji `comments` (zapis wyzej); feed czyta licznik,
  // a sekcja komentarzy dociaga tresci przy rozwinieciu.
  const postRef = doc(db, 'posts', postId);
  const postDoc = await getDoc(postRef);

  if (postDoc.exists()) {
    const postData = postDoc.data();
    // Post z licznikiem dostaje ATOMOWY increment - dwa rownolegle komentarze
    // nie zgubia podbicia. Post sprzed licznikow (pole nie istnieje) dostaje
    // wartosc DOKLADNA z dlugosci tablicy legacy: migracja przy dotknieciu,
    // stare posty bez ruchu nie kosztuja ani jednego zapisu.
    await updateDoc(postRef, {
      commentsCount:
        typeof postData.commentsCount === 'number'
          ? increment(1)
          : (postData.comments || []).length + 1
    });

    // Aktualizuj statystyki użytkownika
    const userRef = doc(db, 'users', comment.author);
    await updateDoc(userRef, {
      'stats.comments': increment(1),
      lastActive: serverTimestamp()
    });
  }

  // Zwracamy ID nawet gdy post zniknal miedzy zapisem komentarza a odczytem -
  // dokument w kolekcji `comments` juz powstal i ma ten identyfikator.
  return commentDoc.id;
};

/**
 * Komentarze posta z kolekcji `comments` - dociagane DOPIERO przy rozwinieciu
 * sekcji komentarzy (PostList), nigdy dla calego feedu.
 *
 * Nowe komentarze zyja wylacznie tutaj (dokument posta niesie sam licznik),
 * stare bywaja tylko w tablicy posta - wolajacy SCALA oba zrodla po id.
 * Indeks (postId, timestamp desc) jest wdrozony, wiec zapytanie jest tanie;
 * wynik odwracamy do rosnacej chronologii, w ktorej rysuje sie watek.
 */
export const fetchCommentsForPost = async (postId: string): Promise<Comment[]> => {
  const snap = await getDocs(
    query(
      collection(db, 'comments'),
      where('postId', '==', postId),
      firestoreOrderBy('timestamp', 'desc'),
      firestoreLimit(200)
    )
  );
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        ...data,
        id: d.id,
        timestamp: toMillis(data.timestamp) || Date.now(),
        likes: data.likes || 0,
        likedBy: data.likedBy || [],
      } as Comment;
    })
    .reverse();
};

// Funkcja do pobierania profilu użytkownika
export const fetchUserProfile = async (address: string, options: { loadSocialLinks?: boolean } = {}): Promise<UserProfile | null> => {
  try {
    const { loadSocialLinks = false } = options;
    const userRef = doc(db, 'users', address);
    const userDoc = await getDoc(userRef);
    
    // 💰 OPTYMALIZACJA: Usunięto drogie zapytanie pobierające wszystkie posty
    // Teraz używamy zapisanej wartości postsCount która jest aktualizowana przy każdym nowym poście
    // Oszczędność: 2000+ Firebase reads dla 1000 użytkowników = ~$120-240/dzień
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        id: userDoc.id,
        name: data.name,
        avatar: data.avatar,
        postsCount: data.postsCount || 0, // 💡 Użyj zapisanej wartości zamiast liczenia na nowo
        likesReceived: data.likesReceived || 0,
        address: address,
        joinedAt: toMillis(data.joinedAt) || Date.now(),
        lastActive: toMillis(data.lastActive) || Date.now(),
        bio: data.bio,
        socialLinks: loadSocialLinks ? data.socialLinks || {
          twitter: '',
          farcaster: '',
          discord: ''
        } : undefined,
        stats: {
          posts: data.postsCount || 0, // 💡 Użyj zapisanej wartości
          likes: data.stats?.likes || 0,
          comments: data.stats?.comments || 0
        }
      };
    }
    
    // Profil tworzymy WYLACZNIE dla adresow EVM. Autor platnej odpowiedzi
    // z Solany ma adres base58 i zadnego konta w aplikacji; klikniecie w jego
    // nazwe zakladalo mu fantomowy dokument `users/<base58>` z punktami
    // i profilem EVM, ktory pompowal liczniki uzytkownikow (znalezisko
    // z przegladu 2026-09-23).
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return null;
    }

    // 🆕 PRZYWRÓCENIE ORYGINALNEJ FUNKCJONALNOŚCI: Automatyczne tworzenie konta w Firebase
    // Kiedy użytkownik po raz pierwszy łączy portfel, od razu tworzymy mu dokument w bazie
    console.log('🆕 Tworzę nowe konto użytkownika');
    
    const newUserProfile = {
      walletAddress: address,
      name: `${address.slice(0, 6)}...${address.slice(-4)}`,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      postsCount: 0,
      likesReceived: 0,
      stats: {
        posts: 0,
        likes: 0,
        comments: 0
      },
      socialLinks: {
        twitter: '',
        farcaster: '',
        discord: ''
      },
      // Dodaj podstawowe punkty BaseChatPoints
      baseChatPoints: {
        activityBonus: 0,
        likePoints: 0,
        postPoints: 0,
        baseNameBonus: 0,
        totalPoints: 0
      }
    };
    
    // Zapisz nowy profil do Firebase
    await setDoc(userRef, newUserProfile);

    
    // 🎉 UWAGA: Base Name i bonus 1000 punktów będą dodane automatycznie 
    // przez useEffect w basechat/page.tsx gdy baseName się załaduje
    
    // Zwróć profil w formacie zgodnym z interfejsem UserProfile
    // UWAGA: Zwracamy dane z właśnie utworzonego profilu w Firebase
    return {
      id: address,
      name: `${address.slice(0, 6)}...${address.slice(-4)}`,
      address: address,
      postsCount: 0,
      likesReceived: 0,
      joinedAt: Date.now(), // Użyj current timestamp jako reprezentację serverTimestamp
      lastActive: Date.now(),
      bio: undefined, // Nowi użytkownicy nie mają bio
      socialLinks: loadSocialLinks ? {
        twitter: '',
        farcaster: '',
        discord: ''
      } : undefined,
      stats: {
        posts: 0,
        likes: 0,
        comments: 0
      }
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

// Funkcja do pobierania nazwy użytkownika
export const getUserName = async (walletAddress: string): Promise<string> => {
  try {
    const userRef = doc(db, 'users', walletAddress);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.name || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
    }
    
    // 🔄 ZMIANA: Nie tworzymy już konta tutaj, bo to robi fetchUserProfile
    // Zwracamy tylko domyślną nazwę dla users których profil jeszcze nie został załadowany
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  } catch (error) {
    console.error('Error getting user name:', error);
    return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }
};

// Funkcja do aktualizacji nazwy użytkownika
export const updateUserName = async (walletAddress: string, newName: string): Promise<boolean> => {
  try {
    const userRef = doc(db, 'users', walletAddress);
    await updateDoc(userRef, {
      name: newName,
      lastActive: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Error updating user name:', error);
    return false;
  }
};

// Prosta funkcja do zapisywania nazwy profilowej
export const saveProfileName = async (address: string, name: string, suffix?: 'sphere' | 'camper' | 'celo' | 'world') => {
  try {
    const userRef = doc(db, 'usernames', address);
    const isBaseName = name.endsWith('.base.eth');
    const isCamper = name.endsWith('.camper');
    const isSphere = name.endsWith('.sphere');
    const isCelo = name.endsWith('.celo');
    const isWorld = name.endsWith('.world');
    
    // Sprawdź czy użytkownik już ma zapisaną nazwę
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const currentData = userDoc.data();
      // Nie nadpisuj BaseName zwykłą nazwą
      if (currentData.isBaseName && !isBaseName) {
        return true;
      }
    }
    
    await setDoc(userRef, {
      address,
      name,
      updatedAt: serverTimestamp(),
      isBaseName,
      isCamper,
      isSphere,
      isCelo,
      isWorld
    });
    
    // Zaktualizuj też profil użytkownika
    const profileRef = doc(db, 'users', address);
    await setDoc(profileRef, {
      name,
      lastUpdated: serverTimestamp()
    }, { merge: true });
    
    // Bonusy domenowe - jedna petla po tabeli zamiast pieciu takich samych ifow.
    for (const bonus of DOMAIN_BONUS_LIST) {
      if (name.endsWith(bonus.suffix) || suffix === bonus.key) {
        await addDomainBonusToUser(address, bonus);
      }
    }

    return true;
  } catch (error) {
    console.error('Error saving profile name:', error);
    return false;
  }
};

// Prosta funkcja do pobierania nazwy profilowej
export const getProfileName = async (address: string): Promise<string | null> => {
  try {
    const userRef = doc(db, 'usernames', address);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data().name || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting profile name:', error);
    return null;
  }
};

// Funkcja do edycji komentarza
export const editComment = async (postId: string, commentId: string, newContent: string) => {
  try {
    // Najpierw dokument w kolekcji `comments` - tam zyja wszystkie nowe
    // komentarze i wiekszosc starych. Tablica w poscie zostaje SPOJNA tylko
    // dla wpisow, ktore w niej sa (legacy); nowych nigdy do niej nie piszemy.
    const commentRef = doc(db, 'comments', commentId);
    const commentDoc = await getDoc(commentRef);

    if (commentDoc.exists()) {
      await updateDoc(commentRef, { content: newContent, lastEdited: serverTimestamp() });
    }

    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    if (!postDoc.exists()) {
      if (commentDoc.exists()) return true;
      throw new Error('Post not found');
    }

    const postData = postDoc.data();
    const comments = postData.comments || [];
    const commentIndex = comments.findIndex((c: any) => c.id === commentId);

    // Wpis w tablicy aktualizujemy tylko wtedy, gdy tam JEST - stary
    // komentarz sprzed kolekcji. Brak w obu miejscach to dopiero blad.
    if (commentIndex !== -1) {
      comments[commentIndex] = {
        ...comments[commentIndex],
        content: newContent,
        lastEdited: Date.now()
      };
      await updateDoc(postRef, { comments });
    } else if (!commentDoc.exists()) {
      throw new Error('Comment not found');
    }

    return true;
  } catch (error) {
    console.error('Error editing comment:', error);
    throw error;
  }
};

/**
 * Usuniecie platnej odpowiedzi przez serwer. Reguly Firestore nie pozwalaja
 * przegladarce skasowac dokumentu z `tipLamports` (inaczej kazdy zdjalby cudza
 * oplacona odpowiedz), wiec admin i autor posta ida przez trase, ktora sama
 * sprawdza sesje SIWE i rejestr kwitow. Rzuca z komunikatem trasy, zeby UI
 * pokazal powod odmowy zamiast ogolnego "nie udalo sie".
 */
const deletePaidReplyOnServer = async (commentId: string): Promise<void> => {
  let response: Response;
  try {
    response = await fetch(PAID_REPLY_MODERATION_PATH, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId }),
    });
  } catch {
    throw new Error('Could not reach the server to remove this paid reply. Check your connection and try again.');
  }
  let payload: { ok?: unknown; error?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok !== true) {
    const message = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error
      : `Removing the paid reply failed (HTTP ${response.status}).`;
    throw new Error(message);
  }
};

// Funkcja do usuwania komentarza - dodaję sprawdzenie uprawnień
export const deleteComment = async (postId: string, commentId: string, userId: string) => {
  try {

    // 1. Przygotuj batch do operacji atomowych
    const batch = writeBatch(db);

    // 2. Pobierz post i dokument komentarza z kolekcji - ROWNOLEGLE i ZAWSZE.
    // Dokument z kolekcji czytamy takze wtedy, gdy komentarz jest w tablicy
    // posta: tylko on mowi, czy to platna odpowiedz. Tablice zapisuje kazda
    // przegladarka, wiec wpis pod ID platnej odpowiedzi moze byc podrobka -
    // bez tego odczytu batch kasowalby oplacony dokument i padal na regulach.
    const postRef = doc(db, 'posts', postId);
    const commentRef = doc(db, 'comments', commentId);
    const [postDoc, commentDoc] = await Promise.all([getDoc(postRef), getDoc(commentRef)]);
    const collectionComment = commentDoc.exists() ? commentDoc.data() : null;

    // Platna odpowiedz: przegladarka nie ma prawa jej skasowac (reguly), wiec
    // decyzje o uprawnieniach (admin albo autor posta z rejestru kwitow) i samo
    // usuniecie robi serwer. Tu nie sprawdzamy autora komentarza - to adres
    // Solany, ktory nigdy nie bedzie rowny adresowi EVM z portfela.
    if (isPaidReplyData(collectionComment)) {
      await deletePaidReplyOnServer(commentId);
      return true;
    }

    if (!postDoc.exists()) {
      console.error(`Post ${postId} nie istnieje!`);
      throw new Error('Post not found');
    }

    const postData = postDoc.data();
    const comments = postData.comments || [];

    // Komentarz moze zyc w tablicy posta (legacy), w kolekcji `comments`
    // (wszystkie nowe) albo w obu. Do sprawdzenia uprawnien wystarczy
    // KTORAKOLWIEK kopia - ale gdy sa obie, liczy sie kopia z kolekcji:
    // wpis w tablicy pod cudzym ID moglby podstawic innego autora.
    const legacyComment = comments.find((c: any) => c.id === commentId);
    const commentToDelete = collectionComment ?? legacyComment ?? null;

    if (!commentToDelete) {
      throw new Error('Comment not found');
    }

    // Sprawdź uprawnienia - tylko autor komentarza lub admin mogą usuwać
    // (adresy bez wzgledu na wielkosc liter - patrz komentarz w deletePost)
    const isAdmin = userId.toLowerCase() === ADMIN_ADDRESS;
    const isAuthor = typeof commentToDelete.author === 'string'
      && commentToDelete.author.toLowerCase() === userId.toLowerCase();

    if (!isAdmin && !isAuthor) {
      throw new Error('Unauthorized to delete this comment');
    }

    // 3. Odpowiedzi zbieramy z OBU miejsc: tablica (legacy) + kolekcja (nowe).
    // Rownosc+rownosc nie wymaga indeksu zlozonego.
    const legacyReplies = comments.filter((c: any) => c.replyTo === commentId);
    let collectionReplyIds: string[] = [];
    try {
      const replySnap = await getDocs(
        query(collection(db, 'comments'), where('postId', '==', postId), where('replyTo', '==', commentId))
      );
      // Dokument z tipLamports nie jest prawdziwa odpowiedzia (serwer nie
      // zapisuje platnych odpowiedzi z replyTo), a przegladarka nie ma prawa
      // go skasowac - w batchu zablokowalby usuniecie tego komentarza.
      collectionReplyIds = replySnap.docs.filter((d) => !isPaidReplyData(d.data())).map((d) => d.id);
    } catch (error) {
      console.error('Błąd odczytu odpowiedzi z kolekcji comments:', error);
    }
    const replyIds = Array.from(
      new Set([...legacyReplies.map((r: any) => r.id), ...collectionReplyIds])
    ).filter(Boolean);

    // 4-5. Usuń główny komentarz i odpowiedzi z kolekcji comments.
    // Dokumenty kasujemy tylko dla odpowiedzi znalezionych W KOLEKCJI (maja
    // replyTo === ten komentarz). ID odpowiedzi z samej tablicy to wpisy
    // legacy bez dokumentu - albo podrobki: wpis z ID cudzej platnej
    // odpowiedzi wywracalby caly batch na regulach, a z ID zwyklego komentarza
    // skasowalby go przy okazji. Z tablicy znikaja i tak (krok 6-7).
    batch.delete(commentRef);
    for (const replyId of collectionReplyIds) {
      batch.delete(doc(db, 'comments', replyId));
    }

    // 6-7. Tablice w poscie przepisujemy tylko, gdy cokolwiek z niej znika -
    // dla nowych komentarzy (spoza tablicy) post dostaje sam licznik.
    const updatedComments = comments.filter(
      (c: any) => c.id !== commentId && !replyIds.includes(c.id)
    );
    const removedCount = 1 + replyIds.length;
    // Atomowy decrement, gdy pole istnieje - Math.max robic nie ma czym,
    // wiec przed ujemna wartoscia (podwojne usuniecie w wyscigu) chroni
    // clamp przy odczycie w mapPostDoc.
    const postUpdate: { [key: string]: any } = {
      commentsCount:
        typeof postData.commentsCount === 'number'
          ? increment(-removedCount)
          : Math.max(0, comments.length - removedCount),
    };
    if (updatedComments.length !== comments.length) {
      postUpdate.comments = updatedComments;
    }
    batch.update(postRef, postUpdate);

    // 8. Wykonaj wszystkie operacje atomowo
    await batch.commit();


    return true;
  } catch (error) {
    console.error('Error deleting comment:', error);
    throw error;
  }
};

/**
 * Przelaczenie lajka pod komentarzem.
 *
 * === TA SAMA PRZYCZYNA CO W toggleLike ===
 * Bylo `runTransaction`, a transakcje sa na tej bazie odrzucane
 * (RESOURCE_EXHAUSTED nawet dla transakcji, ktora nic nie zapisuje). Lajk pod
 * komentarzem po prostu nie dzialal. Pelna diagnoza przy `toggleLike` wyzej.
 *
 * === DLACZEGO TU JEST TRUDNIEJ NIZ PRZY POSCIE ===
 * Lajk posta da sie zrobic bez odczytu, bo `arrayUnion` / `arrayRemove` sa
 * idempotentne. Komentarz siedzi jako ELEMENT TABLICY w dokumencie posta,
 * a Firestore nie umie zaadresowac elementu tablicy - trzeba wczytac cala
 * tablice, podmienic jeden wpis i zapisac ja z powrotem. Odczyt jest wiec
 * nieusuwalny; usuwalna byla tylko transakcja wokol niego.
 *
 * `getDoc` (zwykly odczyt) dziala normalnie, wiec czytamy nim, a oba zapisy
 * wysylamy jednym `writeBatch`. Batch NIE JEST transakcja - nie sprawdza, czy
 * dane nie zmienily sie od odczytu - ale gwarantuje, ze dokument posta
 * i dokument komentarza zmienia sie razem albo wcale. Batche na tej bazie
 * dzialaja (chodzi po nich kasowanie komentarzy i przyznawanie bonusow).
 *
 * === CENA, KTORA PLACIMY SWIADOMIE ===
 * Zgubiona aktualizacja przy wyscigu: jesli dwie osoby lajkuja DWA ROZNE
 * komentarze pod TYM SAMYM postem w tej samej chwili, ta druga nadpisze cala
 * tablice wersja sprzed pierwszej i tamten lajk przepadnie. Transakcja by
 * tego pilnowala. Zamieniamy rzadka utrate jednego lajka na funkcje, ktora
 * w ogole dziala - przy dzisiejszym ruchu to nie jest bliska decyzja.
 */
export const toggleCommentLike = async (postId: string, commentId: string, userId: string) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const commentRef = doc(db, 'comments', commentId);

    // Oba odczyty rownolegle - sa niezalezne, a i tak czekamy na komplet.
    const [postDoc, commentDoc] = await Promise.all([getDoc(postRef), getDoc(commentRef)]);

    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }

    const postData = postDoc.data();
    const comments = [...(postData.comments || [])];

    // Komentarz moze byc w tablicy posta (legacy), w kolekcji (nowe) albo
    // w obu - lajk ma dzialac w kazdym z tych przypadkow. Bledem jest
    // dopiero brak OBU kopii.
    const commentIndex = comments.findIndex((c: any) => c.id === commentId);
    if (commentIndex === -1 && !commentDoc.exists()) {
      throw new Error('Comment not found');
    }

    const batch = writeBatch(db);

    // Stan "przed" bierzemy z tego zrodla, ktore komentarz MA - do zwrotki
    // dla UI (true = dodano lajka).
    let wasLiked = false;

    if (commentIndex !== -1) {
      const comment = comments[commentIndex];
      const likedBy = comment.likedBy || [];
      const isLiked = likedBy.includes(userId);
      wasLiked = isLiked;

      comments[commentIndex] = {
        ...comment,
        likes: Math.max(0, (comment.likes || 0) + (isLiked ? -1 : 1)),
        likedBy: isLiked
          ? likedBy.filter((id: string) => id !== userId)
          : [...likedBy, userId]
      };

      batch.update(postRef, {
        comments,
        lastUpdated: serverTimestamp()
      });
    }

    // Kolekcja `comments`: nowe komentarze zyja WYLACZNIE tutaj, starsze
    // bywaja tylko w tablicy na poscie. Brak dokumentu nie jest bledem.
    if (commentDoc.exists()) {
      const commentData = commentDoc.data();
      const commentLikedBy = commentData.likedBy || [];
      const isCommentLiked = commentLikedBy.includes(userId);
      if (commentIndex === -1) wasLiked = isCommentLiked;

      batch.update(commentRef, {
        likes: Math.max(0, (commentData.likes || 0) + (isCommentLiked ? -1 : 1)),
        likedBy: isCommentLiked
          ? commentLikedBy.filter((id: string) => id !== userId)
          : [...commentLikedBy, userId],
        lastUpdated: serverTimestamp()
      });
    }

    await batch.commit();

    return !wasLiked; // true = dodano lajka, false = usunieto
  } catch (error) {
    console.error('Error toggling comment like:', error);
    throw error;
  }
};

export const addCommentReply = async (postId: string, commentId: string, replyData: { 
  author: string, 
  content: string,
  txHash?: string | null,
  network?: 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood' | 'arc' | 'solana'
}) => {
  try {
    const postRef = doc(db, 'posts', postId);
    const parentRef = doc(db, 'comments', commentId);
    const [postDoc, parentDoc] = await Promise.all([getDoc(postRef), getDoc(parentRef)]);

    if (!postDoc.exists()) {
      throw new Error('Post not found');
    }

    const post = postDoc.data();
    const comments = post.comments || [];

    // Rodzic moze byc w tablicy posta (legacy) albo w kolekcji (nowe).
    const parentInArray = comments.some((c: any) => c.id === commentId);
    if (!parentInArray && !parentDoc.exists()) {
      throw new Error('Parent comment not found');
    }

    // Odpowiedz laduje w kolekcji `comments`, jak kazdy nowy komentarz -
    // wczesniej szla WYLACZNIE do tablicy posta z lokalnie zmyslonym id,
    // wiec tuczyl dokument i zyla poza jedynym zrodlem prawdy.
    const replyDoc = await addDoc(collection(db, 'comments'), {
      postId,
      author: replyData.author,
      content: replyData.content,
      timestamp: serverTimestamp(),
      likes: 0,
      likedBy: [],
      mentions: [],
      replyTo: commentId,
      txHash: replyData.txHash || null,
      network: replyData.network || null,
      onchain: replyData.txHash ? true : false
    });

    // Post dostaje tylko podbicie licznika - atomowe, gdy pole istnieje
    // (patrz addComment).
    await updateDoc(postRef, {
      commentsCount:
        typeof post.commentsCount === 'number' ? increment(1) : comments.length + 1,
      lastUpdated: serverTimestamp()
    });

    const newReply = {
      id: replyDoc.id,
      postId,
      author: replyData.author,
      content: replyData.content,
      timestamp: Date.now(),
      likes: 0,
      likedBy: [],
      mentions: [],
      replyTo: commentId,
      txHash: replyData.txHash || null,
      network: replyData.network,
      onchain: replyData.txHash ? true : false
    };

    return newReply;
  } catch (error) {
    console.error('Error adding reply:', error);
    throw error;
  }
};

// Usuń blokadę zmiany avatara dla admina
export const removeAvatarRestriction = async (address: string) => {
  if (address.toLowerCase() === ADMIN_ADDRESS) {
    const userRef = doc(db, 'users', address);
    await updateDoc(userRef, {
      lastImageUpdate: null
    });
  }
};

// Reset profilu admina
export const resetAdminProfile = async () => {
  const userRef = doc(db, 'users', ADMIN_ADDRESS);
  
  // Usuń stary dokument
  try {
    await deleteDoc(userRef);
  } catch (error) {
    console.error('Error deleting old profile:', error);
  }

  // Utwórz nowy dokument bez lastImageUpdate
  try {
    await setDoc(userRef, {
      address: ADMIN_ADDRESS,
      name: 'story91.base.eth',
      isAdmin: true,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp()
    });
  } catch (error) {
    console.error('Error creating new profile:', error);
  }
};

// Sprawdź czy użytkownik może zmienić avatar
export const canChangeAvatar = async (address: string): Promise<boolean> => {
  // Admin zawsze może zmienić avatar
  if (address.toLowerCase() === ADMIN_ADDRESS) {
    await resetAdminProfile(); // Reset profilu przy każdej próbie zmiany avatara
    return true;
  }

  const userRef = doc(db, 'users', address);
  const userDoc = await getDoc(userRef);
  const userData = userDoc.data();

  if (!userData?.lastImageUpdate) {
    return true;
  }

  const lastUpdate = userData.lastImageUpdate.toDate();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  return lastUpdate < oneMonthAgo;
};

// Zapisz nowy avatar
export const saveUserAvatar = async (address: string, avatarUrl: string) => {
  const userRef = doc(db, 'users', address);
  
  if (address.toLowerCase() === ADMIN_ADDRESS) {
    await updateDoc(userRef, {
      avatar: avatarUrl
    });
    return;
  }

  await updateDoc(userRef, {
    avatar: avatarUrl,
    lastImageUpdate: serverTimestamp()
  });
};

// Funkcja do odświeżania wszystkich postów
// ⚠️ OPTIMIZED VERSION - Works only on TOP 50 most active users for cost reduction
export const refreshTop50UsersOnly = async () => {
  try {
    console.log('🔥 Rozpoczynam odświeżanie danych dla TOP 50 najaktywniejszych użytkowników...');
    const batch = writeBatch(db);
    
    // Najpierw pobierz top 50 użytkowników
    const topUsers = await getTopActiveUsers(50);
    const topUserAddresses = topUsers.map(docSnapshot => docSnapshot.id);
    
    console.log(`📊 Znaleziono ${topUserAddresses.length} top użytkowników do przetworzenia`);
    
    // Pobierz tylko posty od top 50 użytkowników (używając where)
    const postsRef = collection(db, 'posts');
    const chunks = [];
    
    // Firestore ma limit 10 elementów w where('author', 'in', [...])
    for (let i = 0; i < topUserAddresses.length; i += 10) {
      const chunk = topUserAddresses.slice(i, i + 10);
      const chunkQuery = query(postsRef, where('author', 'in', chunk));
      chunks.push(getDocs(chunkQuery));
    }
    
    const allSnapshots = await Promise.all(chunks);
    const allPosts = allSnapshots.flatMap(snapshot => snapshot.docs);
    
    let processedPosts = 0;
    let updatedPosts = 0;
    
    // Mapa do śledzenia statystyk użytkowników
    const userStats: { [key: string]: { posts: number, likes: number, hasBaseName: boolean } } = {};
    
    console.log(`📝 Przetwarzanie ${allPosts.length} postów od top 50 użytkowników...`);
    
    // Przetwórz posty tylko od top użytkowników
    for (const postDoc of allPosts) {
      processedPosts++;
      const post = postDoc.data();
      const postRef = doc(db, 'posts', postDoc.id);
      
      // Sprawdź czy liczba lajków zgadza się z długością tablicy likedBy
      const likedBy = post.likedBy || [];
      const actualLikes = likedBy.length;
      
      // Jeśli liczba lajków się różni, zaktualizuj post
      if (post.likes !== actualLikes) {
        batch.update(postRef, {
          likes: actualLikes,
          lastUpdated: serverTimestamp()
        });
        updatedPosts++;
      }
      
      // Aktualizuj statystyki użytkownika
      if (!userStats[post.author]) {
        // ✅ FIREBASE OPTIMIZATION: Replace expensive hasBaseName() with simple string check
        // Check if author name ends with .base.eth (BaseName indicator)
        const authorName = post.authorName || post.author;
        const userHasBaseName = authorName.endsWith('.base.eth');
        userStats[post.author] = { posts: 0, likes: 0, hasBaseName: userHasBaseName };
      }
      userStats[post.author].posts++;
      userStats[post.author].likes += actualLikes;
    }
    
    // Punkty referralowe czytamy JEDNYM zapytaniem na 30 uzytkownikow.
    // Wczesniej w tej petli stalo `await getDoc(userRef)` - 50 osobnych
    // odczytow ustawionych szeregowo, jeden po drugim.
    const usersById = await fetchDocsByIds('users', Object.keys(userStats));

    // Aktualizuj statystyki użytkowników (uwzględnij BaseName i referral)
    for (const [userId, stats] of Object.entries(userStats)) {
      const userRef = doc(db, 'users', userId);
      const baseNameBonus = stats.hasBaseName ? 1000 : 0;
      const existingReferralPoints = Number(usersById.get(userId)?.baseChatPoints?.referralPoints || 0);

      batch.update(userRef, {
        postsCount: stats.posts,
        likesReceived: stats.likes,
        lastCalculated: serverTimestamp(),
        'stats.posts': stats.posts,
        'stats.likes': stats.likes,
        'stats.hasBaseName': stats.hasBaseName,
        'stats.baseNameBonus': baseNameBonus,
        'stats.points': Math.round((stats.posts * 5 + stats.likes) * 1.25 + baseNameBonus + existingReferralPoints),
        'baseChatPoints.postPoints': stats.posts * 5,
        'baseChatPoints.likePoints': stats.likes,
        'baseChatPoints.activityBonus': Math.round(((stats.posts * 5) + stats.likes) * 0.25),
        'baseChatPoints.baseNameBonus': baseNameBonus,
        'baseChatPoints.referralPoints': existingReferralPoints,
        'baseChatPoints.totalPoints': Math.round(((stats.posts * 5) + stats.likes) * 1.25 + baseNameBonus + existingReferralPoints),
        'baseChatPoints.lastUpdated': serverTimestamp()
      });
    }
    
    // Wykonaj wszystkie aktualizacje
    await batch.commit();
    
    console.log(`✅ Zakończono odświeżanie danych TOP 50 użytkowników:
    - Przetworzono postów: ${processedPosts}
    - Zaktualizowano postów: ${updatedPosts}
    - Zaktualizowano użytkowników: ${Object.keys(userStats).length}
    - Oszczędność: ~95% mniej odczytów Firebase!`);
    
    return {
      success: true,
      processedPosts,
      updatedPosts,
      updatedUsers: Object.keys(userStats).length,
      optimized: true,
      message: 'Przetworzono tylko TOP 50 użytkowników dla redukcji kosztów'
    };
  } catch (error) {
    console.error('❌ Błąd podczas odświeżania TOP 50 użytkowników:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas odświeżania TOP 50 użytkowników'
    };
  }
};

// Original function kept for emergency use only (VERY EXPENSIVE!)
export const refreshAllPosts = async () => {
  console.warn('⚠️ WARNING: refreshAllPosts() używa WSZYSTKICH postów - bardzo kosztowne!');
  console.warn('💡 Użyj refreshTop50UsersOnly() zamiast tego dla oszczędności');
  
  // Redirect to optimized version for cost reduction
  return await refreshTop50UsersOnly();
};

// Interface for authorized quote
export interface AuthorizedQuote {
  id: string;
  content: string;
  submittedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: any;
  category: string;
  submitterName?: string;
  isOwnQuote?: boolean;
}

// Submit a quote for authorization
export const submitQuoteForAuthorization = async (quote: {
  content: string;
  submittedBy: string;
  category: string;
  isOwnQuote?: boolean;
}): Promise<string> => {
  try {
    const quoteData = {
      ...quote,
      status: 'pending',
      timestamp: serverTimestamp(),
      isOwnQuote: quote.isOwnQuote || false
    };

    const docRef = await addDoc(collection(db, 'authorizedQuotes'), quoteData);
    return docRef.id;
  } catch (error) {
    console.error('Error submitting quote:', error);
    throw error;
  }
};

// Get pending quotes (admin only)
export const getPendingQuotes = async (): Promise<AuthorizedQuote[]> => {
  try {
    const quotesRef = collection(db, 'authorizedQuotes');
    const q = query(
      quotesRef,
      where('status', '==', 'pending'),
      firestoreOrderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AuthorizedQuote));
  } catch (error) {
    console.error('Error getting pending quotes:', error);
    throw error;
  }
};

// Update quote status (admin only)
export const updateQuoteStatus = async (
  quoteId: string, 
  status: 'approved' | 'rejected'
): Promise<void> => {
  try {
    const quoteRef = doc(db, 'authorizedQuotes', quoteId);
    await updateDoc(quoteRef, {
      status,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating quote status:', error);
    throw error;
  }
};

// Get approved quotes by category
export const getApprovedQuotes = async (category: string): Promise<AuthorizedQuote[]> => {
  try {
    const quotesRef = collection(db, 'authorizedQuotes');
    const q = query(
      quotesRef,
      where('status', '==', 'approved'),
      where('category', '==', category),
      firestoreOrderBy('timestamp', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as AuthorizedQuote));
  } catch (error) {
    console.error('Error getting approved quotes:', error);
    throw error;
  }
};

// Funkcja do usuwania bonusu za BaseName dla wszystkich użytkowników
export const removeBaseNameBonus = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam usuwanie bonusu za BaseName dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isBaseName: true
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    
    let updatedUsers = 0;
    const batch = writeBatch(db);
    const batchSize = 500; // Firestore ma limit 500 operacji w jednym batchu
    let batchCount = 0;
    let currentBatch = batch;
    
    // Przetwórz każdego użytkownika z BaseName
    for (const usernameDoc of baseNameSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Pobierz dane użytkownika z kolekcji users
      const userRef = doc(db, 'users', userAddress);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Pobierz aktualną strukturę baseChatPoints
        if (userData.baseChatPoints) {
          const baseChatPoints = { ...userData.baseChatPoints };
          
          // Usuń baseNameBonus
          delete baseChatPoints.baseNameBonus;
          
          // Przelicz totalPoints
          const postPoints = baseChatPoints.postPoints || 0;
          const likePoints = baseChatPoints.likePoints || 0;
          const activityBonus = baseChatPoints.activityBonus || 0;
          
          // Suma wszystkich punktów bez baseNameBonus
          baseChatPoints.totalPoints = postPoints + likePoints + activityBonus;
          
          // Zaktualizuj dokument użytkownika
          currentBatch.update(userRef, {
            baseChatPoints: baseChatPoints,
            lastUpdated: serverTimestamp()
          });
          
          updatedUsers++;
          batchCount++;
          
          // Jeśli osiągnęliśmy limit batcha, wykonaj go i utwórz nowy
          if (batchCount >= batchSize) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            batchCount = 0;
            console.log(`Zaktualizowano ${updatedUsers} użytkowników. Tworzę nowy batch...`);
          }
        }
      }
    }
    
    // Wykonaj ostatni batch, jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    console.log(`Zakończono usuwanie bonusu za BaseName:
    - Zaktualizowano użytkowników: ${updatedUsers}`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas usuwania bonusu za BaseName:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas usuwania bonusu za BaseName'
    };
  }
};

// Funkcja do aktualizacji daty dołączenia dla wszystkich użytkowników
export const updateAllUserJoinDates = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam aktualizację daty dołączenia dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    let updatedUsers = 0;
    const batch = writeBatch(db);
    const batchSize = 500; // Firestore ma limit 500 operacji w jednym batchu
    let batchCount = 0;
    let currentBatch = batch;
    
    // Przetwórz każdego użytkownika
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userAddress = userDoc.id;
      
      // Sprawdź czy użytkownik ma datę dołączenia
      if (!userData.joinedAt) {
        // Ustaw datę dołączenia na aktualny czas
        const userRef = doc(db, 'users', userAddress);
        currentBatch.update(userRef, {
          joinedAt: serverTimestamp()
        });
        
        updatedUsers++;
        batchCount++;
        
        // Jeśli osiągnęliśmy limit batcha, wykonaj go i utwórz nowy
        if (batchCount >= batchSize) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          batchCount = 0;
          console.log(`Zaktualizowano ${updatedUsers} użytkowników. Tworzę nowy batch...`);
        }
      }
    }
    
    // Wykonaj ostatni batch, jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    console.log(`Zakończono aktualizację daty dołączenia:
    - Zaktualizowano użytkowników: ${updatedUsers}`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji daty dołączenia:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas aktualizacji daty dołączenia'
    };
  }
};

// Funkcja do aktualizacji bonusu za BaseName dla wszystkich użytkowników
export const updateBaseNameBonus = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam aktualizację bonusu za BaseName dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników z kolekcji usernames, którzy mają isBaseName: true
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    
    let updatedUsers = 0;
    const batch = writeBatch(db);
    const batchSize = 500; // Firestore ma limit 500 operacji w jednym batchu
    let batchCount = 0;
    let currentBatch = batch;
    
    // Przetwórz każdego użytkownika z BaseName
    for (const usernameDoc of baseNameSnapshot.docs) {
      const userAddress = usernameDoc.id;
      
      // Pobierz dane użytkownika z kolekcji users
      const userRef = doc(db, 'users', userAddress);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Pobierz aktualną strukturę baseChatPoints lub utwórz nową
        const baseChatPoints = userData.baseChatPoints || {
          activityBonus: 0,
          likePoints: 0,
          postPoints: 0,
          totalPoints: 0
        };
        
        // Dodaj baseNameBonus z wartością 1000
        baseChatPoints.baseNameBonus = 1000;
        
        // Przelicz totalPoints
        const postPoints = baseChatPoints.postPoints || 0;
        const likePoints = baseChatPoints.likePoints || 0;
        const activityBonus = baseChatPoints.activityBonus || 0;
        const baseNameBonus = baseChatPoints.baseNameBonus || 0;
        
        // Suma wszystkich punktów
        baseChatPoints.totalPoints = postPoints + likePoints + activityBonus + baseNameBonus;
        
        // Zaktualizuj dokument użytkownika
        currentBatch.update(userRef, {
          baseChatPoints: baseChatPoints,
          lastUpdated: serverTimestamp()
        });
        
        updatedUsers++;
        batchCount++;
        
        // Jeśli osiągnęliśmy limit batcha, wykonaj go i utwórz nowy
        if (batchCount >= batchSize) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          batchCount = 0;
          console.log(`Zaktualizowano ${updatedUsers} użytkowników. Tworzę nowy batch...`);
        }
      }
    }
    
    // Wykonaj ostatni batch, jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    console.log(`Zakończono aktualizację bonusu za BaseName:
    - Zaktualizowano użytkowników: ${updatedUsers}`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji bonusu za BaseName:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas aktualizacji bonusu za BaseName'
    };
  }
};

// Funkcja naprawiająca strukturę baseChatPoints dla wszystkich użytkowników - wersja radykalna
export const fixBaseChatPointsRadical = async (): Promise<{success: boolean, updatedUsers: number, error?: string}> => {
  try {
    console.log('Rozpoczynam radykalną naprawę struktury baseChatPoints dla wszystkich użytkowników...');
    
    // Pobierz wszystkich użytkowników
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    let updatedUsers = 0;
    const batch = writeBatch(db);
    const batchSize = 500; // Firestore ma limit 500 operacji w jednym batchu
    let batchCount = 0;
    let currentBatch = batch;
    
    // Przetwórz każdego użytkownika
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userAddress = userDoc.id;
      
      // ✅ FIREBASE OPTIMIZATION: Replace expensive hasBaseName() with simple check
      // Check if user has BaseName by looking at their stored name
      const userName = userData.name || '';
      const hasBaseNameValue = userName.endsWith('.base.eth');
      
      // Oblicz punkty na podstawie danych użytkownika
      const likePoints = userData.likesReceived || 0;
      const postPoints = (userData.postsCount || 0) * 5;
      const activityBonus = Math.round((likePoints + postPoints) * 0.25); // 25% bonus za aktywność
      
      // Utwórz nową strukturę baseChatPoints
      const newBaseChatPoints: {
        likePoints: number;
        postPoints: number;
        activityBonus: number;
        totalPoints: number;
        baseNameBonus?: number;
      } = {
        likePoints: likePoints,
        postPoints: postPoints,
        activityBonus: activityBonus,
        totalPoints: likePoints + postPoints + activityBonus
      };
      
      // Dodaj baseNameBonus, jeśli użytkownik ma BaseName
      if (hasBaseNameValue) {
        newBaseChatPoints.baseNameBonus = 1000;
        newBaseChatPoints.totalPoints += 1000;
      }
      
      // Zaktualizuj dokument użytkownika
      currentBatch.update(doc(db, 'users', userAddress), {
        baseChatPoints: newBaseChatPoints,
        lastUpdated: serverTimestamp()
      });
      
      updatedUsers++;
      batchCount++;
      
      // Jeśli osiągnęliśmy limit batcha, wykonaj go i utwórz nowy
      if (batchCount >= batchSize) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        batchCount = 0;
        console.log(`Zaktualizowano ${updatedUsers} użytkowników. Tworzę nowy batch...`);
      }
    }
    
    // Wykonaj ostatni batch, jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    console.log(`Zakończono radykalną naprawę struktury baseChatPoints:
    - Zaktualizowano ${updatedUsers} użytkowników`);
    
    return {
      success: true,
      updatedUsers
    };
  } catch (error) {
    console.error('Błąd podczas radykalnej naprawy struktury baseChatPoints:', error);
    return {
      success: false,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas radykalnej naprawy struktury baseChatPoints'
    };
  }
};

// 🔐 ADMIN ONLY: Funkcja do pobierania globalnych statystyk REALTIME (bez cache!)
export const getGlobalStatsRealTime = async () => {
  try {
    console.log('🔐 ADMIN: Fetching REAL-TIME Firebase stats (no cache)...');
    
    // Pobierz liczbę użytkowników - BEZPOŚREDNIO z Firebase
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const userCount = usersSnapshot.size;

    // Pobierz posty - BEZPOŚREDNIO z Firebase  
    const postsSnapshot = await getDocs(collection(db, 'posts'));
    const postsCount = postsSnapshot.size;

    // Oblicz łączną liczbę like'ów i komentarzy - BEZPOŚREDNIO z Firebase
    let totalLikes = 0;
    let totalComments = 0;
    
    for (const doc of postsSnapshot.docs) {
      const postData = doc.data();
      // Dodaj like'i
      if (postData.likes) {
        totalLikes += postData.likes;
      }
      
      // Dodaj komentarze - licznik przed tablica: pusta tablica jest truthy,
      // a nowe komentarze zyja tylko w kolekcji, wiec stara kolejnosc
      // pomijala caly ruch po wprowadzeniu licznikow.
      if (typeof postData.commentsCount === 'number') {
        totalComments += Math.max(0, postData.commentsCount);
      } else if (postData.comments && Array.isArray(postData.comments)) {
        totalComments += postData.comments.length;
      }
    }

    // Oblicz rzeczywistą liczbę transakcji
    let transactionsCount = postsCount + totalComments;
    transactionsCount = Math.floor(transactionsCount * 1.1);
    
    const statsData = {
      userCount,
      postsCount,
      transactionsCount,
      likesCount: totalLikes,
      commentsCount: totalComments,
      lastUpdated: new Date().toISOString(),
      dataSource: 'firebase-realtime',
      adminAccess: true
    };
    
    console.log(`🔐 ADMIN: Real-time Firebase stats:`, statsData);
    console.log(`💰 Cost: ~$${((statsData.userCount + statsData.postsCount) * 0.00006).toFixed(2)} for this request`);
    
    return statsData;
    
  } catch (error) {
    console.error('❌ ADMIN Error fetching real-time stats:', error);
    throw error;
  }
};

// 🚀 ULTRA-OPTIMIZED: Inkrementalne pobieranie statystyk (TYLKO nowe dane!)
export const getGlobalStatsIncremental = async (forceFullRefresh: boolean = false): Promise<any> => {
  try {
    const cacheKey = 'adminGlobalStatsCache';
    const timestampKey = 'adminGlobalStatsTimestamp';
    
    // Pobierz cache i timestamp ostatniego pobrania
    const cachedData = localStorage.getItem(cacheKey);
    const lastFetchTime = localStorage.getItem(timestampKey);
    
    let existingStats = null;
    let lastUpdateTimestamp = null;
    
    if (cachedData && lastFetchTime && !forceFullRefresh) {
      existingStats = JSON.parse(cachedData);
      lastUpdateTimestamp = new Date(lastFetchTime);
      console.log(`📋 ADMIN: Found cached data from ${lastUpdateTimestamp.toLocaleString()}`);
    }
    
    if (!existingStats || forceFullRefresh) {
      console.log('🔄 ADMIN: Performing FULL stats fetch (first time or forced refresh)...');
      
      // Pełne pobranie danych
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const postsSnapshot = await getDocs(collection(db, 'posts'));
      
      let totalLikes = 0;
      let totalComments = 0;
      
      for (const doc of postsSnapshot.docs) {
        const postData = doc.data();
        if (postData.likes) {
          totalLikes += postData.likes;
        }
        
        // Licznik przed tablica - jak w getGlobalStatsRealTime.
        if (typeof postData.commentsCount === 'number') {
          totalComments += Math.max(0, postData.commentsCount);
        } else if (postData.comments && Array.isArray(postData.comments)) {
          totalComments += postData.comments.length;
        }
      }
      
      const fullStats = {
        userCount: usersSnapshot.size,
        postsCount: postsSnapshot.size,
        likesCount: totalLikes,
        commentsCount: totalComments,
        transactionsCount: Math.floor((postsSnapshot.size + totalComments) * 1.1),
        lastUpdated: new Date().toISOString(),
        dataSource: 'firebase-full-fetch',
        adminAccess: true
      };
      
      // Zapisz do cache
      localStorage.setItem(cacheKey, JSON.stringify(fullStats));
      localStorage.setItem(timestampKey, fullStats.lastUpdated);
      
      console.log(`✅ ADMIN: Full fetch completed - ${fullStats.userCount} users, ${fullStats.postsCount} posts`);
      console.log(`💰 Cost: ~$${((fullStats.userCount + fullStats.postsCount) * 0.00006).toFixed(2)} for full fetch`);
      
      return fullStats;
    }
    
    // ⚡ INCREMENTAL UPDATE: Pobierz tylko nowe dane od ostatniego update
    console.log(`⚡ ADMIN: Performing INCREMENTAL update since ${lastUpdateTimestamp?.toLocaleString()}`);
    
    // Pobierz nowych użytkowników (joinedAt > lastUpdateTimestamp)
    const newUsersQuery = query(
      collection(db, 'users'),
      where('joinedAt', '>', lastUpdateTimestamp),
      firestoreOrderBy('joinedAt', 'desc')
    );
    const newUsersSnapshot = await getDocs(newUsersQuery);
    
    // Pobierz nowe posty (timestamp > lastUpdateTimestamp)  
    const newPostsQuery = query(
      collection(db, 'posts'),
      where('timestamp', '>', lastUpdateTimestamp),
      firestoreOrderBy('timestamp', 'desc')
    );
    const newPostsSnapshot = await getDocs(newPostsQuery);
    
    // Oblicz nowe like'i i komentarze z nowych postów
    let newLikes = 0;
    let newComments = 0;
    
    for (const doc of newPostsSnapshot.docs) {
      const postData = doc.data();
      if (postData.likes) {
        newLikes += postData.likes;
      }
      
      if (postData.comments && Array.isArray(postData.comments)) {
        newComments += postData.comments.length;
      } else if (postData.commentsCount) {
        newComments += postData.commentsCount;
      }
    }
    
    // Połącz stare dane z nowymi
    const incrementalStats = {
      userCount: existingStats.userCount + newUsersSnapshot.size,
      postsCount: existingStats.postsCount + newPostsSnapshot.size,
      likesCount: existingStats.likesCount + newLikes,
      commentsCount: existingStats.commentsCount + newComments,
      transactionsCount: Math.floor((existingStats.postsCount + newPostsSnapshot.size + existingStats.commentsCount + newComments) * 1.1),
      lastUpdated: new Date().toISOString(),
      dataSource: 'firebase-incremental',
      adminAccess: true,
      deltaInfo: {
        newUsers: newUsersSnapshot.size,
        newPosts: newPostsSnapshot.size,
        newLikes: newLikes,
        newComments: newComments,
        incrementalSince: lastUpdateTimestamp?.toISOString()
      }
    };
    
    // Zapisz zaktualizowane dane do cache
    localStorage.setItem(cacheKey, JSON.stringify(incrementalStats));
    localStorage.setItem(timestampKey, incrementalStats.lastUpdated);
    
    const totalReads = newUsersSnapshot.size + newPostsSnapshot.size;
    console.log(`⚡ ADMIN: Incremental update completed:`);
    console.log(`  📊 New data: +${newUsersSnapshot.size} users, +${newPostsSnapshot.size} posts`);
    console.log(`  📈 Current totals: ${incrementalStats.userCount} users, ${incrementalStats.postsCount} posts`);
    console.log(`  💰 Cost: ~$${(totalReads * 0.00006).toFixed(4)} (${totalReads} reads vs thousands with full fetch)`);
    console.log(`  🎯 Savings: ~${((existingStats.userCount + existingStats.postsCount - totalReads) * 0.00006).toFixed(2)}$ per refresh`);
    
    return incrementalStats;
    
  } catch (error) {
    console.error('❌ ADMIN Error in incremental stats fetch:', error);

    // Fallback na pelne pobranie - ale TYLKO gdy padla sciezka inkrementalna.
    // Wczesniej stalo tu bezwarunkowe `getGlobalStatsIncremental(true)`, wiec
    // gdy padalo samo `getDocs` (offline, brak uprawnien), funkcja wolala sama
    // siebie z tym samym argumentem w nieskonczonosc.
    if (forceFullRefresh) throw error;

    console.log('🔄 Falling back to full fetch due to error...');
    return await getGlobalStatsIncremental(true);
  }
};

/**
 * Globalne statystyki platformy (panel admina).
 *
 * @throws gdy odczyt sie nie powiedzie - wolajacy MUSI to odroznic od wyniku.
 *
 * === TU BYLY LICZBY WZIETE Z POWIETRZA ===
 * `catch` zwracal `{ userCount: 41547, postsCount: 39660, transactionsCount:
 * 4950, likesCount: 9121, commentsCount: 2101 }`. To nie byla nawet awaria
 * udajaca zero - to byla awaria udajaca KONKRETNY, wiarygodnie wygladajacy
 * pomiar, ktorego nikt nigdy nie zmierzyl. Panel animowal te liczby licznikiem
 * i wpisywal date "ostatniej aktualizacji", wiec nie do odroznienia od prawdy.
 * Wywolujacy (app/admin/page.tsx) ma juz `catch`, ktory ustawia `null` i nie
 * pokazuje niczego.
 */
export const getGlobalStats = async () => {
  try {
    // Create unique cache key per user session if possible, otherwise global
    const userAddress = typeof window !== 'undefined' ? 
      localStorage.getItem('userAddress') || 'anonymous' : 'anonymous';
    const cacheKey = `globalStats_full_${userAddress}`;
    const cacheTimestampKey = `globalStatsTime_full_${userAddress}`;
    
    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheTimestampKey);
    
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000; // 12 hours
    
    // Use cache if exists and is fresh (12h)
    if (cached && cacheTime && (now - parseInt(cacheTime)) < twelveHours) {
      const stats = JSON.parse(cached);
      console.log('📋 Using cached FULL global stats (12h cache per user)');
      return stats;
    }
    
    console.log('🔄 Fetching FULL global stats (12h cache expired for user)...');
    
    // Pobierz liczbę użytkowników - ORYGINALNA METODA
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const userCount = usersSnapshot.size;

    // Pobierz posty - ORYGINALNA METODA  
    const postsSnapshot = await getDocs(collection(db, 'posts'));
    const postsCount = postsSnapshot.size;

    // Oblicz łączną liczbę like'ów i komentarzy - ORYGINALNA METODA
    let totalLikes = 0;
    let totalComments = 0;
    
    for (const doc of postsSnapshot.docs) {
      const postData = doc.data();
      // Dodaj like'i
      if (postData.likes) {
        totalLikes += postData.likes;
      }
      
      // Dodaj komentarze - licznik przed tablica: pusta tablica jest truthy,
      // a nowe komentarze zyja tylko w kolekcji, wiec stara kolejnosc
      // pomijala caly ruch po wprowadzeniu licznikow.
      if (typeof postData.commentsCount === 'number') {
        totalComments += Math.max(0, postData.commentsCount);
      } else if (postData.comments && Array.isArray(postData.comments)) {
        totalComments += postData.comments.length;
      }
    }

    // Oblicz szacowaną liczbę transakcji
    let transactionsCount = postsCount + totalComments;
    transactionsCount = Math.floor(transactionsCount * 1.1);
    
    const statsData = {
      userCount,
      postsCount,
      transactionsCount,
      likesCount: totalLikes,
      commentsCount: totalComments
    };
    
    // Save to cache with timestamp (12h cache per user)
    localStorage.setItem(cacheKey, JSON.stringify(statsData));
    localStorage.setItem(cacheTimestampKey, now.toString());
    
    console.log(`✅ FULL global stats updated with 12h cache for user: ${userAddress}`);
    return statsData;
    
  } catch (error) {
    console.error('Error fetching global stats:', error);
    // Zadnych "fallback values". Niezmierzonej liczby sie nie wymysla.
    throw error;
  }
};

// Interfejsy rozszerzające bazowe typy
interface ExtendedPost extends Post {
  pollId?: string;
  lastEdited?: any;
  isPinned?: boolean;
  pinnedAt?: any;
  pinnedBy?: string;
  isPaidPin?: boolean;
  paidPinExpiresAt?: any;
}



// --- MySphere Social Media Tracking Functions ---

interface MySphereUserSocialConnections {
  address: string;
  connectedPlatforms: string[];
  lastUpdated: any;
  firstConnected: any;
  connectionHistory: {
    platform: string;
    connectedAt: any;
    disconnectedAt?: any;
  }[];
}

// Zapisz połączenia social media użytkownika w Firebase
export const saveMySphereUserConnections = async (
  address: string, 
  connectedPlatforms: string[]
): Promise<void> => {
  try {
    const userSocialRef = doc(db, 'mySphereUserSocials', address);
    const userSocialDoc = await getDoc(userSocialRef);
    
    const now = serverTimestamp();
    
    if (userSocialDoc.exists()) {
      const existingData = userSocialDoc.data() as MySphereUserSocialConnections;
      const previousPlatforms = existingData.connectedPlatforms || [];
      
      // Sprawdź które platformy zostały dodane lub usunięte
      const newPlatforms = connectedPlatforms.filter(p => !previousPlatforms.includes(p));
      const removedPlatforms = previousPlatforms.filter(p => !connectedPlatforms.includes(p));
      
      // Utwórz historię zmian
      const connectionHistory = [...(existingData.connectionHistory || [])];
      
      // Dodaj nowe połączenia do historii
      const currentTime = new Date();
      newPlatforms.forEach(platform => {
        connectionHistory.push({
          platform,
          connectedAt: currentTime
        });
      });
      
      // Dodaj rozłączenia do historii
      removedPlatforms.forEach(platform => {
        const lastConnection = connectionHistory
          .filter(h => h.platform === platform && !h.disconnectedAt)
          .pop();
        if (lastConnection) {
          lastConnection.disconnectedAt = currentTime;
        }
      });
      
      // Zaktualizuj dokument
      await updateDoc(userSocialRef, {
        connectedPlatforms,
        lastUpdated: now,
        connectionHistory
      });
    } else {
      // Utwórz nowy dokument
      const currentTime = new Date();
      const connectionHistory = connectedPlatforms.map(platform => ({
        platform,
        connectedAt: currentTime
      }));
      
      await setDoc(userSocialRef, {
        address,
        connectedPlatforms,
        lastUpdated: now,
        firstConnected: now,
        connectionHistory
      });
    }
    
    console.log('✅ Zapisano połączenia social media:', connectedPlatforms.length);
  } catch (error) {
    console.error('❌ Błąd podczas zapisywania połączeń social media:', error);
    throw error;
  }
};

// Pobierz połączenia social media użytkownika z Firebase
export const getMySphereUserConnections = async (
  address: string
): Promise<MySphereUserSocialConnections | null> => {
  try {
    const userSocialRef = doc(db, 'mySphereUserSocials', address);
    const userSocialDoc = await getDoc(userSocialRef);
    
    if (userSocialDoc.exists()) {
      return userSocialDoc.data() as MySphereUserSocialConnections;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Błąd podczas pobierania połączeń social media:', error);
    return null;
  }
};

// Pobierz globalne statystyki MySphere z Firebase
export const getMySphereGlobalStats = async () => {
  try {
    // Pobierz wszystkich użytkowników z połączeniami social media
    const userSocialsRef = collection(db, 'mySphereUserSocials');
    const userSocialsSnapshot = await getDocs(userSocialsRef);
    
    const totalUsers = userSocialsSnapshot.size;
    
    // Zlicz połączenia per platforma
    const socialMediaConnections = {
      twitter: 0,
      discord: 0,
      spotify: 0,
      tiktok: 0,
      telegram: 0
    };
    
    // Zlicz dystrybucję połączeń
    const connectionDistribution = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0
    };
    
    let totalConnections = 0;
    
    userSocialsSnapshot.forEach(doc => {
      const userData = doc.data() as MySphereUserSocialConnections;
      const connectionCount = userData.connectedPlatforms?.length || 0;
      totalConnections += connectionCount;
      
      // Zlicz dystrybucję
      if (connectionCount >= 0 && connectionCount <= 5) {
        connectionDistribution[connectionCount as keyof typeof connectionDistribution]++;
      }
      
      // Zlicz per platforma
      userData.connectedPlatforms?.forEach(platform => {
        if (platform in socialMediaConnections) {
          socialMediaConnections[platform as keyof typeof socialMediaConnections]++;
        }
      });
    });
    
    const fullyConnectedUsers = connectionDistribution[5];
    const averageConnectionsPerUser = totalUsers > 0 ? (totalConnections / totalUsers) : 0;
    
    // Przygotuj dane dla wykresów
    const platformChartData = [
      { name: 'Twitter', value: socialMediaConnections.twitter, color: '#1DA1F2', icon: '🐦' },
      { name: 'Discord', value: socialMediaConnections.discord, color: '#7289DA', icon: '🎮' },
      { name: 'Spotify', value: socialMediaConnections.spotify, color: '#1DB954', icon: '🎵' },
      { name: 'TikTok', value: socialMediaConnections.tiktok, color: '#FF0050', icon: '🎬' },
      { name: 'Telegram', value: socialMediaConnections.telegram, color: '#0088CC', icon: '✈️' }
    ];
    
    const distributionChartData = [
      { connections: '0', users: connectionDistribution[0], percentage: totalUsers > 0 ? ((connectionDistribution[0] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '1', users: connectionDistribution[1], percentage: totalUsers > 0 ? ((connectionDistribution[1] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '2', users: connectionDistribution[2], percentage: totalUsers > 0 ? ((connectionDistribution[2] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '3', users: connectionDistribution[3], percentage: totalUsers > 0 ? ((connectionDistribution[3] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '4', users: connectionDistribution[4], percentage: totalUsers > 0 ? ((connectionDistribution[4] / totalUsers) * 100).toFixed(1) : '0' },
      { connections: '5', users: connectionDistribution[5], percentage: totalUsers > 0 ? ((connectionDistribution[5] / totalUsers) * 100).toFixed(1) : '0' }
    ];
    
    // Wygeneruj rzeczywiste dane trendu wzrostu (ostatnie 7 dni) na podstawie historii połączeń
    const growthTrendData = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateString = date.toISOString().split('T')[0];
      
      // Zlicz rzeczywiste połączenia dla każdego dnia
      let dailyStats = {
        date: dateString,
        users: 0,
        twitter: 0,
        discord: 0,
        spotify: 0,
        tiktok: 0,
        telegram: 0
      };
      
      userSocialsSnapshot.forEach(doc => {
        const userData = doc.data() as MySphereUserSocialConnections;
        const userFirstConnected = userData.firstConnected?.toDate?.() || new Date(userData.firstConnected);
        
        // Sprawdź czy użytkownik był aktywny w tym dniu
        if (userFirstConnected <= date) {
          dailyStats.users++;
          
          // Sprawdź każdą platformę w historii połączeń
          userData.connectionHistory?.forEach(connection => {
            const connectionDate = connection.connectedAt?.toDate?.() || new Date(connection.connectedAt);
            const disconnectionDate = connection.disconnectedAt?.toDate?.() || null;
            
            // Sprawdź czy połączenie było aktywne w tym dniu
            if (connectionDate <= date && (!disconnectionDate || disconnectionDate > date)) {
              switch (connection.platform) {
                case 'twitter': dailyStats.twitter++; break;
                case 'discord': dailyStats.discord++; break;
                case 'spotify': dailyStats.spotify++; break;
                case 'tiktok': dailyStats.tiktok++; break;
                case 'telegram': dailyStats.telegram++; break;
              }
            }
          });
        }
      });
      
      growthTrendData.push(dailyStats);
    }
    
    return {
      totalUsers,
      socialMediaConnections,
      fullyConnectedUsers,
      averageConnectionsPerUser: parseFloat(averageConnectionsPerUser.toFixed(1)),
      connectionDistribution,
      platformChartData,
      distributionChartData,
      growthTrendData,
      lastUpdated: new Date().toISOString(),
      dataSource: 'firebase-mysphere'
    };
  } catch (error) {
    console.error('❌ Błąd podczas pobierania globalnych statystyk MySphere:', error);
    throw error;
  }
};

// Pobierz ostatnich aktywnych użytkowników MySphere
export const getMySphereRecentUsers = async (limit: number = 10) => {
  try {
    const userSocialsRef = collection(db, 'mySphereUserSocials');
    const recentUsersQuery = query(
      userSocialsRef,
      firestoreOrderBy('lastUpdated', 'desc'),
      firestoreLimit(limit)
    );
    
    const snapshot = await getDocs(recentUsersQuery);
    return snapshot.docs.map(doc => {
      const data = doc.data() as MySphereUserSocialConnections;
      return {
        address: data.address,
        connectedPlatforms: data.connectedPlatforms || [],
        lastUpdated: data.lastUpdated,
        connectionCount: data.connectedPlatforms?.length || 0
      };
    });
  } catch (error) {
    console.error('❌ Błąd podczas pobierania ostatnich użytkowników:', error);
    return [];
  }
};



// Usuń wszystkie dane MySphere (funkcja czyszcząca dla testów)
export const clearMySphereData = async (): Promise<{success: boolean, deletedRecords: number}> => {
  try {
    const userSocialsRef = collection(db, 'mySphereUserSocials');
    const snapshot = await getDocs(userSocialsRef);
    
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    console.log(`🧹 Usunięto ${snapshot.size} rekordów MySphere`);
    return {
      success: true,
      deletedRecords: snapshot.size
    };
  } catch (error) {
    console.error('❌ Błąd podczas czyszczenia danych MySphere:', error);
    return {
      success: false,
      deletedRecords: 0
    };
  }
};

// --- End MySphere Social Media Tracking Functions ---

/*
🔥 FIREBASE INDEXES REQUIRED 🔥

Aby nowe funkcje optymalizacji działały poprawnie, musisz dodać te indeksy w Firebase Console:

1. Collection: users
   - Field: baseChatPoints.totalPoints (Descending)
   - Field: __name__ (Ascending)

2. Collection: users  
   - Field: postsCount (Descending)
   - Field: __name__ (Ascending)

Instrukcje:
1. Idź do Firebase Console > Firestore Database > Indexes
2. Kliknij "Create Index"
3. Dodaj powyższe indeksy

Alternatywnie uruchom aplikację - Firebase automatycznie zasugeruje indeksy w konsoli.

📊 OPTIMIZED FOR 1000 TOP USERS (vs previous 12k all users):
- 92% reduction in Firebase reads (1000 vs 12k)
- 5-minute cache TTL for fast repeat loads
- Smart localStorage cache with timestamp validation
- Admin can force refresh all 12k users via batch processing
*/

// Optymalizowana funkcja do pobierania tylko top użytkowników
export const getTopActiveUsers = async (limit: number = 50) => {
  try {
    console.log(`📊 Fetching top ${limit} active users...`);
    
    // Query użytkowników posortowanych po baseChatPoints.totalPoints
    const usersRef = collection(db, 'users');
    const topUsersQuery = query(
      usersRef,
      where('baseChatPoints.totalPoints', '>', 0),
      firestoreOrderBy('baseChatPoints.totalPoints', 'desc'),
      firestoreLimit(limit)
    );
    
    const topUsersSnap = await getDocs(topUsersQuery);
    
    // Jeśli nie ma wystarczająco użytkowników z baseChatPoints, pobierz resztę
    if (topUsersSnap.size < limit) {
      const remainingLimit = limit - topUsersSnap.size;
      const fallbackQuery = query(
        usersRef,
        where('postsCount', '>', 0),
        firestoreOrderBy('postsCount', 'desc'),
        firestoreLimit(remainingLimit)
      );
      
      const fallbackSnap = await getDocs(fallbackQuery);
      
      // Połącz wyniki, ale uniknij duplikatów
      const ids = new Set(topUsersSnap.docs.map(d => d.id));
      const merged = [...topUsersSnap.docs, ...fallbackSnap.docs.filter(d => !ids.has(d.id))];
      return merged;
    }
    
    return topUsersSnap.docs;
  } catch (error) {
    console.error('Error fetching top active users:', error);
    // Fallback - pobierz pierwszych {limit} użytkowników
    const usersRef = collection(db, 'users');
    const fallbackQuery = query(usersRef, firestoreLimit(limit));
    const fallbackSnap = await getDocs(fallbackQuery);
    return fallbackSnap.docs;
  }
};

// Funkcja dla admina do force refresh rankingu wszystkich użytkowników
export const refreshUserRankings = async (): Promise<{
  success: boolean;
  processedUsers: number;
  updatedUsers: number;
  error?: string;
}> => {
  try {
    console.log('🔄 Starting full user rankings refresh...');
    
    const usersRef = collection(db, 'users');
    const usersSnap = await getDocs(usersRef);
    
    let processedUsers = 0;
    let updatedUsers = 0;
    
    // Przetwarzaj użytkowników w batches po 10
    const batchSize = 10;
    const userDocs = usersSnap.docs;
    
    for (let i = 0; i < userDocs.length; i += batchSize) {
      const batch = userDocs.slice(i, i + batchSize);
      
      // Przetwórz batch równolegle
      await Promise.all(batch.map(async (docSnapshot) => {
        try {
          const data = docSnapshot.data();
          processedUsers++;
          
          // Oblicz punkty (uwzględnij BaseName i referral)
          const stats = {
            posts: data.postsCount || 0,
            likes: data.likesReceived || 0
          };
          const postPoints = stats.posts * 5;
          const likePoints = stats.likes;
          const basePoints = postPoints + likePoints;
          const activityBonus = Math.round(basePoints * 0.25);

          // BaseName bonus: preferuj zapisany w baseChatPoints, inaczej heurystyka po nazwie
          const hasBaseName = (data.baseChatPoints?.baseNameBonus ? data.baseChatPoints.baseNameBonus > 0 : false) 
            || (typeof data.name === 'string' && data.name.endsWith('.base.eth'));
          const baseNameBonus = hasBaseName ? (Number(data.baseChatPoints?.baseNameBonus) || 1000) : 0;

          // Domain bonuses: zachowaj istniejące wartości
          const sphereBonus = Number(data.baseChatPoints?.sphereBonus || 0);
          const camperBonus = Number(data.baseChatPoints?.camperBonus || 0);
          const celoBonus = Number(data.baseChatPoints?.celoBonus || 0);
          const worldBonus = Number(data.baseChatPoints?.worldBonus || 0);

          // Referral points: weź zapisane wartości (rekomendowane po rebuildReferralAggregates)
          const referralPoints = Number(data.baseChatPoints?.referralPoints || 0);

          const totalPoints = basePoints + activityBonus + baseNameBonus + sphereBonus + camperBonus + celoBonus + worldBonus + referralPoints;
          
          // Aktualizuj tylko jeśli punkty się zmieniły
          const currentPoints = data.baseChatPoints?.totalPoints || 0;
          if (Math.abs(currentPoints - totalPoints) > 1) {
            const userRef = doc(db, 'users', docSnapshot.id);
            await updateDoc(userRef, {
              'baseChatPoints.postPoints': postPoints,
              'baseChatPoints.likePoints': likePoints,
              'baseChatPoints.activityBonus': activityBonus,
              'baseChatPoints.baseNameBonus': baseNameBonus,
              'baseChatPoints.sphereBonus': sphereBonus,
              'baseChatPoints.camperBonus': camperBonus,
              'baseChatPoints.celoBonus': celoBonus,
              'baseChatPoints.worldBonus': worldBonus,
              'baseChatPoints.referralPoints': referralPoints,
              'baseChatPoints.totalPoints': totalPoints,
              'baseChatPoints.lastUpdated': serverTimestamp()
            });
            updatedUsers++;
          }
        } catch (error) {
          console.error(`Error processing user ${docSnapshot.id}:`, error);
        }
      }));
      
      // Krótka pauza między batch'ami
      if (i + batchSize < userDocs.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Log progress co 100 użytkowników
      if (processedUsers % 100 === 0) {
        console.log(`📊 Processed ${processedUsers}/${userDocs.length} users...`);
      }
    }
    
    console.log(`✅ Rankings refresh completed: ${processedUsers} processed, ${updatedUsers} updated`);
    
    return {
      success: true,
      processedUsers,
      updatedUsers
    };
  } catch (error) {
    console.error('❌ Error refreshing user rankings:', error);
    return {
      success: false,
      processedUsers: 0,
      updatedUsers: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Cache dla aktywnych użytkowników z TTL
let cachedActiveUsers: any[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

export const getCachedActiveUsers = async (limit: number = 50, forceRefresh: boolean = false) => {
  const now = Date.now();
  
  // Użyj cache jeśli jest świeży i nie force refresh
  if (!forceRefresh && cachedActiveUsers.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('📋 Using cached active users (up to 1000)');
    return cachedActiveUsers.slice(0, limit);
  }
  
  console.log('🔄 Refreshing active users cache...');
  
  try {
    // Math.ceil, bo firestoreLimit() na ulamku (np. 1 * 1.2) wywraca zapytanie.
    const userDocs = await getTopActiveUsers(Math.ceil(Math.min(limit * 1.2, 1200))); // 20% zapasu dla cache'u, max 1200
    
    const users = userDocs.map(docSnapshot => {
      const data = docSnapshot.data();
      // lastActive bywa Timestampem - new Date(Timestamp) dawalo Invalid Date -> NaN,
      // przez co sortowanie i wyswietlanie "ostatnio aktywny" bylo losowe.
      const lastActive = toMillis(data.lastActive) || Date.now();

      // Oblicz punktację w sposób odporny na nadpisania pól
      let totalPoints = 0;
      if (data.baseChatPoints && typeof data.baseChatPoints === 'object') {
        const postPoints = Number(data.baseChatPoints.postPoints || 0);
        const likePoints = Number(data.baseChatPoints.likePoints || 0);
        const activityBonus = Number(data.baseChatPoints.activityBonus || 0);
        const baseNameBonus = Number(data.baseChatPoints.baseNameBonus || 0);
        const referralPoints = Number(data.baseChatPoints.referralPoints || 0);
        const computedTotal = postPoints + likePoints + activityBonus + baseNameBonus + referralPoints;
        const storedTotal = Number(data.baseChatPoints.totalPoints || 0);
        // Weź większą z wartości, aby nie tracić bonusów przy ewentualnym nadpisaniu
        totalPoints = Math.max(storedTotal, computedTotal);
      } else {
        const posts = Number(data.postsCount || 0);
        const likes = Number(data.likesReceived || 0);
        const postPoints = posts * 5;
        const likePoints = likes;
        const basePoints = postPoints + likePoints;
        const activityBonus = Math.round(basePoints * 0.25);
        // Fallback: dodaj bonus BaseName, jeśli da się to wywnioskować z nazwy
        const isBaseNameFallback = (typeof data.name === 'string' && data.name.endsWith('.base.eth')) || Boolean(data.baseName);
        const baseNameBonus = isBaseNameFallback ? 1000 : 0;
        totalPoints = basePoints + activityBonus + baseNameBonus;
      }

      const userName = data.name || (data.baseName ? `${data.baseName}.base.eth` : docSnapshot.id.slice(0, 6) + '...' + docSnapshot.id.slice(-4));

      return {
        address: docSnapshot.id,
        points: totalPoints,
        stats: {
          posts: data.postsCount || 0,
          likes: data.likesReceived || 0
        },
        lastActive: lastActive,
        name: userName,
        avatar: data.avatar
      };
    });
    
    // Sortuj po punktach
    const sortedUsers = users.sort((a, b) => b.points - a.points);
    
    // Aktualizuj cache
    cachedActiveUsers = sortedUsers;
    cacheTimestamp = now;
    
    console.log(`✅ Active users cache updated: ${sortedUsers.length}/1000 users`);
    return sortedUsers.slice(0, limit);
  } catch (error) {
    console.error('❌ Error updating active users cache:', error);
    return cachedActiveUsers.slice(0, limit); // Zwróć stary cache w przypadku błędu
  }
};

// Funkcje do przypinania postów przez adminów
export const pinPost = async (postId: string, adminAddress: string): Promise<boolean> => {
  try {
    // Sprawdź czy użytkownik jest adminem
    if (adminAddress.toLowerCase() !== ADMIN_ADDRESS) {
      throw new Error('Only admins can pin posts');
    }

    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      isPinned: true,
      pinnedAt: serverTimestamp(),
      pinnedBy: adminAddress
    });

    return true;
  } catch (error) {
    console.error('Error pinning post:', error);
    return false;
  }
};

export const unpinPost = async (postId: string, adminAddress: string): Promise<boolean> => {
  try {
    // Sprawdź czy użytkownik jest adminem
    if (adminAddress.toLowerCase() !== ADMIN_ADDRESS) {
      throw new Error('Only admins can unpin posts');
    }

    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, {
      isPinned: false,
      pinnedAt: deleteField(),
      pinnedBy: deleteField()
    });

    return true;
  } catch (error) {
    console.error('Error unpinning post:', error);
    return false;
  }
};

export const isUserAdmin = (userAddress: string): boolean => {
  return userAddress.toLowerCase() === ADMIN_ADDRESS;
};

// Funkcja do pobierania TYLKO przypiętych postów
export const fetchPinnedPosts = async (): Promise<ExtendedPost[]> => {
  const now = Timestamp.now();
  
  try {
    // Oba zapytania byly BEZ limitu i rosly liniowo z kazdym postem
    // kiedykolwiek przypietym - na kazde wejscie na feed. Sekcja przypietych
    // pokazuje kilka pozycji, wiec sufit 12+24 to wielokrotny zapas, a koszt
    // przestaje rosnac z historia.
    // 1. Fetch Admin-pinned posts
    const adminPinnedQuery = query(
      collection(db, 'posts'),
      where('isPinned', '==', true),
      firestoreOrderBy('pinnedAt', 'desc'),
      firestoreLimit(12)
    );

    // 2. Fetch Active Paid-pinned posts
    const paidPinsQuery = query(
      collection(db, 'paidPins'),
      where('isActive', '==', true),
      where('expiresAt', '>', now),
      firestoreOrderBy('expiresAt', 'desc'),
      firestoreLimit(24)
    );

    const [adminPinnedSnapshot, paidPinsSnapshot] = await Promise.all([
      getDocs(adminPinnedQuery),
      getDocs(paidPinsQuery)
    ]);

    const postIds = new Set<string>();
    const paidPostDetails: { [postId: string]: any } = {};

    // Process paid pins to get their post IDs and details
    if (!paidPinsSnapshot.empty) {
      for (const pinDoc of paidPinsSnapshot.docs) {
        const pinData = pinDoc.data();
        if (pinData.postId) {
          postIds.add(pinData.postId);
          paidPostDetails[pinData.postId] = { 
            paidPinExpiresAt: pinData.expiresAt,
            isPaidPin: true
          };
        }
      }
    }
    
    // Process admin pins, adding only unique post IDs
    if (!adminPinnedSnapshot.empty) {
      adminPinnedSnapshot.docs.forEach(doc => {
        postIds.add(doc.id);
      });
    }

    if (postIds.size === 0) {
      return [];
    }
    
    // Efficiently fetch all post documents in chunks (rownolegle, nie po kolei)
    const postIdsArray = Array.from(postIds);
    const postsById = await fetchDocsByIds('posts', postIdsArray);

    // Map fetched documents to ExtendedPost objects
    const postsMap = new Map<string, ExtendedPost>();
    postsById.forEach((postData, id) => {
      // Tablica `comments` w dokumencie posta jest zapisywalna z przegladarki -
      // bez czyszczenia podrobiony wpis z `tipLamports` pokazalby odznake
      // "paid reply" na przypietym poscie (mapPostDoc robi to samo dla feedu).
      const post = {
        id,
        ...postData,
        comments: legacyCommentsWithoutPaidFields(postData.comments),
      } as ExtendedPost;

      // Add paid pin details if available
      if (paidPostDetails[id]) {
        post.isPaidPin = true;
        post.paidPinExpiresAt = paidPostDetails[id].paidPinExpiresAt;
      }

      // Ensure isPinned is correctly set for admin pins
      if (postData.isPinned) {
        post.isPinned = true;
      }

      postsMap.set(id, post);
    });
    
    // Create final list and filter out any undefined posts
    const allPinnedPosts = postIdsArray
        .map(id => postsMap.get(id))
        .filter((p): p is ExtendedPost => p !== undefined);

    // Advanced sorting: Admin pins first, then paid pins by expiration
    allPinnedPosts.sort((a, b) => {
        const aIsAdminPinned = a.isPinned && !a.isPaidPin;
        const bIsAdminPinned = b.isPinned && !b.isPaidPin;

        if (aIsAdminPinned && !bIsAdminPinned) return -1;
        if (!aIsAdminPinned && bIsAdminPinned) return 1;

        if (aIsAdminPinned && bIsAdminPinned) {
            const timeA = a.pinnedAt?.toMillis ? a.pinnedAt.toMillis() : (a.pinnedAt || 0);
            const timeB = b.pinnedAt?.toMillis ? b.pinnedAt.toMillis() : (b.pinnedAt || 0);
            return timeB - timeA;
        }

        const expireA = a.paidPinExpiresAt?.toMillis ? a.paidPinExpiresAt.toMillis() : (a.paidPinExpiresAt || 0);
        const expireB = b.paidPinExpiresAt?.toMillis ? b.paidPinExpiresAt.toMillis() : (b.paidPinExpiresAt || 0);
        return expireB - expireA;
    });

    return allPinnedPosts;

  } catch (error) {
    console.error("❌ Error fetching pinned posts:", error);
    return [];
  }
};

// ===== TIP TRACKING SYSTEM =====

// Typy tokenów obsługiwanych przez system tipowania
export type TipTokenType = 'ETH' | 'USDC' | 'CELO' | 'WLD' | 'LINEA' | 'CAMP' | 'USDG';
// 'basecamp' zachowane dla kompatybilności wstecznej ze starymi danymi w Firebase
export type TipNetworkType = 'base' | 'ethereum' | 'celo' | 'world' | 'linea' | 'camp' | 'robinhood' | 'arc' | 'basecamp';

export interface Tip {
  id?: string;
  senderAddress: string;
  recipientAddress: string;
  amount: string;
  token: TipTokenType;
  postId?: string; // Optional - for tips on specific posts
  txHash: string;
  timestamp: number;
  network: TipNetworkType;
}

export interface TipStats {
  totalReceived: number;
  totalSent: number;
  tipCount: number;
  // Per-token stats
  ethReceived: number;
  usdcReceived: number;
  celoReceived: number;
  wldReceived: number;
  lineaReceived: number;
  campReceived: number;
  usdgReceived: number;
  ethSent: number;
  usdcSent: number;
  celoSent: number;
  wldSent: number;
  lineaSent: number;
  campSent: number;
  usdgSent: number;
}

export interface PostTipStats {
  totalTips: number;
  ethTips: number;
  usdcTips: number;
  celoTips: number;
  wldTips: number;
  lineaTips: number;
  campTips: number;
  usdgTips: number;
  tipCount: number;
  uniqueTippers: number;
  // Per-network tips (ETH grouped by network)
  networkTips: {
    network: TipNetworkType;
    token: TipTokenType;
    amount: number;
  }[];
}

// Zapisuje tip do Firebase po udanej transakcji
export const saveTip = async (tip: Omit<Tip, 'id' | 'timestamp'>): Promise<string> => {
  try {
    /**
     * ADRESY MALYMI LITERAMI - INACZEJ NAPIWEK ZNIKA Z CZYJEJS KSIEGI.
     *
     * === CO BYLO ===
     * Tu szlo `...tip` prosto z portfela, czyli adres w takiej pisowni, jaka
     * akurat podal portfel - zwykle checksuma (`0xAbC...`). Firestore porownuje
     * stringi bajt po bajcie, wiec `where('recipientAddress','==','0xabc...')`
     * MIJA taki dokument. Odbiorca patrzyl na /money i widzial ksiege bez
     * swojego napiwka, mimo ze transakcja byla na lancuchu. Brakujaca pozycja
     * nie wyglada jak blad - wyglada jak "nie dostales".
     *
     * === DLACZEGO TO NIE WYSTARCZA SAMO ===
     * Poprawka dziala od teraz w przod. 187 z 189 istniejacych dokumentow ma
     * adres w checksumie i tak zostanie, dopoki wlasciciel bazy nie zdecyduje
     * o migracji (scripts/migrateAddressCasing.mjs, NIEURUCHOMIONY). Dlatego
     * odczyty MUSZA dalej pytac o oba warianty - patrz `addressReadVariants`.
     *
     * Wybor malych liter, a nie checksumy, jest opisany przy `normalizeAddress`
     * w app/utils/monetization/types.ts.
     */
    const tipData = {
      ...tip,
      senderAddress: normalizeAddress(tip.senderAddress),
      recipientAddress: normalizeAddress(tip.recipientAddress),
      timestamp: Date.now(),
    };

    const docRef = await addDoc(collection(db, 'tips'), tipData);
    console.log('✅ Tip zapisany:', docRef.id); // sam identyfikator - bez adresow i kwot w konsoli

    /**
     * ODBIORCA DOWIADUJE SIE, ZE DOSTAL PIENIADZE.
     *
     * === CO BYLO ===
     * `saveTip` konczylo sie na `return docRef.id`. Funkcja
     * `notifyTipReceived` istniala od dawna w app/utils/friends/notifications.ts
     * i nie miala ANI JEDNEGO wywolania w calym repo.
     *
     * Skutek: 188 rozliczonych napiwkow, ZERO powiadomionych odbiorcow. Ktos
     * wysylal komus prawdziwe pieniadze, a tamten nie mial jak sie o tym
     * dowiedziec inaczej niz przypadkiem, przegladajac wlasny profil.
     *
     * Na produkcie, ktorego cala teza brzmi "tu pieniadze chodza miedzy
     * ludzmi", jedyne zdarzenie warte powiadomienia bylo jedynym, ktore
     * powiadomienia nie wysylalo. Przy 14 aktywnych tygodniowo to nie jest
     * drobiazg - to brak jedynego powodu, zeby wrocic.
     *
     * === DLACZEGO NIE PRZERYWA ZAPISU ===
     * Powiadomienie jest SKUTKIEM UBOCZNYM. Napiwek juz sie rozliczyl na
     * lancuchu i zapisal w bazie; blad przy powiadamianiu nie moze cofnac ani
     * jednego, ani drugiego, ani pokazac uzytkownikowi bledu przy udanej
     * platnosci. Stad `.catch` zamiast `await` w glownym torze.
     */
    // Import DYNAMICZNY, nie statyczny: ten plik importuje pol aplikacji,
    // wiec wiazanie go na sztywno z modulem powiadomien tylko po to, zeby
    // wyslac jedno powiadomienie, dokladaloby go do kazdego bundle'a, ktory
    // dotyka Firestore. Przy okazji odpada ryzyko cyklu importow.
    void (async () => {
      try {
        const { notifyTipReceived } = await import('./friends/notifications');
        await notifyTipReceived(
          tip.recipientAddress,
          tip.senderAddress,
          String(tip.amount),
          tip.token,
          tip.postId
        );
      } catch (notifyError) {
        console.warn('⚠️ Nie udalo sie powiadomic o tipie:', notifyError);
      }
    })();

    return docRef.id;
  } catch (error) {
    console.error('❌ Błąd zapisywania tipu:', error);
    throw error;
  }
};

/**
 * Token -> przedrostek pola w statystykach (ethReceived, usdcTips, ...).
 * Ten sam switch po szesciu tokenach byl przepisany cztery razy.
 */
const TIP_TOKEN_FIELD: Record<TipTokenType, string> = {
  ETH: 'eth',
  USDC: 'usdc',
  CELO: 'celo',
  WLD: 'wld',
  LINEA: 'linea',
  CAMP: 'camp',
  USDG: 'usdg'
};

/** Dopisuje kwote do pola `<token><suffix>`; nieznane tokeny sa pomijane. */
const addTipAmount = (
  stats: Record<string, number>,
  token: TipTokenType,
  suffix: 'Received' | 'Sent' | 'Tips',
  amount: number
): void => {
  const field = TIP_TOKEN_FIELD[token];
  if (!field) return; // token spoza listy - stare dane, nie wywracamy sumy
  stats[`${field}${suffix}`] += amount;
};

/** Pusty komplet statystyk tipow uzytkownika - ten sam obiekt byl wpisany z reki dwa razy. */
const emptyTipStats = (): TipStats => ({
  totalReceived: 0,
  totalSent: 0,
  tipCount: 0,
  ethReceived: 0,
  usdcReceived: 0,
  celoReceived: 0,
  wldReceived: 0,
  lineaReceived: 0,
  campReceived: 0,
  usdgReceived: 0,
  ethSent: 0,
  usdcSent: 0,
  celoSent: 0,
  wldSent: 0,
  lineaSent: 0,
  campSent: 0,
  usdgSent: 0
});

/** Pusty komplet statystyk tipow posta - byl wpisany z reki w trzech miejscach. */
const emptyPostTipStats = (): PostTipStats => ({
  totalTips: 0,
  ethTips: 0,
  usdcTips: 0,
  celoTips: 0,
  wldTips: 0,
  lineaTips: 0,
  campTips: 0,
  usdgTips: 0,
  tipCount: 0,
  uniqueTippers: 0,
  networkTips: []
});

/**
 * Statystyki tipow jednego czlowieka.
 *
 * @returns `null` znaczy AWARIE ODCZYTU, nigdy "nie dostal zadnego napiwku".
 *
 * Wczesniej nieudany odczyt zwracal komplet zer i profil pisal "0" komus, kto
 * dostal piecdziesiat napiwkow - awaria udajaca fakt o swiecie. To sa PIENIADZE
 * czlowieka, wiec pomylka kosztuje tu najwiecej. Ten sam podzial co
 * getMoneyLedger i getAskAuthorStats: pustka to jedno, awaria to drugie.
 */
export const getUserTipStats = async (userAddress: string): Promise<TipStats | null> => {
  // Brak adresu to pytanie bez adresata, a nie awaria - i tak nie wolno go
  // puscic dalej, bo `in` z pusta lista jest w Firestore bledem zapytania.
  // Zostaje zerem, bo o NICZYM nie klamie: nie bylo o kogo zapytac.
  if (!userAddress || !userAddress.trim()) return emptyTipStats();

  try {
    const tipsRef = collection(db, 'tips');
    /**
     * WARSTWA ZGODNOSCI WSTECZNEJ, a nie stan docelowy.
     *
     * Zapisy sa od teraz normalizowane (`saveTip`), ale 187 z 189 istniejacych
     * dokumentow ma adres w checksumie. Rownosc `==` na jednej pisowni gubila
     * tu cala historie kazdego, kto trafil do bazy w drugiej postaci - i to bez
     * sladu, bo pusty wynik wygladal jak "zero napiwkow". Pytanie o oba warianty
     * kosztuje tyle samo (Firestore rozlicza ZWROCONE dokumenty).
     *
     * Do usuniecia dopiero po migracji danych - patrz
     * scripts/migrateAddressCasing.mjs.
     */
    const variants = addressReadVariants(userAddress);
    // Sufit 500 na strone: bez niego zapytania rosly bez konca z historia
    // napiwkow uzytkownika (Firestore rozlicza kazdy zwrocony dokument).
    // `orderBy` od 2026-08-13 (wdrozone indeksy tips: recipientAddress/
    // senderAddress + timestamp, dzialaja takze z `in`): dzieki temu sufit
    // ucina NAJSTARSZE wpisy, a nie arbitralny podzbior w kolejnosci po ID.
    const receivedQuery = query(
      tipsRef,
      where('recipientAddress', 'in', variants),
      firestoreOrderBy('timestamp', 'desc'),
      firestoreLimit(500)
    );
    const sentQuery = query(
      tipsRef,
      where('senderAddress', 'in', variants),
      firestoreOrderBy('timestamp', 'desc'),
      firestoreLimit(500)
    );

    const [receivedSnapshot, sentSnapshot] = await Promise.all([
      getDocs(receivedQuery),
      getDocs(sentQuery)
    ]);

    const stats = emptyTipStats();
    const fields = stats as unknown as Record<string, number>;

    // Policz otrzymane tipy
    receivedSnapshot.docs.forEach(doc => {
      const tip = doc.data() as Tip;
      const amount = parseAmount(tip.amount);
      stats.tipCount++;
      stats.totalReceived += amount;
      addTipAmount(fields, tip.token, 'Received', amount);
    });

    // Policz wysłane tipy
    sentSnapshot.docs.forEach(doc => {
      const tip = doc.data() as Tip;
      const amount = parseAmount(tip.amount);
      stats.totalSent += amount;
      addTipAmount(fields, tip.token, 'Sent', amount);
    });

    return stats;
  } catch (error) {
    console.error('❌ Błąd pobierania statystyk tipów:', error);
    // Nie zgadujemy zera. Wolajacy ma napisac "nie udalo sie wczytac".
    return null;
  }
};

/**
 * Statystyki tipow jednego posta.
 *
 * @returns `null` znaczy AWARIE ODCZYTU, nigdy "pod tym postem nie ma tipow".
 * Tabelka tipow z samymi zerami wyglada jak stwierdzenie o poscie, a byla
 * wylacznie stwierdzeniem o naszym nieudanym zapytaniu.
 */
export const getPostTipStats = async (postId: string): Promise<PostTipStats | null> => {
  try {
    const tipsRef = collection(db, 'tips');
    const postTipsQuery = query(tipsRef, where('postId', '==', postId));
    const snapshot = await getDocs(postTipsQuery);
    
    const stats = emptyPostTipStats();
    const fields = stats as unknown as Record<string, number>;

    const uniqueTippers = new Set<string>();
    // Map to aggregate tips by network+token combination
    const networkTokenMap = new Map<string, { network: TipNetworkType; token: TipTokenType; amount: number }>();

    snapshot.docs.forEach(doc => {
      const tip = doc.data() as Tip;
      const amount = parseAmount(tip.amount);

      stats.tipCount++;
      stats.totalTips += amount;
      // Malymi literami, bo ten sam czlowiek bywa zapisany raz checksuma, raz
      // nie - bez tego liczylby sie jako dwoch wspierajacych pod jednym postem.
      uniqueTippers.add(normalizeAddress(tip.senderAddress ?? ''));

      // Legacy per-token stats (kept for backwards compatibility)
      addTipAmount(fields, tip.token, 'Tips', amount);

      // New: aggregate by network+token
      const key = `${tip.network}:${tip.token}`;
      const existing = networkTokenMap.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        networkTokenMap.set(key, { network: tip.network, token: tip.token, amount });
      }
    });
    
    stats.uniqueTippers = uniqueTippers.size;
    stats.networkTips = Array.from(networkTokenMap.values()).filter(t => t.amount > 0);
    return stats;
  } catch (error) {
    console.error('❌ Błąd pobierania statystyk tipów posta:', error);
    return null;
  }
};

/**
 * Statystyki tipow dla WIELU postow naraz - jedno zapytanie na kazde 30 postow
 * zamiast osobnego getDocs() per post (feed z 25 postami = 25 zapytan).
 *
 * @returns `null` znaczy AWARIE ODCZYTU calego zbiorczego zapytania.
 *
 * To bylo najszersze zero w calym repo: mapa jest WSTEPNIE WYPELNIANA zerami
 * (zeby post bez ani jednego tipa mial swoj wpis), a `catch` oddawal ja bez
 * slowa. Jedno nieudane zapytanie pisalo wiec "0 tipow" pod KAZDYM postem
 * w feedzie naraz - i wygladalo to dokladnie jak prawda o feedzie.
 */
export const getBulkPostTipStats = async (postIds: string[]): Promise<{ [postId: string]: PostTipStats } | null> => {
  const result: { [postId: string]: PostTipStats } = {};
  const unique = Array.from(new Set(postIds.filter(Boolean)));
  if (unique.length === 0) return result;

  unique.forEach(id => { result[id] = emptyPostTipStats(); });

  const tippersByPost = new Map<string, Set<string>>();
  const networkTokenByPost = new Map<string, Map<string, { network: TipNetworkType; token: TipTokenType; amount: number }>>();

  try {
    // Kawalki po 30 leca rownolegle - wczesniej feed czekal na kazdy po kolei.
    const snapshots = await Promise.all(
      chunkArray(unique, 30).map(chunk =>
        getDocs(query(collection(db, 'tips'), where('postId', 'in', chunk)))
      )
    );

    snapshots.forEach(snapshot => {
      snapshot.docs.forEach(d => {
        const tip = d.data() as Tip;
        const postId = tip.postId as string;
        const stats = result[postId];
        if (!stats) return;

        const amount = parseAmount(tip.amount);
        stats.tipCount++;
        stats.totalTips += amount;

        if (!tippersByPost.has(postId)) tippersByPost.set(postId, new Set());
        // Malymi literami - ten sam wspierajacy w dwoch pisowniach liczyl sie
        // dotad jako dwie osoby pod postem.
        tippersByPost.get(postId)!.add(normalizeAddress(tip.senderAddress ?? ''));

        addTipAmount(stats as unknown as Record<string, number>, tip.token, 'Tips', amount);

        if (!networkTokenByPost.has(postId)) networkTokenByPost.set(postId, new Map());
        const map = networkTokenByPost.get(postId)!;
        const key = `${tip.network}:${tip.token}`;
        const existing = map.get(key);
        if (existing) existing.amount += amount;
        else map.set(key, { network: tip.network, token: tip.token, amount });
      });
    });

    Object.keys(result).forEach(postId => {
      result[postId].uniqueTippers = tippersByPost.get(postId)?.size || 0;
      result[postId].networkTips = Array.from(networkTokenByPost.get(postId)?.values() || []).filter(t => t.amount > 0);
    });
  } catch (error) {
    console.error('❌ Błąd pobierania zbiorczych statystyk tipów:', error);
    // Czesciowy wynik tez jest klamstwem: kawalki po 30 leca rownolegle, wiec
    // gdy padnie jeden, posty z pozostalych kawalkow maja juz policzone tipy,
    // a te z padnietego zostaja z wpisanym zerem. Nie da sie tego rozroznic po
    // stronie wolajacego, wiec caly odczyt oznaczamy jako nieudany.
    return null;
  }

  return result;
};

/**
 * Ostatnie OTRZYMANE napiwki. Trzy naprawy naraz, bo kazda z osobna zostawiala
 * kafelek pusty:
 *
 * 1. PISOWNIA ADRESU. Bylo `==` na jednej postaci, a 187 z 189 dokumentow ma
 *    adres w checksumie. Pytamy o oba warianty (warstwa zgodnosci wstecznej -
 *    patrz `addressReadVariants`).
 *
 * 2. BRAK INDEKSU. Bylo `where(...) + orderBy('timestamp')`, a firestore.indexes.json
 *    NIE MA ani jednego indeksu zlozonego dla `tips`. Takie zapytanie konczy sie
 *    bledem FAILED_PRECONDITION ZAWSZE - kafelek "Recent tips" nie mogl pokazac
 *    niczego nikomu. Sortujemy w pamieci, dokladnie jak getMoneyLedger.
 *
 * 3. AWARIA UDAJACA PUSTKE. `catch` zwracal `[]`, wiec RecentTips.tsx dostawal
 *    "zero napiwkow" i pisal "No tips received yet" takze wtedy, gdy odczyt
 *    padl. Komponent ma juz wlasny stan `loadFailed` i wlasny komunikat - byl
 *    martwy, bo nigdy nie dostawal wyjatku. Teraz RZUCAMY dalej.
 *
 * @throws gdy odczyt sie nie powiedzie - wolajacy MUSI to odroznic od pustki.
 */
export const getRecentTips = async (userAddress: string, limit: number = 10): Promise<Tip[]> => {
  if (!userAddress || !userAddress.trim()) return [];

  const snapshot = await getDocs(
    query(
      collection(db, 'tips'),
      where('recipientAddress', 'in', addressReadVariants(userAddress)),
      // Limit celowo WIEKSZY niz zadany: bez orderBy Firestore obcina dowolne
      // `limit` wierszy, wiec najnowsze musza sie najpierw zmiescic w probce.
      firestoreLimit(Math.max(limit * 5, 50))
    )
  );

  return snapshot.docs
    .map(entry => ({ id: entry.id, ...entry.data() } as Tip))
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
    .slice(0, limit);
};

// ===============================================
// 🔥 ULTRA-CHEAP USER NAMES SYSTEM (95% taniej!)
// ===============================================

// Cache dla nazw użytkowników z TTL
let userNamesCache: { [key: string]: { name: string, avatar?: string, timestamp: number } } = {};
const USER_NAMES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 godziny

// localStorage cache dla persistent storage
const USER_NAMES_STORAGE_KEY = 'userNamesCache_v2';
const USER_NAMES_STORAGE_TTL = 48 * 60 * 60 * 1000; // 48 godzin

let userNamesCacheHydrated = false;

const hydrateUserNamesCacheFromStorage = (now: number) => {
  if (userNamesCacheHydrated) return;
  userNamesCacheHydrated = true;
  if (typeof window === 'undefined') return;

  try {
    const storedCache = localStorage.getItem(USER_NAMES_STORAGE_KEY);
    if (!storedCache) return;
    const parsed = JSON.parse(storedCache);
    Object.keys(parsed).forEach(addr => {
      if (now - parsed[addr].timestamp < USER_NAMES_STORAGE_TTL) {
        userNamesCache[addr] = parsed[addr];
      }
    });
  } catch (e) {
    console.log('Failed to parse localStorage cache');
  }
};

// ===============================================
// 🚀 ULTRA-CHEAP getBulkUserNames() REPLACEMENT
// ===============================================
export const getBulkUserNamesOptimized = async (addresses: string[]): Promise<{[key: string]: {name: string, avatar?: string}}> => {
  if (!addresses || addresses.length === 0) return {};
  
  const result: {[key: string]: {name: string, avatar?: string}} = {};
  const uniqueAddresses = Array.from(new Set(addresses));
  const now = Date.now();
  
  try {
    // 1. HYDRATE z localStorage - tylko RAZ na sesje. Wczesniej caly blob byl
    // parsowany przy KAZDEJ zmianie feedu; po pierwszym przebiegu pamiec i tak
    // jest zrodlem prawdy (zapisy ida do obu naraz).
    hydrateUserNamesCacheFromStorage(now);
    
    // 2. CHECK memory + localStorage cache
    const addressesToFetch: string[] = [];
    
    uniqueAddresses.forEach(address => {
      const cached = userNamesCache[address];
      if (cached && (now - cached.timestamp) < USER_NAMES_CACHE_TTL) {
        // Use cache
        result[address] = { name: cached.name, avatar: cached.avatar };
      } else {
        // Need to fetch
        addressesToFetch.push(address);
      }
    });
    
    // 3. BATCH FETCH only missing addresses.
    //
    // Wczesniej bylo tu 2 x getDoc() NA KAZDY adres, czyli dla feedu z 25
    // autorami 50 osobnych zapytan (rownoleglych, ale kazde to osobny round-trip
    // i osobny odczyt - takze wtedy, gdy dokumentu w ogole nie ma). Teraz sa
    // dwa zapytania `where(documentId(), 'in', ...)` na kazde 30 adresow.
    if (addressesToFetch.length > 0) {
      console.log(`🔄 Fetching ${addressesToFetch.length}/${uniqueAddresses.length} user names (${((1 - addressesToFetch.length/uniqueAddresses.length) * 100).toFixed(1)}% cache hit)`);

      const [usersById, usernamesById] = await Promise.all([
        fetchDocsByIds('users', addressesToFetch),
        fetchDocsByIds('usernames', addressesToFetch)
      ]);

      for (const address of addressesToFetch) {
        const userData = usersById.get(address);
        const usernameData = usernamesById.get(address);

        // Priority: usernames > users > fallback
        const name = usernameData?.name
          || userData?.name
          || `${address.slice(0, 6)}...${address.slice(-4)}`;

        const entry = { name, avatar: userData?.avatar };
        result[address] = entry;

        // Cache with timestamp
        userNamesCache[address] = {
          ...entry,
          timestamp: now
        };
      }
      
      // 4. SAVE to localStorage (async, non-blocking)
      setTimeout(() => {
        try {
          localStorage.setItem(USER_NAMES_STORAGE_KEY, JSON.stringify(userNamesCache));
        } catch (e) {
          console.log('Failed to save cache to localStorage');
        }
      }, 10);
    } else {
      console.log(`⚡ 100% cache hit for ${uniqueAddresses.length} user names - 0 Firebase reads!`);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Error in getBulkUserNamesOptimized:', error);
    
    // Fallback: generate names from addresses
    uniqueAddresses.forEach(address => {
      if (!result[address]) {
        result[address] = { 
          name: `${address.slice(0, 6)}...${address.slice(-4)}` 
        };
      }
    });
    
    return result;
  }
};

// ===============================================
// 🎯 SMART LOADING - Only Visible Content
// ===============================================
export const getBulkUserNamesVisibleOnly = async (
  posts: any[], 
  maxCommentsPerPost: number = 3
): Promise<{[key: string]: {name: string, avatar?: string}}> => {
  const addresses = new Set<string>();
  
  // Zbierz tylko adresy które są NAPRAWDĘ potrzebne
  posts.forEach(post => {
    // Zawsze dodaj autora posta
    addresses.add(post.author);
    
    // Dodaj tylko pierwszych N komentarzy (zamiast wszystkich)
    if (post.comments && Array.isArray(post.comments)) {
      post.comments
        .slice(0, maxCommentsPerPost) // LIMIT: tylko pierwsze 3 komentarze
        .forEach((comment: any) => {
          addresses.add(comment.author);
        });
    }
  });
  
  console.log(`🎯 Smart loading: ${addresses.size} addresses (limited to ${maxCommentsPerPost} comments per post)`);
  return getBulkUserNamesOptimized(Array.from(addresses));
};

// ===============================================
// 📊 CACHE STATS & MANAGEMENT
// ===============================================
export const getUserNamesCacheStats = () => {
  const total = Object.keys(userNamesCache).length;
  const now = Date.now();
  const fresh = Object.values(userNamesCache).filter(
    item => (now - item.timestamp) < USER_NAMES_CACHE_TTL
  ).length;
  
  return {
    total,
    fresh,
    stale: total - fresh,
    hitRate: total > 0 ? ((fresh / total) * 100).toFixed(1) + '%' : '0%'
  };
};

export const clearUserNamesCache = () => {
  userNamesCache = {};
  userNamesCacheHydrated = false;
  localStorage.removeItem(USER_NAMES_STORAGE_KEY);
  console.log('🧹 User names cache cleared');
};

// ===============================================
// 🔧 LEGACY COMPATIBILITY - getBulkUserNames już jest zmodyfikowane wyżej
// ===============================================

// ===============================================
// 🚀 PAGINATED ACTIVE USERS SYSTEM (70% oszczędności Firebase reads!)
// ===============================================

// Cache dla paginowanych użytkowników
interface PaginatedCache {
  pages: any[][];
  currentPage: number;
  totalPages: number;
  lastUpdated: number;
  pageSize: number;
}

let paginatedActiveUsersCache: PaginatedCache = {
  pages: [],
  currentPage: 0,
  totalPages: 0,
  lastUpdated: 0,
  pageSize: 10
};

const PAGINATED_CACHE_TTL = 10 * 60 * 1000; // 10 minut cache

export const getTopActiveUsersPaginated = async (
  page: number = 1,
  pageSize: number = 10,
  forceRefresh: boolean = false
): Promise<{
  users: any[];
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  totalUsers: number;
}> => {
  try {
    const MAX_PAGES = 5; // 🚀 LIMIT: Maksymalnie 5 stron
    const MAX_USERS = MAX_PAGES * pageSize; // 50 użytkowników max
    
    // Ogranicz stronę do maksimum
    const limitedPage = Math.min(page, MAX_PAGES);
    const now = Date.now();
    
    // Sprawdź cache dla tej konkretnej strony
    const cacheValid = !forceRefresh && 
      paginatedActiveUsersCache.pages.length > 0 && 
      (now - paginatedActiveUsersCache.lastUpdated) < PAGINATED_CACHE_TTL;

    const pageIndex = limitedPage - 1;
    
    if (cacheValid && paginatedActiveUsersCache.pages[pageIndex]) {
      console.log(`📋 Using cached page ${limitedPage}/${MAX_PAGES} of active users`);
      // Te same liczby co w gałęzi bez cache'u - inaczej ten sam ekran
      // raportowalby raz 5 stron, raz tyle, ile realnie jest.
      const cachedPages = paginatedActiveUsersCache.totalPages || paginatedActiveUsersCache.pages.length;
      return {
        users: paginatedActiveUsersCache.pages[pageIndex],
        currentPage: limitedPage,
        totalPages: Math.max(1, cachedPages),
        hasNext: limitedPage < cachedPages,
        hasPrev: limitedPage > 1,
        totalUsers: paginatedActiveUsersCache.pages.reduce((sum, page) => sum + page.length, 0),
      };
    }

    // 🚀 PRAWDZIWE LAZY LOADING: Pobierz tylko potrzebną ilość danych
    console.log(`🔄 Fetching page ${limitedPage}/${MAX_PAGES} from Firebase (${pageSize} users)...`);
    
    // POBIERAMY OD RAZU CALY ZESTAW (50), NIE TYLKO BIEZACA STRONE.
    //
    // Wczesniej bylo `limitedPage * pageSize`, czyli przy pierwszym wejsciu 10 -
    // a getCachedActiveUsers dokłada 20% zapasu, wiec z Firestore wracalo
    // dokladnie 12 dokumentow. To jest odpowiedz na pytanie "czemu Most Active
    // pokazuje tylko 12 osob".
    //
    // Gorsze bylo to, ze funkcja i tak RAPORTOWALA 5 stron i 50 uzytkownikow
    // niezaleznie od tego, ile danych przyszlo. Paginacja obiecywala strony,
    // ktorych nie mialo z czego zbudowac.
    //
    // 50 dokumentow to jeden odczyt na okno cache'u - roznica wobec 12 jest
    // kosztowo nieistotna, a lista przestaje klamac.
    const allUsers = await getCachedActiveUsers(MAX_USERS, forceRefresh);
    
    // Podziel na strony (maksymalnie 5 stron)
    const pages: any[][] = [];
    const availablePages = Math.min(MAX_PAGES, Math.ceil(allUsers.length / pageSize));
    
    for (let i = 0; i < availablePages; i++) {
      const startIdx = i * pageSize;
      const endIdx = Math.min(startIdx + pageSize, allUsers.length);
      pages[i] = allUsers.slice(startIdx, endIdx);
    }
    
    // Aktualizuj cache
    paginatedActiveUsersCache = {
      pages,
      currentPage: limitedPage,
      totalPages: Math.max(1, availablePages),
      lastUpdated: now,
      pageSize
    };
    
    console.log(`✅ Paginated cache updated: ${pages.length}/${MAX_PAGES} pages available, Firebase reads: ${allUsers.length}`);
    
    // Zwróć żądaną stronę
    const currentPageUsers = pages[pageIndex] || [];
    
    // Liczby RZECZYWISTE, nie deklarowane. Wczesniej szly tu MAX_PAGES
    // i MAX_USERS niezaleznie od tego, ile danych faktycznie przyszlo.
    return {
      users: currentPageUsers,
      currentPage: limitedPage,
      totalPages: Math.max(1, availablePages),
      hasNext: limitedPage < availablePages,
      hasPrev: limitedPage > 1,
      totalUsers: allUsers.length
    };
    
  } catch (error) {
    console.error('❌ Error fetching paginated active users:', error);
    
    // Fallback: zwróć cache jeśli istnieje
    const pageIndex = Math.min(page, 5) - 1;
    if (paginatedActiveUsersCache.pages[pageIndex]) {
      return {
        users: paginatedActiveUsersCache.pages[pageIndex],
        currentPage: Math.min(page, 5),
        totalPages: 5,
        hasNext: Math.min(page, 5) < 5,
        hasPrev: Math.min(page, 5) > 1,
        totalUsers: 50
      };
    }
    
    return {
      users: [],
      currentPage: 1,
      totalPages: 5,
      hasNext: false,
      hasPrev: false,
      totalUsers: 50
    };
  }
};

// Wyczyść cache paginowanych użytkowników
export const clearPaginatedActiveUsersCache = () => {
  paginatedActiveUsersCache = {
    pages: [],
    currentPage: 0,
    totalPages: 0,
    lastUpdated: 0,
    pageSize: 10
  };
  console.log('🗑️ Paginated active users cache cleared');
};

// Pobierz informacje o cache
export const getPaginatedActiveUsersCacheInfo = () => {
  const now = Date.now();
  const age = now - paginatedActiveUsersCache.lastUpdated;
  const isExpired = age > PAGINATED_CACHE_TTL;
  
  return {
    totalPages: paginatedActiveUsersCache.totalPages,
    pageSize: paginatedActiveUsersCache.pageSize,
    lastUpdated: paginatedActiveUsersCache.lastUpdated,
    ageInMinutes: Math.floor(age / 60000),
    isExpired,
    cachedPages: paginatedActiveUsersCache.pages.length
  };
};

// ================================
// 💰 PAID PINS FUNCTIONS
// ================================

/**
 * Pin Duration types for paid pins
 */
export type PinDuration = 'HOUR_1' | 'HOURS_6' | 'HOURS_24' | 'DAYS_7';

/**
 * Calculate expiration time for pin duration
 */
export const calculatePinExpirationTime = (duration: PinDuration, startTime?: number): number => {
  const start = startTime || Date.now();
  const durations = {
    'HOUR_1': 60 * 60 * 1000,
    'HOURS_6': 6 * 60 * 60 * 1000, 
    'HOURS_24': 24 * 60 * 60 * 1000,
    'DAYS_7': 7 * 24 * 60 * 60 * 1000
  };
  return start + durations[duration];
};

/**
 * Płatne przypięcie posta - wywołane po udanej transakcji smart contract
 */
export const createPaidPin = async (
  postId: string, 
  userAddress: string, 
  duration: PinDuration,
  txHash: string,
  amountPaid: string,
  chainId: number // łańcuch z którego przyszła transakcja
): Promise<boolean> => {
  try {
    // 🔥 KLUCZOWA WALIDACJA - akceptuj tylko z Base Mainnet
    if (chainId !== 8453) { // 8453 to chainId dla Base Mainnet
      console.error(`❌ Pin rejected: Invalid chainId ${chainId}. Only Base Mainnet (8453) is allowed.`);
      // Można dodatkowo zapisać log o próbie oszustwa
      return false;
    }

    const postRef = doc(db, 'posts', postId);
    const pinRef = doc(collection(db, 'paidPins'));

    const expirationTime = calculatePinExpirationTime(duration);
    const now = Date.now();

    const pinData = {
      id: pinRef.id,
      postId,
      owner: userAddress.toLowerCase(),
      duration,
      paidAmount: amountPaid,
      txHash,
      isActive: true,
      createdAt: now,
      expiresAt: expirationTime,
      chainId: chainId // Zapisz chainId dla audytu
    };

    const postUpdateData = {
      isPinned: true,
      isPaidPin: true,
      pinExpiresAt: expirationTime,
      pinnedAt: now,
      pinDuration: duration,
      pinOwner: userAddress.toLowerCase(),
      pinTxHash: txHash
    };

    const batch = writeBatch(db);
    batch.set(pinRef, pinData);
    batch.update(postRef, postUpdateData);

    await batch.commit();

    console.log(`✅ Post ${postId} successfully pinned by ${userAddress} for ${duration}. TX: ${txHash}`);
    return true;

  } catch (error) {
    console.error(`Error in createPaidPin for postId ${postId}:`, error);
    return false;
  }
};

/**
 * Sprawdź czy post może być przypięty (nie jest już przypięty)
 */
export const canPinPost = async (postId: string): Promise<boolean> => {
  try {
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    
    if (!postDoc.exists()) {
      return false;
    }

    const postData = postDoc.data();
    return !postData.isPinned;
  } catch (error) {
    console.error('❌ Error checking if post can be pinned:', error);
    return false;
  }
};

/**
 * Automatyczne usuwanie wygasłych paid pins - dla cron job
 */
export const cleanupExpiredPaidPins = async (): Promise<{
  expiredCount: number;
  errors: string[];
}> => {
  try {
    const now = Date.now();
    const result = {
      expiredCount: 0,
      errors: [] as string[]
    };

    // Znajdź wszystkie wygasłe paid pins
    const expiredQuery = query(
      collection(db, 'posts'),
      where('isPaidPin', '==', true),
      where('pinExpiresAt', '<=', now)
    );

    const expiredPosts = await getDocs(expiredQuery);

    // Usuń pin z każdego wygasłego posta
    for (const postDoc of expiredPosts.docs) {
      try {
        await updateDoc(postDoc.ref, {
          isPinned: false,
          isPaidPin: false,
          pinExpiresAt: deleteField(),
          pinDuration: deleteField(),
          pinOwner: deleteField(),
          pinAmountPaid: deleteField(),
          pinTxHash: deleteField()
        });

        // Zaktualizuj status w kolekcji paidPins
        const paidPinsQuery = query(
          collection(db, 'paidPins'),
          where('postId', '==', postDoc.id),
          where('isActive', '==', true)
        );
        
        const paidPinsSnapshot = await getDocs(paidPinsQuery);
        for (const paidPinDoc of paidPinsSnapshot.docs) {
          await updateDoc(paidPinDoc.ref, {
            isActive: false,
            expiredAt: serverTimestamp()
          });
        }

        result.expiredCount++;
      } catch (error) {
        result.errors.push(`Failed to cleanup post ${postDoc.id}: ${error}`);
      }
    }

    console.log(`🧹 Cleanup completed: ${result.expiredCount} expired pins removed`);
    return result;
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    return {
      expiredCount: 0,
      errors: [`Cleanup failed: ${error}`]
    };
  }
};

// 🔧 NAPRAWKA: Funkcja do naprawy statystyk użytkowników
export const fixUserPostStats = async (userAddress: string): Promise<{ before: any, after: any }> => {
  try {
    console.log(`🔧 Naprawiam statystyki dla użytkownika: ${userAddress}`);
    
    // Pobierz obecne dane użytkownika
    const userRef = doc(db, 'users', userAddress);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data();
    const currentStats = {
      postsCount: userData.postsCount || 0,
      likesReceived: userData.likesReceived || 0,
      statsComments: userData.stats?.comments || 0
    };
    
    // Policz rzeczywiste posty użytkownika
    const postsRef = collection(db, 'posts');
    const userPostsQuery = query(postsRef, where('author', '==', userAddress));
    const postsSnapshot = await getDocs(userPostsQuery);
    
    let totalLikes = 0;
    postsSnapshot.forEach((doc) => {
      const postData = doc.data();
      totalLikes += postData.likes || 0;
    });
    
    const realStats = {
      postsCount: postsSnapshot.size,
      likesReceived: totalLikes,
      // Komentarze zostają bez zmian - są aktualizowane poprawnie
      statsComments: currentStats.statsComments
    };
    
    // Zaktualizuj tylko jeśli są różnice
    if (currentStats.postsCount !== realStats.postsCount || 
        currentStats.likesReceived !== realStats.likesReceived) {
      
      await updateDoc(userRef, {
        postsCount: realStats.postsCount,
        likesReceived: realStats.likesReceived,
        'stats.posts': realStats.postsCount,
        'stats.likes': realStats.likesReceived,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`✅ Naprawiono statystyki dla ${userAddress}:`, {
        postsCount: `${currentStats.postsCount} → ${realStats.postsCount}`,
        likesReceived: `${currentStats.likesReceived} → ${realStats.likesReceived}`
      });
    } else {
      console.log(`✅ Statystyki ${userAddress} są już poprawne`);
    }
    
    return {
      before: currentStats,
      after: realStats
    };
    
  } catch (error) {
    console.error(`❌ Error fixing stats for ${userAddress}:`, error);
    throw error;
  }
};

// 🔧 ADMIN ONLY: Napraw statystyki dla wszystkich użytkowników (DROGIE!)
export const fixAllUserStats = async (): Promise<{ success: boolean, fixed: number, errors: string[] }> => {
  try {
    console.log('🔧 ADMIN: Rozpoczynam naprawę statystyk wszystkich użytkowników...');
    
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let fixedCount = 0;
    const errors: string[] = [];
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const result = await fixUserPostStats(userDoc.id);
        if (result.before.postsCount !== result.after.postsCount || 
            result.before.likesReceived !== result.after.likesReceived) {
          fixedCount++;
        }
      } catch (error) {
        const errorMsg = `${userDoc.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`❌ Error fixing ${userDoc.id}:`, error);
      }
    }
    
    console.log(`✅ ADMIN: Naprawa zakończona. Naprawiono: ${fixedCount} użytkowników`);
    if (errors.length > 0) {
      console.warn(`⚠️ Błędy dla ${errors.length} użytkowników:`, errors);
    }
    
    return {
      success: true,
      fixed: fixedCount,
      errors
    };
    
  } catch (error) {
    console.error('❌ ADMIN: Error during mass stats fix:', error);
    return {
      success: false,
      fixed: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
};

// 🔧 ADMIN: Rebuild referral aggregates and sync to users.baseChatPoints
export const rebuildReferralAggregates = async (): Promise<{ success: boolean; updatedUsers: number; errors: string[] }> => {
  try {
    console.log('🔧 ADMIN: Rebuilding referral aggregates from referralRewards...');
    const errors: string[] = [];
    let updatedUsers = 0;

    // 1) Pobierz wszystkie nagrody referral
    const rewardsSnap = await getDocs(collection(db, 'referralRewards'));

    // 2) Zgrupuj sumy per userId
    const sumsByUser: Record<string, number> = {};
    rewardsSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const userId = data.userId;
      // Sanity clamp: amount must be within expected reward ranges
      let amount = Number(data.amount || 0);
      if (!Number.isFinite(amount)) amount = 0;
      if (amount < 0) amount = 0;
      // Twarde limity bezpieczeństwa per typ nagrody
      switch (data.type) {
        case 'signup':
          amount = Math.min(amount, DEFAULT_REFERRAL_CONFIG.rewardPerReferral);
          break;
        case 'first_post':
          amount = Math.min(amount, DEFAULT_REFERRAL_CONFIG.firstPostBonus);
          break;
        case 'milestone':
          // Milestony znane: 5/10/25/50
          amount = Math.min(amount, Math.max(
            DEFAULT_REFERRAL_CONFIG.milestoneRewards.fifty,
            DEFAULT_REFERRAL_CONFIG.milestoneRewards.twentyFive,
            DEFAULT_REFERRAL_CONFIG.milestoneRewards.ten,
            DEFAULT_REFERRAL_CONFIG.milestoneRewards.five
          ));
          break;
        default:
          // 'special' lub nieznane: z clampem defensywnym
          amount = Math.min(amount, 5000);
      }
      if (!userId) return;
      sumsByUser[userId] = (sumsByUser[userId] || 0) + amount;
    });

    // 3) Zaktualizuj referralStats.totalRewards oraz users.baseChatPoints.referralPoints/totalPoints
    const batchSize = 500;
    let ops = 0;
    let batch = writeBatch(db);

    const commitBatch = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    };

    // Jedno zapytanie na 30 uzytkownikow zamiast getDoc() w kazdym obrocie petli.
    const usersById = await fetchDocsByIds('users', Object.keys(sumsByUser));

    for (const [userId, sum] of Object.entries(sumsByUser)) {
      try {
        // referralStats
        const statsRef = doc(db, 'referralStats', userId);
        batch.set(statsRef, { totalRewards: sum, lastUpdated: serverTimestamp() }, { merge: true });
        ops++;

        // users.baseChatPoints
        const userRef = doc(db, 'users', userId);
        const userData = (usersById.get(userId) || {}) as any;
        const bcp = userData.baseChatPoints || {};
        const postPoints = Number(bcp.postPoints || 0);
        const likePoints = Number(bcp.likePoints || 0);
        const activityBonus = Number(bcp.activityBonus || 0);
        const baseNameBonus = Number(bcp.baseNameBonus || (typeof userData.name === 'string' && userData.name.endsWith('.base.eth') ? 1000 : 0));
        const referralPoints = Number(sum || 0);
        const totalPoints = postPoints + likePoints + activityBonus + baseNameBonus + referralPoints;

        batch.set(userRef, {
          baseChatPoints: {
            postPoints,
            likePoints,
            activityBonus,
            baseNameBonus,
            referralPoints,
            totalPoints,
            lastUpdated: serverTimestamp()
          }
        }, { merge: true });
        ops++;

        updatedUsers++;
        if (ops >= batchSize - 2) {
          await commitBatch();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Referral aggregate update failed for ${userId}:`, msg);
        errors.push(`${userId}: ${msg}`);
      }
    }

    await commitBatch();
    console.log(`✅ ADMIN: Referral aggregates rebuilt for ${updatedUsers} users`);
    return { success: true, updatedUsers, errors };
  } catch (error) {
    console.error('❌ ADMIN: rebuildReferralAggregates failed:', error);
    return { success: false, updatedUsers: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] };
  }
};

// 🔧 ADMIN: STRICT recompute referral points from referrals collection (ignores referralRewards)
export const recomputeReferralPointsStrict = async (): Promise<{
  success: boolean;
  updatedUsers: number;
  processedReferrals: number;
  errors: string[];
}> => {
  try {
    console.log('🔧 ADMIN: STRICT recompute of referral points (from referrals)...');
    const errors: string[] = [];

    // 1) Zbierz dane z referrals: completed count i firstPostBonusAwarded per referrer
    const referralsSnap = await getDocs(collection(db, 'referrals'));
    const byReferrer: Record<string, { completed: number; firstPostBonuses: number }> = {};
    let processed = 0;

    referralsSnap.docs.forEach((docSnap) => {
      const r = docSnap.data() as any;
      const referrerId = r.referrerId;
      if (!referrerId) return;
      if (!byReferrer[referrerId]) byReferrer[referrerId] = { completed: 0, firstPostBonuses: 0 };
      if (r.status === 'completed') byReferrer[referrerId].completed++;
      if (r.firstPostBonusAwarded === true) byReferrer[referrerId].firstPostBonuses++;
      processed++;
    });

    // 2) Przelicz strict points wg konfiguracji i zaktualizuj referralStats oraz users.baseChatPoints
    const batchSize = 500;
    let ops = 0;
    let batch = writeBatch(db);
    let updatedUsers = 0;

    const commitBatch = async () => {
      if (ops > 0) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    };

    // Jedno zapytanie na 30 uzytkownikow zamiast getDoc() w kazdym obrocie petli.
    const usersById = await fetchDocsByIds('users', Object.keys(byReferrer));

    for (const [userId, agg] of Object.entries(byReferrer)) {
      try {
        const completed = agg.completed || 0;
        // ZGODNIE Z DEFINICJĄ: successful oznacza, że polecony zrobił pierwszy post
        const firstPosts = completed;

        // Milestone rewards by thresholds
        let milestoneTotal = 0;
        if (completed >= 5) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.five;
        if (completed >= 10) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.ten;
        if (completed >= 25) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.twentyFive;
        if (completed >= 50) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.fifty;

        const signupTotal = completed * DEFAULT_REFERRAL_CONFIG.rewardPerReferral;
        const firstPostTotal = Math.min(firstPosts, completed) * DEFAULT_REFERRAL_CONFIG.firstPostBonus;
        const strictReferralPoints = signupTotal + firstPostTotal + milestoneTotal;

        // Update referralStats
        const statsRef = doc(db, 'referralStats', userId);
        batch.set(
          statsRef,
          {
            totalRewards: strictReferralPoints,
            successfulReferrals: completed,
            lastUpdated: serverTimestamp(),
            milestones: {
              five: completed >= 5,
              ten: completed >= 10,
              twentyFive: completed >= 25,
              fifty: completed >= 50,
            },
          },
          { merge: true }
        );
        ops++;

        // Update users.baseChatPoints
        const userRef = doc(db, 'users', userId);
        const userData = (usersById.get(userId) || {}) as any;
        const bcp = userData.baseChatPoints || {};
        const postPoints = Number(bcp.postPoints || 0);
        const likePoints = Number(bcp.likePoints || 0);
        const activityBonus = Number(bcp.activityBonus || 0);
        const baseNameBonus = Number(bcp.baseNameBonus || (typeof userData.name === 'string' && userData.name.endsWith('.base.eth') ? 1000 : 0));
        const totalPoints = postPoints + likePoints + activityBonus + baseNameBonus + strictReferralPoints;

        batch.set(
          userRef,
          {
            baseChatPoints: {
              postPoints,
              likePoints,
              activityBonus,
              baseNameBonus,
              referralPoints: strictReferralPoints,
              totalPoints,
              lastUpdated: serverTimestamp(),
            },
          },
          { merge: true }
        );
        ops++;

        updatedUsers++;
        if (ops >= batchSize - 2) {
          await commitBatch();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`STRICT recompute failed for ${userId}:`, msg);
        errors.push(`${userId}: ${msg}`);
      }
    }

    await commitBatch();
    console.log(`✅ ADMIN: STRICT referral points recomputed for ${updatedUsers} users`);
    return { success: true, updatedUsers, processedReferrals: processed, errors };
  } catch (error) {
    console.error('❌ ADMIN: recomputeReferralPointsStrict failed:', error);
    return { success: false, updatedUsers: 0, processedReferrals: 0, errors: [error instanceof Error ? error.message : 'Unknown error'] };
  }
};

// STRICT: Recompute referral points for single user and sync stats
export const recomputeUserReferralPointsStrict = async (userId: string): Promise<{
  success: boolean;
  successful: number;
  firstPosts: number;
  referralPoints: number;
}> => {
  try {
    // Zlicz referrals danego użytkownika
    const q = query(collection(db, 'referrals'), where('referrerId', '==', userId));
    const snap = await getDocs(q);
    let successful = 0;
    let firstPosts = 0;
    snap.docs.forEach((d) => {
      const r = d.data() as any;
      if (r.status === 'completed') successful++;
      if (r.firstPostBonusAwarded === true) firstPosts++;
    });

    // Milestony
    let milestoneTotal = 0;
    if (successful >= 5) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.five;
    if (successful >= 10) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.ten;
    if (successful >= 25) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.twentyFive;
    if (successful >= 50) milestoneTotal += DEFAULT_REFERRAL_CONFIG.milestoneRewards.fifty;

    // Zgodnie z definicją: successful oznacza pierwszy post
    const signupTotal = successful * DEFAULT_REFERRAL_CONFIG.rewardPerReferral;
    const firstPostTotal = successful * DEFAULT_REFERRAL_CONFIG.firstPostBonus;
    const total = signupTotal + firstPostTotal + milestoneTotal;

    // Zapis do referralStats
    const statsRef = doc(db, 'referralStats', userId);
    await setDoc(
      statsRef,
      {
        userId,
        successfulReferrals: successful,
        totalReferrals: snap.size,
        totalRewards: total,
        lastUpdated: serverTimestamp(),
        milestones: {
          five: successful >= 5,
          ten: successful >= 10,
          twentyFive: successful >= 25,
          fifty: successful >= 50,
        },
      },
      { merge: true }
    );

    return { success: true, successful, firstPosts: successful, referralPoints: total };
  } catch (e) {
    console.error('recomputeUserReferralPointsStrict error:', e);
    return { success: false, successful: 0, firstPosts: 0, referralPoints: 0 };
  }
};

// STRICT: Fully recompute ranking points for a single user (posts/likes already stored)
export const fixUserRankingStrict = async (userAddress: string): Promise<{
  success: boolean;
  before?: any;
  after?: any;
}> => {
  try {
    const userRef = doc(db, 'users', userAddress);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) throw new Error('User not found');

    const data = userSnap.data() as any;
    const postsCount = Number(data.postsCount || 0);
    const likesReceived = Number(data.likesReceived || 0);
    const postPoints = postsCount * 5;
    const likePoints = likesReceived;
    const activityBonus = Math.round((postPoints + likePoints) * 0.25);
    const baseNameBonus = (typeof data.name === 'string' && data.name.endsWith('.base.eth'))
      ? 1000
      : Number(data.baseChatPoints?.baseNameBonus || 0);

    // STRICT referral recompute for this user
    const referral = await recomputeUserReferralPointsStrict(userAddress);
    const referralPoints = referral.referralPoints;
    const totalPoints = postPoints + likePoints + activityBonus + baseNameBonus + referralPoints;

    const before = {
      baseChatPoints: data.baseChatPoints || null,
      postsCount,
      likesReceived,
    };

    await updateDoc(userRef, {
      baseChatPoints: {
        postPoints,
        likePoints,
        activityBonus,
        baseNameBonus,
        referralPoints,
        totalPoints,
        lastUpdated: serverTimestamp(),
      },
    });

    const after = { postPoints, likePoints, activityBonus, baseNameBonus, referralPoints, totalPoints };
    return { success: true, before, after };
  } catch (e) {
    console.error('fixUserRankingStrict error:', e);
    return { success: false };
  }
};

// Funkcja migracyjna do kopiowania historycznych postów od użytkowników z BaseName
export const migrateHistoricalBaseNamePosts = async (): Promise<{
  success: boolean;
  processedPosts: number;
  migratedPosts: number;
  error?: string;
}> => {
  try {
    console.log('🔄 Rozpoczynam migrację historycznych postów dla użytkowników z BaseName...');
    
    // 1. Pobierz listę wszystkich użytkowników z BaseName
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    
    const baseNameUsers = baseNameSnapshot.docs.map(doc => doc.id);
    console.log(`📊 Znaleziono ${baseNameUsers.length} użytkowników z BaseName`);
    
    if (baseNameUsers.length === 0) {
      return {
        success: true,
        processedPosts: 0,
        migratedPosts: 0,
        error: 'Brak użytkowników z BaseName do migracji'
      };
    }
    
    // 2. Pobierz posty od użytkowników z BaseName (w grupach po 10 autorów)
    let totalProcessed = 0;
    let totalMigrated = 0;
    // `let`, nie `const`: po commit() WriteBatch jest zuzyty i kazdy kolejny
    // set() na nim rzuca wyjatkiem. Wczesniej probowano go "zresetowac" przez
    // Object.assign(batch, newBatch), co nie podmienia stanu wewnetrznego -
    // migracja powyzej 500 postow wywracala sie na pierwszym commicie.
    let batch = writeBatch(db);
    let batchCount = 0;
    const maxBatchSize = 500; // Firestore limit

    for (const userChunk of chunkArray(baseNameUsers, 10)) {
      // Pobierz posty dla tej grupy użytkowników
      const postsRef = collection(db, 'posts');
      const postsQuery = query(postsRef, where('author', 'in', userChunk));
      const postsSnapshot = await getDocs(postsQuery);

      // Ktore z tych postow sa juz w baseNameFeed - jedno zapytanie na 30 ID
      // zamiast getDoc() per post (to byl klasyczny odczyt N+1).
      const existingIds = await fetchDocsByIds('baseNameFeed', postsSnapshot.docs.map(d => d.id));

      for (const postDoc of postsSnapshot.docs) {
        totalProcessed++;
        if (existingIds.has(postDoc.id)) continue;

        batch.set(doc(db, 'baseNameFeed', postDoc.id), postDoc.data());
        totalMigrated++;
        batchCount++;

        // Wykonaj batch jeśli osiągnęliśmy limit
        if (batchCount >= maxBatchSize) {
          await batch.commit();
          console.log(`✅ Batch wykonany: ${batchCount} postów skopiowanych`);
          batch = writeBatch(db);
          batchCount = 0;
        }
      }

      console.log(`📊 Przetworzono ${totalProcessed} postów, skopiowano ${totalMigrated}`);
    }

    // Wykonaj ostatni batch jeśli zawiera jakieś operacje
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✅ Ostatni batch wykonany: ${batchCount} postów skopiowanych`);
    }
    
    console.log(`🎉 Migracja zakończona:
    - Przetworzono postów: ${totalProcessed}
    - Zmigrowano nowych postów: ${totalMigrated}
    - Użytkowników z BaseName: ${baseNameUsers.length}`);
    
    return {
      success: true,
      processedPosts: totalProcessed,
      migratedPosts: totalMigrated
    };
    
  } catch (error) {
    console.error('❌ Błąd podczas migracji:', error);
    return {
      success: false,
      processedPosts: 0,
      migratedPosts: 0,
      error: error instanceof Error ? error.message : 'Nieznany błąd podczas migracji'
    };
  }
};

// Funkcja do pobierania liczby użytkowników z BaseName
export const getUsersWithBasenameCount = async (): Promise<number> => {
  try {
    const usernamesRef = collection(db, 'usernames');
    const baseNameQuery = query(usernamesRef, where('isBaseName', '==', true));
    const baseNameSnapshot = await getDocs(baseNameQuery);
    return baseNameSnapshot.size;
  } catch (error) {
    console.error("Błąd podczas pobierania liczby użytkowników z BaseName:", error);
    /**
     * @throws zamiast `0`. Panel pokazywal "0 uzytkownikow z BaseName" jako
     * wynik pomiaru; wolajacy (app/admin/page.tsx) ma juz `catch`, ktory
     * ustawia `null`, wiec ta sciezka byla martwa.
     */
    throw error;
  }
};