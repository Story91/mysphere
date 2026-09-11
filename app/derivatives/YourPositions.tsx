'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { DERIV_CHAIN, marketAbi } from './config';
import { fmtBps, fmtPrice, fmtSignedWad, fmtWadCompact } from './format';
import { Unknown, UpDown } from './ui';

type Entry = {
  market: Address;
  symbol: string;
  size: bigint;
  openNotional: bigint;
  entryPrice: bigint;
  pnl: bigint | null;
  marginRatioBps: bigint | null;
  maintenanceBps: number | null;
};

/**
 * "Twoje pozycje" nad tablica rynkow. Jeden multicall po wszystkich
 * rynkach (getPosition, unrealizedPnl, marginRatioBps, prog utrzymania).
 * Renderuje sie tylko, gdy portfel jest podlaczony I ma cos otwartego -
 * pusty naglowek "Your positions: none" nikomu nic nie mowi.
 */
export default function YourPositions({ address, markets }: { address: Address | undefined; markets: { address: Address; symbol: string }[] }) {
  const client = usePublicClient({ chainId: DERIV_CHAIN.id });
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    if (!client || !address || markets.length === 0) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const PER = 4;
        const res = (await client.multicall({
          contracts: markets.flatMap((m) => [
            { address: m.address, abi: marketAbi, functionName: 'getPosition', args: [address] },
            { address: m.address, abi: marketAbi, functionName: 'unrealizedPnl', args: [address] },
            { address: m.address, abi: marketAbi, functionName: 'marginRatioBps', args: [address] },
            { address: m.address, abi: marketAbi, functionName: 'MAINTENANCE_MARGIN_BPS' },
          ]) as never,
          allowFailure: true,
        })) as readonly { status: 'success' | 'failure'; result?: unknown }[];
        if (cancelled) return;
        const ok = (i: number) => (res[i]?.status === 'success' ? res[i].result : null);
        const found: Entry[] = [];
        markets.forEach((m, i) => {
          const pos = ok(i * PER) as readonly unknown[] | null;
          if (!pos || (pos[0] as bigint) === 0n) return;
          const mm = ok(i * PER + 3);
          found.push({
            market: m.address,
            symbol: m.symbol,
            size: pos[0] as bigint,
            openNotional: pos[2] as bigint,
            entryPrice: pos[3] as bigint,
            pnl: (ok(i * PER + 1) as bigint | null) ?? null,
            marginRatioBps: (ok(i * PER + 2) as bigint | null) ?? null,
            maintenanceBps: mm == null ? null : Number(mm as bigint),
          });
        });
        setEntries(found);
      } catch {
        if (!cancelled) setEntries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, address, markets]);

  if (entries.length === 0) return null;

  return (
    <div className="mb-5 overflow-hidden rounded-[18px] border border-sp-brand/25 bg-sp-surface">
      <p className="border-b border-sp-shade/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-sp-brand-deep">
        Your positions
      </p>
      {entries.map((e) => {
        const isLong = e.size > 0n;
        const liquidatable = e.marginRatioBps !== null && e.maintenanceBps !== null && e.marginRatioBps < BigInt(e.maintenanceBps);
        return (
          <Link
            key={e.market}
            href={`/derivatives/${e.market}`}
            className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-sp-shade/10 px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-sp-hover sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] sm:items-center"
          >
            <div className="col-span-2 sm:col-span-1">
              <span className="font-bold text-sp-ink">{e.symbol}</span>
              <span className={`ml-2 text-xs font-bold ${isLong ? 'text-sp-up' : 'text-sp-down'}`}>{isLong ? 'LONG' : 'SHORT'}</span>
            </div>
            <Cell label="Size">{fmtWadCompact(e.openNotional)}</Cell>
            <Cell label="Entry">{fmtPrice(e.entryPrice)}</Cell>
            <Cell label="Unrealised">
              {e.pnl === null ? (
                <Unknown />
              ) : (
                <UpDown value={e.pnl} className="font-semibold">
                  {fmtSignedWad(e.pnl)}
                </UpDown>
              )}
            </Cell>
            <Cell label="Health">
              {e.marginRatioBps === null ? (
                <Unknown />
              ) : (
                <span className={liquidatable ? 'font-semibold text-sp-danger' : 'text-sp-ink'}>
                  {fmtBps(e.marginRatioBps)}
                  {liquidatable ? ' - liquidatable' : ''}
                </span>
              )}
            </Cell>
          </Link>
        );
      })}
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft sm:hidden">{label}</p>
      <p className="tabular-nums text-sp-ink">{children}</p>
    </div>
  );
}
