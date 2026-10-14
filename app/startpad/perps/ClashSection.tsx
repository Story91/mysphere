'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Swords } from 'lucide-react';
import { clashKoWinner, clashPhase, clashSharePct, clashVerdict, isBullBear, sideWord, type Clash, type ClashSide, type ClashToken } from '../duel';
import { formatUsd } from '../useEthUsd';
import { fetchLogos } from '../logos';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '../config';
import ClashLaunchModal from './ClashLaunchModal';
import { ClashBar, MemeAvatar, TONE } from './ClashBar';
import { useClashes } from './useClashes';

/**
 * Asset Clash / Bull vs Bear na /perps: jeden mem na dwoch perpach, podany jak
 * ekran bijatyki. Karta: lina z plakietka VS na styku (jedzie z udzialem), korona
 * i poswiata prowadzacego, banner fazy, a strona, ktorej perp dzis spada, obrywa -
 * drga i leci nad nia liczba obrazen. Ruch jest w globals.css (.clash-*) i znika
 * przy prefers-reduced-motion; liczby zostaja te same.
 *
 * Uczciwosc wyniku (patrz `clashPhase` w duel.ts): kapitalizacja w USD to cena w
 * perpie razy NAV perpa, wiec przed pierwszymi zakupami po obu stronach lina stoi
 * na 50/50 i banner mowi "waiting for the first blow" - zamiast "BEAR LEADS" z
 * samej roznicy NAV. Potem dwaj sedziowie (kapitalizacja i handel) i KO, gdy
 * jedna strona pierwsza zapelni krzywa.
 */

/** Intro "FIGHT!" gra raz na starcie strony, nie przy kazdym wejsciu w zakladke. */
const introPlayed = new Set<string>();

/** Logo strony: Blob (profil), potem obrazek z `metadataURI` (starty sprzed 14.10). */
function sideLogo(token: ClashToken | null, logos: Record<string, string>): string | undefined {
  if (!token) return undefined;
  return logos[token.address.toLowerCase()] ?? token.image ?? undefined;
}

export default function ClashSection({ embedded = false, focusId = null }: { embedded?: boolean; focusId?: string | null }) {
  const clashes = useClashes();
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [launching, setLaunching] = useState<null | 'bullbear' | 'clash'>(null);

  useEffect(() => {
    void fetchLogos(DEFAULT_LAUNCHPAD_CHAIN_ID).then(setLogos).catch(() => {});
  }, []);

  // Link ze startu / z posta (?clash=<id>): przewin do karty, gdy dane dojda.
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || !clashes || focused.current === focusId) return;
    const node = document.getElementById(`clash-${focusId}`);
    if (!node) return;
    focused.current = focusId;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
  }, [focusId, clashes]);

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
            <ClashCard key={c.id} clash={c} logos={logos} highlight={focusId === c.id} />
          ))}
        </div>
      )}
      {launching && <ClashLaunchModal preset={launching === 'bullbear' ? 'bullbear' : undefined} onClose={() => setLaunching(null)} />}
    </section>
  );
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
  logo,
}: {
  token: ClashToken | null;
  side: ClashSide;
  leading: boolean;
  bullBear: boolean;
  /** Obrazenia z ostatniego odswiezenia (przesuniecie szali) - liczba nad strona. */
  hit: string | null;
  logo?: string;
}) {
  const tone = TONE[side];
  if (!token) {
    return <div className="flex-1 rounded-[14px] border border-dashed border-sp-shade/20 p-3 text-center text-[11.5px] text-sp-shade/45">Side not launched yet</div>;
  }
  const ch = token.perpChange24h;
  const hurt = ch !== null && ch < 0;
  const word = sideWord(token.perpSymbol, bullBear);
  // Krzywa zapelniona: ruch ceny w perpie stoi na maksimum - "since launch" nic by nie mowil.
  const filled = token.state !== 'Curve';
  return (
    // Zewnetrzny div niesie ruch (cios, drganie), wewnetrzny link poswiate prowadzacego.
    <div className={`relative flex-1 ${hit ? 'clash-hit-once' : hurt ? 'clash-hurt' : ''}`}>
      {hit ? (
        <span className="clash-dmg clash-dmg-once text-sp-down-deep">{hit}</span>
      ) : hurt && ch !== null ? (
        <span className="clash-dmg clash-hurt-dmg text-sp-down-deep">{ch.toFixed(1)}%</span>
      ) : null}
      <Link
        // `msg` wypelnia pole "Say something" przy kupnie okrzykiem druzyny (do edycji, nic nie wysyla samo).
        href={`/startpad/${token.address.toLowerCase()}?m=${token.marketId}&msg=${encodeURIComponent(`Team ${word}: `)}`}
        className={`block h-full rounded-[14px] border p-3 transition-colors ${leading ? `clash-leader ${tone.ring}` : 'border-sp-shade/10 bg-sp-surface hover:border-soft-primary/50'}`}
        style={{ '--glow': tone.glow } as CSSProperties}
      >
        <div className="flex items-center gap-2">
          <MemeAvatar logo={logo} symbol={token.symbol} perpSymbol={token.perpSymbol} size={28} />
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
        {filled ? (
          <div className="text-[11px] font-extrabold text-soft-primary-deep">curve filled</div>
        ) : (
          <div className={`text-[11px] font-extrabold ${token.sinceLaunchPct >= 0 ? 'text-sp-up' : 'text-sp-down-deep'}`}>meme since launch {signed(token.sinceLaunchPct, 1)}</div>
        )}
        <div className={`mt-2.5 rounded-full px-2 py-1 text-center text-[11.5px] font-extrabold text-white ${tone.bar}`}>Back {word}</div>
      </Link>
    </div>
  );
}

