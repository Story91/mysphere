'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, LineChart, Plus, RefreshCw, ShieldCheck, Sprout } from 'lucide-react';
import type { Address } from 'viem';
import { usePublicClient } from 'wagmi';
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
  factoryAbi,
  insuranceAbi,
  marketAbi,
  oracleAbi,
  type MarketRow,
} from './config';
import { fmtAge, fmtPrice, fmtSignedWad, fmtUsdc, fmtWadCompact, oiPercent, shortAddress } from './format';
import CreateMarketModal from './CreateMarketModal';

/** Zdrowie funduszu - to samo pole, co decyduje o globalnej pauzie. */
type Health = { balance: bigint; required: bigint; paused: boolean } | null;

/** Jeden wpis aktywnosci ZE WSZYSTKICH rynkow naraz - realne logi, nie zmyslone. */
type ActivityItem =
  | { kind: 'opened'; symbol: string; market: Address; trader: Address; isLong: boolean; notional: bigint; entryPrice: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'closed'; symbol: string; market: Address; trader: Address; exitNotional: bigint; pnl: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'liquidated'; symbol: string; market: Address; trader: Address; keeper: Address; payoutUsdc: bigint; block: bigint; txHash: string; at: number };

export default function DerivativesBoard() {
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [health, setHealth] = useState<Health>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!client || !DEPLOYED) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const insurance = (await client.readContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: 'INSURANCE',
      })) as Address;

      const [balance, required, paused] = (await Promise.all([
        client.readContract({ address: insurance, abi: insuranceAbi, functionName: 'balance' }),
        client.readContract({ address: insurance, abi: insuranceAbi, functionName: 'requiredBalance' }),
        client.readContract({ address: insurance, abi: insuranceAbi, functionName: 'newPositionsPaused' }),
      ])) as [bigint, bigint, boolean];
      setHealth({ balance, required, paused });

      // Rynki numerowane sa w REJESTRZE (od 1), a vAMM istnieje tylko dla
      // niektorych feedow - stad przejscie przez `marketOf` i odsianie zer.
      const count = Number(
        (await client.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'marketCount' })) as bigint,
      );

      const collected: MarketRow[] = [];
      for (let id = 1; id <= count; id++) {
        const address = (await client.readContract({
          address: FACTORY_ADDRESS,
          abi: factoryAbi,
          functionName: 'marketOf',
          args: [BigInt(id)],
        })) as Address;
        if (address === '0x0000000000000000000000000000000000000000') continue;

        const [meta, stats] = (await Promise.all([
          client.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getMarket', args: [BigInt(id)] }),
          client.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'marketStats', args: [BigInt(id)] }),
        ])) as [readonly any[], readonly any[]];

        const [mark, index, oi, cap, mature] = (await Promise.all([
          client.readContract({ address, abi: marketAbi, functionName: 'markPrice' }),
          client.readContract({ address, abi: marketAbi, functionName: 'indexPrice' }),
          client.readContract({ address, abi: marketAbi, functionName: 'openInterestNotional' }),
          client.readContract({ address, abi: marketAbi, functionName: 'maxOpenInterest' }),
          client.readContract({ address, abi: marketAbi, functionName: 'isMature' }),
        ])) as [bigint, bigint, bigint, bigint, boolean];

        collected.push({
          id,
          address,
          symbol: meta[2] as string,
          creator: meta[0] as Address,
          markPrice: mark,
          indexPrice: index,
          openInterest: oi,
          maxOpenInterest: cap,
          bond: stats[0] as bigint,
          createdAt: Number(stats[1]),
          updateCount: Number(stats[2]),
          challengesOpened: Number(stats[3]),
          frozen: stats[4] as boolean,
          slashed: stats[5] as boolean,
          mature,
        });
      }
      setRows(collected);

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
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

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
      {health?.paused && (
        <Card className="mb-6 rounded-[18px] border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">New positions are paused across the module</p>
              <p className="mt-1 text-sp-ink-soft">
                The insurance fund holds {fmtUsdc(health.balance)} against {fmtUsdc(health.required)} required for the
                current open interest. Closing positions and liquidations still work normally.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {DEPLOYED && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {health && !health.paused && (
            <div className="inline-flex items-center gap-2 rounded-full border border-sp-shade/10 bg-sp-surface py-1.5 pl-1.5 pr-3.5 text-xs shadow-chip">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sp-brand-soft text-sp-brand-deep">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <span className="text-sp-ink-soft">Insurance fund</span>
              <span className="font-bold tabular-nums text-sp-ink">{fmtUsdc(health.balance)}</span>
              <span className="text-sp-ink-soft">/ {fmtUsdc(health.required)} required</span>
            </div>
          )}
          <Link
            href="/how#arc-derivatives"
            className="inline-flex items-center rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-1.5 text-xs font-semibold text-sp-ink-soft hover:text-sp-brand-deep"
          >
            How it works
          </Link>
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
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-[16px] border border-sp-shade/10 bg-sp-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sp-ink-soft">Markets</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-sp-ink">{rows.length}</p>
          </div>
          <div className="rounded-[16px] border border-sp-shade/10 bg-sp-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sp-ink-soft">Total open interest</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-sp-ink">
              {fmtWadCompact(rows.reduce((sum, r) => sum + r.openInterest, 0n))}
            </p>
          </div>
          <div className="rounded-[16px] border border-sp-shade/10 bg-sp-surface px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sp-ink-soft">Mature markets</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-sp-ink">{rows.filter((r) => r.mature).length}</p>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-[18px] border border-sp-shade/10 bg-sp-surface">
          {/* Naglowek kolumn - tylko od md w gore, na telefonie kazdy wiersz
              sam podpisuje swoje wartosci. */}
          <div className="hidden grid-cols-[2fr_1fr_1fr_1.3fr_1fr] gap-4 border-b border-sp-shade/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sp-ink-soft md:grid">
            <span>Market</span>
            <span className="text-right">Mark price</span>
            <span className="text-right">Index price</span>
            <span>Open interest</span>
            <span className="text-right">Bond</span>
          </div>
          <div>
            {rows.map((row) => {
              const pct = oiPercent(row.openInterest, row.maxOpenInterest);
              return (
                <Link
                  key={row.address}
                  href={`/derivatives/${row.address}`}
                  className="grid grid-cols-2 gap-4 border-b border-sp-shade/10 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-sp-hover md:grid-cols-[2fr_1fr_1fr_1.3fr_1fr] md:items-center"
                >
                  <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sp-ink">{row.symbol}</span>
                      {row.slashed ? (
                        <Badge variant="destructive" className="rounded-full">slashed</Badge>
                      ) : row.frozen ? (
                        <Badge variant="destructive" className="rounded-full">frozen</Badge>
                      ) : row.mature ? (
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
                    <p className="mt-1 text-xs text-sp-ink-soft">
                      {fmtAge(row.createdAt)} old &middot; {row.updateCount} prices &middot; creator{' '}
                      {shortAddress(row.creator)}
                    </p>
                  </div>

                  <div className="md:text-right">
                    <p className="text-[11px] text-sp-ink-soft md:hidden">Mark price</p>
                    <p className="font-semibold tabular-nums text-sp-ink">{fmtPrice(row.markPrice)}</p>
                  </div>
                  <div className="md:text-right">
                    <p className="text-[11px] text-sp-ink-soft md:hidden">Index price</p>
                    <p className="font-semibold tabular-nums text-sp-ink">{fmtPrice(row.indexPrice)}</p>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <p className="text-[11px] text-sp-ink-soft">
                      {fmtWadCompact(row.openInterest)} / {fmtWadCompact(row.maxOpenInterest)}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
                      <div
                        className={`h-full rounded-full ${pct > 85 ? 'bg-destructive' : 'bg-sp-brand'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="md:text-right">
                    <p className="text-[11px] text-sp-ink-soft md:hidden">Bond</p>
                    <p className="font-semibold tabular-nums text-sp-ink">{fmtUsdc(row.bond)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
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
        <details className="mt-8 rounded-[16px] border border-sp-shade/10 bg-sp-surface px-4 py-3 text-xs">
          <summary className="cursor-pointer font-semibold text-sp-ink-soft">Deployed contracts (Arc testnet)</summary>
          <dl className="mt-3 grid gap-2">
            {[
              { name: 'PriceOracleRegistry', address: ORACLE_ADDRESS },
              { name: 'DerivativeMarketFactory', address: FACTORY_ADDRESS },
              { name: 'USDC (test token)', address: USDC_ADDRESS },
            ].map((c) => (
              <div key={c.address} className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-sp-ink-soft">{c.name}</dt>
                <dd>
                  <a
                    href={`${DERIV_CHAIN.blockExplorers?.default.url}/address/${c.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono tabular-nums text-sp-brand-deep hover:underline"
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
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </div>
  );
}
