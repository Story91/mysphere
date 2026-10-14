'use client';

import type { CSSProperties } from 'react';
import type { ClashSide } from '../duel';
import { PerpCornerBadge } from './PerpAvatar';

/**
 * Wspolne klocki areny: lina z plakietka VS (karta starcia na /perps, pasek na
 * stronie tokena, baner huba) i awatar mema z ikona perpa w rogu. Ruch siedzi w
 * globals.css (.clash-*) i znika przy prefers-reduced-motion.
 */
export const TONE: Record<ClashSide, { bar: string; ring: string; text: string; glow: string; banner: string; chip: string }> = {
  a: {
    bar: 'bg-soft-primary',
    ring: 'border-soft-primary/60 bg-sp-brand-soft',
    text: 'text-soft-primary-deep',
    glow: '124 107 218',
    banner: 'bg-soft-primary text-sp-on-brand',
    chip: 'bg-sp-brand-soft text-soft-primary-deep',
  },
  b: {
    bar: 'bg-amber-500',
    ring: 'border-amber-500/60 bg-amber-500/[0.08]',
    text: 'text-amber-600',
    glow: '245 158 11',
    banner: 'bg-amber-500 text-black/85',
    chip: 'bg-amber-500/15 text-amber-700',
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

/**
 * Lina: lewy odcinek = udzial strony A. Plakietka VS siedzi na styku i jedzie
 * razem z nim; stuknieta wola `onVsClick` (powtorka intro).
 */
export function ClashBar({ aShare, burst = false, onVsClick, compact = false }: { aShare: number; burst?: boolean; onVsClick?: () => void; compact?: boolean }) {
  const vsLeft = Math.min(90, Math.max(10, aShare));
  const small = compact ? { width: 24, height: 24, fontSize: 9 } : undefined;
  return (
    <div className={`relative px-1 ${burst ? 'clash-shake' : ''}`}>
      <div className="clash-track" style={compact ? { height: 10 } : undefined}>
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
          {onVsClick ? (
            <button type="button" className="clash-vs-badge" style={small} onClick={onVsClick} aria-label="Replay the fight intro" title="Tap to replay">
              VS
            </button>
          ) : (
            <span className="clash-vs-badge" style={{ ...small, cursor: 'default' }} aria-hidden="true">
              VS
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Awatar mema: logo (Blob albo z lancucha) albo inicjaly, z ikona perpa w rogu. */
export function MemeAvatar({ logo, symbol, perpSymbol, size = 28 }: { logo?: string | null; symbol: string; perpSymbol: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} loading="lazy" />
      ) : (
        <span
          className="flex items-center justify-center rounded-full bg-sp-brand-soft font-extrabold text-soft-primary-deep"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
        >
          {symbol.slice(0, 2).toUpperCase()}
        </span>
      )}
      <PerpCornerBadge symbol={perpSymbol} size={Math.max(12, Math.round(size * 0.5))} />
    </span>
  );
}
