import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { getPublicDb as getDb } from '../publicFirestore';
import { toMillis } from '../firestoreTime';

/**
 * Dane strony Paid: ranking zarobkow z tipow i tasma rozliczonych platnosci.
 *
 * PO CO. Ludzie udostepniaja rankingi, w ktorych sami sa - to najstarsza
 * mechanika wiralowa, jaka istnieje, i jedyna, ktora tutaj nie wymaga niczego
 * nowego: dane juz sa, bo tipy dzialaja od dawna. Roznica wobec zwyklej tablicy
 * wynikow jest taka, ze kazda pozycja to suma ROZLICZONYCH platnosci, a nie
 * punktow za aktywnosc. Punkty da sie nabic; przelewow nie.
 *
 * Sumy trzymamy PER TOKEN. Zsumowanie ETH z USDC dalo by ranking, ktory klamie
 * - a cala teza tego produktu brzmi, ze liczby maja byc sprawdzalne.
 *
 * UKLAD PLIKU: jeden odczyt kolekcji (readTips) i dwie czyste funkcje, ktore
 * go zwijaja - buildLeaderboard i buildTape. Wejsciem dla strony jest
 * getPaidTimeline; getLeaderboard i getSettledPayments zostaja dla tych, ktorzy
 * potrzebuja tylko jednej polowy (karta OG).
 */

export type LeaderboardEntry = {
  address: string;
  /** Sumy per token, np. { USDC: 12.5, ETH: 0.02 }. */
  received: Record<string, number>;
  tipCount: number;
  /** Liczba roznych osob, ktore wyslaly tip. */
  supporterCount: number;
};

export type Leaderboard = {
  entries: LeaderboardEntry[];
  /** Laczna liczba tipow w oknie. */
  totalTips: number;
  /** Laczne kwoty per token w oknie. */
  totalReceived: Record<string, number>;
  /** Ile dni obejmuje wynik. `null` = cala odczytana historia. */
  windowDays: number | null;
  /**
   * `true` = odczyt siegnal limitu FETCH_CAP, wiec "cala historia" znaczy
   * naprawde "tyle, ile zmiescilo sie w limicie". Strona nie ma wtedy prawa
   * napisac "All time" - to bylaby obietnica, ktorej kod nie dotrzymuje.
   */
  truncated: boolean;
  /**
   * `true` = odczytu NIE udalo sie wykonac. Pusty ranking i nieudany odczyt
   * daja te sama pusta liste, ale znacza cos zupelnie innego dla czytelnika:
   * "nikomu jeszcze nie zaplacono" to twierdzenie o swiecie, a nie o naszej
   * awarii. Patrz SettledPaymentsResult ponizej - ten sam powod.
   */
  failed: boolean;
};

const WINDOW_DAYS = 7;
const FETCH_CAP = 1000;

/**
 * Ile ROZNYCH osob musi dostac zaplacone w oknie tygodniowym, zeby okno w ogole
 * uznac za ranking.
 *
 * === TO JEST NAPRAWA ZNIKNIETEJ HISTORII ===
 * Wczesniej warunkiem powrotu do calej historii bylo `snapshot.empty`, czyli
 * ZERO tipow w tygodniu. 6 sierpnia 2026 o 23:21 wplynela jedna platnosc -
 * pierwsza od 11 pazdziernika 2025. Od tej sekundy okno przestalo byc puste,
 * fallback przestal dzialac, i caly ranking skurczyl sie do TEJ JEDNEJ
 * platnosci: 54 osoby i 187 rozliczen zamienily sie w jedna linijke na
 * 0.0001 ETH. Wlasciciel zobaczyl dokladnie to: "wyskoczyla tylko ostatnia
 * platnosc, a zniknely historyczne".
 *
 * Pustka nie jest tu wlasciwym progiem, bo ranking jest z definicji
 * POROWNANIEM. Lista z jedna pozycja nie porownuje niczego - powtarza tylko
 * pierwszy wiersz tasmy obok. Dlatego okno musi udzwignac ranking, a nie
 * jedynie "cos zawierac".
 */
const MIN_WINDOW_PEOPLE = 3;

type TipRow = {
  recipient: string;
  sender: string;
  amount: number;
  token: string;
  network: string;
  txHash: string;
  timestamp: number;
};

