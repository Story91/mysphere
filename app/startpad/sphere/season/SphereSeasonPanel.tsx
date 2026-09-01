'use client';

/**
 * Sezon volume mining - widok SHADOW (faza 1A): liczymy i pokazujemy,
 * NIE wyplacamy. Plakietka "shadow" siedzi w hero, a kazda liczba udzialu
 * dalej nosi swoj label "shadow" (wymog uczciwej komunikacji ze speca).
 * Breakdown "why this number" pokazuje kazdy krok epochMath: wolumen ->
 * wykluczenia -> sqrt -> mnoznik -> cap.
 *
 * Redesign 2026-08-31: jezyk wizualny z Overview - PageHero z wielkimi
 * tykajacymi liczbami (BigStat), leaderboard z paskiem udzialu w tle
 * wiersza i medalami dla podium, objasnienia wyprowadzone do /about.
 *
 * Wykres wg dataviz: jedna seria (tytul nazywa, bez legendy), cienkie slupki
 * z zaokraglonymi koncami 4px, recesywna siatka, tooltip na hover, etykiety
 * bezposrednie; kolor marki #7c6bda (paleta zwalidowana skryptem skilla).
 */

import { useEffect, useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronDown, ChevronUp, Info, Loader2, Trophy } from 'lucide-react';
// Sezon liczy zrealizowane ETH z Base (/api/sphere/season, CHAIN_ID 8453) -
// etykieta nie moze podazac za wybrana siecia tablicy.
import { SPHERE_NATIVE_SYMBOL } from '../sphereChain';
import { BigStat, LearnMore, PageHero } from '../SphereUI';

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

/** Podium czyta sie w jednej klatce - medal zamiast numeru. */
const MEDALS = ['🥇', '🥈', '🥉'];

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

/**
 * Odliczanie do konca tygodnia jako tekst - PageHero bierze tagline
 * stringiem, wiec hook zamiast komponentu. Wolany bezwarunkowo na gorze
 * panelu (dane moga byc jeszcze null), zeby nie lamac zasad hookow.
 */
function useWeekCountdown(endsAtUnix: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!endsAtUnix) return undefined;
  const left = Number(endsAtUnix) * 1000 - now;
  if (left <= 0) return 'Closing now - final numbers settle in a moment';
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return `Ends in ${d}d ${h}h · shares settle when the week closes`;
}

