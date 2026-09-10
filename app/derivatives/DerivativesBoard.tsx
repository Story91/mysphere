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
  factoryAbi,
  insuranceAbi,
  marketAbi,
  oracleAbi,
  type MarketRow,
} from './config';
import { fmtAge, fmtPrice, fmtUsdc, fmtWadCompact, oiPercent, shortAddress } from './format';
import CreateMarketModal from './CreateMarketModal';

/** Zdrowie funduszu - to samo pole, co decyduje o globalnej pauzie. */
type Health = { balance: bigint; required: bigint; paused: boolean } | null;

export default function DerivativesBoard() {
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const [rows, setRows] = useState<MarketRow[]>([]);
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
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Nie udalo sie odczytac rynkow.');
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
            Perpetualy na vAMM. Kazdy moze wystawic feed z kaucja i zarabiac na oplatach z handlu.
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
            Odswiez
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={!DEPLOYED}
            className="rounded-full bg-sp-brand text-white hover:bg-sp-brand-deep"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Nowy rynek
          </Button>
        </div>
      </header>

      {!DEPLOYED && (
        <Card className="mb-6 rounded-[18px] border-amber-500/30 bg-amber-500/[0.06]">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span className="text-sp-ink-soft">
              Modul nie jest jeszcze wdrozony na tej sieci. Uruchom{' '}
              <code className="rounded bg-sp-shade/[0.06] px-1 py-0.5 text-xs">scripts/deploy-derivative-market.ts</code> i
              wpisz adresy do <code className="rounded bg-sp-shade/[0.06] px-1 py-0.5 text-xs">NEXT_PUBLIC_DERIV_FACTORY</code>{' '}
              oraz <code className="rounded bg-sp-shade/[0.06] px-1 py-0.5 text-xs">NEXT_PUBLIC_DERIV_ORACLE</code>.
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
              <p className="font-semibold text-destructive">Nowe pozycje wstrzymane na calym module</p>
              <p className="mt-1 text-sp-ink-soft">
                Fundusz ubezpieczeniowy ma {fmtUsdc(health.balance)} przy wymaganych {fmtUsdc(health.required)} dla
                biezacego OI. Zamykanie pozycji i likwidacje dzialaja normalnie.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {health && !health.paused && (
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sp-shade/10 bg-sp-surface py-1.5 pl-1.5 pr-3.5 text-xs shadow-chip">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sp-brand-soft text-sp-brand-deep">
            <ShieldCheck className="h-3.5 w-3.5" />
          </span>
          <span className="text-sp-ink-soft">Fundusz ubezpieczeniowy</span>
          <span className="font-bold tabular-nums text-sp-ink">{fmtUsdc(health.balance)}</span>
          <span className="text-sp-ink-soft">/ {fmtUsdc(health.required)} wymagane</span>
        </div>
      )}

      {error && (
        <Card className="mb-6 rounded-[18px] border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && rows.length === 0 && (
        <p className="py-12 text-center text-sm text-sp-ink-soft">Wczytuje rynki...</p>
      )}

      {!loading && DEPLOYED && rows.length === 0 && !error && (
        <Card className="rounded-[22px] border-dashed border-sp-shade/20 bg-sp-surface">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sp-brand-soft text-sp-brand-deep">
              <LineChart className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold text-sp-ink">Zadnego rynku jeszcze nie ma</p>
              <p className="mt-1 text-sm text-sp-ink-soft">Zglos feed cenowy i zalozony rynek jest gotowy do handlu.</p>
            </div>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="mt-1 rounded-full bg-sp-brand text-white hover:bg-sp-brand-deep"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Zaloz pierwszy rynek
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {rows.map((row) => {
          const pct = oiPercent(row.openInterest, row.maxOpenInterest);
          return (
            <Link key={row.address} href={`/derivatives/${row.address}`} className="block">
              <Card className="sph-card rounded-[18px] border-sp-shade/10 bg-sp-surface shadow-none">
                <CardContent className="grid grid-cols-2 gap-4 py-4 md:grid-cols-6 md:items-center">
                  <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sp-ink">{row.symbol}</span>
                      {row.slashed ? (
                        <Badge variant="destructive" className="rounded-full">sciety</Badge>
                      ) : row.frozen ? (
                        <Badge variant="destructive" className="rounded-full">zamrozony</Badge>
                      ) : row.mature ? (
                        <Badge className="gap-1 rounded-full border-transparent bg-sp-brand-soft text-sp-brand-deep hover:bg-sp-brand-soft">
                          <ShieldCheck className="h-3 w-3" />
                          dojrzaly
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 rounded-full border-sp-shade/15 text-sp-ink-soft">
                          <Sprout className="h-3 w-3" />
                          probacja
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-sp-ink-soft">
                      {fmtAge(row.createdAt)} - {row.updateCount} cen
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-sp-ink-soft">Mark</p>
                    <p className="font-semibold tabular-nums text-sp-ink">{fmtPrice(row.markPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-sp-ink-soft">Index</p>
                    <p className="font-semibold tabular-nums text-sp-ink">{fmtPrice(row.indexPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-sp-ink-soft">Kaucja</p>
                    <p className="font-semibold tabular-nums text-sp-ink">{fmtUsdc(row.bond)}</p>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <p className="text-xs text-sp-ink-soft">
                      OI {fmtWadCompact(row.openInterest)} / {fmtWadCompact(row.maxOpenInterest)}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
                      <div
                        className={`h-full rounded-full ${pct > 85 ? 'bg-destructive' : 'bg-sp-brand'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-sp-ink-soft">
                      tworca {shortAddress(row.creator)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

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
