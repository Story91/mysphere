'use client';

import { useState } from 'react';
import { useSwitchChain } from 'wagmi';
import ConnectModal from '@/app/components/wallet/ConnectModal';
import { AlertTriangle, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DERIV_CHAIN, GAS_RESERVE_USDC } from '../config';
import { fmtBps, fmtPrice, fmtSize, fmtUsdc, fmtWadCompact, fromUsdc, pctDelta } from '../format';
import { Row, Unknown, Val, fmtUsdcFine } from '../ui';
import type { Preview } from './math';
import type { Position, Snapshot } from './types';
import { spendableMargin } from '../priceSource';

export type FeeSplit = {
  creatorBps: number;
  insuranceBps: number;
  treasuryBps: number;
  creator: bigint;
  insurance: bigint;
  treasury: bigint;
};

const PCT_PRESETS = [25, 50, 75, 100] as const;
const LEV_PRESETS = [1, 2, 5, 10, 20, 50] as const;

/**
 * Panel zlecenia. Jedno pytanie, na ktore odpowiada: ILE RYZYKUJE I GDZIE
 * MNIE WYRZUCI. Stad trzy duze liczby (rozmiar, cena likwidacji, wejscie)
 * przed przyciskiem, a pelna tabelka oplat i marginow w zwinietych Details.
 *
 * Kazda liczba tutaj pochodzi z `previewOpen`, czyli z tej samej arytmetyki,
 * ktora wykona kontrakt - panel nie liczy nic po swojemu.
 */
