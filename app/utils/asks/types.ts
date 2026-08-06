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
 * === CZEGO TU CELOWO NIE MA: ESCROW ===
 * Manifest mowi "fund it once in USDC" - czyli pieniadze blokuja sie przy
 * zakladaniu Aska. W repo NIE MA kontraktu escrow, a napisanie go to Solidity,
 * wdrozenie i srodki wlasciciela. Dlatego pierwsza wersja placi PRZY
 * ROZSTRZYGNIECIU: autor wysyla przelew do kazdej przyjetej odpowiedzi i hash
 * ladzie przy niej na stale.
 *
 * To jest slabsza obietnica niz w manifescie i NIE WOLNO jej opisywac jako
 * escrow. Pole `funding` mowi wprost, ktory to wariant, zeby interfejs nie
 * mogl obiecac czegos, czego nie ma.
 */

export type AskStatus = 'open' | 'resolved' | 'expired';

/**
 * Skad biora sie pieniadze.
 * - `on-resolve`  autor placi przy rozstrzygnieciu (dzis jedyny wariant)
 * - `escrowed`    srodki zablokowane przy zakladaniu (wymaga kontraktu)
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
