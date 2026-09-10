'use client';

/**
 * OVERVIEW = action hub (decyzja wlasciciela 2026-08-31: "jedna strona
 * z tekstem, reszta z dzialaniem"). Zero akapitow - hero, trzy wielkie
 * tykajace liczby i kafle akcji. Cale objasnienia mieszkaja w /about.
 *
 * Rozszerzenie 2026-09-10 (wymog wlasciciela: "tam musza byc dokladne liczby
 * wszedzie i staty, to jest angazujace"): hub odpowiada liczbami na cztery
 * pytania, ktorych wczesniej nie dalo sie tu zadac - gdzie SPHERE jest w
 * cyklu zycia, ile i CZYM spalono, co robi dystrybutor i kto stoi za piecioma
 * rolami. Kazda liczba idzie z lancucha (useSphereChainFacts), zadna nie jest
 * wpisana recznie.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatEther, type Address } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import {
  ArrowRight,
  BookOpen,
  Coins,
  Copy,
  Flame,
  GraduationCap,
  Landmark,
  Timer,
  Trophy,
  Waves,
} from 'lucide-react';
import { launchpadAbi } from '../config';
import { SPHERE_CHAIN, SPHERE_EXPLORER_URL, SPHERE_LAUNCHPAD_ADDRESS, SPHERE_NATIVE_SYMBOL, SPHERE_VAULT_ADDRESS } from './sphereChain';
import NumberTicker from './NumberTicker';
import { formatIn, formatUtc, useSphereChainFacts, type SphereChainFacts } from './SphereShell';
import { AddressPill, BigStat, PageHero } from './SphereUI';
import {
  SPHERE_ESCROW_ADDRESS,
  SPHERE_LIVE,
  SPHERE_REWARDS_ADDRESS,
  SPHERE_TOKEN_ADDRESS,
} from './sphereConfig';

const FUTURE_TOKEN = '0xB200000000000000000000BA5eDb84c678432476';

/**
 * Kafelek hero. `value === null` znaczy "jeszcze nie wiem" i rysuje szkielet -
 * tak samo jak `BigStat`.
 *
 * Wczesniej typ nie dopuszczal `null`, wiec wywolania podstawialy `?? 0` i
 * strona przez pierwsze sekundy pokazywala TWARDE ZERA: "Burned forever 0",
 * "Week progress 0.0%". To nie jest stan ladowania, tylko pewna, falszywa
 * liczba - a odczyt sezonu potrafi isc kilka sekund, bo skanuje lancuch.
 */
