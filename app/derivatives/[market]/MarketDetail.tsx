'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import type { Address } from 'viem';
import { useAccount } from 'wagmi';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import '../../startpad/sphere/sphere-motion.css';
import { DERIV_CHAIN } from '../config';
import { fmtUsdc, usdc } from '../format';
import { Val, useNow } from '../ui';
import { useMarketList } from '../useMarketList';
import HistoryPanel from './HistoryPanel';
import MarketHeader from './MarketHeader';
import MarketInfoPanel from './MarketInfoPanel';
import MobileTradeBar from './MobileTradeBar';
import OrderPanel, { type FeeSplit } from './OrderPanel';
import PositionPanel from './PositionPanel';
import PriceChart from './PriceChart';
import { BPS, computeFunding, previewOpen, priceChangePct, type Preview } from './math';
import { useMarketActions } from './useMarketActions';
import { useMarketData } from './useMarketData';

/**
 * Ekran rynku dla TRADERA.
 *
 * Uklad jak na dojrzalych dashboardach perps: wykres i naglowek z lewej,
 * staly panel zlecenia z prawej, pozycja/historia/informacje o rynku w
 * zakladkach pod wykresem. Na telefonie panel zlecenia jest dolnym
 * arkuszem otwieranym z belki Long/Short.
 *
 * Ten plik tylko SKLADA: odczyty (`useMarketData`), zapisy
 * (`useMarketActions`), matematyke (`math.ts`) i komponenty. Stan biletu
 * (strona, depozyt, dzwignia) zyje tutaj, bo potrzebuje go i panel, i
 * wykres (podgladowa linia likwidacji).
 */
