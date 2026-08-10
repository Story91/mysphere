'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Flame,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { decodeEventLog, encodeEventTopics, formatEther, formatUnits, getAbiItem, maxUint256, parseEther, parseUnits, zeroAddress, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  CURVE_TARGET_ETH,
  erc20Abi,
  hookAbi,
  LAUNCH_HOOK_ADDRESS,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_DEPLOY_BLOCK,
  LAUNCH_STATE,
  LIQUIDITY_VAULT_ADDRESS,
  launchpadAbi,
  liquidityVaultAbi,
  previewTokens,
  type LaunchpadToken,
} from './config';
import { pickTokenImage } from './metadata';

const FIELD =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-[14px] text-[#16141b] outline-none transition-colors placeholder:text-black/35 focus:border-[#7c6bda]';
const LABEL = 'mb-1.5 block text-[12px] font-extrabold text-[#16141b]';
const HINT = 'mt-1 block text-[11px] leading-[1.4] text-black/45';

/**
 * Sufity sa TYMI SAMYMI liczbami, co w `CurveLaunchpad`. Interfejs czyta je z
 * lancucha przy starcie i dopiero gdy odczyt nie wyjdzie, spada na te wartosci
 * - zeby formularz nie obiecywal konfiguracji, ktorej kontrakt odrzuci.
 */
const FALLBACK_MAX_FEE_BPS = 100;
/**
 * Ile z oplaty wolno oddac tworcy. Reszta nalezy do protokolu i tego NIE
 * pilnuje formularz - pilnuje kontrakt (`MAX_CREATOR_SHARE_BPS`). Tutaj jest
 * po to, zeby suwak nie proponowal wartosci, ktora i tak odpadnie.
 */
const FALLBACK_MAX_CREATOR_SHARE_BPS = 6000;
const FALLBACK_MAX_RECIPIENTS = 8;
/** `WINDOW_ADDR_CAP` w calych tokenach: 16 000 000 z podazy 1 000 000 000. */
const FALLBACK_WINDOW_CAP_TOKENS = 16_000_000;
const TOTAL_SUPPLY_TOKENS = 1_000_000_000;
/** `LAUNCH_WINDOW` to 300 sekund; tu tylko jego nazwa dla czlowieka. */
const LAUNCH_WINDOW_LABEL = '5 minutes';

type FeeReceiverRow = { account: string; share: string };

/**
 * Konfiguracja startu w postaci, ktora da sie podac do `launchAdvanced` bez
 * dalszej interpretacji. `null` znaczy: formularz nie przechodzi walidacji.
 */
type AdvancedArgs = {
  feeBps: number;
  creatorFeeBps: number;
  buybackBps: number;
  windowCap: bigint;
  accounts: Address[];
  shares: number[];
  metadataURI: string;
  preBuyWei: bigint;
};

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Metadane ida NA LANCUCH jako `string`, wiec kazdy znak kosztuje gaz. Gdy
 * tworca poda wlasny URI, uzywamy go bez zmian; gdy poda tylko opis i obrazek,
 * skladamy z tego maly `data:` URI, ktory czyta sie bez naszego backendu.
 */
function buildMetadataUri(explicit: string, name: string, description: string, image: string) {
  const trimmed = explicit.trim();
  if (trimmed) return trimmed;
  const desc = description.trim();
  const img = image.trim();
  if (!desc && !img) return '';
  const payload: Record<string, string> = { name: name.trim() };
  if (desc) payload.description = desc;
  if (img) payload.image = img;
  return `data:application/json;base64,${toBase64(JSON.stringify(payload))}`;
}

/**
 * `parseEther` rzuca na wszystkim, co nie jest zapisem dziesietnym - a
 * `Number()` przyjmuje `1e3` i `0x10`, wiec sam nie wystarczy jako straznik.
 * Bez tego wpisanie `1e3` w pole ilosci wywalaloby RENDER, nie transakcje.
 */
function toWei(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  try {
    return parseEther(trimmed);
  } catch {
    return null;
  }
}

function isAddressLike(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

type Filter = 'all' | 'curve' | 'graduated';
type TradeSide = 'buy' | 'sell';
type BusyAction = 'launch' | 'buy' | 'approve' | 'sell' | 'graduate' | 'settle' | 'harvest' | 'claim';

type TokenDetails = {
  decimals: number;
  balance: bigint;
  allowance: bigint;
  spotPrice: bigint;
  launchClaimable: bigint;
  hookEthClaimable: bigint;
  hookTokenClaimable: bigint;
  vaultEthClaimable: bigint;
  vaultTokenClaimable: bigint;
  pendingEth: bigint;
  pendingToken: bigint;
  seeded: boolean;
  poolId: `0x${string}`;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
};

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function curvePercent(token: LaunchpadToken) {
  return Math.min(100, Math.round((token.raised / token.target) * 100));
}

function formatEth(value: number) {
  return `${value.toFixed(value >= 1 ? 2 : 3)} ETH`;
}

function TokenGlyph({ token, large = false }: { token: LaunchpadToken; large?: boolean }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[16px] font-soft-display font-extrabold text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)] ${large ? 'h-16 w-16 text-[22px]' : 'h-11 w-11 text-[14px]'}`}
      style={{ backgroundColor: token.accent }}
    >
      {token.logoUrl ? (
        // Logo pochodzi od obcego tworcy, wiec traktujemy je jak tresc
        // niezaufana: `metadata.ts` przepuszcza wylacznie https oraz ipfs,
        // a gdy obrazek nie wstanie, zostaje inicjal - nigdy pusta dziura.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={token.logoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <>
          <span className="relative z-10">{token.symbol.slice(0, 2)}</span>
          <span aria-hidden="true" className="absolute -right-2 -top-3 h-8 w-8 rounded-full bg-white/25" />
          <span aria-hidden="true" className="absolute -bottom-3 -left-2 h-8 w-8 rounded-full bg-black/10" />
        </>
      )}
    </div>
  );
}

/**
 * Kafel rynku. Uklad kart jest tu ZAMIAST gestej tabeli, ktora ma dzis kazdy
 * launchpad - ta sama informacja, ale czytana wzrokiem, a nie skanowana
 * kolumnami. Tabela zostaje jako druga zakladka dla kogos, kto porownuje
 * dziesiatki pozycji naraz.
 */
function LaunchCard({ token, onTrade, onSelect, onDetails }: { token: LaunchpadToken; onTrade: () => void; onSelect: () => void; onDetails: () => void }) {
  const progress = curvePercent(token);
  return (
    <div className="flex flex-col rounded-[18px] border border-black/10 bg-white p-4 transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
      <button type="button" onClick={onSelect} className="flex min-w-0 items-start gap-3 text-left">
        <TokenGlyph token={token} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-extrabold text-[#16141b]">{token.symbol}</span>
            <StatePill state={token.state} />
          </span>
          <span className="mt-1 block truncate text-[12px] text-black/50">{token.name}</span>
        </span>
      </button>

      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[17px] font-extrabold text-[#16141b]">{formatEth(token.raised)}</span>
          <span className="text-[11px] font-extrabold text-[#12a451]">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/8">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, backgroundColor: token.accent }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-black/45">
          <span>{formatEth(token.volume ?? 0)} vol</span>
          <span>{token.holders} holders · {token.age}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={onTrade} className="flex-1 rounded-full bg-soft-primary px-3 py-2 text-[12px] font-extrabold text-white">Trade</button>
        <button type="button" onClick={onDetails} className="rounded-full border border-black/15 bg-white px-3 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary">Details</button>
      </div>
    </div>
  );
}

function StatePill({ state }: { state: LaunchpadToken['state'] }) {
  const meta = {
    Curve: { label: 'Curve', className: 'bg-[#edeaff] text-[#5f4ec2]' },
    Locked: { label: 'Locked', className: 'bg-[#f4f1ff] text-[#705fd0]' },
    Graduated: { label: 'Graduated', className: 'bg-[#edfff4] text-[#0b9a51]' },
  }[state];
  return <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${meta.className}`}>{meta.label}</span>;
}

function MiniBars({ token, green = false }: { token: LaunchpadToken; green?: boolean }) {
  const heights = [28, 34, 31, 43, 50, 45, 57, 54, 72, 65, 82, 94];
  return (
    <span className="flex h-8 w-16 items-end gap-[2px]" aria-hidden="true">
      {heights.map((height, index) => (
        <span
          key={`${token.id}-${index}`}
          className="min-w-0 flex-1 rounded-t-sm"
          style={{ height: `${height}%`, backgroundColor: green ? '#18bd64' : token.accent }}
        />
      ))}
    </span>
  );
}

type ActivityItem = { id: string; symbol: string; accent: string; label: string; tone: 'launch' | 'buy' | 'sell' | 'graduate' };

/**
 * Szyna zdarzen na zywo - PIONOWA i przyklejona z boku rynku.
 *
 * To jest swiadome odejscie od ukladu, ktory ma dzis kazdy launchpad: pozioma
 * tasma na samej gorze plus szeroka siatka pod nia. Tamten uklad zmusza do
 * czytania zdarzen katem oka, przy okazji przewijania rynku. Tutaj zdarzenia
 * stoja obok rynku i zostaja na ekranie, wiec da sie je czytac jako osobna
 * rzecz - a rynek nie traci szerokosci na pasek, ktory i tak ucieka.
 *
 * Na telefonie pionowa szyna nie ma sensu (zabralaby cala szerokosc), wiec tam
 * zostaje wersja pozioma.
 */