/** Tekst i ton bannera dla fazy starcia; zmiana klucza odgrywa wjazd od nowa. */
export function bannerOf(clash: Clash, bullBear: boolean, share: number): { key: string; text: string; cls: string } {
  const phase = clashPhase(clash);
  const word = (s: ClashSide) => {
    const t = s === 'a' ? clash.a : clash.b;
    return t ? sideWord(t.perpSymbol, bullBear) : s.toUpperCase();
  };
  const icon = (s: ClashSide) => (bullBear ? (s === 'a' ? '🐂 ' : '🐻 ') : '');
  if (phase === 'ko') {
    const w = clashKoWinner(clash);
    if (w) return { key: `ko-${w}`, text: `KO: ${word(w)} filled first`, cls: TONE[w].banner };
  }
  if (phase === 'warmup') return { key: 'warmup', text: 'Waiting for the first blow', cls: 'bg-sp-ink text-white' };
  const verdict = clashVerdict(clash);
  if (verdict.kind === 'unanimous' && verdict.cap) {
    const pct = Math.round(verdict.cap === 'a' ? share : 100 - share);
    return { key: `lead-${verdict.cap}`, text: `${icon(verdict.cap)}${word(verdict.cap)} leads ${pct}%`, cls: TONE[verdict.cap].banner };
  }
  if (verdict.kind === 'split') return { key: 'split', text: 'Split decision', cls: 'bg-sp-ink text-white' };
  return { key: 'dead-heat', text: 'Dead heat', cls: 'bg-sp-ink text-white' };
}

/** Wiersz sedziow: kto wygrywa wg kapitalizacji, kto wg handlu; KO i warmup maja wlasny tekst. */
function Judges({ clash, bullBear }: { clash: Clash; bullBear: boolean }) {
  const phase = clashPhase(clash);
  const word = (s: ClashSide) => {
    const t = s === 'a' ? clash.a : clash.b;
    return t ? sideWord(t.perpSymbol, bullBear) : s.toUpperCase();
  };
  const hint =
    'Cap = USD market cap (meme price in perp units x the perp\'s own value). Trading = meme price move since launch in perp units, without the perp\'s value. Before both sides have traded the bar stays 50/50.';
  let body: ReactNode;
  if (phase === 'warmup') {
    body = <span className="text-sp-shade/50">wait for a first buy on each side</span>;
  } else if (phase === 'ko') {
    const w = clashKoWinner(clash);
    body = w ? <span className={`rounded-full px-2 py-0.5 font-extrabold ${TONE[w].chip}`}>curve filled first: {word(w)}</span> : null;
  } else {
    const v = clashVerdict(clash);
    body =
      v.kind === 'unanimous' && v.cap ? (
        <span className={`rounded-full px-2 py-0.5 font-extrabold ${TONE[v.cap].chip}`}>both say {word(v.cap)}</span>
      ) : v.cap && v.trading ? (
        <>
          <span className={`rounded-full px-2 py-0.5 font-extrabold ${TONE[v.cap].chip}`}>cap: {word(v.cap)}</span>
          <span className={`rounded-full px-2 py-0.5 font-extrabold ${TONE[v.trading].chip}`}>trading: {word(v.trading)}</span>
        </>
      ) : (
        <span className="text-sp-shade/50">too close to call</span>
      );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]" title={hint}>
      <span className="font-extrabold uppercase tracking-[0.06em] text-sp-shade/45">Judges</span>
      {body}
    </div>
  );
}

