'use client';

import { useRouter } from 'next/navigation';
import { ChevronDown, ShieldCheck, Sprout } from 'lucide-react';
import type { Address } from 'viem';
import { Badge } from '@/components/ui/badge';
import { fmtDuration, fmtPct, fmtPctPlain, fmtPrice, fmtWadCompact, oiPercent } from '../format';
import { Dot, Unknown, UpDown, Val } from '../ui';
import FeedIcon, { instrumentBase } from '../FeedIcon';
import type { MarketListItem } from '../useMarketList';
import type { FundingView } from './math';
import type { Snapshot } from './types';

/**
 * Naglowek rynku dla TRADERA: szesc rzeczy, na ktore patrzy sie przed
 * zleceniem. Bps, kaucje, adres tworcy i reszta protokolu mieszkaja w
 * zakladce Market info - tu by tylko zaslanialy cene.
 */
export default function MarketHeader({
  snap,
  market,
  markets,
  funding,
  change,
  changeSince,
  now,
}: {
  snap: Snapshot;
  market: Address;
  markets: MarketListItem[];
  funding: FundingView | null;
  /** Zmiana indeksu w % od pierwszego punktu historii; `null` = za malo punktow. */
  change: number | null;
  /** Czas (unix s) pierwszego punktu, od ktorego liczona jest zmiana. */
  changeSince: number | null;
  now: number;
}) {
  const router = useRouter();
  const feedAge = snap.oracleUpdatedAt !== null && now > 0 ? now - snap.oracleUpdatedAt : null;
  const pct = snap.oi !== null && snap.cap !== null ? oiPercent(snap.oi, snap.cap) : null;

  // Kropka feedu: zielona = aktywny i swiezszy niz interwal fundingu,
  // bursztynowa = aktywny, ale starzeje sie, czerwona = kontrakt go nie
  // przyjmie (nieaktywny, zamrozony, ukarany).
  const feedTone: 'up' | 'warn' | 'down' | 'muted' =
    snap.slashed || snap.frozen || snap.feedActive === false
      ? 'down'
      : snap.feedActive === null || feedAge === null
        ? 'muted'
        : snap.fundingInterval !== null && feedAge > snap.fundingInterval
          ? 'warn'
          : 'up';
  const feedLabel =
    feedTone === 'down'
      ? snap.slashed
        ? 'Feed slashed - new positions are rejected'
        : snap.frozen
          ? 'Feed frozen by a challenge - new positions are rejected'
          : 'Feed inactive - new positions are rejected'
      : feedTone === 'warn'
        ? 'Feed is older than the funding interval'
        : feedTone === 'up'
          ? 'Feed is fresh'
          : 'Feed state unknown';

  const listed = markets.some((m) => m.address.toLowerCase() === market.toLowerCase());
  const options = listed ? markets : [{ id: 0, address: market, symbol: snap.symbol }, ...markets];

  return (
    <header className="rounded-[18px] border border-sp-shade/10 bg-sp-surface px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3 overflow-x-auto">
        {/* Rynek + stan feedu */}
        <div className="flex min-w-0 items-center gap-2">
          <FeedIcon base={instrumentBase(snap.symbol)} size={40} />
          <label className="relative inline-flex items-center">
            <select
              aria-label="Switch market"
              value={market}
              onChange={(e) => router.push(`/derivatives/${e.target.value}`)}
              className="appearance-none rounded-full border border-sp-shade/15 bg-sp-surface py-1.5 pl-3 pr-8 text-[20px] font-extrabold tracking-tight text-sp-ink hover:bg-sp-hover"
            >
              {options.map((m) => (
                <option key={m.address} value={m.address}>
                  {m.symbol}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-sp-ink-soft" />
          </label>
          {snap.slashed ? (
            <Badge variant="destructive" className="rounded-full">slashed</Badge>
          ) : snap.frozen ? (
            <Badge variant="destructive" className="rounded-full">frozen</Badge>
          ) : snap.mature ? (
            <Badge className="gap-1 rounded-full border-transparent bg-sp-brand-soft text-sp-brand-deep hover:bg-sp-brand-soft" title="The feed graduated from probation - full open-interest cap.">
              <ShieldCheck className="h-3 w-3" />
              mature
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 rounded-full border-sp-shade/15 text-sp-ink-soft" title="New feed on probation - the open-interest cap is small on purpose.">
              <Sprout className="h-3 w-3" />
              probation
            </Badge>
          )}
        </div>

        {/* Mark */}
        <div className="min-w-[120px]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft">Mark</p>
          <p className="text-[22px] font-extrabold leading-none tabular-nums text-sp-ink">
            <Val v={snap.mark} fmt={fmtPrice} />
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums">
            {change === null ? (
              <span className="text-sp-ink-soft">no change data yet</span>
            ) : (
              <>
                <UpDown value={change} className="font-semibold">{fmtPct(change)}</UpDown>
                {changeSince !== null && now > 0 && (
                  <span className="text-sp-ink-soft"> since {fmtDuration(Math.max(0, now - changeSince))} ago</span>
                )}
              </>
            )}
          </p>
        </div>

        <Cell label="Index" hint="feed TWAP">
          <Val v={snap.index} fmt={fmtPrice} />
        </Cell>

        <Cell
          label="Funding / 1h"
          hint={
            funding === null || funding.nextAt === null || now === 0
              ? undefined
              : funding.due
                ? 'settlement due now'
                : `next in ${fmtDuration(funding.nextAt - now)}`
          }
        >
          {funding === null || funding.perHourPct === null ? (
            <Unknown />
          ) : (
            <>
              <UpDown value={funding.clamped}>{fmtPct(funding.perHourPct, 4)}</UpDown>
              <span className="ml-1 text-[10px] font-normal text-sp-ink-soft">
                {funding.clamped === 0n ? 'flat' : funding.clamped > 0n ? 'longs pay' : 'shorts pay'}
              </span>
            </>
          )}
        </Cell>

        <Cell label="Open interest" hint={pct === null ? undefined : `${fmtPctPlain(pct, 0)} of cap`}>
          <Val v={snap.oi} fmt={fmtWadCompact} />
        </Cell>

        <Cell label="Feed" hint={feedAge === null ? undefined : `${fmtDuration(feedAge)} ago`}>
          <span className="inline-flex items-center gap-1.5" title={feedLabel}>
            <Dot tone={feedTone} title={feedLabel} />
            {feedTone === 'down' ? 'halted' : feedTone === 'warn' ? 'aging' : feedTone === 'up' ? 'live' : 'unknown'}
          </span>
        </Cell>
      </div>
    </header>
  );
}

function Cell({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[96px] shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft">{label}</p>
      <div className="text-sm font-bold tabular-nums text-sp-ink">{children}</div>
      {hint ? <p className="text-[10px] leading-tight text-sp-ink-soft">{hint}</p> : null}
    </div>
  );
}
