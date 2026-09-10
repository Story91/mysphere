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

/**
 * Cena w WAD -> "$1,234.56". Male ceny dostaja wiecej miejsc.
 *
 * Prog czterech miejsc miedzy 1 a 1000 nie jest ozdoba: cena wejscia na
 * rynku okolo dolara rozni sie od marku o promile, a przy dwoch miejscach
 * "$1.02" i "$1.0176" to ten sam napis - czyli poslizg znika z ekranu
 * dokladnie tam, gdzie ma byc widoczny.
 */
export function fmtPrice(value: bigint): string {
  const n = Number(formatEther(value));
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  if (abs !== 0 && abs < 1) return `$${money(n, 6)}`;
  if (abs < 1_000) return `$${money(n, 4)}`;
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

/**
 * Kwota w WAD ze znakiem -> "+$12.34" / "-$0.0599".
 *
 * Liczba miejsc zalezy od RZEDU WIELKOSCI i nie jest to kosmetyka. Premia
 * mark/index, funding na jednostke i PnL malej pozycji siedza w tysiacznych
 * dolara; przy sztywnych dwoch miejscach kazda z nich wyswietlala sie jako
 * "+$0.00", czyli jako zero, ktorego tam nie ma. Ponizej dolara dajemy wiec
 * szesc miejsc (`toLocaleString` i tak obcina koncowe zera).
 */
export function fmtSignedWad(value: bigint): string {
  const n = Number(formatEther(value));
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  return `${n >= 0 ? '+' : '-'}$${money(abs, abs !== 0 && abs < 1 ? 6 : 2)}`;
}

/**
 * Rozmiar pozycji w WAD jednostek bazowych -> "41.6667". Bez dolara, bo to
 * NIE sa dolary - to jednostki bazowe rynku i mylenie ich z notionalem jest
 * najczestszym bledem czytania karty pozycji.
 */
export function fmtSize(size: bigint, digits = 4): string {
  const n = Number(formatEther(size < 0n ? -size : size));
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Liczba procent -> "+1.23%" / "-1.23%". */
export function fmtPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-';
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(digits)}%`;
}

/** To samo bez wymuszonego znaku - do udzialow i wypelnien paskow. */
export function fmtPctPlain(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

/**
 * Stawka z kontraktu (bps) -> "0.30%". Kontrakty trzymaja KAZDA stawke w bps
 * i nigdzie tego nie zaokraglamy - 30 bps to dokladnie 0,30%, a nie "okolo".
 */
export function fmtBps(bps: number | bigint, digits = 2): string {
  const n = Number(bps);
  if (!Number.isFinite(n)) return '-';
  return `${(n / 100).toFixed(digits)}%`;
}

/**
 * (a - b) / b w procentach, liczone NA BIGINTACH.
 *
 * Premia i poslizg na perpach mieszcza sie w promilach, wiec przejscie przez
 * `Number` na samych cenach WAD (rzedu 1e18) potrafi zjesc caly wynik. Tutaj
 * dzielimy najpierw, a do `Number` schodzi juz mala liczba. `null` = brak
 * odniesienia, a nie zero.
 */
export function pctDelta(a: bigint, b: bigint): number | null {
  if (b === 0n) return null;
  return Number(((a - b) * 1_000_000n) / b) / 10_000;
}

/** Sekundy -> "7d" / "1h 02m" / "12m 04s" / "9s". Zegar fundingu i wiek feedu. */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const sec = s % 60;
  // Prog probacji to 604800 sekund - "168h 00m" jest prawdziwe, ale nikt tego
  // nie czyta jako tygodnia.
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
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
