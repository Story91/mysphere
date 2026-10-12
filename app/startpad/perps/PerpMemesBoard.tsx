'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PerpAvatar, { PerpCornerBadge } from './PerpAvatar';
import { formatEther, getAddress, type Address } from 'viem';
import { usePublicClient } from 'wagmi';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Rocket, X, Zap } from 'lucide-react';
import { DEFAULT_LAUNCHPAD_CHAIN_ID, LAUNCH_STATE, LAUNCHPAD_NETWORKS, launchpadAbi } from '../config';
import { fetchBoardStatsFor } from '../boardStats';
import { fetchLogos } from '../logos';
import { formatUsd } from '../useEthUsd';

/**
 * PERP MEMES - jeden widok na wszystkie rynki memow sparowanych z perpami Flash.
 *
 * Kazdy perp (ETH2xL, NVDA2xL...) to osobny launchpad Q z wlasnymi jednostkami,
 * wiec tablica sieci pokazywala je jako cztery osobne okna. Tu sa razem, jak
 * w aplikacji Flash: perpy po lewej, memy w jednej siatce obok. Kwoty memow
 * sa w jednostkach ICH perpa, a porownywalne miedzy rynkami dopiero w $
 * (jednostki x NAV perpa) - i po tej liczbie sortujemy.
 *
 * Dane: agregat tablicy z serwera (`/api/launchpad/board/stats?m=`) i indeks
 * startow (`/api/launchpad/board?m=`) dla kazdego rynku + jeden multicall
 * `launchOf` na rynek po stan krzywej. Handel i start ida przez strony, ktore
 * juz to umieja: strona tokena (`?m=`) i modal startu na tablicy rynku.
 */

const CHAIN_ID = DEFAULT_LAUNCHPAD_CHAIN_ID;
const NETWORK = LAUNCHPAD_NETWORKS[CHAIN_ID];

type Perp = {
  id: string;
  symbol: string;
  address: Address;
  name: string;
  direction: 'long' | 'short';
  priceUsd: number | null;
  change24hPct: number | null;
  leverage: number | null;
  targetLeverage: number | null;
  marketCapUsd: number | null;
  launchpad: Address;
  rVirt: number;
};

type Meme = {
  address: Address;
  symbol: string;
  name: string;
  perpId: string;
  state: 'Curve' | 'Locked' | 'Graduated';
  raised: number;
  target: number;
  volume: number;
  trades: number;
  traders: number;
  startedAt: number;
  logo?: string;
};

type Sort = 'trending' | 'new' | 'near';

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
  const hue = parseInt(address.slice(-6), 16) % 360;
  return `hsl(${hue} 70% 55%)`;
}

