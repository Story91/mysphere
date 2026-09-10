'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RefreshCw, ShieldCheck, Sprout } from 'lucide-react';
import { formatEther, maxUint256, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DERIV_CHAIN,
  FACTORY_ADDRESS,
  ORACLE_ADDRESS,
  USDC_ADDRESS,
  erc20Abi,
  factoryAbi,
  insuranceAbi,
  marketAbi,
  oracleAbi,
} from '../config';
import {
  fmtPrice,
  fmtSignedWad,
  fmtUsdc,
  fmtWadCompact,
  oiPercent,
  shortAddress,
  usdc,
  wad,
} from '../format';
import Sparkline from '../Sparkline';

type Snapshot = {
  id: bigint;
  symbol: string;
  creator: Address;
  mark: bigint;
  index: bigint;
  oi: bigint;
  cap: bigint;
  creatorCap: bigint;
  mature: boolean;
  frozen: boolean;
  slashed: boolean;
  bond: bigint;
  updateCount: number;
  maxLeverage: number;
  minMargin: bigint;
  paused: boolean;
  insuranceBalance: bigint;
  insuranceRequired: bigint;
};

type Position = {
  size: bigint;
  margin: bigint;
  openNotional: bigint;
  entryPrice: bigint;
  funding: bigint;
  pnl: bigint;
  liqPrice: bigint;
} | null;

