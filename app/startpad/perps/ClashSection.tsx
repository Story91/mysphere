'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Swords } from 'lucide-react';
import { clashLeader, isBullBear, sideWord, type Clash, type ClashSide, type ClashToken } from '../duel';
import { formatUsd } from '../useEthUsd';
import { fetchLogos } from '../logos';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '../config';
import PerpAvatar from './PerpAvatar';
import ClashLaunchModal from './ClashLaunchModal';

/**
 * Asset Clash / Bull vs Bear na /perps: jeden mem na dwoch perpach, podany jak
 * ekran bijatyki. Karta: przeciaganie liny z plakietka VS na styku (przesuwa sie
 * z udzialem w kapitalizacji), korona i poswiata prowadzacego, banner "X LEADS",
 * a strona, ktorej perp dzis spada, obrywa - drga i leci nad nia liczba obrazen.
 * Ruch jest w globals.css (.clash-*) i znika przy prefers-reduced-motion; liczby
 * zostaja te same.
 */
const TONE: Record<ClashSide, { bar: string; ring: string; text: string; glow: string; banner: string }> = {
  a: {
    bar: 'bg-soft-primary',
    ring: 'border-soft-primary/60 bg-sp-brand-soft',
    text: 'text-soft-primary-deep',
    glow: '124 107 218',
    banner: 'bg-soft-primary text-sp-on-brand',
  },
  b: {
    bar: 'bg-amber-500',
    ring: 'border-amber-500/60 bg-amber-500/[0.08]',
    text: 'text-amber-600',
    glow: '245 158 11',
    banner: 'bg-amber-500 text-black/85',
  },
};

/** Iskry na styku liny: kat i zasieg (px). Kilka bialych, reszta zlotych. */
const SPARKS: Array<{ a: number; d: number; delay: number; white?: boolean }> = [
  { a: -75, d: 24, delay: 0 },
  { a: -40, d: 30, delay: 0.25, white: true },
  { a: -10, d: 22, delay: 0.5 },
  { a: 25, d: 28, delay: 0.1, white: true },
  { a: 60, d: 24, delay: 0.7 },
  { a: 105, d: 26, delay: 0.35 },
  { a: 150, d: 22, delay: 0.85, white: true },
  { a: 200, d: 28, delay: 0.55 },
];

/** Intro "FIGHT!" gra raz na starcie strony, nie przy kazdym wejsciu w zakladke. */
const introPlayed = new Set<string>();

export default function ClashSection({ embedded = false }: { embedded?: boolean }) {
  const [clashes, setClashes] = useState<Clash[] | null>(null);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [launching, setLaunching] = useState<null | 'bullbear' | 'clash'>(null);

  useEffect(() => {
    void fetchLogos(DEFAULT_LAUNCHPAD_CHAIN_ID).then(setLogos).catch(() => {});
  }, []);

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
            <Swords className="h-5 w-5 text-soft-primary" aria-hidden="true" /> Bull vs Bear and Asset Clash
          </h2>
          <p className="mt-0.5 max-w-[580px] text-[12.5px] leading-[1.5] text-sp-shade/60">
            One meme, two sides. Bull vs Bear: $XBULL rides ETH2xL, $XBEAR rides ETH2xS, so ETH moving moves the scoreboard. Asset Clash: ETH vs Nvidia,
            Bitcoin vs Apple, each side on its own 2x perp.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setLaunching('bullbear')} className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-sp-on-brand">
            <Swords className="h-4 w-4" aria-hidden="true" /> Start Bull vs Bear
          </button>
          <button type="button" onClick={() => setLaunching('clash')} className="inline-flex items-center gap-2 rounded-full bg-sp-ink px-4 py-2.5 text-[13px] font-extrabold text-white">
            Asset Clash
          </button>
        </div>
      </div>

      {clashes === null ? (
        <p className="mt-4 text-[12.5px] text-sp-shade/45">Reading clashes from Base...</p>
      ) : clashes.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-[16px] border border-dashed border-sp-shade/20 px-4 py-6 text-center text-[13px] text-sp-shade/55">
          <div className="flex items-center gap-3 text-[26px]" aria-hidden="true">
            <span>🐂</span>
            <span className="clash-vs-badge" style={{ cursor: 'default' }}>
              VS
            </span>
            <span>🐻</span>
          </div>
          No duels yet. Start the first Bull vs Bear and set the arena.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {clashes.map((c) => (
            <ClashCard key={c.id} clash={c} logo={logos[c.a?.address.toLowerCase() ?? ''] ?? logos[c.b?.address.toLowerCase() ?? '']} />
          ))}
        </div>
      )}
      {launching && <ClashLaunchModal preset={launching === 'bullbear' ? 'bullbear' : undefined} onClose={() => setLaunching(null)} />}
    </section>
  );
}

