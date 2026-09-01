'use client';

/**
 * OVERVIEW = action hub (decyzja wlasciciela 2026-08-31: "jedna strona
 * z tekstem, reszta z dzialaniem"). Zero akapitow - hero, trzy wielkie
 * tykajace liczby i kafle akcji. Cale objasnienia mieszkaja w /about.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { ArrowRight, BookOpen, Coins, Flame, Landmark, Timer, Trophy } from 'lucide-react';
import { launchpadAbi } from '../config';
import { SPHERE_CHAIN, SPHERE_LAUNCHPAD_ADDRESS, SPHERE_NATIVE_SYMBOL } from './sphereChain';
import NumberTicker from './NumberTicker';
import {
  SPHERE_ESCROW_ADDRESS,
  SPHERE_LIVE,
  SPHERE_REWARDS_ADDRESS,
  SPHERE_TOKEN_ADDRESS,
} from './sphereConfig';

const FUTURE_TOKEN = '0xB200000000000000000000BA5eDb84c678432476';

function HeroStat({ icon, label, value, decimals, suffix }: { icon: React.ReactNode; label: string; value: number; decimals?: number; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3.5 backdrop-blur-sm sm:p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/50">
        {icon} {label}
      </p>
      <p className="mt-1 font-soft-display text-[26px] font-extrabold leading-none text-sp-ink sm:text-[30px]">
        <NumberTicker value={value} decimals={decimals ?? 0} />
        {suffix && <span className="ml-1 text-[13px] font-bold text-sp-shade/50">{suffix}</span>}
      </p>
    </div>
  );
}

function ActionTile({ href, icon, title, hint }: { href: string; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="sph-card group flex items-center justify-between gap-3 rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sp-brand/10 text-sp-brand">{icon}</span>
        <span>
          <span className="block text-[14px] font-extrabold text-sp-ink">{title}</span>
          <span className="block text-[11px] font-bold text-sp-shade/50">{hint}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-sp-shade/30 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-sp-brand" aria-hidden="true" />
    </Link>
  );
}

/**
 * Minimalne ABI ERC-20 do dwoch odczytow: burn (saldo 0xdEaD) i saldo
 * podlaczonego portfela. Token B20 nie ma wlasnego artefaktu w repo.
 */
const erc20ReadsAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;
const DEAD = '0x000000000000000000000000000000000000dEaD' as Address;