type TipsRead = {
  rows: TipRow[];
  /** `true` = odczyt siegnal limitu, wiec nie mamy calej kolekcji. */
  truncated: boolean;
  failed: boolean;
};

/**
 * JEDEN odczyt kolekcji `tips` dla calej strony Paid.
 *
 * DLACZEGO JEDEN. Ranking i tasma czytaly te sama kolekcje osobno - dwa
 * zapytania na render, przy czym tasma i tak pobierala historie bez
 * ograniczenia czasu. Jedno przejscie daje obu sekcjom to samo, tanszej,
 * i przy okazji gwarantuje, ze naglowek paragonu opisuje TEN SAM zbior, ktory
 * widac pod nim. (Dwa odczyty potrafily sie rozjechac: naglowek mowil
 * "1 payment" nad osiemnastoma wierszami.)
 *
 * DLACZEGO BEZ FILTRA CZASU W ZAPYTANIU. Okno tygodniowe liczymy w pamieci z
 * tego samego wyniku. Zapytanie `where('timestamp','>=')` oszczedzalo odczyty
 * tylko wtedy, gdy tasma nie robila obok pelnego przejscia - a robila zawsze.
 *
 * Limit FETCH_CAP jest twardy: to ma byc odczyt o znanym koszcie, a nie
 * skanowanie kolekcji. Gdy go dotknie, oddajemy `truncated` i strona przestaje
 * mowic "All time".
 */
async function readTips(): Promise<TipsRead> {
  try {
    const snapshot = await getDocs(
      query(collection(getDb(), 'tips'), orderBy('timestamp', 'desc'), limit(FETCH_CAP))
    );

    const rows = snapshot.docs.map((entry) => {
      const tip = entry.data() as Record<string, any>;
      const amount = Number.parseFloat(String(tip.amount ?? '0'));
      return {
        recipient: typeof tip.recipientAddress === 'string' ? tip.recipientAddress : '',
        sender: typeof tip.senderAddress === 'string' ? tip.senderAddress : '',
        amount: Number.isFinite(amount) ? amount : 0,
        token: typeof tip.token === 'string' ? tip.token : 'ETH',
        network: typeof tip.network === 'string' ? tip.network : 'base',
        txHash: typeof tip.txHash === 'string' ? tip.txHash : '',
        // Kolekcja `tips` zbierala sie przez dlugi czas i trzyma znaczniki w
        // kilku ksztaltach naraz (liczba ms, liczba sekund, Timestamp
        // Firestore, ISO). Warunek `typeof === 'number'` zerowal wszystkie
        // pozostale, a `timeAgo(0)` zwraca pusty string - wiec starsze
        // platnosci wyswietlaly sie bez daty. toMillis() zna kazdy z tych
        // ksztaltow (app/utils/firestoreTime.ts).
        timestamp: toMillis(tip.timestamp),
      };
    });

    return { rows, truncated: snapshot.size >= FETCH_CAP, failed: false };
  } catch (error) {
    console.error('[readTips] Odczyt kolekcji tips nie powiodl sie:', error);
    return { rows: [], truncated: false, failed: true };
  }
}

/** Zwija liste tipow w ranking odbiorcow. Bez zadnego odczytu. */
function aggregate(rows: readonly TipRow[], topN: number) {
  const byAddress = new Map<
    string,
    { received: Record<string, number>; tipCount: number; supporters: Set<string> }
  >();
  const totalReceived: Record<string, number> = {};
  let totalTips = 0;

  for (const tip of rows) {
    if (!tip.recipient) continue;
    if (!Number.isFinite(tip.amount) || tip.amount <= 0) continue;

    // Adresy bywaja zapisane raz w checksumie, raz malymi literami - bez
    // normalizacji ta sama osoba pojawilaby sie w rankingu dwa razy.
    const key = tip.recipient.toLowerCase();

    const current = byAddress.get(key) ?? {
      received: {},
      tipCount: 0,
      supporters: new Set<string>(),
    };
    current.received[tip.token] = (current.received[tip.token] ?? 0) + tip.amount;
    current.tipCount += 1;
    if (tip.sender) current.supporters.add(tip.sender.toLowerCase());
    byAddress.set(key, current);

    totalReceived[tip.token] = (totalReceived[tip.token] ?? 0) + tip.amount;
    totalTips += 1;
  }

  const entries: LeaderboardEntry[] = Array.from(byAddress.entries())
    .map(([address, data]) => ({
      address,
      received: data.received,
      tipCount: data.tipCount,
      supporterCount: data.supporters.size,
    }))
    // Sortujemy po najwiekszej pojedynczej sumie tokenowej. To nie jest kurs
    // wymiany i nie udaje, ze nim jest - po prostu deterministyczna kolejnosc,
    // ktorej nie da sie odczytac jako "ile to warte w dolarach".
    .sort((a, b) => topAmount(b.received) - topAmount(a.received));

  return { entries: entries.slice(0, topN), people: entries.length, totalTips, totalReceived };
}

