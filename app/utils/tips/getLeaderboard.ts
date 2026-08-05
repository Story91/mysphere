import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { getPublicDb as getDb } from '../publicFirestore';

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
    return empty;
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

  return { entries, totalTips, totalReceived, windowDays };
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
