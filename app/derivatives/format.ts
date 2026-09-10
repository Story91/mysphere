import { formatEther, formatUnits, parseUnits } from 'viem';
import { USDC_DECIMALS } from './config';

/**
 * Jedno miejsce na obie skale USD tego modulu.
 *
 * `usdc` / `fromUsdc` - REALNY token ERC-20, SZESC miejsc. Wchodzi tylko tam,
 * gdzie uzytkownik wpisuje depozyt albo kaucje.
 * `wad` - wewnetrzna skala kontraktow, OSIEMNASCIE miejsc. Ceny, notional, PnL.
 *
 * Pomylenie ich to blad o bilion i nie daje zadnego komunikatu - dlatego nie ma
 * tu ani jednej funkcji "uniwersalnej", ktora sama zgaduje skale.
 */

/** Tekst z pola formularza -> kwota USDC (6 miejsc). `null` = wpis bez sensu. */
export function usdc(value: string): bigint | null {
  const trimmed = value.trim();
  // `Number()` przyjmuje `1e3` i `0x10`, wiec sam nie wystarczy jako straznik.
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) return null;
  try {
    return parseUnits(trimmed, USDC_DECIMALS);
  } catch {
    return null;
  }
}

export function fromUsdc(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

/** Tekst z pola formularza -> cena w WAD. */
export function wad(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) return null;
  try {
    return parseUnits(trimmed, 18);
  } catch {
    return null;
  }
}

const money = (n: number, max = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: max });

/** Cena w WAD -> "$1,234.56". Male ceny dostaja wiecej miejsc. */
export function fmtPrice(value: bigint): string {
  const n = Number(formatEther(value));
  if (!Number.isFinite(n)) return '-';
  if (n !== 0 && Math.abs(n) < 1) return `$${money(n, 6)}`;
  return `$${money(n)}`;
}

/** Kwota w WAD -> "$12.3k". Do OI, limitow i notionalu. */
export function fmtWadCompact(value: bigint): string {
  const n = Number(formatEther(value));
  if (!Number.isFinite(n)) return '-';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${money(abs)}`;
}

/** Kwota USDC (6 miejsc) -> "$1,234.56". */
export function fmtUsdc(value: bigint): string {
  return `$${money(Number(formatUnits(value, USDC_DECIMALS)))}`;
}

/** Kwota w WAD ze znakiem -> "+$12.34" / "-$12.34". */
export function fmtSignedWad(value: bigint): string {
  const n = Number(formatEther(value));
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : '-'}$${money(Math.abs(n))}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function fmtAge(createdAt: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(seconds / 3_600);
  if (hours >= 1) return `${hours}h`;
  return `${Math.floor(seconds / 60)}m`;
}

/** Ile procent limitu OI jest zajete. Limit zero (rynek sciety) = 100%. */
export function oiPercent(oi: bigint, cap: bigint): number {
  if (cap === 0n) return 100;
  return Math.min(100, Number((oi * 10_000n) / cap) / 100);
}
