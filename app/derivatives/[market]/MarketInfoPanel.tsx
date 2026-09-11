'use client';

import { useState } from 'react';
import { Activity, AlertTriangle, Clock, ExternalLink, Gavel, Info, Scale, Zap } from 'lucide-react';
import { formatEther, isAddress } from 'viem';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DERIV_CHAIN } from '../config';
import { fmtAge, fmtBps, fmtDuration, fmtPct, fmtPctPlain, fmtPrice, fmtSignedWad, fmtSize, fmtUsdc, fmtWadCompact, oiPercent, shortAddress, wad } from '../format';
import { Row, Unknown, Val } from '../ui';
import { WAD, type FundingView } from './math';
import type { Snapshot } from './types';
import type { Probe } from './useMarketActions';

/**
 * Zakladka "Market info": wszystko, co dawniej bylo osobnymi kartami na
 * stronie rynku - funding, przechyl, zdrowie rynku i feedu, panel keepera
 * i panel wystawcy ceny. Tresc przeniesiona 1:1; zmienilo sie tylko
 * miejsce, bo trader nie potrzebuje tego przy kazdym zleceniu, a tworca
 * rynku i keeper nadal maja wszystko pod reka.
 */
export default function MarketInfoPanel({
  snap,
  funding,
  now,
  address,
  wrongChain,
  isCreator,
  busy,
  probe,
  setProbe,
  onSettle,
  onCheckTarget,
  onLiquidate,
  onSubmitPrice,
}: {
  snap: Snapshot;
  funding: FundingView | null;
  now: number;
  address: string | undefined;
  wrongChain: boolean;
  isCreator: boolean;
  busy: string | null;
  probe: Probe;
  setProbe: (p: Probe) => void;
  onSettle: () => void;
  onCheckTarget: (target: string) => void;
  onLiquidate: () => void;
  onSubmitPrice: (price: bigint) => void;
}) {
  const [probeTarget, setProbeTarget] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const explorer = DERIV_CHAIN.blockExplorers?.default.url;
  const pct = snap.oi !== null && snap.cap !== null ? oiPercent(snap.oi, snap.cap) : null;
  const feedAge = snap.oracleUpdatedAt !== null && now > 0 ? now - snap.oracleUpdatedAt : null;

  /* Przechyl rynku. `netSize` jest w jednostkach bazowych, OI w dolarach -
     zeby je porownac, przeliczamy net po cenie mark. */
  const netNotional =
    snap.netSize !== null && snap.mark !== null ? ((snap.netSize < 0n ? -snap.netSize : snap.netSize) * snap.mark) / WAD : null;
  const skewShare =
    netNotional !== null && snap.oi !== null && snap.oi > 0n ? Math.min(1, Number((netNotional * 10_000n) / snap.oi) / 10_000) : null;
  const skewLong = snap.netSize !== null && snap.netSize > 0n;

  return (
    <div className="grid gap-4">
    {/* ---------- FUNDING ---------- */}
    <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
          <Clock className="h-4 w-4" />
          Funding
        </CardTitle>
        {funding?.nextAt != null && now > 0 && (
          <span className="text-xs tabular-nums text-sp-ink-soft">
            {funding.due ? 'settlement is due' : `next in ${fmtDuration(funding.nextAt - now)}`}
          </span>
        )}
      </CardHeader>
      <CardContent className="text-sm">
        {funding === null || snap.index === null || snap.maxPremiumBps === null ? (
          <p className="text-sp-ink-soft">Funding inputs could not be read.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-sp-ink-soft">Who pays</p>
                <p className="text-lg font-bold">
                  {funding.clamped === 0n ? (
                    <span className="text-sp-ink">nobody</span>
                  ) : funding.clamped > 0n ? (
                    <span className="text-sp-up">longs pay shorts</span>
                  ) : (
                    <span className="text-sp-down">shorts pay longs</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-sp-ink-soft">Rate if settled now</p>
                <p className="text-lg font-bold tabular-nums text-sp-ink">
                  {funding.perDayPct === null ? <Unknown /> : `${fmtPct(funding.perDayPct)} / day`}
                </p>
              </div>
              <div>
                <p className="text-xs text-sp-ink-soft">Accrued per unit</p>
                <p className="text-lg font-bold tabular-nums text-sp-ink">
                  {funding.perUnitNow === null ? <Unknown /> : fmtSignedWad(funding.perUnitNow)}
                </p>
              </div>
            </div>

            {/* Pasek premii wzgledem sufitu MAX_PREMIUM_BPS. Srodek = zero. */}
            <div className="mt-4">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
                <div className="absolute left-1/2 top-0 h-full w-px bg-sp-shade/25" />
                {(() => {
                  const capNum = Number(formatEther(funding.cap < 0n ? -funding.cap : funding.cap));
                  const rawNum = Number(formatEther(funding.rawPremium));
                  if (!Number.isFinite(capNum) || capNum === 0) return null;
                  const frac = Math.max(-1, Math.min(1, rawNum / capNum));
                  const w = Math.abs(frac) * 50;
                  return (
                    <div
                      className={`absolute top-0 h-full ${funding.clamped >= 0n ? 'bg-sp-up' : 'bg-sp-down'}`}
                      style={frac >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
                    />
                  );
                })()}
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-sp-ink-soft">
                <span>-{fmtBps(snap.maxPremiumBps)} cap</span>
                <span>mark = index</span>
                <span>+{fmtBps(snap.maxPremiumBps)} cap</span>
              </div>
            </div>

            {funding.capped && (
              <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  The real gap is {fmtSignedWad(funding.rawPremium)}, but funding only ever charges the capped{' '}
                  {fmtSignedWad(funding.clamped)} &mdash; {fmtBps(snap.maxPremiumBps)} of index. One wild
                  candle on the vAMM cannot drain the other side.
                </span>
              </p>
            )}

            <dl className="mt-4 grid gap-1 text-xs sm:grid-cols-2 sm:gap-x-8">
              <Row label="Interval">
                {snap.fundingInterval === null ? <Unknown /> : fmtDuration(snap.fundingInterval)}
              </Row>
              <Row label="Last settled">
                {snap.lastFundingAt === null ? <Unknown /> : `${fmtAge(snap.lastFundingAt)} ago`}
              </Row>
              <Row label="Cumulative funding / unit">
                <Val v={snap.cumFunding} fmt={fmtSignedWad} />
              </Row>
              <Row label="Premium cap">
                <Val v={snap.maxPremiumBps} fmt={(x) => fmtBps(x)} />
              </Row>
            </dl>

            <Button
              onClick={onSettle}
              disabled={Boolean(busy) || !address || wrongChain || !funding.due}
              variant="outline"
              className="mt-3 w-full rounded-full border-sp-shade/15 text-sp-ink sm:w-auto"
            >
              <Zap className="mr-2 h-4 w-4" />
              {funding.due ? 'settleFunding()' : 'settleFunding() - not due yet'}
            </Button>
            <p className="mt-1.5 text-[11px] text-sp-ink-soft">
              Permissionless: any address may call it once the interval is up. It pays{' '}
              <strong className="font-semibold">no reward</strong> &mdash; it only moves the funding clock, and
              opening or closing a position settles it for free anyway.
            </p>
          </>
        )}
      </CardContent>
    </Card>

    {/* ---------- PRZECHYL ---------- */}
    <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
          <Scale className="h-4 w-4" />
          Long / short skew
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {snap.netSize === null || snap.oi === null ? (
          <p className="text-sp-ink-soft">Skew could not be read.</p>
        ) : (
          <>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs text-sp-ink-soft">Net position</p>
                <p className={`text-lg font-bold tabular-nums ${skewLong ? 'text-sp-up' : snap.netSize === 0n ? 'text-sp-ink' : 'text-sp-down'}`}>
                  {snap.netSize === 0n ? 'balanced' : `${skewLong ? 'Long' : 'Short'} ${fmtSize(snap.netSize)}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-sp-ink-soft">at mark</p>
                <p className="text-lg font-bold tabular-nums text-sp-ink">
                  {netNotional === null ? <Unknown /> : fmtWadCompact(netNotional)}
                </p>
              </div>
            </div>

            <div className="relative h-4 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
              <div className="absolute left-1/2 top-0 h-full w-px bg-sp-shade/30" />
              {skewShare !== null && snap.netSize !== 0n && (
                <div
                  className={`absolute top-0 h-full ${skewLong ? 'bg-sp-up/80' : 'bg-sp-down/80'}`}
                  style={
                    skewLong
                      ? { left: '50%', width: `${skewShare * 50}%` }
                      : { right: '50%', width: `${skewShare * 50}%` }
                  }
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-sp-ink-soft">
              <span>shorts heavier</span>
              <span>balanced</span>
              <span>longs heavier</span>
            </div>

            <p className="mt-3 text-xs text-sp-ink-soft">
              Net exposure is {skewShare === null ? <Unknown /> : fmtPctPlain(skewShare * 100, 1)} of the{' '}
              <Val v={snap.oi} fmt={fmtWadCompact} /> open interest. A market that leans this way keeps mark
              away from index, which is exactly what the funding rate above is paid for.
            </p>
          </>
        )}
      </CardContent>
    </Card>

    {/* ---------- ZDROWIE RYNKU ---------- */}
    <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
          <Activity className="h-4 w-4" />
          Market health
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <p className="font-bold tabular-nums text-sp-ink">
          <Val v={snap.oi} fmt={fmtWadCompact} /> / <Val v={snap.cap} fmt={fmtWadCompact} /> open interest
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sp-shade/[0.07]">
          {pct !== null && (
            <div
              className={`h-full rounded-full ${pct > 85 ? 'bg-destructive' : 'bg-sp-brand'}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>

        <p className="mt-3 rounded-[12px] bg-sp-sunken px-3 py-2 text-xs text-sp-ink-soft">
          The cap is not a constant: it is the feed&apos;s bond (<Val v={snap.bond} fmt={fmtUsdc} />) times{' '}
          {snap.mature === null ? (
            <Unknown />
          ) : snap.mature ? (
            <>
              <Val v={snap.oiMultMature} fmt={(x) => `${x}x`} /> for a mature feed
            </>
          ) : (
            <>
              <Val v={snap.oiMultProbation} fmt={(x) => `${x}x`} /> while on probation
            </>
          )}
          . A feed graduates after <Val v={snap.probationAge} fmt={(x) => fmtDuration(x)} /> and{' '}
          <Val v={snap.probationUpdates} fmt={String} /> accepted prices with no challenge on record &mdash; so a
          brand-new market can only ever be small.
        </p>

        <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2 sm:gap-x-8">
          <Row label="Prices accepted">
            {snap.updateCount === null || snap.probationUpdates === null ? (
              <Unknown />
            ) : (
              `${snap.updateCount} / ${snap.probationUpdates}`
            )}
          </Row>
          <Row label="Feed age">
            {snap.createdAt === null || snap.probationAge === null ? (
              <Unknown />
            ) : (
              `${fmtAge(snap.createdAt)} of ${fmtDuration(snap.probationAge)}`
            )}
          </Row>
          <Row label="Challenges opened">
            <Val v={snap.challenges} fmt={String} />
          </Row>
          <Row label="Feed accepting trades" hint="PriceOracleRegistry.isActive">
            {snap.feedActive === null ? <Unknown /> : snap.feedActive ? 'yes' : 'no'}
          </Row>
          <Row label="Oracle spot" hint="getPrice - raw last submission">
            <Val v={snap.oraclePrice} fmt={fmtPrice} />
          </Row>
          <Row label="Oracle TWAP" hint="getTwap - what index uses">
            <Val v={snap.twap} fmt={fmtPrice} />
          </Row>
          <Row label="Last feed update">{feedAge === null ? <Unknown /> : `${fmtDuration(feedAge)} ago`}</Row>
          <Row label="Creator cap" hint="CREATOR_OI_CAP_BPS of the cap">
            <Val v={snap.creatorCap} fmt={fmtWadCompact} />
          </Row>
          <Row label="Creator">
            {snap.creator === null ? (
              <Unknown />
            ) : explorer ? (
              <a
                className="inline-flex items-center gap-1 underline decoration-sp-shade/30 underline-offset-2"
                href={`${explorer}/address/${snap.creator}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(snap.creator)}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              shortAddress(snap.creator)
            )}
          </Row>
          <Row label="Registered market" hint="factory isMarket - only these can touch the insurance fund">
            {snap.registered === null ? <Unknown /> : snap.registered ? 'yes' : 'no'}
          </Row>
          <Row label="Insurance fund">
            <Val v={snap.insBalance} fmt={fmtUsdc} /> / <Val v={snap.insRequired} fmt={fmtUsdc} />
          </Row>
          <Row label="Fund floor" hint="minRatioBps of system-wide OI">
            <Val v={snap.insMinRatioBps} fmt={(x) => fmtBps(x)} /> of{' '}
            <Val v={snap.insTotalOi} fmt={fmtWadCompact} />
          </Row>
          {/* Ile z tej sumy to TEN rynek. `totalOi` sam w sobie nie mowi
              o ogladanym rynku nic - dopiero `oiByMarket` robi z niego
              zdanie o tej stronie. */}
          <Row label="of which this market" hint="InsuranceFund.oiByMarket - the exposure the fund books against this market">
            {snap.insOiHere === null ? (
              <Unknown />
            ) : (
              <>
                {fmtWadCompact(snap.insOiHere)}
                {snap.insTotalOi !== null && snap.insTotalOi > 0n && (
                  <span className="font-normal text-sp-ink-soft">
                    {' '}
                    &middot; {fmtPctPlain(Number((snap.insOiHere * 10_000n) / snap.insTotalOi) / 100, 1)} of the
                    module
                  </span>
                )}
              </>
            )}
          </Row>
        </dl>

        {snap.coveredBadDebt !== null && snap.coveredBadDebt > 0n && (
          <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              The insurance fund has already covered {fmtUsdc(snap.coveredBadDebt)} of bad debt on this market.
              That is a position that went underwater faster than it could be liquidated.
            </span>
          </p>
        )}
      </CardContent>
    </Card>

    {/* ---------- KEEPER ---------- */}
    <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-sp-ink-soft">
          <Gavel className="h-4 w-4" />
          Keeper actions
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <p className="text-xs text-sp-ink-soft">
          Both calls below are open to <strong className="font-semibold text-sp-ink">any address</strong>. There
          is no keeper whitelist, no owner and no pause the creator can reach.{' '}
          <code className="rounded bg-sp-sunken px-1">liquidate(trader)</code> pays the caller{' '}
          <Val v={snap.liqFeeBps} fmt={(x) => fmtBps(x)} /> of the exit notional in USDC, straight from the
          closed position; whatever is left goes back to its owner.
        </p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Trader address to check"
            placeholder="0x... trader address"
            value={probeTarget}
            onChange={(e) => {
              setProbeTarget(e.target.value);
              setProbe(null);
            }}
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            onClick={() => onCheckTarget(probeTarget)}
            disabled={!isAddress(probeTarget)}
            className="shrink-0 rounded-full border-sp-shade/15 text-sp-ink"
          >
            Check
          </Button>
        </div>

        {probe === 'empty' && <p className="mt-2 text-xs text-sp-ink-soft">That address has no open position here.</p>}
        {probe !== null && probe !== 'empty' && (
          <div className="mt-3 rounded-[12px] bg-sp-sunken px-3 py-2">
            <dl className="grid gap-1 text-xs">
              <Row label="Side">
                <span className={probe.size > 0n ? 'text-sp-up' : 'text-sp-down'}>
                  {probe.size > 0n ? 'Long' : 'Short'} {fmtSize(probe.size)}
                </span>
              </Row>
              <Row label="Notional">{fmtWadCompact(probe.notional)}</Row>
              <Row label="Margin ratio">
                {probe.ratioBps === null ? (
                  <Unknown />
                ) : (
                  <span
                    className={
                      snap.maintenanceBps !== null && probe.ratioBps < BigInt(snap.maintenanceBps)
                        ? 'text-destructive'
                        : 'text-sp-ink'
                    }
                  >
                    {fmtBps(probe.ratioBps)} vs <Val v={snap.maintenanceBps} fmt={(x) => fmtBps(x)} />{' '}
                    required
                  </span>
                )}
              </Row>
            </dl>
            <Button
              onClick={onLiquidate}
              disabled={
                Boolean(busy) ||
                !address ||
                wrongChain ||
                probe.ratioBps === null ||
                snap.maintenanceBps === null ||
                probe.ratioBps >= BigInt(snap.maintenanceBps)
              }
              variant="outline"
              className="mt-2 w-full rounded-full border-destructive/40 text-destructive hover:bg-destructive/5"
            >
              {probe.ratioBps !== null && snap.maintenanceBps !== null && probe.ratioBps >= BigInt(snap.maintenanceBps)
                ? 'Position is healthy - liquidate() would revert'
                : 'liquidate(trader)'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>


    {/* Panel wystawcy ceny. Widoczny tylko dla tworcy feedu - i to jest cala
        jego wladza nad tym rynkiem: nie ma tu ani pauzy, ani likwidacji. */}
    {isCreator && (
      <Card className="sph-card rounded-[20px] border-sp-shade/10 bg-sp-surface shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide text-sp-ink-soft">Price feed panel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="deriv-newprice">New price (USD)</Label>
            <Input
              id="deriv-newprice"
              inputMode="decimal"
              placeholder={snap.index === null ? '' : formatEther(snap.index)}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
            />
          </div>
          <p className="text-xs text-sp-ink-soft">
            Up to 10% away from the last price, at most once a minute. Anyone can challenge an update within an
            hour - the feed freezes until it&apos;s resolved. You may also trade here, but only up to{' '}
            <Val v={snap.creatorCapBps} fmt={(x) => fmtBps(x)} /> of the cap.
          </p>
          {snap.frozen && <p className="text-xs text-destructive">Feed is frozen by a challenge.</p>}
          <Button
            onClick={() => {
                const p = wad(newPrice);
                if (p) {
                  onSubmitPrice(p);
                  setNewPrice('');
                }
              }}
            disabled={Boolean(busy) || !wad(newPrice) || Boolean(snap.frozen) || Boolean(snap.slashed) || wrongChain}
            className="rounded-full bg-sp-brand text-white hover:bg-sp-brand-deep"
          >
            {busy ?? 'Submit price'}
          </Button>
        </CardContent>
      </Card>
    )}
    </div>
  );
}
