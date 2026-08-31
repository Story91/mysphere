'use client';

/**
 * Wspolna rama stron /startpad/sphere/* - naglowek, zakladki podstron,
 * baner stanu pre-launch. Konwencje wizualne 1:1 z LaunchpadBoard
 * (karty rounded-[20px], tokeny sp-*, pastylka sieci).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Flame, ShieldCheck, Users } from 'lucide-react';
import { SPHERE_LIVE, SPHERE_TOKEN_ADDRESS } from './sphereConfig';
import './sphere-motion.css';

const TABS = [
  { href: '/startpad/sphere', label: 'Overview' },
  { href: '/startpad/sphere/season', label: 'Season' },
  { href: '/startpad/sphere/escrow', label: 'Escrow' },
  { href: '/startpad/sphere/rewards', label: 'Rewards' },
  { href: '/startpad/sphere/vesting', label: 'Vesting' },
  { href: '/startpad/sphere/about', label: 'About' },
] as const;

/**
 * Dwuklasowe plakietki uczciwosci (spec sekcja 5): tylko to, co wymusza
 * lancuch, dostaje jezyk gwarancji. Uzywane przez wszystkie podstrony.
 */
export function EnforcedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sp-up-soft px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-sp-up">
      <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Enforced by contract
    </span>
  );
}

export function TeamRunBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sp-shade/10 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/60">
      <Users className="h-3 w-3" aria-hidden="true" /> Team-run, on-chain
    </span>
  );
}

export default function SphereShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="sphere-shell mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/startpad"
            className="inline-flex items-center gap-1.5 rounded-full border border-sp-shade/15 px-3 py-1.5 text-[11.5px] font-extrabold text-sp-shade/70 transition-colors hover:border-sp-brand hover:text-sp-brand"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Startpad
          </Link>
          <h1 className="flex items-center gap-2 font-soft-display text-[22px] font-extrabold text-sp-ink">
            <Flame className="sph-flame h-5 w-5 text-sp-brand" aria-hidden="true" /> $SPHERE
          </h1>
        </div>
        <nav className="inline-flex items-stretch overflow-hidden rounded-full border border-sp-shade/10 bg-sp-surface">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-active={active}
                className={`sph-tab isolate px-3.5 py-2 text-[12px] font-extrabold ${active ? 'text-sp-brand' : 'text-sp-shade/60 hover:text-sp-brand'}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {!SPHERE_LIVE && (
        <div className="mb-4 rounded-[20px] border border-sp-brand/30 bg-sp-brand-soft p-4">
          <p className="text-[13px] font-extrabold text-sp-ink">Pre-launch</p>
          <p className="mt-1 text-[12px] leading-relaxed text-sp-shade/70">
            SPHERE contracts are written, tested (46 tests incl. a full rehearsal on a Base
            mainnet fork) and awaiting deployment. This page switches to live management the
            moment addresses land in the config - nothing here is live yet.
          </p>
        </div>
      )}

      {/* Stan posredni: peryferia wdrozone, token jeszcze przed launch(). */}
      {SPHERE_LIVE && !SPHERE_TOKEN_ADDRESS && (
        <div className="mb-4 rounded-[20px] border border-sp-brand/30 bg-sp-brand-soft p-4">
          <p className="text-[13px] font-extrabold text-sp-ink">Contracts live · token not launched yet</p>
          <p className="mt-1 text-[12px] leading-relaxed text-sp-shade/70">
            The SPHERE peripheral contracts (escrow, rewards, vesting) are deployed on Base
            mainnet and fully manageable below. The SPHERE token itself has not launched yet -
            token balances and token actions stay dormant until launch() fires.
          </p>
        </div>
      )}

      <div className="sph-stagger">{children}</div>
    </div>
  );
}