export default function SphereOverview() {
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const { address: account } = useAccount();
  const [claimables, setClaimables] = useState<{ rewards: bigint; escrow: bigint } | null>(null);
  const [weekProgress, setWeekProgress] = useState<number | null>(null);
  const [burned, setBurned] = useState<bigint | null>(null);
  const [myBalance, setMyBalance] = useState<bigint | null>(null);

  useEffect(() => {
    const rewardsAddr = SPHERE_REWARDS_ADDRESS;
    const escrowAddr = SPHERE_ESCROW_ADDRESS;
    if (!SPHERE_LIVE || !readClient || !rewardsAddr || !escrowAddr) return;
    let alive = true;
    const load = async () => {
      try {
        const [r, e] = await Promise.all([
          readClient.readContract({ address: SPHERE_LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [rewardsAddr] }),
          readClient.readContract({ address: SPHERE_LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [escrowAddr] }),
        ]);
        if (alive) setClaimables({ rewards: r as bigint, escrow: e as bigint });
      } catch {
        /* odczyt wroci przy nastepnym interwale */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [readClient]);

  // Zywy burn + saldo uzytkownika. Przed graduacja burn to fizycznie 0 (palenie
  // rusza z hookiem po graduacji), ale liczba jest CZYTANA, nie wpisana - ta
  // sama zasada co wszedzie: zero recznych statystyk.
  useEffect(() => {
    const token = SPHERE_TOKEN_ADDRESS;
    if (!readClient || !token) return;
    let alive = true;
    const load = async () => {
      try {
        const [b, mine] = await Promise.all([
          readClient.readContract({ address: token, abi: erc20ReadsAbi, functionName: 'balanceOf', args: [DEAD] }),
          account
            ? readClient.readContract({ address: token, abi: erc20ReadsAbi, functionName: 'balanceOf', args: [account] })
            : Promise.resolve(null),
        ]);
        if (alive) {
          setBurned(b as bigint);
          setMyBalance(mine as bigint | null);
        }
      } catch {
        /* nastepny interwal */
      }
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [readClient, account]);

  useEffect(() => {
    let alive = true;
    fetch('/api/sphere/season')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.epoch) setWeekProgress(d.epoch.progressBps / 100);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const feesWaiting = claimables ? Number(formatEther(claimables.rewards + claimables.escrow)) : 0;

  return (
    <div className="sph-stagger grid gap-4">
      {/* HERO ---------------------------------------------------------------- */}
      <section className="sph-hero rounded-[24px] border border-sp-shade/10 p-5 sm:p-7">
        <div className="sph-orb left-[-40px] top-[-60px] h-48 w-48 bg-sp-brand/40" aria-hidden="true" />
        <div className="sph-orb bottom-[-70px] right-[-30px] h-56 w-56 bg-sp-up/30 [animation-delay:-7s]" aria-hidden="true" />

        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-soft-display text-[30px] font-extrabold leading-tight text-sp-ink sm:text-[38px]">
                The launchpad&apos;s own token.
                <span className="block bg-gradient-to-r from-sp-brand to-sp-up bg-clip-text text-transparent">
                  Burns itself. Pays its creators.
                </span>
              </h2>
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 font-mono text-[11px] font-bold text-sp-shade/60 backdrop-blur-sm">
                {SPHERE_TOKEN_ADDRESS ? SPHERE_TOKEN_ADDRESS : `${FUTURE_TOKEN.slice(0, 10)}…${FUTURE_TOKEN.slice(-8)}`}
                <span className="rounded-full bg-sp-brand/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-sp-brand">
                  {SPHERE_TOKEN_ADDRESS ? 'live' : 'address locked · launch soon'}
                </span>
              </p>
            </div>
            <Flame className="sph-flame hidden h-16 w-16 text-sp-brand/70 sm:block" aria-hidden="true" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <HeroStat icon={<Flame className="h-3.5 w-3.5 text-sp-down" aria-hidden="true" />} label="Burned forever" value={burned !== null ? Number(formatEther(burned)) : 0} suffix="SPHERE" />
            <HeroStat icon={<Coins className="h-3.5 w-3.5 text-sp-up" aria-hidden="true" />} label="Fees waiting" value={feesWaiting} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} />
            <HeroStat icon={<Timer className="h-3.5 w-3.5 text-sp-brand" aria-hidden="true" />} label="Week progress" value={weekProgress ?? 0} decimals={1} suffix="%" />
          </div>

          {/* KUP / TWOJE SALDO - jedyne CTA, ktorego szuka zwykly gosc. */}
          {SPHERE_TOKEN_ADDRESS && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href={`/startpad/${SPHERE_TOKEN_ADDRESS}?c=${SPHERE_CHAIN.id}`}
                className="inline-flex items-center gap-2 rounded-full bg-sp-brand px-5 py-2.5 text-[13px] font-extrabold text-sp-on-brand transition-transform hover:scale-[1.03]"
              >
                Buy $SPHERE <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {myBalance !== null && (
                <span className="rounded-full bg-white/70 px-4 py-2 text-[12px] font-extrabold text-sp-shade/70 backdrop-blur-sm">
                  You hold {Number(formatEther(myBalance)).toLocaleString('en-US', { maximumFractionDigits: 0 })} SPHERE
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* AKCJE --------------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionTile href="/startpad/sphere/season" icon={<Trophy className="h-5 w-5" aria-hidden="true" />} title="Season" hint="Weekly creator leaderboard · live" />
        <ActionTile href="/startpad/sphere/escrow" icon={<Landmark className="h-5 w-5" aria-hidden="true" />} title="Escrow" hint="Creator stream · release splits" />
        <ActionTile href="/startpad/sphere/rewards" icon={<Coins className="h-5 w-5" aria-hidden="true" />} title="Rewards vault" hint="Fee inflows · pull to treasury" />
        <ActionTile href="/startpad/sphere/vesting" icon={<Timer className="h-5 w-5" aria-hidden="true" />} title="Vesting" hint="Treasury lock · 30d cliff / 12m" />
      </div>

      <Link
        href="/startpad/sphere/about"
        className="sph-card flex items-center justify-center gap-2 rounded-[20px] border border-dashed border-sp-shade/20 bg-sp-surface p-3.5 text-[12.5px] font-extrabold text-sp-shade/60 hover:text-sp-brand"
      >
        <BookOpen className="h-4 w-4" aria-hidden="true" /> How it works - tokenomics, fee flows & the honest fine print
      </Link>
    </div>
  );
}
