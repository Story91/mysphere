'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEther, maxUint256, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DERIV_CHAIN,
  FACTORY_ADDRESS,
  ORACLE_ADDRESS,
  USDC_ADDRESS,
  erc20Abi,
  factoryAbi,
  feesAbi,
  marketAbi,
  oracleAbi,
} from './config';
import { fmtAge, fmtBps, fmtUsdc, fmtWadCompact, usdc, wad } from './format';
import { INDEX_FEEDS, ZERO_FEED, adapterAbi, feedByAddress, pythAbi } from './indexFeeds';

/**
 * ZALOZENIE RYNKU - trzy transakcje, w tej kolejnosci i nie inaczej.
 *
 *   1. approve USDC dla rejestru (kaucja schodzi z portfela tworcy),
 *   2. registerMarket - feed + kaucja + cena startowa,
 *   3. createMarket   - vAMM na tym feedzie.
 *
 * Cena vAMM NIE jest tu parametrem: fabryka bierze biezaca cene feedu. Gdyby
 * dalo sie ja podac osobno, tworca ustawilby mark daleko od indeksu i zbieral
 * funding od pierwszej minuty.
 *
 * ===========================================================================
 * DLACZEGO PROGI SA CZYTANE, A NIE WPISANE
 * ===========================================================================
 * Do 10 wrzesnia 2026 to okno mowilo "Minimum is 100 USDC", "Minimum 1,000 USD"
 * i "7 days and 50 accepted prices", a limit OI liczylo mnoznikami 2 i 8
 * wklepanymi w kod. Wszystkie te liczby sa publicznymi stalymi kontraktow -
 * przy najblizszej zmianie parametrow okno klamaloby tworcy w twarz akurat w
 * chwili, w ktorej wyklada wlasne pieniadze. Wiec czytamy je z lancucha.
 *
 * Mnozniki OI i progi dojrzalosci mieszkaja na KONTRAKCIE RYNKU, wiec da sie
 * je przeczytac tylko wtedy, gdy jakis rynek juz stoi. Pierwszy tworca w
 * module ich nie zobaczy - i lepsze to niz pokazanie mu liczby, ktorej nikt
 * nie potwierdzil.
 *
 * ===========================================================================
 * PRZYCHOD TWORCY I LIMIT JEGO ZGLOSZEN (10 wrzesnia 2026)
 * ===========================================================================
 * Ostatnia pastylka listy mowila "trading fees accrue to you" - bez stawki,
 * bez udzialu i bez slowa o tym, ze pieniadze sa zablokowane. Czlowiek, ktory
 * wyklada kaucje, ma prawo znac procent PRZED podpisem, a nie po pierwszym
 * `claim()`. Podzial czytamy z dystrybutora (adres bierzemy z fabryki, wiec sa
 * dwie rundy), a udzial skarbca LICZYMY jako reszte do 10000 bps.
 *
 * MAX_DEVIATION_BPS jest tu z innego powodu: to nie jest oplata, tylko granica
 * tego, co tworca w ogole bedzie mogl opublikowac.
 */

type Limits = {
  minBond: bigint | null;
  challengeBond: bigint | null;
  minLiquidity: bigint | null;
  maxDeviationBps: number | null;
  oiMultProbation: number | null;
  oiMultMature: number | null;
  probationAge: number | null;
  probationUpdates: number | null;
  creatorOiCapBps: number | null;
  tradeFeeBps: number | null;
  creatorShareBps: number | null;
  insuranceShareBps: number | null;
  lockDays: number | null;
};

const EMPTY: Limits = {
  minBond: null,
  challengeBond: null,
  minLiquidity: null,
  maxDeviationBps: null,
  oiMultProbation: null,
  oiMultMature: null,
  probationAge: null,
  probationUpdates: null,
  creatorOiCapBps: null,
  tradeFeeBps: null,
  creatorShareBps: null,
  insuranceShareBps: null,
  lockDays: null,
};

/** USDC (6) -> WAD (18). Tak samo jak `DerivMath.usdcToWad` w kontrakcie. */
const usdcToWad = (amount: bigint) => amount * 10n ** 12n;

