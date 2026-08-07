import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { toMillis } from '../firestoreTime';

/**
 * Globalne liczniki produktu - JEDEN dokument, JEDEN odczyt.
 *
 * === CO BYLO WCZESNIEJ ===
 * `fetchGlobalStats` w app/basechat/page.tsx nie czytalo niczego. Zwracalo
 * WPISANE NA SZTYWNO liczby:
 *
 *     userCount: 175708, postsCount: 239961, likesCount: 18817, ...
 *
 * a potem mnozylo kazda przez losowy wspolczynnik +/-1% z komentarzem
 * "dla realizmu". Czyli licznik zmienial sie na oczach czytelnika przy kazdym
 * wejsciu, zeby wygladac na zywy - bedac wymyslonym.
 *
 * Zmierzone tego samego dnia agregacja na produkcyjnej bazie:
 *     uzytkownicy  184 064   (na ekranie: 175 708)
 *     posty        263 613   (na ekranie: 239 961)
 *     komentarze    13 492   (na ekranie:  10 972)
 *
 * Na produkcie, ktorego cala teza brzmi "te liczby sa sprawdzalne i nie da
 * sie ich nabic", pierwsze cztery liczby na ekranie byly nabite.
 *
 * === DLACZEGO JEDEN DOKUMENT, A NIE LICZENIE NA ZYWO ===
 * Policzenie tego agregacja kosztuje okolo 467 odczytow. Zrobione przy KAZDYM
 * wejsciu na feed byloby to 467 odczytow na goscia - czyli dokladnie ten
 * koszt, przed ktorym uciekaly zmyslone liczby.
 *
 * Zamiast tego: liczby zapisuje panel admina po swoim (swiadomym, recznym)
 * przeliczeniu, a feed czyta JEDEN dokument. Jeden odczyt na wejscie, liczby
 * prawdziwe, a ich wiek jest jawny.
 *
 * === WIEK JEST CZESCIA ODPOWIEDZI ===
 * `measuredAt` wraca razem z liczbami, bo licznik sprzed tygodnia to co innego
 * niz licznik sprzed godziny. Interfejs ma powiedziec, kiedy to zmierzono -
 * inaczej stara liczba udaje swieza, czyli wracamy do punktu wyjscia.
 */

const STATS_DOC = 'globalStats';
const STATS_ID = 'current';

export type GlobalStats = {
  /**
   * `null` znaczy "nie zmierzono", NIE "zero".
   *
   * Pole moze byc puste, bo pomiar bywa czesciowy: dobowy limit zapytan
   * agregujacych w Firestore potrafi sie skonczyc w polowie liczenia. Zapisanie
   * wtedy zera zamienioloby brak wiedzy w twierdzenie - a to dokladnie ten blad,
   * ktory ten plik naprawia.
   */
  users: number | null;
  posts: number | null;
  likes: number | null;
  /**
   * Lajki policzone PRZYROSTOWO, od momentu wlaczenia licznika.
   *
   * Osobne pole od `likes` celowo. `likes` to pelna suma z agregacji;
   * `likesSince` to liczba narastajaca od wlaczenia licznika i NIE OBEJMUJE
   * lajkow wczesniejszych. Wrzucenie obu do jednego pola dawaloby liczbe,
   * o ktorej nikt nie wie, czy jest calkowita - a interfejs ma to powiedziec.
   *
   * Powstalo, bo agregacje w tym projekcie zwracaja RESOURCE_EXHAUSTED nawet
   * dla pustej kolekcji, wiec `sum(posts.likes)` jest dzis niewykonalne.
   */
  likesSince?: number | null;
  /** Od kiedy liczy `likesSince`. 0 = nie wiadomo. */
  likesSinceStartedAt?: number;
  /**
   * Stan poczatkowy lajkow: suma pola `posts.likes` policzona RAZ, serwerowo.
   *
   * Bez tego pola `likesSince` nigdy nie bedzie liczba calkowita - zaczyna od
   * zera w chwili wlaczenia licznika i nie wie nic o cwierc milionie postow,
   * ktore juz maja lajki. Zmierzone w bazie: dokument globalStats/current mial
   * `likesSince: 6` i ZERO pola `likes`, czyli calkowitej liczby nie bylo
   * z czego zlozyc.
   *
   * Liczy to scripts/countLikesBaseline.cjs (firebase-admin, poza limitami
   * klienta). Skrypt przy zapisie ZERUJE `likesSince`, zeby lajki policzone
   * w skanie nie zostaly doliczone drugi raz - patrz naglowek skryptu.
   */
  likesBaseline?: number | null;
  /** Kiedy policzono `likesBaseline`. 0 = nie wiadomo. */
  likesBaselineAt?: number;
  comments: number | null;
  tips: number | null;
  /** Kiedy policzono. 0 = nie wiadomo. */
  measuredAt: number;
};

