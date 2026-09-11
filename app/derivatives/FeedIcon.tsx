'use client';

import { useState } from 'react';

/**
 * KAFEL INSTRUMENTU - jedna ikona na kazdy indeks, ktory perp moze sledzic.
 *
 * ===========================================================================
 * SKAD OBRAZKI
 * ===========================================================================
 * - Akcje i ETF-y: logo spolki z assets.parqet.com (publiczne CDN log
 *   gieldowych, po tickerze). Logo jest znakiem towarowym spolki; uzycie
 *   do IDENTYFIKACJI instrumentu to ta sama praktyka, co u brokerow.
 *   Gdy CDN padnie albo tickera nie zna, `onError` przelacza na kafel
 *   z literami - nigdy pusty kwadrat.
 * - BTC: rysowany znak (pomaranczowe kolo, pochylone B) - dokladny na tyle,
 *   by byc rozpoznanym w 32 px, bez sciezki z cudzego pliku.
 * - ETH, USDC: nasze pliki w public/icons (juz uzywane w BaseChat).
 * - XAU: sztabka. EUR: znak euro na granacie flagi UE. ARC: public/arc.jpg.
 * - Reszta: kafel z literami w odcieniu wyliczonym z tickera, zeby ten sam
 *   symbol mial zawsze ten sam kolor.
 *
 * `base` to czlon przed "/" lub "-" w symbolu ("TSLA/USD", "TSLA-USD",
 * "TSLA/USD · DOGE" -> "TSLA").
 */

export const INSTRUMENT_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ether',
  SOL: 'Solana',
  USDC: 'USD Coin',
  XAU: 'Gold',
  EUR: 'Euro',
  TSLA: 'Tesla',
  AAPL: 'Apple',
  NVDA: 'Nvidia',
  MSFT: 'Microsoft',
  GOOGL: 'Alphabet',
  AMZN: 'Amazon',
  SPY: 'S&P 500 ETF',
  ARC: 'Arc',
};

const CRYPTO = new Set(['BTC', 'ETH', 'SOL', 'USDC']);
const LOCAL_FILES: Record<string, string> = { ETH: '/icons/eth.svg', USDC: '/icons/usdc.svg', ARC: '/arc.jpg' };

export function instrumentBase(symbol: string): string {
  return symbol.split(/[\/\-\s·]/)[0].trim().toUpperCase();
}

export function instrumentName(base: string): string {
  return INSTRUMENT_NAMES[base] ?? base;
}

function hue(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}

function LetterTile({ base, size }: { base: string; size: number }) {
  const h = hue(base);
  const letters = base.slice(0, base.length > 3 ? 3 : 2);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${h} 55% 44%), hsl(${(h + 40) % 360} 60% 32%))`,
        fontSize: Math.round(size * (letters.length > 2 ? 0.3 : 0.38)),
      }}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-[28%] font-extrabold tracking-tight text-white"
    >
      {letters}
    </span>
  );
}

function Bitcoin({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <g transform="rotate(-12 16 16)">
        <text
          x="16"
          y="22.5"
          textAnchor="middle"
          fontFamily="Arial Black, Arial, Helvetica, sans-serif"
          fontWeight="900"
          fontSize="19"
          fill="#fff"
        >
          B
        </text>
        <rect x="14.2" y="6.5" width="1.5" height="3" fill="#fff" />
        <rect x="17.2" y="6.5" width="1.5" height="3" fill="#fff" />
        <rect x="14.2" y="22.6" width="1.5" height="3" fill="#fff" />
        <rect x="17.2" y="22.6" width="1.5" height="3" fill="#fff" />
      </g>
    </svg>
  );
}

function Gold({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="feed-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE38A" />
          <stop offset="0.5" stopColor="#E0A93A" />
          <stop offset="1" stopColor="#9C6A12" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#2B2113" />
      <path d="M8 21 L11 12 H21 L24 21 Z" fill="url(#feed-gold)" />
      <path d="M11 12 H21 L20 14 H12 Z" fill="#FFF1B8" opacity="0.7" />
      <text x="16" y="19.6" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="5" fill="#3a2a08">
        999.9
      </text>
    </svg>
  );
}

function Euro({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <circle cx="16" cy="16" r="16" fill="#003399" />
      <text x="16.5" y="22.5" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="19" fill="#FFCC00">
        €
      </text>
    </svg>
  );
}

export default function FeedIcon({ base, size = 36, className = '' }: { base: string; size?: number; className?: string }) {
  const key = base.toUpperCase();
  const [broken, setBroken] = useState(false);

  let inner: React.ReactNode;
  if (key === 'BTC') inner = <Bitcoin size={size} />;
  else if (key === 'XAU') inner = <Gold size={size} />;
  else if (key === 'EUR') inner = <Euro size={size} />;
  else if (LOCAL_FILES[key]) {
    // eslint-disable-next-line @next/next/no-img-element
    inner = <img src={LOCAL_FILES[key]} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" />;
  } else if (!broken && !CRYPTO.has(key) && /^[A-Z.]{1,6}$/.test(key)) {
    inner = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://assets.parqet.com/logos/symbol/${key}?format=png&size=${size * 2}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-[28%] bg-white object-cover ring-1 ring-black/5"
      />
    );
  } else inner = <LetterTile base={key} size={size} />;

  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }} title={instrumentName(key)}>
      {inner}
    </span>
  );
}