function LiveRail({ events }: { events: ActivityItem[] }) {
  const toneClass = (tone: ActivityItem['tone']) =>
    tone === 'sell'
      ? 'text-[#a34b08]'
      : tone === 'buy'
        ? 'text-[#0b9a51]'
        : tone === 'graduate'
          ? 'text-[#0b7a41]'
          : 'text-[#5f4ec2]';

  return (
    <aside className="hidden lg:block" aria-label="Live Launchpad events">
      <div className="sticky top-4 rounded-[20px] border border-black/10 bg-white">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <h2 className="text-[13px] font-extrabold text-[#16141b]">Live tape</h2>
          <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-black/40">
            <span className={`h-1.5 w-1.5 rounded-full ${events.length ? 'bg-[#18bd64]' : 'bg-black/20'}`} />
            {events.length ? 'onchain' : 'waiting'}
          </span>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {events.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11.5px] leading-[1.5] text-black/45">
              Nothing yet. Launches, buys and sells show up here the moment they land on chain.
            </p>
          ) : (
            <ul className="divide-y divide-black/5">
              {events.slice(0, 30).map((event) => (
                <li key={event.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="h-6 w-6 shrink-0 rounded-lg" style={{ backgroundColor: event.accent }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-extrabold text-[#16141b]">{event.symbol}</span>
                    <span className={`block text-[10.5px] font-bold ${toneClass(event.tone)}`}>{event.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

function ActivityTicker({ events }: { events: ActivityItem[] }) {
  const items = [...events, ...events].slice(0, 16);
  return (
    <div className="launchpad-ticker -mx-4 overflow-hidden border-b border-black/10 bg-white sm:-mx-6" aria-label="Live Launchpad events">
      <div className={`${events.length ? 'launchpad-marquee' : ''} flex min-h-[38px] min-w-max items-center gap-1.5 px-2 py-1.5`}>
        {items.length ? items.map((event, index) => (
          <div key={`${event.id}-${index}`} className="flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-2 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-extrabold text-white" style={{ backgroundColor: event.accent }}>{event.symbol.slice(0, 1)}</span>
            <span className="pr-1 text-left leading-tight">
              <span className="block text-[10px] font-bold text-[#16141b]">{event.symbol}</span>
              <span className={`block text-[9px] font-bold ${event.tone === 'sell' ? 'text-[#a34b08]' : event.tone === 'buy' ? 'text-[#0b9a51]' : event.tone === 'graduate' ? 'text-[#0b7a41]' : 'text-[#5f4ec2]'}`}>{event.label}</span>
            </span>
          </div>
        )) : <span className="px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-black/35">Listening for live Launchpad events...</span>}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, detail, accent, icon }: { title: string; value: string; detail: string; accent: string; icon: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-black/10 bg-white p-5" style={{ background: `linear-gradient(135deg, #fff 0%, ${accent} 150%)` }}>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white text-[#16141b] shadow-sm">{icon}</span>
        <div>
          <p className="text-[13px] font-bold text-[#16141b]">{title}</p>
          <p className="mt-1 font-soft-display text-[28px] font-extrabold leading-none text-[#111016]">{value}</p>
          <p className="mt-2 text-[11px] font-semibold text-black/50">{detail}</p>
        </div>
      </div>
    </section>
  );
}

function TopLaunches({ tokens, onSelect }: { tokens: LaunchpadToken[]; onSelect: (id: string) => void }) {
  const top = [...tokens].sort((a, b) => b.raised - a.raised).slice(0, 3);
  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-[#16141b]">Top launches</h2>
        <TrendingUp className="h-4 w-4 text-[#7c6bda]" aria-hidden="true" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {top.map((token) => (
          <button key={token.id} type="button" onClick={() => onSelect(token.id)} className="group min-w-0 text-center">
            <span className="mx-auto block w-fit transition-transform group-hover:-translate-y-1"><TokenGlyph token={token} large /></span>
            <span className="mt-2 block truncate text-[12px] font-extrabold text-[#16141b]">{token.symbol}</span>
            <span className="mt-1 block truncate text-[11px] text-black/50">{formatEth(token.raised)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function VolumePanel({ tokens, onSelect }: { tokens: LaunchpadToken[]; onSelect: (id: string) => void }) {
  const top = [...tokens].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 3);
  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-[#16141b]">Top volume</h2>
        <BarChart3 className="h-4 w-4 text-[#1e9de0]" aria-hidden="true" />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] font-bold uppercase tracking-[0.08em] text-black/40">
        <span>Coin</span><span>Volume</span><span>Trades</span>
      </div>
      <div className="mt-2 divide-y divide-black/10">
        {top.map((token) => (
          <button key={token.id} type="button" onClick={() => onSelect(token.id)} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 py-2 text-left">
            <span className="flex min-w-0 items-center gap-2"><TokenGlyph token={token} /><span className="truncate text-[12px] font-extrabold text-[#16141b]">{token.symbol}</span></span>
            <span className="text-[12px] font-bold text-[#16141b]">{formatEth(token.volume ?? 0)}</span>
            <span className="text-[12px] font-bold text-black/60">{token.trades ?? 0}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function LaunchTableRow({ token, onTrade, onSelect, onDetails }: { token: LaunchpadToken; onTrade: () => void; onSelect: () => void; onDetails: () => void }) {
  const progress = curvePercent(token);
  return (
    <div className="grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_0.9fr_0.8fr_1.1fr_0.8fr_auto] items-center gap-4 border-t border-black/10 px-4 py-3.5 text-left transition-colors hover:bg-[#fff8fc] sm:px-5">
      <button type="button" onClick={onSelect} className="flex min-w-0 items-center gap-3 text-left">
        <TokenGlyph token={token} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2"><span className="truncate text-[14px] font-extrabold text-[#16141b]">{token.symbol}</span><StatePill state={token.state} /></span>
          <span className="mt-1 flex items-center gap-2 truncate text-[12px] text-black/50"><span>{token.name}</span><span aria-hidden="true">•</span><span>{token.age}</span></span>
        </span>
      </button>
      <div><span className="block text-[14px] font-extrabold text-[#16141b]">{formatEth(token.raised)}</span><span className="mt-1 block text-[11px] font-bold text-[#12a451]">{progress}% of curve</span></div>
      <div><span className="block text-[14px] font-bold text-[#16141b]">{formatEth(token.volume ?? 0)}</span><span className="mt-1 block text-[11px] text-black/45">indexed volume</span></div>
      <div className="flex items-center gap-2"><MiniBars token={token} green={token.state === 'Graduated'} /><span className="text-[11px] font-bold text-black/45">{token.holders} holders</span></div>
      <div><span className="block text-[14px] font-bold text-[#16141b]">{shortAddress(token.creator)}</span><span className="mt-1 block text-[11px] text-black/45">creator</span></div>
      <span className="flex items-center gap-1.5"><button type="button" onClick={onTrade} className="rounded-full border border-black/15 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] shadow-sm transition-colors hover:border-[#7c6bda] hover:text-[#5f4ec2]">{token.live ? 'Trade' : 'View'}</button>{token.live && <button type="button" onClick={onDetails} className="rounded-full p-2 text-black/40 hover:bg-[#f4f1ff] hover:text-[#5f4ec2]" aria-label={`Open ${token.symbol} details`}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></button>}</span>
    </div>
  );
}

function TradePanel({
  token,
  details,
  side,
  setSide,
  buyAmount,
  setBuyAmount,
  sellAmount,
  setSellAmount,
  sellQuote,
  gradReward,
  busy,
  onBuy,
  onSell,
  onGraduate,
  onSettle,
  onHarvest,
  onClaim,
  isConnected,
}: {
  token: LaunchpadToken;
  details: TokenDetails | null;
  side: TradeSide;
  setSide: (side: TradeSide) => void;
  buyAmount: string;
  setBuyAmount: (value: string) => void;
  sellAmount: string;
  setSellAmount: (value: string) => void;
  sellQuote: bigint | null;
  gradReward: bigint | null;
  busy: BusyAction | null;
  onBuy: () => void;
  onSell: () => void;
  onGraduate: () => void;
  onSettle: () => void;
  onHarvest: () => void;
  onClaim: (source: 'launch' | 'hookEth' | 'hookToken' | 'vaultEth' | 'vaultToken') => void;
  isConnected: boolean;
}) {
  const decimals = details?.decimals ?? 18;
  const balance = details ? formatUnits(details.balance, decimals) : '0';
  const claimRows = details ? [
    { label: 'Launchpad fees', value: formatEther(details.launchClaimable), amount: details.launchClaimable, source: 'launch' as const },
    { label: 'Hook ETH', value: formatEther(details.hookEthClaimable), amount: details.hookEthClaimable, source: 'hookEth' as const },
    { label: 'Hook token', value: formatUnits(details.hookTokenClaimable, decimals), amount: details.hookTokenClaimable, source: 'hookToken' as const },
    { label: 'Vault ETH', value: formatEther(details.vaultEthClaimable), amount: details.vaultEthClaimable, source: 'vaultEth' as const },
    { label: 'Vault token', value: formatUnits(details.vaultTokenClaimable, decimals), amount: details.vaultTokenClaimable, source: 'vaultToken' as const },
  ] : [];

  return <>
    <div className="mt-5 flex items-center gap-1 rounded-xl bg-[#f4f1ff] p-1">
      {(['buy', 'sell'] as const).map((item) => <button key={item} type="button" onClick={() => setSide(item)} className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-extrabold capitalize ${side === item ? 'bg-white text-soft-primary-deep shadow-sm' : 'text-black/45'}`}>{item === 'buy' ? 'Buy with ETH' : 'Sell token'}</button>)}
    </div>
    {side === 'buy' ? <>
      <div className="mt-4 flex items-end justify-between"><span className="text-[12px] font-extrabold text-[#16141b]">ETH amount</span><span className="text-[11px] text-black/45">5 bps slippage buffer</span></div>
      <div className="mt-2 flex gap-2"><div className="relative flex-1"><input inputMode="decimal" value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} className={`${FIELD} pr-14`} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-black/40">ETH</span></div><button type="button" disabled={busy === 'buy'} onClick={onBuy} className="inline-flex items-center gap-2 rounded-xl bg-soft-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-60">{busy === 'buy' ? 'Buying...' : 'Buy'}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button></div>
      <div className="mt-2 flex gap-1.5">{['0.01', '0.05', '0.1'].map((amount) => <button key={amount} type="button" onClick={() => setBuyAmount(amount)} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary">{amount} ETH</button>)}</div>
    </> : <>
      <div className="mt-4 flex items-end justify-between"><span className="text-[12px] font-extrabold text-[#16141b]">Token amount</span><span className="text-[11px] text-black/45">Balance {Number(balance).toFixed(4)}</span></div>
      <div className="mt-2 flex gap-2"><div className="relative flex-1"><input inputMode="decimal" value={sellAmount} onChange={(event) => setSellAmount(event.target.value)} className={`${FIELD} pr-16`} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-extrabold text-black/40">{token.symbol}</span></div><button type="button" disabled={busy === 'sell' || busy === 'approve'} onClick={onSell} className="inline-flex items-center gap-2 rounded-xl bg-[#16141b] px-4 text-[13px] font-extrabold text-white disabled:opacity-60">{busy === 'approve' ? 'Approving...' : busy === 'sell' ? 'Selling...' : 'Sell'}<ArrowDownToLine className="h-4 w-4" aria-hidden="true" /></button></div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-black/45"><span>Estimated output</span><span className="font-extrabold text-[#16141b]">{sellQuote === null ? '--' : `${formatEther(sellQuote)} ETH`}</span></div>
    </>}

    {token.state === 'Locked' && <div className="mt-5 rounded-xl border border-[#f3c58a] bg-[#fff8ed] p-3"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#c76b12]" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold text-[#8c4a0b]">Ready for graduation</p><p className="mt-1 text-[11px] leading-[1.4] text-black/55">Anyone can open the pool. Caller reward: {gradReward === null ? '--' : `${formatEther(gradReward)} ETH`}.</p></div><button type="button" disabled={busy === 'graduate'} onClick={onGraduate} className="rounded-full bg-[#c76b12] px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50">{busy === 'graduate' ? 'Opening...' : 'Graduate'}</button></div></div>}

    {token.state === 'Graduated' && <div className="mt-5 rounded-xl bg-[#f4f1ff] p-3"><div className="flex items-start gap-2"><Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold text-[#16141b]">Live pool with hook</p><p className="mt-1 text-[11px] leading-[1.4] text-black/55">{details?.poolId && details.poolId !== `0x${'0'.repeat(64)}` ? `Pool ${details.poolId.slice(0, 10)}...` : 'Pool position is loading.'}</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={!details?.pendingEth || busy === 'settle'} onClick={onSettle} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-[11px] font-extrabold text-[#16141b] disabled:opacity-40">{busy === 'settle' ? 'Settling...' : `Settle ${details ? formatEther(details.pendingEth) : '0'} ETH`}</button><button type="button" disabled={busy === 'harvest'} onClick={onHarvest} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-[11px] font-extrabold text-[#16141b] disabled:opacity-40">{busy === 'harvest' ? 'Harvesting...' : 'Harvest LP fees'}</button></div></div>}

    {isConnected && details && <div className="mt-5 border-t border-black/10 pt-4"><div className="flex items-center justify-between"><span className="text-[12px] font-extrabold text-[#16141b]">Available claims</span><CheckCircle2 className="h-4 w-4 text-[#18bd64]" aria-hidden="true" /></div><div className="mt-2 space-y-1.5">{claimRows.map((row) => <div key={row.label} className="flex items-center justify-between gap-2 text-[11px]"><span className="text-black/50">{row.label}</span><span className="flex items-center gap-2 font-extrabold text-[#16141b]"><span>{row.value}</span><button type="button" disabled={row.amount === 0n} onClick={() => onClaim(row.source)} className="rounded-full border border-black/10 px-2 py-1 text-[10px] text-soft-primary-deep disabled:opacity-30">Claim</button></span></div>)}</div></div>}
  </>;
}

/* -------------------------------------------------------------------------- */
/*  ODCZYT TABLICY Z LANCUCHA                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ile blokow bierzemy w jednym `getLogs`. Publiczne RPC Base Sepolia potrafi
 * odrzucic szerszy zakres, wiec skanujemy WSTECZ oknami, a nie jednym strzalem
 * od bloku wdrozenia.
 */
const LOG_WINDOW = 1_900n;

/** Sufit na liczbe okien - zeby swiezo zaladowana strona nie robila setek requestow. */
const MAX_LOG_WINDOWS = 64;

const LAUNCHED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Launched' });
const BOUGHT_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Bought' });
const SOLD_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Sold' });

const ACCENTS = ['#8b78e6', '#5fa78c', '#d78a55', '#5b8bd9', '#d9628a', '#4fa3a8'];

function accentFor(token: string) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

function formatAge(startedAt: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - startedAt);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86_400)} d`;
}

export default function LaunchpadBoard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const [tokens, setTokens] = useState(previewTokens);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(previewTokens[0].id);
  const [buyAmount, setBuyAmount] = useState('0.05');
  const [launchOpen, setLaunchOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [launchName, setLaunchName] = useState('');
  const [launchSymbol, setLaunchSymbol] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [launchImage, setLaunchImage] = useState('');
  const [launchDescription, setLaunchDescription] = useState('');
  const [launchMetadataUri, setLaunchMetadataUri] = useState('');
  const [launchFeePct, setLaunchFeePct] = useState('1');
  const [creatorSharePct, setCreatorSharePct] = useState('60');
  const [buybackPct, setBuybackPct] = useState('0');
  const [sniperCapTokens, setSniperCapTokens] = useState(String(FALLBACK_WINDOW_CAP_TOKENS));
  const [preBuyEth, setPreBuyEth] = useState('0');
  const [receivers, setReceivers] = useState<FeeReceiverRow[]>([{ account: '', share: '100' }]);
  // `null` = jeszcze nie sprawdzone. `false` = wdrozony launchpad zna tylko
  // stare ABI i rozszerzonego startu NIE WOLNO pokazac jako dzialajacego.
  const [advancedSupported, setAdvancedSupported] = useState<boolean | null>(null);
  const [limits, setLimits] = useState({
    maxFeeBps: FALLBACK_MAX_FEE_BPS,
    maxCreatorShareBps: FALLBACK_MAX_CREATOR_SHARE_BPS,
    maxRecipients: FALLBACK_MAX_RECIPIENTS,
    windowCapTokens: FALLBACK_WINDOW_CAP_TOKENS,
  });
  // Stale krzywej sluza WYLACZNIE do podgladu pre-buya. Liczba wiazaca jest
  // zawsze ta z lancucha - tu pokazujemy szacunek, nie obietnice.
  const [curve, setCurve] = useState({ t0: TOTAL_SUPPLY_TOKENS, rVirt: 0.75 });
  // Oplata puli po graduacji nalezy do HOOKA i jest ustalona przy jego
  // wdrozeniu - tworca jej nie wybiera. Czytamy ja, zeby estymator nie
  // zgadywal, ile z niej zostaje tworcy.
  const [hookSplit, setHookSplit] = useState({ feeBps: 100, protocolShareBps: 6000 });
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [tradeSide, setTradeSide] = useState<TradeSide>('buy');
  const [sellAmount, setSellAmount] = useState('0');
  const [sellQuote, setSellQuote] = useState<bigint | null>(null);
  const [details, setDetails] = useState<TokenDetails | null>(null);
  const [gradReward, setGradReward] = useState<bigint | null>(null);

  // Odczyty tablicy sa PRZYPIETE do sieci launchpada. Bez tego tablica gasnie,
  // gdy portfel stoi na innym lancuchu - a to jest widok publiczny i ma sie
  // pokazac takze bez portfela.
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });

  /**
   * Odtwarza tablice z lancucha: `Launched` daje liste tokenow, `Bought` -
   * unikalnych kupujacych, a `launchOf` aktualny stan i rezerwe. Zaden
   * zewnetrzny indekser nie widzi tych tokenow przed awansem, wiec to jest
   * jedyne zrodlo.
   */
  const loadBoard = useCallback(async () => {
    if (!readClient) return;
    setLoadingBoard(true);
    setBoardError(null);
    try {
      const latest = await readClient.getBlockNumber();
      const launched = new Map<Address, { name: string; symbol: string; creator: Address; startedAt: number }>();
      const buyers = new Map<Address, Set<Address>>();
      const activity = new Map<Address, { volume: number; trades: number; lastPrice: number }>();
      const rawFeed: Array<{ id: string; token: Address; label: string; tone: ActivityItem['tone'] }> = [];

      let toBlock = latest;
      for (let window = 0; window < MAX_LOG_WINDOWS && toBlock >= LAUNCHPAD_DEPLOY_BLOCK; window += 1) {
        const fromBlock = toBlock > LAUNCHPAD_DEPLOY_BLOCK + LOG_WINDOW ? toBlock - LOG_WINDOW : LAUNCHPAD_DEPLOY_BLOCK;
        const logs = await readClient.getLogs({
          address: LAUNCHPAD_ADDRESS as Address,
          events: [LAUNCHED_EVENT, BOUGHT_EVENT, SOLD_EVENT],
          fromBlock,
          toBlock,
        });
        for (const log of logs) {
          const token = log.args.token as Address | undefined;
          if (!token) continue;
          if (log.eventName === 'Launched') {
            launched.set(token, {
              name: log.args.name as string,
              symbol: log.args.symbol as string,
              creator: log.args.creator as Address,
              startedAt: Number(log.args.startedAt ?? 0),
            });
            rawFeed.push({ id: `${log.transactionHash}-launch`, token, label: 'Launched', tone: 'launch' });
          } else if (log.eventName === 'Bought') {
            const set = buyers.get(token) ?? new Set<Address>();
            set.add(log.args.buyer as Address);
            buyers.set(token, set);
            const ethNet = Number(formatEther(log.args.ethNet as bigint));
            const tokensOut = Number(formatEther(log.args.tokensOut as bigint));
            const current = activity.get(token) ?? { volume: 0, trades: 0, lastPrice: 0 };
            activity.set(token, { volume: current.volume + ethNet, trades: current.trades + 1, lastPrice: tokensOut > 0 ? ethNet / tokensOut : current.lastPrice });
            rawFeed.push({ id: `${log.transactionHash}-buy`, token, label: `Buy ${formatEth(ethNet)}`, tone: 'buy' });
          } else {
            const set = buyers.get(token) ?? new Set<Address>();
            set.add(log.args.seller as Address);
            buyers.set(token, set);
            const ethOut = Number(formatEther(log.args.ethOut as bigint));
            const tokensIn = Number(formatEther(log.args.tokensIn as bigint));
            const current = activity.get(token) ?? { volume: 0, trades: 0, lastPrice: 0 };
            activity.set(token, { volume: current.volume + ethOut, trades: current.trades + 1, lastPrice: tokensIn > 0 ? ethOut / tokensIn : current.lastPrice });
            rawFeed.push({ id: `${log.transactionHash}-sell`, token, label: `Sell ${formatEth(ethOut)}`, tone: 'sell' });
          }
        }
        if (fromBlock === LAUNCHPAD_DEPLOY_BLOCK) break;
        toBlock = fromBlock - 1n;
      }

      if (launched.size === 0) {
        setActivityFeed([]);
        setTokens(previewTokens);
        return;
      }

      setActivityFeed(rawFeed.slice(0, 24).map((item) => ({ ...item, symbol: launched.get(item.token)?.symbol ?? shortAddress(item.token), accent: accentFor(item.token) })));

      const addresses = [...launched.keys()];
      const states = await readClient.multicall({
        allowFailure: true,
        contracts: addresses.map((token) => ({
          address: LAUNCHPAD_ADDRESS as Address,
          abi: launchpadAbi,
          functionName: 'launchOf' as const,
          args: [token] as const,
        })),
      });

      const live: LaunchpadToken[] = [];
      addresses.forEach((token, index) => {
        const result = states[index];
        const meta = launched.get(token);
        if (!meta || result?.status !== 'success') return;
        const [creator, state, ethReserve, , startedAt] = result.result as readonly [
          Address,
          number,
          bigint,
          bigint,
          number,
          `0x${string}`,
        ];
        // Stan 0 znaczy "launchpad nie zna tego adresu". Zdarzenie z innego
        // wdrozenia pod tym samym adresem tablicy nie ma prawa tu wejsc.
        if (state === 0) return;
        live.push({
          id: token,
          address: token,
          name: meta.name,
          symbol: meta.symbol,
          creator,
          state: LAUNCH_STATE[state] as LaunchpadToken['state'],
          raised: Number(formatEther(ethReserve)),
          target: CURVE_TARGET_ETH,
          holders: buyers.get(token)?.size ?? 0,
          volume: activity.get(token)?.volume ?? 0,
          trades: activity.get(token)?.trades ?? 0,
          lastPrice: activity.get(token)?.lastPrice ?? 0,
          age: formatAge(Number(startedAt)),
          accent: accentFor(token),
          live: true,
        });
      });

      if (live.length === 0) {
        setActivityFeed([]);
        setTokens(previewTokens);
        return;
      }
      live.sort((a, b) => b.raised - a.raised);
      setTokens(live);
      setSelectedId((current) => (live.some((token) => token.id === current) ? current : live[0].id));
    } catch (error) {
      // Tablica podgladowa zostaje na ekranie - pusty widok wygladalby jak
      // "nikt jeszcze nic nie wystartowal", a to jest awaria odczytu.
      setBoardError(error instanceof Error ? error.message.split('\n')[0] : String(error));
    } finally {
      setLoadingBoard(false);
    }
  }, [readClient]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  /**
   * NA ZYWO. `loadBoard` przemiata cala historie w oknach po 1900 blokow i
   * trwa sekundy - wolanie go co kilka sekund byloby marnotrawstwem i tak
   * czy owak spoznialoby sie o caly przebieg.
   *
   * Tu jest odwrotnie: subskrypcja dokłada POJEDYNCZE zdarzenia do stanu,
   * ktory juz jest na ekranie. Rezerwa nie jest doliczana po naszej stronie -
   * bierzemy `ethReserveAfter` PROSTO ZE ZDARZENIA, wiec liczba na ekranie
   * pochodzi z lancucha, a nie z naszej arytmetyki, ktora moglaby sie z nim
   * rozjechac.
   *
   * `poll: true` jest konieczne: publiczny RPC Base Sepolia nie utrzymuje
   * filtrow, wiec `eth_newFilter` gasnie i subskrypcja po cichu przestaje
   * cokolwiek oddawac.
   */
  useEffect(() => {
    if (!readClient) return;

    const unwatch = readClient.watchContractEvent({
      address: LAUNCHPAD_ADDRESS as Address,
      abi: launchpadAbi,
      poll: true,
      pollingInterval: 8_000,
      // Bez tego viem wypisuje kazde odbicie publicznego RPC do konsoli. Zywy
      // podglad jest DODATKIEM - tablica ma juz dane z `loadBoard`, wiec cicha
      // przerwa w subskrypcji jest wlasciwym zachowaniem, a nie awaria.
      onError: () => {},
      onLogs: (logs) => {
        const fresh: ActivityItem[] = [];

        for (const log of logs) {
          const decoded = log as unknown as { eventName?: string; args?: Record<string, unknown>; transactionHash?: string };
          const token = decoded.args?.token as Address | undefined;
          const eventName = decoded.eventName;
          if (!token || !eventName) continue;
          const id = `${decoded.transactionHash ?? ''}-${eventName}-${String(log.logIndex ?? 0)}`;

          if (eventName === 'Launched') {
            const symbol = (decoded.args?.symbol as string) ?? shortAddress(token);
            fresh.push({ id, symbol, accent: accentFor(token), label: 'Launched', tone: 'launch' });
            setTokens((current) => {
              if (current.some((row) => row.address?.toLowerCase() === token.toLowerCase())) return current;
              const row: LaunchpadToken = {
                id: token,
                address: token,
                name: (decoded.args?.name as string) ?? symbol,
                symbol,
                creator: (decoded.args?.creator as string) ?? '',
                state: 'Curve',
                raised: 0,
                target: CURVE_TARGET_ETH,
                holders: 0,
                age: 'just now',
                accent: accentFor(token),
                live: true,
                volume: 0,
                trades: 0,
              };
              // Wiersze podgladowe znikaja przy pierwszym prawdziwym starcie -
              // mieszanie ich z zywymi danymi bylo by mylace.
              const withoutPreview = current.filter((existing) => existing.live);
              return [row, ...withoutPreview];
            });
            continue;
          }

          if (eventName === 'CurveLocked' || eventName === 'Graduated') {
            const graduated = eventName === 'Graduated';
            fresh.push({
              id,
              symbol: shortAddress(token),
              accent: accentFor(token),
              label: graduated ? 'Graduated' : 'Curve closed',
              tone: 'graduate',
            });
            // Stan tokena zmienia sie TU, a nie przy nastepnym przeladowaniu
            // tablicy. Bez tego wiersz nadal zapraszal do kupna, ktore juz
            // rewertuje.
            setTokens((current) =>
              current.map((row) =>
                row.address?.toLowerCase() === token.toLowerCase()
                  ? { ...row, state: graduated ? 'Graduated' : 'Locked' }
                  : row
              )
            );
            continue;
          }

          if (eventName !== 'Bought' && eventName !== 'Sold') continue;

          const isBuy = eventName === 'Bought';
          const eth = (isBuy ? decoded.args?.ethNet : decoded.args?.ethOut) as bigint | undefined;
          const reserveAfter = decoded.args?.ethReserveAfter as bigint | undefined;
          fresh.push({
            id,
            symbol: shortAddress(token),
            accent: accentFor(token),
            label: `${isBuy ? 'Buy' : 'Sell'} ${eth === undefined ? '' : formatEth(Number(formatEther(eth)))}`.trim(),
            tone: isBuy ? 'buy' : 'sell',
          });

          setTokens((current) =>
            current.map((row) => {
              if (row.address?.toLowerCase() !== token.toLowerCase()) return row;
              return {
                ...row,
                raised: reserveAfter === undefined ? row.raised : Number(formatEther(reserveAfter)),
                trades: (row.trades ?? 0) + 1,
                volume: (row.volume ?? 0) + (eth === undefined ? 0 : Number(formatEther(eth))),
              };
            })
          );
        }

        if (fresh.length === 0) return;
        setActivityFeed((current) => {
          // Ten sam log potrafi przyjsc dwa razy przy reorganizacji lancucha.
          const seen = new Set(current.map((item) => item.id));
          const unique = fresh.filter((item) => !seen.has(item.id));
          if (unique.length === 0) return current;
          return [...unique.reverse(), ...current].slice(0, 24);
        });
      },
    });

    return () => {
      unwatch();
    };
  }, [readClient]);

  /**
   * Logo, opis i linki tokenow. Lancuch ich nie zna - patrz `metadata.ts`.
   * Brak profilu nie jest bledem i nie moze niczego wywrocic: tablica dziala
   * bez ani jednego logo.
   */
  useEffect(() => {
    // Adresy jada w query stringu, a ten ma realny sufit dlugosci (serwery i
    // posrednicy odcinaja okolo 8 kB). 42 znaki na adres znacza, ze 200 pozycji
    // to juz ponad 8 kB samych adresow - czyli 414 zamiast logo. Bierzemy tyle,
    // ile widac na ekranie; reszta dociagnie sie, gdy wejdzie do widoku.
    const live = tokens
      .filter((token) => token.address)
      .slice(0, 60)
      .map((token) => token.address as Address);
    if (live.length === 0) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/launchpad/token?addresses=${live.join(',')}`);
        if (!response.ok) return;
        const payload = (await response.json()) as { profiles?: Record<string, { logoUrl?: string | null }> };
        if (cancelled || !payload.profiles) return;
        const profiles = payload.profiles;
        setTokens((current) =>
          current.map((row) => {
            const profile = row.address ? profiles[row.address.toLowerCase()] : undefined;
            const logo = pickTokenImage({ profileLogoUrl: profile?.logoUrl }).url;
            return logo && logo !== row.logoUrl ? { ...row, logoUrl: logo } : row;
          })
        );
      } catch {
        // Profile sa ozdoba, nie danymi rynkowymi. Cisza jest tu wlasciwa.
      }
    })();

    return () => {
      cancelled = true;
    };
    // Celowo zalezy od LICZBY i adresow, nie od calej tablicy - inaczej wlasny
    // `setTokens` powyzej wywolywalby ten efekt w kolko.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.slice(0, 60).map((token) => token.address ?? '').join(',')]);

  const visibleTokens = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tokens.filter((token) => {
      const matchesFilter = filter === 'all' || (filter === 'curve' ? token.state === 'Curve' : token.state === 'Graduated');
      const matchesSearch = !normalized || `${token.name} ${token.symbol} ${token.creator}`.toLowerCase().includes(normalized);
      return matchesFilter && matchesSearch;
    });
  }, [filter, query, tokens]);

  const selected = tokens.find((token) => token.id === selectedId) ?? visibleTokens[0] ?? tokens[0];
  const onSepolia = chainId === LAUNCHPAD_CHAIN.id;
  const liveCount = tokens.filter((token) => token.state === 'Curve').length;
  const totalRaised = tokens.reduce((sum, token) => sum + token.raised, 0);
  const totalVolume = tokens.reduce((sum, token) => sum + (token.volume ?? 0), 0);
  const totalTrades = tokens.reduce((sum, token) => sum + (token.trades ?? 0), 0);
  const showingPreview = !tokens.some((token) => token.live);

  const refreshDetails = useCallback(async () => {
    if (!readClient || !selected?.address) {
      setDetails(null);
      setSellQuote(null);
      return;
    }
    const token = selected.address as Address;
    const account = address ?? zeroAddress;
    try {
      const [decimals, balance, allowance, spotPrice, launchClaimable, hookEthClaimable, hookTokenClaimable, vaultEthClaimable, vaultTokenClaimable, pendingEth, pendingToken, seeded, position] = await Promise.all([
        readClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
        address ? readClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, LAUNCHPAD_ADDRESS as Address] }) : Promise.resolve(0n),
        selected.state === 'Graduated' ? Promise.resolve(0n) : readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'spotPriceWeiPerToken', args: [token] }),
        address ? readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableEth', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableToken', args: [token, account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableToken', args: [token, account] }) : Promise.resolve(0n),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingEth', args: [token] }),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingToken', args: [token] }),
        readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'seeded', args: [token] }),
        readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'positionOf', args: [token] }),
      ] as const);
      const positionTuple = position as readonly [`0x${string}`, bigint, number, number];
      setDetails({
        decimals: Number(decimals),
        balance: balance as bigint,
        allowance: allowance as bigint,
        spotPrice: spotPrice as bigint,
        launchClaimable: launchClaimable as bigint,
        hookEthClaimable: hookEthClaimable as bigint,
        hookTokenClaimable: hookTokenClaimable as bigint,
        vaultEthClaimable: vaultEthClaimable as bigint,
        vaultTokenClaimable: vaultTokenClaimable as bigint,
        pendingEth: pendingEth as bigint,
        pendingToken: pendingToken as bigint,
        seeded: Boolean(seeded),
        poolId: positionTuple[0],
        liquidity: positionTuple[1],
        tickLower: Number(positionTuple[2]),
        tickUpper: Number(positionTuple[3]),
      });
    } catch {
      setDetails(null);
    }
  }, [address, readClient, selected?.address, selected?.state]);

  useEffect(() => {
    void refreshDetails();
  }, [refreshDetails]);

  useEffect(() => {
    setGradReward(null);
    if (!readClient || !selected?.address || selected.state !== 'Locked') return;
    // `.catch` nie jest ozdoba: bez niego chwilowe odbicie RPC staje sie
    // nieobsluzonym odrzuceniem, zamiast po prostu wyczyscic wycene.
    void readClient
      .readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'gradFeeOf', args: [selected.address as Address] })
      .then((quote) => setGradReward(quote[1]))
      .catch(() => setGradReward(null));
  }, [readClient, selected?.address, selected?.state]);

  useEffect(() => {
    setSellQuote(null);
    if (!details || !selected?.address || details.decimals < 0 || sellAmount === '0' || Number(sellAmount) <= 0) return;
    try {
      const amount = parseUnits(sellAmount, details.decimals);
      void readClient
        ?.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteSell', args: [selected.address as Address, amount] })
        .then((quote) => setSellQuote(quote[0]))
        .catch(() => setSellQuote(null));
    } catch {
      setSellQuote(null);
    }
  }, [details, readClient, selected?.address, sellAmount]);

  const selectToken = (id: string, openTrade = false) => {
    setSelectedId(id);
    setTradeOpen(openTrade);
  };

  /**
   * Czy pod `LAUNCHPAD_ADDRESS` stoi wersja znajaca `launchAdvanced`.
   *
   * Sprawdzamy to ODCZYTEM `MAX_BUYBACK_BPS` - stalej, ktora pojawila sie
   * razem z rozszerzonym startem. Na starszym wdrozeniu ten odczyt odpada,
   * bo pod tym selektorem nie ma kodu. To jedyna uczciwa droga: samo ABI po
   * naszej stronie nie mowi nic o tym, co naprawde jest w lancuchu, a wyslanie
   * `launchAdvanced` "na probe" kosztowaloby tworce gaz za rewert.
   */
  useEffect(() => {
    if (!readClient) return;
    let cancelled = false;
    const read = (
      functionName:
        | 'MAX_BUYBACK_BPS'
        | 'MAX_FEE_BPS'
        | 'MAX_CREATOR_SHARE_BPS'
        | 'MAX_FEE_RECIPIENTS'
        | 'WINDOW_ADDR_CAP'
        | 'T0'
        | 'R_VIRT',
    ) => readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName });

    void (async () => {
      try {
        const [t0, rVirt] = await Promise.all([read('T0'), read('R_VIRT')]);
        if (!cancelled) {
          setCurve({ t0: Number(formatEther(t0 as bigint)), rVirt: Number(formatEther(rVirt as bigint)) });
        }
      } catch {
        // Stare wdrozenie tez ma te stale; gdy odczyt padnie, zostaja domyslne.
      }
      try {
        const [feeBps, protocolShareBps] = await Promise.all([
          readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'HOOK_FEE_BPS' }),
          readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'PROTOCOL_SHARE_BPS' }),
        ]);
        if (!cancelled) setHookSplit({ feeBps: Number(feeBps), protocolShareBps: Number(protocolShareBps) });
      } catch {
        // Podglad oplaty puli jest dodatkiem; brak odczytu go nie unieważnia.
      }
      try {
        await read('MAX_BUYBACK_BPS');
        const [maxFee, maxCreatorShare, maxRecipients, windowCap] = await Promise.all([
          read('MAX_FEE_BPS'),
          // Podloga protokolu pojawila sie razem z rozszerzonym startem, wiec
          // na starszej wersji ten odczyt nie istnieje - stad `catch`.
          read('MAX_CREATOR_SHARE_BPS').catch(() => FALLBACK_MAX_CREATOR_SHARE_BPS),
          read('MAX_FEE_RECIPIENTS'),
          read('WINDOW_ADDR_CAP'),
        ]);
        if (cancelled) return;
        const capTokens = Math.floor(Number(formatEther(windowCap as bigint)));
        setLimits({
          maxFeeBps: Number(maxFee),
          maxCreatorShareBps: Number(maxCreatorShare),
          maxRecipients: Number(maxRecipients),
          windowCapTokens: capTokens,
        });
        setLaunchFeePct((Number(maxFee) / 100).toString());
        setCreatorSharePct((Number(maxCreatorShare) / 100).toString());
        setSniperCapTokens(String(capTokens));
        setAdvancedSupported(true);
      } catch {
        if (!cancelled) setAdvancedSupported(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [readClient]);

  /**
   * Ta sama walidacja, co w `_launch`, tylko wykonana ZANIM tworca zaplaci za
   * gaz. Gdy cokolwiek sie nie zgadza, zwracamy powod po ludzku zamiast pozwolic
   * kontraktowi odbic transakcje golym `InvalidFeeConfig`.
   */
  const advanced = useMemo<{ args: AdvancedArgs | null; error: string | null }>(() => {
    const fail = (error: string) => ({ args: null, error });

    const feePct = Number(launchFeePct);
    if (!Number.isFinite(feePct) || feePct < 0) return fail('Trading fee must be a number.');
    const feeBps = Math.round(feePct * 100);
    if (feeBps > limits.maxFeeBps) {
      return fail(`Trading fee is capped at ${(limits.maxFeeBps / 100).toFixed(2)}% until the higher cap is audited.`);
    }

    const maxCreatorPct = limits.maxCreatorShareBps / 100;
    const creatorPct = Number(creatorSharePct);
    if (!Number.isFinite(creatorPct) || creatorPct < 0 || creatorPct > maxCreatorPct) {
      return fail(`Creator split must be between 0 and ${maxCreatorPct}% — the rest belongs to the protocol.`);
    }
    // Zaokraglenie W DOL. W gore potrafiloby przekroczyc podloge protokolu o
    // jeden punkt bazowy i wywalic transakcje na `InvalidFeeConfig`.
    const creatorFeeBps = Math.min(feeBps, Math.floor((feeBps * creatorPct) / 100));

    const buyPct = Number(buybackPct);
    if (!Number.isFinite(buyPct) || buyPct < 0 || buyPct > 100) return fail('Auto-buyback must be between 0 and 100%.');
    const buybackBps = Math.round(buyPct * 100);

    const windowCap = toWei(sniperCapTokens);
    const capTokens = Number(sniperCapTokens);
    if (windowCap === null || windowCap <= 0n) return fail('Per-wallet cap must be a positive number of tokens.');
    if (capTokens > limits.windowCapTokens) {
      return fail(`Per-wallet cap cannot exceed ${limits.windowCapTokens.toLocaleString('en-US')} tokens.`);
    }

    const preBuyWei = preBuyEth.trim() === '' || Number(preBuyEth) === 0 ? 0n : toWei(preBuyEth);
    if (preBuyWei === null) return fail('Pre-buy must be zero or more ETH, written as a decimal number.');

    if (receivers.length === 0) return fail('Add at least one fee receiver.');
    if (receivers.length > limits.maxRecipients) return fail(`At most ${limits.maxRecipients} fee receivers.`);

    const accounts: Address[] = [];
    const shares: number[] = [];
    let shareTotal = 0;
    for (const row of receivers) {
      const account = row.account.trim() === '' ? address : (row.account.trim() as Address);
      if (!account) return fail('Connect a wallet, or type the receiver address in full.');
      if (!isAddressLike(account)) return fail('Every fee receiver needs a valid address.');
      const sharePct = Number(row.share);
      if (!Number.isFinite(sharePct) || sharePct <= 0) return fail('Every fee receiver needs a share above zero.');
      const shareBps = Math.round(sharePct * 100);
      if (shareBps === 0) return fail('A share that rounds down to zero would be rejected on chain.');
      accounts.push(account as Address);
      shares.push(shareBps);
      shareTotal += shareBps;
    }
    // Kontrakt wymaga DOKLADNIE 10 000 bps. Zaokraglamy ostatni udzial, zeby
    // "33.33 / 33.33 / 33.34" nie wywalalo sie na jednym punkcie bazowym.
    const drift = 10_000 - shareTotal;
    if (Math.abs(drift) > receivers.length) return fail('Fee receiver shares must add up to 100%.');
    shares[shares.length - 1] += drift;
    if (shares[shares.length - 1] <= 0) return fail('Fee receiver shares must add up to 100%.');

    return {
      args: {
        feeBps,
        creatorFeeBps,
        buybackBps,
        windowCap,
        accounts,
        shares,
        metadataURI: buildMetadataUri(launchMetadataUri, launchName, launchDescription, launchImage),
        preBuyWei,
      },
      error: null,
    };
  }, [
    address,
    buybackPct,
    creatorSharePct,
    launchDescription,
    launchFeePct,
    launchImage,
    launchMetadataUri,
    launchName,
    limits,
    preBuyEth,
    receivers,
    sniperCapTokens,
  ]);

  /**
   * Ile tworca zarobi, gdy rynek zrobi dany wolumen. Noga krzywej jest pewna
   * co do wzoru (`_accrueFee`); noga puli jest gorna granica, bo auto-buyback
   * zabiera swoja czesc TYLKO z oplat po stronie ETH.
   */
  const estimate = useMemo(() => {
    const creatorFeeBps = advanced.args?.creatorFeeBps ?? 0;
    const poolCreatorBps = (hookSplit.feeBps * (10_000 - hookSplit.protocolShareBps)) / 10_000;
    return [10, 100, 1_000].map((volume) => ({
      volume,
      curve: (volume * creatorFeeBps) / 10_000,
      pool: (volume * poolCreatorBps) / 10_000,
    }));
  }, [advanced.args, hookSplit]);

  /** Podglad dev-buya po cenie startowej krzywej. Szacunek, nie gwarancja. */
  const preBuyPreview = useMemo(() => {
    const eth = Number(preBuyEth);
    if (!Number.isFinite(eth) || eth <= 0) return null;
    const feeBps = advanced.args?.feeBps ?? limits.maxFeeBps;
    const net = eth * (1 - feeBps / 10_000);
    const tokens = (curve.t0 * net) / (curve.rVirt + net);
    return { tokens, share: (tokens / curve.t0) * 100 };
  }, [advanced.args, curve, limits.maxFeeBps, preBuyEth]);

  const ensureSepolia = async () => {
    if (onSepolia) return true;
    try {
      await switchChainAsync({ chainId: LAUNCHPAD_CHAIN.id });
      return true;
    } catch {
      setNotice({ kind: 'error', text: 'Switch to Base Sepolia was cancelled. Nothing was sent.' });
      return false;
    }
  };

  const launch = async () => {
    if (!address || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet first.' });
      return;
    }
    if (!launchName.trim() || !launchSymbol.trim()) {
      setNotice({ kind: 'error', text: 'Add a name and symbol before launching.' });
      return;
    }
    const useAdvanced = advancedOpen && advancedSupported === true;
    if (useAdvanced && advanced.error) {
      setNotice({ kind: 'error', text: advanced.error });
      return;
    }
    const preBuyWei = preBuyEth.trim() === '' || Number(preBuyEth) === 0 ? 0n : toWei(preBuyEth);
    if (preBuyWei === null) {
      setNotice({ kind: 'error', text: 'Pre-buy must be zero or more ETH, written as a decimal number.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('launch');
    setNotice(null);
    try {
      const name = launchName.trim();
      const symbol = launchSymbol.trim().toUpperCase();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      // Pre-buy jedzie TA SAMA transakcja, co start, wiec miedzy stworzeniem
      // krzywej a tym kupnem nie da sie wcisnac cudzej wymiany. Krzywa startowa
      // jest deterministyczna, wiec `1` spelnia wymog `SlippageRequired`, nie
      // udajac przy tym ochrony, ktorej ten jeden przypadek nie potrzebuje.
      const minTokensOut = preBuyWei > 0n ? 1n : 0n;
      const hash = useAdvanced && advanced.args
        ? await walletClient.writeContract({
            address: LAUNCHPAD_ADDRESS as Address,
            abi: launchpadAbi,
            functionName: 'launchAdvanced',
            args: [
              name,
              symbol,
              minTokensOut,
              deadline,
              advanced.args.feeBps,
              advanced.args.creatorFeeBps,
              advanced.args.buybackBps,
              advanced.args.windowCap,
              advanced.args.accounts,
              advanced.args.shares,
              advanced.args.metadataURI,
            ],
            value: preBuyWei,
            chain: LAUNCHPAD_CHAIN,
            account: address,
          })
        : await walletClient.writeContract({
            address: LAUNCHPAD_ADDRESS as Address,
            abi: launchpadAbi,
            functionName: 'launch',
            args: [name, symbol, minTokensOut, deadline],
            value: preBuyWei,
            chain: LAUNCHPAD_CHAIN,
            account: address,
          });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The launch transaction reverted.');
      // Dev-buy emituje takze `Bought` i `FeeAccrued` z tego samego adresu,
      // wiec pierwszy log launchpada nie musi byc `Launched`. Szukamy po temacie.
      const launchedTopic = encodeEventTopics({ abi: launchpadAbi, eventName: 'Launched' })[0];
      const log = receipt.logs.find(
        (entry) => entry.address.toLowerCase() === LAUNCHPAD_ADDRESS.toLowerCase() && entry.topics[0] === launchedTopic,
      );
      if (!log) throw new Error('Launch confirmed, but its event was not readable yet.');
      const decoded = decodeEventLog({ abi: launchpadAbi, eventName: 'Launched', data: log.data, topics: log.topics });
      const tokenAddress = decoded.args.token as `0x${string}`;
      const newToken: LaunchpadToken = {
        id: tokenAddress,
        address: tokenAddress,
        name: decoded.args.name as string,
        symbol: decoded.args.symbol as string,
        // Pelny adres, nie skrocony - skracaniem zajmuje sie warstwa widoku,
        // a podwojne skrocenie dawaloby smiec.
        creator: address,
        state: 'Curve',
        raised: 0,
        target: CURVE_TARGET_ETH,
        holders: 0,
        age: 'just now',
        accent: accentFor(tokenAddress),
        live: true,
      };
      setTokens((current) => [newToken, ...current]);
      setSelectedId(newToken.id);
      setLaunchOpen(false);
      setLaunchName('');
      setLaunchSymbol('');
      setLaunchImage('');
      setLaunchDescription('');
      setLaunchMetadataUri('');
      setPreBuyEth('0');
      setNotice({ kind: 'success', text: `${newToken.symbol} is live on the curve. ${hash.slice(0, 10)}...` });
      void loadBoard();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const buy = async () => {
    if (!selected?.address || !address || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Launch a live token first. Preview rows are not connected to chain data.' });
      return;
    }
    // `toWei`, a nie `parseEther`: `Number('1e3')` jest skonczone i dodatnie,
    // ale `parseEther('1e3')` rzuca - a rzucalo POZA `try`, wiec klikniecie
    // konczylo sie nieobsluzonym odrzuceniem, bez komunikatu i bez zdjecia
    // stanu zajetosci.
    const value = toWei(buyAmount);
    if (value === null || value === 0n) {
      setNotice({ kind: 'error', text: 'Enter an ETH amount greater than zero, written as a decimal number.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('buy');
    setNotice(null);
    try {
      const quote = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteBuy', args: [selected.address, value] });
      const minTokensOut = (quote[0] * 9950n) / 10_000n;
      const hash = await walletClient.writeContract({
        address: LAUNCHPAD_ADDRESS as Address,
        abi: launchpadAbi,
        functionName: 'buy',
        args: [selected.address, minTokensOut, BigInt(Math.floor(Date.now() / 1000) + 900)],
        value,
        chain: LAUNCHPAD_CHAIN,
        account: address,
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The buy transaction reverted.');
      // launchOf: [creator, state, ethReserve, tokenReserve, startedAt, launchId]
      const onchain = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'launchOf', args: [selected.address] });
      const [, state, ethReserve] = onchain;
      setTokens((current) =>
        current.map((token) =>
          token.id === selected.id
            ? { ...token, raised: Number(formatEther(ethReserve)), state: (LAUNCH_STATE[state] as LaunchpadToken['state']) ?? token.state }
            : token,
        ),
      );
      setNotice({ kind: 'success', text: `Buy confirmed. ${hash.slice(0, 10)}...` });
      void loadBoard();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const sell = async () => {
    if (!selected?.address || !address || !walletClient || !readClient || !details) {
      setNotice({ kind: 'error', text: 'Connect a wallet and select a live token first.' });
      return;
    }
    let amount: bigint;
    try {
      amount = parseUnits(sellAmount, details.decimals);
    } catch {
      setNotice({ kind: 'error', text: 'Enter a valid token amount.' });
      return;
    }
    if (amount <= 0n || amount > details.balance) {
      setNotice({ kind: 'error', text: 'The sell amount is larger than your token balance.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('approve');
    setNotice(null);
    try {
      if (details.allowance < amount) {
        const approveHash = await walletClient.writeContract({
          address: selected.address as Address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [LAUNCHPAD_ADDRESS as Address, maxUint256],
          chain: LAUNCHPAD_CHAIN,
          account: address,
        });
        await readClient.waitForTransactionReceipt({ hash: approveHash });
      }
      setBusy('sell');
      const quote = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteSell', args: [selected.address as Address, amount] });
      const minEthOut = (quote[0] * 9950n) / 10_000n;
      const hash = await walletClient.writeContract({
        address: LAUNCHPAD_ADDRESS as Address,
        abi: launchpadAbi,
        functionName: 'sell',
        args: [selected.address as Address, amount, minEthOut, BigInt(Math.floor(Date.now() / 1000) + 900)],
        chain: LAUNCHPAD_CHAIN,
        account: address,
      });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The sell transaction reverted.');
      setSellAmount('0');
      setNotice({ kind: 'success', text: `Sell confirmed. ${hash.slice(0, 10)}...` });
      await refreshDetails();
      void loadBoard();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const graduate = async () => {
    if (!selected?.address || !address || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet before graduating this token.' });
      return;
    }
    if (selected.state !== 'Locked') {
      setNotice({ kind: 'error', text: 'Only a locked curve can be graduated.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('graduate');
    setNotice(null);
    try {
      const hash = await walletClient.writeContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'graduate', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The graduation transaction reverted.');
      setNotice({ kind: 'success', text: `Pool opened. ${hash.slice(0, 10)}...` });
      await loadBoard();
      await refreshDetails();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const settle = async () => {
    if (!selected?.address || !address || !walletClient || !readClient) return setNotice({ kind: 'error', text: 'Connect a wallet before settling fees.' });
    if (!(await ensureSepolia())) return;
    setBusy('settle');
    try {
      const hash = await walletClient.writeContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'settle', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Hook fees settled. ${hash.slice(0, 10)}...` });
      await refreshDetails();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const harvest = async () => {
    if (!selected?.address || !address || !walletClient || !readClient) return setNotice({ kind: 'error', text: 'Connect a wallet before harvesting fees.' });
    if (!(await ensureSepolia())) return;
    setBusy('harvest');
    try {
      const hash = await walletClient.writeContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'harvest', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Pool fees harvested. ${hash.slice(0, 10)}...` });
      await refreshDetails();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const claim = async (source: 'launch' | 'hookEth' | 'hookToken' | 'vaultEth' | 'vaultToken') => {
    if (!address || !walletClient || !readClient || !selected?.address) {
      setNotice({ kind: 'error', text: 'Connect a wallet before claiming.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('claim');
    try {
      const transaction = source === 'launch'
        ? { address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claim' as const, args: [] as const }
        : source === 'hookEth'
          ? { address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimEth' as const, args: [] as const }
          : source === 'hookToken'
            ? { address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimToken' as const, args: [selected.address as Address] as const }
            : source === 'vaultEth'
              ? { address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimEth' as const, args: [] as const }
              : { address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimToken' as const, args: [selected.address as Address] as const };
      const hash = await walletClient.writeContract({ ...transaction, chain: LAUNCHPAD_CHAIN, account: address } as any);
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Claim confirmed. ${hash.slice(0, 10)}...` });
      await refreshDetails();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#fcfcfd] px-4 pb-24 pt-0 font-soft sm:px-6">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="lg:hidden">
          <ActivityTicker events={activityFeed} />
        </div>

        <div className="relative overflow-hidden py-5 sm:py-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-soft-primary/[0.06] blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="font-soft-display text-[28px] font-extrabold tracking-[-0.02em] text-soft-primary-deep">MySphere <span className="text-soft-ink-muted">Launchpad</span></span>
              <label className="relative hidden w-[300px] sm:block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${FIELD} rounded-full bg-[#f3f3f5] pl-10`} placeholder="Search coins, creators" aria-label="Search coins and creators" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 text-[12px] font-bold text-[#16141b] sm:inline-flex"><Zap className="h-4 w-4 text-soft-primary" aria-hidden="true" /> Launchpad mode</span>
              <button type="button" onClick={() => setLaunchOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-white shadow-[0_6px_16px_rgba(124,107,218,0.22)] transition-transform active:scale-[0.97]"><Plus className="h-4 w-4" aria-hidden="true" /> Launch</button>
            </div>
          </div>
          <label className="relative mt-4 block sm:hidden">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${FIELD} rounded-full bg-[#f3f3f5] pl-10`} placeholder="Search coins, creators" aria-label="Search coins and creators" />
          </label>
        </div>

        {notice && <div className={`mb-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[12.5px] ${notice.kind === 'success' ? 'border-[#9de7bb] bg-[#f0fff5] text-[#08753d]' : 'border-[#f3c58a] bg-[#fff8ed] text-[#a34b08]'}`}><span className="mt-0.5">{notice.kind === 'success' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}</span><span>{notice.text}</span></div>}
        {(loadingBoard || boardError) && <div className="mb-4 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[11.5px] text-black/55"><RefreshCw className={`h-3.5 w-3.5 ${loadingBoard ? 'animate-spin text-soft-primary' : 'text-[#c76b12]'}`} aria-hidden="true" /><span>{loadingBoard ? 'Reading Launchpad activity from Base Sepolia...' : `Live data unavailable. ${boardError}`}</span></div>}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="grid gap-4">
            <SummaryCard title="Total curve reserve" value={formatEth(totalRaised)} detail={`${liveCount} active launches on Base Sepolia`} accent="#d6b7ff" icon={<CircleDollarSign className="h-6 w-6 text-[#8f45df]" />} />
            <SummaryCard title="Indexed volume" value={formatEth(totalVolume)} detail={`${totalTrades} trades reconstructed from chain`} accent="#bce2ff" icon={<TrendingUp className="h-6 w-6 text-[#24a3ee]" />} />
          </div>
          <TopLaunches tokens={tokens} onSelect={(id) => selectToken(id)} />
          <VolumePanel tokens={tokens} onSelect={(id) => selectToken(id)} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Launch filters">
            {([['all', 'All'], ['curve', 'On curve'], ['graduated', 'Graduated']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`rounded-full border px-4 py-2 text-[12px] font-extrabold transition-colors ${filter === value ? 'border-soft-primary bg-soft-primary text-white' : 'border-black/10 bg-white text-[#16141b] hover:border-soft-primary'}`}>{label}</button>)}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-black/40">Base Sepolia</span>
            <button type="button" onClick={() => setFilter('curve')} className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary"><Flame className="h-3.5 w-3.5 text-soft-primary" aria-hidden="true" /> Trending</button>
          </div>
        </div>

        <section className="mt-4 overflow-hidden rounded-[20px] border border-black/10 bg-white" aria-label="Launchpad market table">
          <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <div><h2 className="text-[16px] font-extrabold text-[#16141b]">Launchpad market</h2><p className="mt-1 text-[11px] text-black/45">{visibleTokens.length} projects in this view · {showingPreview ? 'preview rows while the first launch is indexed' : 'live event data from Base Sepolia'}</p></div>
            <span className="flex items-center gap-2">
              <span className="inline-flex overflow-hidden rounded-full border border-black/10" role="tablist" aria-label="Market layout">
                {(['grid', 'table'] as const).map((mode) => (
                  <button key={mode} type="button" role="tab" aria-selected={view === mode} onClick={() => setView(mode)} className={`px-3 py-1.5 text-[11px] font-extrabold capitalize transition-colors ${view === mode ? 'bg-soft-primary text-white' : 'bg-white text-[#16141b] hover:text-soft-primary-deep'}`}>{mode}</button>
                ))}
              </span>
              <span className="hidden items-center gap-1.5 rounded-full bg-soft-info-soft px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-soft-info sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#18bd64]" /> Testnet</span>
            </span>
          </div>
          {view === 'grid' ? (
            <div className="border-t border-black/10 p-4 sm:p-5">
              {visibleTokens.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleTokens.map((token) => <LaunchCard key={token.id} token={token} onSelect={() => selectToken(token.id)} onTrade={() => selectToken(token.id, true)} onDetails={() => window.location.assign(`/launchpad/${token.address}`)} />)}
                </div>
              ) : (
                <div className="py-14 text-center text-[13px] text-black/50">No launches match this search.</div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_0.9fr_0.8fr_1.1fr_0.8fr_auto] gap-4 border-y border-black/10 bg-[#fafafd] px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/45 sm:px-5"><span>Coin</span><span>Curve</span><span>Indexed vol</span><span>Momentum</span><span>Creator</span><span /></div>
              {visibleTokens.length > 0 ? visibleTokens.map((token) => <LaunchTableRow key={token.id} token={token} onSelect={() => selectToken(token.id)} onTrade={() => selectToken(token.id, true)} onDetails={() => window.location.assign(`/launchpad/${token.address}`)} />) : <div className="px-5 py-14 text-center text-[13px] text-black/50">No launches match this search.</div>}
            </div>
          )}
          <div className="border-t border-black/10 px-4 py-3 text-[11px] text-black/40 sm:px-5">{showingPreview ? 'Preview rows remain visible until the first deployed Launchpad event is found.' : 'Every row is reconstructed from Launchpad events and current onchain state.'}</div>
        </section>
          </div>

          <LiveRail events={activityFeed} />
        </div>
      </div>

      {(launchOpen || tradeOpen) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#16141b]/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setLaunchOpen(false); setTradeOpen(false); } }}>
          <section className={`w-full ${launchOpen ? 'max-w-[620px]' : 'max-w-[440px]'} max-h-[88vh] overflow-y-auto rounded-[22px] border border-black/10 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]`} role="dialog" aria-modal="true" aria-label={launchOpen ? 'Launch token' : 'Trade token'}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-soft-primary-deep">{launchOpen ? 'New launch' : 'Curve trade'}</p><h2 className="mt-1 text-[21px] font-extrabold text-[#16141b]">{launchOpen ? 'Put an idea on curve.' : `${selected?.symbol ?? 'Token'} market`}</h2></div><button type="button" onClick={() => { setLaunchOpen(false); setTradeOpen(false); }} className="rounded-full p-2 text-black/40 hover:bg-black/5 hover:text-[#16141b]" aria-label="Close dialog"><X className="h-5 w-5" aria-hidden="true" /></button></div>
            {launchOpen ? <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={LABEL}>Name</span><input value={launchName} onChange={(event) => setLaunchName(event.target.value)} className={FIELD} placeholder="Lumen Commons" /></label>
                <label className="block"><span className={LABEL}>Symbol</span><input value={launchSymbol} onChange={(event) => setLaunchSymbol(event.target.value.toUpperCase().slice(0, 10))} className={`${FIELD} uppercase`} placeholder="LUMEN" /></label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block"><span className={LABEL}>Image URL</span><input value={launchImage} onChange={(event) => setLaunchImage(event.target.value)} className={FIELD} placeholder="https://..." /></label>
                <label className="block">
                  <span className={LABEL}>Pre-buy (ETH)</span>
                  <input inputMode="decimal" value={preBuyEth} onChange={(event) => setPreBuyEth(event.target.value)} className={FIELD} placeholder="0" />
                  <span className={HINT}>{preBuyPreview ? `≈ ${preBuyPreview.tokens.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${launchSymbol || 'tokens'} · ${preBuyPreview.share.toFixed(2)}% of supply` : 'Buys on the same curve, with the same fee and cap as everyone else.'}</span>
                </label>
              </div>
              <label className="mt-3 block"><span className={LABEL}>Description</span><textarea rows={2} value={launchDescription} onChange={(event) => setLaunchDescription(event.target.value)} className={FIELD} placeholder="What is this token for?" /></label>

              <button type="button" onClick={() => setAdvancedOpen((current) => !current)} className="mt-4 inline-flex w-full items-center justify-between rounded-xl border border-black/10 bg-[#fbfbfd] px-3.5 py-3 text-[12.5px] font-extrabold text-[#16141b] hover:border-soft-primary/40" aria-expanded={advancedOpen}>
                <span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4 text-soft-primary" aria-hidden="true" /> Creator setup: fees, receivers, buyback, sniper cap</span>
                <span className="text-[11px] font-bold text-black/45">{advancedOpen ? 'Hide' : 'Show'}</span>
              </button>

              {advancedOpen && (
                <div className="mt-3 space-y-4 rounded-2xl border border-black/10 bg-[#fbfbfd] p-4">
                  {advancedSupported === null && <p className="text-[11.5px] text-black/50">Checking what the deployed launchpad supports...</p>}
                  {advancedSupported === false && (
                    <div className="flex items-start gap-2 rounded-xl bg-[#d78a55]/12 p-3 text-[11.5px] leading-[1.45] text-[#7a4a1d]">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>The launchpad at this address predates advanced config, so these fields cannot be sent yet. Your launch will use the default fee and cap until the new version is deployed.</span>
                    </div>
                  )}
                  <fieldset disabled={advancedSupported !== true} className="space-y-4 disabled:opacity-55">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className={LABEL}>Trading fee ({Number(launchFeePct || 0).toFixed(2)}%)</span>
                        <input type="range" min={0.1} max={limits.maxFeeBps / 100} step={0.05} value={launchFeePct} onChange={(event) => setLaunchFeePct(event.target.value)} className="w-full accent-[#7c6bda]" />
                        <span className={HINT}>Paid by traders on every buy AND every sell. Capped at {(limits.maxFeeBps / 100).toFixed(2)}%, the same rate Clanker and PONS charge. Fixed forever once launched.</span>
                      </label>
                      <label className="block">
                        <span className={LABEL}>Your share of that fee ({Number(creatorSharePct || 0).toFixed(0)}%)</span>
                        <input type="range" min={0} max={limits.maxCreatorShareBps / 100} step={5} value={creatorSharePct} onChange={(event) => setCreatorSharePct(event.target.value)} className="w-full accent-[#7c6bda]" />
                        <span className={HINT}>{Number(creatorSharePct || 0).toFixed(0)}% to your receivers, {(100 - Number(creatorSharePct || 0)).toFixed(0)}% to MySphere. The protocol floor is enforced by the contract, not this form.</span>
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className={LABEL}><Flame className="mr-1 inline h-3.5 w-3.5 text-[#d78a55]" aria-hidden="true" />Auto-buyback (%)</span>
                        <input type="range" min={0} max={100} step={5} value={buybackPct} onChange={(event) => setBuybackPct(event.target.value)} className="w-full accent-[#d78a55]" />
                        <span className={HINT}>{buybackPct}% of the pool hook&apos;s ETH fee buys your token back and burns it.</span>
                      </label>
                      <label className="block">
                        <span className={LABEL}><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-soft-primary" aria-hidden="true" />Per-wallet cap (tokens)</span>
                        <input inputMode="numeric" value={sniperCapTokens} onChange={(event) => setSniperCapTokens(event.target.value)} className={FIELD} />
                        <span className={HINT}>Sniper protection during the first {LAUNCH_WINDOW_LABEL}. Max {limits.windowCapTokens.toLocaleString('en-US')}.</span>
                      </label>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className={LABEL}>Fee receivers</span>
                        <button type="button" onClick={() => setReceivers((rows) => (rows.length >= limits.maxRecipients ? rows : [...rows, { account: '', share: '0' }]))} className="inline-flex items-center gap-1 text-[11px] font-extrabold text-soft-primary-deep disabled:opacity-40" disabled={receivers.length >= limits.maxRecipients}>
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                        </button>
                      </div>
                      <div className="space-y-2">
                        {receivers.map((row, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input value={row.account} onChange={(event) => setReceivers((rows) => rows.map((item, position) => (position === index ? { ...item, account: event.target.value } : item)))} className={`${FIELD} flex-1`} placeholder={index === 0 ? 'you (leave empty)' : '0x...'} />
                            <input inputMode="decimal" value={row.share} onChange={(event) => setReceivers((rows) => rows.map((item, position) => (position === index ? { ...item, share: event.target.value } : item)))} className={`${FIELD} w-[86px] text-right`} aria-label="Share in percent" />
                            <span className="text-[12px] font-bold text-black/40">%</span>
                            <button type="button" onClick={() => setReceivers((rows) => (rows.length === 1 ? rows : rows.filter((_, position) => position !== index)))} disabled={receivers.length === 1} className="rounded-full p-1.5 text-black/35 hover:bg-black/5 hover:text-[#16141b] disabled:opacity-30" aria-label="Remove receiver">
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <span className={HINT}>Shares must add up to 100%. Up to {limits.maxRecipients} addresses.</span>
                    </div>

                    <label className="block">
                      <span className={LABEL}>Metadata URI (optional)</span>
                      <input value={launchMetadataUri} onChange={(event) => setLaunchMetadataUri(event.target.value)} className={FIELD} placeholder="ipfs://... — overrides image and description" />
                    </label>

                    <div className="rounded-xl border border-black/10 bg-white p-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-soft-primary-deep"><CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" /> What you earn</p>
                      <table className="mt-2 w-full text-[12px]">
                        <thead><tr className="text-left text-[10.5px] uppercase tracking-[0.08em] text-black/40"><th className="pb-1 font-bold">Volume</th><th className="pb-1 text-right font-bold">On curve</th><th className="pb-1 text-right font-bold">In pool</th></tr></thead>
                        <tbody>
                          {estimate.map((row) => (
                            <tr key={row.volume} className="border-t border-black/5">
                              <td className="py-1.5 text-black/55">{row.volume} ETH</td>
                              <td className="py-1.5 text-right font-extrabold text-[#16141b]">{row.curve.toFixed(3)} ETH</td>
                              <td className="py-1.5 text-right font-extrabold text-[#16141b]">{row.pool.toFixed(3)} ETH</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <span className={HINT}>Curve earnings are exact for the fee you picked. Pool earnings assume the hook&apos;s {(hookSplit.feeBps / 100).toFixed(2)}% swap fee and your {((10_000 - hookSplit.protocolShareBps) / 100).toFixed(0)}% share of it, before any auto-buyback is taken out.</span>
                    </div>
                  </fieldset>
                  {advancedSupported === true && advanced.error && (
                    <p className="rounded-xl bg-[#d9628a]/12 px-3 py-2 text-[11.5px] font-bold text-[#8d2748]">{advanced.error}</p>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-start gap-2 rounded-xl bg-soft-primary/10 p-3 text-[11.5px] leading-[1.45] text-black/60"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" /><span>One transaction creates the token and starts its Base Sepolia curve. You get no free supply — a pre-buy is a normal buy on the same curve.</span></div>
              <div className="mt-5 flex items-center justify-between gap-3"><span className="text-[11px] text-black/45">{advancedOpen && advancedSupported === true ? 'Launching with your creator setup' : 'Launching with protocol defaults'} · {isConnected ? (onSepolia ? 'Base Sepolia ready' : 'Wallet will switch to Sepolia') : 'Connect wallet from the main navigation'}</span><button type="button" disabled={busy === 'launch' || !isConnected || (advancedOpen && advancedSupported === true && advanced.error !== null)} onClick={launch} className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-white disabled:opacity-60">{busy === 'launch' ? 'Launching...' : 'Launch on curve'}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button></div>
            </> : selected ? <>
              <div className="mt-5 flex items-center gap-3"><TokenGlyph token={selected} large /><div><div className="flex items-center gap-2"><span className="text-[16px] font-extrabold text-[#16141b]">{selected.symbol}</span><StatePill state={selected.state} /></div><p className="mt-1 text-[12px] text-black/45">{selected.name} · {curvePercent(selected)}% of curve</p></div></div>
              {selected.live ? <TradePanel token={selected} details={details} side={tradeSide} setSide={setTradeSide} buyAmount={buyAmount} setBuyAmount={setBuyAmount} sellAmount={sellAmount} setSellAmount={setSellAmount} sellQuote={sellQuote} gradReward={gradReward} busy={busy} onBuy={buy} onSell={sell} onGraduate={graduate} onSettle={settle} onHarvest={harvest} onClaim={claim} isConnected={isConnected} /> : <div className="mt-5 flex items-start gap-2 rounded-xl bg-[#f5f5f7] p-3 text-[11.5px] leading-[1.45] text-black/55"><WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" /><span>This is a preview row. Launch a token to activate the live trade panel.</span></div>}
              <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4 text-[11px] text-black/45"><span>{selected.holders} holders · {selected.trades ?? 0} trades</span><span className="flex items-center gap-2"><button type="button" onClick={() => void navigator.clipboard?.writeText(selected.address ?? selected.id)} className="inline-flex items-center gap-1.5 font-bold hover:text-soft-primary-deep"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy address</button>{selected.address && <button type="button" onClick={() => window.location.assign(`/launchpad/${selected.address}`)} className="inline-flex items-center gap-1.5 font-bold text-soft-primary-deep hover:text-soft-primary"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Details</button>}</span></div>
            </> : null}
          </section>
        </div>
      )}
    </main>
  );
}