export type GlobalStatsResult = {
  stats: GlobalStats | null;
  /**
   * `true` = odczytu NIE udalo sie wykonac. `stats: null` przy `failed: false`
   * znaczy "nikt jeszcze nie policzyl" - to dwa rozne zdania i interfejs ma
   * je rozroznic. Ta sama zasada co na Paid i w profilu.
   */
  failed: boolean;
};

/** Brak pola albo wartosc bez sensu daje `null`, nigdy zero. */
function toCount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Jeden odczyt. Nigdy nie zmysla liczb - brak danych zwraca `null`. */
export async function getGlobalStats(): Promise<GlobalStatsResult> {
  try {
    const snapshot = await getDoc(doc(db, STATS_DOC, STATS_ID));
    if (!snapshot.exists()) return { stats: null, failed: false };

    const data = snapshot.data();
    return {
      stats: {
        users: toCount(data.users),
        posts: toCount(data.posts),
        likes: toCount(data.likes),
        likesSince: toCount(data.likesSince),
        likesSinceStartedAt: toMillis(data.likesSinceStartedAt),
        likesBaseline: toCount(data.likesBaseline),
        likesBaselineAt: toMillis(data.likesBaselineAt),
        comments: toCount(data.comments),
        tips: toCount(data.tips),
        measuredAt: toMillis(data.measuredAt),
      },
      failed: false,
    };
  } catch (error) {
    console.error('[globalStats] Odczyt nie powiodl sie:', error);
    return { stats: null, failed: true };
  }
}

/**
 * Zapis pomiaru. Wola WYLACZNIE panel admina, po udanym policzeniu.
 *
 * Nie zapisujemy czesciowych wynikow: jesli ktorakolwiek liczba nie doszla,
 * lepiej zostawic poprzedni pomiar w calosci, niz zmieszac swieze liczby ze
 * starymi w jednym dokumencie bez sladu, ktore sa ktore.
 *
 * === MERGE, I TO NIE JEST DROBIAZG ===
 * Bylo tu `setDoc` BEZ `{ merge: true }`, czyli zapis PODMIENIAJACY caly
 * dokument. Panel admina nie liczy lajkow (nie da sie ich policzyc agregacja),
 * wiec w jego danych `likesSince` i `likesBaseline` w ogole nie wystepuja -
 * a zapis bez merge KASOWAL oba. Kazde klikniecie "Policz" w /admin zerowalo
 * licznik lajkow narastajacy od jego wlaczenia i skasowaloby stan poczatkowy
 * policzony skryptem. Licznik przyrostowy, ktory kasuje go inny licznik, nie
 * dojdzie do calkowitej liczby nigdy - to jest jedna z przyczyn, dla ktorych
 * ta liczba nie pokazuje sie po raz trzeci.
 *
 * Merge nie psuje zasady wyzej: pola przekazane tutaj i tak nadpisuja stare
 * w calosci, a `likes: null` dalej jawnie znaczy "nie zmierzono".
 */
