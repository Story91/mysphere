import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { getPublicDb as getDb } from '../publicFirestore';
import { toMillis } from '../firestoreTime';

/**
 * Ranking zarobkow z tipow za ostatnie 7 dni.
 *
 * PO CO. Ludzie udostepniaja rankingi, w ktorych sami sa - to najstarsza
 * mechanika wiralowa, jaka istnieje, i jedyna, ktora tutaj nie wymaga niczego
 * nowego: dane juz sa, bo tipy dzialaja od dawna. Roznica wobec zwyklej tablicy
 * wynikow jest taka, ze kazda pozycja to suma ROZLICZONYCH platnosci, a nie
 * punktow za aktywnosc. Punkty da sie nabic; przelewow nie.
 *
 * OKNO 7 DNI, nie "od zawsze": ranking liczony od poczatku swiata zamarza po
 * kilku tygodniach i przestaje byc powodem, zeby wrocic. Tygodniowy resetuje
 * sie sam i daje nowym ludziom szanse.
 *
 * Sumy trzymamy PER TOKEN. Zsumowanie ETH z USDC dalo by ranking, ktory klamie
 * - a cala teza tego produktu brzmi, ze liczby maja byc sprawdzalne.
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
  /** Ile dni obejmuje wynik. `null` = cala historia (fallback ponizej). */
  windowDays: number | null;
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
 * Ranking. Blad odczytu zwraca pusty wynik, a nie wyjatek: strona ma sie
 * wyrenderowac zawsze.
 *
 * FALLBACK NA CALA HISTORIE. Okno tygodniowe jest wlasciwe dla zywego produktu,
 * ale gdy w tygodniu nie bylo ani jednego tipa, strona pokazywala pustke -
 * a pusta tabela jest bezwartosciowa jako obiekt do wyslania i wyglada jak
 * zepsuta funkcja, nie jak brak ruchu. Sprawdzone 5 sierpnia 2026: najnowszy
 * tip w bazie mial wtedy 367 dni, wiec /leaderboard bylo martwa strona.
 *
 * Gdy okno jest puste, powtarzamy zapytanie bez ograniczenia czasu i oznaczamy
 * wynik przez `windowDays: null`, zeby strona mogla uczciwie napisac "all time"
 * zamiast klamac o ostatnim tygodniu. Gdy ruch wroci, ranking sam przelacza sie
 * z powrotem na okno tygodniowe - bez zadnej zmiany w kodzie.
 */
export async function getLeaderboard(topN = 20): Promise<Leaderboard> {
  const empty: Leaderboard = {
    entries: [],
    totalTips: 0,
    totalReceived: {},
    windowDays: WINDOW_DAYS,
    failed: false,
  };

  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  /** Jedno zapytanie. `since === null` znaczy: bez ograniczenia czasu. */
  const fetchTips = (since: number | null) =>
    getDocs(
      query(
        collection(getDb(), 'tips'),
        ...(since === null ? [] : [where('timestamp', '>=', since)]),
        orderBy('timestamp', 'desc'),
        limit(FETCH_CAP)
      )
    );

  let snapshot;
  let windowDays: number | null = WINDOW_DAYS;
  try {
    snapshot = await fetchTips(cutoff);
    if (snapshot.empty) {
      snapshot = await fetchTips(null);
      windowDays = null;
    }
  } catch (error) {
    console.error('[getLeaderboard] Odczyt tipow nie powiodl sie:', error);
    return { ...empty, failed: true };
  }

  const byAddress = new Map<
    string,
    { received: Record<string, number>; tipCount: number; supporters: Set<string> }
  >();
  const totalReceived: Record<string, number> = {};
  let totalTips = 0;

  for (const entry of snapshot.docs) {
    const tip = entry.data() as Record<string, any>;

    const recipient = typeof tip.recipientAddress === 'string' ? tip.recipientAddress : '';
    if (!recipient) continue;

    const amount = Number.parseFloat(String(tip.amount ?? '0'));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const token = typeof tip.token === 'string' ? tip.token : 'ETH';
    // Adresy bywaja zapisane raz w checksumie, raz malymi literami - bez
    // normalizacji ta sama osoba pojawilaby sie w rankingu dwa razy.
    const key = recipient.toLowerCase();

    const current = byAddress.get(key) ?? {
      received: {},
      tipCount: 0,
      supporters: new Set<string>(),
    };
    current.received[token] = (current.received[token] ?? 0) + amount;
    current.tipCount += 1;
    if (typeof tip.senderAddress === 'string' && tip.senderAddress) {
      current.supporters.add(tip.senderAddress.toLowerCase());
    }
    byAddress.set(key, current);

    totalReceived[token] = (totalReceived[token] ?? 0) + amount;
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
    .sort((a, b) => topAmount(b.received) - topAmount(a.received))
    .slice(0, topN);

  return { entries, totalTips, totalReceived, windowDays, failed: false };
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
  payments: SettledPayment[];
  failed: boolean;
};

export async function getSettledPayments(max = 30): Promise<SettledPaymentsResult> {
  try {
    const snapshot = await getDocs(
      query(collection(getDb(), 'tips'), orderBy('timestamp', 'desc'), limit(max))
    );

    const payments = snapshot.docs
      .map((entry) => {
        const tip = entry.data() as Record<string, any>;
        const amount = Number.parseFloat(String(tip.amount ?? '0'));
        return {
          txHash: typeof tip.txHash === 'string' ? tip.txHash : '',
          from: typeof tip.senderAddress === 'string' ? tip.senderAddress : '',
          to: typeof tip.recipientAddress === 'string' ? tip.recipientAddress : '',
          amount: Number.isFinite(amount) ? amount : 0,
          token: typeof tip.token === 'string' ? tip.token : 'ETH',
          network: typeof tip.network === 'string' ? tip.network : 'base',
          // Kolekcja `tips` zbierala sie przez dlugi czas i trzyma znaczniki w
          // kilku ksztaltach naraz (liczba ms, liczba sekund, Timestamp
          // Firestore, ISO). Warunek `typeof === 'number'` zerowal wszystkie
          // pozostale, a `timeAgo(0)` zwraca pusty string - wiec starsze
          // platnosci wyswietlaly sie bez daty. toMillis() zna kazdy z tych
          // ksztaltow (app/utils/firestoreTime.ts).
          timestamp: toMillis(tip.timestamp),
        };
      })
      // Bez hasha nie ma dowodu, a bez dowodu ta pozycja nie ma po co istniec.
      .filter((payment) => payment.txHash && payment.amount > 0);

    return { payments, failed: false };
  } catch (error) {
    console.error('[getSettledPayments] Odczyt nie powiodl sie:', error);
    return { payments: [], failed: true };
  }
}
