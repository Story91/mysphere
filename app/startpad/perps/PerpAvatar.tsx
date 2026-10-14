'use client';

import FeedIcon from '../../derivatives/FeedIcon';

/**
 * Awatar perpa Flash: ikona aktywa bazowego (ETH, BTC, NVDA...) z plakietka
 * dzwigni. API Flash nie daje obrazkow, wiec ikony bierzemy z FeedIcon
 * (wlasne znaki ETH/BTC, logo spolek z CDN po tickerze, reszta kafel z literami).
 *
 * Symbol Flash to "<BAZA><dzwignia>x<L|S>" (ETH2xL, ETH2xS) albo "ETHMAXL".
 */
export function perpBase(symbol: string): string {
  return symbol.replace(/\d+x[LS]$/i, '').replace(/MAX[LS]$/i, '').toUpperCase();
}

export function perpLeverage(symbol: string): { label: string; short: boolean } {
  const m = symbol.match(/(\d+)x([LS])$/i);
  if (m) return { label: `${m[1]}x`, short: m[2].toUpperCase() === 'S' };
  const max = symbol.match(/MAX([LS])$/i);
  return { label: 'max', short: max ? max[1].toUpperCase() === 'S' : false };
}

export default function PerpAvatar({
  symbol,
  size = 40,
  change = null,
  glow = false,
}: {
  symbol: string;
  size?: number;
  /** Zmiana 24h - kolor poswiaty; null = neutralna. */
  change?: number | null;
  glow?: boolean;
}) {
  const lev = perpLeverage(symbol);
  const tone = change === null ? 'rgba(14,17,22,0.35)' : change >= 0 ? 'rgba(22,163,74,0.5)' : 'rgba(220,38,38,0.5)';
  const badge = Math.max(14, Math.round(size * 0.42));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="inline-flex overflow-hidden rounded-full"
        style={glow ? { boxShadow: `0 0 0 2px ${tone}, 0 0 ${Math.round(size * 0.45)}px ${tone}` } : undefined}
      >
        <FeedIcon base={perpBase(symbol)} size={size} />
      </span>
      <span
        className={`absolute -bottom-1 -right-1.5 inline-flex items-center justify-center rounded-full px-1 font-extrabold leading-none text-white ring-2 ring-sp-surface ${lev.short ? 'bg-sp-down-deep' : 'bg-sp-up'}`}
        style={{ height: badge * 0.85, minWidth: badge, fontSize: Math.max(8, Math.round(badge * 0.5)) }}
      >
        {lev.label}
        {lev.short ? '↓' : '↑'}
      </span>
    </span>
  );
}

/** Mala ikona perpa w rogu logo mema - widac od razu, na czym mem stoi. */
export function PerpCornerBadge({ symbol, size = 18 }: { symbol: string; size?: number }) {
  return (
    <span className="absolute -bottom-1 -right-1 inline-flex overflow-hidden rounded-full ring-2 ring-sp-surface" title={`on ${symbol}`}>
      <FeedIcon base={perpBase(symbol)} size={size} />
    </span>
  );
}
