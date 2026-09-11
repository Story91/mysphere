'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { fmtAge, fmtPrice, fmtSignedWad, fmtUsdc, fmtWadCompact, shortAddress } from '../format';
import { UpDown } from '../ui';
import type { ActivityItem } from './types';

/**
 * Historia zdarzen rynku z realnych logow. Filtr `Mine | All`: trader
 * najpierw chce zobaczyc SWOJE wejscia i wyjscia, dopiero potem rynek.
 * Funding i bad debt nie maja tradera, wiec pokazuja sie tylko w `All`.
 */
export default function HistoryPanel({
  activity,
  address,
  explorer,
}: {
  activity: ActivityItem[];
  address: string | undefined;
  explorer: string | undefined;
}) {
  const [mine, setMine] = useState(Boolean(address));
  // Podlaczenie portfela w trakcie ogladania przelacza na "Mine" - bez
  // portfela ten filtr nie ma sensu, wiec wracamy na "All".
  useEffect(() => setMine(Boolean(address)), [address]);

  const me = address?.toLowerCase();
  const rows = mine ? activity.filter((a) => 'trader' in a && a.trader.toLowerCase() === me) : activity;

  return (
    <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface">
      <div className="flex items-center justify-between border-b border-sp-shade/10 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sp-ink-soft">History</p>
        <div className="flex items-center gap-1 rounded-full bg-sp-sunken p-0.5">
          {(['Mine', 'All'] as const).map((label) => {
            const active = label === 'Mine' ? mine : !mine;
            return (
              <button
                key={label}
                type="button"
                disabled={label === 'Mine' && !address}
                onClick={() => setMine(label === 'Mine')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                  active ? 'bg-sp-surface text-sp-ink shadow-chip' : 'text-sp-ink-soft hover:text-sp-ink'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-sp-ink-soft">
          {mine ? 'No trades from this wallet on this market yet.' : 'No events on this market in the recent log window.'}
        </p>
      ) : (
        <div>
          {rows.map((item, i) => (
            <a
              key={`${item.txHash}-${item.kind}-${i}`}
              href={explorer ? `${explorer}/tx/${item.txHash}` : undefined}
              target="_blank"
              rel="noreferrer"
              className="flex flex-wrap items-center justify-between gap-2 border-b border-sp-shade/10 px-4 py-2 text-sm transition-colors last:border-b-0 hover:bg-sp-hover"
            >
              <div className="flex items-center gap-2">
                {item.kind === 'opened' && (
                  <Badge className={`rounded-full border-transparent hover:bg-transparent ${item.isLong ? 'bg-sp-up-soft text-sp-up' : 'bg-sp-down-soft text-sp-down-deep'}`}>
                    {item.isLong ? 'Opened long' : 'Opened short'}
                  </Badge>
                )}
                {item.kind === 'closed' && (
                  <Badge variant="outline" className="rounded-full border-sp-shade/15 text-sp-ink-soft">
                    Closed
                  </Badge>
                )}
                {item.kind === 'liquidated' && (
                  <Badge variant="destructive" className="rounded-full">
                    Liquidated
                  </Badge>
                )}
                {item.kind === 'funding' && (
                  <Badge variant="outline" className="rounded-full border-sp-brand/30 text-sp-brand-deep">
                    Funding settled
                  </Badge>
                )}
                {item.kind === 'badDebt' && (
                  <Badge variant="destructive" className="rounded-full">
                    Bad debt
                  </Badge>
                )}
                {'trader' in item && (
                  <span className="text-xs text-sp-ink-soft">{me && item.trader.toLowerCase() === me ? 'you' : shortAddress(item.trader)}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                {item.kind === 'opened' && (
                  <span className="tabular-nums text-sp-ink">
                    {fmtWadCompact(item.notional)} @ {fmtPrice(item.entryPrice)}
                  </span>
                )}
                {item.kind === 'closed' && (
                  <UpDown value={item.pnl} className="font-semibold tabular-nums">
                    {fmtSignedWad(item.pnl)}
                  </UpDown>
                )}
                {item.kind === 'liquidated' && <span className="tabular-nums text-sp-ink">{fmtUsdc(item.payoutUsdc)} returned</span>}
                {item.kind === 'funding' && (
                  <span className="tabular-nums text-sp-ink">
                    {fmtSignedWad(item.perUnit)} / unit at {fmtSignedWad(item.premium)} premium
                  </span>
                )}
                {item.kind === 'badDebt' && (
                  <span className="tabular-nums text-sp-danger">
                    {fmtWadCompact(item.shortfallWad)} short, {fmtUsdc(item.coveredUsdc)} covered by the fund
                  </span>
                )}
                <span className="text-sp-ink-soft">{fmtAge(item.at)} ago</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
