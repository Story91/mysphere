'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Plus, RefreshCw, ShieldCheck, Sprout } from 'lucide-react';
import type { Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Arc Derivatives</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Perpetualy na vAMM. Kazdy moze wystawic feed z kaucja i zarabiac na oplatach z handlu.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Odswiez
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!DEPLOYED}>
            <Plus className="mr-2 h-4 w-4" />
            Nowy rynek
          </Button>
        </div>
      </header>

      {!DEPLOYED && (
        <Card className="mb-6 border-amber-500/40">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              Modul nie jest jeszcze wdrozony na tej sieci. Uruchom{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">scripts/deploy-derivative-market.ts</code> i wpisz
              adresy do <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_DERIV_FACTORY</code> oraz{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_DERIV_ORACLE</code>.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Pauza globalna dotyczy WSZYSTKICH rynkow naraz - musi byc widoczna
          na tablicy, a nie dopiero przy nieudanej transakcji. */}
      {health?.paused && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Nowe pozycje wstrzymane na calym module</p>
              <p className="mt-1 text-muted-foreground">
                Fundusz ubezpieczeniowy ma {fmtUsdc(health.balance)} przy wymaganych {fmtUsdc(health.required)} dla
                biezacego OI. Zamykanie pozycji i likwidacje dzialaja normalnie.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {health && !health.paused && (
        <p className="mb-4 text-xs text-muted-foreground">
          Fundusz ubezpieczeniowy: {fmtUsdc(health.balance)} / wymagane {fmtUsdc(health.required)}
        </p>
      )}

      {error && (
        <Card className="mb-6 border-destructive/50">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading && rows.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Wczytuje rynki...</p>}

      {!loading && DEPLOYED && rows.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nie ma jeszcze zadnego rynku. Zaloz pierwszy.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {rows.map((row) => {
          const pct = oiPercent(row.openInterest, row.maxOpenInterest);
          return (
            <Link key={row.address} href={`/derivatives/${row.address}`} className="block">
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="grid grid-cols-2 gap-4 py-4 md:grid-cols-6 md:items-center">
                  <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{row.symbol}</span>
                      {row.slashed ? (
                        <Badge variant="destructive">sciety</Badge>
                      ) : row.frozen ? (
                        <Badge variant="destructive">zamrozony</Badge>
                      ) : row.mature ? (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          dojrzaly
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Sprout className="h-3 w-3" />
                          probacja
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtAge(row.createdAt)} - {row.updateCount} cen
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Mark</p>
                    <p className="font-medium">{fmtPrice(row.markPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Index</p>
                    <p className="font-medium">{fmtPrice(row.indexPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Kaucja</p>
                    <p className="font-medium">{fmtUsdc(row.bond)}</p>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <p className="text-xs text-muted-foreground">
                      OI {fmtWadCompact(row.openInterest)} / {fmtWadCompact(row.maxOpenInterest)}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${pct > 85 ? 'bg-destructive' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
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
