'use client';

/**
 * Sezon volume mining - widok SHADOW (faza 1A): liczymy i pokazujemy,
 * NIE wyplacamy. Kazda liczba nosi label "shadow/estimate" (wymog uczciwej
 * komunikacji ze speca), a breakdown "why this number" pokazuje kazdy krok
 * epochMath: wolumen -> wykluczenia -> sqrt -> mnoznik -> cap.
 *
 * Wykres wg dataviz: jedna seria (tytul nazywa, bez legendy), cienkie slupki
 * z zaokraglonymi koncami 4px, recesywna siatka, tooltip na hover, etykiety
 * bezposrednie; kolor marki #7c6bda (paleta zwalidowana skryptem skilla).
 */

import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronUp, Info, Loader2 } from 'lucide-react';
import { NATIVE_SYMBOL } from '../../config';

type SeasonToken = {
  token: string;
  symbol: string;
  externalVolumeEth: string;
  selfVolumeEth: string;
  uniqueTraders: number;
  traderMultiplierBps: number;
  ageEligible: boolean;
  weight: string;
  cappedWeight: string;
};

type SeasonCreator = {
  creator: string;
  shareBps: number;
  netProtocolEth: string;
  rewardCapEth: string;
  capBinding: boolean;
  tokens: SeasonToken[];
};

type SeasonData = {
  shadow: boolean;
  epoch: { index: number; endsAtUnix: string; progressBps: number };
  totals: { externalVolumeEth: string; protocolEth: string; creators: number; tokens: number };
  dailyVolumeEth: string[];
  creators: SeasonCreator[];
};

const BRAND = '#7c6bda';

function eth(wei: string, digits = 4) {
  return Number(formatEther(BigInt(wei))).toFixed(digits);
}