export default function OrderPanel({
  snap,
  position,
  preview,
  feeSplit,
  marginAmount,
  side,
  setSide,
  margin,
  setMargin,
  leverage,
  setLeverage,
  address,
  wrongChain,
  busy,
  error,
  onOpen,
}: {
  snap: Snapshot;
  position: Position | null;
  preview: Preview | null;
  feeSplit: FeeSplit | null;
  marginAmount: bigint | null;
  side: 'long' | 'short';
  setSide: (s: 'long' | 'short') => void;
  margin: string;
  setMargin: (v: string) => void;
  leverage: number;
  setLeverage: (v: number) => void;
  address: string | undefined;
  wrongChain: boolean;
  busy: string | null;
  error: string | null;
  onOpen: () => void;
}) {
  const [connectOpen, setConnectOpen] = useState(false);
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const balance = snap.usdcBalance;
  const spendable = spendableMargin(balance, GAS_RESERVE_USDC);
  const maxLev = snap.maxLeverage ?? 1;
  const levPresets = Array.from(new Set([...LEV_PRESETS.filter((l) => l < maxLev), maxLev]));
  const isLong = side === 'long';

  // Bursztyn na suwaku, gdy pozycja rodzi sie z buforem ponizej dwoch progow
  // utrzymania - to samo ostrzezenie, co pasek zdrowia otwartej pozycji.
  const tight =
    preview !== null && preview.size !== 0n && snap.maintenanceBps !== null && preview.marginRatioBps < BigInt(snap.maintenanceBps) * 2n;

  const halted = Boolean(snap.paused) || Boolean(snap.slashed) || snap.feedActive === false;
  const haltReason = snap.paused
    ? 'New positions are paused module-wide: the insurance fund is below its floor. Closing still works.'
    : snap.slashed
      ? 'This feed was slashed. The market accepts no new positions.'
      : snap.feedActive === false
        ? 'The price feed is not active right now. The contract will reject new positions.'
        : null;

  const liqDistance =
    preview && preview.liqPrice !== 0n && snap.mark !== null ? pctDelta(preview.liqPrice, snap.mark) : null;
  const impact = preview && preview.entryPrice !== 0n && snap.mark !== null ? pctDelta(preview.entryPrice, snap.mark) : null;

  let cta: string;
  let disabled = true;
  if (busy || switching) cta = busy || 'Switching network...';
  else if (!address) { cta = 'Connect wallet'; disabled = false; }
  else if (wrongChain) { cta = `Switch to ${DERIV_CHAIN.name}`; disabled = false; }
  else if (position) cta = 'Close your position first';
  else if (halted) cta = 'Trading halted';
  else if (spendable === null) cta = 'Balance unavailable';
  else if (marginAmount !== null && marginAmount > spendable) cta = 'Leave USDC for network fees';
  else if (preview === null) cta = marginAmount === null ? 'Enter a margin amount' : 'Reserves unavailable';
  else if (preview.reason) cta = isLong ? 'Open long' : 'Open short';
  else {
    cta = isLong ? 'Open long' : 'Open short';
    disabled = false;
  }

  return (
    <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4">
      {haltReason && (
        <p className="mb-3 flex items-start gap-2 rounded-[12px] bg-sp-danger-soft px-3 py-2 text-xs text-sp-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{haltReason}</span>
        </p>
      )}

      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-1 rounded-full bg-sp-sunken p-1">
        <button
          type="button"
          onClick={() => setSide('long')}
          className={`rounded-full py-2 text-sm font-bold transition-colors ${
            isLong ? 'bg-sp-up text-white shadow-chip' : 'text-sp-ink-soft hover:text-sp-ink'
          }`}
        >
          Long
        </button>
        <button
          type="button"
          onClick={() => setSide('short')}
          className={`rounded-full py-2 text-sm font-bold transition-colors ${
            !isLong ? 'bg-sp-down text-white shadow-chip' : 'text-sp-ink-soft hover:text-sp-ink'
          }`}
        >
          Short
        </button>
      </div>

      {/* Margin */}
      <div className="mt-4 grid gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="deriv-margin" className="text-xs">
            Margin (USDC)
          </Label>
          <span className="inline-flex items-center gap-1 text-[11px] text-sp-ink-soft">
            <Wallet className="h-3 w-3" />
            {balance === null ? address ? <Unknown /> : 'not connected' : fmtUsdc(balance)}
          </span>
        </div>
        <Input
          id="deriv-margin"
          inputMode="decimal"
          value={margin}
          onChange={(e) => setMargin(e.target.value)}
          className="h-11 text-lg font-bold tabular-nums"
        />
        <div className="grid grid-cols-4 gap-1">
          {PCT_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={spendable === null || spendable === 0n}
              onClick={() => spendable !== null && setMargin(fromUsdc((spendable * BigInt(p)) / 100n))}
              className="rounded-full border border-sp-shade/15 py-1 text-[11px] font-semibold text-sp-ink-soft hover:bg-sp-hover hover:text-sp-ink disabled:opacity-40"
            >
              {p === 100 ? 'Max' : `${p}%`}
            </button>
          ))}
        </div>
        {margin.trim() !== '' && marginAmount === null && (
          <p className="text-[11px] text-sp-danger">Enter a plain amount, at most 6 decimals.</p>
        )}
      </div>

      {/* Leverage */}
      <div className="mt-4 grid gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="deriv-lev" className="text-xs">
            Leverage
          </Label>
          <span className={`text-sm font-bold tabular-nums ${tight ? 'text-amber-600' : 'text-sp-ink'}`}>{leverage}x</span>
        </div>
        <input
          id="deriv-lev"
          type="range"
          min={1}
          max={maxLev}
          step={1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-sp-shade/[0.08]"
          style={{ accentColor: tight ? '#d97706' : 'rgb(var(--sp-brand))' }}
        />
        <div className="flex flex-wrap gap-1">
          {levPresets.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLeverage(l)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                leverage === l
                  ? 'border-sp-brand bg-sp-brand-soft text-sp-brand-deep'
                  : 'border-sp-shade/15 text-sp-ink-soft hover:bg-sp-hover hover:text-sp-ink'
              }`}
            >
              {l}x{l === maxLev ? ' max' : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Trzy liczby, na ktore patrzy trader */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[14px] bg-sp-sunken px-3 py-2.5">
        <Big label="Size">{preview === null || preview.size === 0n ? <Unknown /> : fmtWadCompact(preview.notional)}</Big>
        <Big
          label="Liq. price"
          sub={liqDistance === null ? undefined : `${Math.abs(liqDistance).toFixed(2)}% ${isLong ? 'below' : 'above'}`}
          tone={tight ? 'warn' : undefined}
        >
          {preview === null || preview.size === 0n ? <Unknown /> : preview.liqPrice === 0n ? 'none' : fmtPrice(preview.liqPrice)}
        </Big>
        <Big label="Est. entry" sub={impact === null ? undefined : `${Math.abs(impact) >= 1 ? 'impact ' : ''}${impact >= 0 ? '+' : '-'}${Math.abs(impact).toFixed(2)}%`} tone={impact !== null && Math.abs(impact) >= 1 ? 'warn' : undefined}>
          {preview === null || preview.entryPrice === 0n ? <Unknown /> : fmtPrice(preview.entryPrice)}
        </Big>
      </div>

      {position && (
        <p className="mt-3 text-xs text-sp-ink-soft">This market keeps one position per address. Close the open one to trade again.</p>
      )}
      {preview?.reason && !position && (
        <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-sp-danger-soft px-3 py-2 text-xs text-sp-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{preview.reason}</span>
        </p>
      )}

      <Button
        onClick={() => !address ? setConnectOpen(true) : wrongChain ? switchChain({ chainId: DERIV_CHAIN.id }) : onOpen()}
        disabled={disabled}
        className={`mt-3 h-11 w-full rounded-full text-base font-bold text-white ${
          isLong ? 'bg-sp-up hover:bg-sp-up/90' : 'bg-sp-down hover:bg-sp-down-deep'
        }`}
      >
        {cta}
      </Button>
      {error && <p className="mt-2 text-xs text-sp-danger">{error}</p>}
      {switchError && <p className="mt-2 text-xs text-sp-danger">Could not switch networks. Choose {DERIV_CHAIN.name} in your wallet and try again.</p>}
      <ConnectModal isOpen={connectOpen} onClose={() => setConnectOpen(false)} />

      {/* Szczegoly - cala dawna tabelka, zwinieta */}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer select-none font-semibold text-sp-ink-soft hover:text-sp-ink">
          Details{preview && snap.tradeFeeBps !== null ? ` - fee ${fmtBps(snap.tradeFeeBps)} each way` : ''}
        </summary>
        {preview === null ? (
          <p className="mt-2 text-sp-ink-soft">Enter a margin amount to see the full breakdown.</p>
        ) : (
          <dl className="mt-2 grid gap-0.5">
            <Row label="Fee on entry" hint="taken from the deposit on entry, and again on exit">
              -{fmtUsdcFine(preview.feeUsdc)}
            </Row>
            {feeSplit === null ? (
              <div className="border-l border-sp-shade/15 py-0.5 pl-3 text-[11px] text-sp-ink-soft">
                Who receives that fee could not be read from the distributor.
              </div>
            ) : (
              <div className="border-l border-sp-shade/15 pl-3">
                <Row
                  label={`Market creator (${fmtBps(feeSplit.creatorBps)})`}
                  hint={
                    snap.feeLockDays === null
                      ? 'Accrued to the address that publishes this feed.'
                      : `Accrued to the address that publishes this feed; claimable after ${snap.feeLockDays} days.`
                  }
                >
                  {fmtUsdcFine(feeSplit.creator)}
                </Row>
                <Row label={`Insurance fund (${fmtBps(feeSplit.insuranceBps)})`} hint="Transferred to the fund on the spot - it is what covers bad debt.">
                  {fmtUsdcFine(feeSplit.insurance)}
                </Row>
                <Row label={`Treasury (${fmtBps(feeSplit.treasuryBps)})`} hint={snap.treasury === null ? 'Whatever the first two shares leave over.' : `Whatever the first two shares leave over. Treasury: ${snap.treasury}`}>
                  {fmtUsdcFine(feeSplit.treasury)}
                </Row>
              </div>
            )}
            <Row label="Position size (base units)">{preview.size === 0n ? <Unknown /> : fmtSize(preview.size)}</Row>
            <Row label="Notional">{fmtWadCompact(preview.notional)}</Row>
            <Row label="Margin after fee">{fmtWadCompact(preview.marginWad)}</Row>
            <Row label="Margin ratio on entry" hint="checked by the contract right after the swap">
              {preview.size === 0n ? (
                <Unknown />
              ) : (
                <span className={snap.maintenanceBps !== null && preview.marginRatioBps < BigInt(snap.maintenanceBps) ? 'text-sp-danger' : 'text-sp-ink'}>
                  {fmtBps(preview.marginRatioBps)} (floor <Val v={snap.maintenanceBps} fmt={(x) => fmtBps(x)} />)
                </span>
              )}
            </Row>
            <Row label="Max leverage">
              <Val v={snap.maxLeverage} fmt={(x) => `${x}x, whole multiples`} />
            </Row>
          </dl>
        )}
      </details>
    </section>
  );
}

function Big({ label, sub, tone, children }: { label: string; sub?: string; tone?: 'warn'; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft">{label}</p>
      <p className={`truncate text-sm font-extrabold tabular-nums ${tone === 'warn' ? 'text-amber-600' : 'text-sp-ink'}`}>{children}</p>
      {sub ? <p className={`text-[10px] leading-tight ${tone === 'warn' ? 'text-amber-600' : 'text-sp-ink-soft'}`}>{sub}</p> : null}
    </div>
  );
}
