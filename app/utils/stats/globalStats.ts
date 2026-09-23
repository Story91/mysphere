import { doc, getDoc } from 'firebase/firestore';
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
 * Zamiast tego: liczby przelicza RAZ NA DOBE serwer (app/api/stats/recount/
 * route.ts, cron w vercel.json) i zapisuje kluczem administracyjnym, a feed
 * czyta JEDEN dokument. Jeden odczyt na wejscie, liczby prawdziwe, a ich wiek
 * jest jawny.
 *
 * Wczesniej zapisywal je panel admina po recznym kliknieciu "Policz" - z
 * przegladarki, wiec dokument musial byc otwarty do zapisu dla kazdego,
 * a liczby staly, dopoki nikt nie kliknal. Ta droga jest usunieta; plik nie
 * eksportuje juz zadnej funkcji zapisujacej i nie powinien.
 *
 * === POLA likesSince / likesBaseline* SA HISTORYCZNE ===
 * Opisy przy nich nizej dotycza okresu, gdy agregacje zwracaly
 * RESOURCE_EXHAUSTED i lajki skladalo sie ze starej migawki i licznika
 * w przegladarce. Pierwszy przebieg crona zapisuje pelne `likes` i kasuje
 * te pola. Typ i galezie w likesTotal() zostaja na czas przejscia (dokument
 * sprzed pierwszego przebiegu); do usuniecia w osobnej zmianie.
 *
 * === WIEK JEST CZESCIA ODPOWIEDZI ===
 * `measuredAt` wraca razem z liczbami, bo licznik sprzed tygodnia to co innego
 * niz licznik sprzed godziny. Interfejs ma powiedziec, kiedy to zmierzono -
 * inaczej stara liczba udaje swieza, czyli wracamy do punktu wyjscia.
 */

const STATS_DOC = 'globalStats';
const STATS_ID = 'current';

/** Pochodzenie `likesBaseline`. Opis przy polu w `GlobalStats`. */
export type LikesBaselineSource = 'scan' | 'snapshot';

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
   * Stan poczatkowy lajkow: to, co bylo na postach ZANIM ruszyl licznik.
   *
   * Bez tego pola `likesSince` nigdy nie bedzie liczba calkowita - zaczyna od
   * zera w chwili wlaczenia licznika i nie wie nic o cwierc milionie postow,
   * ktore juz maja lajki. Zmierzone w bazie: dokument globalStats/current mial
   * `likesSince: 6` i ZERO pola `likes`, czyli calkowitej liczby nie bylo
   * z czego zlozyc.
   *
   * Wpisac to moga DWA skrypty i to nie jest to samo:
   *   scripts/countLikesBaseline.cjs          - skan cwierc miliona postow,
   *     liczba dokladna, zapisuje `likesBaselineSource: 'scan'`;
   *   scripts/setLikesBaselineFromSnapshot.cjs - zamrozona liczba z historii
   *     kodu, zero odczytow, zapisuje `likesBaselineSource: 'snapshot'`.
   *
   * Roznice miedzy nimi trzyma `likesBaselineSource` i to ona decyduje, co
   * interfejs ma napisac pod liczba. Nie czytaj tego pola bez tamtego.
   */
  likesBaseline?: number | null;
  /**
   * Z KTOREGO MOMENTU pochodzi `likesBaseline` - dla skanu dzien liczenia, dla
   * migawki dzien, ktory ta migawka opisuje. 0 = nie wiadomo.
   */
  likesBaselineAt?: number;
  /**
   * SKAD wziety stan poczatkowy - i to decyduje, czy suma jest liczba dokladna.
   *
   * `'scan'`     - policzony skanem TERAZ (countLikesBaseline.cjs). Skan widzi
   *                lajki takie, jakie sa w chwili liczenia, i przy zapisie zeruje
   *                licznik przyrostowy, wiec `likesBaseline + likesSince` nie ma
   *                ani luki, ani zakladki. Liczba DOKLADNA.
   * `'snapshot'` - liczba wyjeta z zamrozonej migawki w historii kodu, czyli opis
   *                DAWNEGO dnia. Miedzy tamtym dniem a wlaczeniem licznika
   *                przyrostowego jest okres, ktorego NIKT nie policzyl. Suma jest
   *                wiec DOLNA GRANICA, nie pomiarem - i interfejs ma to napisac.
   *
   * Brak pola traktujemy jak `'snapshot'`, nie jak `'scan'` - patrz likesTotal().
   */
  likesBaselineSource?: LikesBaselineSource | null;
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

