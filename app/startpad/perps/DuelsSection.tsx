'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Swords } from 'lucide-react';
import { DUEL_MARKETS, duelLeader, type Duel, type DuelSide, type DuelToken } from '../duel';
import { formatUsd } from '../useEthUsd';
import PerpAvatar from './PerpAvatar';
import DuelLaunchModal from './DuelLaunchModal';

/**
 * Pojedynki Bull vs Bear na /perps. Kazda karta: dwa obozy, kapitalizacja w $,
 * pasek "kto prowadzi" i zmiana ETH z dzis (to ona przesuwa szale bez handlu).
 */
export default function DuelsSection({ ethChange24h }: { ethChange24h: number | null }) {
  const [duels, setDuels] = useState<Duel[] | null>(null);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/launchpad/duels')
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { duels?: Duel[] } | null) => {
          if (!cancelled) setDuels(body?.duels ?? []);
        })
        .catch(() => {
          if (!cancelled) setDuels((d) => d ?? []);
        });
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="mt-5 rounded-[22px] border border-sp-shade/10 bg-gradient-to-br from-sp-up/[0.06] via-sp-surface to-sp-down/[0.06] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px] font-extrabold text-sp-ink">
            <Swords className="h-5 w-5 text-soft-primary" aria-hidden="true" /> Bull vs Bear
          </h2>
          <p className="mt-0.5 max-w-[560px] text-[12.5px] leading-[1.5] text-sp-shade/60">
            Twin memes: one rides ETH2xL, the other ETH2xS. Pick a side. When ETH moves, the scoreboard moves without a single trade.
            {ethChange24h !== null && (
              <span className={`ml-1 font-extrabold ${ethChange24h >= 0 ? 'text-sp-up' : 'text-sp-down-deep'}`}>
                Today ETH2xL {ethChange24h >= 0 ? '+' : ''}
                {ethChange24h.toFixed(2)}%: {ethChange24h >= 0 ? 'bulls' : 'bears'} have the wind.
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLaunching(true)}
          className="inline-flex items-center gap-2 rounded-full bg-sp-ink px-4 py-2.5 text-[13px] font-extrabold text-white"
        >
          <Swords className="h-4 w-4" aria-hidden="true" /> Start a duel
        </button>
      </div>

      {duels === null ? (
        <p className="mt-4 text-[12.5px] text-sp-shade/45">Reading duels from Base...</p>
      ) : duels.length === 0 ? (
        <div className="mt-4 rounded-[16px] border border-dashed border-sp-shade/20 px-4 py-6 text-center text-[13px] text-sp-shade/55">
          No duels yet. The first one sets the arena.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {duels.map((d) => (
            <DuelCard key={d.id} duel={d} />
          ))}
        </div>
      )}
      {launching && <DuelLaunchModal onClose={() => setLaunching(false)} />}
    </section>
  );
}

function Side({ token, side, leading }: { token: DuelToken | null; side: DuelSide; leading: boolean }) {
  const bull = side === 'bull';
  const tone = bull ? 'text-sp-up' : 'text-sp-down-deep';
  if (!token) {
    return <div className="flex-1 rounded-[14px] border border-dashed border-sp-shade/20 p-3 text-center text-[11.5px] text-sp-shade/45">{bull ? 'Bull' : 'Bear'} side not launched</div>;
  }
  return (
    <Link
      href={`/startpad/${token.address.toLowerCase()}?m=${DUEL_MARKETS[side]}`}
      className={`flex-1 rounded-[14px] border p-3 transition-colors ${leading ? (bull ? 'border-sp-up/60 bg-sp-up/[0.08]' : 'border-sp-down/60 bg-sp-down/[0.08]') : 'border-sp-shade/10 bg-sp-surface hover:border-soft-primary/50'}`}
    >
      <div className="flex items-center gap-2">
        <PerpAvatar symbol={bull ? 'ETH2xL' : 'ETH2xS'} size={26} />
        <span className={`truncate text-[13.5px] font-extrabold ${tone}`}>${token.symbol}</span>
        {leading && <span className="ml-auto text-[14px]" aria-label="leading">👑</span>}
      </div>
      <div className="mt-2 text-[16px] font-extrabold text-sp-ink">{token.mcapUsd !== null ? formatUsd(token.mcapUsd) : '--'}</div>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">market cap</div>
      <div className={`mt-2.5 rounded-full px-2 py-1 text-center text-[11.5px] font-extrabold text-white ${bull ? 'bg-sp-up' : 'bg-sp-down-deep'}`}>
        {bull ? 'Go bull ↑' : 'Go bear ↓'}
      </div>
    </Link>
  );
}

function DuelCard({ duel }: { duel: Duel }) {
  const leader = duelLeader(duel);
  const a = duel.bull?.mcapUsd ?? 0;
  const b = duel.bear?.mcapUsd ?? 0;
  const bullShare = a + b > 0 ? (a / (a + b)) * 100 : 50;
  return (
    <div id={`duel-${duel.id}`} className="rounded-[18px] border border-sp-shade/10 bg-sp-surface p-3.5">
      <div className="flex items-center gap-2.5">
        {duel.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={duel.image} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sp-brand-soft text-[12px] font-extrabold text-soft-primary-deep">{duel.ticker.slice(0, 2)}</span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-extrabold text-sp-ink">${duel.ticker}: Bull vs Bear</div>
          {duel.description && <div className="truncate text-[11.5px] text-sp-shade/50">{duel.description}</div>}
        </div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sp-down/70">
        <div className="h-full bg-sp-up transition-all" style={{ width: `${bullShare}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] font-extrabold">
        <span className="text-sp-up">{bullShare.toFixed(0)}% bulls</span>
        <span className="text-sp-down-deep">{(100 - bullShare).toFixed(0)}% bears</span>
      </div>
      <div className="mt-3 flex gap-2.5">
        <Side token={duel.bull} side="bull" leading={leader === 'bull'} />
        <Side token={duel.bear} side="bear" leading={leader === 'bear'} />
      </div>
    </div>
  );
}