export default function MarketDetail({ market }: { market: Address }) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const { data: wallet } = useWalletClient();

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [position, setPosition] = useState<Position>(null);
  const [history, setHistory] = useState<bigint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [side, setSide] = useState<'long' | 'short'>('long');
  const [margin, setMargin] = useState('100');
  const [leverage, setLeverage] = useState('5');
  const [newPrice, setNewPrice] = useState('');

  const isCreator = Boolean(address && snap && address.toLowerCase() === snap.creator.toLowerCase());
  const wrongChain = chainId !== DERIV_CHAIN.id;

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(null);
    try {
      const id = (await client.readContract({ address: market, abi: marketAbi, functionName: 'ORACLE_MARKET_ID' })) as bigint;

      const [meta, stats] = (await Promise.all([
        client.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'getMarket', args: [id] }),
        client.readContract({ address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'marketStats', args: [id] }),
      ])) as [readonly any[], readonly any[]];

      const [mark, index, oi, cap, creatorCap, mature, maxLev, minMargin] = (await Promise.all([
        client.readContract({ address: market, abi: marketAbi, functionName: 'markPrice' }),
        client.readContract({ address: market, abi: marketAbi, functionName: 'indexPrice' }),
        client.readContract({ address: market, abi: marketAbi, functionName: 'openInterestNotional' }),
        client.readContract({ address: market, abi: marketAbi, functionName: 'maxOpenInterest' }),
        client.readContract({ address: market, abi: marketAbi, functionName: 'creatorOiCap' }),
        client.readContract({ address: market, abi: marketAbi, functionName: 'isMature' }),
        client.readContract({ address: market, abi: marketAbi, functionName: 'MAX_LEVERAGE' }),
        client.readContract({ address: market, abi: marketAbi, functionName: 'MIN_MARGIN_USDC' }),
      ])) as [bigint, bigint, bigint, bigint, bigint, boolean, number, bigint];

      const insurance = (await client.readContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: 'INSURANCE',
      })) as Address;
      const [paused, insBalance, insRequired] = (await Promise.all([
        client.readContract({ address: insurance, abi: insuranceAbi, functionName: 'newPositionsPaused' }),
        client.readContract({ address: insurance, abi: insuranceAbi, functionName: 'balance' }),
        client.readContract({ address: insurance, abi: insuranceAbi, functionName: 'requiredBalance' }),
      ])) as [boolean, bigint, bigint];

      setSnap({
        id,
        symbol: meta[2] as string,
        creator: meta[0] as Address,
        mark,
        index,
        oi,
        cap,
        creatorCap,
        mature,
        frozen: stats[4] as boolean,
        slashed: stats[5] as boolean,
        bond: stats[0] as bigint,
        updateCount: Number(stats[2]),
        maxLeverage: Number(maxLev),
        minMargin,
        paused,
        insuranceBalance: insBalance,
        insuranceRequired: insRequired,
      });

      if (address) {
        const p = (await client.readContract({
          address: market,
          abi: marketAbi,
          functionName: 'getPosition',
          args: [address],
        })) as readonly [bigint, bigint, bigint, bigint, bigint];
        if (p[0] === 0n) {
          setPosition(null);
        } else {
          const [pnl, liqPrice] = (await Promise.all([
            client.readContract({ address: market, abi: marketAbi, functionName: 'unrealizedPnl', args: [address] }),
            client.readContract({ address: market, abi: marketAbi, functionName: 'liquidationPrice', args: [address] }),
          ])) as [bigint, bigint];
          setPosition({
            size: p[0],
            margin: p[1],
            openNotional: p[2],
            entryPrice: p[3],
            funding: p[4],
            pnl,
            liqPrice,
          });
        }
      } else {
        setPosition(null);
      }

      // Historia cen z logow feedu. Okno celowo krotkie - to sparkline,
      // a nie pelny wykres, wiec nie ma powodu przeczesywac calego lancucha.
      try {
        const head = await client.getBlockNumber();
        const from = head > 40_000n ? head - 40_000n : 0n;
        const logs = await client.getContractEvents({
          address: ORACLE_ADDRESS,
          abi: oracleAbi,
          eventName: 'PriceSubmitted',
          args: { marketId: id },
          fromBlock: from,
          toBlock: head,
        });
        const prices = logs.map((l: any) => l.args.price as bigint).filter(Boolean);
        setHistory([meta[3] as bigint, ...prices].slice(-60));
      } catch {
        // Brak okna getLogs na RPC nie ma prawa zabrac calej strony.
        setHistory([]);
      }
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Nie udalo sie odczytac rynku.');
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
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Transakcja odrzucona.');
    } finally {
      setBusy(null);
    }
  }

  async function open() {
    const marginAmount = usdc(margin);
    const lev = Number(leverage);
    if (!wallet || !client || !address || !marginAmount || !Number.isInteger(lev)) return;

    await withBusy('Otwieram pozycje...', async () => {
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
        args: [side === 'long', marginAmount, lev],
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
    });
  }

  async function close() {
    if (!wallet || !client || !address) return;
    await withBusy('Zamykam pozycje...', async () => {
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

  async function submitPrice() {
    const price = wad(newPrice);
    if (!wallet || !client || !address || !price || !snap) return;
    await withBusy('Wysylam cene...', async () => {
      const hash = await wallet.writeContract({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: 'submitPrice',
        args: [snap.id, price, BigInt(Math.floor(Date.now() / 1000))],
        chain: DERIV_CHAIN,
        account: address,
      });
      await client.waitForTransactionReceipt({ hash });
      setNewPrice('');
    });
  }

  if (loading && !snap) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Wczytuje rynek...</p>;
  }

  if (!snap) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-destructive">{error ?? 'Nie znaleziono rynku.'}</p>
        <Link href="/derivatives" className="mt-4 inline-block text-sm underline">
          Wroc do tablicy
        </Link>
      </div>
    );
  }

  const pct = oiPercent(snap.oi, snap.cap);
  const notional = (() => {
    const m = usdc(margin);
    const lev = Number(leverage);
    if (!m || !Number.isInteger(lev)) return 0n;
    return m * 10n ** 12n * BigInt(lev);
  })();
  const overCreatorCap = isCreator && notional > snap.creatorCap;
  const overCap = snap.oi + notional > snap.cap;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link href="/derivatives" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Wszystkie rynki
      </Link>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{snap.symbol}</h1>
          {snap.slashed ? (
            <Badge variant="destructive">sciety</Badge>
          ) : snap.frozen ? (
            <Badge variant="destructive">feed zamrozony</Badge>
          ) : snap.mature ? (
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
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Odswiez
        </Button>
      </header>

      {snap.paused && (
        <Card className="mb-6 border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Nowe pozycje wstrzymane na calym module</p>
              <p className="mt-1 text-muted-foreground">
                Fundusz ma {fmtUsdc(snap.insuranceBalance)} przy wymaganych {fmtUsdc(snap.insuranceRequired)}.
                Zamykanie pozycji dziala normalnie.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cena</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Mark (vAMM)</p>
                <p className="text-lg font-semibold">{fmtPrice(snap.mark)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Index (TWAP feedu)</p>
                <p className="text-lg font-semibold">{fmtPrice(snap.index)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Premia</p>
                <p className="text-lg font-semibold">{fmtSignedWad(snap.mark - snap.index)}</p>
              </div>
            </div>
            <Sparkline points={history} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Limit OI</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">
              {fmtWadCompact(snap.oi)} / {fmtWadCompact(snap.cap)}
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${pct > 85 ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <dl className="mt-4 grid gap-1.5 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <dt>Kaucja feedu</dt>
                <dd className="text-foreground">{fmtUsdc(snap.bond)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Stopien</dt>
                <dd className="text-foreground">{snap.mature ? 'dojrzaly (8x)' : 'probacja (2x)'}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Przyjete ceny</dt>
                <dd className="text-foreground">{snap.updateCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Sufit tworcy</dt>
                <dd className="text-foreground">{fmtWadCompact(snap.creatorCap)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tworca</dt>
                <dd className="text-foreground">{shortAddress(snap.creator)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Otworz pozycje</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant={side === 'long' ? 'default' : 'outline'} onClick={() => setSide('long')}>
                Long
              </Button>
              <Button variant={side === 'short' ? 'default' : 'outline'} onClick={() => setSide('short')}>
                Short
              </Button>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="deriv-margin">Depozyt (USDC)</Label>
              <Input id="deriv-margin" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="deriv-lev">Dzwignia (1-{snap.maxLeverage})</Label>
              <Input id="deriv-lev" inputMode="numeric" value={leverage} onChange={(e) => setLeverage(e.target.value)} />
            </div>

            <p className="text-xs text-muted-foreground">
              Notional: {fmtWadCompact(notional)} - minimalny depozyt {fmtUsdc(snap.minMargin)}
            </p>

            {overCreatorCap && (
              <p className="text-xs text-destructive">
                Jestes tworca tego feedu - twoj sufit to {fmtWadCompact(snap.creatorCap)} notionalu.
              </p>
            )}
            {overCap && !overCreatorCap && (
              <p className="text-xs text-destructive">Ta pozycja przekracza limit OI rynku.</p>
            )}
            {wrongChain && <p className="text-xs text-destructive">Przelacz portfel na {DERIV_CHAIN.name}.</p>}

            <Button
              onClick={() => void open()}
              disabled={
                Boolean(busy) || !address || wrongChain || snap.paused || snap.slashed || overCreatorCap || overCap
              }
            >
              {busy ?? `Otworz ${side}`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Twoja pozycja</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {!address && <p className="text-muted-foreground">Podlacz portfel.</p>}
            {address && !position && <p className="text-muted-foreground">Brak otwartej pozycji.</p>}
            {position && (
              <>
                <dl className="grid gap-1.5">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Kierunek</dt>
                    <dd className={position.size > 0n ? 'text-green-600' : 'text-red-600'}>
                      {position.size > 0n ? 'Long' : 'Short'} {Number(formatEther(position.size < 0n ? -position.size : position.size)).toFixed(4)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Cena wejscia</dt>
                    <dd>{fmtPrice(position.entryPrice)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Notional</dt>
                    <dd>{fmtWadCompact(position.openNotional)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Depozyt</dt>
                    <dd>{fmtWadCompact(position.margin)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Wynik (mark)</dt>
                    <dd className={position.pnl >= 0n ? 'text-green-600' : 'text-red-600'}>
                      {fmtSignedWad(position.pnl)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Funding do zaplaty</dt>
                    <dd>{fmtSignedWad(position.funding)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Cena likwidacji</dt>
                    <dd>{position.liqPrice === 0n ? 'nieosiagalna' : fmtPrice(position.liqPrice)}</dd>
                  </div>
                </dl>
                <Button className="mt-4 w-full" variant="outline" onClick={() => void close()} disabled={Boolean(busy) || wrongChain}>
                  {busy ?? 'Zamknij pozycje'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Panel wystawcy ceny. Widoczny tylko dla tworcy feedu - i to jest cala
          jego wladza nad tym rynkiem: nie ma tu ani pauzy, ani likwidacji. */}
      {isCreator && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Panel wystawcy ceny</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:max-w-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="deriv-newprice">Nowa cena (USD)</Label>
              <Input
                id="deriv-newprice"
                inputMode="decimal"
                placeholder={formatEther(snap.index)}
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Najwyzej 10% od poprzedniej ceny i nie czesciej niz raz na minute. Kazdy moze zakwestionowac
              aktualizacje przez godzine - wtedy feed zamarza do rozstrzygniecia.
            </p>
            {snap.frozen && <p className="text-xs text-destructive">Feed jest zamrozony zgloszeniem.</p>}
            <Button
              onClick={() => void submitPrice()}
              disabled={Boolean(busy) || !wad(newPrice) || snap.frozen || snap.slashed || wrongChain}
            >
              {busy ?? 'Wyslij cene'}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {/* Geoblokowanie/KYC swiadomie poza kontraktem - to warstwa ToS i frontu. */}
    </div>
  );
}
