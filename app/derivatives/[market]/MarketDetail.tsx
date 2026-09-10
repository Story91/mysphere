'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clock,
  ExternalLink,
  Gavel,
  Info,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sprout,
  Wallet,
  Zap,
} from 'lucide-react';
import { formatEther, isAddress, maxUint256, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import '../../startpad/sphere/sphere-motion.css';
import {
  DERIV_CHAIN,
  FACTORY_ADDRESS,
  ORACLE_ADDRESS,
  USDC_ADDRESS,
  erc20Abi,
  factoryAbi,
  feesAbi,
  insuranceAbi,
  marketAbi,
  oracleAbi,
} from '../config';
import {
  fmtAge,
  fmtBps,
  fmtDuration,
  fmtPct,
  fmtPctPlain,
  fmtPrice,
  fmtSignedWad,
  fmtSize,
  fmtUsdc,
  fmtWadCompact,
  fromUsdc,
  oiPercent,
  pctDelta,
  shortAddress,
  usdc,
  wad,
} from '../format';
import Sparkline from '../Sparkline';

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

const WAD = 10n ** 18n;
const BPS = 10_000n;
/** 1e18 / 1e6 - jedyna liczba zamieniajaca skale USDC na skale WAD. */
const USDC_TO_WAD = 10n ** 12n;
/** Gorna krawedz paska zdrowia pozycji: 20% depozytu do notionalu. */
const HEALTH_TOP_BPS = 2_000;

type SwapResult = { size: bigint; quoteReserve: bigint; baseReserve: bigint };

/** `DerivativeMarket._swap`. `quoteAmount` i wynik w WAD. */
function swap(q: bigint, b: bigint, isLong: boolean, quoteAmount: bigint): SwapResult | null {
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

type Preview = {
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

type PreviewInput = {
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

function previewOpen(input: PreviewInput): Preview | null {
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
/*  ODCZYTY                                                                    */
/* ========================================================================== */

/**
 * `null` znaczy NIE UDALO SIE ODCZYTAC, i nigdy nie znaczy zera. Kazde pole
 * ponizej przechodzi przez ten typ, zeby nieudany `eth_call` nie wyladowal
 * na ekranie jako "$0.00" - to jest dokladnie ten blad, ktory tydzien temu
 * wycinalismy z reszty aplikacji.
 */
type R<T> = T | null;

type Snapshot = {
  id: bigint;
  symbol: string;
  creator: R<Address>;
  insurance: R<Address>;
  mark: R<bigint>;
  index: R<bigint>;
  quoteReserve: R<bigint>;
  baseReserve: R<bigint>;
  netSize: R<bigint>;
  oi: R<bigint>;
  cap: R<bigint>;
  creatorCap: R<bigint>;
  mature: R<boolean>;
  tradeFeeBps: R<number>;
  liqFeeBps: R<number>;
  fundingInterval: R<number>;
  maxPremiumBps: R<number>;
  lastFundingAt: R<number>;
  cumFunding: R<bigint>;
  maxLeverage: R<number>;
  minMargin: R<bigint>;
  maintenanceBps: R<number>;
  coveredBadDebt: R<bigint>;
  oiMultProbation: R<number>;
  oiMultMature: R<number>;
  probationAge: R<number>;
  probationUpdates: R<number>;
  creatorCapBps: R<number>;
  bond: R<bigint>;
  createdAt: R<number>;
  updateCount: R<number>;
  challenges: R<number>;
  frozen: R<boolean>;
  slashed: R<boolean>;
  feedActive: R<boolean>;
  oraclePrice: R<bigint>;
  oracleUpdatedAt: R<number>;
  twap: R<bigint>;
  paused: R<boolean>;
  insBalance: R<bigint>;
  insRequired: R<bigint>;
  insMinRatioBps: R<number>;
  insTotalOi: R<bigint>;
  /** `oiByMarket(market)` - ile z sumy powyzej stoi za TYM rynkiem. */
  insOiHere: R<bigint>;
  registered: R<boolean>;
  usdcBalance: R<bigint>;
  /* Podzial oplaty - z FeeDistributora, po adresie wzietym z fabryki. */
  feesAddress: R<Address>;
  creatorShareBps: R<number>;
  insuranceShareBps: R<number>;
  feeLockDays: R<number>;
  treasury: R<Address>;
};

type Position = {
  size: bigint;
  margin: bigint;
  openNotional: bigint;
  entryPrice: bigint;
  funding: bigint;
  pnl: R<bigint>;
  liqPrice: R<bigint>;
  marginRatioBps: R<bigint>;
};

/** Jeden wpis w historii aktywnosci - z realnych logow kontraktu, zero zmyslania. */
type ActivityItem =
  | { kind: 'opened'; trader: Address; isLong: boolean; notional: bigint; entryPrice: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'closed'; trader: Address; exitNotional: bigint; pnl: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'liquidated'; trader: Address; keeper: Address; payoutUsdc: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'funding'; premium: bigint; perUnit: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'badDebt'; trader: Address; shortfallWad: bigint; coveredUsdc: bigint; block: bigint; txHash: string; at: number };

/** Zegar sekundowy. Zero do pierwszego efektu - inaczej SSR i klient sie roznia. */
function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1_000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ========================================================================== */
/*  DROBNE ELEMENTY UI                                                         */
/* ========================================================================== */

/** Odczyt, ktory sie nie powiodl. NIGDY nie podstawiamy w to miejsca zera. */
function Unknown({ label = 'n/a' }: { label?: string }) {
  return (
    <span className="font-normal text-sp-ink-soft" title="This on-chain read failed - the value is unknown, not zero.">
      {label}
    </span>
  );
}

/**
 * Kwota USDC (6 miejsc) z dokladnoscia, przy ktorej TRZY UDZIALY DALEJ SUMUJA
 * SIE DO OPLATY. `fmtUsdc` tnie do centa, wiec 0,195 + 0,045 + 0,060 pokazywalo
 * sie jako $0.20 + $0.05 + $0.06 = $0.31 przy oplacie $0.30 - podzial, ktory
 * nie domyka sie na ekranie, czyta sie jak blad, nawet gdy liczby pod spodem
 * sa co do jednostki zgodne z `notifyFee`. Ponizej dolara dajemy wiec szesc
 * miejsc, tak samo jak `fmtSignedWad` robi to dla premii i fundingu.
 */
function fmtUsdcFine(value: bigint): string {
  const n = Number(value) / 1e6;
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: abs !== 0 && abs < 1 ? 6 : 2,
  })}`;
}

function Val<T extends bigint | number | boolean>({ v, fmt }: { v: R<T>; fmt: (x: T) => string }) {
  if (v === null || v === undefined) return <Unknown />;
  return <>{fmt(v)}</>;
}

function TickerCell({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-[92px] shrink-0 border-l border-sp-shade/10 px-3 first:border-l-0 first:pl-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft">{label}</p>
      <div className="text-sm font-bold tabular-nums text-sp-ink">{children}</div>
      {hint ? <p className="text-[10px] leading-tight text-sp-ink-soft">{hint}</p> : null}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <dt className="shrink-0 text-sp-ink-soft" title={hint}>
        {label}
      </dt>
      <dd className="min-w-0 text-right font-medium tabular-nums text-sp-ink">{children}</dd>
    </div>
  );
}

/* ========================================================================== */

export default function MarketDetail({ market }: { market: Address }) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const { data: wallet } = useWalletClient();
  const now = useNow();

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [history, setHistory] = useState<bigint[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [side, setSide] = useState<'long' | 'short'>('long');
  // Wartosci startowe biletu sa celowo male: na rynku w probacji limit OI to
  // dwukrotnosc kaucji, wiec "100 przy 5x" otwiera strone od komunikatu
  // o przekroczeniu limitu zamiast od dzialajacego podgladu.
  const [margin, setMargin] = useState('50');
  const [leverage, setLeverage] = useState(2);
  const [newPrice, setNewPrice] = useState('');
  const [probeTarget, setProbeTarget] = useState('');
  const [probe, setProbe] = useState<
    { address: Address; size: bigint; notional: bigint; ratioBps: R<bigint> } | 'empty' | null
  >(null);

  const isCreator = Boolean(address && snap?.creator && address.toLowerCase() === snap.creator.toLowerCase());
  const wrongChain = chainId !== DERIV_CHAIN.id;

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      // Adresy/identyfikatory, bez ktorych nie da sie ulozyc reszty zapytan.
      // Wszystkie trzy w JEDNYM multicallu - to nadal jedna podroz do RPC.
      const [idRes, insRes, feesRes] = await client.multicall({
        contracts: [
          { address: market, abi: marketAbi, functionName: 'ORACLE_MARKET_ID' },
          { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'INSURANCE' },
          { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'FEES' },
        ],
        allowFailure: true,
      });
      if (idRes.status !== 'success') throw new Error('This address does not answer as a derivative market.');
      const id = idRes.result as bigint;
      const insurance = insRes.status === 'success' ? (insRes.result as Address) : null;
      const feesAddress = feesRes.status === 'success' ? (feesRes.result as Address) : null;

      // Jeden multicall na CALA strone. Arc limituje liczbe zapytan i okno
      // getLogs, wiec dwadziescia kilka osobnych `eth_call` to prosta droga
      // do rate-limitu w chwili, gdy ktos odswiezy strone dwa razy.
      type Call = { key: string; address: Address; abi: unknown; functionName: string; args?: unknown[] };
      const marketFns = [
        'markPrice', 'indexPrice', 'quoteReserve', 'baseReserve', 'netSize', 'openInterestNotional',
        'maxOpenInterest', 'creatorOiCap', 'isMature', 'TRADE_FEE_BPS', 'LIQUIDATION_FEE_BPS',
        'FUNDING_INTERVAL', 'MAX_PREMIUM_BPS', 'lastFundingAt', 'cumFunding', 'MAX_LEVERAGE',
        'MIN_MARGIN_USDC', 'MAINTENANCE_MARGIN_BPS', 'coveredBadDebtUsdc', 'OI_MULTIPLIER_PROBATION',
        'OI_MULTIPLIER_MATURE', 'PROBATION_AGE', 'PROBATION_UPDATES', 'CREATOR_OI_CAP_BPS', 'CREATOR',
      ];
      const calls: Call[] = [
        ...marketFns.map((functionName) => ({ key: functionName, address: market, abi: marketAbi, functionName })),
        { key: 'getMarket', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getMarket', args: [id] },
        { key: 'marketStats', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'marketStats', args: [id] },
        { key: 'getPrice', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getPrice', args: [id] },
        { key: 'getTwap', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getTwap', args: [id] },
        { key: 'isActive', address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'isActive', args: [id] },
        // `isMarket` mieszka na FABRYCE - i od teraz takze w `factoryAbi`.
        // `InsuranceFund` deklaruje ten podpis wylacznie po to, by ZAWOLAC go
        // na fabryce, wiec odczyt pod adresem funduszu rewertuje.
        { key: 'registered', address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'isMarket', args: [market] },
      ];
      if (insurance) {
        calls.push(
          { key: 'paused', address: insurance, abi: insuranceAbi, functionName: 'newPositionsPaused' },
          { key: 'insBalance', address: insurance, abi: insuranceAbi, functionName: 'balance' },
          { key: 'insRequired', address: insurance, abi: insuranceAbi, functionName: 'requiredBalance' },
          { key: 'insMinRatioBps', address: insurance, abi: insuranceAbi, functionName: 'minRatioBps' },
          { key: 'insTotalOi', address: insurance, abi: insuranceAbi, functionName: 'totalOi' },
          // Udzial TEGO rynku w sumie powyzej. Bez tego karta zdrowia mowila
          // wylacznie o calym module, czyli o czyms innym niz ogladany rynek.
          { key: 'insOiHere', address: insurance, abi: insuranceAbi, functionName: 'oiByMarket', args: [market] },
        );
      }
      if (feesAddress) {
        calls.push(
          { key: 'creatorShareBps', address: feesAddress, abi: feesAbi, functionName: 'CREATOR_SHARE_BPS' },
          { key: 'insuranceShareBps', address: feesAddress, abi: feesAbi, functionName: 'INSURANCE_SHARE_BPS' },
          { key: 'feeLockDays', address: feesAddress, abi: feesAbi, functionName: 'LOCK_DAYS' },
          { key: 'treasury', address: feesAddress, abi: feesAbi, functionName: 'TREASURY' },
        );
      }
      if (address) {
        calls.push(
          { key: 'usdcBalance', address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] },
          { key: 'getPosition', address: market, abi: marketAbi, functionName: 'getPosition', args: [address] },
          { key: 'unrealizedPnl', address: market, abi: marketAbi, functionName: 'unrealizedPnl', args: [address] },
          { key: 'marginRatioBps', address: market, abi: marketAbi, functionName: 'marginRatioBps', args: [address] },
          { key: 'liquidationPrice', address: market, abi: marketAbi, functionName: 'liquidationPrice', args: [address] },
        );
      }

      const results = (await client.multicall({
        contracts: calls.map(({ key, ...rest }) => rest) as any,
        allowFailure: true,
      })) as readonly { status: 'success' | 'failure'; result?: unknown }[];

      const v: Record<string, unknown> = {};
      calls.forEach((c, i) => {
        v[c.key] = results[i]?.status === 'success' ? results[i].result : null;
      });
      const B = (k: string): R<bigint> => (typeof v[k] === 'bigint' ? (v[k] as bigint) : null);
      const N = (k: string): R<number> =>
        typeof v[k] === 'bigint' ? Number(v[k] as bigint) : typeof v[k] === 'number' ? (v[k] as number) : null;
      const BL = (k: string): R<boolean> => (typeof v[k] === 'boolean' ? (v[k] as boolean) : null);
      const tuple = (k: string): readonly unknown[] | null => (Array.isArray(v[k]) ? (v[k] as unknown[]) : null);

      const meta = tuple('getMarket');
      const stats = tuple('marketStats');
      const price = tuple('getPrice');

      setSnap({
        id,
        symbol: (meta?.[2] as string) || shortAddress(market),
        creator: (v.CREATOR as Address) ?? (meta?.[0] as Address) ?? null,
        insurance,
        mark: B('markPrice'),
        index: B('indexPrice'),
        quoteReserve: B('quoteReserve'),
        baseReserve: B('baseReserve'),
        netSize: B('netSize'),
        oi: B('openInterestNotional'),
        cap: B('maxOpenInterest'),
        creatorCap: B('creatorOiCap'),
        mature: BL('isMature'),
        tradeFeeBps: N('TRADE_FEE_BPS'),
        liqFeeBps: N('LIQUIDATION_FEE_BPS'),
        fundingInterval: N('FUNDING_INTERVAL'),
        maxPremiumBps: N('MAX_PREMIUM_BPS'),
        lastFundingAt: N('lastFundingAt'),
        cumFunding: B('cumFunding'),
        maxLeverage: N('MAX_LEVERAGE'),
        minMargin: B('MIN_MARGIN_USDC'),
        maintenanceBps: N('MAINTENANCE_MARGIN_BPS'),
        coveredBadDebt: B('coveredBadDebtUsdc'),
        oiMultProbation: N('OI_MULTIPLIER_PROBATION'),
        oiMultMature: N('OI_MULTIPLIER_MATURE'),
        probationAge: N('PROBATION_AGE'),
        probationUpdates: N('PROBATION_UPDATES'),
        creatorCapBps: N('CREATOR_OI_CAP_BPS'),
        bond: stats ? (stats[0] as bigint) : null,
        createdAt: stats ? Number(stats[1] as bigint) : null,
        updateCount: stats ? Number(stats[2] as number) : null,
        challenges: stats ? Number(stats[3] as number) : null,
        frozen: stats ? (stats[4] as boolean) : null,
        slashed: stats ? (stats[5] as boolean) : null,
        feedActive: BL('isActive'),
        oraclePrice: price ? (price[0] as bigint) : null,
        oracleUpdatedAt: price ? Number(price[1] as bigint) : null,
        twap: B('getTwap'),
        paused: BL('paused'),
        insBalance: B('insBalance'),
        insRequired: B('insRequired'),
        insMinRatioBps: N('insMinRatioBps'),
        insTotalOi: B('insTotalOi'),
        insOiHere: B('insOiHere'),
        registered: BL('registered'),
        usdcBalance: B('usdcBalance'),
        feesAddress,
        creatorShareBps: N('creatorShareBps'),
        insuranceShareBps: N('insuranceShareBps'),
        feeLockDays: N('feeLockDays'),
        treasury: (v.treasury as Address) ?? null,
      });

      const pos = tuple('getPosition');
      if (pos && (pos[0] as bigint) !== 0n) {
        setPosition({
          size: pos[0] as bigint,
          margin: pos[1] as bigint,
          openNotional: pos[2] as bigint,
          entryPrice: pos[3] as bigint,
          funding: pos[4] as bigint,
          pnl: B('unrealizedPnl'),
          liqPrice: B('liquidationPrice'),
          marginRatioBps: B('marginRatioBps'),
        });
      } else {
        setPosition(null);
      }

      // Historia cen z logow feedu. Okno celowo krotkie - to sparkline,
      // a nie pelny wykres, wiec nie ma powodu przeczesywac calego lancucha.
      const head = await client.getBlockNumber();
      const from = head > 40_000n ? head - 40_000n : 0n;
      try {
        const logs = await client.getContractEvents({
          address: ORACLE_ADDRESS,
          abi: oracleAbi,
          eventName: 'PriceSubmitted',
          args: { marketId: id },
          fromBlock: from,
          toBlock: head,
        });
        const prices = logs.map((l) => (l as unknown as { args: { price?: bigint } }).args.price).filter(Boolean) as bigint[];
        setHistory(prices.slice(-60));
      } catch {
        // Brak okna getLogs na RPC nie ma prawa zabrac calej strony.
        setHistory([]);
      }

      // Historia aktywnosci - PROSTO z logow tego rynku, to samo okno co
      // sparkline. Zero liczb zmyslonych na potrzeby "wygladania jak
      // prawdziwa gielda": jak nie ma zdarzen, lista jest po prostu pusta.
      //
      // JEDNO `eth_getLogs` na wszystkie piec zdarzen, nie piec osobnych.
      // `getLogs` z tablica `events` sklada filtr topic0 jako alternatywe, a
      // Arc rate-limituje wlasnie liczbe zapytan - piec rownoleglych kolejek
      // potrafilo wrocic bledem i wyzerowac cala liste.
      try {
        const marketEvents = marketAbi.filter((entry) => entry.type === 'event');
        const logs = (await client.getLogs({
          address: market,
          events: marketEvents as never,
          fromBlock: from,
          toBlock: head,
        })) as unknown as {
          eventName: string;
          args: Record<string, unknown>;
          blockNumber: bigint | null;
          transactionHash: string | null;
        }[];

        // Znaczniki czasu pobieramy TYLKO dla tych blokow, ktore naprawde
        // wyladuja na liscie - inaczej stary rynek to setki `eth_getBlockByNumber`.
        const recent = [...logs]
          .sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)))
          .slice(0, 20);
        const blockNumbers = Array.from(new Set(recent.map((l) => l.blockNumber ?? 0n)));
        const blocks = await Promise.all(blockNumbers.map((bn) => client.getBlock({ blockNumber: bn })));
        const atByBlock = new Map(blockNumbers.map((bn, i) => [bn, Number(blocks[i].timestamp)]));

        const items: ActivityItem[] = [];
        for (const l of recent) {
          const a = l.args;
          const meta = {
            block: l.blockNumber ?? 0n,
            txHash: l.transactionHash ?? '',
            at: atByBlock.get(l.blockNumber ?? 0n) ?? 0,
          };
          if (l.eventName === 'PositionOpened') {
            items.push({
              kind: 'opened',
              trader: a.trader as Address,
              isLong: a.isLong as boolean,
              notional: a.notional as bigint,
              entryPrice: a.entryPrice as bigint,
              ...meta,
            });
          } else if (l.eventName === 'PositionClosed') {
            items.push({ kind: 'closed', trader: a.trader as Address, exitNotional: a.exitNotional as bigint, pnl: a.pnl as bigint, ...meta });
          } else if (l.eventName === 'Liquidated') {
            items.push({ kind: 'liquidated', trader: a.trader as Address, keeper: a.keeper as Address, payoutUsdc: a.payoutUsdc as bigint, ...meta });
          } else if (l.eventName === 'FundingSettled') {
            items.push({ kind: 'funding', premium: a.premium as bigint, perUnit: a.fundingPerUnit as bigint, ...meta });
          } else if (l.eventName === 'BadDebt') {
            items.push({
              kind: 'badDebt',
              trader: a.trader as Address,
              shortfallWad: a.shortfallWad as bigint,
              coveredUsdc: a.coveredUsdc as bigint,
              ...meta,
            });
          }
        }
        setActivity(items);
      } catch {
        setActivity([]);
      }
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err?.shortMessage || err?.message || "Couldn't load the market.");
    } finally {
      setLoading(false);
    }
  }, [client, market, address]);

  useEffect(() => {
    void load();
  }, [load]);

  async function withBusy(label: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err?.shortMessage || err?.message || 'Transaction rejected.');
    } finally {
      setBusy(null);
    }
  }

  const marginAmount = usdc(margin);

  /* ---- PODGLAD ZLECENIA. Przelicza sie przy KAZDEJ zmianie pola. ---- */
  const preview = useMemo<Preview | null>(() => {
    if (
      !snap ||
      marginAmount === null ||
      snap.quoteReserve === null ||
      snap.baseReserve === null ||
      snap.tradeFeeBps === null ||
      snap.maintenanceBps === null ||
      snap.maxLeverage === null ||
      snap.minMargin === null ||
      snap.oi === null ||
      snap.cap === null ||
      snap.creatorCap === null
    ) {
      return null;
    }
    return previewOpen({
      isLong: side === 'long',
      marginUsdc: marginAmount,
      leverage,
      quoteReserve: snap.quoteReserve,
      baseReserve: snap.baseReserve,
      tradeFeeBps: snap.tradeFeeBps,
      maintenanceBps: snap.maintenanceBps,
      maxLeverage: snap.maxLeverage,
      minMarginUsdc: snap.minMargin,
      openInterest: snap.oi,
      maxOpenInterest: snap.cap,
      creatorCap: snap.creatorCap,
      isCreator,
    });
  }, [snap, marginAmount, leverage, side, isCreator]);

  /* ---- DOKAD IDZIE OPLATA. Lustro `FeeDistributor.notifyFee`. ----
     Udzial skarbca jest RESZTA, a nie osobna stala - kontrakt liczy go
     dokladnie tak: `amount - creatorCut - insuranceCut`. Wpisanie tu 20%
     z reki zaczeloby klamac w dniu, w ktorym ktos ruszy ktorykolwiek z
     dwoch pozostalych udzialow. */
  const feeSplit = useMemo(() => {
    if (!snap || !preview || snap.creatorShareBps === null || snap.insuranceShareBps === null) return null;
    const creatorBps = BigInt(snap.creatorShareBps);
    const insuranceBps = BigInt(snap.insuranceShareBps);
    if (creatorBps + insuranceBps > BPS) return null;
    const fee = preview.feeUsdc;
    const creator = (fee * creatorBps) / BPS;
    const insurance = (fee * insuranceBps) / BPS;
    return {
      creatorBps: Number(creatorBps),
      insuranceBps: Number(insuranceBps),
      treasuryBps: Number(BPS - creatorBps - insuranceBps),
      creator,
      insurance,
      treasury: fee - creator - insurance,
    };
  }, [snap, preview]);

  /* ---- FUNDING. Wszystko liczone tak, jak zrobi to `_settleFunding`. ---- */
  const funding = useMemo(() => {
    if (!snap || snap.mark === null || snap.index === null || snap.maxPremiumBps === null) return null;
    const rawPremium = snap.mark - snap.index;
    const cap = (snap.index * BigInt(snap.maxPremiumBps)) / BPS;
    const clamped = rawPremium > cap ? cap : rawPremium < -cap ? -cap : rawPremium;
    const capped = rawPremium !== clamped;
    // Rata dzienna: kontrakt nalicza `premia * elapsed / 1 dzien` na jednostke.
    const perDayPct = snap.index === 0n ? null : Number((clamped * 1_000_000n) / snap.index) / 10_000;
    const nextAt = snap.lastFundingAt !== null && snap.fundingInterval !== null ? snap.lastFundingAt + snap.fundingInterval : null;
    const due = nextAt !== null && now > 0 && now >= nextAt;
    // Ile faktycznie dopisze sie przy rozliczeniu TERAZ (elapsed przyciete do doby).
    const elapsed =
      snap.lastFundingAt !== null && now > 0 ? Math.min(Math.max(0, now - snap.lastFundingAt), 86_400) : null;
    const perUnitNow = elapsed === null ? null : (clamped * BigInt(elapsed)) / 86_400n;
    return { rawPremium, cap, clamped, capped, perDayPct, nextAt, due, elapsed, perUnitNow };
  }, [snap, now]);

  async function open() {
    if (!wallet || !client || !address || !marginAmount || !preview || preview.reason) return;
    await withBusy('Opening position...', async () => {
      const allowance = (await client.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, market],
      })) as bigint;
      if (allowance < marginAmount) {
        const approveHash = await wallet.writeContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [market, maxUint256],
          chain: DERIV_CHAIN,
          account: address,
        });
        await client.waitForTransactionReceipt({ hash: approveHash });
      }
      const hash = await wallet.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'openPosition',
        args: [side === 'long', marginAmount, leverage],
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
    });
  }

  async function close() {
    if (!wallet || !client || !address) return;
    await withBusy('Closing position...', async () => {
      const hash = await wallet.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'closePosition',
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
    });
  }

  async function settle() {
    if (!wallet || !client || !address) return;
    await withBusy('Settling funding...', async () => {
      const hash = await wallet.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'settleFunding',
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
    });
  }

  async function checkTarget() {
    if (!client || !isAddress(probeTarget)) return;
    const target = probeTarget as Address;
    setError(null);
    const [posRes, ratioRes] = await client.multicall({
      contracts: [
        { address: market, abi: marketAbi, functionName: 'getPosition', args: [target] },
        { address: market, abi: marketAbi, functionName: 'marginRatioBps', args: [target] },
      ],
      allowFailure: true,
    });
    const pos = posRes.status === 'success' ? (posRes.result as readonly unknown[]) : null;
    if (!pos || (pos[0] as bigint) === 0n) {
      setProbe('empty');
      return;
    }
    setProbe({
      address: target,
      size: pos[0] as bigint,
      notional: pos[2] as bigint,
      ratioBps: ratioRes.status === 'success' ? (ratioRes.result as bigint) : null,
    });
  }

  async function liquidate() {
    if (!wallet || !client || !address || probe === null || probe === 'empty') return;
    await withBusy('Liquidating...', async () => {
      const hash = await wallet.writeContract({
        address: market,
        abi: marketAbi,
        functionName: 'liquidate',
        args: [probe.address],
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
      setProbe(null);
    });
  }

  async function submitPrice() {
    const price = wad(newPrice);
    if (!wallet || !client || !address || !price || !snap) return;
    await withBusy('Submitting price...', async () => {
      const hash = await wallet.writeContract({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: 'submitPrice',
        args: [snap.id, price, BigInt(Math.floor(Date.now() / 1_000))],
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
      setNewPrice('');
    });
  }

  if (loading && !snap) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-4 h-16 w-full rounded-[18px]" />
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[320px] rounded-[20px] lg:col-span-2" />
          <Skeleton className="h-[320px] rounded-[20px]" />
        </div>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error ?? 'Market not found.'}</p>
        <Link href="/derivatives" className="mt-4 inline-block text-sm underline">
          Back to markets
        </Link>
      </div>
    );
  }

  const premium = snap.mark !== null && snap.index !== null ? snap.mark - snap.index : null;
  const premiumPct = snap.mark !== null && snap.index !== null ? pctDelta(snap.mark, snap.index) : null;
  const pct = snap.oi !== null && snap.cap !== null ? oiPercent(snap.oi, snap.cap) : null;
  const explorer = DERIV_CHAIN.blockExplorers?.default.url;

  /* Przechyl rynku. `netSize` jest w jednostkach bazowych, OI w dolarach -
     zeby je porownac, przeliczamy net po cenie mark. Bez tego kroku pasek
     porownywalby jablka z gruszkami. */
  const netNotional =
    snap.netSize !== null && snap.mark !== null
      ? ((snap.netSize < 0n ? -snap.netSize : snap.netSize) * snap.mark) / WAD
      : null;
  const skewShare =
    netNotional !== null && snap.oi !== null && snap.oi > 0n
      ? Math.min(1, Number((netNotional * 10_000n) / snap.oi) / 10_000)
      : null;
  const skewLong = snap.netSize !== null && snap.netSize > 0n;

  const health =
    position?.marginRatioBps != null && snap.maintenanceBps !== null
      ? {
          ratio: Number(position.marginRatioBps),
          mm: snap.maintenanceBps,
          liquidatable: Number(position.marginRatioBps) < snap.maintenanceBps,
        }
      : null;

  const feedAge = snap.oracleUpdatedAt !== null && now > 0 ? now - snap.oracleUpdatedAt : null;
  const balance = snap.usdcBalance;

  return (
    <div className="sphere-shell sph-stagger mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/derivatives" className="mb-4 inline-flex items-center gap-1.5 text-sm text-sp-ink-soft hover:text-sp-ink">
        <ArrowLeft className="h-4 w-4" />
        All markets
      </Link>

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-[26px] font-extrabold tracking-tight text-sp-ink">{snap.symbol}</h1>
          <Badge variant="outline" className="rounded-full border-sp-shade/15 text-[10px] uppercase text-sp-ink-soft">
            perp &middot; vAMM
          </Badge>
          {snap.slashed ? (
            <Badge variant="destructive" className="rounded-full">slashed</Badge>
          ) : snap.frozen ? (
            <Badge variant="destructive" className="rounded-full">feed frozen</Badge>
          ) : snap.mature ? (
            <Badge className="gap-1 rounded-full border-transparent bg-sp-brand-soft text-sp-brand-deep hover:bg-sp-brand-soft">
              <ShieldCheck className="h-3 w-3" />
              mature
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 rounded-full border-sp-shade/15 text-sp-ink-soft">
              <Sprout className="h-3 w-3" />
              probation
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-full border-sp-shade/15 bg-sp-surface text-sp-ink hover:bg-sp-hover"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      {/* PASEK TICKERA. Przewija sie w POZIOMIE wewnatrz siebie - na 375 px
          zadna z tych liczb nie ma prawa rozepchnac strony. */}
      <div className="mb-4 overflow-x-auto rounded-[18px] border border-sp-shade/10 bg-sp-surface px-4 py-3">
        <div className="flex min-w-max items-start gap-0">
          <TickerCell label="Mark (vAMM)" hint="quote / base reserve">
            <Val v={snap.mark} fmt={fmtPrice} />
          </TickerCell>
          <TickerCell label="Index" hint="feed TWAP">
            <Val v={snap.index} fmt={fmtPrice} />
          </TickerCell>
          <TickerCell
            label="Premium"
            hint={premiumPct === null ? undefined : `${fmtPct(premiumPct)} of index`}
          >
            {premium === null ? (
              <Unknown />
            ) : (
              <span className={premium >= 0n ? 'text-emerald-600' : 'text-red-600'}>{fmtSignedWad(premium)}</span>
            )}
          </TickerCell>
          <TickerCell
            label="Funding in"
            hint={funding?.perDayPct == null ? undefined : `${fmtPct(funding.perDayPct)} / day`}
          >
            {funding?.nextAt == null || now === 0 ? (
              <Unknown />
            ) : funding.due ? (
              <span className="text-sp-brand-deep">due now</span>
            ) : (
              fmtDuration(funding.nextAt - now)
            )}
          </TickerCell>
          <TickerCell label="Open interest" hint={pct === null ? undefined : `${fmtPctPlain(pct, 1)} of cap`}>
            <Val v={snap.oi} fmt={fmtWadCompact} />
          </TickerCell>
          <TickerCell label="Skew" hint={skewShare === null ? undefined : `${fmtPctPlain(skewShare * 100, 0)} of OI`}>
            {snap.netSize === null ? (
              <Unknown />
            ) : snap.netSize === 0n ? (
              'flat'
            ) : (
              <span className={skewLong ? 'text-emerald-600' : 'text-red-600'}>{skewLong ? 'long' : 'short'}</span>
            )}
          </TickerCell>
          <TickerCell label="Taker fee" hint="each way">
            <Val v={snap.tradeFeeBps} fmt={(x) => fmtBps(x)} />
          </TickerCell>
          <TickerCell label="Max leverage">
            <Val v={snap.maxLeverage} fmt={(x) => `${x}x`} />
          </TickerCell>
          <TickerCell label="Feed age" hint="oracle getPrice">
            {feedAge === null ? <Unknown /> : fmtDuration(feedAge)}
          </TickerCell>
        </div>
      </div>

      {snap.paused && (
        <Card className="mb-4 rounded-[18px] border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">New positions are paused across the module</p>
              <p className="mt-1 text-sp-ink-soft">
                The insurance fund holds <Val v={snap.insBalance} fmt={fmtUsdc} /> against{' '}
                <Val v={snap.insRequired} fmt={fmtUsdc} /> required. Closing positions and liquidations still work.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ================= LEWA KOLUMNA ================= */}
        <div className="grid gap-4 lg:col-span-2">
          <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
                Index history vs mark
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Sparkline points={history} baseline={snap.mark} />
              <p className="mt-2 text-xs text-sp-ink-soft">
                The line is what the feed published; the dashed line is where the vAMM is trading right now. The gap
                between them is what funding charges for.
              </p>
            </CardContent>
          </Card>

          {/* ---------- FUNDING ---------- */}
          <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
                <Clock className="h-4 w-4" />
                Funding
              </CardTitle>
              {funding?.nextAt != null && now > 0 && (
                <span className="text-xs tabular-nums text-sp-ink-soft">
                  {funding.due ? 'settlement is due' : `next in ${fmtDuration(funding.nextAt - now)}`}
                </span>
              )}
            </CardHeader>
            <CardContent className="text-sm">
              {funding === null || snap.index === null || snap.maxPremiumBps === null ? (
                <p className="text-sp-ink-soft">Funding inputs could not be read.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                    <div>
                      <p className="text-xs text-sp-ink-soft">Who pays</p>
                      <p className="text-lg font-bold">
                        {funding.clamped === 0n ? (
                          <span className="text-sp-ink">nobody</span>
                        ) : funding.clamped > 0n ? (
                          <span className="text-emerald-600">longs pay shorts</span>
                        ) : (
                          <span className="text-red-600">shorts pay longs</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sp-ink-soft">Rate if settled now</p>
                      <p className="text-lg font-bold tabular-nums text-sp-ink">
                        {funding.perDayPct === null ? <Unknown /> : `${fmtPct(funding.perDayPct)} / day`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-sp-ink-soft">Accrued per unit</p>
                      <p className="text-lg font-bold tabular-nums text-sp-ink">
                        {funding.perUnitNow === null ? <Unknown /> : fmtSignedWad(funding.perUnitNow)}
                      </p>
                    </div>
                  </div>

                  {/* Pasek premii wzgledem sufitu MAX_PREMIUM_BPS. Srodek = zero. */}
                  <div className="mt-4">
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
                      <div className="absolute left-1/2 top-0 h-full w-px bg-sp-shade/25" />
                      {(() => {
                        const capNum = Number(formatEther(funding.cap < 0n ? -funding.cap : funding.cap));
                        const rawNum = Number(formatEther(funding.rawPremium));
                        if (!Number.isFinite(capNum) || capNum === 0) return null;
                        const frac = Math.max(-1, Math.min(1, rawNum / capNum));
                        const w = Math.abs(frac) * 50;
                        return (
                          <div
                            className={`absolute top-0 h-full ${funding.clamped >= 0n ? 'bg-emerald-500' : 'bg-red-500'}`}
                            style={frac >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                          />
                        );
                      })()}
                    </div>
                    <div className="mt-1 flex justify-between text-[11px] text-sp-ink-soft">
                      <span>-{fmtBps(snap.maxPremiumBps)} cap</span>
                      <span>mark = index</span>
                      <span>+{fmtBps(snap.maxPremiumBps)} cap</span>
                    </div>
                  </div>

                  {funding.capped && (
                    <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        The real gap is {fmtSignedWad(funding.rawPremium)}, but funding only ever charges the capped{' '}
                        {fmtSignedWad(funding.clamped)} &mdash; {fmtBps(snap.maxPremiumBps)} of index. One wild
                        candle on the vAMM cannot drain the other side.
                      </span>
                    </p>
                  )}

                  <dl className="mt-4 grid gap-1 text-xs sm:grid-cols-2 sm:gap-x-8">
                    <Row label="Interval">
                      {snap.fundingInterval === null ? <Unknown /> : fmtDuration(snap.fundingInterval)}
                    </Row>
                    <Row label="Last settled">
                      {snap.lastFundingAt === null ? <Unknown /> : `${fmtAge(snap.lastFundingAt)} ago`}
                    </Row>
                    <Row label="Cumulative funding / unit">
                      <Val v={snap.cumFunding} fmt={fmtSignedWad} />
                    </Row>
                    <Row label="Premium cap">
                      <Val v={snap.maxPremiumBps} fmt={(x) => fmtBps(x)} />
                    </Row>
                  </dl>

                  <Button
                    onClick={() => void settle()}
                    disabled={Boolean(busy) || !address || wrongChain || !funding.due}
                    variant="outline"
                    className="mt-3 w-full rounded-full border-sp-shade/15 text-sp-ink sm:w-auto"
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    {funding.due ? 'settleFunding()' : 'settleFunding() - not due yet'}
                  </Button>
                  <p className="mt-1.5 text-[11px] text-sp-ink-soft">
                    Permissionless: any address may call it once the interval is up. It pays{' '}
                    <strong className="font-semibold">no reward</strong> &mdash; it only moves the funding clock, and
                    opening or closing a position settles it for free anyway.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* ---------- PRZECHYL ---------- */}
          <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
                <Scale className="h-4 w-4" />
                Long / short skew
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {snap.netSize === null || snap.oi === null ? (
                <p className="text-sp-ink-soft">Skew could not be read.</p>
              ) : (
                <>
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-sp-ink-soft">Net position</p>
                      <p className={`text-lg font-bold tabular-nums ${skewLong ? 'text-emerald-600' : snap.netSize === 0n ? 'text-sp-ink' : 'text-red-600'}`}>
                        {snap.netSize === 0n ? 'balanced' : `${skewLong ? 'Long' : 'Short'} ${fmtSize(snap.netSize)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-sp-ink-soft">at mark</p>
                      <p className="text-lg font-bold tabular-nums text-sp-ink">
                        {netNotional === null ? <Unknown /> : fmtWadCompact(netNotional)}
                      </p>
                    </div>
                  </div>

                  <div className="relative h-4 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-sp-shade/30" />
                    {skewShare !== null && snap.netSize !== 0n && (
                      <div
                        className={`absolute top-0 h-full ${skewLong ? 'bg-emerald-500/80' : 'bg-red-500/80'}`}
                        style={
                          skewLong
                            ? { left: '50%', width: `${skewShare * 50}%` }
                            : { right: '50%', width: `${skewShare * 50}%` }
                        }
                      />
                    )}
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-sp-ink-soft">
                    <span>shorts heavier</span>
                    <span>balanced</span>
                    <span>longs heavier</span>
                  </div>

                  <p className="mt-3 text-xs text-sp-ink-soft">
                    Net exposure is {skewShare === null ? <Unknown /> : fmtPctPlain(skewShare * 100, 1)} of the{' '}
                    <Val v={snap.oi} fmt={fmtWadCompact} /> open interest. A market that leans this way keeps mark
                    away from index, which is exactly what the funding rate above is paid for.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* ---------- ZDROWIE RYNKU ---------- */}
          <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
                <Activity className="h-4 w-4" />
                Market health
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-bold tabular-nums text-sp-ink">
                <Val v={snap.oi} fmt={fmtWadCompact} /> / <Val v={snap.cap} fmt={fmtWadCompact} /> open interest
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
                {pct !== null && (
                  <div
                    className={`h-full rounded-full ${pct > 85 ? 'bg-destructive' : 'bg-sp-brand'}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>

              <p className="mt-3 rounded-[12px] bg-sp-sunken px-3 py-2 text-xs text-sp-ink-soft">
                The cap is not a constant: it is the feed&apos;s bond (<Val v={snap.bond} fmt={fmtUsdc} />) times{' '}
                {snap.mature === null ? (
                  <Unknown />
                ) : snap.mature ? (
                  <>
                    <Val v={snap.oiMultMature} fmt={(x) => `${x}x`} /> for a mature feed
                  </>
                ) : (
                  <>
                    <Val v={snap.oiMultProbation} fmt={(x) => `${x}x`} /> while on probation
                  </>
                )}
                . A feed graduates after <Val v={snap.probationAge} fmt={(x) => fmtDuration(x)} /> and{' '}
                <Val v={snap.probationUpdates} fmt={String} /> accepted prices with no challenge on record &mdash; so a
                brand-new market can only ever be small.
              </p>

              <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2 sm:gap-x-8">
                <Row label="Prices accepted">
                  {snap.updateCount === null || snap.probationUpdates === null ? (
                    <Unknown />
                  ) : (
                    `${snap.updateCount} / ${snap.probationUpdates}`
                  )}
                </Row>
                <Row label="Feed age">
                  {snap.createdAt === null || snap.probationAge === null ? (
                    <Unknown />
                  ) : (
                    `${fmtAge(snap.createdAt)} of ${fmtDuration(snap.probationAge)}`
                  )}
                </Row>
                <Row label="Challenges opened">
                  <Val v={snap.challenges} fmt={String} />
                </Row>
                <Row label="Feed accepting trades" hint="PriceOracleRegistry.isActive">
                  {snap.feedActive === null ? <Unknown /> : snap.feedActive ? 'yes' : 'no'}
                </Row>
                <Row label="Oracle spot" hint="getPrice - raw last submission">
                  <Val v={snap.oraclePrice} fmt={fmtPrice} />
                </Row>
                <Row label="Oracle TWAP" hint="getTwap - what index uses">
                  <Val v={snap.twap} fmt={fmtPrice} />
                </Row>
                <Row label="Last feed update">{feedAge === null ? <Unknown /> : `${fmtDuration(feedAge)} ago`}</Row>
                <Row label="Creator cap" hint="CREATOR_OI_CAP_BPS of the cap">
                  <Val v={snap.creatorCap} fmt={fmtWadCompact} />
                </Row>
                <Row label="Creator">
                  {snap.creator === null ? (
                    <Unknown />
                  ) : explorer ? (
                    <a
                      className="inline-flex items-center gap-1 underline decoration-sp-shade/30 underline-offset-2"
                      href={`${explorer}/address/${snap.creator}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortAddress(snap.creator)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    shortAddress(snap.creator)
                  )}
                </Row>
                <Row label="Registered market" hint="factory isMarket - only these can touch the insurance fund">
                  {snap.registered === null ? <Unknown /> : snap.registered ? 'yes' : 'no'}
                </Row>
                <Row label="Insurance fund">
                  <Val v={snap.insBalance} fmt={fmtUsdc} /> / <Val v={snap.insRequired} fmt={fmtUsdc} />
                </Row>
                <Row label="Fund floor" hint="minRatioBps of system-wide OI">
                  <Val v={snap.insMinRatioBps} fmt={(x) => fmtBps(x)} /> of{' '}
                  <Val v={snap.insTotalOi} fmt={fmtWadCompact} />
                </Row>
                {/* Ile z tej sumy to TEN rynek. `totalOi` sam w sobie nie mowi
                    o ogladanym rynku nic - dopiero `oiByMarket` robi z niego
                    zdanie o tej stronie. */}
                <Row label="of which this market" hint="InsuranceFund.oiByMarket - the exposure the fund books against this market">
                  {snap.insOiHere === null ? (
                    <Unknown />
                  ) : (
                    <>
                      {fmtWadCompact(snap.insOiHere)}
                      {snap.insTotalOi !== null && snap.insTotalOi > 0n && (
                        <span className="font-normal text-sp-ink-soft">
                          {' '}
                          &middot; {fmtPctPlain(Number((snap.insOiHere * 10_000n) / snap.insTotalOi) / 100, 1)} of the
                          module
                        </span>
                      )}
                    </>
                  )}
                </Row>
              </dl>

              {snap.coveredBadDebt !== null && snap.coveredBadDebt > 0n && (
                <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    The insurance fund has already covered {fmtUsdc(snap.coveredBadDebt)} of bad debt on this market.
                    That is a position that went underwater faster than it could be liquidated.
                  </span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* ---------- KEEPER ---------- */}
          <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
                <Gavel className="h-4 w-4" />
                Keeper actions
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="text-xs text-sp-ink-soft">
                Both calls below are open to <strong className="font-semibold text-sp-ink">any address</strong>. There
                is no keeper whitelist, no owner and no pause the creator can reach.{' '}
                <code className="rounded bg-sp-sunken px-1">liquidate(trader)</code> pays the caller{' '}
                <Val v={snap.liqFeeBps} fmt={(x) => fmtBps(x)} /> of the exit notional in USDC, straight from the
                closed position; whatever is left goes back to its owner.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="Trader address to check"
                  placeholder="0x... trader address"
                  value={probeTarget}
                  onChange={(e) => {
                    setProbeTarget(e.target.value);
                    setProbe(null);
                  }}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  onClick={() => void checkTarget()}
                  disabled={!isAddress(probeTarget)}
                  className="shrink-0 rounded-full border-sp-shade/15 text-sp-ink"
                >
                  Check
                </Button>
              </div>

              {probe === 'empty' && <p className="mt-2 text-xs text-sp-ink-soft">That address has no open position here.</p>}
              {probe !== null && probe !== 'empty' && (
                <div className="mt-3 rounded-[12px] bg-sp-sunken px-3 py-2">
                  <dl className="grid gap-1 text-xs">
                    <Row label="Side">
                      <span className={probe.size > 0n ? 'text-emerald-600' : 'text-red-600'}>
                        {probe.size > 0n ? 'Long' : 'Short'} {fmtSize(probe.size)}
                      </span>
                    </Row>
                    <Row label="Notional">{fmtWadCompact(probe.notional)}</Row>
                    <Row label="Margin ratio">
                      {probe.ratioBps === null ? (
                        <Unknown />
                      ) : (
                        <span
                          className={
                            snap.maintenanceBps !== null && probe.ratioBps < BigInt(snap.maintenanceBps)
                              ? 'text-destructive'
                              : 'text-sp-ink'
                          }
                        >
                          {fmtBps(probe.ratioBps)} vs <Val v={snap.maintenanceBps} fmt={(x) => fmtBps(x)} />{' '}
                          required
                        </span>
                      )}
                    </Row>
                  </dl>
                  <Button
                    onClick={() => void liquidate()}
                    disabled={
                      Boolean(busy) ||
                      !address ||
                      wrongChain ||
                      probe.ratioBps === null ||
                      snap.maintenanceBps === null ||
                      probe.ratioBps >= BigInt(snap.maintenanceBps)
                    }
                    variant="outline"
                    className="mt-2 w-full rounded-full border-destructive/40 text-destructive hover:bg-destructive/5"
                  >
                    {probe.ratioBps !== null && snap.maintenanceBps !== null && probe.ratioBps >= BigInt(snap.maintenanceBps)
                      ? 'Position is healthy - liquidate() would revert'
                      : 'liquidate(trader)'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---------- AKTYWNOSC ---------- */}
          {activity.length > 0 && (
            <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Recent activity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1">
                {activity.map((item, i) => (
                  <a
                    key={`${item.txHash}-${item.kind}-${i}`}
                    href={`${explorer}/tx/${item.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] px-2 py-1.5 text-sm transition-colors hover:bg-sp-hover"
                  >
                    <div className="flex items-center gap-2">
                      {item.kind === 'opened' && (
                        <Badge
                          className={`rounded-full border-transparent hover:bg-transparent ${
                            item.isLong ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {item.isLong ? 'Opened long' : 'Opened short'}
                        </Badge>
                      )}
                      {item.kind === 'closed' && (
                        <Badge variant="outline" className="rounded-full border-sp-shade/15 text-sp-ink-soft">
                          Closed
                        </Badge>
                      )}
                      {item.kind === 'liquidated' && (
                        <Badge variant="destructive" className="rounded-full">
                          Liquidated
                        </Badge>
                      )}
                      {item.kind === 'funding' && (
                        <Badge variant="outline" className="rounded-full border-sp-brand/30 text-sp-brand-deep">
                          Funding settled
                        </Badge>
                      )}
                      {item.kind === 'badDebt' && (
                        <Badge variant="destructive" className="rounded-full">
                          Bad debt
                        </Badge>
                      )}
                      {item.kind !== 'funding' && <span className="text-xs text-sp-ink-soft">{shortAddress(item.trader)}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {item.kind === 'opened' && (
                        <span className="tabular-nums text-sp-ink">
                          {fmtWadCompact(item.notional)} @ {fmtPrice(item.entryPrice)}
                        </span>
                      )}
                      {item.kind === 'closed' && (
                        <span className={`font-semibold tabular-nums ${item.pnl >= 0n ? 'text-emerald-600' : 'text-red-600'}`}>
                          {fmtSignedWad(item.pnl)}
                        </span>
                      )}
                      {item.kind === 'liquidated' && (
                        <span className="tabular-nums text-sp-ink">{fmtUsdc(item.payoutUsdc)} returned</span>
                      )}
                      {item.kind === 'funding' && (
                        <span className="tabular-nums text-sp-ink">
                          {fmtSignedWad(item.perUnit)} / unit at {fmtSignedWad(item.premium)} premium
                        </span>
                      )}
                      {item.kind === 'badDebt' && (
                        <span className="tabular-nums text-destructive">
                          {fmtWadCompact(item.shortfallWad)} short, {fmtUsdc(item.coveredUsdc)} covered by the fund
                        </span>
                      )}
                      <span className="text-sp-ink-soft">{fmtAge(item.at)} ago</span>
                    </div>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ================= PRAWA KOLUMNA: BILET ================= */}
        <div className="grid content-start gap-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Open a position</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={side === 'long' ? 'default' : 'outline'}
                  onClick={() => setSide('long')}
                  className={
                    side === 'long'
                      ? 'rounded-full bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'rounded-full border-sp-shade/15 text-sp-ink'
                  }
                >
                  Long
                </Button>
                <Button
                  variant={side === 'short' ? 'default' : 'outline'}
                  onClick={() => setSide('short')}
                  className={
                    side === 'short'
                      ? 'rounded-full bg-red-600 text-white hover:bg-red-700'
                      : 'rounded-full border-sp-shade/15 text-sp-ink'
                  }
                >
                  Short
                </Button>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="deriv-margin">Margin (USDC)</Label>
                  <span className="inline-flex items-center gap-1 text-[11px] text-sp-ink-soft">
                    <Wallet className="h-3 w-3" />
                    {balance === null ? (
                      address ? (
                        <Unknown />
                      ) : (
                        'not connected'
                      )
                    ) : (
                      <button
                        type="button"
                        className="underline decoration-sp-shade/30 underline-offset-2"
                        onClick={() => setMargin(fromUsdc(balance))}
                      >
                        {fmtUsdc(balance)}
                      </button>
                    )}
                  </span>
                </div>
                <Input id="deriv-margin" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
                {margin.trim() !== '' && marginAmount === null && (
                  <p className="text-[11px] text-destructive">Enter a plain amount, at most 6 decimals.</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="deriv-lev">Leverage</Label>
                  <span className="text-sm font-bold tabular-nums text-sp-ink">{leverage}x</span>
                </div>
                <input
                  id="deriv-lev"
                  type="range"
                  min={1}
                  max={snap.maxLeverage ?? 1}
                  step={1}
                  value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-sp-shade/[0.08] accent-sp-brand"
                  style={{ accentColor: 'rgb(var(--sp-brand))' }}
                />
                <div className="flex justify-between text-[10px] text-sp-ink-soft">
                  <span>1x</span>
                  <span>
                    max <Val v={snap.maxLeverage} fmt={(x) => `${x}x`} /> &middot; whole multiples only
                  </span>
                </div>
              </div>

              {/* ---- PODGLAD. Kazda liczba tutaj jest policzona ta sama
                   arytmetyka, ktora wykona kontrakt. ---- */}
              <div className="rounded-[14px] bg-sp-sunken px-3 py-2.5 text-xs">
                {preview === null ? (
                  <p className="py-2 text-center text-sp-ink-soft">
                    {marginAmount === null
                      ? 'Enter a margin amount to see the fill.'
                      : 'Reserves could not be read - no honest preview is possible.'}
                  </p>
                ) : (
                  <dl className="grid gap-0.5">
                    <Row label="Est. entry price" hint="notional / size on the constant-product curve">
                      {preview.entryPrice === 0n ? <Unknown /> : fmtPrice(preview.entryPrice)}
                    </Row>
                    <Row label="Price impact" hint="how far the fill sits from the current mark">
                      {snap.mark === null || preview.entryPrice === 0n ? (
                        <Unknown />
                      ) : (
                        (() => {
                          const d = pctDelta(preview.entryPrice, snap.mark);
                          if (d === null) return <Unknown />;
                          const bad = Math.abs(d) >= 1;
                          return <span className={bad ? 'text-amber-600' : 'text-sp-ink'}>{fmtPct(d)}</span>;
                        })()
                      )}
                    </Row>
                    <Row label={`Fee (${snap.tradeFeeBps === null ? '?' : fmtBps(snap.tradeFeeBps)})`} hint="taken from the deposit on entry, and again on exit">
                      -{fmtUsdcFine(preview.feeUsdc)}
                    </Row>

                    {/* DOKAD TA OPLATA IDZIE. To sa cudze przychody wyjmowane z
                        pieniedzy tradera, wiec stoja tam, gdzie trader je placi -
                        a nie w przewodniku dwa ekrany dalej. */}
                    {feeSplit === null ? (
                      <div className="border-l border-sp-shade/15 py-0.5 pl-3 text-[11px] text-sp-ink-soft">
                        Who receives that fee could not be read from the distributor.
                      </div>
                    ) : (
                      <div className="border-l border-sp-shade/15 pl-3">
                        <Row
                          label={`↳ Market creator (${fmtBps(feeSplit.creatorBps)})`}
                          hint={
                            snap.feeLockDays === null
                              ? 'Accrued to the address that publishes this feed.'
                              : `Accrued to the address that publishes this feed; claimable after ${snap.feeLockDays} days.`
                          }
                        >
                          {fmtUsdcFine(feeSplit.creator)}
                        </Row>
                        <Row label={`↳ Insurance fund (${fmtBps(feeSplit.insuranceBps)})`} hint="Transferred to the fund on the spot - it is what covers bad debt.">
                          {fmtUsdcFine(feeSplit.insurance)}
                        </Row>
                        <Row
                          label={`↳ Treasury (${fmtBps(feeSplit.treasuryBps)})`}
                          hint={
                            snap.treasury === null
                              ? 'Whatever the first two shares leave over.'
                              : `Whatever the first two shares leave over. Treasury: ${snap.treasury}`
                          }
                        >
                          {fmtUsdcFine(feeSplit.treasury)}
                        </Row>
                      </div>
                    )}

                    <Row label="Position size">
                      {preview.size === 0n ? <Unknown /> : fmtSize(preview.size)}
                    </Row>
                    <Row label="Notional">{fmtWadCompact(preview.notional)}</Row>
                    <Row label="Margin after fee">{fmtWadCompact(preview.marginWad)}</Row>
                    <Row label="Liquidation price">
                      {preview.liqPrice === 0n ? 'unreachable' : fmtPrice(preview.liqPrice)}
                    </Row>
                    <Row label="Margin ratio on entry" hint="checked by the contract right after the swap">
                      {preview.size === 0n ? (
                        <Unknown />
                      ) : (
                        <span
                          className={
                            snap.maintenanceBps !== null && preview.marginRatioBps < BigInt(snap.maintenanceBps)
                              ? 'text-destructive'
                              : 'text-sp-ink'
                          }
                        >
                          {fmtBps(preview.marginRatioBps)}
                        </span>
                      )}
                    </Row>
                  </dl>
                )}
              </div>

              {position && (
                <p className="text-xs text-sp-ink-soft">
                  You already have a position here. This market keeps one position per address - close it first.
                </p>
              )}
              {preview?.reason && <p className="text-xs text-destructive">{preview.reason}</p>}
              {snap.slashed && <p className="text-xs text-destructive">This feed was slashed. The cap is zero.</p>}
              {snap.feedActive === false && !snap.slashed && (
                <p className="text-xs text-destructive">The feed is not active right now - the contract will reject new positions.</p>
              )}
              {wrongChain && <p className="text-xs text-destructive">Switch your wallet to {DERIV_CHAIN.name}.</p>}

              <Button
                onClick={() => void open()}
                disabled={
                  Boolean(busy) ||
                  !address ||
                  wrongChain ||
                  Boolean(snap.paused) ||
                  Boolean(snap.slashed) ||
                  snap.feedActive === false ||
                  Boolean(position) ||
                  preview === null ||
                  Boolean(preview.reason)
                }
                className={`rounded-full text-white ${side === 'long' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
              >
                {busy ?? `Open ${side}`}
              </Button>
            </CardContent>
          </Card>

          {/* ---------- KARTA POZYCJI ---------- */}
          <Card
            className={`sph-card rounded-[20px] shadow-none ${
              health?.liquidatable ? 'border-destructive/50 bg-destructive/5' : 'border-sp-shade/10 bg-sp-surface'
            }`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Your position</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {!address && <p className="text-sp-ink-soft">Connect your wallet.</p>}
              {address && !position && <p className="text-sp-ink-soft">No open position.</p>}
              {position && (
                <>
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <p className={`text-lg font-bold ${position.size > 0n ? 'text-emerald-600' : 'text-red-600'}`}>
                        {position.size > 0n ? 'Long' : 'Short'} {fmtSize(position.size)}
                      </p>
                      <p className="text-xs text-sp-ink-soft">
                        entry {fmtPrice(position.entryPrice)} &rarr; mark <Val v={snap.mark} fmt={fmtPrice} />
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-sp-ink-soft">Unrealised</p>
                      <p
                        className={`text-lg font-bold tabular-nums ${
                          position.pnl === null ? '' : position.pnl >= 0n ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        <Val v={position.pnl} fmt={fmtSignedWad} />
                      </p>
                    </div>
                  </div>

                  {/* PASEK ZDROWIA. Skala 0..20% depozytu do notionalu, znacznik
                      na progu utrzymania. Kolor bursztynowy ponizej DWUKROTNOSCI
                      progu - to jest wylacznie ostrzezenie wzrokowe, dokladna
                      liczba stoi obok. */}
                  {health === null ? (
                    <p className="text-xs text-sp-ink-soft">Margin ratio could not be read.</p>
                  ) : (
                    <>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
                        <div
                          className={`h-full rounded-full ${
                            health.liquidatable ? 'bg-red-600' : health.ratio < health.mm * 2 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.max(0, Math.min(100, (health.ratio / HEALTH_TOP_BPS) * 100))}%` }}
                        />
                        <div
                          className="absolute top-0 h-full w-0.5 bg-sp-ink/60"
                          style={{ left: `${(health.mm / HEALTH_TOP_BPS) * 100}%` }}
                          title="maintenance margin"
                        />
                      </div>
                      <p className="mt-1.5 text-xs">
                        {health.liquidatable ? (
                          <span className="font-semibold text-destructive">
                            Below maintenance - anyone can liquidate this position right now.
                          </span>
                        ) : (
                          <span className="text-sp-ink-soft">
                            Margin ratio{' '}
                            <strong className="font-semibold text-sp-ink">{fmtBps(health.ratio)}</strong>, liquidation
                            at <strong className="font-semibold text-sp-ink">{fmtBps(health.mm)}</strong>.
                          </span>
                        )}
                      </p>
                      {position.liqPrice !== null && position.liqPrice !== 0n && snap.mark !== null && (
                        <p className="mt-1 text-xs text-sp-ink-soft">
                          Mark has to move{' '}
                          <strong className="font-semibold text-sp-ink">
                            {(() => {
                              const d = pctDelta(position.liqPrice, snap.mark);
                              return d === null ? '?' : `${Math.abs(d).toFixed(2)}%`;
                            })()}
                          </strong>{' '}
                          {position.size > 0n ? 'down' : 'up'} to {fmtPrice(position.liqPrice)} to take you out.
                        </p>
                      )}
                    </>
                  )}

                  <dl className="mt-3 grid gap-1 text-xs">
                    <Row label="Notional at entry">{fmtWadCompact(position.openNotional)}</Row>
                    <Row label="Margin held">{fmtWadCompact(position.margin)}</Row>
                    <Row label="Funding owed" hint="positive means you pay">
                      <span className={position.funding > 0n ? 'text-red-600' : position.funding < 0n ? 'text-emerald-600' : ''}>
                        {fmtSignedWad(position.funding)}
                      </span>
                    </Row>
                    {funding?.perUnitNow != null && (
                      <Row label="Next settlement (est.)" hint="size x accrued funding per unit, if settled now">
                        {(() => {
                          const owed = (position.size * funding.perUnitNow) / WAD;
                          return (
                            <span className={owed > 0n ? 'text-red-600' : owed < 0n ? 'text-emerald-600' : ''}>
                              {fmtSignedWad(owed)}
                            </span>
                          );
                        })()}
                      </Row>
                    )}
                    <Row label="Liquidation price">
                      {position.liqPrice === null ? (
                        <Unknown />
                      ) : position.liqPrice === 0n ? (
                        'unreachable'
                      ) : (
                        fmtPrice(position.liqPrice)
                      )}
                    </Row>
                  </dl>

                  <p className="mt-2 text-[11px] text-sp-ink-soft">
                    Closing pays another <Val v={snap.tradeFeeBps} fmt={(x) => fmtBps(x)} /> fee and takes the exit
                    price off the same curve, so the payout will sit below the unrealised number above.
                  </p>

                  <Button
                    className="mt-3 w-full rounded-full border-sp-shade/15 text-sp-ink"
                    variant="outline"
                    onClick={() => void close()}
                    disabled={Boolean(busy) || wrongChain}
                  >
                    {busy ?? 'Close position'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Panel wystawcy ceny. Widoczny tylko dla tworcy feedu - i to jest cala
              jego wladza nad tym rynkiem: nie ma tu ani pauzy, ani likwidacji. */}
          {isCreator && (
            <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Price feed panel</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="deriv-newprice">New price (USD)</Label>
                  <Input
                    id="deriv-newprice"
                    inputMode="decimal"
                    placeholder={snap.index === null ? '' : formatEther(snap.index)}
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                  />
                </div>
                <p className="text-xs text-sp-ink-soft">
                  Up to 10% away from the last price, at most once a minute. Anyone can challenge an update within an
                  hour - the feed freezes until it&apos;s resolved. You may also trade here, but only up to{' '}
                  <Val v={snap.creatorCapBps} fmt={(x) => fmtBps(x)} /> of the cap.
                </p>
                {snap.frozen && <p className="text-xs text-destructive">Feed is frozen by a challenge.</p>}
                <Button
                  onClick={() => void submitPrice()}
                  disabled={Boolean(busy) || !wad(newPrice) || Boolean(snap.frozen) || Boolean(snap.slashed) || wrongChain}
                  className="rounded-full bg-sp-brand text-white hover:bg-sp-brand-deep"
                >
                  {busy ?? 'Submit price'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {/* Geoblokowanie/KYC swiadomie poza kontraktem - to warstwa ToS i frontu. */}
    </div>
  );
}