export function ClashCard({ clash, logos, highlight = false }: { clash: Clash; logos: Record<string, string>; highlight?: boolean }) {
  const phase = clashPhase(clash);
  const koWinner = clashKoWinner(clash);
  const verdict = clashVerdict(clash);
  // Korona: zwyciezca KO, a w bijatyce prowadzacy wg kapitalizacji; przed zakupami nikt.
  const crown: ClashSide | null = phase === 'ko' ? koWinner : phase === 'brawl' ? verdict.cap ?? null : null;
  const aShare = clashSharePct(clash);
  const bullBear = isBullBear(clash.a?.perpSymbol, clash.b?.perpSymbol);
  const aBase = clash.a ? sideWord(clash.a.perpSymbol, bullBear) : 'A';
  const bBase = clash.b ? sideWord(clash.b.perpSymbol, bullBear) : 'B';
  const logoA = sideLogo(clash.a, logos);
  const logoB = sideLogo(clash.b, logos);
  const headLogo = logoA ?? logoB ?? clash.image ?? undefined;
  const banner = bannerOf(clash, bullBear, aShare);

  // Intro FIGHT! (raz na klip) i powtorka po stuknieciu VS.
  const [intro, setIntro] = useState(() => !introPlayed.has(clash.id));
  const [replay, setReplay] = useState(0);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    introPlayed.add(clash.id);
  }, [clash.id]);

  // Cios po kazdym odswiezeniu, ktore realnie przesunelo szale (i to w bijatyce, nie przy
  // skoku z 50/50 po pierwszych zakupach): obrywa strona, ktora stracila.
  const prev = useRef<{ share: number; phase: string } | null>(null);
  const [hit, setHit] = useState<{ side: ClashSide; text: string } | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = { share: aShare, phase };
    if (!before || before.phase !== 'brawl' || phase !== 'brawl' || Math.abs(aShare - before.share) < 0.4) return;
    const d = aShare - before.share;
    setHit({ side: d > 0 ? 'b' : 'a', text: `-${Math.abs(d).toFixed(1)}%` });
    const t = window.setTimeout(() => setHit(null), 2600);
    return () => window.clearTimeout(t);
  }, [aShare, phase]);

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

  return (
    <div
      id={`clash-${clash.id}`}
      className={`clash-arena rounded-[18px] border bg-sp-surface p-3.5 transition-shadow ${highlight ? 'border-soft-primary shadow-[0_0_0_3px_rgb(var(--soft-primary)/0.25)]' : 'border-sp-shade/10'}`}
    >
      {intro && (
        <div key={replay} className="clash-fight" aria-hidden="true">
          FIGHT!
        </div>
      )}
      {burst && <div key={`f${replay}`} className="clash-flash clash-flash-on" aria-hidden="true" />}

      <div className="flex items-center gap-2.5">
        {headLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={headLogo} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sp-brand-soft text-[12px] font-extrabold text-soft-primary-deep">{clash.ticker.slice(0, 2)}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold text-sp-ink">
            ${clash.ticker}: {bullBear ? 'Bull vs Bear' : `${aBase} vs ${bBase}`}
          </div>
          {clash.description && <div className="truncate text-[11.5px] text-sp-shade/50">{clash.description}</div>}
        </div>
        <div key={banner.key} className={`clash-ko shrink-0 rounded-[6px] px-2 py-1 text-[10.5px] font-black uppercase italic tracking-[0.04em] ${banner.cls}`}>
          {banner.text}
        </div>
      </div>

      <div className="mb-1 mt-4">
        <ClashBar aShare={aShare} burst={burst} onVsClick={replayFight} />
      </div>
      <div className="flex justify-between text-[10.5px] font-extrabold">
        <span className="text-soft-primary-deep">{phase === 'warmup' ? aBase : `${aShare.toFixed(0)}% ${aBase}`}</span>
        <span className="text-amber-600">{phase === 'warmup' ? bBase : `${(100 - aShare).toFixed(0)}% ${bBase}`}</span>
      </div>

      <div className="mt-3 flex gap-2.5">
        <Side token={clash.a} side="a" leading={crown === 'a'} bullBear={bullBear} hit={hit?.side === 'a' ? hit.text : null} logo={logoA} />
        <Side token={clash.b} side="b" leading={crown === 'b'} bullBear={bullBear} hit={hit?.side === 'b' ? hit.text : null} logo={logoB} />
      </div>

      <Judges clash={clash} bullBear={bullBear} />
    </div>
  );
}