/**
 * Pochodzenie stanu poczatkowego. Wszystko, co nie jest jawnym `'scan'` albo
 * `'snapshot'`, wraca jako `null` - a `null` zostanie nizej potraktowany jak
 * migawka, czyli ostrozniej. Nierozpoznany napis nie moze awansowac liczby do
 * rangi pomiaru.
 */
function toBaselineSource(value: unknown): LikesBaselineSource | null {
  return value === 'scan' || value === 'snapshot' ? value : null;
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
        likesBaselineSource: toBaselineSource(data.likesBaselineSource),
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
 * Calkowita liczba lajkow zlozona z tego, co faktycznie wiemy.
 *
 * === DLACZEGO TO NIE JEST JEDNO POLE ===
 * Lajki nie maja wlasnej kolekcji - siedza jako pole `likes` na postach, wiec
 * ich policzenie to suma po 263 613 dokumentach, a agregacje w tym projekcie
 * zwracaja RESOURCE_EXHAUSTED. Liczba calkowita powstaje wiec z dwoch czesci:
 * jednorazowego stanu poczatkowego (`likesBaseline`, liczonego serwerowo) i
 * licznika przyrostowego (`likesSince`, +1/-1 przy kazdym lajku).
 *
 * === DLACZEGO `basis`, A NIE `complete: boolean` ===
 * Bylo tu jedno pole `complete`. Dwa stany nie wystarczaja, bo suma zlozona ze
 * STAREJ migawki nie jest ani calkowita, ani "tylko od wlaczenia licznika" -
 * jest DOLNA GRANICA: zna przeszlosc do dnia migawki i terazniejszosc od startu
 * licznika, a nie zna okresu pomiedzy. Wcisniecie tego w `complete: true` (bo
 * przeciez stan poczatkowy jest) opisaloby domysl jako pomiar, a w `false` -
 * skasowaloby fakt, ze cwierc miliona starych lajkow JEST juz w tej liczbie.
 * Kazdy z tych stanow ma inne zdanie do napisania na ekranie, wiec ma wlasna
 * nazwe.
 *
 * `value: null` znaczy "nie wiemy" i ma sie pokazac jako kreska, nie jako zero.
 */
export type LikesBasis =
  /** Pelna suma na teraz. Nie ma czego dopowiadac. */
  | 'exact'
  /** Stara migawka + przyrost. Luka pomiedzy nie policzona, wiec to DOLNA GRANICA. */
  | 'lowerBound'
  /** Sam licznik przyrostowy. Liczba prawdziwa, ale nie zna niczego sprzed wlaczenia. */
  | 'sinceOnly'
  /** Nie wiadomo nic. */
  | 'unknown';

export type LikesTotal = {
  value: number | null;
  basis: LikesBasis;
  /**
   * Data, o ktora opiera sie zastrzezenie: przy `lowerBound` dzien migawki,
   * przy `sinceOnly` start licznika. 0 = nie wiadomo.
   */
  since: number;
};

export function likesTotal(stats: GlobalStats | null): LikesTotal {
  if (!stats) return { value: null, basis: 'unknown', since: 0 };

  // Pelna suma z dobowego przeliczenia (app/api/stats/recount) - wtedy nie ma
  // co skladac. Od pierwszego przebiegu crona to jest jedyna droga; nizsze
  // galezie obsluguja dokument sprzed niego.
  if (stats.likes !== null && stats.likes !== undefined) {
    return { value: stats.likes, basis: 'exact', since: 0 };
  }

  const since = stats.likesSince ?? 0;

  if (stats.likesBaseline !== null && stats.likesBaseline !== undefined) {
    // Skan liczy stan NA TERAZ i przy zapisie zeruje licznik przyrostowy, wiec
    // obie czesci stykaja sie dokladnie - suma jest pomiarem.
    //
    // Migawka opisuje dzien sprzed miesiecy. Licznik przyrostowy ruszyl duzo
    // pozniej, wiec lajki z okresu pomiedzy nie sa ani w jednej czesci, ani
    // w drugiej. Suma jest wtedy mniejsza od prawdy - i tylko tyle wolno o niej
    // powiedziec.
    //
    // Brak pola tez daje `lowerBound`: baseline nieznanego pochodzenia to
    // baseline, o ktorym nie wiemy, czy styka sie z licznikiem. Domyslanie sie
    // "pewnie skan" awansowaloby niewiedze do rangi pomiaru.
    const basis: LikesBasis = stats.likesBaselineSource === 'scan' ? 'exact' : 'lowerBound';
    return { value: stats.likesBaseline + since, basis, since: stats.likesBaselineAt ?? 0 };
  }

  // Zostal sam licznik przyrostowy. Zero jest tu prawdziwa odpowiedzia
  // ("od wlaczenia licznika nikt nie polajkowal"), o ile pole w ogole jest.
  if (stats.likesSince === null || stats.likesSince === undefined) {
    return { value: null, basis: 'unknown', since: 0 };
  }

  return { value: since, basis: 'sinceOnly', since: stats.likesSinceStartedAt ?? 0 };
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

  switch (total.basis) {
    case 'exact':
    case 'unknown':
      return undefined;

    // Dwa slowa, bo tyle miesci sie pod liczba w kaflu o polowie szerokosci
    // panelu - i bo tyle wystarczy. Czytelnik ma wyjsc z przekonaniem "prawdziwa
    // liczba jest wyzsza", a nie "to jest wynik pomiaru". Data i powod luki ida
    // do dymka; gdyby zmiescic je tutaj, zastrzezenie przewazyloby sama liczbe
    // i zaczeloby brzmiec jak tlumaczenie sie.
    case 'lowerBound':
      return 'at least';

    case 'sinceOnly':
      if (!total.since) return 'partial count';
      return `since ${shortDate(total.since)}`;
  }
}

/**
 * Pelne zdanie do dymka nad liczba. Puste, gdy liczba nie wymaga zastrzezenia.
 *
 * Istnieje, bo krotki podpis z `likesNote` musi sie zmiescic w kaflu, a powod,
 * dla ktorego liczba jest niepelna, ROZNI SIE miedzy przypadkami. Wczesniej to
 * zdanie bylo wpisane na sztywno w SoftTrendsPanel jako "earlier ones are not
 * included yet" - prawda dla samego licznika przyrostowego, ale FALSZ dla sumy
 * z migawka: tam wlasnie te wczesniejsze lajki sa policzone, a brakuje srodka.
 * Panel nie ma skad tego wiedziec, wiec zdanie powstaje tam, gdzie sie to wie.
 */
export function likesDetail(total: LikesTotal): string | undefined {
  if (total.value === null) return undefined;

  switch (total.basis) {
    case 'exact':
    case 'unknown':
      return undefined;

    case 'lowerBound':
      // Bez myslnika w srodku: panel sklada dymek jako `${liczba} — ${detail}`,
      // wiec drugi myslnik rozbijalby zdanie na trzy czlony.
      return total.since
        ? `at least this many. A full count as of ${longDate(total.since)}, plus every like counted since the live counter started. Likes in between were never counted, so the real number is higher.`
        : 'at least this many. The count joins an older total to a live counter, and the stretch between them was never counted.';

    case 'sinceOnly':
      return total.since
        ? `counted live since ${shortDate(total.since)}. Likes from before that are not included yet.`
        : 'a partial count. Likes from before the live counter started are not included yet.';
  }
}

/** "Aug 6" - do zastrzezenia o swiezej dacie, gdzie rok jest oczywisty. */
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * "Aug 16, 2025" - z rokiem, bo migawka bywa sprzed kilkunastu miesiecy, a bez
 * roku "Aug 16" wyglada na zeszly tydzien i zastrzezenie traci caly sens.
 */
function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
