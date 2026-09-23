/**
 * WYSWIETLANIE ASKOW SOL - czyste funkcje dla komponentow Askow.
 *
 * Ten plik czytaja karta, wiersz raila, kompozytor, panel odpowiedzi i /money,
 * czyli glowny bundle feedu. Dlatego NIE importuje niczego z '@solana/*'
 * (patrz naglowek app/utils/asks/solAmounts.ts) - adresy i podpisy Solany sa
 * tu zwyklymi napisami.
 *
 * ZASADY:
 * - Kwota Aska SOL bierze sie z lamportow (`budgetLamports`,
 *   `perAnswerLamports`), jesli sa. Liczby SOL w `budget` / `perAnswer` sa
 *   tylko przyblizeniem do wyswietlania i przy 0.005 SOL zaokraglenie do
 *   dwoch miejsc obiecywaloby 0.01 - dwa razy wiecej, niz autor placi.
 * - Adres i podpis Solany to base58: wielkosc liter ma znaczenie. Nigdy
 *   toLowerCase, nigdy normalizeAddress.
 */

import { formatLamports, isLamportsString, isSolAsk } from './solAmounts';

/** Pola Aska, ktorych potrzebuja funkcje ponizej - struktura, nie caly typ. */
export type SolAskLike = {
  token?: unknown;
  network?: unknown;
  budget?: unknown;
  perAnswer?: unknown;
  budgetLamports?: unknown;
  perAnswerLamports?: unknown;
  solanaCluster?: unknown;
};

/**
 * Liczba SOL -> napis do 9 miejsc, bez zbednych zer ("0.005", "1.25").
 * Przez lamporty, zeby 0.1 + 0.2 nie pokazalo 0.30000000000000004.
 */
export function formatSolNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const lamports = Math.round(value * 1e9);
  if (!Number.isSafeInteger(lamports)) return value.toString();
  return formatLamports(BigInt(lamports));
}

/** Lamporty (napis albo bigint) -> "0.005 SOL". Zly napis daje "0 SOL". */
export function formatSolLamports(lamports: bigint | string): string {
  return `${formatLamports(lamports)} SOL`;
}

/**
 * Kwota Aska SOL: z lamportow, gdy je znamy, inaczej z liczby SOL.
 * `null` dla Aska, ktory nie placi w SOL - wolajacy formatuje go po staremu.
 */
export function solAskAmount(ask: SolAskLike, which: 'budget' | 'perAnswer'): string | null {
  if (!isSolAsk(ask)) return null;
  const lamports = which === 'budget' ? ask.budgetLamports : ask.perAnswerLamports;
  if (isLamportsString(lamports)) return formatSolLamports(lamports);
  const value = which === 'budget' ? ask.budget : ask.perAnswer;
  return `${formatSolNumber(typeof value === 'number' ? value : Number(value))} SOL`;
}

/** Klaster Aska SOL albo null. Tylko dwie znane wartosci - reszta to null. */
export function askSolanaCluster(ask: SolAskLike): 'devnet' | 'mainnet-beta' | null {
  if (!isSolAsk(ask)) return null;
  return ask.solanaCluster === 'devnet' || ask.solanaCluster === 'mainnet-beta' ? ask.solanaCluster : null;
}

/**
 * Odznaka szyny na karcie: "SOL · Solana" (+ "devnet" osobno, zeby nie dalo
 * sie jej przeoczyc). `null` dla Askow USDC - one nie maja odznaki, bo to
 * domyslna szyna produktu.
 */
export function solRailBadge(ask: SolAskLike): { label: string; devnet: boolean } | null {
  if (!isSolAsk(ask)) return null;
  return { label: 'SOL · Solana', devnet: askSolanaCluster(ask) === 'devnet' };
}

/**
 * Link do transakcji w eksploratorze WEDLUG SIECI.
 *
 * Do Askow SOL basescan byl jedynym eksploratorem na tej stronie - podpis
 * Solany pod basescan prowadzi na pusta strone. explorer.solana.com, bo
 * przyjmuje `?cluster=devnet` (Solscan na devnecie pokazuje pustke).
 * `cluster` nieznany na Solanie = mainnet (bez sufiksu).
 */
export function payoutExplorerUrl(
  network: string | null | undefined,
  hash: string,
  cluster?: string | null
): string {
  if (network === 'solana') {
    const suffix = cluster === 'devnet' ? '?cluster=devnet' : '';
    return `https://explorer.solana.com/tx/${encodeURIComponent(hash)}${suffix}`;
  }
  return `https://basescan.org/tx/${hash}`;
}

/** "3F7V…r9Qx" - skrot adresu albo podpisu base58, bez zmiany wielkosci liter. */
export function shortBase58(value: string | null | undefined, head = 4, tail = 4): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/**
 * Ask SOL a klaster, na ktorym stoi ta przegladarka. Rozjazd = przelew poszedlby
 * na inny lancuch niz ten, ktory serwer sprawdzi (accept odpowie wrong_cluster
 * juz PO zaplaceniu). Nieznany klaster Aska nie blokuje - decyduje serwer.
 */
export function clusterMismatch(
  askCluster: string | null | undefined,
  appCluster: 'devnet' | 'mainnet-beta'
): boolean {
  if (askCluster !== 'devnet' && askCluster !== 'mainnet-beta') return false;
  return askCluster !== appCluster;
}
