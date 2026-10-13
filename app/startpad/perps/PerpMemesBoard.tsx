'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatEther, getAddress, parseEther, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Megaphone, Rocket, Swords, Users, X, Zap } from 'lucide-react';
import { DEFAULT_LAUNCHPAD_CHAIN_ID, LAUNCH_STATE, LAUNCHPAD_NETWORKS, launchpadAbi } from '../config';
import { fetchBoardStatsFor } from '../boardStats';
import { fetchLogos } from '../logos';
import { formatUsd } from '../useEthUsd';
import { zapBuyWithEth } from '../perpZap';
import { tradeErrorMessage } from '../[address]/detailShared';
import { CallCard, type Call } from '../calls/CallsBoard';
import type { RaidView } from '../raid';
import PerpAvatar, { PerpCornerBadge } from './PerpAvatar';
import ClashSection from './ClashSection';

/**
 * PERPS HUB - wszystkie rynki memow sparowanych z perpami Flash na jednej,
 * zwartej stronie. Uklad z researchu 2026-10-13 (Flash, Zora, Hyperliquid,
 * Axiom/Photon, pump.fun):
 *   - przypiety pasek perpow z ruchem 24h = filtr calej strony (?perp=);
 *   - zwarty naglowek wybranego perpa i JEDNO wezwanie do startu;
 *   - zakladki Memes / Clash / Calls / Raids zamiast sekcji jedna pod druga;
 *   - memy w gestych wierszach wg etapu (nowe / blisko graduacji / w puli) z
 *     szybkim kupnem za ETH prosto z listy (PerpZap, presety kwot).
 *
 * Dane jak dotad: agregat i indeks startow per rynek, multicall `launchOf`
 * (rezerwy -> zbiorka i cena spot), NAV/24h/dzwignia z /api/launchpad/perps.
 */

const CHAIN_ID = DEFAULT_LAUNCHPAD_CHAIN_ID;
const NETWORK = LAUNCHPAD_NETWORKS[CHAIN_ID];
const T0 = 1_000_000_000;
const PRESETS = ['0.001', '0.01', '0.05'] as const;
const PRESET_KEY = 'mysphere:perps:quickbuy';

type Perp = {
  id: string;
  symbol: string;
  address: Address;
  name: string;
  priceUsd: number | null;
  change24hPct: number | null;
  leverage: number | null;
  launchpad: Address;
  rVirt: number;
};

type Meme = {
  address: Address;
  symbol: string;
  name: string;
  perpId: string;
  perpAddress: Address;
  launchpad: Address;
  state: 'Curve' | 'Locked' | 'Graduated';
  raised: number;
  target: number;
  /** Cena spot w perpie za token. */
  price: number;
  volume: number;
  traders: number;
  startedAt: number;
  logo?: string;
};

type Tab = 'memes' | 'clash' | 'calls' | 'raids';
type Stage = 'new' | 'graduating' | 'pool';

function fmtUnits(value: number): string {
  if (!Number.isFinite(value)) return '--';
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return value.toLocaleString('en-US', { maximumSignificantDigits: 3 });
}

function age(startedAt: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - startedAt);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function accent(address: string): string {
  return `hsl(${parseInt(address.slice(-6), 16) % 360} 70% 55%)`;
}

function stageOf(m: Meme): Stage {
  if (m.state === 'Graduated') return 'pool';
  if (m.state === 'Locked' || m.raised / m.target >= 0.5) return 'graduating';
  return 'new';
}

function readParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function writeParams(next: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(next)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(null, '', url.toString());
}