/** Wartosc perpa w USD wyliczona z kapitalizacji i ceny w perpie (1e9 tokenow). */
function navOf(token: ClashToken | null): number | null {
  if (!token || token.mcapUsd === null || token.priceInPerp <= 0) return null;
  return token.mcapUsd / (token.priceInPerp * 1e9);
}

function signed(n: number, digits = 2): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function Side({
  token,
  side,
  leading,
  bullBear,
  hit,
}: {
  token: ClashToken | null;
  side: ClashSide;
  leading: boolean;
  bullBear: boolean;
  /** Obrazenia z ostatniego odswiezenia (przesuniecie szali) - liczba nad strona. */
  hit: string | null;
}) {
  const tone = TONE[side];
  if (!token) {
    return <div className="flex-1 rounded-[14px] border border-dashed border-sp-shade/20 p-3 text-center text-[11.5px] text-sp-shade/45">Side not launched yet</div>;
  }
  const ch = token.perpChange24h;
  const hurt = ch !== null && ch < 0;
  return (
    // Zewnetrzny div niesie ruch (cios, drganie), wewnetrzny link poswiate prowadzacego.
    <div className={`relative flex-1 ${hit ? 'clash-hit-once' : hurt ? 'clash-hurt' : ''}`}>
      {hit ? (
        <span className="clash-dmg clash-dmg-once text-sp-down-deep">{hit}</span>
      ) : hurt && ch !== null ? (
        <span className="clash-dmg clash-hurt-dmg text-sp-down-deep">{ch.toFixed(1)}%</span>
      ) : null}
      <Link
        href={`/startpad/${token.address.toLowerCase()}?m=${token.marketId}`}
        className={`block h-full rounded-[14px] border p-3 transition-colors ${leading ? `clash-leader ${tone.ring}` : 'border-sp-shade/10 bg-sp-surface hover:border-soft-primary/50'}`}
        style={{ '--glow': tone.glow } as CSSProperties}
      >
        <div className="flex items-center gap-2">
          <PerpAvatar symbol={token.perpSymbol} size={26} change={ch} />
          <span className={`truncate text-[13.5px] font-extrabold ${tone.text}`}>${token.symbol}</span>
          {leading && (
            <span className="clash-crown ml-auto text-[14px]" aria-label="leading">
              👑
            </span>
          )}
        </div>
        <div className="mt-2 text-[16px] font-extrabold text-sp-ink">{token.mcapUsd !== null ? formatUsd(token.mcapUsd) : '--'}</div>
        <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">market cap</div>
        {ch !== null && (
          <div className={`mt-1.5 text-[11px] font-extrabold ${ch >= 0 ? 'text-sp-up' : 'text-sp-down-deep'}`}>
            {bullBear ? token.perpSymbol : `${sideWord(token.perpSymbol, false)} 2x`} today {signed(ch)}
          </div>
        )}
        <div className={`text-[11px] font-extrabold ${token.sinceLaunchPct >= 0 ? 'text-sp-up' : 'text-sp-down-deep'}`}>
          meme since launch {signed(token.sinceLaunchPct, 1)}
        </div>
        <div className={`mt-2.5 rounded-full px-2 py-1 text-center text-[11.5px] font-extrabold text-white ${tone.bar}`}>Back {sideWord(token.perpSymbol, bullBear)}</div>
      </Link>
    </div>
  );
}

