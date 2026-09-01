'use client';

/**
 * Wspolny jezyk wizualny podstron $SPHERE (redesign 2026-08-31).
 *
 * Overview ustawil ton: hero z poswiata, WIELKIE tykajace liczby, kafle
 * zamiast tabelek, zero akapitow. Te klocki niosa ten ton na wszystkie
 * podstrony, zeby kazda wygladala jak ta sama aplikacja.
 *
 * Zasada tresci: dlugie objasnienia mieszkaja na /about. Tutaj co najwyzej
 * JEDNA linijka podpisu pod naglowkiem.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight, Copy, ExternalLink } from 'lucide-react';
import { SPHERE_EXPLORER_URL } from './sphereChain';
import NumberTicker from './NumberTicker';

/** Naglowek podstrony z poswiata - odpowiednik hero z Overview, nizszy. */
export function PageHero({
  title,
  tagline,
  badge,
  icon,
  children,
}: {
  title: string;
  tagline?: string;
  badge?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="sph-hero rounded-[24px] border border-sp-shade/10 p-5 sm:p-6">
      <div className="sph-orb left-[-50px] top-[-70px] h-44 w-44 bg-sp-brand/35" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-soft-display text-[24px] font-extrabold leading-tight text-sp-ink sm:text-[28px]">
              {icon}
              {title}
            </h2>
            {tagline && <p className="mt-1 text-[12px] font-bold text-sp-shade/55">{tagline}</p>}
          </div>
          {badge}
        </div>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </section>
  );
}

/** Wielka liczba - glowny nosnik informacji na podstronach. */
export function BigStat({
  label,
  value,
  decimals = 4,
  suffix,
  tone = 'ink',
  hint,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  suffix?: string;
  tone?: 'ink' | 'brand' | 'up' | 'down';
  hint?: string;
}) {
  const toneClass =
    tone === 'brand' ? 'text-sp-brand' : tone === 'up' ? 'text-sp-up' : tone === 'down' ? 'text-sp-down' : 'text-sp-ink';
  return (
    <div className="rounded-2xl bg-white/70 p-3.5 backdrop-blur-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/50">{label}</p>
      <p className={`mt-1 font-soft-display text-[24px] font-extrabold leading-none sm:text-[27px] ${toneClass}`}>
        {value === null ? (
          <span className="sph-skeleton inline-block h-6 w-20 align-middle" />
        ) : (
          <>
            <NumberTicker value={value} decimals={decimals} />
            {suffix && <span className="ml-1 text-[12px] font-bold text-sp-shade/50">{suffix}</span>}
          </>
        )}
      </p>
      {hint && <p className="mt-0.5 text-[10px] font-bold text-sp-shade/40">{hint}</p>}
    </div>
  );
}

/** Karta akcji: co robi + kto moze + przycisk. Zastepuje sciany tekstu. */
export function ActionCard({
  title,
  hint,
  badge,
  disabledNote,
  children,
}: {
  title: string;
  hint: string;
  badge?: ReactNode;
  disabledNote?: string;
  children?: ReactNode;
}) {
  return (
    <div className="sph-card flex flex-col justify-between gap-3 rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-extrabold text-sp-ink">
          {title} {badge}
        </p>
        <p className="mt-1 text-[11px] font-bold leading-relaxed text-sp-shade/50">{hint}</p>
      </div>
      {disabledNote ? (
        <p className="rounded-xl bg-sp-shade/5 px-3 py-2 text-[11px] font-bold text-sp-shade/45">{disabledNote}</p>
      ) : (
        <div className="flex flex-wrap gap-2">{children}</div>
      )}
    </div>
  );
}

/** Adres jako pastylka z linkiem do eksploratora i kopiowaniem. */
export function AddressPill({ address, label }: { address: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sp-shade/5 px-2.5 py-1 font-mono text-[10.5px] font-bold text-sp-shade/60">
      <span className="font-sans font-extrabold uppercase tracking-[0.06em] text-sp-shade/40">{label}</span>
      {address.slice(0, 6)}…{address.slice(-4)}
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(address)}
        aria-label={`Copy ${label} address`}
        className="text-sp-shade/40 transition-colors hover:text-sp-brand"
      >
        <Copy className="h-3 w-3" aria-hidden="true" />
      </button>
      <a
        href={`${SPHERE_EXPLORER_URL}/address/${address}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${label} in explorer`}
        className="text-sp-shade/40 transition-colors hover:text-sp-brand"
      >
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </span>
  );
}

/** Stopka podstrony: jedno zdanie + link do /about zamiast akapitow. */
export function LearnMore({ children }: { children: ReactNode }) {
  return (
    <Link
      href="/startpad/sphere/about"
      className="sph-card flex items-center justify-between gap-2 rounded-[20px] border border-dashed border-sp-shade/20 bg-sp-surface px-4 py-3 text-[11.5px] font-bold text-sp-shade/55 hover:text-sp-brand"
    >
      <span>{children}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** Sekcja "Advanced" - konsola ABI schowana pod klik. */
export function AdvancedSection({ children }: { children: ReactNode }) {
  return (
    <details className="group">
      <summary className="sph-card flex cursor-pointer list-none items-center justify-between rounded-[20px] border border-sp-shade/10 bg-sp-surface px-4 py-3 text-[12.5px] font-extrabold text-sp-shade/60 transition-colors hover:text-sp-brand [&::-webkit-details-marker]:hidden">
        Advanced - full contract console
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40 group-open:hidden">show</span>
        <span className="hidden text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40 group-open:inline">hide</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
