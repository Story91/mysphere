/**
 * Czysta matematyka modulu perps - zero React, zero wagmi.
 *
 * Wydzielona z MarketDetail.tsx, zeby dalo sie ja testowac mocha/chai
 * (test/derivativesMath.test.ts) i zeby wykres oraz panel zlecenia
 * dzielily JEDNA implementacje, a nie dwie kopie.
 */
import { fmtBps, fmtUsdc, fmtWadCompact } from '../format';
import type { PricePoint, Snapshot } from './types';


/* ========================================================================== */
/*  MATEMATYKA vAMM - LUSTRO KONTRAKTU, NIE PRZYBLIZENIE                      */
/*                                                                            */
/*  Podglad przed podpisem jest cos wart tylko wtedy, gdy liczy DOKLADNIE to  */
/*  samo, co `DerivativeMarket.openPosition`. Ponizsze funkcje sa wiec        */
/*  przepisane linia po linii z `_swap`, `DerivMath` i `liquidationPrice`,    */
/*  razem z KIERUNKIEM ZAOKRAGLEN, bo to on decyduje o ostatnich cyfrach:     */
/*                                                                            */
/*    long  (kupno bazy):    newB = k / newQ            - w dol               */
/*    short (sprzedaz bazy): newB = (k + newQ - 1)/newQ - w gore              */
/*    entryPrice = divWad(notional, size)               - w dol               */
/*    feeUsdc    = wadToUsdc(notional * fee / 1e4)      - w dol               */
/*                                                                            */
/*  Sprawdzone przez odtworzenie CALEJ historii tego rynku z rezerw           */
/*  poczatkowych 1000/1000 WAD: rozmiary, ceny wejscia i obie rezerwy koncowe */
/*  zgadzaja sie z lancuchem co do jednego wei (patrz raport z 10 wrzesnia).  */
/*                                                                            */
/*  Zadna stawka nie jest tu wpisana z reki - oplata, dzwignia i prog         */
/*  utrzymania przychodza z kontraktu jako argumenty.                          */
/* ========================================================================== */

export const WAD = 10n ** 18n;
export const BPS = 10_000n;
/** 1e18 / 1e6 - jedyna liczba zamieniajaca skale USDC na skale WAD. */
export const USDC_TO_WAD = 10n ** 12n;
/** Gorna krawedz paska zdrowia pozycji: 20% depozytu do notionalu. */
export const HEALTH_TOP_BPS = 2_000;

export type SwapResult = { size: bigint; quoteReserve: bigint; baseReserve: bigint };

/** `DerivativeMarket._swap`. `quoteAmount` i wynik w WAD. */
export function swap(q: bigint, b: bigint, isLong: boolean, quoteAmount: bigint): SwapResult | null {
  if (q === 0n || b === 0n || quoteAmount === 0n) return null;
  const k = q * b;
  if (isLong) {
    const nq = q + quoteAmount;
    const nb = k / nq;
    return { size: b - nb, quoteReserve: nq, baseReserve: nb };
  }
  // Kontrakt rewertuje `NotionalTooLarge`, gdy short zjadlby cala rezerwe quote.
  if (quoteAmount >= q) return null;
  const nq = q - quoteAmount;
  const nb = (k + nq - 1n) / nq;
  return { size: nb - b, quoteReserve: nq, baseReserve: nb };
}

export type Preview = {
  notional: bigint; // WAD
  feeUsdc: bigint; // 6 miejsc
  marginWad: bigint; // WAD, juz po oplacie
  size: bigint; // WAD, wartosc bezwzgledna
  entryPrice: bigint; // WAD
  markAfter: bigint; // WAD, cena vAMM PO wejsciu
  liqPrice: bigint; // WAD, 0 = nieosiagalna w tym kierunku
  marginRatioBps: bigint; // stan konta zaraz po wejsciu
  /** Powod, dla ktorego kontrakt odrzucilby te transakcje. `null` = przejdzie. */
  reason: string | null;
};

export type PreviewInput = {
  isLong: boolean;
  marginUsdc: bigint;
  leverage: number;
  quoteReserve: bigint;
  baseReserve: bigint;
  tradeFeeBps: number;
  maintenanceBps: number;
  maxLeverage: number;
  minMarginUsdc: bigint;
  openInterest: bigint;
  maxOpenInterest: bigint;
  creatorCap: bigint;
  isCreator: boolean;
};