/**
 * Ranking z juz odczytanych tipow.
 *
 * OKNO 7 DNI, nie "od zawsze": ranking liczony od poczatku swiata zamarza po
 * kilku tygodniach i przestaje byc powodem, zeby wrocic. Tygodniowy resetuje
 * sie sam i daje nowym ludziom szanse.
 *
 * Okno ustepuje calej historii, gdy nie udzwignie rankingu - patrz
 * MIN_WINDOW_PEOPLE. `windowDays: null` mowi wtedy stronie, zeby napisala
 * prawde o zakresie zamiast klamac o ostatnim tygodniu. Gdy ruch wroci, ranking
 * sam przelacza sie z powrotem na okno tygodniowe - bez zmiany w kodzie.
 */
function buildLeaderboard(read: TipsRead, topN: number): Leaderboard {
  if (read.failed) {
    return {
      entries: [],
      totalTips: 0,
      totalReceived: {},
      windowDays: WINDOW_DAYS,
      truncated: false,
      failed: true,
    };
  }

  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const windowed = aggregate(
    read.rows.filter((tip) => tip.timestamp >= cutoff),
    topN
  );

  if (windowed.people >= MIN_WINDOW_PEOPLE) {
    return {
      entries: windowed.entries,
      totalTips: windowed.totalTips,
      totalReceived: windowed.totalReceived,
      windowDays: WINDOW_DAYS,
      truncated: false,
      failed: false,
    };
  }

  const allTime = aggregate(read.rows, topN);
  return {
    entries: allTime.entries,
    totalTips: allTime.totalTips,
    totalReceived: allTime.totalReceived,
    windowDays: null,
    truncated: read.truncated,
    failed: false,
  };
}

/**
 * Ranking. Blad odczytu zwraca pusty wynik z `failed`, a nie wyjatek: strona ma
 * sie wyrenderowac zawsze, ale ma tez wiedziec, ze pustka jest nasza, nie
 * swiata.
 *
 * Uwaga na koszt: kazde wywolanie to osobny odczyt kolekcji. Strona Paid
 * potrzebuje i rankingu, i tasmy - do tego sluzy getPaidTimeline(), ktore
 * czyta RAZ.
 */
export async function getLeaderboard(topN = 20): Promise<Leaderboard> {
  return buildLeaderboard(await readTips(), topN);
}

function topAmount(received: Record<string, number>): number {
  const values = Object.values(received);
  return values.length ? Math.max(...values) : 0;
}

/** Kwoty do wyswietlenia, per token, najwieksza pierwsza. */
export function formatReceived(received: Record<string, number>, max = 2): string {
  return Object.entries(received)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([token, amount]) => `${formatAmount(amount)} ${token}`)
    .join(' + ');
}

export function formatAmount(value: number): string {
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 1) return value.toFixed(2).replace(/\.00$/, '');
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/* ------------------------------------------------------------------ */
/*  Os czasu rozliczonych platnosci                                    */
/* ------------------------------------------------------------------ */

export type SettledPayment = {
  txHash: string;
  from: string;
  to: string;
  amount: number;
  token: string;
  network: string;
  timestamp: number;
};