function HeroStat({ icon, label, value, decimals, suffix }: { icon: React.ReactNode; label: string; value: number | null; decimals?: number; suffix?: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3.5 backdrop-blur-sm sm:p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/50">
        {icon} {label}
      </p>
      <p className="mt-1 font-soft-display text-[26px] font-extrabold leading-none text-sp-ink sm:text-[30px]">
        {value === null ? (
          <span className="sph-skeleton inline-block h-6 w-24 align-middle" />
        ) : (
          <>
            <NumberTicker value={value} decimals={decimals ?? 0} />
            {suffix && <span className="ml-1 text-[13px] font-bold text-sp-shade/50">{suffix}</span>}
          </>
        )}
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
 * AddressPill nie nadaje sie do poolId: to bytes32, nie adres, wiec link
 * /address/<poolId> prowadzilby donikad. Ta sama forma wizualnie, bez linku.
 */
function HashPill({ label, hash }: { label: string; hash: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-sp-shade/5 px-2.5 py-1 font-mono text-[10.5px] font-bold text-sp-shade/60">
      <span className="font-sans font-extrabold uppercase tracking-[0.06em] text-sp-shade/40">{label}</span>
      <span className="truncate">
        {hash.slice(0, 10)}…{hash.slice(-8)}
      </span>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(hash)}
        aria-label={`Copy ${label}`}
        className="shrink-0 text-sp-shade/40 transition-colors hover:text-sp-brand"
      >
        <Copy className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/** Jedna linijka faktu: etykieta z lewej, wartosc z prawej. Czytelna na telefonie. */
function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-sp-shade/[0.07] py-2 first:border-t-0 first:pt-0">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/40">{label}</span>
      <span className="text-right text-[11.5px] font-bold text-sp-shade/70">{children}</span>
    </div>
  );
}

function StagePill({ stage }: { stage: string }) {
  const graduated = stage === 'Graduated';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] ${
        graduated ? 'bg-sp-up-soft text-sp-up' : 'bg-sp-brand/10 text-sp-brand'
      }`}
    >
      {graduated && <GraduationCap className="h-3 w-3" aria-hidden="true" />} {stage}
    </span>
  );
}

const toNum = (v: bigint | null | undefined): number | null => (v === null || v === undefined ? null : Number(formatEther(v)));

/**
 * Minimalne ABI ERC-20 do dwoch odczytow: burn (saldo 0xdEaD) i saldo
 * podlaczonego portfela. Token B20 nie ma wlasnego artefaktu w repo.
 */
const erc20ReadsAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;
const DEAD = '0x000000000000000000000000000000000000dEaD' as Address;

/* -------------------------------------------------------------------------- */
/*  SEKCJE STATYSTYK                                                           */
/* -------------------------------------------------------------------------- */

/** Gdzie SPHERE jest TERAZ + co realnie kosztuje wymiana po graduacji. */
function LifecycleSection({ facts }: { facts: SphereChainFacts }) {
  const pool = facts.pool;
  // Koszt wymiany to DWIE oplaty na jednej transakcji: fee puli v4 (uint24
  // w setnych bipa) i fee hooka (bps). Sumujemy tu, bo gosc placi obie naraz
  // i nigdzie indziej nie widzi ich razem.
  const poolPct = pool ? pool.poolFeePpm / 10_000 : null;
  const hookPct = pool ? pool.hookFeeBps / 100 : null;
  return (
    <PageHero
      title="Where SPHERE is right now"
      tagline={
        facts.stage === 'Graduated'
          ? 'The bonding curve is closed for good - trading happens in a Uniswap v4 pool'
          : 'Straight from the launchpad, no interpretation'
      }
      icon={<GraduationCap className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
      badge={<StagePill stage={facts.stage} />}
    >
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        <BigStat label="Pool fee" value={poolPct} decimals={2} suffix="%" hint="paid to liquidity" />
        <BigStat label="Hook fee" value={hookPct} decimals={2} suffix="%" hint="splits protocol / creator / burn" />
        <BigStat
          label="You pay per swap"
          value={poolPct !== null && hookPct !== null ? poolPct + hookPct : null}
          decimals={2}
          suffix="%"
          tone="brand"
          hint="both legs together"
        />
      </div>

      <div className="mt-4 rounded-2xl bg-white/70 p-3.5 backdrop-blur-sm">
        <FactRow label="Launched">{facts.startedAt ? formatUtc(facts.startedAt) : '-'}</FactRow>
        {pool && (
          <>
            <FactRow label="Pool id">
              <HashPill label="v4" hash={pool.poolId} />
            </FactRow>
            <FactRow label="LP range">
              full range · ticks {pool.tickLower.toLocaleString('en-US')} → {pool.tickUpper.toLocaleString('en-US')}
            </FactRow>
            <FactRow label="LP liquidity">{pool.liquidity.toString()}</FactRow>
            <FactRow label="LP custody">
              locked in the LiquidityVault - it can seed and harvest fees, it has no function that
              removes liquidity
            </FactRow>
          </>
        )}
      </div>
      {SPHERE_VAULT_ADDRESS && (
        <div className="mt-3 flex flex-wrap gap-2">
          <AddressPill address={SPHERE_VAULT_ADDRESS} label="LP vault" />
        </div>
      )}
    </PageHero>
  );
}

/** Spalone, ROZBITE NA ZRODLA - "ile" bez "skad" nic nie mowi. */
function BurnSection({ facts }: { facts: SphereChainFacts }) {
  const burn = facts.burn;
  const pending = facts.hookPending;
  const share = burn && burn.supply > 0n ? (Number(burn.dead) / Number(burn.supply)) * 100 : null;
  return (
    <PageHero
      title="Burned forever"
      tagline="Every token at 0xdEaD, split by where it came from"
      icon={<Flame className="h-6 w-6 text-sp-down" aria-hidden="true" />}
      badge={
        share !== null ? (
          <span className="rounded-full bg-sp-down/10 px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-down">
            {share.toFixed(2)}% of supply
          </span>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BigStat label="At 0xdEaD" value={toNum(burn?.dead)} decimals={0} suffix="SPHERE" tone="down" hint="verifiable balance" />
        <BigStat label="Bought & burned" value={toNum(burn?.fromHookBuyback)} decimals={0} suffix="SPHERE" hint="hook swap-fee buyback" />
        <BigStat label="Revenue buyback" value={toNum(burn?.fromRevenueBuyback)} decimals={0} suffix="SPHERE" hint="SphereBuyback burn leg" />
        <BigStat label="Graduation seed" value={toNum(burn?.fromGraduationSeed)} decimals={0} suffix="SPHERE" hint="leftover, never bought" />
      </div>
      <div className="mt-4 rounded-2xl bg-white/70 p-3.5 backdrop-blur-sm">
        <FactRow label="How the burn fires">
          not automatic - anyone calls hook.settle(SPHERE) to book the fees, then
          hook.executeBuyback(...) to spend the pot; the bought tokens can only go to 0xdEaD
        </FactRow>
        {pending && (
          <>
            <FactRow label="Buyback pot waiting">
              {Number(formatEther(pending.buybackEth)).toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
              {SPHERE_NATIVE_SYMBOL}
            </FactRow>
            <FactRow label="Unsettled fees">
              {Number(formatEther(pending.eth)).toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
              {SPHERE_NATIVE_SYMBOL} ·{' '}
              {Number(formatEther(pending.token)).toLocaleString('en-US', { maximumFractionDigits: 2 })} SPHERE
            </FactRow>
          </>
        )}
        <FactRow label="Total supply">
          {burn ? Number(formatEther(burn.supply)).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-'} SPHERE ·
          burns are transfers, supply never moves
        </FactRow>
      </div>
    </PageHero>
  );
}

/** Dystrybutor: aktywna epoka, co juz wyplacono i co czeka w kolejce. */
function DistributorSection({ facts }: { facts: SphereChainFacts }) {
  const d = facts.distributor;
  if (!d) return null;
  const outstanding = d.totalCumulative > d.totalClaimed ? d.totalCumulative - d.totalClaimed : 0n;
  return (
    <PageHero
      title="Creator reward stream"
      tagline="Live figures from the streaming distributor - deployed, funded and paying"
      icon={<Waves className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
      badge={
        <span className="rounded-full bg-sp-up-soft px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-up">
          epoch #{d.epochId} active
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BigStat label="Owed to date" value={toNum(d.totalCumulative)} decimals={2} suffix="SPHERE" tone="brand" hint="cumulative, all epochs" />
        <BigStat label="Claimed" value={toNum(d.totalClaimed)} decimals={2} suffix="SPHERE" tone="up" hint="already paid out" />
        <BigStat label="Still claimable" value={toNum(outstanding)} decimals={2} suffix="SPHERE" hint="earned, not yet taken" />
        <BigStat label="Held by contract" value={toNum(d.held)} decimals={0} suffix="SPHERE" hint="funds future epochs" />
      </div>
      <div className="mt-4 rounded-2xl bg-white/70 p-3.5 backdrop-blur-sm">
        <FactRow label="Active root since">{formatUtc(d.activatedAt)}</FactRow>
        <FactRow label="Stream length">
          {(d.streamDuration / 86_400).toFixed(0)} days of linear release per epoch increment
        </FactRow>
        <FactRow label="Veto window">{(d.minDelay / 3_600).toFixed(0)} h before any new root can activate</FactRow>
        {d.pending ? (
          <>
            <FactRow label="Pending root">
              epoch #{d.pending.epochId} ·{' '}
              {Number(formatEther(d.pending.totalCumulative)).toLocaleString('en-US', { maximumFractionDigits: 2 })} SPHERE
              cumulative
            </FactRow>
            <FactRow label="Activates">
              {formatUtc(d.pending.validAt)} · {formatIn(d.pending.validAt)}
            </FactRow>
          </>
        ) : (
          <FactRow label="Pending root">nothing queued right now</FactRow>
        )}
      </div>
    </PageHero>
  );
}

/**
 * Piec etykiet, jeden adres. Kazdy panel podpisuje ten Safe inaczej
 * ("key holder", "buyback pot", "beneficiary"...), przez co strona czytala
 * sie jak pieciu niezaleznych uczestnikow. To jest wymog przejrzystosci,
 * nie ozdobnik - dlatego role sa ODCZYTANE z kontraktow i porownane, a nie
 * opisane z pamieci.
 */
function SafeSection({ facts }: { facts: SphereChainFacts }) {
  const r = facts.roles;
  const rows = (
    [
      ['Protocol fee recipient', r.feeRecipient],
      ['Buyback pot (escrow)', r.buybackPot],
      ['Ops target (escrow)', r.opsTarget],
      ['Rewards key holder', r.consumer],
      ['Vesting beneficiary', r.beneficiary],
    ] as [string, Address | null][]
  ).filter((row): row is [string, Address] => row[1] !== null);
  // Nieodczytane role = brak sekcji. Lista pieciu "not readable" wygladalaby
  // jak stwierdzenie o protokole, a jest tylko awaria odczytu.
  if (rows.length === 0) return null;
  return (
    <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-extrabold text-sp-ink">
          {r.allSame ? 'Five role labels, one address' : 'Who holds which role'}
        </h3>
        {r.shared && <AddressPill address={r.shared} label="safe" />}
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-sp-shade/60">
        {r.allSame
          ? 'Every role below resolves to the same 1/1 Safe - one signer, one key. The labels differ because the contracts name them differently, not because there are five independent parties.'
          : 'Read live from each contract. Roles are immutable, so what you see here is what the contracts will always answer.'}
      </p>
      <div className="mt-3">
        {rows.map(([label, addr]) => (
          <FactRow key={label} label={label}>
            <a
              href={`${SPHERE_EXPLORER_URL}/address/${addr}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] font-bold text-sp-brand hover:underline"
            >
              {addr.slice(0, 8)}…{addr.slice(-6)}
            </a>
          </FactRow>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default function SphereOverview() {
  const readClient = usePublicClient({ chainId: SPHERE_CHAIN.id });
  const { address: account } = useAccount();
  const [claimables, setClaimables] = useState<{ rewards: bigint; escrow: bigint } | null>(null);
  const [weekProgress, setWeekProgress] = useState<number | null>(null);
  const [burned, setBurned] = useState<bigint | null>(null);
  const [myBalance, setMyBalance] = useState<bigint | null>(null);
  const facts = useSphereChainFacts();

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

  // Zywy burn + saldo uzytkownika. Burn czytamy tu OSOBNO (a nie z faktow),
  // bo hero ma tykac od razu, zanim dojedzie duzy multicall sekcji nizej.
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

  // `null` az do pierwszego udanego odczytu - zero znaczyloby "sprawdzone, nic nie ma".
  const feesWaiting = claimables ? Number(formatEther(claimables.rewards + claimables.escrow)) : null;
  const hookBurned = facts?.burn ? Number(formatEther(facts.burn.fromHookBuyback)) : null;
  const potWaiting = facts?.hookPending ? Number(formatEther(facts.hookPending.buybackEth)) : null;

  return (
    <div className="sph-stagger grid gap-4">
      {/* HERO ---------------------------------------------------------------- */}
      <section className="sph-hero rounded-[24px] border border-sp-shade/10 p-5 sm:p-7">
        <div className="sph-orb left-[-40px] top-[-60px] h-48 w-48 bg-sp-brand/40" aria-hidden="true" />
        <div className="sph-orb bottom-[-70px] right-[-30px] h-56 w-56 bg-sp-up/30 [animation-delay:-7s]" aria-hidden="true" />

        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {/* "Burns itself" bylo nieprawda o mechanice, nie o skali: nic nie
                  pali sie samo, ktos musi zaplacic gaz za settle() i
                  executeBuyback(). Naglowek mowi teraz to, co robi kontrakt,
                  a liczba pod spodem broni skali - 14,5 mln SPHERE naprawde
                  kupiono i spalono, wiec nie schodzimy tez ponizej prawdy. */}
              <h2 className="font-soft-display text-[30px] font-extrabold leading-tight text-sp-ink sm:text-[38px]">
                The launchpad&apos;s own token.
                <span className="block bg-gradient-to-r from-sp-brand to-sp-up bg-clip-text text-transparent">
                  Its fees buy it back. Anyone can fire the burn.
                </span>
              </h2>
              <p className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-full bg-white/70 px-3 py-1 font-mono text-[11px] font-bold text-sp-shade/60 backdrop-blur-sm">
                {SPHERE_TOKEN_ADDRESS ? SPHERE_TOKEN_ADDRESS : `${FUTURE_TOKEN.slice(0, 10)}…${FUTURE_TOKEN.slice(-8)}`}
                <span className="rounded-full bg-sp-brand/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-sp-brand">
                  {SPHERE_TOKEN_ADDRESS ? 'live' : 'address locked · launch soon'}
                </span>
                {facts && <StagePill stage={facts.stage} />}
              </p>
              {hookBurned !== null && (
                <p className="mt-2 max-w-2xl text-[12px] font-bold leading-relaxed text-sp-shade/55">
                  Swap fees pile up inside the hook until someone calls settle(), then
                  executeBuyback() - which buys SPHERE and can only send it to 0xdEaD.{' '}
                  <span className="text-sp-ink">
                    {hookBurned.toLocaleString('en-US', { maximumFractionDigits: 0 })} SPHERE
                  </span>{' '}
                  has been bought and burned that way so far
                  {potWaiting !== null && (
                    <>
                      , with{' '}
                      <span className="text-sp-ink">
                        {potWaiting.toLocaleString('en-US', { maximumFractionDigits: 6 })} {SPHERE_NATIVE_SYMBOL}
                      </span>{' '}
                      waiting in the pot right now
                    </>
                  )}
                  .
                </p>
              )}
            </div>
            <Flame className="sph-flame hidden h-16 w-16 text-sp-brand/70 sm:block" aria-hidden="true" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <HeroStat icon={<Flame className="h-3.5 w-3.5 text-sp-down" aria-hidden="true" />} label="Burned forever" value={burned !== null ? Number(formatEther(burned)) : null} suffix="SPHERE" />
            <HeroStat icon={<Coins className="h-3.5 w-3.5 text-sp-up" aria-hidden="true" />} label="Fees waiting" value={feesWaiting} decimals={4} suffix={SPHERE_NATIVE_SYMBOL} />
            <HeroStat icon={<Timer className="h-3.5 w-3.5 text-sp-brand" aria-hidden="true" />} label="Epoch progress" value={weekProgress} decimals={1} suffix="%" />
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

      {/* STATY Z LANCUCHA ---------------------------------------------------- */}
      {facts && (
        <>
          <LifecycleSection facts={facts} />
          <BurnSection facts={facts} />
          <DistributorSection facts={facts} />
          <SafeSection facts={facts} />
        </>
      )}

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