function ClashCard({ clash, logo }: { clash: Clash; logo?: string }) {
  const leader = clashLeader(clash);
  const a = clash.a?.mcapUsd ?? 0;
  const b = clash.b?.mcapUsd ?? 0;
  const aShare = a + b > 0 ? (a / (a + b)) * 100 : 50;
  const bullBear = isBullBear(clash.a?.perpSymbol, clash.b?.perpSymbol);
  const aBase = clash.a ? sideWord(clash.a.perpSymbol, bullBear) : 'A';
  const bBase = clash.b ? sideWord(clash.b.perpSymbol, bullBear) : 'B';

  // Intro FIGHT! (raz na klip) i powtorka po stuknieciu VS.
  const [intro, setIntro] = useState(() => !introPlayed.has(clash.id));
  const [replay, setReplay] = useState(0);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    introPlayed.add(clash.id);
  }, [clash.id]);

  // Cios po kazdym odswiezeniu, ktore realnie przesunelo szale: obrywa strona, ktora stracila.
  const prevShare = useRef<number | null>(null);
  const [hit, setHit] = useState<{ side: ClashSide; text: string } | null>(null);
  useEffect(() => {
    const prev = prevShare.current;
    prevShare.current = aShare;
    if (prev === null || Math.abs(aShare - prev) < 0.4) return;
    const d = aShare - prev;
    setHit({ side: d > 0 ? 'b' : 'a', text: `-${Math.abs(d).toFixed(1)}%` });
    const t = window.setTimeout(() => setHit(null), 2600);
    return () => window.clearTimeout(t);
  }, [aShare]);

  useEffect(() => {
    if (!burst) return;
    const t = window.setTimeout(() => setBurst(false), 700);
    return () => window.clearTimeout(t);
  }, [burst, replay]);

  const replayFight = () => {
    setIntro(true);
    setBurst(true);
    setReplay((n) => n + 1);
  };

  const navA = navOf(clash.a);
  const navB = navOf(clash.b);
  const vsLeft = Math.min(90, Math.max(10, aShare));
  const leadWord = leader === 'a' ? aBase : leader === 'b' ? bBase : null;
  const leadShare = Math.round(leader === 'b' ? 100 - aShare : aShare);

  return (
    <div id={`clash-${clash.id}`} className="clash-arena rounded-[18px] border border-sp-shade/10 bg-sp-surface p-3.5">
      {intro && (
        <div key={replay} className="clash-fight" aria-hidden="true">
          FIGHT!
        </div>
      )}
      {burst && <div key={`f${replay}`} className="clash-flash clash-flash-on" aria-hidden="true" />}

      <div className="flex items-center gap-2.5">
        {logo ?? clash.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(logo ?? clash.image) as string} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sp-brand-soft text-[12px] font-extrabold text-soft-primary-deep">{clash.ticker.slice(0, 2)}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold text-sp-ink">
            ${clash.ticker}: {bullBear ? 'Bull vs Bear' : `${aBase} vs ${bBase}`}
          </div>
          {clash.description && <div className="truncate text-[11.5px] text-sp-shade/50">{clash.description}</div>}
        </div>
        <div
          key={leader ?? 'tie'}
          className={`clash-ko shrink-0 rounded-[6px] px-2 py-1 text-[10.5px] font-black uppercase italic tracking-[0.04em] ${leader ? TONE[leader].banner : 'bg-sp-ink text-white'}`}
        >
          {leadWord ? `${bullBear ? (leader === 'a' ? '🐂 ' : '🐻 ') : ''}${leadWord} leads ${leadShare}%` : 'Dead heat'}
        </div>
      </div>

      <div className={`relative mb-1 mt-4 px-1 ${burst ? 'clash-shake' : ''}`}>
        <div className="clash-track">
          <div className="clash-fill" style={{ width: `${aShare}%` }} />
          <div className={`clash-vs ${burst ? 'clash-burst' : ''}`} style={{ left: `${vsLeft}%` }}>
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="clash-spark"
                style={{ '--a': `${s.a}deg`, '--d': `${s.d}px`, animationDelay: `${s.delay}s`, background: s.white ? '#fff' : undefined } as CSSProperties}
                aria-hidden="true"
              />
            ))}
            <button type="button" className="clash-vs-badge" onClick={replayFight} aria-label="Replay the fight intro" title="Tap to replay">
              VS
            </button>
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[10.5px] font-extrabold">
        <span className="text-soft-primary-deep">
          {aShare.toFixed(0)}% {aBase}
        </span>
        <span className="text-amber-600">
          {(100 - aShare).toFixed(0)}% {bBase}
        </span>
      </div>

      <div className="mt-3 flex gap-2.5">
        <Side token={clash.a} side="a" leading={leader === 'a'} bullBear={bullBear} hit={hit?.side === 'a' ? hit.text : null} />
        <Side token={clash.b} side="b" leading={leader === 'b'} bullBear={bullBear} hit={hit?.side === 'b' ? hit.text : null} />
      </div>

      {navA !== null && navB !== null && (
        <details className="mt-2.5 text-[11px] leading-[1.5] text-sp-shade/55">
          <summary className="cursor-pointer select-none font-bold text-sp-shade/60">Why are the caps different?</summary>
          <p className="mt-1">
            Both sides launch at the same price in perp units. Cap in USD is that price times the perp&apos;s own value: {clash.a?.perpSymbol} ${navA.toFixed(2)}, {clash.b?.perpSymbol} ${navB.toFixed(2)}. So the gap at the
            start is only the two perps&apos; prices; from there trades and the market move it. &quot;Meme since launch&quot; shows the trading alone.
          </p>
        </details>
      )}
    </div>
  );
}