function CreatorRow({ rank, c }: { rank: number; c: SeasonCreator }) {
  const [open, setOpen] = useState(false);
  const share = c.shareBps / 100;
  const podium = rank <= 3;
  const rankTone =
    rank === 1
      ? 'bg-amber-400/20 text-amber-600'
      : rank === 2
        ? 'bg-sp-shade/10 text-sp-shade/60'
        : rank === 3
          ? 'bg-orange-400/20 text-orange-600'
          : 'bg-sp-shade/5 text-sp-shade/45';

  return (
    <div className="overflow-hidden rounded-2xl bg-sp-shade/[0.03]">
      <div className="relative">
        {/* Pasek udzialu w tle wiersza: szerokosc = shareBps, prowadzacy
            widoczny bez czytania liczb. */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-sp-brand/25 to-sp-brand/[0.06] transition-[width] duration-700 ease-out"
          style={{ width: `${Math.min(share, 100)}%` }}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative flex w-full items-center gap-3 px-3 py-2.5 text-left"
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold ${rankTone}`}
          >
            {podium ? MEDALS[rank - 1] : rank}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[12.5px] font-extrabold text-sp-ink">{short(c.creator)}</span>
            <span className="block truncate text-[10.5px] text-sp-shade/45">{c.tokens.map((t) => t.symbol).join(' · ')}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="font-soft-display text-[17px] font-extrabold leading-none text-sp-ink">{share.toFixed(2)}%</span>
            <span className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">pool share · shadow</span>
          </span>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="font-mono text-[12px] font-bold text-sp-ink">{eth(c.rewardCapEth)}</span>
            <span className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">reward cap ({SPHERE_NATIVE_SYMBOL})</span>
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-sp-shade/40" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-sp-shade/40" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="sph-collapse" data-open={open} aria-hidden={!open}>
        <div className="px-3 pb-3">
          <p className="mb-2 text-[10.5px] font-bold text-sp-shade/55">
            Why this number - every step of the public formula:
          </p>
          <div className="grid gap-2">
            {c.tokens.map((t) => (
              <div key={t.token} className="grid gap-x-4 gap-y-0.5 rounded-lg bg-sp-surface p-2.5 text-[11px] sm:grid-cols-2">
                <span className="font-extrabold text-sp-ink">{t.symbol}</span>
                <span className="text-sp-shade/60">external volume: <b>{eth(t.externalVolumeEth, 3)} {SPHERE_NATIVE_SYMBOL}</b></span>
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
            protocol this week ({eth(c.netProtocolEth)} {SPHERE_NATIVE_SYMBOL} contributed → cap {eth(c.rewardCapEth)} {SPHERE_NATIVE_SYMBOL}
            {c.capBinding ? ' - cap is binding for this creator' : ''}). Wash trading pays more in fees than it can ever get back.
          </p>
        </div>
      </div>
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

  const countdown = useWeekCountdown(data?.epoch.endsAtUnix ?? null);

  if (error) {
    return (
      <p className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5 text-[12.5px] text-sp-down">
        Season data unavailable: {error}. The indexer scans Base logs - retry in a moment.
      </p>
    );
  }

  // Jeden uklad na oba stany: dopoki dane nie dojada, BigStat dostaje null
  // i sam rysuje szkielet - strona "stoi" w docelowym ksztalcie (layout
  // shift = 0), bez osobnego bloku szkieletow.
  const totals = data?.totals ?? null;
  const progress = data ? data.epoch.progressBps / 100 : 0;

  return (
    <div className="sph-stagger grid gap-4">
      {/* HERO: tydzien, odliczanie i cztery wielkie liczby ------------------- */}
      <PageHero
        title={data ? `Week ${data.epoch.index + 1}` : 'This week'}
        tagline={countdown}
        icon={<Trophy className="h-6 w-6 text-sp-brand" aria-hidden="true" />}
        badge={
          <span className="rounded-full bg-sp-brand/10 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-sp-brand">
            Shadow - no payouts yet
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <BigStat
            label={`External volume (${SPHERE_NATIVE_SYMBOL})`}
            value={totals ? Number(formatEther(BigInt(totals.externalVolumeEth))) : null}
            decimals={3}
            hint="self-trades excluded"
          />
          <BigStat
            label={`Protocol revenue (${SPHERE_NATIVE_SYMBOL})`}
            value={totals ? Number(formatEther(BigInt(totals.protocolEth))) : null}
            decimals={4}
            tone="up"
            hint="funds the future pool"
          />
          <BigStat label="Creators" value={totals ? totals.creators : null} decimals={0} hint="in the running" />
          <BigStat label="Tokens" value={totals ? totals.tokens : null} decimals={0} hint=">48h old to enter" />
        </div>

        {/* Pasek postepu tygodnia - zegar sezonu pod liczbami. */}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/60">
            <div className="sph-progress h-full rounded-full bg-sp-brand" style={{ width: `${progress}%` }} />
          </div>
          <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45">
            {data ? `${Math.round(progress)}% elapsed` : 'syncing'}
          </span>
        </div>
      </PageHero>

      {/* WYKRES: wolumen dzienny --------------------------------------------- */}
      <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <h3 className="text-[13.5px] font-extrabold text-sp-ink">Daily external volume ({SPHERE_NATIVE_SYMBOL})</h3>
        <div className="mt-3 h-56 w-full">
          {data ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: 'rgba(0,0,0,0.45)' }} />
                <YAxis width={44} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: 'rgba(0,0,0,0.45)' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(124,107,218,0.08)' }}
                  formatter={(v: number) => [`${v.toFixed(4)} ${SPHERE_NATIVE_SYMBOL}`, 'Volume']}
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,0,0,0.1)', fontSize: 11.5 }}
                />
                <Bar dataKey="volume" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={40}>
                  <LabelList
                    dataKey="volume"
                    position="top"
                    // Typ formattera recharts to ReactNode -> ReactNode, stad Number().
                    formatter={(v: React.ReactNode) => {
                      const n = Number(v);
                      return Number.isFinite(n) && n > 0 ? n.toFixed(2) : '';
                    }}
                    style={{ fontSize: 10, fill: 'rgba(0,0,0,0.55)', fontWeight: 700 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="sph-skeleton h-full w-full" />
          )}
        </div>
      </section>

      {/* LEADERBOARD --------------------------------------------------------- */}
      <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[13.5px] font-extrabold text-sp-ink">Creator leaderboard</h3>
          <a
            href="/api/sphere/season"
            target="_blank"
            rel="noreferrer"
            className="text-[10.5px] font-extrabold text-sp-shade/45 transition-colors hover:text-sp-brand"
          >
            Verify the math (raw data) ↗
          </a>
        </div>
        <p className="mt-0.5 text-[10.5px] text-sp-shade/50">Tap a row for every step behind its share.</p>
        <div className="mt-3 grid gap-1.5">
          {!data ? (
            <p className="flex items-center justify-center gap-2 py-8 text-center text-[12px] text-sp-shade/45">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Indexing this week&apos;s volume from Base…
            </p>
          ) : data.creators.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-sp-shade/45">No eligible volume this week yet.</p>
          ) : (
            data.creators.map((c, i) => <CreatorRow key={c.creator} rank={i + 1} c={c} />)
          )}
        </div>
      </section>

      <LearnMore>How scoring works - volume, trader multiplier and the 30% fee cap</LearnMore>
    </div>
  );
}
