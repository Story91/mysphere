'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Swords } from 'lucide-react';
import { clashLeader, isBullBear, sideWord, type Clash, type ClashSide, type ClashToken } from '../duel';
import { formatUsd } from '../useEthUsd';
import PerpAvatar from './PerpAvatar';
import ClashLaunchModal from './ClashLaunchModal';

/**
 * Asset Clash na /perps: jeden mem na dwoch perpach. Karta: obie strony,
 * kapitalizacja w $, pasek udzialu, korona prowadzacego i dzisiejszy ruch
 * kazdego perpa - to on przesuwa szale bez jednej transakcji.
 */
const TONE: Record<ClashSide, { bar: string; ring: string; text: string }> = {
  a: { bar: 'bg-soft-primary', ring: 'border-soft-primary/60 bg-sp-brand-soft', text: 'text-soft-primary-deep' },
  b: { bar: 'bg-amber-500', ring: 'border-amber-500/60 bg-amber-500/[0.08]', text: 'text-amber-600' },
};

export default function ClashSection({ embedded = false }: { embedded?: boolean }) {
  const [clashes, setClashes] = useState<Clash[] | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/launchpad/clashes')
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { clashes?: Clash[] } | null) => {
          if (!cancelled) setClashes(body?.clashes ?? []);
        })
        .catch(() => {
          if (!cancelled) setClashes((c) => c ?? []);
        });
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section
      className={
        embedded
          ? ''
          : 'mt-5 rounded-[22px] border border-sp-shade/10 bg-gradient-to-br from-soft-primary/[0.07] via-sp-surface to-amber-500/[0.07] p-4 sm:p-5'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px] font-extrabold text-sp-ink">
            <Swords className="h-5 w-5 text-soft-primary" aria-hidden="true" /> Asset Clash
          </h2>
          <p className="mt-0.5 max-w-[580px] text-[12.5px] leading-[1.5] text-sp-shade/60">
            One meme, two assets. ETH vs Nvidia, Bitcoin vs Apple: each side rides its own 2x perp, so the market decides who carries the meme harder.
            Pick your asset.
          </p>
        </div>
        <button type="button" onClick={() => setLaunching(true)} className="inline-flex items-center gap-2 rounded-full bg-sp-ink px-4 py-2.5 text-[13px] font-extrabold text-white">
          <Swords className="h-4 w-4" aria-hidden="true" /> Start a clash
        </button>
      </div>

      {clashes === null ? (
        <p className="mt-4 text-[12.5px] text-sp-shade/45">Reading clashes from Base...</p>
      ) : clashes.length === 0 ? (
        <div className="mt-4 rounded-[16px] border border-dashed border-sp-shade/20 px-4 py-6 text-center text-[13px] text-sp-shade/55">
          No clashes yet. Crypto or Wall Street: the first one sets the arena.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {clashes.map((c) => (
            <ClashCard key={c.id} clash={c} />
          ))}
        </div>
      )}
      {launching && <ClashLaunchModal onClose={() => setLaunching(false)} />}
    </section>
  );
}

function Side({ token, side, leading, bullBear }: { token: ClashToken | null; side: ClashSide; leading: boolean; bullBear: boolean }) {
  const tone = TONE[side];
  if (!token) {
    return <div className="flex-1 rounded-[14px] border border-dashed border-sp-shade/20 p-3 text-center text-[11.5px] text-sp-shade/45">Side not launched yet</div>;
  }
  const ch = token.perpChange24h;
  return (
    <Link
      href={`/startpad/${token.address.toLowerCase()}?m=${token.marketId}`}
      className={`flex-1 rounded-[14px] border p-3 transition-colors ${leading ? tone.ring : 'border-sp-shade/10 bg-sp-surface hover:border-soft-primary/50'}`}
    >
      <div className="flex items-center gap-2">
        <PerpAvatar symbol={token.perpSymbol} size={26} change={ch} />
        <span className={`truncate text-[13.5px] font-extrabold ${tone.text}`}>${token.symbol}</span>
        {leading && <span className="ml-auto text-[14px]" aria-label="leading">👑</span>}
      </div>
      <div className="mt-2 text-[16px] font-extrabold text-sp-ink">{token.mcapUsd !== null ? formatUsd(token.mcapUsd) : '--'}</div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">market cap</div>
      {ch !== null && (
        <div className={`mt-1.5 text-[11px] font-extrabold ${ch >= 0 ? 'text-sp-up' : 'text-sp-down-deep'}`}>
          {bullBear ? token.perpSymbol : `${sideWord(token.perpSymbol, false)} 2x`} today {ch >= 0 ? '+' : ''}
          {ch.toFixed(2)}%
        </div>
      )}
      <div className={`mt-2.5 rounded-full px-2 py-1 text-center text-[11.5px] font-extrabold text-white ${tone.bar}`}>Back {sideWord(token.perpSymbol, bullBear)}</div>
    </Link>
  );
}

function ClashCard({ clash }: { clash: Clash }) {
  const leader = clashLeader(clash);
  const a = clash.a?.mcapUsd ?? 0;
  const b = clash.b?.mcapUsd ?? 0;
  const aShare = a + b > 0 ? (a / (a + b)) * 100 : 50;
  const bullBear = isBullBear(clash.a?.perpSymbol, clash.b?.perpSymbol);
  const aBase = clash.a ? sideWord(clash.a.perpSymbol, bullBear) : 'A';
  const bBase = clash.b ? sideWord(clash.b.perpSymbol, bullBear) : 'B';
  return (
    <div id={`clash-${clash.id}`} className="rounded-[18px] border border-sp-shade/10 bg-sp-surface p-3.5">
      <div className="flex items-center gap-2.5">
        {clash.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clash.image} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sp-brand-soft text-[12px] font-extrabold text-soft-primary-deep">{clash.ticker.slice(0, 2)}</span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-extrabold text-sp-ink">
            ${clash.ticker}: {bullBear ? 'Bull vs Bear' : `${aBase} vs ${bBase}`}
          </div>
          {clash.description && <div className="truncate text-[11.5px] text-sp-shade/50">{clash.description}</div>}
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-amber-500/80">
        <div className="h-full bg-soft-primary transition-all" style={{ width: `${aShare}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] font-extrabold">
        <span className="text-soft-primary-deep">
          {aShare.toFixed(0)}% {aBase}
        </span>
        <span className="text-amber-600">
          {(100 - aShare).toFixed(0)}% {bBase}
        </span>
      </div>
      <div className="mt-3 flex gap-2.5">
        <Side token={clash.a} side="a" leading={leader === 'a'} bullBear={bullBear} />
        <Side token={clash.b} side="b" leading={leader === 'b'} bullBear={bullBear} />
      </div>
    </div>
  );
}
