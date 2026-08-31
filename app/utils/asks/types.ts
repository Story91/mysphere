/**
 * ASK - pytanie z budzetem, liczba miejsc i terminem.
 *
 * === CO TO JEST I SKAD ===
 * Spisane wprost z manifestu na /re-definition, sekcja "$2.00 - one seat, one
 * answer": "An Ask is a question with a budget, a number of seats and a
 * deadline. You set all three, fund it once in USDC, and it appears in the
 * feed as a card that counts down."
 *
 * Do dzis "Ask" istnial WYLACZNIE jako rysunek na stronie manifestu
 * (funkcja AskCard w app/re-definition/page.tsx). Nie bylo modelu danych,
 * tworzenia ani API - strona opisywala w czasie terazniejszym cos, czego nie
 * bylo. Ten plik jest pierwszym miejscem, w ktorym Ask staje sie rzeczywisty.
 *
 * === CZYM ASK ROZNI SIE OD PLATNEJ SEKCJI, KTORA JUZ MAMY ===
 * Obie mechaniki to "pieniadze odslaniaja tresc", ale czas biegnie odwrotnie:
 *
 *   platna sekcja  tresc JUZ istnieje  -> placisz, zeby ja zobaczyc
 *                  ryzyko po stronie KUPUJACEGO (placi w ciemno)
 *
 *   Ask            tresci JESZCZE nie ma -> placisz, zeby ktos ja napisal
 *                  ryzyko po stronie PISZACEGO (pracuje przed zaplata)
 *
 * === DWA WARIANTY FINANSOWANIA I DLACZEGO OBA ZOSTAJA ===
 * Pierwsza wersja placila WYLACZNIE przy rozstrzygnieciu ('on-resolve'): autor
 * wysylal przelew do kazdej przyjetej odpowiedzi i hash ladowal przy niej na
 * stale. To jest slabsza obietnica niz manifestowe "fund it once in USDC" -
 * budzet lezy w portfelu autora i nic go nie blokuje.
 *
 * Od wdrozenia kontraktu AskEscrow (contracts/AskEscrow.sol, adresy w
 * deployments/askEscrow.<chainId>.json) istnieje takze wariant 'escrowed':
 * budzet jest pobierany przy zakladaniu Aska i lezy na kontrakcie, ktory nie ma
 * ani wlasciciela, ani pauzy, ani funkcji ratunkowej.
 *
 * Pole `funding` mowi wprost, ktory to wariant, i KAZDY tekst o pieniadzach
 * przy Asku musi z niego wynikac. Interfejs nie ma prawa napisac "held in
 * escrow" przy Asku, ktory ma 'on-resolve' - i odwrotnie.
 */

export type AskStatus = 'open' | 'resolved' | 'expired';

/**
 * Skad biora sie pieniadze.
 * - `on-resolve`  autor placi z wlasnego portfela przy przyjmowaniu odpowiedzi
 * - `escrowed`    srodki pobrane i zablokowane na kontrakcie przy zakladaniu
 */
export type AskFunding = 'on-resolve' | 'escrowed';

export type Ask = {
  id: string;
  author: string;
  /** Sama tresc pytania. Jawna od poczatku - zapieczetowane sa ODPOWIEDZI. */
  question: string;
  /** Laczny budzet w tokenie `token`. */
  budget: number;
  /** Ile odpowiedzi autor zamierza przyjac. */
  seats: number;
  /** budget / seats - trzymane osobno, zeby zaokraglenie bylo policzone RAZ. */
  perAnswer: number;
  token: string;
  network: string;
  /** Znacznik w ms. Po nim Ask przechodzi w `expired`, jesli nie rozstrzygniety. */
  deadline: number;
  createdAt: number;
  status: AskStatus;
  funding: AskFunding;
  /** Ile odpowiedzi wplynelo. Sama liczba jest jawna - tresci nie. */
  answerCount: number;
  /** Ile miejsc juz zajetych (przyjetych odpowiedzi). */
  acceptedCount: number;
  resolvedAt?: number;

  /* --- POLA ISTOTNE WYLACZNIE DLA `funding: 'escrowed'` --- */

  /**
   * Hash transakcji `fund` - DOWOD, ze budzet naprawde lezy na kontrakcie.
   *
   * Bez niego slowo "escrowed" w dokumencie jest samym slowem. Zapisywany
   * dopiero po POTWIERDZONEJ i niecofnietej transakcji (patrz fundAsk
   * w ./escrow.ts), nigdy przed.
   */
  escrowTxHash?: string | null;
  /**
   * Siec, na ktorej lezy escrow. Adres kontraktu wynika z niej jednoznacznie
   * (deployments/askEscrow.<chainId>.json), wiec adresu NIE duplikujemy tutaj -
   * dwa zrodla prawdy o tym, gdzie leza pieniadze, to o jedno za duzo.
   */
  escrowChainId?: number | null;
  /**
   * Hash transakcji `resolve` - moment, w ktorym srodki przestaly byc autora.
   *
   * UWAGA NA SLOWA: resolve() nie wysyla tokenow, tylko przypisuje salda.
   * Ta transakcja jest dowodem PRZYZNANIA, a nie dostarczenia - dostarcza
   * dopiero claim() po stronie odpowiadajacego.
   */
  escrowResolveTxHash?: string | null;
};

