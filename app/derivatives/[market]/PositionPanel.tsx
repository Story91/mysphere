'use client';

import { Button } from '@/components/ui/button';
import { fmtBps, fmtPrice, fmtSignedWad, fmtSize, fmtWadCompact, pctDelta } from '../format';
import { Row, Unknown, UpDown, Val } from '../ui';
import { HEALTH_TOP_BPS, WAD, type FundingView } from './math';
import type { Position, Snapshot } from './types';

/**
 * Otwarta pozycja jako JEDEN wiersz z paskiem zdrowia i przyciskiem Close.
 * `compact` to wersja pod panelem zlecenia (mniej pol), pelna idzie do
 * zakladki Position. Obie czytaja te same liczby z kontraktu.
 */
export default function PositionPanel({
  snap,
  position,
  funding,
  address,
  busy,
  wrongChain,
  onClose,
  compact = false,
}: {
  snap: Snapshot;
  position: Position | null;
  funding: FundingView | null;
  address: string | undefined;
  busy: string | null;
  wrongChain: boolean;
  onClose: () => void;
  compact?: boolean;
}) {
  if (!address) {
    return compact ? null : <Empty>Connect your wallet to see your position on this market.</Empty>;
  }
  if (!position) {
    return compact ? null : <Empty>No open position. Pick a side and a margin on the right to open one.</Empty>;
  }

  const isLong = position.size > 0n;
  const health =
    position.marginRatioBps != null && snap.maintenanceBps !== null
      ? { ratio: Number(position.marginRatioBps), mm: snap.maintenanceBps, liquidatable: Number(position.marginRatioBps) < snap.maintenanceBps }
      : null;
  // PnL w procentach od DEPOZYTU (tak liczy kazda gielda), nie od notionalu.
  const pnlPct = position.pnl !== null && position.margin > 0n ? Number((position.pnl * 10_000n) / position.margin) / 100 : null;
  const liqMove = position.liqPrice !== null && position.liqPrice !== 0n && snap.mark !== null ? pctDelta(position.liqPrice, snap.mark) : null;
  const owedNow = funding?.perUnitNow != null ? (position.size * funding.perUnitNow) / WAD : null;

  return (
    <section
      className={`sph-card rounded-[20px] border p-4 ${
        health?.liquidatable ? 'border-sp-danger/50 bg-sp-danger-soft' : 'border-sp-shade/10 bg-sp-surface'
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft">Your position</p>
          <p className={`text-lg font-extrabold ${isLong ? 'text-sp-up' : 'text-sp-down'}`}>
            {isLong ? 'Long' : 'Short'} <span className="text-sp-ink">{fmtWadCompact(position.openNotional)}</span>
            <span className="ml-1 text-xs font-semibold text-sp-ink-soft">{fmtSize(position.size)} units</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft">Unrealised PnL</p>
          <p className="text-lg font-extrabold tabular-nums">
            <UpDown value={position.pnl}>
              <Val v={position.pnl} fmt={fmtSignedWad} />
            </UpDown>
            {pnlPct !== null && <span className="ml-1 text-xs font-semibold text-sp-ink-soft">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>}
          </p>
        </div>
      </div>

      {/* Pasek zdrowia: 0..20% depozytu do notionalu, znacznik na progu. */}
      {health === null ? (
        <p className="mt-3 text-xs text-sp-ink-soft">Margin ratio could not be read.</p>
      ) : (
        <div className="mt-3">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
            <div
              className={`h-full rounded-full ${health.liquidatable ? 'bg-sp-danger' : health.ratio < health.mm * 2 ? 'bg-amber-500' : 'bg-sp-up'}`}
              style={{ width: `${Math.max(0, Math.min(100, (health.ratio / HEALTH_TOP_BPS) * 100))}%` }}
            />
            <div className="absolute top-0 h-full w-0.5 bg-sp-ink/60" style={{ left: `${(health.mm / HEALTH_TOP_BPS) * 100}%` }} title="maintenance margin" />
          </div>
          <p className="mt-1 text-[11px] text-sp-ink-soft">
            {health.liquidatable ? (
              <span className="font-semibold text-sp-danger">Below maintenance - anyone can liquidate this position right now.</span>
            ) : (
              <>
                Health <strong className="font-semibold text-sp-ink">{fmtBps(health.ratio)}</strong>, liquidation at{' '}
                <strong className="font-semibold text-sp-ink">{fmtBps(health.mm)}</strong>
                {liqMove !== null && (
                  <>
                    {' '}&middot; mark must move <strong className="font-semibold text-sp-ink">{Math.abs(liqMove).toFixed(2)}%</strong>{' '}
                    {isLong ? 'down' : 'up'}
                  </>
                )}
              </>
            )}
          </p>
        </div>
      )}

      <dl className={`mt-3 grid gap-x-6 gap-y-0.5 text-xs ${compact ? '' : 'sm:grid-cols-2'}`}>
        <Row label="Entry">{fmtPrice(position.entryPrice)}</Row>
        <Row label="Mark">
          <Val v={snap.mark} fmt={fmtPrice} />
        </Row>
        <Row label="Liq. price">
          {position.liqPrice === null ? <Unknown /> : position.liqPrice === 0n ? 'unreachable' : fmtPrice(position.liqPrice)}
        </Row>
        <Row label="Margin held">{fmtWadCompact(position.margin)}</Row>
        {!compact && (
          <>
            <Row label="Funding owed" hint="positive means you pay">
              <UpDown value={-position.funding}>{fmtSignedWad(position.funding)}</UpDown>
            </Row>
            {owedNow !== null && (
              <Row label="Next settlement (est.)" hint="size x accrued funding per unit, if settled now">
                <UpDown value={-owedNow}>{fmtSignedWad(owedNow)}</UpDown>
              </Row>
            )}
          </>
        )}
      </dl>

      <Button
        className="mt-3 w-full rounded-full border-sp-shade/15 text-sp-ink"
        variant="outline"
        onClick={onClose}
        disabled={Boolean(busy) || wrongChain}
      >
        {busy ?? 'Close position'}
      </Button>
      {!compact && (
        <p className="mt-1.5 text-[11px] text-sp-ink-soft">
          Closing pays another <Val v={snap.tradeFeeBps} fmt={(x) => fmtBps(x)} /> fee and takes the exit price off the same curve, so the payout
          sits a little below the unrealised number above.
        </p>
      )}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-dashed border-sp-shade/20 bg-sp-surface px-4 py-8 text-center text-sm text-sp-ink-soft">
      {children}
    </div>
  );
}
