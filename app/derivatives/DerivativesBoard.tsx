'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, LineChart, Plus, RefreshCw, ShieldCheck, Sprout, Timer } from 'lucide-react';
import type { Address } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import '../startpad/sphere/sphere-motion.css';
import {
  DEPLOYED,
  DERIV_CHAIN,
  FACTORY_ADDRESS,
  ORACLE_ADDRESS,
  USDC_ADDRESS,
  erc20Abi,
  factoryAbi,
  insuranceAbi,
  marketAbi,
  oracleAbi,
} from './config';
import { fmtAge, fmtDuration, fmtPct, fmtPrice, fmtSignedWad, fmtUsdc, fmtWadCompact, oiPercent, shortAddress } from './format';
import { Dot, UpDown } from './ui';
import FaucetBanner from './FaucetBanner';
import YourPositions from './YourPositions';
import CreateMarketModal from './CreateMarketModal';
import { feedByAddress } from './indexFeeds';
import FeedIcon, { instrumentBase, instrumentName } from './FeedIcon';
import PerpsGuide, { premiumBps } from './PerpsGuide';

/**
 * TABLICA RYNKOW - lista perpow, a nie lista adresow.
 *
 * ===========================================================================
 * CO SIE ZMIENILO 10 WRZESNIA 2026
 * ===========================================================================
 * Wiersz pokazywal mark, index, OI i kaucje. Trader patrzacy na taka liste nie
 * wiedzial trzech rzeczy, ktore na kazdej innej gieldzie perpow sa na wierzchu:
 * ile wynosi PREMIA miedzy markiem a indeksem (czyli w ktora strone poleci
 * funding), KIEDY ten funding sie rozliczy i kto komu zaplaci, oraz JAK ZDROWY
 * jest feed, od ktorego zalezy caly index. Wszystkie te liczby kontrakt
 * wystawia od poczatku - brakowalo tylko drogi do ekranu.
 *
 * ===========================================================================
 * MULTICALL, NIE PETLA
 * ===========================================================================
 * Poprzednia wersja robila ~7 osobnych `readContract` na rynek, sekwencyjnie.
 * Teraz wiersz potrzebuje 12 odczytow, wiec przy kilkunastu rynkach to bylyby
 * setki zapytan, a Arc limituje. Multicall3 jest w definicji lancucha, wiec
 * caly ekran mieszci sie w TRZECH zapytaniach niezaleznie od liczby rynkow.
 *
 * ===========================================================================
 * `null` ZNACZY "NIE WIEM", ZERO ZNACZY ZERO
 * ===========================================================================
 * Dlatego wiersz NIE uzywa `MarketRow` z `config.ts`, tylko wlasnego typu z
 * polami dopuszczajacymi `null`. W tym module zero to prawdziwa wartosc -
 * "rynek sciety" ma cap OI dokladnie zero - wiec podstawienie zera za nieudany
 * odczyt bylo by klamstwem nie do odroznienia od prawdy. Nieudany odczyt
 * rysuje sie jako kreska z tytulem, nigdy jako liczba.
 */
type Row = {
  id: number;
  address: Address;
  symbol: string;
  creator: Address;
  /* vAMM */
  markPrice: bigint | null;
  indexPrice: bigint | null;
  openInterest: bigint | null;
  maxOpenInterest: bigint | null;
  netSize: bigint | null;
  mature: boolean | null;
  /* funding */
  lastFundingAt: number | null;
  fundingInterval: number | null;
  maxPremiumBps: number | null;
  /* feed */
  bond: bigint | null;
  createdAt: number | null;
  updateCount: number | null;
  challengesOpened: number | null;
  frozen: boolean;
  slashed: boolean;
  priceUpdatedAt: number | null;
  feedActive: boolean | null;
  /** Adres zewnetrznego feedu indeksu (adapter Pytha) albo zero = rejestr. null = odczyt padl. */
  indexFeed: Address | null;
  /* zmiana indeksu z logow PriceSubmitted w oknie 40k blokow; null = < 2 punkty */
  change: number | null;
  changeSince: number | null;
};

/** Zdrowie funduszu - to samo pole, co decyduje o globalnej pauzie. */
type Health = { balance: bigint | null; required: bigint | null; paused: boolean | null } | null;