export type AskAnswer = {
  id: string;
  askId: string;
  author: string;
  createdAt: number;
  /**
   * Tresc odpowiedzi. `null` znaczy "jest, ale jeszcze zapieczetowana" -
   * NIE "pusta". Klient dostaje ja dopiero, gdy wolno mu ja zobaczyc.
   */
  content: string | null;
  accepted: boolean;
  /** Dowod wyplaty. Bez niego "przyjeta" jest samym slowem. */
  payoutTxHash?: string | null;
  /**
   * ILE i W CZYM wyplacono za te odpowiedz - zapisane W CHWILI przyjecia.
   *
   * === PO CO OSOBNO, SKORO ASK MA `perAnswer` ===
   * Dwa powody, oba twarde.
   *
   * 1. KOSZT ODCZYTU. Statystyki odpowiadajacego musza dac sie policzyc
   *    z samych JEGO odpowiedzi, jednym zapytaniem po `author`. Bez tych pol
   *    kazda przyjeta odpowiedz wymagalaby doczytania swojego Aska - zlaczenie
   *    po stronie klienta, ktorego koszt rosnie z liczba przyjec.
   * 2. STAWKA MA BYC TA, KTORA OBOWIAZYWALA. Kwota zapisana przy odpowiedzi
   *    nie zmieni sie, cokolwiek stanie sie potem z Askiem. Doliczana pozniej
   *    z `budget/seats` opisywalaby stan Aska DZIS, a nie to, co czlowiek
   *    faktycznie dostal.
   *
   * Brak albo `null` znaczy "nie wiem, ile" - NIE "zero". Tak wyglada
   * odpowiedz przyjeta, zanim ten zapis powstal, albo taka, przy ktorej odczyt
   * Aska padl w trakcie przyjmowania. Statystyki licza takie sztuki osobno
   * (`acceptedWithoutAmount`) zamiast wliczac je jako zerowy zarobek.
   */
  payoutAmount?: number | null;
  payoutToken?: string | null;
  payoutNetwork?: string | null;
};

/**
 * Wskaznik rozstrzygalnosci autora - liczba, ktora manifest nazywa
 * `resolve rate` i kaze pokazywac "in public, on the front of every Ask you
 * post afterwards".
 *
 * PO CO: Ask przenosi ryzyko na piszacego - on pracuje, zanim dostanie
 * pieniadze. Jedyne, co go chroni, to widoczna historia tego, czy autor
 * w ogole rozstrzyga. Bez tej liczby zakladanie Askow i milczenie nic nie
 * kosztuje, a caly mechanizm zamienia sie w darmowa prace.
 */
export type ResolveRate = {
  /** Ile Askow autor w ogole zalozyl (poza wciaz otwartymi). */
  settled: number;
  /** Ile z nich rozstrzygnal. */
  resolved: number;
  /** resolved / settled, albo `null` gdy jeszcze nie ma z czego liczyc. */
  rate: number | null;
};

/** Ile najmniej mozna dac za jedna odpowiedz. Ponizej tego kwota jest gestem. */
export const MIN_PER_ANSWER = 0.5;
export const MAX_SEATS = 20;