export default function PerpMemesBoard() {
  const client = usePublicClient({ chainId: CHAIN_ID });
  const [perps, setPerps] = useState<Perp[]>([]);
  const [memes, setMemes] = useState<Meme[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | 'all'>('all');
  const [sort, setSort] = useState<Sort>('trending');
  const [picker, setPicker] = useState(false);

  // Perpy: lista z naszej konfiguracji + NAV/24h/dzwignia z Flash.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/launchpad/perps?chainId=${CHAIN_ID}`);
        const body = (await response.json()) as { perps?: Perp[] };
        if (!cancelled && Array.isArray(body.perps)) setPerps(body.perps);
      } catch {
        // Bez API zostaja same nazwy z konfiguracji - ponizej.
        if (!cancelled) {
          setPerps(
            (NETWORK.markets ?? []).map((m) => ({
              id: m.id,
              symbol: m.quote.symbol,
              address: m.quote.address,
              name: m.label,
              direction: 'long',
              priceUsd: null,
              change24hPct: null,
              leverage: null,
              targetLeverage: null,
              marketCapUsd: null,
              launchpad: m.launchpad,
              rVirt: m.rVirt,
            }))
          );
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // Memy: dla kazdego rynku agregat + indeks startow + stan krzywej z lancucha.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void (async () => {
      const markets = NETWORK.markets ?? [];
      const logos = await fetchLogos(CHAIN_ID).catch(() => ({} as Record<string, string>));
      const perMarket = await Promise.all(
        markets.map(async (m) => {
          const [stats, index] = await Promise.all([
            fetchBoardStatsFor(CHAIN_ID, m.id),
            fetch(`/api/launchpad/board?chainId=${CHAIN_ID}&m=${encodeURIComponent(m.id)}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null) as Promise<{ tokens?: Array<{ address?: string; name?: string; symbol?: string; startedAt?: number }> } | null>,
          ]);
          const meta = new Map<string, { name: string; symbol: string; startedAt: number }>();
          for (const [token, info] of stats?.aggregate.launched ?? []) {
            meta.set(token.toLowerCase(), { name: info.name, symbol: info.symbol, startedAt: info.startedAt });
          }
          for (const entry of index?.tokens ?? []) {
            const raw = entry.address ?? '';
            if (!/^0x[0-9a-fA-F]{40}$/.test(raw) || meta.has(raw.toLowerCase())) continue;
            meta.set(raw.toLowerCase(), { name: entry.name ?? '', symbol: entry.symbol ?? '', startedAt: Number(entry.startedAt ?? 0) });
          }
          const addresses = [...meta.keys()].map((a) => getAddress(a) as Address);
          if (addresses.length === 0) return [] as Meme[];
          const states = await client.multicall({
            allowFailure: true,
            contracts: addresses.map((token) => ({
              address: m.launchpad as Address,
              abi: launchpadAbi,
              functionName: 'launchOf' as const,
              args: [token] as const,
            })),
          });
          const target = m.rVirt * 4;
          const out: Meme[] = [];
          addresses.forEach((token, i) => {
            const r = states[i];
            if (r?.status !== 'success') return;
            const [, stateIndex, reserve, , startedAt] = r.result as readonly [Address, number, bigint, bigint, number, `0x${string}`];
            if (Number(stateIndex) === 0) return;
            const state = LAUNCH_STATE[Number(stateIndex)] as Meme['state'];
            const info = meta.get(token.toLowerCase())!;
            const activity = [...(stats?.aggregate.activity ?? [])].find(([k]) => k.toLowerCase() === token.toLowerCase())?.[1];
            const buyers = [...(stats?.aggregate.buyers ?? [])].find(([k]) => k.toLowerCase() === token.toLowerCase())?.[1];
            out.push({
              address: token,
              symbol: info.symbol || token.slice(0, 6),
              name: info.name,
              perpId: m.id,
              state,
              // Po graduacji kontrakt zeruje rezerwe - zbiorka byla domknieta.
              raised: state === 'Graduated' ? target : Number(formatEther(reserve)),
              target,
              volume: activity?.volume ?? 0,
              trades: activity?.trades ?? 0,
              traders: buyers?.size ?? 0,
              startedAt: Number(startedAt) || info.startedAt,
              logo: logos[token.toLowerCase()],
            });
          });
          return out;
        })
      );
      if (!cancelled) {
        setMemes(perMarket.flat());
        setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const perpById = useMemo(() => new Map(perps.map((p) => [p.id, p])), [perps]);
  const usd = (meme: Meme, units: number) => {
    const price = perpById.get(meme.perpId)?.priceUsd;
    return price ? units * price : null;
  };

  const visible = useMemo(() => {
    const list = memes.filter((m) => selected === 'all' || m.perpId === selected);
    const price = (m: Meme) => perpById.get(m.perpId)?.priceUsd ?? 1;
    return [...list].sort((a, b) => {
      if (sort === 'new') return b.startedAt - a.startedAt;
      if (sort === 'near') {
        const live = (m: Meme) => (m.state === 'Curve' ? m.raised / m.target : -1);
        return live(b) - live(a);
      }
      // Trending: wolumen w $, potem zbiorka w $ - jedna skala dla wszystkich perpow.
      return b.volume * price(b) - a.volume * price(a) || b.raised * price(b) - a.raised * price(a);
    });
  }, [memes, selected, sort, perpById]);

  const statsFor = (perpId: string | 'all') => {
    const list = memes.filter((m) => perpId === 'all' || m.perpId === perpId);
    const raisedUsd = list.reduce((sum, m) => sum + (usd(m, m.raised) ?? 0), 0);
    return { count: list.length, raisedUsd };
  };

  const launchOn = (perpId: string) => {
    // Start idzie przez modal tablicy rynku - tam jest juz cala sciezka
    // (zgoda na perpa, dev-buy, vanity, logo, wiadomosci).
    window.location.href = `/startpad?m=${encodeURIComponent(perpId)}&launch=1`;
  };

  const allStats = statsFor('all');

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/startpad" className="inline-flex items-center gap-1 text-[12px] font-bold text-sp-shade/50 hover:text-soft-primary-deep">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Startpad
          </Link>
          <h1 className="mt-1 font-soft-display text-[28px] font-extrabold leading-tight text-sp-ink">Perp memes</h1>
          <p className="mt-1 max-w-[560px] text-[13px] leading-[1.5] text-sp-shade/60">
            Memes paired with Flash leveraged perps. Buy a meme with ETH2xL and you ride ETH at 2x and the meme on top of it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Link href="/calls" className="inline-flex items-center gap-1.5 rounded-full border border-sp-shade/15 bg-sp-surface px-4 py-2.5 text-[13px] font-extrabold text-sp-ink hover:border-soft-primary">
          📣 Calls
        </Link>
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-sp-on-brand shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <Rocket className="h-4 w-4" aria-hidden="true" /> Launch a perp meme
        </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* PERPY */}
        <aside className="flex flex-col gap-2">
          <PerpCard
            active={selected === 'all'}
            onClick={() => setSelected('all')}
            title="All perps"
            subtitle={`${perps.length} markets`}
            stack={perps.map((p) => p.symbol)}
            count={allStats.count}
            raisedUsd={allStats.raisedUsd}
          />
          {perps.map((p) => {
            const s = statsFor(p.id);
            return (
              <PerpCard
                key={p.id}
                active={selected === p.id}
                onClick={() => setSelected(p.id)}
                title={p.symbol}
                symbol={p.symbol}
                subtitle={`${p.name}${p.leverage ? ` · ${p.leverage.toFixed(2)}x` : ''}`}
                priceUsd={p.priceUsd}
                change={p.change24hPct}
                count={s.count}
                raisedUsd={s.raisedUsd}
              />
            );
          })}
        </aside>

        {/* MEMY */}
        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-sp-shade/10 bg-sp-surface p-1">
              {(
                [
                  ['trending', 'Trending'],
                  ['new', 'New'],
                  ['near', 'Near graduation'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSort(key)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-extrabold ${sort === key ? 'bg-soft-primary text-sp-on-brand' : 'text-sp-shade/55 hover:text-sp-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {selected !== 'all' && (
              <button type="button" onClick={() => launchOn(selected)} className="text-[12px] font-extrabold text-soft-primary-deep hover:underline">
                Launch on {perpById.get(selected)?.symbol ?? selected} →
              </button>
            )}
          </div>

          {loading ? (
            <div className="mt-4 rounded-[18px] border border-sp-shade/10 bg-sp-surface px-5 py-10 text-center text-[13px] text-sp-shade/45">Reading perp memes from Base...</div>
          ) : visible.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-sp-shade/20 bg-sp-surface px-5 py-10 text-center">
              <Zap className="mx-auto h-6 w-6 text-soft-primary" aria-hidden="true" />
              <p className="mt-2 text-[15px] font-extrabold text-sp-ink">
                {selected === 'all' ? 'No perp memes yet' : `No memes on ${perpById.get(selected)?.symbol ?? selected} yet`}
              </p>
              <p className="mt-1 text-[12.5px] text-sp-shade/55">Be first: the first launch on a perp sets the board.</p>
              <button
                type="button"
                onClick={() => (selected === 'all' ? setPicker(true) : launchOn(selected))}
                className="mt-4 rounded-full bg-soft-primary px-4 py-2 text-[12.5px] font-extrabold text-sp-on-brand"
              >
                Launch the first one
              </button>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((meme) => (
                <MemeCard key={meme.address} meme={meme} perp={perpById.get(meme.perpId)} usd={usd} />
              ))}
            </div>
          )}

          <p className="mt-5 text-[11px] leading-[1.5] text-sp-shade/45">
            Perp tokens are issued by Flash: each one is a 2x position on Morpho, priced by NAV. A meme on a perp moves with the meme and with the
            perp, and a perp can lose most of its value in a large move against it. Curve and pool contracts are the same Startpad contracts as on
            the ETH board.
          </p>
        </section>
      </div>

      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Choose a perp">
          <div className="w-full max-w-[420px] rounded-[22px] border border-sp-shade/10 bg-sp-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-extrabold text-sp-ink">Pair your meme with</h2>
              <button type="button" onClick={() => setPicker(false)} className="rounded-full p-1.5 text-sp-shade/50 hover:bg-sp-sunken" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 text-[12px] text-sp-shade/55">Buyers pay in this perp, and the curve raises it.</p>
            <div className="mt-4 flex flex-col gap-2">
              {perps.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => launchOn(p.id)}
                  className="flex items-center justify-between rounded-xl border border-sp-shade/10 px-3.5 py-3 text-left hover:border-soft-primary"
                >
                  <span className="flex items-center gap-3">
                    <PerpAvatar symbol={p.symbol} size={34} change={p.change24hPct} glow />
                    <span>
                      <span className="block text-[14px] font-extrabold text-sp-ink">{p.symbol}</span>
                      <span className="block text-[11.5px] text-sp-shade/50">{p.name}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px] font-extrabold text-sp-ink">{p.priceUsd !== null ? formatUsd(p.priceUsd) : '--'}</span>
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

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="block text-[11px] font-bold text-sp-shade/40">24h --</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-extrabold ${up ? 'text-sp-up' : 'text-sp-down-deep'}`}>
      {up ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function PerpCard({
  active,
  onClick,
  title,
  subtitle,
  priceUsd,
  change,
  count,
  raisedUsd,
  symbol,
  stack,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  /** Perp karty - awatar z poswiata wg zmiany 24h. */
  symbol?: string;
  /** Karta "All perps" - stos malych awatarow wszystkich rynkow. */
  stack?: string[];
  priceUsd?: number | null;
  change?: number | null;
  count: number;
  raisedUsd: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[16px] border p-3.5 text-left transition-colors ${active ? 'border-soft-primary bg-sp-brand-soft' : 'border-sp-shade/10 bg-sp-surface hover:border-soft-primary/50'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-3">
          {symbol && <PerpAvatar symbol={symbol} size={40} change={change ?? null} glow />}
          {stack && stack.length > 0 && (
            <span className="flex shrink-0 -space-x-2.5">
              {stack.slice(0, 4).map((s) => (
                <span key={s} className="rounded-full ring-2 ring-sp-surface">
                  <PerpAvatar symbol={s} size={26} />
                </span>
              ))}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold text-sp-ink">{title}</span>
            <span className="block truncate text-[11.5px] text-sp-shade/50">{subtitle}</span>
          </span>
        </span>
        {priceUsd !== undefined && (
          <span className="shrink-0 text-right">
            <span className="block text-[13px] font-extrabold text-sp-ink">{priceUsd !== null ? formatUsd(priceUsd) : '--'}</span>
            <Change value={change ?? null} />
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-sp-shade/50">
        <span>
          <span className="font-extrabold text-sp-ink">{count}</span> {count === 1 ? 'meme' : 'memes'}
        </span>
        <span>
          <span className="font-extrabold text-sp-ink">{formatUsd(raisedUsd)}</span> raised
        </span>
      </div>
    </button>
  );
}

function MemeCard({ meme, perp, usd }: { meme: Meme; perp: Perp | undefined; usd: (meme: Meme, units: number) => number | null }) {
  const unit = perp?.symbol ?? meme.perpId;
  const progress = Math.max(0, Math.min(100, (meme.raised / meme.target) * 100));
  const raisedUsd = usd(meme, meme.raised);
  const href = `/startpad/${meme.address.toLowerCase()}?m=${encodeURIComponent(meme.perpId)}`;
  const stateLabel = meme.state === 'Curve' ? `${fmtUnits(Math.max(0, meme.target - meme.raised))} ${unit} to go` : meme.state === 'Locked' ? 'Graduating' : 'In the pool';
  return (
    <div className="flex flex-col rounded-[18px] border border-sp-shade/10 bg-sp-surface p-4 transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
      <Link href={href} className="flex min-w-0 items-start gap-3">
        <span className="relative shrink-0">
          {meme.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={meme.logo} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold text-white" style={{ backgroundColor: accent(meme.address) }}>
              {meme.symbol.slice(0, 2).toUpperCase()}
            </span>
          )}
          {perp && <PerpCornerBadge symbol={perp.symbol} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[15px] font-extrabold text-sp-ink">{meme.symbol}</span>
            <span className="rounded-full bg-sp-brand/10 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-sp-brand">on {unit}</span>
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-sp-shade/50">{meme.name}</span>
        </span>
      </Link>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[16px] font-extrabold text-sp-ink">
          {fmtUnits(meme.raised)} {unit}
          {raisedUsd !== null && <span className="text-[11px] font-bold text-sp-shade/40"> · {formatUsd(raisedUsd)}</span>}
        </span>
        <span className="ml-auto text-[11px] font-extrabold text-amber-600">{stateLabel}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sp-shade/8">
        <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: accent(meme.address) }} />
      </div>
      <div className="mt-2 text-[11px] text-sp-shade/45">
        {fmtUnits(meme.volume)} {unit} vol · {meme.traders} {meme.traders === 1 ? 'trader' : 'traders'} · {age(meme.startedAt)}
      </div>
      <Link href={href} className="mt-4 rounded-full bg-soft-primary px-3 py-2 text-center text-[12px] font-extrabold text-sp-on-brand">
        Trade with {unit}
      </Link>
    </div>
  );
}