/** Wagi sa w jednostkach sqrt(wei) - pokazujemy bezwymiarowe punkty. */
function pts(weight: string) {
  return (Number(BigInt(weight)) / 1e9).toFixed(3);
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function Countdown({ endsAtUnix }: { endsAtUnix: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const left = Number(endsAtUnix) * 1000 - now;
  if (left <= 0) return <span>closing…</span>;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return (
    <span>
      ends in {d}d {h}h
    </span>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">{label}</p>
      <p className="mt-1 font-soft-display text-[20px] font-extrabold text-sp-ink">{value}</p>
      {sub && <p className="text-[10.5px] text-sp-shade/50">{sub}</p>}
    </div>
  );
}

function CreatorRow({ rank, c }: { rank: number; c: SeasonCreator }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-sp-shade/8 last:border-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="grid w-full grid-cols-[2rem_1fr_auto_auto_1.5rem] items-center gap-3 py-2.5 text-left">
        <span className="text-[12px] font-extrabold text-sp-shade/40">#{rank}</span>
        <span>
          <span className="font-mono text-[12.5px] font-extrabold text-sp-ink">{short(c.creator)}</span>
          <span className="ml-2 text-[10.5px] text-sp-shade/45">
            {c.tokens.map((t) => t.symbol).join(' · ')}
          </span>
        </span>
        <span className="text-right">
          <span className="font-soft-display text-[15px] font-extrabold text-sp-ink">{(c.shareBps / 100).toFixed(2)}%</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">pool share · shadow</span>
        </span>
        <span className="text-right">
          <span className="font-mono text-[12px] font-bold text-sp-ink">{eth(c.rewardCapEth)}</span>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">reward cap ({NATIVE_SYMBOL})</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-sp-shade/40" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-sp-shade/40" aria-hidden="true" />}
      </button>
      {open && (
        <div className="mb-3 rounded-xl border border-sp-shade/10 bg-sp-shade/[0.03] p-3">
          <p className="mb-2 text-[10.5px] font-bold text-sp-shade/55">
            Why this number - every step of the public formula:
          </p>
          <div className="grid gap-2">
            {c.tokens.map((t) => (
              <div key={t.token} className="grid gap-x-4 gap-y-0.5 rounded-lg bg-sp-surface p-2.5 text-[11px] sm:grid-cols-2">
                <span className="font-extrabold text-sp-ink">{t.symbol}</span>
                <span className="text-sp-shade/60">external volume: <b>{eth(t.externalVolumeEth, 3)} {NATIVE_SYMBOL}</b></span>
                <span className="text-sp-shade/60">excluded self-volume: <b>{eth(t.selfVolumeEth, 3)}</b></span>
                <span className="text-sp-shade/60">unique traders: <b>{t.uniqueTraders}</b> → multiplier <b>{(t.traderMultiplierBps / 10_000).toFixed(1)}×</b></span>
                <span className="text-sp-shade/60">age gate (48h): <b>{t.ageEligible ? 'eligible' : 'not yet'}</b></span>
                <span className="text-sp-shade/60">weight √vol×mult: <b>{pts(t.weight)} pts</b> → after pool cap: <b>{pts(t.cappedWeight)} pts</b></span>
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10.5px] text-sp-shade/55">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Reward never exceeds 30% of the fees this creator&apos;s tokens actually contributed to the
            protocol this week ({eth(c.netProtocolEth)} {NATIVE_SYMBOL} contributed → cap {eth(c.rewardCapEth)} {NATIVE_SYMBOL}
            {c.capBinding ? ' - cap is binding for this creator' : ''}). Wash trading pays more in fees than it can ever get back.
          </p>
        </div>
      )}
    </div>
  );
}

export default function SphereSeasonPanel() {
  const [data, setData] = useState<SeasonData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/sphere/season');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as SeasonData;
        if (alive) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const t = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const chartData = useMemo(
    () =>
      (data?.dailyVolumeEth ?? []).map((v, i) => ({
        day: `Day ${i + 1}`,
        volume: Number(formatEther(BigInt(v))),
      })),
    [data]
  );

  if (error) {
    return (
      <p className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5 text-[12.5px] text-sp-down">
        Season data unavailable: {error}. The indexer scans Base logs - retry in a moment.
      </p>
    );
  }
  if (!data) {
    return (
      <p className="flex items-center gap-2 rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5 text-[12.5px] text-sp-shade/55">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Indexing this week&apos;s volume from Base…
        first load scans on-chain logs and can take a minute.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {/* NAGLOWEK TYGODNIA --------------------------------------------------- */}
      <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-extrabold text-sp-ink">
            Week {data.epoch.index + 1}
            <span className="ml-2 rounded-full bg-sp-brand/10 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-brand">Shadow - no payouts yet</span>
          </h2>
          <span className="text-[11.5px] font-bold text-sp-shade/55">
            <Countdown endsAtUnix={data.epoch.endsAtUnix} />
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sp-shade/10">
          <div className="h-full rounded-full bg-sp-brand" style={{ width: `${data.epoch.progressBps / 100}%` }} />
        </div>
        <p className="mt-2 text-[10.5px] text-sp-shade/50">
          Shadow season calibrates the public reward formula on real volume before any SPHERE is paid.
          Rules are published; anyone can recompute this page from chain logs.{' '}
          <a href="/api/sphere/season" target="_blank" rel="noreferrer" className="font-bold text-sp-brand hover:underline">
            Verify the math → raw data
          </a>
        </p>
      </section>

      {/* KAFLE --------------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={`External volume (${NATIVE_SYMBOL})`} value={eth(data.totals.externalVolumeEth, 3)} sub="creator self-trades excluded" />
        <StatTile label={`Protocol revenue (${NATIVE_SYMBOL})`} value={eth(data.totals.protocolEth, 4)} sub="funds the future reward pool" />
        <StatTile label="Creators in the running" value={String(data.totals.creators)} />
        <StatTile label="Tokens counted" value={String(data.totals.tokens)} sub=">48h after launch to enter" />
      </div>

      {/* WYKRES: wolumen dzienny --------------------------------------------- */}
      <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <h3 className="text-[13.5px] font-extrabold text-sp-ink">Daily external volume ({NATIVE_SYMBOL})</h3>
        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: 'rgba(0,0,0,0.45)' }} />
              <YAxis width={44} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: 'rgba(0,0,0,0.45)' }} />
              <Tooltip
                cursor={{ fill: 'rgba(124,107,218,0.08)' }}
                formatter={(v: number) => [`${v.toFixed(4)} ${NATIVE_SYMBOL}`, 'Volume']}
                contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', fontSize: 11.5 }}
              />
              <Bar dataKey="volume" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={40}>
                <LabelList dataKey="volume" position="top" formatter={(v: number) => (v > 0 ? v.toFixed(2) : '')} style={{ fontSize: 10, fill: 'rgba(0,0,0,0.55)', fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* LEADERBOARD --------------------------------------------------------- */}
      <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <h3 className="text-[13.5px] font-extrabold text-sp-ink">Creator leaderboard</h3>
        <p className="mt-0.5 text-[10.5px] text-sp-shade/50">
          Click a row for the full &quot;why this number&quot; breakdown. Shares are shadow estimates - final
          numbers settle when the week closes.
        </p>
        <div className="mt-2">
          {data.creators.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-sp-shade/45">No eligible volume this week yet.</p>
          ) : (
            data.creators.map((c, i) => <CreatorRow key={c.creator} rank={i + 1} c={c} />)
          )}
        </div>
      </section>
    </div>
  );
}