export function previewOpen(input: PreviewInput): Preview | null {
  const { isLong, marginUsdc, leverage } = input;
  if (leverage < 1 || leverage > input.maxLeverage) return null;
  if (marginUsdc <= 0n) return null;

  const notional = marginUsdc * USDC_TO_WAD * BigInt(leverage);
  const feeUsdc = (notional * BigInt(input.tradeFeeBps)) / BPS / USDC_TO_WAD;
  const swapped = swap(input.quoteReserve, input.baseReserve, isLong, notional);
  if (!swapped || swapped.size === 0n) {
    return {
      notional,
      feeUsdc,
      marginWad: 0n,
      size: 0n,
      entryPrice: 0n,
      markAfter: 0n,
      liqPrice: 0n,
      marginRatioBps: 0n,
      reason: 'Too large for the virtual liquidity in this market.',
    };
  }

  const marginWad = (marginUsdc - feeUsdc) * USDC_TO_WAD;
  const size = swapped.size;
  const entryPrice = (notional * WAD) / size;
  const markAfter = (swapped.quoteReserve * WAD) / swapped.baseReserve;

  // Prog utrzymania sprawdzany jest PO wejsciu, po cenie juz przesunietej -
  // czyli pozycja moze urodzic sie martwa, jesli poslizg zjadl caly bufor.
  // Kontrakt rewertuje wtedy `MarginRatioTooLow`, wiec musimy to pokazac.
  const notionalNow = (size * markAfter) / WAD;
  const pnl = isLong ? notionalNow - notional : notional - notionalNow;
  const equity = marginWad + pnl;
  const marginRatioBps = notionalNow === 0n ? 0n : (equity * BPS) / notionalNow;

  // `liquidationPrice` dla swiezej pozycji: funding = 0, bo entryFunding
  // rowna sie cumFunding w chwili otwarcia.
  const mm = BigInt(input.maintenanceBps);
  let liqPrice = 0n;
  if (isLong) {
    const num = notional - marginWad;
    if (num > 0n) liqPrice = (((num * WAD) / size) * BPS) / (BPS - mm);
  } else {
    const num = notional + marginWad;
    if (num > 0n) liqPrice = (((num * WAD) / size) * BPS) / (BPS + mm);
  }

  let reason: string | null = null;
  if (marginUsdc < input.minMarginUsdc) reason = `Minimum margin is ${fmtUsdc(input.minMarginUsdc)}.`;
  else if (feeUsdc >= marginUsdc) reason = 'The trading fee would eat the whole deposit.';
  else if (input.openInterest + notional > input.maxOpenInterest) reason = "Over the market's open-interest cap.";
  else if (input.isCreator && notional > input.creatorCap)
    reason = `You publish this feed - your own cap is ${fmtWadCompact(input.creatorCap)} of notional.`;
  else if (marginRatioBps < mm)
    reason = `Slippage would leave you at ${fmtBps(marginRatioBps)} margin, below the ${fmtBps(input.maintenanceBps)} maintenance floor. The contract rejects that.`;

  return { notional, feeUsdc, marginWad, size, entryPrice, markAfter, liqPrice, marginRatioBps, reason };
}


/* ========================================================================== */
/*  ZAKRES WYKRESU                                                             */
/* ========================================================================== */

export type ChartRange = '1h' | '6h' | '24h' | 'all';

const RANGE_SEC: Record<Exclude<ChartRange, 'all'>, number> = { '1h': 3_600, '6h': 6 * 3_600, '24h': 24 * 3_600 };

/** Tnie historie do okna czasu. Nie dotyka RPC - filtruje to, co juz mamy. */
export function filterRange(points: PricePoint[], range: ChartRange, now: number): PricePoint[] {
  if (range === 'all') return points;
  const from = now - RANGE_SEC[range];
  return points.filter((p) => p.time >= from);
}

/* ========================================================================== */
/*  FUNDING - WSZYSTKO LICZONE TAK, JAK ZROBI TO `_settleFunding`             */
/* ========================================================================== */

export type FundingView = {
  rawPremium: bigint;
  cap: bigint;
  clamped: bigint;
  capped: boolean;
  perDayPct: number | null;
  /** Stawka godzinowa - to, co pokazuja dashboardy perps. `perDayPct / 24`. */
  perHourPct: number | null;
  nextAt: number | null;
  due: boolean;
  elapsed: number | null;
  perUnitNow: bigint | null;
};

export function computeFunding(snap: Snapshot, now: number): FundingView | null {
  if (snap.mark === null || snap.index === null || snap.maxPremiumBps === null) return null;
  const rawPremium = snap.mark - snap.index;
  const cap = (snap.index * BigInt(snap.maxPremiumBps)) / BPS;
  const clamped = rawPremium > cap ? cap : rawPremium < -cap ? -cap : rawPremium;
  const capped = rawPremium !== clamped;
  // Rata dzienna: kontrakt nalicza `premia * elapsed / 1 dzien` na jednostke.
  const perDayPct = snap.index === 0n ? null : Number((clamped * 1_000_000n) / snap.index) / 10_000;
  const perHourPct = perDayPct === null ? null : perDayPct / 24;
  const nextAt = snap.lastFundingAt !== null && snap.fundingInterval !== null ? snap.lastFundingAt + snap.fundingInterval : null;
  const due = nextAt !== null && now > 0 && now >= nextAt;
  // Ile faktycznie dopisze sie przy rozliczeniu TERAZ (elapsed przyciete do doby).
  const elapsed = snap.lastFundingAt !== null && now > 0 ? Math.min(Math.max(0, now - snap.lastFundingAt), 86_400) : null;
  const perUnitNow = elapsed === null ? null : (clamped * BigInt(elapsed)) / 86_400n;
  return { rawPremium, cap, clamped, capped, perDayPct, perHourPct, nextAt, due, elapsed, perUnitNow };
}

/** Zmiana procentowa od pierwszego do ostatniego punktu. `null` gdy < 2 punkty. */
export function priceChangePct(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0].price;
  const last = points[points.length - 1].price;
  if (first === 0n) return null;
  return Number(((last - first) * 1_000_000n) / first) / 10_000;
}