/** Terminy do wyboru. Krotsze niz godzina nie daje szans na odpowiedz. */
export const ASK_DURATIONS = [
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

/**
 * Kwota za jedna odpowiedz. Dzielimy W DOL do centa, zeby suma wyplat nigdy
 * nie przekroczyla budzetu - reszta zostaje u autora. Zaokraglenie w gore
 * dawaloby Ask, ktory przy komplecie miejsc jest drozszy, niz obiecywal.
 */
export function perAnswerFor(budget: number, seats: number): number {
  if (!Number.isFinite(budget) || !Number.isFinite(seats) || seats <= 0) return 0;
  return Math.floor((budget / seats) * 100) / 100;
}

/** Czy Ask jest juz po terminie. Jedno miejsce, zeby UI i serwer liczyly tak samo. */
export function isExpired(ask: Pick<Ask, 'deadline' | 'status'>, now = Date.now()): boolean {
  return ask.status === 'open' && ask.deadline <= now;
}

export function computeResolveRate(settled: number, resolved: number): ResolveRate {
  return {
    settled,
    resolved,
    rate: settled > 0 ? resolved / settled : null,
  };
}

/* ------------------------------------------------------------------ */
/*  NAZWY KOLEKCJI                                                     */
/* ------------------------------------------------------------------ */

/**
 * Jedno miejsce na nazwy kolekcji, zeby warstwa danych (asks.ts) i czytnik
 * statystyk (userStats.ts) nie mogly sie rozjechac. Stoja TUTAJ, a nie w
 * asks.ts, bo userStats.ts celowo nie importuje warstwy danych - patrz komentarz
 * o rozmiarze app/utils/firebase.ts na gorze userStats.ts.
 *
 * UWAGA: app/api/asks/answerStore.ts trzyma wlasne kopie tych nazw. Tamten plik
 * jest `server-only` (firebase-admin) i nie moze importowac tego modulu bez
 * wciagniecia go do bundla klienta, wiec kopia zostaje - ale gdy zmieniasz
 * nazwe kolekcji, zmien ja w OBU miejscach.
 */
export const ASKS_COLLECTION = 'asks';
export const ASK_ANSWERS_COLLECTION = 'askAnswers';

/* ------------------------------------------------------------------ */
/*  STATYSTYKI UZYTKOWNIKA                                             */
/* ------------------------------------------------------------------ */

/**
 * Kwoty PER TOKEN, np. `{ USDC: 12.5, ETH: 0.02 }`.
 *
 * NIGDY jedna suma. Zsumowanie USDC z ETH daje liczbe, ktora klamie, a cala
 * teza tego produktu brzmi, ze kwoty da sie sprawdzic. Ta sama zasada stoi juz
 * w app/utils/tips/getLeaderboard.ts i w Profile.tips.received.
 */
export type TokenAmounts = Record<string, number>;

/** Statystyki czlowieka JAKO AUTORA Askow. */
export type AskAuthorStats = {
  /** Ile Askow w ogole zalozyl. */
  created: number;
  /** Ile wciaz trwa - ani rozstrzygniete, ani porzucone. */
  open: number;
  /** Ile rozstrzygnal. */
  resolved: number;
  /** Ile porzucil: termin minal, rozstrzygniecia nie bylo. */
  abandoned: number;
  /**
   * `resolved / (resolved + abandoned)` - dokladnie ta liczba, ktora manifest
   * kaze pokazywac na kazdym kolejnym Asku autora. `rate: null` gdy nie ma
   * z czego liczyc.
   */
  resolveRate: ResolveRate;
  /**
   * Budzet Askow WCIAZ OTWARTYCH, per token. To jest OBIETNICA, nie wydatek
   * i nie escrow: srodki leza w portfelu autora i nic ich nie blokuje
   * (patrz naglowek tego pliku). Interfejs nie moze tego nazwac "zablokowane".
   */
  committed: TokenAmounts;
  /**
   * Ile faktycznie poszlo do odpowiadajacych, per token: dla kazdego Aska
   * `acceptedCount * perAnswer`.
   *
   * SKAD, I CZEGO TU NIE MA: liczone z licznikow na dokumencie Aska, a nie
   * z sumy paragonow. Dowodem pojedynczej wyplaty jest `payoutTxHash` przy
   * odpowiedzi; ta liczba mowi, ile Ask BYL WINIEN za zajete miejsca. Nie
   * obejmuje oplaty x402 za samo zalozenie Aska - ta nie jest nigdzie
   * zapisywana przy Asku (patrz POST /api/asks).
   */
  paid: TokenAmounts;
  /**
   * `true` = historia autora jest dluzsza niz limit odczytu, wiec liczby wyzej
   * sa DOLNA GRANICA, nie pelnym rachunkiem. Bez tej flagi obciecie wygladaloby
   * jak komplet.
   */
  truncated: boolean;
};

/** Statystyki czlowieka JAKO ODPOWIADAJACEGO. */
export type AskAnswererStats = {
  /** Ile odpowiedzi napisal. */
  written: number;
  /** Ile z nich przyjeto. */
  accepted: number;
  /**
   * `accepted / written`, albo `null` gdy nie napisal ani jednej.
   *
   * ZERO BYLOBY ZARZUTEM. Czlowiek, ktory nie odpowiadal, nie ma wskaznika
   * przyjec - i to jest co innego niz wskaznik rowny zeru.
   *
   * CZEGO TA LICZBA NIE UWZGLEDNIA: w mianowniku siedza takze odpowiedzi na
   * Aski JESZCZE nierozstrzygniete, ktore nie mialy kiedy zostac przyjete.
   * Dopoki takie wisza, wskaznik jest ZANIZONY. Zeby liczyc go symetrycznie do
   * `resolve rate` (czyli tylko po Askach juz zamknietych), trzeba by znac
   * status Aska przy samej odpowiedzi - patrz uwaga o `askSettledAt`
   * w userStats.ts.
   */
  acceptRate: number | null;
  /** Ile zarobil na przyjetych odpowiedziach, per token. */
  earned: TokenAmounts;
  /**
   * Przyjete odpowiedzi BEZ zapisanej kwoty. Nie wliczaja sie do `earned`, bo
   * nie wiadomo ile - a wliczone jako zero zanizalyby zarobek czlowieka.
   */
  acceptedWithoutAmount: number;
  /**
   * Przyjete odpowiedzi bez `payoutTxHash`, czyli "przyjete" bez dowodu
   * wyplaty. Liczba, ktorej nie powinno byc; jesli rosnie, ktos oznacza
   * odpowiedzi jako przyjete, nie placac.
   */
  acceptedWithoutProof: number;
  /** `true` = odpowiedzi bylo wiecej niz limit odczytu. Liczby to dolna granica. */
  truncated: boolean;
};

/**
 * Komplet sladu, jaki czlowiek zostawia w Askach.
 *
 * `null` W OBU POLACH ZNACZY "NIE USTALONO" - odczyt padl albo nie podano
 * adresu. NIGDY "nic nie robil": czlowiek bez zadnego Aska dostaje komplet
 * zer i `rate: null`, a nie `null` w calej sekcji. Puste statystyki to
 * twierdzenie o czlowieku i nie wolno go stawiac w chwili, gdy wlasnie nie
 * udalo sie go sprawdzic. Ta sama zasada co `partial` w getProfile i `failed`
 * w getLeaderboard.
 */
export type AskUserStats = {
  /** Adres malymi literami - w tej postaci zapisuja go obie sciezki zapisu. */
  address: string;
  asked: AskAuthorStats | null;
  answered: AskAnswererStats | null;
  /**
   * Ile odczytow Firestore kosztowalo to wywolanie.
   *
   * Liczone z UDOKUMENTOWANEJ zasady rozliczania (1 odczyt na dokument;
   * agregacja `count()` to 1 odczyt na kazde rozpoczete 1000 wpisow, minimum
   * jeden), a nie odczytane z licznika - klienckie SDK zadnego nie wystawia.
   * Ta sama arytmetyka co w app/admin/components/Statistics.tsx.
   */
  reads: number;
};

/** `accepted / written`, albo `null` gdy nie ma z czego liczyc. */
export function computeAcceptRate(written: number, accepted: number): number | null {
  return written > 0 ? accepted / written : null;
}

/**
 * Dopisuje kwote do sumy w JEJ WLASNYM tokenie.
 *
 * @returns `false`, gdy nie bylo czego dodac - brak nazwy tokena albo kwota
 * niedodatnia. Wolajacy ma wtedy policzyc te pozycje osobno (jako "nie wiadomo
 * ile"), a nie wrzucic jej jako zero.
 */
export function addTokenAmount(into: TokenAmounts, token: unknown, amount: unknown): boolean {
  const value = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(value) || value <= 0) return false;
  if (typeof token !== 'string' || token.trim() === '') return false;

  const key = token.trim();
  into[key] = (into[key] ?? 0) + value;
  return true;
}