export async function saveGlobalStats(
  stats: Omit<GlobalStats, 'measuredAt'>
): Promise<void> {
  await setDoc(
    doc(db, STATS_DOC, STATS_ID),
    {
      ...stats,
      measuredAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Calkowita liczba lajkow zlozona z tego, co faktycznie wiemy.
 *
 * === DLACZEGO TO NIE JEST JEDNO POLE ===
 * Lajki nie maja wlasnej kolekcji - siedza jako pole `likes` na postach, wiec
 * ich policzenie to suma po 263 613 dokumentach, a agregacje w tym projekcie
 * zwracaja RESOURCE_EXHAUSTED. Liczba calkowita powstaje wiec z dwoch czesci:
 * jednorazowego stanu poczatkowego (`likesBaseline`, liczonego serwerowo) i
 * licznika przyrostowego (`likesSince`, +1/-1 przy kazdym lajku).
 *
 * === CO ZWRACA `complete` ===
 * Czy suma obejmuje CALA historie. Bez stanu poczatkowego mamy tylko lajki od
 * wlaczenia licznika - to jest liczba prawdziwa, ale nie jest calkowita, wiec
 * interfejs ma przy niej napisac, od kiedy liczy. Podanie jej jako calosci
 * byloby dokladnie tym samym klamstwem co wpisane na sztywno 18 817.
 *
 * `value: null` znaczy "nie wiemy" i ma sie pokazac jako kreska, nie jako zero.
 */
export type LikesTotal = {
  value: number | null;
  complete: boolean;
  /** Od kiedy liczy czesc przyrostowa. 0 = nie wiadomo. Ma sens przy `complete: false`. */
  since: number;
};

export function likesTotal(stats: GlobalStats | null): LikesTotal {
  if (!stats) return { value: null, complete: false, since: 0 };

  // Pelna suma z agregacji, gdyby limit kiedys wrocil - wtedy nie ma co skladac.
  if (stats.likes !== null && stats.likes !== undefined) {
    return { value: stats.likes, complete: true, since: 0 };
  }

  const since = stats.likesSince ?? 0;

  if (stats.likesBaseline !== null && stats.likesBaseline !== undefined) {
    // Stan poczatkowy + przyrost od jego policzenia. Skrypt zerujacy
    // `likesSince` przy zapisie stanu poczatkowego gwarantuje, ze te dwie
    // czesci sie nie nakladaja.
    return { value: stats.likesBaseline + since, complete: true, since: stats.likesBaselineAt ?? 0 };
  }

  // Zostal sam licznik przyrostowy. Zero jest tu prawdziwa odpowiedzia
  // ("od wlaczenia licznika nikt nie polajkowal"), o ile pole w ogole jest.
  if (stats.likesSince === null || stats.likesSince === undefined) {
    return { value: null, complete: false, since: 0 };
  }

  return { value: since, complete: false, since: stats.likesSinceStartedAt ?? 0 };
}

/**
 * Podpis pod liczba lajkow. Po angielsku, bo widzi go uzytkownik.
 *
 * Tekst powstaje TUTAJ, a nie w komponencie, bo to warstwa danych wie, czy
 * liczba jest calkowita - a komponent dostaje gotowe zdanie i nie ma jak
 * pokazac niepelnej sumy bez tego zastrzezenia.
 */
export function likesNote(total: LikesTotal): string | undefined {
  if (total.value === null) return undefined; // Kreska mowi juz wszystko.
  if (total.complete) return undefined;

  if (!total.since) return 'partial count';
  const date = new Date(total.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `since ${date}`;
}

/** Krotki, ludzki wiek pomiaru. */
export function statsAge(measuredAt: number, now = Date.now()): string {
  if (!measuredAt) return 'nieznany';
  const mins = Math.round((now - measuredAt) / 60000);
  if (mins < 1) return 'przed chwilą';
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} godz. temu`;
  return `${Math.round(hours / 24)} dni temu`;
}