export default function PerpMemesBoard() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const { data: wallet } = useWalletClient();
  const { address: account } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [perps, setPerps] = useState<Perp[]>([]);
  const [memes, setMemes] = useState<Meme[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('all');
  const [tab, setTab] = useState<Tab>('memes');
  const [stage, setStage] = useState<Stage>('new');
  const [preset, setPreset] = useState<string>(PRESETS[1]);
  const [picker, setPicker] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string; href?: string } | null>(null);
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [raids, setRaids] = useState<RaidView[] | null>(null);
  const [clashCount, setClashCount] = useState<number | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // Stan z URL (link do konkretnego perpa / zakladki) i zapamietany preset.
  useEffect(() => {
    const p = readParam('perp');
    const t = readParam('tab') as Tab | null;
    if (p) setSelected(p);
    if (t && ['memes', 'clash', 'calls', 'raids'].includes(t)) setTab(t);
    try {
      const saved = window.localStorage.getItem(PRESET_KEY);
      if (saved && (PRESETS as readonly string[]).includes(saved)) setPreset(saved);
    } catch {
      // prywatne okno - zostaje domyslny preset
    }
    const c = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(c);
  }, []);

  const pickPerp = (id: string) => {
    setSelected(id);
    writeParams({ perp: id === 'all' ? null : id });
  };
  const pickTab = (t: Tab) => {
    setTab(t);
    writeParams({ tab: t === 'memes' ? null : t });
  };
  const pickPreset = (p: string) => {
    setPreset(p);
    try {
      window.localStorage.setItem(PRESET_KEY, p);
    } catch {
      // bez pamieci - preset tylko na te wizyte
    }
  };

  // Perpy: lista z naszej konfiguracji + NAV/24h/dzwignia z Flash.
  useEffect(() => {
    let cancelled = false;
    const fallback = (): Perp[] =>
      (NETWORK.markets ?? []).map((m) => ({
        id: m.id,
        symbol: m.quote.symbol,
        address: m.quote.address as Address,
        name: m.label,
        priceUsd: null,
        change24hPct: null,
        leverage: null,
        launchpad: m.launchpad as Address,
        rVirt: m.rVirt,
      }));
    const load = async () => {
      try {
        const response = await fetch(`/api/launchpad/perps?chainId=${CHAIN_ID}`);
        const body = (await response.json()) as { perps?: Perp[] };
        if (!cancelled) setPerps(Array.isArray(body.perps) && body.perps.length ? body.perps : fallback());
      } catch {
        if (!cancelled) setPerps(fallback());
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Memy: agregat + indeks startow + stan krzywej (rezerwy) z lancucha, per rynek.
  const loadMemes = useCallback(async () => {
    if (!client) return;
    const markets = NETWORK.markets ?? [];
    const logos = await fetchLogos(CHAIN_ID).catch(() => ({}) as Record<string, string>);
    const perMarket = await Promise.all(
      markets.map(async (m) => {
        const [stats, index] = await Promise.all([
          fetchBoardStatsFor(CHAIN_ID, m.id),
          fetch(`/api/launchpad/board?chainId=${CHAIN_ID}&m=${encodeURIComponent(m.id)}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null) as Promise<{ tokens?: Array<{ address?: string; name?: string; symbol?: string; startedAt?: number }> } | null>,
        ]);
        const meta = new Map<string, { name: string; symbol: string; startedAt: number }>();
        for (const [token, info] of stats?.aggregate.launched ?? []) meta.set(token.toLowerCase(), { name: info.name, symbol: info.symbol, startedAt: info.startedAt });
        for (const entry of index?.tokens ?? []) {
          const raw = entry.address ?? '';
          if (!/^0x[0-9a-fA-F]{40}$/.test(raw) || meta.has(raw.toLowerCase())) continue;
          meta.set(raw.toLowerCase(), { name: entry.name ?? '', symbol: entry.symbol ?? '', startedAt: Number(entry.startedAt ?? 0) });
        }
        const addresses = [...meta.keys()].map((a) => getAddress(a) as Address);
        if (addresses.length === 0) return [] as Meme[];
        const states = await client.multicall({
          allowFailure: true,
          contracts: addresses.map((token) => ({ address: m.launchpad as Address, abi: launchpadAbi, functionName: 'launchOf' as const, args: [token] as const })),
        });
        const target = m.rVirt * 4;
        const out: Meme[] = [];
        addresses.forEach((token, i) => {
          const r = states[i];
          if (r?.status !== 'success') return;
          const [, stateIndex, reserve, tokenReserve, startedAt] = r.result as readonly [Address, number, bigint, bigint, number, `0x${string}`];
          if (Number(stateIndex) === 0) return;
          const state = LAUNCH_STATE[Number(stateIndex)] as Meme['state'];
          const info = meta.get(token.toLowerCase())!;
          const activity = [...(stats?.aggregate.activity ?? [])].find(([k]) => k.toLowerCase() === token.toLowerCase())?.[1];
          const buyers = [...(stats?.aggregate.buyers ?? [])].find(([k]) => k.toLowerCase() === token.toLowerCase())?.[1];
          const raised = Number(formatEther(reserve));
          const tr = Number(formatEther(tokenReserve));
          out.push({
            address: token,
            symbol: info.symbol || token.slice(0, 6),
            name: info.name,
            perpId: m.id,
            perpAddress: m.quote.address as Address,
            launchpad: m.launchpad as Address,
            state,
            raised: state === 'Graduated' ? target : raised,
            target,
            price: state === 'Graduated' ? (m.rVirt * 5) / 200_000_000 : tr > 0 ? (m.rVirt + raised) / tr : 0,
            volume: activity?.volume ?? 0,
            traders: buyers?.size ?? 0,
            startedAt: Number(startedAt) || info.startedAt,
            logo: logos[token.toLowerCase()],
          });
        });
        return out;
      })
    );
    setMemes(perMarket.flat());
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void loadMemes().catch(() => setLoading(false));
  }, [loadMemes]);

  // Liczniki i dane zakladek (lekkie, raz na wejscie + co minute).
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/launchpad/calls')
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { calls?: Call[] } | null) => !cancelled && setCalls(b?.calls ?? []))
        .catch(() => !cancelled && setCalls((c) => c ?? []));
      fetch('/api/launchpad/raids')
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { raids?: RaidView[] } | null) => !cancelled && setRaids(b?.raids ?? []))
        .catch(() => !cancelled && setRaids((r) => r ?? []));
      fetch('/api/launchpad/clashes')
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { clashes?: unknown[] } | null) => !cancelled && setClashCount(b?.clashes?.length ?? 0))
        .catch(() => {});
    };
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const perpById = useMemo(() => new Map(perps.map((p) => [p.id, p])), [perps]);
  const sel = selected === 'all' ? null : perpById.get(selected) ?? null;
  const usdOf = (m: Meme, units: number) => {
    const p = perpById.get(m.perpId)?.priceUsd;
    return p ? units * p : null;
  };
  const inScope = memes.filter((m) => selected === 'all' || m.perpId === selected);
  const byStage = (s: Stage) => inScope.filter((m) => stageOf(m) === s);
  const visible = useMemo(() => {
    const list = inScope.filter((m) => stageOf(m) === stage);
    if (stage === 'new') return [...list].sort((a, b) => b.startedAt - a.startedAt);
    if (stage === 'graduating') return [...list].sort((a, b) => b.raised / b.target - a.raised / a.target);
    return [...list].sort((a, b) => (usdOf(b, b.volume) ?? 0) - (usdOf(a, a.volume) ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memes, selected, stage, perps]);

  const perpLaunchpads = useMemo(() => new Set((NETWORK.markets ?? []).map((m) => m.launchpad.toLowerCase())), []);
  const scopedCalls = (calls ?? []).filter((c) => (selected === 'all' ? c.marketId !== null : c.marketId === selected));
  const scopedRaids = (raids ?? []).filter((r) => {
    if (!perpLaunchpads.has(r.launchpad.toLowerCase())) return false;
    if (selected === 'all') return true;
    return r.launchpad.toLowerCase() === perpById.get(selected)?.launchpad.toLowerCase();
  });
  const openRaids = scopedRaids.filter((r) => r.status === 'Open' && now < r.expiresAt);
  const raisedUsd = inScope.reduce((sum, m) => sum + (usdOf(m, m.raised) ?? 0), 0);

  // Start: modal tablicy rynku (zgoda, logo, wiadomosci) - wybrany perp albo picker.
  const launchOn = (perpId: string) => {
    window.location.href = `/startpad?m=${encodeURIComponent(perpId)}&launch=1`;
  };

  const quickBuy = async (m: Meme) => {
    setNotice(null);
    if (!account || !wallet || !client) {
      setNotice({ kind: 'err', text: 'Connect a wallet (top right) to buy with ETH.' });
      return;
    }
    if (chainId !== CHAIN_ID) {
      try {
        await switchChainAsync({ chainId: CHAIN_ID });
      } catch {
        setNotice({ kind: 'err', text: 'Switch to Base was cancelled. Nothing was sent.' });
        return;
      }
    }
    setBuying(m.address);
    try {
      const { hash, tokensOut } = await zapBuyWithEth({
        client,
        wallet,
        account,
        launchpad: m.launchpad,
        token: m.address,
        perp: m.perpAddress,
        value: parseEther(preset),
        slippageBps: 300,
      });
      setNotice({
        kind: 'ok',
        text: `Bought ${fmtUnits(Number(formatEther(tokensOut)))} $${m.symbol} for ${preset} ETH.`,
        href: `https://basescan.org/tx/${hash}`,
      });
      void loadMemes();
    } catch (cause) {
      setNotice({ kind: 'err', text: tradeErrorMessage(cause) });
    } finally {
      setBuying(null);
    }
  };

  const tabs: Array<{ id: Tab; label: string; icon: JSX.Element; count: number | null }> = [
    { id: 'memes', label: 'Memes', icon: <Rocket className="h-3.5 w-3.5" aria-hidden="true" />, count: loading ? null : inScope.length },
    { id: 'clash', label: 'Clash', icon: <Swords className="h-3.5 w-3.5" aria-hidden="true" />, count: clashCount },
    { id: 'calls', label: 'Calls', icon: <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />, count: calls === null ? null : scopedCalls.length },
    { id: 'raids', label: 'Raids', icon: <Users className="h-3.5 w-3.5" aria-hidden="true" />, count: raids === null ? null : openRaids.length },
  ];

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/startpad" className="inline-flex items-center gap-1 text-[12px] font-bold text-sp-shade/50 hover:text-soft-primary-deep">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Startpad
          </Link>
          <h1 className="font-soft-display text-[26px] font-extrabold leading-tight text-sp-ink">Perp memes</h1>
        </div>
        <button
          type="button"
          onClick={() => (sel ? launchOn(sel.id) : setPicker(true))}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-sp-on-brand shadow-[0_8px_24px_rgba(124,92,255,0.25)]"
        >
          <Rocket className="h-4 w-4" aria-hidden="true" /> {sel ? `Launch on ${sel.symbol}` : 'Launch a meme'}
        </button>
      </div>

      {/* PASEK PERPOW - filtr calej strony. Przypiety pod nawigacja. */}
      <div className="sticky top-[58px] z-30 sm:top-[73px] -mx-4 mt-3 border-y border-sp-shade/10 bg-sp-bg/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filter by perp">
          <RailChip active={selected === 'all'} onClick={() => pickPerp('all')}>
            <span className="text-[12.5px] font-extrabold">All</span>
            <span className="text-[11px] font-bold text-sp-shade/45">{perps.length}</span>
          </RailChip>
          {perps.map((p) => (
            <RailChip key={p.id} active={selected === p.id} onClick={() => pickPerp(p.id)}>
              <PerpAvatar symbol={p.symbol} size={22} change={p.change24hPct} glow={selected === p.id} />
              <span className="text-[12.5px] font-extrabold">{p.symbol.replace(/2xL$/i, '')}</span>
              <Change value={p.change24hPct} />
            </RailChip>
          ))}
        </div>
      </div>

      {/* NAGLOWEK wybranego perpa / calosci */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[18px] border border-sp-shade/10 bg-sp-surface px-4 py-3">
        {sel ? (
          <>
            <div className="flex items-center gap-3">
              <PerpAvatar symbol={sel.symbol} size={36} change={sel.change24hPct} glow />
              <div>
                <div className="text-[15px] font-extrabold text-sp-ink">{sel.symbol}</div>
                <div className="text-[11.5px] text-sp-shade/50">{sel.name}</div>
              </div>
            </div>
            <Stat label="NAV" value={sel.priceUsd !== null ? formatUsd(sel.priceUsd) : '--'} />
            <Stat label="24h" value={<Change value={sel.change24hPct} big />} />
            <Stat label="Leverage" value={sel.leverage ? `${sel.leverage.toFixed(2)}x` : '--'} />
          </>
        ) : (
          <p className="max-w-[440px] text-[12.5px] leading-[1.45] text-sp-shade/60">
            Memes paired with Flash 2x perps. Buy any of them with plain ETH in one transaction: your meme rides the curve, the pair rides 2x.
          </p>
        )}
        <Stat label="Memes" value={loading ? '--' : String(inScope.length)} />
        <Stat label="Raised" value={loading ? '--' : formatUsd(raisedUsd)} />
      </div>

      {/* ZAKLADKI */}
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-sp-shade/10" role="tablist" aria-label="Perp features">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pickTab(t.id)}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-extrabold transition-colors ${
              tab === t.id ? 'border-soft-primary text-sp-ink' : 'border-transparent text-sp-shade/50 hover:text-sp-ink'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className={`rounded-full px-1.5 text-[10.5px] ${tab === t.id ? 'bg-soft-primary text-sp-on-brand' : 'bg-sp-sunken text-sp-shade/60'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {notice && (
        <div className={`mt-3 flex items-start justify-between gap-3 rounded-xl px-3.5 py-2.5 text-[12.5px] font-bold ${notice.kind === 'ok' ? 'bg-sp-up/10 text-sp-up' : 'bg-sp-down/10 text-sp-down-deep'}`}>
          <span>
            {notice.text}{' '}
            {notice.href && (
              <a href={notice.href} target="_blank" rel="noreferrer" className="underline">
                View tx
              </a>
            )}
          </span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {tab === 'memes' && (
        <section className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full bg-sp-sunken p-1" role="tablist" aria-label="Stage">
              {(
                [
                  ['new', 'New'],
                  ['graduating', 'Graduating'],
                  ['pool', 'In pool'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={stage === id}
                  onClick={() => setStage(id)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold ${stage === id ? 'bg-sp-surface text-sp-ink shadow-sm' : 'text-sp-shade/55 hover:text-sp-ink'}`}
                >
                  {label} <span className="text-sp-shade/40">{loading ? '' : byStage(id).length}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-sp-shade/55">
              <Zap className="h-3.5 w-3.5 text-soft-primary" aria-hidden="true" /> Quick buy
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => pickPreset(p)}
                  className={`rounded-full border px-2.5 py-1 font-extrabold ${preset === p ? 'border-soft-primary bg-sp-brand-soft text-soft-primary-deep' : 'border-sp-shade/10 text-sp-shade/55 hover:text-sp-ink'}`}
                >
                  {p}
                </button>
              ))}
              <span>ETH</span>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-[18px] border border-sp-shade/10 bg-sp-surface">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_0.8fr_1.2fr_0.7fr_0.5fr_auto] gap-3 border-b border-sp-shade/10 px-4 py-2 text-[11px] font-bold text-sp-shade/45 md:grid">
              <span>Meme</span>
              <span>Market cap</span>
              <span>To graduation</span>
              <span>Volume</span>
              <span>Age</span>
              <span className="w-[92px] text-right">Buy</span>
            </div>
            {loading ? (
              Array.from({ length: 3 }, (_, i) => <div key={i} className="h-[60px] animate-pulse border-b border-sp-shade/5 bg-sp-sunken/40 last:border-0" />)
            ) : visible.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[14px] font-extrabold text-sp-ink">
                  {stage === 'new' ? `No new memes${sel ? ` on ${sel.symbol}` : ''} yet` : stage === 'graduating' ? 'Nothing close to graduation yet' : 'No meme has graduated yet'}
                </p>
                {stage === 'new' && (
                  <button type="button" onClick={() => (sel ? launchOn(sel.id) : setPicker(true))} className="mt-3 rounded-full bg-soft-primary px-4 py-2 text-[12.5px] font-extrabold text-sp-on-brand">
                    Launch the first one
                  </button>
                )}
              </div>
            ) : (
              visible.map((m) => (
                <MemeRow
                  key={m.address}
                  meme={m}
                  perp={perpById.get(m.perpId)}
                  mcapUsd={usdOf(m, m.price * T0)}
                  volumeUsd={usdOf(m, m.volume)}
                  preset={preset}
                  busy={buying === m.address}
                  disabled={buying !== null}
                  onBuy={() => void quickBuy(m)}
                />
              ))
            )}
          </div>
          <p className="mt-3 text-[11px] leading-[1.5] text-sp-shade/45">
            Quick buy routes your ETH through USDC into the perp and buys the meme in one transaction (3% max price change). Perps are issued by
            Flash: each is a 2x position on Morpho priced by NAV, and can lose most of its value in a large move against it.
          </p>
        </section>
      )}

      {tab === 'clash' && (
        <div className="mt-3">
          <ClashSection embedded />
        </div>
      )}

      {tab === 'calls' && (
        <section className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] text-sp-shade/60">Buys with a message, scored by price since the buy. ✓ = Coinbase verified.</p>
            <Link href="/calls" className="shrink-0 text-[12px] font-extrabold text-soft-primary-deep hover:underline">
              Leaderboard
            </Link>
          </div>
          {calls === null ? (
            <p className="mt-4 text-[12.5px] text-sp-shade/45">Reading calls...</p>
          ) : scopedCalls.length === 0 ? (
            <div className="mt-3 rounded-[18px] border border-dashed border-sp-shade/20 px-5 py-8 text-center text-[13px] text-sp-shade/55">
              No calls on {sel ? sel.symbol : 'perp memes'} yet. Buy a meme and add a message on its page: that is a call.
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scopedCalls.map((c) => (
                <CallCard key={`${c.txHash}-${c.token}`} call={c} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'raids' && (
        <section className="mt-3">
          <p className="text-[12.5px] text-sp-shade/60">Crews pool ETH, the leader fires one buy at T-0, everyone claims their share. Start one from a meme&apos;s page.</p>
          {raids === null ? (
            <p className="mt-4 text-[12.5px] text-sp-shade/45">Reading raids...</p>
          ) : scopedRaids.length === 0 ? (
            <div className="mt-3 rounded-[18px] border border-dashed border-sp-shade/20 px-5 py-8 text-center text-[13px] text-sp-shade/55">
              No raids yet. Open any meme and press Start a raid.
            </div>
          ) : (
            <div className="mt-3 overflow-hidden rounded-[18px] border border-sp-shade/10 bg-sp-surface">
              {scopedRaids.map((r) => {
                const meme = memes.find((m) => m.address.toLowerCase() === r.token.toLowerCase());
                const live = r.status === 'Open' && now < r.expiresAt;
                const label = r.status === 'Executed' ? 'Fired' : r.status === 'Cancelled' ? 'Cancelled' : !live ? 'Expired' : now < r.executeAfter ? `T-${clock(r.executeAfter - now)}` : 'Ready to fire';
                return (
                  <Link
                    key={r.id}
                    href={`/startpad/${r.token.toLowerCase()}${meme ? `?m=${meme.perpId}` : ''}`}
                    className="flex items-center gap-3 border-b border-sp-shade/5 px-4 py-3 last:border-0 hover:bg-sp-sunken/50"
                  >
                    {meme && <PerpAvatar symbol={perpById.get(meme.perpId)?.symbol ?? 'ETH2xL'} size={26} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-extrabold text-sp-ink">${meme?.symbol ?? r.token.slice(0, 8)}</span>
                      {r.note && <span className="block truncate text-[11.5px] text-sp-shade/50">“{r.note}”</span>}
                    </span>
                    <span className="text-right text-[13px] font-extrabold text-sp-ink">{fmtUnits(Number(formatEther(BigInt(r.totalEth))))} ETH</span>
                    <span className={`w-[96px] text-right text-[11.5px] font-extrabold ${live ? 'text-amber-600' : 'text-sp-shade/45'}`}>{label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Choose a perp">
          <div className="w-full max-w-[420px] rounded-[22px] border border-sp-shade/10 bg-sp-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-extrabold text-sp-ink">Pair your meme with</h2>
              <button type="button" onClick={() => setPicker(false)} className="rounded-full p-1.5 text-sp-shade/50 hover:bg-sp-sunken" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-[12px] text-sp-shade/55">Buyers pay with ETH, the curve raises this perp.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {perps.map((p) => (
                <button key={p.id} type="button" onClick={() => launchOn(p.id)} className="flex items-center gap-2.5 rounded-xl border border-sp-shade/10 px-3 py-2.5 text-left hover:border-soft-primary">
                  <PerpAvatar symbol={p.symbol} size={30} change={p.change24hPct} glow />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-extrabold text-sp-ink">{p.symbol}</span>
                    <Change value={p.change24hPct} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function clock(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function RailChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${
        active ? 'border-soft-primary bg-sp-brand-soft text-sp-ink' : 'border-sp-shade/10 bg-sp-surface text-sp-ink hover:border-soft-primary/50'
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-[64px]">
      <div className="text-[11px] font-bold text-sp-shade/45">{label}</div>
      <div className="font-soft-display text-[16px] font-extrabold leading-tight text-sp-ink">{value}</div>
    </div>
  );
}

function Change({ value, big = false }: { value: number | null; big?: boolean }) {
  if (value === null) return <span className="text-[11px] font-bold text-sp-shade/40">--</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-extrabold ${big ? 'text-[16px]' : 'text-[11px]'} ${up ? 'text-sp-up' : 'text-sp-down-deep'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function MemeRow({
  meme,
  perp,
  mcapUsd,
  volumeUsd,
  preset,
  busy,
  disabled,
  onBuy,
}: {
  meme: Meme;
  perp: Perp | undefined;
  mcapUsd: number | null;
  volumeUsd: number | null;
  preset: string;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  const href = `/startpad/${meme.address.toLowerCase()}?m=${encodeURIComponent(meme.perpId)}`;
  const progress = Math.max(0, Math.min(100, (meme.raised / meme.target) * 100));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-sp-shade/5 px-4 py-3 last:border-0 hover:bg-sp-sunken/40 md:grid-cols-[minmax(0,1.6fr)_0.8fr_1.2fr_0.7fr_0.5fr_auto]">
      <Link href={href} className="flex min-w-0 items-center gap-3">
        <span className="relative shrink-0">
          {meme.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meme.logo} alt="" width={38} height={38} className="h-[38px] w-[38px] rounded-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full text-[12px] font-extrabold text-white" style={{ backgroundColor: accent(meme.address) }}>
              {meme.symbol.slice(0, 2).toUpperCase()}
            </span>
          )}
          {perp && <PerpCornerBadge symbol={perp.symbol} size={17} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-extrabold text-sp-ink">${meme.symbol}</span>
          <span className="block truncate text-[11.5px] text-sp-shade/50">
            {meme.name} · on {perp?.symbol ?? meme.perpId}
          </span>
        </span>
      </Link>
      <span className="hidden font-soft-display text-[15px] font-extrabold text-sp-ink md:block">{mcapUsd !== null ? formatUsd(mcapUsd) : '--'}</span>
      <span className="col-span-2 flex items-center gap-2 md:col-span-1">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sp-shade/10">
          <span className="block h-full rounded-full bg-soft-primary" style={{ width: `${progress}%` }} />
        </span>
        <span className="w-[38px] text-right text-[11px] font-extrabold text-sp-shade/60">{meme.state === 'Graduated' ? 'pool' : `${progress.toFixed(0)}%`}</span>
        <span className="text-[11px] font-bold text-sp-shade/45 md:hidden">{mcapUsd !== null ? formatUsd(mcapUsd) : ''}</span>
      </span>
      <span className="hidden text-[12.5px] font-bold text-sp-shade/60 md:block">{volumeUsd !== null ? formatUsd(volumeUsd) : '--'}</span>
      <span className="hidden text-[12.5px] font-bold text-sp-shade/50 md:block">{age(meme.startedAt)}</span>
      {meme.state === 'Curve' ? (
        <button
          type="button"
          onClick={onBuy}
          disabled={disabled}
          className="row-start-1 col-start-2 inline-flex w-[92px] items-center justify-center gap-1 rounded-full bg-soft-primary px-3 py-2 text-[12px] font-extrabold text-sp-on-brand disabled:opacity-50 md:row-start-auto md:col-start-auto"
          aria-label={`Buy ${meme.symbol} for ${preset} ETH`}
        >
          <Zap className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? '...' : preset}
        </button>
      ) : (
        <Link href={href} className="row-start-1 col-start-2 inline-flex w-[92px] items-center justify-center rounded-full border border-sp-shade/15 px-3 py-2 text-[12px] font-extrabold text-sp-ink md:row-start-auto md:col-start-auto">
          {meme.state === 'Locked' ? 'Graduating' : 'Trade'}
        </Link>
      )}
    </div>
  );
}
