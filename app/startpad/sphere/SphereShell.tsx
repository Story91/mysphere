'use client';

/**
 * Wspolna rama stron /startpad/sphere/* - naglowek, zakladki podstron,
 * baner stanu pre-launch. Konwencje wizualne 1:1 z LaunchpadBoard
 * (karty rounded-card, tokeny sp-*, pastylka sieci).
 *
 * Od 2026-09-10 mieszka tu takze JEDNO zrodlo faktow lancuchowych huba
 * (useSphereChainFacts) - hub i /about mowia tymi samymi liczbami, bo
 * czytaja dokladnie ten sam multicall.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Flame, Hand, ShieldCheck, Users } from 'lucide-react';
import type { Address, ContractFunctionParameters } from 'viem';
import { LAUNCH_STATE } from '../config';
import { useSphereRead } from './sphereActions';
import {
  SPHERE_HOOK_ADDRESS,
  SPHERE_LAUNCHPAD_ADDRESS,
  SPHERE_VAULT_ADDRESS,
} from './sphereChain';
import {
  SPHERE_BUYBACK_ADDRESS,
  SPHERE_DISTRIBUTOR_ADDRESS,
  SPHERE_ESCROW_ADDRESS,
  SPHERE_LIVE,
  SPHERE_REWARDS_ADDRESS,
  SPHERE_TOKEN_ADDRESS,
  SPHERE_VESTING_ADDRESS,
} from './sphereConfig';
import './sphere-motion.css';

// Zakladka Buy prowadzi na strone handlu tokenem (?c=8453, zeby link wygrywal
// z zapamietana siecia goscia) i istnieje tylko po launchu.
const PRIMARY_TABS = [
  { href: '/startpad/sphere', label: 'Overview' },
  ...(SPHERE_TOKEN_ADDRESS ? [{ href: `/startpad/${SPHERE_TOKEN_ADDRESS}?c=8453`, label: 'Buy' }] : []),
  { href: '/startpad/sphere/season', label: 'Season' },
];

/**
 * Trzy podstrony skarbca i keeperow schowane pod jednym wpisem. Siedem rownych
 * zakladek nie miescilo sie na telefonie i kazalo goscowi zgadywac, ktora jest
 * dla niego; Escrow, Rewards i Vesting to narzedzia opiekunow, nie pierwszy ruch
 * kupujacego. Zadna trasa nie znika - zmienia sie tylko miejsce linku.
 */
const TREASURY_TABS = [
  { href: '/startpad/sphere/escrow', label: 'Escrow', hint: 'Creator stream, release splits' },
  { href: '/startpad/sphere/rewards', label: 'Rewards vault', hint: 'Fee inflows, pull to treasury' },
  { href: '/startpad/sphere/vesting', label: 'Vesting', hint: 'Treasury lock, 30d cliff / 12m' },
];

const ABOUT_TAB = { href: '/startpad/sphere/about', label: 'About' };

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
    <span className="inline-flex items-center gap-1 rounded-full bg-sp-shade/10 px-2 py-0.5 text-[12px] font-semibold text-sp-shade/60">
      <Users className="h-3 w-3" aria-hidden="true" /> Team-run, on-chain
    </span>
  );
}

/**
 * TRZECIA klasa, dopisana 2026-09-10. Dwie poprzednie nie opisywaly
 * najczestszego przypadku w tym protokole: regula jest zapieta w kontrakcie
 * (nikt jej nie zmieni), ale NIC nie dzieje sie samo - ktos musi zaplacic gaz
 * za wywolanie. Palenie SPHERE to dokladnie to, a strona nazywala je
 * "auto-burn". Wolanie moze zrobic kazdy, wiec to nie jest tez "team-run".
 */
export function KeeperTriggeredBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sp-brand-soft px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-sp-brand">
      <Hand className="h-3 w-3" aria-hidden="true" /> Anyone must call it
    </span>
  );
}

/* ========================================================================== */
/*  FAKTY Z LANCUCHA - jedno zrodlo dla huba i /about                          */
/* ========================================================================== */

