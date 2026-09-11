'use client';

import { useEffect, useState } from 'react';
import type { R } from './[market]/types';

/**
 * Drobne elementy UI wspolne dla tablicy rynkow i ekranu rynku.
 * Wydzielone z MarketDetail.tsx - te same klocki maja wygladac tak samo
 * na obu ekranach, a nie byc kopiowane z drobnymi roznicami.
 */

/** Zegar sekundowy. Zero do pierwszego efektu - inaczej SSR i klient sie roznia. */
export function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1_000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1_000)), 1_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ========================================================================== */
/*  DROBNE ELEMENTY UI                                                         */
/* ========================================================================== */

/** Odczyt, ktory sie nie powiodl. NIGDY nie podstawiamy w to miejsca zera. */
export function Unknown({ label = 'n/a' }: { label?: string }) {
  return (
    <span className="font-normal text-sp-ink-soft" title="This on-chain read failed - the value is unknown, not zero.">
      {label}
    </span>
  );
}

/**
 * Kwota USDC (6 miejsc) z dokladnoscia, przy ktorej TRZY UDZIALY DALEJ SUMUJA
 * SIE DO OPLATY. `fmtUsdc` tnie do centa, wiec 0,195 + 0,045 + 0,060 pokazywalo
 * sie jako $0.20 + $0.05 + $0.06 = $0.31 przy oplacie $0.30 - podzial, ktory
 * nie domyka sie na ekranie, czyta sie jak blad, nawet gdy liczby pod spodem
 * sa co do jednostki zgodne z `notifyFee`. Ponizej dolara dajemy wiec szesc
 * miejsc, tak samo jak `fmtSignedWad` robi to dla premii i fundingu.
 */
export function fmtUsdcFine(value: bigint): string {
  const n = Number(value) / 1e6;
  if (!Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: abs !== 0 && abs < 1 ? 6 : 2,
  })}`;
}

export function Val<T extends bigint | number | boolean>({ v, fmt }: { v: R<T>; fmt: (x: T) => string }) {
  if (v === null || v === undefined) return <Unknown />;
  return <>{fmt(v)}</>;
}

export function TickerCell({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-[92px] shrink-0 border-l border-sp-shade/10 px-3 first:border-l-0 first:pl-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-sp-ink-soft">{label}</p>
      <div className="text-sm font-bold tabular-nums text-sp-ink">{children}</div>
      {hint ? <p className="text-[10px] leading-tight text-sp-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <dt className="shrink-0 text-sp-ink-soft" title={hint}>
        {label}
      </dt>
      <dd className="min-w-0 text-right font-medium tabular-nums text-sp-ink">{children}</dd>
    </div>
  );
}


/** Kolor po znaku: dodatnie zielone, ujemne pomaranczowe, zero i brak neutralne. */
export function UpDown({ value, children, className = '' }: { value: bigint | number | null; children: React.ReactNode; className?: string }) {
  const tone = value === null ? 'text-sp-ink' : typeof value === 'bigint' ? (value > 0n ? 'text-sp-up' : value < 0n ? 'text-sp-down' : 'text-sp-ink') : value > 0 ? 'text-sp-up' : value < 0 ? 'text-sp-down' : 'text-sp-ink';
  return <span className={`${tone} ${className}`}>{children}</span>;
}

/** Kropka stanu: feed, siec, zdrowie. */
export function Dot({ tone, title }: { tone: 'up' | 'warn' | 'down' | 'muted'; title?: string }) {
  const cls = tone === 'up' ? 'bg-sp-up' : tone === 'warn' ? 'bg-amber-500' : tone === 'down' ? 'bg-sp-danger' : 'bg-sp-shade/30';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls}`} title={title} aria-label={title} />;
}