/**
 * Ostatnie rozliczone platnosci - w kolejnosci, w jakiej wpadaly.
 *
 * PO CO. To jest kanal, ktorego nie ma zaden inny produkt spolecznosciowy:
 * publiczna, przegladalna OS CZASU PIENIEDZY miedzy ludzmi, gdzie kazda pozycja
 * ma hash transakcji i kazdy moze ja sprawdzic u zrodla. Feed postow ma
 * dosiadka wszedzie. Feed przelewow miedzy obcymi ludzmi, z dowodem przy kazdej
 * pozycji, nie ma nigdzie.
 *
 * Roznica wobec rankingu obok: ranking to SUMA (kto uzbieral najwiecej),
 * a to jest STRUMIEN (co wlasnie sie stalo). Ranking odpowiada na pytanie
 * "komu ufac", strumien na "czy tu w ogole cos zyje".
 */
/**
 * Wynik odczytu taśmy. `failed` odroznia AWARIE od PUSTKI.
 *
 * Wczesniej funkcja zwracala `[]` w obu przypadkach, wiec strona Paid mowila
 * "Nothing has settled yet. The first payment starts this tape." takze wtedy,
 * gdy po prostu nie udalo sie odczytac danych. To najgorszy mozliwy komunikat
 * na stronie, ktorej cala teza brzmi "te liczby sa sprawdzalne" - zapewnia
 * czlowieka o stanie swiata, ktorego wlasnie NIE udalo sie sprawdzic.
 */
export type SettledPaymentsResult = {
  /** Najnowsze rozliczone platnosci - przyciete do `max`. */
  payments: SettledPayment[];
  /**
   * Ile rozliczonych platnosci znalazl caly odczyt - PRZED przycieciem.
   *
   * Naglowek paragonu opisuje ten zbior, a nie same widoczne wiersze. Wczesniej
   * bral liczby z rankingu, ktory liczyl WSZYSTKIE tipy - takze te bez hasha
   * (na produkcji 171 z 189). Nad tasma, ktora obiecuje "kazdy hash otwiera
   * transakcje", stala wiec suma z wpisow, ktorych nie da sie otworzyc.
   */
  settledCount: number;
  /** Sumy per token po tych samych rozliczonych platnosciach. */
  settledReceived: Record<string, number>;
  failed: boolean;
};

/** Tasma z juz odczytanych tipow. Bez zadnego odczytu. */
function buildTape(read: TipsRead, max: number): SettledPaymentsResult {
  if (read.failed) {
    return { payments: [], settledCount: 0, settledReceived: {}, failed: true };
  }

  // Bez hasha nie ma dowodu, a bez dowodu ta pozycja nie ma po co istniec.
  // Na produkcyjnej kolekcji `tips` odpada tak 171 z 189 wpisow - dlatego
  // filtr MUSI dzialac na calym odczycie, a przyciecie do `max` dopiero po nim.
  const settled = read.rows.filter((tip) => tip.txHash && tip.amount > 0);

  const settledReceived: Record<string, number> = {};
  for (const tip of settled) {
    settledReceived[tip.token] = (settledReceived[tip.token] ?? 0) + tip.amount;
  }

  return {
    payments: settled.slice(0, max).map((tip) => ({
      txHash: tip.txHash,
      from: tip.sender,
      to: tip.recipient,
      amount: tip.amount,
      token: tip.token,
      network: tip.network,
      timestamp: tip.timestamp,
    })),
    settledCount: settled.length,
    settledReceived,
    failed: false,
  };
}

/** Sama tasma. Osobny odczyt - patrz uwaga o koszcie przy getLeaderboard. */
export async function getSettledPayments(max = 30): Promise<SettledPaymentsResult> {
  return buildTape(await readTips(), max);
}

/**
 * Ranking I tasma z JEDNEGO odczytu - to jest wejscie dla strony /leaderboard.
 *
 * Obie sekcje opisuja te sama kolekcje, wiec pobieranie jej dwa razy kosztowalo
 * podwojnie i pozwalalo obu polowom ekranu mowic co innego. Tutaj oba widoki
 * powstaja z tej samej listy, wiec nie moga sie rozjechac.
 */
export async function getPaidTimeline(
  topN = 20,
  tapeMax = 30
): Promise<{ board: Leaderboard; tape: SettledPaymentsResult }> {
  const read = await readTips();
  return { board: buildLeaderboard(read, topN), tape: buildTape(read, tapeMax) };
}