/**
 * Wycinki ABI trzymane LOKALNIE, a nie dopisane do sphereConfig.ts: ten plik
 * edytuja rownolegle inne panele i nie chcemy kolizji, a przy multicallu maly
 * `as const` jest tez tanszy dla kompilatora niz pelne launchpadAbi/hookAbi
 * (te maja po sto pozycji i wysadzaja inferencje krotki). Sygnatury 1:1 ze
 * zrodlami: CurveLaunchpad.sol, LiquidityVault.sol, B20LaunchHook.sol,
 * sphere/SphereStreamingMerkleDistributor.sol, sphere/SphereBuyback.sol.
 */
const padFactsAbi = [
  {
    type: 'function',
    name: 'launchOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'ethReserve', type: 'uint256' },
      { name: 'tokenReserve', type: 'uint256' },
      { name: 'startedAt', type: 'uint40' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  { type: 'function', name: 'FEE_RECIPIENT', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const;

const vaultFactsAbi = [
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
    ],
  },
  {
    type: 'function',
    name: 'poolKeyOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
    ],
  },
] as const;

const hookFactsAbi = [
  { type: 'function', name: 'HOOK_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'buybackTokens', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'pendingEth', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'pendingToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'pendingBuybackEth', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const tokenFactsAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const distFactsAbi = [
  { type: 'function', name: 'epochId', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  { type: 'function', name: 'totalCumulative', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalClaimed', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'activatedAt', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  { type: 'function', name: 'STREAM_DURATION', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  { type: 'function', name: 'MIN_DELAY', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint64' }] },
  {
    type: 'function',
    name: 'pending',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'root', type: 'bytes32' },
      { name: 'manifestHash', type: 'bytes32' },
      { name: 'epochId', type: 'uint64' },
      { name: 'totalCumulative', type: 'uint256' },
      { name: 'validAt', type: 'uint64' },
    ],
  },
] as const;

