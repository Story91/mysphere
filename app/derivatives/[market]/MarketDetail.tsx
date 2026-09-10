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
import '../../startpad/sphere/sphere-motion.css';
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
      setError(e?.shortMessage || e?.message || 'Transaction rejected.');
    } finally {
      setBusy(null);
    }
  }

  async function open() {
    const marginAmount = usdc(margin);
    const lev = Number(leverage);
    if (!wallet || !client || !address || !marginAmount || !Number.isInteger(lev)) return;

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
        args: [side === 'long', marginAmount, lev],
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

  async function submitPrice() {
    const price = wad(newPrice);
    if (!wallet || !client || !address || !price || !snap) return;
    await withBusy('Submitting price...', async () => {
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
    return <p className="py-16 text-center text-sm text-sp-ink-soft">Loading market...</p>;
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
    <div className="sphere-shell sph-stagger mx-auto w-full max-w-5xl px-4 py-8">
      <Link href="/derivatives" className="mb-4 inline-flex items-center gap-1.5 text-sm text-sp-ink-soft hover:text-sp-ink">
        <ArrowLeft className="h-4 w-4" />
        All markets
      </Link>

      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-tight text-sp-ink">{snap.symbol}</h1>
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

      {snap.paused && (
        <Card className="mb-6 rounded-[18px] border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">New positions are paused across the module</p>
              <p className="mt-1 text-sp-ink-soft">
                The insurance fund holds {fmtUsdc(snap.insuranceBalance)} against {fmtUsdc(snap.insuranceRequired)}{' '}
                required. Closing positions still works normally.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Price</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-6 text-sm">
              <div>
                <p className="text-xs text-sp-ink-soft">Mark (vAMM)</p>
                <p className="text-lg font-bold tabular-nums text-sp-ink">{fmtPrice(snap.mark)}</p>
              </div>
              <div>
                <p className="text-xs text-sp-ink-soft">Index (feed TWAP)</p>
                <p className="text-lg font-bold tabular-nums text-sp-ink">{fmtPrice(snap.index)}</p>
              </div>
              <div>
                <p className="text-xs text-sp-ink-soft">Premium</p>
                <p
                  className={`text-lg font-bold tabular-nums ${snap.mark - snap.index >= 0n ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {fmtSignedWad(snap.mark - snap.index)}
                </p>
              </div>
            </div>
            <Sparkline points={history} />
          </CardContent>
        </Card>

        <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Open interest cap</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-bold tabular-nums text-sp-ink">
              {fmtWadCompact(snap.oi)} / {fmtWadCompact(snap.cap)}
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
              <div
                className={`h-full rounded-full ${pct > 85 ? 'bg-destructive' : 'bg-sp-brand'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <dl className="mt-4 grid gap-1.5 text-xs text-sp-ink-soft">
              <div className="flex justify-between">
                <dt>Feed bond</dt>
                <dd className="font-medium text-sp-ink">{fmtUsdc(snap.bond)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Status</dt>
                <dd className="font-medium text-sp-ink">{snap.mature ? 'mature (8x)' : 'probation (2x)'}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Prices accepted</dt>
                <dd className="font-medium text-sp-ink">{snap.updateCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Creator cap</dt>
                <dd className="font-medium text-sp-ink">{fmtWadCompact(snap.creatorCap)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Creator</dt>
                <dd className="font-medium text-sp-ink">{shortAddress(snap.creator)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
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
              <Label htmlFor="deriv-margin">Margin (USDC)</Label>
              <Input id="deriv-margin" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="deriv-lev">Leverage (1-{snap.maxLeverage})</Label>
              <Input id="deriv-lev" inputMode="numeric" value={leverage} onChange={(e) => setLeverage(e.target.value)} />
            </div>

            <p className="text-xs text-sp-ink-soft">
              Notional: {fmtWadCompact(notional)} &middot; min. margin {fmtUsdc(snap.minMargin)}
            </p>

            {overCreatorCap && (
              <p className="text-xs text-destructive">
                You created this feed - your cap is {fmtWadCompact(snap.creatorCap)} of notional.
              </p>
            )}
            {overCap && !overCreatorCap && (
              <p className="text-xs text-destructive">This position exceeds the market&apos;s open-interest cap.</p>
            )}
            {wrongChain && <p className="text-xs text-destructive">Switch your wallet to {DERIV_CHAIN.name}.</p>}

            <Button
              onClick={() => void open()}
              disabled={
                Boolean(busy) || !address || wrongChain || snap.paused || snap.slashed || overCreatorCap || overCap
              }
              className={`rounded-full text-white ${side === 'long' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {busy ?? `Open ${side}`}
            </Button>
          </CardContent>
        </Card>

        <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Your position</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {!address && <p className="text-sp-ink-soft">Connect your wallet.</p>}
            {address && !position && <p className="text-sp-ink-soft">No open position.</p>}
            {position && (
              <>
                <dl className="grid gap-1.5">
                  <div className="flex justify-between">
                    <dt className="text-sp-ink-soft">Side</dt>
                    <dd className={position.size > 0n ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                      {position.size > 0n ? 'Long' : 'Short'} {Number(formatEther(position.size < 0n ? -position.size : position.size)).toFixed(4)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sp-ink-soft">Entry price</dt>
                    <dd className="tabular-nums text-sp-ink">{fmtPrice(position.entryPrice)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sp-ink-soft">Notional</dt>
                    <dd className="tabular-nums text-sp-ink">{fmtWadCompact(position.openNotional)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sp-ink-soft">Margin</dt>
                    <dd className="tabular-nums text-sp-ink">{fmtWadCompact(position.margin)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sp-ink-soft">PnL (mark)</dt>
                    <dd className={position.pnl >= 0n ? 'font-semibold tabular-nums text-emerald-600' : 'font-semibold tabular-nums text-red-600'}>
                      {fmtSignedWad(position.pnl)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sp-ink-soft">Funding owed</dt>
                    <dd className="tabular-nums text-sp-ink">{fmtSignedWad(position.funding)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sp-ink-soft">Liquidation price</dt>
                    <dd className="tabular-nums text-sp-ink">{position.liqPrice === 0n ? 'unreachable' : fmtPrice(position.liqPrice)}</dd>
                  </div>
                </dl>
                <Button
                  className="mt-4 w-full rounded-full border-sp-shade/15 text-sp-ink"
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
      </div>

      {/* Panel wystawcy ceny. Widoczny tylko dla tworcy feedu - i to jest cala
          jego wladza nad tym rynkiem: nie ma tu ani pauzy, ani likwidacji. */}
      {isCreator && (
        <Card className="sph-card mt-4 rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Price feed panel</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:max-w-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="deriv-newprice">New price (USD)</Label>
              <Input
                id="deriv-newprice"
                inputMode="decimal"
                placeholder={formatEther(snap.index)}
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
              />
            </div>
            <p className="text-xs text-sp-ink-soft">
              Up to 10% away from the last price, at most once a minute. Anyone can challenge an update within an
              hour - the feed freezes until it&apos;s resolved.
            </p>
            {snap.frozen && <p className="text-xs text-destructive">Feed is frozen by a challenge.</p>}
            <Button
              onClick={() => void submitPrice()}
              disabled={Boolean(busy) || !wad(newPrice) || snap.frozen || snap.slashed || wrongChain}
              className="rounded-full bg-sp-brand text-white hover:bg-sp-brand-deep"
            >
              {busy ?? 'Submit price'}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {/* Geoblokowanie/KYC swiadomie poza kontraktem - to warstwa ToS i frontu. */}
    </div>
  );
}