const ok = (r: unknown): unknown => {
  const x = r as { status?: string; result?: unknown } | undefined;
  return x && x.status === 'success' ? x.result : null;
};

export default function CreateMarketModal({
  open,
  onOpenChange,
  onCreated,
  referenceMarket,
  initialFeed,
  initialSymbol,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  /** Dowolny zywy rynek - stad czytamy mnozniki OI i progi dojrzalosci. */
  referenceMarket?: Address;
  /** Podpowiedz z zewnatrz (np. z kreatora tokenu na Startpadzie): adres adaptera indeksu. */
  initialFeed?: Address | null;
  initialSymbol?: string | null;
}) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const { data: wallet } = useWalletClient();

  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState('');
  const [bond, setBond] = useState('1000');
  const [liquidity, setLiquidity] = useState('100000');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState<Limits>(EMPTY);
  /* ---- ZRODLO INDEKSU. Zero = wlasny feed w rejestrze (tworca publikuje
     ceny). Adres = PythAggregatorAdapter; rynek czyta go jako indeks, a
     rejestr zostaje TYLKO zapasem na czas, gdy Pyth oddaje 0. Pole w rynku
     jest immutable - to jedyny moment na te decyzje. ---- */
  const [feed, setFeed] = useState<Address>(ZERO_FEED);
  const [feedState, setFeedState] = useState<{ price: bigint; ageSec: number; publishTime: number } | 'missing' | null>(null);

  // Podpowiedzi z zewnatrz wchodza PRZY OTWARCIU i tylko do pustych pol.
  useEffect(() => {
    if (!open) return;
    if (initialFeed && feedByAddress(initialFeed)) setFeed(initialFeed);
    if (initialSymbol) setSymbol((current) => (current.trim() === '' ? initialSymbol : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Wiek i cena wybranego feedu - prosto z Pytha, zeby powiedziec "15 dni",
  // a nie tylko "0". Cena startowa podpowiada sie ze swiezego feedu.
  useEffect(() => {
    const f = feedByAddress(feed);
    if (!client || !f) {
      setFeedState(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [raw, round] = await Promise.all([
          client.readContract({ address: f.pyth, abi: pythAbi, functionName: 'getPriceUnsafe', args: [f.priceId] }),
          client.readContract({ address: f.address, abi: adapterAbi, functionName: 'latestRoundData' }),
        ]);
        if (cancelled) return;
        const publishTime = Number(raw.publishTime);
        const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - publishTime);
        // Cena w 18 miejscach z surowej odpowiedzi Pytha (adapter oddaje 0 po maxAge).
        const shift = 18 + Number(raw.expo);
        const price18 = shift >= 0 ? BigInt(raw.price) * 10n ** BigInt(shift) : BigInt(raw.price) / 10n ** BigInt(-shift);
        setFeedState({ price: price18, ageSec, publishTime });
        if (round[1] > 0n) setPrice((current) => (current.trim() === '' ? formatEther(round[1]) : current));
      } catch {
        if (!cancelled) setFeedState('missing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, feed]);
  const selectedFeed = feedByAddress(feed);
  const feedStale =
    feedState !== null && feedState !== 'missing' && selectedFeed != null && feedState.ageSec > selectedFeed.maxAge;

  const loadLimits = useCallback(async () => {
    if (!client) return;
    try {
      // Runda 1. Grupa rynku idzie NA KONIEC, zeby jej brak nie przesuwal
      // indeksow wszystkiego, co przed nia - to jedyny powod tej kolejnosci.
      const res = await client.multicall({
        contracts: [
          { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'MIN_BOND_AMOUNT' },
          { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'CHALLENGE_BOND' },
          { address: ORACLE_ADDRESS, abi: oracleAbi, functionName: 'MAX_DEVIATION_BPS' },
          { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'MIN_VIRTUAL_LIQUIDITY' },
          { address: FACTORY_ADDRESS, abi: factoryAbi, functionName: 'FEES' },
          ...(referenceMarket
            ? [
                { address: referenceMarket, abi: marketAbi, functionName: 'OI_MULTIPLIER_PROBATION' },
                { address: referenceMarket, abi: marketAbi, functionName: 'OI_MULTIPLIER_MATURE' },
                { address: referenceMarket, abi: marketAbi, functionName: 'PROBATION_AGE' },
                { address: referenceMarket, abi: marketAbi, functionName: 'PROBATION_UPDATES' },
                { address: referenceMarket, abi: marketAbi, functionName: 'CREATOR_OI_CAP_BPS' },
                { address: referenceMarket, abi: marketAbi, functionName: 'TRADE_FEE_BPS' },
              ]
            : []),
        ] as never,
        allowFailure: true,
      });
      const n = (v: unknown) => (v == null ? null : Number(v as bigint | number));

      // Runda 2. Adres dystrybutora znamy dopiero z rundy pierwszej.
      const fees = ok(res[4]) as Address | null;
      const split = fees
        ? await client.multicall({
            contracts: [
              { address: fees, abi: feesAbi, functionName: 'CREATOR_SHARE_BPS' },
              { address: fees, abi: feesAbi, functionName: 'INSURANCE_SHARE_BPS' },
              { address: fees, abi: feesAbi, functionName: 'LOCK_DAYS' },
            ] as never,
            allowFailure: true,
          })
        : [];

      setLimits({
        minBond: (ok(res[0]) as bigint | null) ?? null,
        challengeBond: (ok(res[1]) as bigint | null) ?? null,
        maxDeviationBps: n(ok(res[2])),
        minLiquidity: (ok(res[3]) as bigint | null) ?? null,
        oiMultProbation: n(ok(res[5])),
        oiMultMature: n(ok(res[6])),
        probationAge: n(ok(res[7])),
        probationUpdates: n(ok(res[8])),
        creatorOiCapBps: n(ok(res[9])),
        tradeFeeBps: n(ok(res[10])),
        creatorShareBps: n(ok(split[0])),
        insuranceShareBps: n(ok(split[1])),
        lockDays: n(ok(split[2])),
      });
    } catch {
      setLimits(EMPTY);
    }
  }, [client, referenceMarket]);

  useEffect(() => {
    if (open) void loadLimits();
  }, [open, loadLimits]);

  const bondAmount = usdc(bond);
  const startPrice = wad(price);
  const vliq = wad(liquidity);
  const wrongChain = chainId !== DERIV_CHAIN.id;

  // Prog odrzucamy tylko wtedy, gdy go ZNAMY. Nieudany odczyt nie ma prawa
  // zablokowac formularza - kontrakt i tak zrewertuje, jesli kwota jest za mala.
  const bondTooSmall = bondAmount != null && limits.minBond != null && bondAmount < limits.minBond;
  const liqTooSmall = vliq != null && limits.minLiquidity != null && vliq < limits.minLiquidity;
  const ready = Boolean(
    symbol.trim() && startPrice && bondAmount && vliq && address && !wrongChain && !bondTooSmall && !liqTooSmall,
  );

  // maxOI = kaucja * mnoznik, dokladnie jak `DerivativeMarket.maxOpenInterest`.
  const probationCap =
    bondAmount != null && limits.oiMultProbation != null
      ? usdcToWad(bondAmount) * BigInt(limits.oiMultProbation)
      : null;
  const matureCap =
    bondAmount != null && limits.oiMultMature != null ? usdcToWad(bondAmount) * BigInt(limits.oiMultMature) : null;
  const probationDays = limits.probationAge != null ? Math.round(limits.probationAge / 86_400) : null;
  // Skarbiec dostaje RESZTE oplaty. Wpisane recznie "20%" zestarzaloby sie po
  // cichu przy pierwszej zmianie ktoregokolwiek z dwoch pozostalych udzialow.
  const treasuryShareBps =
    limits.creatorShareBps != null && limits.insuranceShareBps != null
      ? 10_000 - limits.creatorShareBps - limits.insuranceShareBps
      : null;

  async function submit() {
    if (!wallet || !client || !ready || !bondAmount || !startPrice || !vliq) return;
    setError(null);
    try {
      setBusy('Checking USDC allowance...');
      const allowance = (await client.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address!, ORACLE_ADDRESS],
      })) as bigint;

      if (allowance < bondAmount) {
        setBusy('Approve USDC for the registry...');
        const hash = await wallet.writeContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [ORACLE_ADDRESS, maxUint256],
          chain: DERIV_CHAIN,
          account: address!,
        });
        await client.waitForTransactionReceipt({ hash });
      }

      setBusy('Registering feed and posting bond...');
      const registerHash = await wallet.writeContract({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: 'registerMarket',
        args: [symbol.trim(), startPrice, bondAmount],
        chain: DERIV_CHAIN,
        account: address!,
      });
      await client.waitForTransactionReceipt({ hash: registerHash });

      // Id feedu to licznik PO rejestracji - rejestr numeruje od jedynki.
      const marketId = (await client.readContract({
        address: ORACLE_ADDRESS,
        abi: oracleAbi,
        functionName: 'marketCount',
      })) as bigint;

      setBusy('Deploying the vAMM...');
      const createHash = await wallet.writeContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: 'createMarket',
        args: [marketId, vliq, feed],
        chain: DERIV_CHAIN,
        account: address!,
      });
      await client.waitForTransactionReceipt({ hash: createHash });

      setBusy(null);
      onCreated();
    } catch (e: any) {
      setBusy(null);
      setError(e?.shortMessage || e?.message || 'Transaction rejected.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New market</DialogTitle>
          <DialogDescription>
            You&apos;re listing a price feed and launching a vAMM on it. The bond stays in the registry and sets the
            market&apos;s open-interest cap.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="deriv-symbol">Symbol</Label>
            <Input
              id="deriv-symbol"
              placeholder="ARC-USD"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              maxLength={24}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deriv-feed">Index price source</Label>
            <select
              id="deriv-feed"
              value={feed}
              onChange={(e) => setFeed(e.target.value as Address)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={ZERO_FEED}>Your own feed in the registry (you publish prices)</option>
              {INDEX_FEEDS.map((f) => (
                <option key={f.address} value={f.address}>
                  {f.symbol} via Pyth
                </option>
              ))}
            </select>
            {selectedFeed == null ? (
              <p className="text-xs text-muted-foreground">
                Traders are funded against the price you submit. The bond is what keeps you honest.
              </p>
            ) : feedState === null ? (
              <p className="text-xs text-muted-foreground">Reading {selectedFeed.symbol} from Pyth on Arc...</p>
            ) : feedState === 'missing' ? (
              <p className="text-xs text-destructive">Pyth on Arc has no {selectedFeed.symbol} feed on chain. Pick another source.</p>
            ) : feedStale ? (
              <p className="text-xs text-destructive">
                {selectedFeed.symbol} on Arc was last updated {fmtAge(feedState.publishTime)} ago at {fmtWadCompact(feedState.price)}.
                Older than {Math.round(selectedFeed.maxAge / 3600)}h, so the adapter returns 0 and this market would run on YOUR
                registry price until Pyth refreshes. Pyth&apos;s Arc contract currently rejects new Hermes signatures, so
                our keeper refreshes it only for feeds it is entitled to. Label it that way or wait.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {selectedFeed.symbol} via Pyth: {fmtWadCompact(feedState.price)}, updated {fmtAge(feedState.publishTime)} ago.
                Funding follows this price; your registry feed is only the fallback when Pyth goes stale.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deriv-price">Starting price (USD)</Label>
            <Input
              id="deriv-price"
              inputMode="decimal"
              placeholder="100"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            {price && !startPrice ? (
              <p className="text-xs text-destructive">That&apos;s not a valid decimal number.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The vAMM opens at exactly this price. You cannot set the mark apart from the index at launch.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deriv-bond">Bond (USDC)</Label>
            <Input
              id="deriv-bond"
              inputMode="decimal"
              placeholder="1000"
              value={bond}
              onChange={(e) => setBond(e.target.value)}
            />
            {bondAmount == null ? (
              <p className="text-xs text-destructive">Enter an amount in USDC, up to six decimals.</p>
            ) : bondTooSmall ? (
              <p className="text-xs text-destructive">
                The registry requires at least {fmtUsdc(limits.minBond as bigint)}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {probationCap != null && matureCap != null ? (
                  <>
                    Open-interest cap: {fmtWadCompact(probationCap)} on probation, {fmtWadCompact(matureCap)} once
                    mature
                    {probationDays != null && limits.probationUpdates != null
                      ? ` (${probationDays} days and ${limits.probationUpdates} accepted prices, with no challenge)`
                      : ''}
                    .
                  </>
                ) : (
                  <>
                    The cap is your bond times a maturity multiplier held in the market contract. No market is live
                    yet to read those multipliers from, so this page will not guess them.
                  </>
                )}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="deriv-liq">vAMM depth (USD)</Label>
            <Input
              id="deriv-liq"
              inputMode="decimal"
              placeholder="100000"
              value={liquidity}
              onChange={(e) => setLiquidity(e.target.value)}
            />
            {vliq == null ? (
              <p className="text-xs text-destructive">Enter an amount in USD.</p>
            ) : liqTooSmall ? (
              <p className="text-xs text-destructive">
                The factory requires at least {fmtWadCompact(limits.minLiquidity as bigint)}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This is the constant-product depth, not money you deposit. Bigger means less slippage per trade.
                {limits.minLiquidity != null ? ` Minimum ${fmtWadCompact(limits.minLiquidity)}.` : ''}
              </p>
            )}
          </div>

          {/* Kaucja nie jest oplata rejestracyjna, tylko zakladem. Tworca ma to
              przeczytac ZANIM podpisze, a nie dowiedziec sie przy scieciu. */}
          <div className="rounded-[12px] border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs leading-[1.55] text-muted-foreground">
            <p className="font-semibold text-foreground">What you are committing to</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>
                You become this market&apos;s price publisher. The index every trader is funded against is whatever you
                submit, so the feed has to keep being updated or the market stops accepting new positions.
              </li>
              <li>
                Your bond is at risk, not on deposit. Anyone can post{' '}
                {limits.challengeBond != null ? fmtUsdc(limits.challengeBond) : 'a challenge bond'} to dispute a price
                you published; that freezes your updates, and an upheld challenge slashes your bond - half of it to
                the challenger - and ends the feed permanently.
              </li>
              <li>
                One challenge, ever, sends the market back to the probation cap.
                {limits.creatorOiCapBps != null
                  ? ` You may trade your own market, but only up to ${(limits.creatorOiCapBps / 100).toFixed(2)}% of its open-interest cap.`
                  : ''}
              </li>
              {limits.maxDeviationBps != null && (
                <li>
                  The registry bounds what you can publish: no single submission may move the index more than{' '}
                  {fmtBps(limits.maxDeviationBps)} from the last accepted price. A bigger gap has to be walked in
                  steps, each one on the record - you cannot re-price your own market in one transaction, and neither
                  can anyone who takes your keys.
                </li>
              )}
              <li>
                {limits.creatorShareBps != null ? (
                  <>
                    In exchange you take {fmtBps(limits.creatorShareBps)} of every trading fee this market charges
                    {limits.tradeFeeBps != null
                      ? `, and that fee is ${fmtBps(limits.tradeFeeBps)} of notional on entry and again on exit`
                      : ''}
                    .{' '}
                    {limits.lockDays != null
                      ? `It is not paid out as it arrives: each accrual unlocks ${limits.lockDays} days later, and you claim it yourself.`
                      : 'It is not paid out as it arrives - each accrual unlocks after a delay, and you claim it yourself.'}
                    {limits.insuranceShareBps != null && treasuryShareBps != null
                      ? ` The rest of the fee splits ${fmtBps(limits.insuranceShareBps)} to the insurance fund and ${fmtBps(treasuryShareBps)} to the treasury.`
                      : ''}
                  </>
                ) : (
                  <>
                    In exchange, a share of every trading fee this market charges accrues to you. The exact split
                    lives in the fee distributor and could not be read here, so this window will not name a
                    percentage nobody confirmed.
                  </>
                )}
              </li>
            </ul>
          </div>

          {wrongChain && <p className="text-xs text-destructive">Switch your wallet to {DERIV_CHAIN.name}.</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={Boolean(busy)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!ready || Boolean(busy)}>
            {busy ?? 'Create market'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