export default function MarketDetail({ market }: { market: Address }) {
  const { address, chainId } = useAccount();
  const now = useNow();
  const markets = useMarketList();
  const { snap, position, history, activity, loading, error, reload } = useMarketData(market);
  const actions = useMarketActions({ market, snap, reload });

  const [side, setSide] = useState<'long' | 'short'>('long');
  // Wartosci startowe biletu sa celowo male: na rynku w probacji limit OI to
  // dwukrotnosc kaucji, wiec "100 przy 5x" otwiera strone od komunikatu
  // o przekroczeniu limitu zamiast od dzialajacego podgladu.
  const [margin, setMargin] = useState('50');
  const [leverage, setLeverage] = useState(2);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isCreator = Boolean(address && snap?.creator && address.toLowerCase() === snap.creator.toLowerCase());
  const wrongChain = chainId !== DERIV_CHAIN.id;
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
     dokladnie tak: `amount - creatorCut - insuranceCut`. */
  const feeSplit = useMemo<FeeSplit | null>(() => {
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

  const funding = useMemo(() => (snap ? computeFunding(snap, now) : null), [snap, now]);
  const change = useMemo(() => priceChangePct(history), [history]);
  const changeSince = history.length >= 2 ? history[0].time : null;

  if (loading && !snap) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-4 h-[72px] w-full rounded-[18px]" />
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-4">
            <Skeleton className="h-[380px] rounded-[20px]" />
            <Skeleton className="h-[180px] rounded-[20px]" />
          </div>
          <Skeleton className="h-[520px] rounded-[20px]" />
        </div>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-sp-danger">{error ?? 'Market not found.'}</p>
        <Link href="/derivatives" className="mt-4 inline-block text-sm underline">
          Back to markets
        </Link>
      </div>
    );
  }

  const explorer = DERIV_CHAIN.blockExplorers?.default.url;

  const openNow = () => {
    if (!marginAmount || !preview || preview.reason) return;
    setSheetOpen(false);
    void actions.open(side, marginAmount, leverage);
  };

  const orderPanel = (
    <OrderPanel
      snap={snap}
      position={position}
      preview={preview}
      feeSplit={feeSplit}
      marginAmount={marginAmount}
      side={side}
      setSide={setSide}
      margin={margin}
      setMargin={setMargin}
      leverage={leverage}
      setLeverage={setLeverage}
      address={address}
      wrongChain={wrongChain}
      busy={actions.busy}
      error={actions.error}
      onOpen={openNow}
    />
  );

  return (
    <div className="sphere-shell sph-stagger mx-auto w-full max-w-6xl px-4 pb-16 pt-6 lg:pb-8">
      <Link href="/derivatives" className="mb-3 inline-flex items-center gap-1.5 text-sm text-sp-ink-soft hover:text-sp-ink">
        <ArrowLeft className="h-4 w-4" />
        All markets
      </Link>

      <MarketHeader snap={snap} market={market} markets={markets} funding={funding} change={change} changeSince={changeSince} now={now} />

      {snap.paused && (
        <p className="mt-4 flex items-start gap-3 rounded-[18px] border border-sp-danger/40 bg-sp-danger-soft px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sp-danger" />
          <span>
            <span className="font-semibold text-sp-danger">New positions are paused across the module.</span>{' '}
            <span className="text-sp-ink-soft">
              The insurance fund holds <Val v={snap.insBalance} fmt={fmtUsdc} /> against <Val v={snap.insRequired} fmt={fmtUsdc} /> required.
              Closing positions and liquidations still work.
            </span>
          </span>
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ================= LEWA: WYKRES + ZAKLADKI ================= */}
        <div className="grid min-w-0 gap-4">
          <PriceChart
            points={history}
            mark={snap.mark}
            entry={position?.entryPrice ?? null}
            liq={position?.liqPrice ?? null}
            previewLiq={!position && preview && preview.size !== 0n ? preview.liqPrice : null}
            previewSide={side}
            onRefresh={() => void reload()}
            loading={loading}
          />

          <Tabs defaultValue="position">
            <TabsList className="h-auto w-full justify-start gap-1 rounded-full bg-sp-sunken p-1">
              {[
                ['position', 'Position'],
                ['history', 'History'],
                ['info', 'Market info'],
              ].map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-full px-4 py-1.5 text-xs font-bold text-sp-ink-soft data-[state=active]:bg-sp-surface data-[state=active]:text-sp-ink data-[state=active]:shadow-chip"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="position" className="mt-3">
              <PositionPanel
                snap={snap}
                position={position}
                funding={funding}
                address={address}
                busy={actions.busy}
                wrongChain={wrongChain}
                onClose={() => void actions.close()}
              />
            </TabsContent>
            <TabsContent value="history" className="mt-3">
              <HistoryPanel activity={activity} address={address} explorer={explorer} />
            </TabsContent>
            <TabsContent value="info" className="mt-3">
              <MarketInfoPanel
                snap={snap}
                funding={funding}
                now={now}
                address={address}
                wrongChain={wrongChain}
                isCreator={isCreator}
                busy={actions.busy}
                probe={actions.probe}
                setProbe={actions.setProbe}
                onSettle={() => void actions.settle()}
                onCheckTarget={(t) => void actions.checkTarget(t)}
                onLiquidate={() => void actions.liquidate()}
                onSubmitPrice={(p) => void actions.submitPrice(p)}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* ================= PRAWA: PANEL ZLECENIA (desktop) ================= */}
        <div className="hidden lg:sticky lg:top-4 lg:grid lg:gap-4">
          {orderPanel}
          {position && (
            <PositionPanel
              snap={snap}
              position={position}
              funding={funding}
              address={address}
              busy={actions.busy}
              wrongChain={wrongChain}
              onClose={() => void actions.close()}
              compact
            />
          )}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-sp-danger">{error}</p>}

      <MobileTradeBar
        mark={snap.mark}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onPick={(s) => {
          setSide(s);
          setSheetOpen(true);
        }}
      >
        {orderPanel}
      </MobileTradeBar>

      {/* Geoblokowanie/KYC swiadomie poza kontraktem - to warstwa ToS i frontu. */}
    </div>
  );
}