/** Jeden wpis aktywnosci ZE WSZYSTKICH rynkow naraz - realne logi, nie zmyslone. */
type ActivityItem =
  | { kind: 'opened'; symbol: string; market: Address; trader: Address; isLong: boolean; notional: bigint; entryPrice: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'closed'; symbol: string; market: Address; trader: Address; exitNotional: bigint; pnl: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'liquidated'; symbol: string; market: Address; trader: Address; keeper: Address; payoutUsdc: bigint; block: bigint; txHash: string; at: number };

const ZERO = '0x0000000000000000000000000000000000000000';

/** Wynik jednego wywolania z multicalla: sukces albo NIC. Nigdy zero. */
const ok = (r: unknown): unknown => {
  const x = r as { status?: string; result?: unknown } | undefined;
  return x && x.status === 'success' ? x.result : null;
};
const big = (r: unknown): bigint | null => (r == null ? null : (r as bigint));
const num = (r: unknown): number | null => (r == null ? null : Number(r as bigint | number));

/** Odliczanie do rozliczenia fundingu. Ujemne = zalega i kazdy moze je odpalic. */
function fmtCountdown(seconds: number): string {
  if (seconds <= 0) return 'due';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Nieudany odczyt ma wygladac jak brak odczytu, a nie jak liczba. */
function Missing() {
  return (
    <span className="text-sp-ink-soft" title="This value could not be read from the contract">
      &mdash;
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-sp-shade/10 bg-sp-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sp-ink-soft">{label}</p>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-sp-ink">{children}</div>
    </div>
  );
}

/** Podpis komorki, widoczny tylko na waskim ekranie - na szerokim jest naglowek. */
function CellLabel({ children }: { children: string }) {
  return <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft lg:hidden">{children}</p>;
}

export default function DerivativesBoard() {
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const { address } = useAccount();
  const [rows, setRows] = useState<Row[]>([]);
  const [usdcBalance, setUsdcBalance] = useState<bigint | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [health, setHealth] = useState<Health>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /* ---- WEJSCIE Z KREATORA TOKENU. Startpad na Arc podaje w URL adres
     adaptera i symbol (/derivatives?new=1&feed=0x..&symbol=..), zeby tworca
     sparowanego tokenu nie przepisywal nic recznie. Czytamy z window, nie z
     useSearchParams - ten drugi wymaga Suspense przy statycznym renderze. ---- */
  const [prefill, setPrefill] = useState<{ feed: Address | null; symbol: string | null }>({ feed: null, symbol: null });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') !== '1') return;
    const feed = params.get('feed');
    setPrefill({ feed: feed && /^0x[0-9a-fA-F]{40}$/.test(feed) ? (feed as Address) : null, symbol: params.get('symbol') });
    setCreateOpen(true);
  }, []);
  const [guideOpen, setGuideOpen] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const guideRef = useRef<HTMLDivElement | null>(null);

  // Zegar odliczania do fundingu. Sekunda wystarczy - rynek i tak rozlicza sie
  // co godzine, a szybszy interwal to tylko przerysowania.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!client || !DEPLOYED) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Zapytanie 1: adres funduszu i liczba feedow w rejestrze.
      const head1 = await client.multicall({
        contracts: [
          { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'INSURANCE' },
          { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'marketCount' },
        ] as never,
        allowFailure: true,
      });
      const insurance = ok(head1[0]) as Address | null;
      const count = Number((ok(head1[1]) as bigint | null) ?? 0n);
      if (insurance == null) throw new Error('The factory did not return an insurance fund address.');

      // Zapytanie 2: ktory feed ma juz vAMM. Rejestr numeruje od jedynki, a
      // rynek istnieje tylko dla czesci feedow - stad odsiew adresow zerowych.
      const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1));
      const addrRes = ids.length
        ? await client.multicall({
            contracts: ids.map((id) => ({
              address: FACTORY_ADDRESS,
              abi: factoryAbi,
              functionName: 'marketOf',
              args: [id],
            })) as never,
            allowFailure: true,
          })
        : [];
      const live = ids
        .map((id, i) => ({ id: Number(id), address: ok(addrRes[i]) as Address | null }))
        .filter((m): m is { id: number; address: Address } => m.address != null && m.address !== ZERO);

      // Zapytanie 3: WSZYSTKO pozostale naraz - fundusz plus 12 odczytow na
      // rynek. Kolejnosc jest tu kontraktem miedzy budowaniem a odczytem, wiec
      // liczba `PER_MARKET` i lista ponizej musza sie zgadzac co do jednego.
      const PER_MARKET = 13;
      const marketCalls = live.flatMap(({ id, address }) => [
        { address, abi: marketAbi, functionName: 'markPrice' },
        { address, abi: marketAbi, functionName: 'indexPrice' },
        { address, abi: marketAbi, functionName: 'openInterestNotional' },
        { address, abi: marketAbi, functionName: 'maxOpenInterest' },
        { address, abi: marketAbi, functionName: 'isMature' },
        { address, abi: marketAbi, functionName: 'netSize' },
        { address, abi: marketAbi, functionName: 'lastFundingAt' },
        { address, abi: marketAbi, functionName: 'FUNDING_INTERVAL' },
        { address, abi: marketAbi, functionName: 'MAX_PREMIUM_BPS' },
        { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getMarket', args: [BigInt(id)] },
        { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'marketStats', args: [BigInt(id)] },
        { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'isActive', args: [BigInt(id)] },
        // NA KONCU, zeby nie przesuwac indeksow at(0..11) powyzej.
        { address, abi: marketAbi, functionName: 'CHAINLINK_FEED' },
      ]);
      const res = await client.multicall({
        contracts: [
          { address: insurance, abi: insuranceAbi, functionName: 'balance' },
          { address: insurance, abi: insuranceAbi, functionName: 'requiredBalance' },
          { address: insurance, abi: insuranceAbi, functionName: 'newPositionsPaused' },
          ...marketCalls,
        ] as never,
        allowFailure: true,
      });

      setHealth({
        balance: big(ok(res[0])),
        required: big(ok(res[1])),
        paused: ok(res[2]) == null ? null : Boolean(ok(res[2])),
      });

      const collected: Row[] = live.map(({ id, address }, i) => {
        const at = (offset: number) => ok(res[3 + i * PER_MARKET + offset]);
        const meta = at(9) as readonly unknown[] | null;
        const stats = at(10) as readonly unknown[] | null;
        return {
          id,
          address,
          symbol: (meta?.[2] as string) ?? shortAddress(address),
          creator: (meta?.[0] as Address) ?? ZERO,
          markPrice: big(at(0)),
          indexPrice: big(at(1)),
          openInterest: big(at(2)),
          maxOpenInterest: big(at(3)),
          mature: at(4) == null ? null : Boolean(at(4)),
          netSize: big(at(5)),
          lastFundingAt: num(at(6)),
          fundingInterval: num(at(7)),
          maxPremiumBps: num(at(8)),
          // Kaucja i kartoteka feedu; `frozen`/`slashed` domyslnie falsz, bo
          // ostrzezenie, ktorego nie potwierdzil odczyt, tez jest klamstwem.
          bond: stats ? (stats[0] as bigint) : null,
          createdAt: stats ? Number(stats[1]) : null,
          updateCount: stats ? Number(stats[2]) : null,
          challengesOpened: stats ? Number(stats[3]) : null,
          frozen: stats ? Boolean(stats[4]) : false,
          slashed: stats ? Boolean(stats[5]) : false,
          priceUpdatedAt: meta ? Number(meta[4]) : null,
          feedActive: at(11) == null ? null : Boolean(at(11)),
          indexFeed: (at(12) as Address | null) ?? null,
          change: null,
          changeSince: null,
        };
      });
      setRows(collected);

      // Saldo USDC podlaczonego portfela - dla banera kranu. Osobny odczyt,
      // bo zalezy od adresu, a nie od listy rynkow.
      if (address) {
        try {
          const bal = (await client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] })) as bigint;
          setUsdcBalance(bal);
        } catch {
          setUsdcBalance(null);
        }
      } else {
        setUsdcBalance(null);
      }

      // Zmiana ceny: JEDEN getLogs po calym rejestrze (bez filtra marketId),
      // pogrupowany po rynku. Okno 40k blokow to ok. 5,5 h na Arcu - podpis
      // pod liczba mowi, od kiedy, zamiast udawac "24h". Rynek bez dwoch
      // punktow w oknie pokazuje kreske, nie zero.
      try {
        const head = await client.getBlockNumber();
        const from = head > 40_000n ? head - 40_000n : 0n;
        const logs = (await client.getContractEvents({
          address: ORACLE_ADDRESS,
          abi: oracleAbi,
          eventName: 'PriceSubmitted',
          fromBlock: from,
          toBlock: head,
        })) as unknown as { args: { marketId?: bigint; price?: bigint; timestamp?: bigint } }[];
        const byMarket = new Map<number, { time: number; price: bigint }[]>();
        for (const l of logs) {
          if (l.args.marketId === undefined || l.args.price === undefined || l.args.timestamp === undefined) continue;
          const id = Number(l.args.marketId);
          const arr = byMarket.get(id) ?? [];
          arr.push({ time: Number(l.args.timestamp), price: l.args.price });
          byMarket.set(id, arr);
        }
        setRows((prev) =>
          prev.map((row) => {
            const pts = (byMarket.get(row.id) ?? []).sort((a, b) => a.time - b.time);
            if (pts.length < 2 || pts[0].price === 0n) return row;
            const change = Number(((pts[pts.length - 1].price - pts[0].price) * 1_000_000n) / pts[0].price) / 10_000;
            return { ...row, change, changeSince: pts[0].time };
          }),
        );
      } catch {
        /* brak okna getLogs - kolumna zostaje z kreskami */
      }

      // Aktywnosc ze WSZYSTKICH rynkow naraz - realne logi PositionOpened/
      // Closed/Liquidated, to samo okno co sparkline cen na stronie rynku.
      // Zero syntetycznych wpisow: bez ruchu na rynkach lista jest pusta.
      try {
        const head = await client.getBlockNumber();
        const from = head > 40_000n ? head - 40_000n : 0n;
        const perMarket = await Promise.all(
          collected.map(async (row) => {
            const [opened, closed, liquidated] = await Promise.all([
              client.getContractEvents({ address: row.address, abi: marketAbi, eventName: 'PositionOpened', fromBlock: from, toBlock: head }),
              client.getContractEvents({ address: row.address, abi: marketAbi, eventName: 'PositionClosed', fromBlock: from, toBlock: head }),
              client.getContractEvents({ address: row.address, abi: marketAbi, eventName: 'Liquidated', fromBlock: from, toBlock: head }),
            ]);
            return { row, opened, closed, liquidated };
          }),
        );

        const allLogs = perMarket.flatMap((m) => [...m.opened, ...m.closed, ...m.liquidated]);
        const blockNumbers = Array.from(new Set(allLogs.map((l: any) => l.blockNumber as bigint)));
        const blocks = await Promise.all(blockNumbers.map((bn) => client.getBlock({ blockNumber: bn })));
        const atByBlock = new Map(blockNumbers.map((bn, i) => [bn, Number(blocks[i].timestamp)]));

        const items: ActivityItem[] = perMarket.flatMap(({ row, opened, closed, liquidated }) => [
          ...opened.map((l: any): ActivityItem => ({
            kind: 'opened',
            symbol: row.symbol,
            market: row.address,
            trader: l.args.trader as Address,
            isLong: l.args.isLong as boolean,
            notional: l.args.notional as bigint,
            entryPrice: l.args.entryPrice as bigint,
            block: l.blockNumber as bigint,
            txHash: l.transactionHash as string,
            at: atByBlock.get(l.blockNumber as bigint) ?? 0,
          })),
          ...closed.map((l: any): ActivityItem => ({
            kind: 'closed',
            symbol: row.symbol,
            market: row.address,
            trader: l.args.trader as Address,
            exitNotional: l.args.exitNotional as bigint,
            pnl: l.args.pnl as bigint,
            block: l.blockNumber as bigint,
            txHash: l.transactionHash as string,
            at: atByBlock.get(l.blockNumber as bigint) ?? 0,
          })),
          ...liquidated.map((l: any): ActivityItem => ({
            kind: 'liquidated',
            symbol: row.symbol,
            market: row.address,
            trader: l.args.trader as Address,
            keeper: l.args.keeper as Address,
            payoutUsdc: l.args.payoutUsdc as bigint,
            block: l.blockNumber as bigint,
            txHash: l.transactionHash as string,
            at: atByBlock.get(l.blockNumber as bigint) ?? 0,
          })),
        ]);
        items.sort((a, b) => (b.block === a.block ? 0 : b.block > a.block ? 1 : -1));
        setActivity(items.slice(0, 15));
      } catch {
        setActivity([]);
      }
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "Couldn't load markets.");
    } finally {
      setLoading(false);
    }
  }, [client, address]);

  useEffect(() => {
    void load();
  }, [load]);

  // Rynek, z ktorego wyjasnienie czyta stale kontraktu. Wystarczy pierwszy -
  // stale sa te same we wszystkich instancjach, a odczyt z zywego rynku jest
  // uczciwszy od wpisania ich w kod.
  const guideMarket = rows[0];

  // Suma OI liczy sie tylko z rynkow, ktore FAKTYCZNIE oddaly liczbe.
  const oiRead = rows.filter((r) => r.openInterest != null);
  const totalOi = oiRead.reduce((sum, r) => sum + (r.openInterest as bigint), 0n);

  return (
    <div className="sphere-shell sph-stagger mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sp-brand-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-sp-brand-deep">
            <span className="h-1.5 w-1.5 rounded-full bg-sp-brand" />
            Arc testnet
          </span>
          <h1 className="mt-2.5 text-[28px] font-extrabold tracking-tight text-sp-ink">Arc Derivatives</h1>
          <p className="mt-1 text-[13px] text-sp-ink-soft">
            vAMM perpetuals. Anyone can list a price feed with a bond and earn the trading fees.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-full border-sp-shade/15 bg-sp-surface text-sp-ink hover:bg-sp-hover"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={!DEPLOYED}
            className="rounded-full bg-sp-brand text-white hover:bg-sp-brand-deep"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            New market
          </Button>
        </div>
      </header>

      {!DEPLOYED && (
        <Card className="mb-6 rounded-[18px] border-amber-500/30 bg-amber-500/[0.06]">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span className="text-sp-ink-soft">
              This module isn&apos;t deployed on this network yet. Run{' '}
              <code className="rounded bg-sp-shade/[0.06] px-1 py-0.5 text-xs">scripts/deploy-derivative-market.ts</code> and
              set <code className="rounded bg-sp-shade/[0.06] px-1 py-0.5 text-xs">NEXT_PUBLIC_DERIV_FACTORY</code>{' '}
              and <code className="rounded bg-sp-shade/[0.06] px-1 py-0.5 text-xs">NEXT_PUBLIC_DERIV_ORACLE</code>.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Pauza globalna dotyczy WSZYSTKICH rynkow naraz - musi byc widoczna
          na tablicy, a nie dopiero przy nieudanej transakcji. */}
      {health?.paused === true && (
        <Card className="mb-6 rounded-[18px] border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">New positions are paused across the module</p>
              <p className="mt-1 text-sp-ink-soft">
                The insurance fund holds {health.balance != null ? fmtUsdc(health.balance) : 'an amount it would not report'}{' '}
                against {health.required != null ? fmtUsdc(health.required) : 'an unreadable requirement'} required for
                the current open interest. Closing positions and liquidations still work normally.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {DEPLOYED && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {health && health.paused === false && (
            <div className="inline-flex items-center gap-2 rounded-full border border-sp-shade/10 bg-sp-surface py-1.5 pl-1.5 pr-3.5 text-xs shadow-chip">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sp-brand-soft text-sp-brand-deep">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <span className="text-sp-ink-soft">Insurance fund</span>
              <span className="font-bold tabular-nums text-sp-ink">
                {health.balance != null ? fmtUsdc(health.balance) : <Missing />}
              </span>
              <span className="text-sp-ink-soft">
                / {health.required != null ? fmtUsdc(health.required) : '?'} required
              </span>
            </div>
          )}
          {/* Bylo tu `/how#arc-derivatives` - strona o LAUNCHPADZIE. Wyjasnienie
              perpow mieszka teraz w tym module i otwiera sie na miejscu. */}
          <button
            type="button"
            onClick={() => {
              setGuideOpen(true);
              guideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="inline-flex items-center rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-1.5 text-xs font-semibold text-sp-ink-soft hover:text-sp-brand-deep"
          >
            How perps work
          </button>
          <a
            href={`${DERIV_CHAIN.blockExplorers?.default.url}/address/${FACTORY_ADDRESS}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-1.5 text-xs font-semibold text-sp-ink-soft hover:text-sp-brand-deep"
          >
            Contracts on Arcscan
          </a>
        </div>
      )}

      {DEPLOYED && <FaucetBanner balance={usdcBalance} connected={Boolean(address)} />}
      {DEPLOYED && <YourPositions address={address} markets={rows} />}

      {error && (
        <Card className="mb-6 rounded-[18px] border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && rows.length === 0 && (
        <p className="py-12 text-center text-sm text-sp-ink-soft">Loading markets...</p>
      )}

      {!loading && DEPLOYED && rows.length === 0 && !error && (
        <Card className="rounded-[22px] border-dashed border-sp-shade/20 bg-sp-surface">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sp-brand-soft text-sp-brand-deep">
              <LineChart className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-sp-ink">No markets yet</p>
              <p className="mt-1 text-sm text-sp-ink-soft">List a price feed and the market is ready to trade.</p>
            </div>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="mt-1 rounded-full bg-sp-brand text-white hover:bg-sp-brand-deep"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create the first market
            </Button>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Markets">{rows.length}</Stat>
          <Stat label="Total open interest">
            {oiRead.length === rows.length ? (
              fmtWadCompact(totalOi)
            ) : oiRead.length === 0 ? (
              <Missing />
            ) : (
              <span title={`${rows.length - oiRead.length} market(s) did not report open interest`}>
                {fmtWadCompact(totalOi)}
                <span className="text-sp-ink-soft">*</span>
              </span>
            )}
          </Stat>
          <Stat label="Fund coverage">
            {health?.balance != null && health.required != null ? (
              health.required === 0n ? (
                <span className="text-emerald-600">no cover needed</span>
              ) : (
                <span className={health.balance < health.required ? 'text-destructive' : 'text-emerald-600'}>
                  {(Number((health.balance * 1000n) / health.required) / 10).toFixed(1)}%
                </span>
              )
            ) : (
              <Missing />
            )}
          </Stat>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-[18px] border border-sp-shade/10 bg-sp-surface">
          {/* Szesc kolumn dla tradera: cena, zmiana, funding, OI, feed. Kaucja,
              challenge'e i tworca sa w tooltipie badge'a - to ryzyko protokolu,
              nie decyzja przy zleceniu. Naglowek tylko od lg w gore. */}
          <div className="hidden grid-cols-[1.6fr_1fr_0.9fr_1.1fr_1.3fr_0.9fr] gap-4 border-b border-sp-shade/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sp-ink-soft lg:grid">
            <span>Market</span>
            <span className="text-right">Price</span>
            <span className="text-right">Change</span>
            <span className="text-right">Funding / 1h</span>
            <span>Open interest</span>
            <span>Registry feed</span>
          </div>
          <div>
            {rows.map((row) => {
              const pct =
                row.openInterest != null && row.maxOpenInterest != null
                  ? oiPercent(row.openInterest, row.maxOpenInterest)
                  : null;
              const prem = premiumBps(row.markPrice, row.indexPrice);
              const capped = prem != null && row.maxPremiumBps != null && Math.abs(prem) > row.maxPremiumBps;
              // Stawka godzinowa z premii przycietej do sufitu: kontrakt nalicza
              // `premia / index` na dobe, dashboard pokazuje to na godzine.
              const effBps =
                prem == null || row.maxPremiumBps == null ? prem : Math.max(-row.maxPremiumBps, Math.min(row.maxPremiumBps, prem));
              const perHour = effBps == null ? null : effBps / 100 / 24;
              const dueIn =
                row.lastFundingAt != null && row.fundingInterval != null
                  ? row.lastFundingAt + row.fundingInterval - now
                  : null;
              const feedAge = row.priceUpdatedAt != null ? now - row.priceUpdatedAt : null;
              const feedTone: 'up' | 'warn' | 'down' | 'muted' =
                row.slashed || row.frozen || row.feedActive === false
                  ? 'down'
                  : row.feedActive == null || feedAge == null
                    ? 'muted'
                    : row.fundingInterval != null && feedAge > row.fundingInterval
                      ? 'warn'
                      : 'up';
              const feedTitle = [
                row.bond != null ? `bond ${fmtUsdc(row.bond)}` : null,
                row.updateCount != null ? `${row.updateCount} prices accepted` : null,
                row.challengesOpened != null && row.challengesOpened > 0 ? `${row.challengesOpened} challenged` : null,
                row.creator !== ZERO ? `creator ${shortAddress(row.creator)}` : null,
              ]
                .filter(Boolean)
                .join(' - ');

              return (
                <Link
                  key={row.address}
                  href={`/derivatives/${row.address}`}
                  className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-sp-shade/10 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-sp-hover lg:grid-cols-[1.6fr_1fr_0.9fr_1.1fr_1.3fr_0.9fr] lg:items-center lg:gap-y-0"
                >
                  <div className="col-span-2 flex items-center gap-3 lg:col-span-1">
                    <FeedIcon base={feedByAddress(row.indexFeed)?.base ?? instrumentBase(row.symbol)} size={38} />
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-sp-ink">{row.symbol}</span>
                      {row.slashed ? (
                        <Badge variant="destructive" className="rounded-full" title={feedTitle}>slashed</Badge>
                      ) : row.frozen ? (
                        <Badge variant="destructive" className="rounded-full" title={feedTitle}>frozen</Badge>
                      ) : row.mature === true ? (
                        <Badge className="gap-1 rounded-full border-transparent bg-sp-brand-soft text-sp-brand-deep hover:bg-sp-brand-soft" title={feedTitle}>
                          <ShieldCheck className="h-3 w-3" />
                          mature
                        </Badge>
                      ) : row.mature === false ? (
                        <Badge variant="outline" className="gap-1 rounded-full border-sp-shade/15 text-sp-ink-soft" title={feedTitle}>
                          <Sprout className="h-3 w-3" />
                          probation
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-sp-ink-soft">
                      {/* Nazwa instrumentu + skad indeks. "Tesla · Pyth" mowi traderowi
                          wiecej niz wiek rynku; wiek i cap zostaja w tooltipie badge'a. */}
                      {instrumentName(feedByAddress(row.indexFeed)?.base ?? instrumentBase(row.symbol))}
                      {row.indexFeed && row.indexFeed !== ZERO ? ' · external oracle configured' : row.indexFeed === ZERO ? ' · index from registry' : ''}
                      {row.mature === false && row.maxOpenInterest != null ? ` · cap ${fmtWadCompact(row.maxOpenInterest)}` : ''}
                    </p>
                    </div>
                  </div>

                  <div className="lg:text-right">
                    <CellLabel>Price</CellLabel>
                    <p className="text-base font-bold tabular-nums text-sp-ink">
                      {row.markPrice != null ? fmtPrice(row.markPrice) : <Missing />}
                    </p>
                    <p className="text-[11px] tabular-nums text-sp-ink-soft">
                      index {row.indexPrice != null ? fmtPrice(row.indexPrice) : <Missing />}
                    </p>
                  </div>

                  <div className="lg:text-right">
                    <CellLabel>Change</CellLabel>
                    {row.change == null ? (
                      <p className="font-semibold text-sp-ink-soft">
                        <Missing />
                      </p>
                    ) : (
                      <>
                        <p className="font-semibold tabular-nums">
                          <UpDown value={row.change}>{fmtPct(row.change)}</UpDown>
                        </p>
                        <p className="text-[11px] text-sp-ink-soft">
                          {row.changeSince != null ? `since ${fmtDuration(Math.max(0, now - row.changeSince))} ago` : ''}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="lg:text-right">
                    <CellLabel>Funding / 1h</CellLabel>
                    {perHour == null ? (
                      <Missing />
                    ) : (
                      <>
                        <p className="font-semibold tabular-nums" title={capped ? 'Beyond the premium cap - funding charges the capped rate' : undefined}>
                          <UpDown value={perHour}>{fmtPct(perHour, 4)}</UpDown>
                          <span className="ml-1 text-[10px] font-normal text-sp-ink-soft">
                            {perHour > 0 ? 'longs pay' : perHour < 0 ? 'shorts pay' : 'flat'}
                          </span>
                        </p>
                        <p className="inline-flex items-center gap-1 text-[11px] tabular-nums text-sp-ink-soft lg:justify-end">
                          <Timer className="h-3 w-3" />
                          {dueIn == null ? <Missing /> : fmtCountdown(dueIn)}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="col-span-2 lg:col-span-1">
                    <CellLabel>Open interest</CellLabel>
                    <p className="font-semibold tabular-nums text-sp-ink">
                      {row.openInterest != null ? fmtWadCompact(row.openInterest) : <Missing />}
                      <span className="ml-1 text-[11px] font-normal text-sp-ink-soft">{pct != null ? `${pct.toFixed(0)}% of cap` : ''}</span>
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
                      {pct != null && (
                        <div className={`h-full rounded-full ${pct > 85 ? 'bg-destructive' : 'bg-sp-brand'}`} style={{ width: `${pct}%` }} />
                      )}
                    </div>
                  </div>

                  <div>
                    <CellLabel>Registry feed</CellLabel>
                    <p className="inline-flex items-center gap-1.5 font-semibold text-sp-ink" title={feedTitle}>
                      <Dot tone={feedTone} />
                      {feedTone === 'down' ? 'halted' : feedTone === 'warn' ? 'aging' : feedTone === 'up' ? 'live' : 'unknown'}
                    </p>
                    <p className="text-[11px] text-sp-ink-soft">{feedAge != null ? `${fmtDuration(feedAge)} ago` : <Missing />}</p>
                    {/* Skad indeks: adapter Pytha (funding za cena z zewnatrz) albo
                        rejestr (cena publikowana przez tworce). Ta roznica jest
                        wazniejsza dla tradera niz wiek ostatniego wpisu w rejestrze. */}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Wyjasnienie perpow - w module, nie na stronie produktowej. */}
      {DEPLOYED && (
        <div ref={guideRef} className="mt-4 scroll-mt-4">
          <PerpsGuide
            market={guideMarket?.address}
            symbol={guideMarket?.symbol}
            open={guideOpen}
            onOpenChange={setGuideOpen}
          />
        </div>
      )}

      {activity.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-[18px] border border-sp-shade/10 bg-sp-surface">
          <p className="border-b border-sp-shade/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sp-ink-soft">
            Recent activity
          </p>
          <div>
            {activity.map((item) => (
              <a
                key={`${item.txHash}-${item.kind}`}
                href={`${DERIV_CHAIN.blockExplorers?.default.url}/tx/${item.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-wrap items-center justify-between gap-2 border-b border-sp-shade/10 px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-sp-hover"
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
                  <span className="font-semibold text-sp-ink">{item.symbol}</span>
                  <span className="text-xs text-sp-ink-soft">{shortAddress(item.trader)}</span>
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
                  <span className="text-sp-ink-soft">{fmtAge(item.at)} ago</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {DEPLOYED && (
        <details className="mt-4 rounded-[16px] border border-sp-shade/10 bg-sp-surface px-4 py-3 text-xs">
          <summary className="cursor-pointer font-semibold text-sp-ink-soft">Deployed contracts (Arc testnet)</summary>
          <dl className="mt-3 grid gap-2">
            {[
              { name: 'PriceOracleRegistry', address: ORACLE_ADDRESS },
              { name: 'DerivativeMarketFactory', address: FACTORY_ADDRESS },
              { name: 'USDC (test token)', address: USDC_ADDRESS },
            ].map((c) => (
              <div key={c.address} className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-sp-ink-soft">{c.name}</dt>
                <dd className="min-w-0">
                  <a
                    href={`${DERIV_CHAIN.blockExplorers?.default.url}/address/${c.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block break-all font-mono tabular-nums text-sp-brand-deep hover:underline"
                  >
                    {c.address}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <CreateMarketModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        referenceMarket={guideMarket?.address}
        initialFeed={prefill.feed}
        initialSymbol={prefill.symbol}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </div>
  );
}