const buybackFactsAbi = [
  { type: 'function', name: 'BURN_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'totalBurned', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalToDistributor', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalEthSpent', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

/** Cztery role, cztery kontrakty, ta sama sygnatura bezargumentowego gettera. */
const roleFactsAbi = [
  { type: 'function', name: 'BUYBACK_POT', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'OPS_TARGET', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'CONSUMER', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'BENEFICIARY', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const;

export const SPHERE_DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address;

export type SphereChainFacts = {
  /** Etap zycia tokena wprost z launchOf().state (None/Curve/Locked/Graduated). */
  stage: string;
  startedAt: number;
  /** Pula v4 - dopiero po graduacji ma sens (przed nia poolId to same zera). */
  pool: {
    poolId: `0x${string}`;
    liquidity: bigint;
    tickLower: number;
    tickUpper: number;
    /** uint24 w setnych bipa: 3000 = 0.30%. */
    poolFeePpm: number;
    hookFeeBps: number;
  } | null;
  burn: {
    dead: bigint;
    fromHookBuyback: bigint;
    fromRevenueBuyback: bigint;
    /** Reszta na 0xdEaD: nadwyzka ziarna graduacji, nie kupno z rynku. */
    fromGraduationSeed: bigint;
    supply: bigint;
  } | null;
  hookPending: { eth: bigint; token: bigint; buybackEth: bigint } | null;
  distributor: {
    epochId: number;
    totalCumulative: bigint;
    totalClaimed: bigint;
    activatedAt: number;
    streamDuration: number;
    minDelay: number;
    held: bigint;
    pending: { epochId: number; totalCumulative: bigint; validAt: number } | null;
  } | null;
  buyback: { burnBps: number; totalBurned: bigint; totalToDistributor: bigint; totalEthSpent: bigint } | null;
  /** Role, ktore kazdy panel podpisuje INNA etykieta - tu obok siebie. */
  roles: {
    feeRecipient: Address | null;
    buybackPot: Address | null;
    opsTarget: Address | null;
    consumer: Address | null;
    beneficiary: Address | null;
    /** Czy wszystkie odczytane role to jeden i ten sam adres. */
    allSame: boolean;
    shared: Address | null;
  };
};

type CallResult = { status: 'success'; result: unknown } | { status: 'failure'; error: unknown };

/**
 * Wszystkie fakty huba w JEDNYM multicallu. Powod jest praktyczny: bez
 * wlasnego endpointu strona stoi na publicznym RPC Base, ktory przy
 * kilkudziesieciu osobnych eth_call zaczyna oddawac bledy - a wtedy "dokladne
 * liczby wszedzie" zamieniaja sie w szkielety. Jedno zapytanie na 30 s.
 */
export function useSphereChainFacts(): SphereChainFacts | null {
  return useSphereRead(async (client) => {
    const token = SPHERE_TOKEN_ADDRESS;
    if (!token) return null;

    const calls: ContractFunctionParameters[] = [];
    const push = (call: ContractFunctionParameters) => {
      calls.push(call);
      return calls.length - 1;
    };

    const iLaunch = push({ address: SPHERE_LAUNCHPAD_ADDRESS as Address, abi: padFactsAbi, functionName: 'launchOf', args: [token] });
    const iFeeRecipient = push({ address: SPHERE_LAUNCHPAD_ADDRESS as Address, abi: padFactsAbi, functionName: 'FEE_RECIPIENT' });
    const iPosition = push({ address: SPHERE_VAULT_ADDRESS as Address, abi: vaultFactsAbi, functionName: 'positionOf', args: [token] });
    const iPoolKey = push({ address: SPHERE_VAULT_ADDRESS as Address, abi: vaultFactsAbi, functionName: 'poolKeyOf', args: [token] });
    const iHookFee = push({ address: SPHERE_HOOK_ADDRESS as Address, abi: hookFactsAbi, functionName: 'HOOK_FEE_BPS' });
    const iHookBurn = push({ address: SPHERE_HOOK_ADDRESS as Address, abi: hookFactsAbi, functionName: 'buybackTokens', args: [token] });
    const iPendEth = push({ address: SPHERE_HOOK_ADDRESS as Address, abi: hookFactsAbi, functionName: 'pendingEth', args: [token] });
    const iPendToken = push({ address: SPHERE_HOOK_ADDRESS as Address, abi: hookFactsAbi, functionName: 'pendingToken', args: [token] });
    const iPendBuyback = push({ address: SPHERE_HOOK_ADDRESS as Address, abi: hookFactsAbi, functionName: 'pendingBuybackEth', args: [token] });
    const iDead = push({ address: token, abi: tokenFactsAbi, functionName: 'balanceOf', args: [SPHERE_DEAD_ADDRESS] });
    const iSupply = push({ address: token, abi: tokenFactsAbi, functionName: 'totalSupply' });

    const dist = SPHERE_DISTRIBUTOR_ADDRESS;
    const iDistEpoch = dist ? push({ address: dist, abi: distFactsAbi, functionName: 'epochId' }) : -1;
    const iDistCum = dist ? push({ address: dist, abi: distFactsAbi, functionName: 'totalCumulative' }) : -1;
    const iDistClaimed = dist ? push({ address: dist, abi: distFactsAbi, functionName: 'totalClaimed' }) : -1;
    const iDistActive = dist ? push({ address: dist, abi: distFactsAbi, functionName: 'activatedAt' }) : -1;
    const iDistStream = dist ? push({ address: dist, abi: distFactsAbi, functionName: 'STREAM_DURATION' }) : -1;
    const iDistDelay = dist ? push({ address: dist, abi: distFactsAbi, functionName: 'MIN_DELAY' }) : -1;
    const iDistPending = dist ? push({ address: dist, abi: distFactsAbi, functionName: 'pending' }) : -1;
    const iDistHeld = dist ? push({ address: token, abi: tokenFactsAbi, functionName: 'balanceOf', args: [dist] }) : -1;

    const bb = SPHERE_BUYBACK_ADDRESS;
    const iBbBps = bb ? push({ address: bb, abi: buybackFactsAbi, functionName: 'BURN_BPS' }) : -1;
    const iBbBurned = bb ? push({ address: bb, abi: buybackFactsAbi, functionName: 'totalBurned' }) : -1;
    const iBbToDist = bb ? push({ address: bb, abi: buybackFactsAbi, functionName: 'totalToDistributor' }) : -1;
    const iBbEth = bb ? push({ address: bb, abi: buybackFactsAbi, functionName: 'totalEthSpent' }) : -1;

    const escrow = SPHERE_ESCROW_ADDRESS;
    const rewards = SPHERE_REWARDS_ADDRESS;
    const vesting = SPHERE_VESTING_ADDRESS;
    const iPot = escrow ? push({ address: escrow, abi: roleFactsAbi, functionName: 'BUYBACK_POT' }) : -1;
    const iOps = escrow ? push({ address: escrow, abi: roleFactsAbi, functionName: 'OPS_TARGET' }) : -1;
    const iConsumer = rewards ? push({ address: rewards, abi: roleFactsAbi, functionName: 'CONSUMER' }) : -1;
    const iBeneficiary = vesting ? push({ address: vesting, abi: roleFactsAbi, functionName: 'BENEFICIARY' }) : -1;

    const res = (await client.multicall({ contracts: calls, allowFailure: true })) as unknown as CallResult[];
    const get = <T,>(i: number): T | null => {
      if (i < 0) return null;
      const entry = res[i];
      return entry && entry.status === 'success' ? (entry.result as T) : null;
    };

    const launch = get<readonly [Address, number, bigint, bigint, number, `0x${string}`]>(iLaunch);
    // Kotwica calego zestawu. Publiczny RPC Base potrafi oddac 429 na CALY
    // multicall - wtedy kazda pozycja jest "failure" i bez tego rzutu strona
    // narysowalaby sie w komplecie ze slowami "Unknown" i "not readable",
    // czyli falszywymi faktami zamiast szkieletow. Rzut zostawia poprzednia
    // dobra wartosc i kaze useSphereRead sprobowac za 30 s.
    if (!launch) throw new Error('sphere facts: launchOf unreadable');
    const stage = LAUNCH_STATE[launch[1]] ?? 'Unknown';

    const position = get<readonly [`0x${string}`, bigint, number, number]>(iPosition);
    const poolKey = get<{ fee: number }>(iPoolKey);
    const hookFeeBps = get<number>(iHookFee);
    // Pula liczy sie dopiero po graduacji: przed nia positionOf oddaje same zera.
    const seeded = position && position[0] !== `0x${'0'.repeat(64)}`;

    const dead = get<bigint>(iDead);
    const fromHookBuyback = get<bigint>(iHookBurn);
    const fromRevenueBuyback = get<bigint>(iBbBurned);
    const supply = get<bigint>(iSupply);

    const pendingRaw = get<readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint]>(iDistPending);
    const distEpoch = get<bigint>(iDistEpoch);

    const feeRecipient = get<Address>(iFeeRecipient);
    const buybackPot = get<Address>(iPot);
    const opsTarget = get<Address>(iOps);
    const consumer = get<Address>(iConsumer);
    const beneficiary = get<Address>(iBeneficiary);
    const roleList = [feeRecipient, buybackPot, opsTarget, consumer, beneficiary].filter(Boolean) as Address[];
    // "Piec etykiet, jeden adres" wolno napisac tylko wtedy, gdy naprawde
    // odczytano CALA piatke - przy czesciowym odczycie to zdanie bylo bez
    // pokrycia, wiec wymagamy kompletu.
    const allSame = roleList.length === 5 && roleList.every((a) => a.toLowerCase() === roleList[0].toLowerCase());

    const facts: SphereChainFacts = {
      stage,
      startedAt: Number(launch[4]),
      pool:
        seeded && position && poolKey && hookFeeBps !== null
          ? {
              poolId: position[0],
              liquidity: position[1],
              tickLower: Number(position[2]),
              tickUpper: Number(position[3]),
              poolFeePpm: Number(poolKey.fee),
              hookFeeBps: Number(hookFeeBps),
            }
          : null,
      burn:
        dead !== null && supply !== null
          ? {
              dead,
              fromHookBuyback: fromHookBuyback ?? 0n,
              fromRevenueBuyback: fromRevenueBuyback ?? 0n,
              // Reszta salda 0xdEaD to nadwyzka ziarna graduacji - liczona jako
              // roznica, zeby nie zgadywac; ujemna byc nie moze, ale clamp jest
              // tanszy niz debugowanie ujemnej liczby w UI.
              fromGraduationSeed:
                dead - (fromHookBuyback ?? 0n) - (fromRevenueBuyback ?? 0n) > 0n
                  ? dead - (fromHookBuyback ?? 0n) - (fromRevenueBuyback ?? 0n)
                  : 0n,
              supply,
            }
          : null,
      hookPending:
        get<bigint>(iPendEth) !== null
          ? {
              eth: get<bigint>(iPendEth) ?? 0n,
              token: get<bigint>(iPendToken) ?? 0n,
              buybackEth: get<bigint>(iPendBuyback) ?? 0n,
            }
          : null,
      distributor:
        distEpoch !== null
          ? {
              epochId: Number(distEpoch),
              totalCumulative: get<bigint>(iDistCum) ?? 0n,
              totalClaimed: get<bigint>(iDistClaimed) ?? 0n,
              activatedAt: Number(get<bigint>(iDistActive) ?? 0n),
              streamDuration: Number(get<bigint>(iDistStream) ?? 0n),
              minDelay: Number(get<bigint>(iDistDelay) ?? 0n),
              held: get<bigint>(iDistHeld) ?? 0n,
              // validAt == 0 znaczy "nic nie czeka" (kontrakt kasuje pending
              // przez delete po aktywacji albo wecie).
              pending:
                pendingRaw && pendingRaw[4] !== 0n
                  ? { epochId: Number(pendingRaw[2]), totalCumulative: pendingRaw[3], validAt: Number(pendingRaw[4]) }
                  : null,
            }
          : null,
      buyback:
        get<number>(iBbBps) !== null
          ? {
              burnBps: Number(get<number>(iBbBps) ?? 0),
              totalBurned: get<bigint>(iBbBurned) ?? 0n,
              totalToDistributor: get<bigint>(iBbToDist) ?? 0n,
              totalEthSpent: get<bigint>(iBbEth) ?? 0n,
            }
          : null,
      roles: {
        feeRecipient,
        buybackPot,
        opsTarget,
        consumer,
        beneficiary,
        allSame,
        shared: allSame ? roleList[0] : null,
      },
    };
    return facts;
  });
}

/**
 * Data w UTC, skladana z pol ISO zamiast toLocaleString - lokalna strefa
 * goscia rozjechalaby sie z tym, co widac w eksploratorze, a przy renderze
 * serwerowym dodatkowo z HTML-em z serwera.
 */
export function formatUtc(unixSeconds: number): string {
  if (!unixSeconds) return '-';
  const iso = new Date(unixSeconds * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** "in 6 h 12 min" / "now" - do okna weta dystrybutora. */
export function formatIn(unixSeconds: number): string {
  const left = unixSeconds * 1000 - Date.now();
  if (left <= 0) return 'ready now';
  const mins = Math.floor(left / 60_000);
  const h = Math.floor(mins / 60);
  return h > 0 ? `in ${h} h ${mins % 60} min` : `in ${mins} min`;
}

function TreasuryMenu({ pathname }: { pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = TREASURY_TABS.some((tab) => pathname === tab.href);

  // Przejscie na inna strone zamyka menu.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-active={active}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
        className={`sph-tab isolate inline-flex items-center gap-1 whitespace-nowrap px-3.5 py-2 text-[12px] font-extrabold ${active ? 'text-sp-brand' : 'text-sp-shade/60 hover:text-sp-brand'}`}
      >
        Treasury
        <ChevronDown
          className={`h-3 w-3 transition-transform [transition-duration:var(--dur-dropdown)] ease-out-strong ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div
        className={`absolute right-0 top-full z-30 mt-2 w-60 origin-top-right rounded-card border border-sp-shade/10 bg-sp-surface p-1.5 shadow-float transition-[opacity,transform] [transition-duration:var(--dur-dropdown)] ease-out-strong ${
          open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
        }`}
        aria-hidden={!open}
      >
        {TREASURY_TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            tabIndex={open ? 0 : -1}
            aria-current={pathname === tab.href ? 'page' : undefined}
            className={`block rounded-lg px-3 py-2 transition-colors [transition-duration:var(--dur-press)] hover:bg-sp-sunken ${pathname === tab.href ? 'bg-sp-sunken' : ''}`}
          >
            <span className="block text-[13px] font-semibold text-sp-ink">{tab.label}</span>
            <span className="block text-[11.5px] text-sp-shade/60">{tab.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function SphereShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const aboutActive = pathname === ABOUT_TAB.href;
  return (
    <div className="board min-h-screen">
    <div className="sphere-shell mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-6">
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
        {/* Pasek ma pieciu wpisow (bylo siedem), wiec miesci sie w 375 px bez
            przewijania - a menu "Treasury" musi wystawac poza pasek, czego
            overflow-x-auto by nie zniosl. */}
        <nav className="flex max-w-full items-stretch rounded-lg border border-sp-shade/10 bg-sp-surface px-1">
          {PRIMARY_TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                data-active={active}
                aria-current={active ? 'page' : undefined}
                className={`sph-tab isolate shrink-0 whitespace-nowrap px-3.5 py-2 text-[12px] font-extrabold ${active ? 'text-sp-brand' : 'text-sp-shade/60 hover:text-sp-brand'}`}
              >
                {tab.label}
              </Link>
            );
          })}
          <TreasuryMenu pathname={pathname} />
          <Link
            href={ABOUT_TAB.href}
            data-active={aboutActive}
            aria-current={aboutActive ? 'page' : undefined}
            className={`sph-tab isolate shrink-0 whitespace-nowrap px-3.5 py-2 text-[12px] font-extrabold ${aboutActive ? 'text-sp-brand' : 'text-sp-shade/60 hover:text-sp-brand'}`}
          >
            {ABOUT_TAB.label}
          </Link>
        </nav>
      </div>

      {/* Baner bez zadnej liczby - i to jest cala poprawka z 2026-09-10.
          Stal tu recznie przepisany licznik testow ("46 tests"), ktory sam
          z soba sie klocil: SPHERE-TOKENOMIKA.md mowi 66, SPHERE-POST-X.md 62.
          Migawki liczone w innych momentach zycia galezi zawsze sie rozjada,
          a ten baner nie ma dla nich ZADNEGO zrodla - wlacza go pusta
          konfiguracja, czyli dokladnie stan, w ktorym strona nie umie niczego
          sprawdzic. Jedyne uczciwe zdanie w tym stanie mowi o konfiguracji,
          nie o kontraktach. Zamiast "wybrac jedna liczbe z trzech" wyrzucamy
          liczbe: jej miejsce jest w docs/, gdzie stoi obok daty. */}
      {!SPHERE_LIVE && (
        <div className="mb-4 rounded-card border border-sp-brand/30 bg-sp-brand-soft p-4">
          <p className="text-[13px] font-extrabold text-sp-ink">No SPHERE addresses in this build</p>
          <p className="mt-1 text-[12px] leading-relaxed text-sp-shade/70">
            This build carries no SPHERE contract addresses, so the page cannot read a single number
            from chain - treat everything below as empty, not as a claim about what is or is not
            deployed. It switches to live management the moment addresses land in the config.
          </p>
        </div>
      )}

      {/* Stan posredni: peryferia wdrozone, token jeszcze przed launch(). */}
      {SPHERE_LIVE && !SPHERE_TOKEN_ADDRESS && (
        <div className="mb-4 rounded-card border border-sp-brand/30 bg-sp-brand-soft p-4">
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
    </div>
  );
}
