'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { IChartApi, IPriceLine, ISeriesApi, Time } from 'lightweight-charts';
import { formatEther } from 'viem';
import { fmtPrice } from '../format';
import { useNow } from '../ui';
import { filterRange, type ChartRange } from './math';
import type { PricePoint } from './types';

/**
 * Wykres indeksu z lightweight-charts, importowany DYNAMICZNIE (canvas, brak
 * SSR, biblioteka poza bundlem reszty aplikacji) - wzorzec ten sam, co w
 * app/startpad/[address]/PriceChart.tsx.
 *
 * Co jest na wykresie i dlaczego:
 * - linia: to, co feed OPUBLIKOWAL (`PriceSubmitted`), czyli indeks;
 * - kreskowana fioletowa: mark vAMM, czyli gdzie rynek handluje TERAZ.
 *   Odstep miedzy nimi to premia, za ktora placi funding;
 * - entry/liq otwartej pozycji: trader ma widziec, ile mu zostalo do
 *   likwidacji bez liczenia w glowie;
 * - szara kreskowana: liq podgladowego zlecenia - zmienia sie z suwakiem
 *   dzwigni, zanim ktokolwiek cos podpisze.
 *
 * Kolory ida JavaScriptem, bo canvas nie czyta zmiennych CSS. Bierzemy je z
 * `--sp-*` przez getComputedStyle, wiec motyw sieci obowiazuje tez tutaj.
 */

type ChartModule = typeof import('lightweight-charts');

const RANGES: ChartRange[] = ['1h', '6h', '24h', 'all'];

function cssRgb(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `rgb(${raw})` : fallback;
}

function toNumber(price: bigint): number {
  return Number(formatEther(price));
}

export default function PriceChart({
  points,
  mark,
  entry,
  liq,
  previewLiq,
  previewSide,
  onRefresh,
  loading,
}: {
  points: PricePoint[];
  mark: bigint | null;
  entry?: bigint | null;
  liq?: bigint | null;
  previewLiq?: bigint | null;
  previewSide?: 'long' | 'short';
  onRefresh: () => void;
  loading: boolean;
}) {
  const now = useNow();
  const [range, setRange] = useState<ChartRange>('all');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const modRef = useRef<ChartModule | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const [ready, setReady] = useState(false);
  const [chartError, setChartError] = useState(false);

  // `now` tyka co sekunde; filtr liczymy od minuty, zeby nie przerysowywac
  // wykresu 60 razy na minute bez zadnej zmiany danych.
  const nowMinute = Math.floor(now / 60) * 60;
  const visible = useMemo(() => filterRange(points, range, nowMinute), [points, range, nowMinute]);
  const enough = visible.length >= 2;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let cancelled = false;
    void (async () => {
      try {
        const mod = await import('lightweight-charts');
        if (cancelled || !containerRef.current) return;
        modRef.current = mod;
        const chart = mod.createChart(containerRef.current, {
          autoSize: true,
          layout: {
            background: { color: 'transparent' },
            textColor: cssRgb('--sp-ink-soft', '#8a8794'),
            fontFamily: 'Nunito, system-ui, sans-serif',
          },
          grid: {
            vertLines: { color: 'rgba(128,128,128,0.08)' },
            horzLines: { color: 'rgba(128,128,128,0.08)' },
          },
          rightPriceScale: { borderVisible: false },
          timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
          crosshair: { mode: mod.CrosshairMode.Normal },
        });
        chartRef.current = chart;
        setReady(true);
      } catch {
        if (!cancelled) setChartError(true);
      }
    })();
    return () => {
      cancelled = true;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const mod = modRef.current;
    if (!ready || !chart || !mod) return;
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
      linesRef.current = [];
    }
    if (!enough) return;

    const last = visible[visible.length - 1].price;
    const first = visible[0].price;
    const up = last >= first;
    const series = chart.addSeries(mod.LineSeries, {
      color: up ? cssRgb('--sp-up-vivid', '#18bd64') : cssRgb('--sp-down', '#c76b12'),
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: (v: number) => fmtPrice(BigInt(Math.round(v * 1e18))), minMove: 0.0001 },
      lastValueVisible: true,
      priceLineVisible: false,
    });
    // Ta sama sekunda dwa razy (dwie aktualizacje w jednym bloku) wywala
    // `setData` - zostawiamy ostatnia z nich.
    const dedup = new Map<number, number>();
    for (const p of visible) dedup.set(p.time, toNumber(p.price));
    series.setData(Array.from(dedup, ([time, value]) => ({ time: time as Time, value })));
    seriesRef.current = series;
    chart.timeScale().fitContent();
  }, [ready, enough, visible]);

  // Linie poziome osobno od serii: zmieniaja sie z kazdym ruchem suwaka, a
  // seria nie ma po co sie wtedy przerysowywac.
  useEffect(() => {
    const series = seriesRef.current;
    const mod = modRef.current;
    if (!series || !mod) return;
    for (const line of linesRef.current) series.removePriceLine(line);
    linesRef.current = [];
    const add = (price: bigint | null | undefined, color: string, title: string, dashed: boolean) => {
      if (price === null || price === undefined || price === 0n) return;
      linesRef.current.push(
        series.createPriceLine({
          price: toNumber(price),
          color,
          lineWidth: 1,
          lineStyle: dashed ? mod.LineStyle.Dashed : mod.LineStyle.Solid,
          axisLabelVisible: true,
          title,
        }),
      );
    };
    add(mark, cssRgb('--sp-brand', '#7c6bda'), 'mark', true);
    add(entry, cssRgb('--sp-ink', '#16141b'), 'entry', false);
    add(liq, cssRgb('--sp-danger', '#a32020'), 'liq', false);
    const showPreview = !liq;
    if (showPreview) add(previewLiq, cssRgb('--sp-ink-soft', '#8a8794'), previewSide ? `liq (${previewSide})` : 'liq', true);

    // Os cen skaluje sie do SERII, nie do linii poziomych - mark siedzacy
    // 40% nad indeksem (co na vAMM z mala plynnoscia jest normalne) wypadal
    // poza kadr razem z etykieta. Rozszerzamy zakres o kazda narysowana linie.
    const extra = [mark, entry, liq, showPreview ? previewLiq : null]
      .filter((v): v is bigint => v !== null && v !== undefined && v !== 0n)
      .map(toNumber);
    series.applyOptions({
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const base = original();
        if (!base) return base;
        let { minValue, maxValue } = base.priceRange;
        for (const v of extra) {
          if (v < minValue) minValue = v;
          if (v > maxValue) maxValue = v;
        }
        return { ...base, priceRange: { minValue, maxValue } };
      },
    });
  }, [ready, enough, visible, mark, entry, liq, previewLiq, previewSide]);

  const lo = enough ? visible.reduce((m, p) => (p.price < m ? p.price : m), visible[0].price) : null;
  const hi = enough ? visible.reduce((m, p) => (p.price > m ? p.price : m), visible[0].price) : null;

  return (
    <section className="sph-card rounded-[20px] border border-sp-shade/10 bg-sp-surface p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-full bg-sp-sunken p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                range === r ? 'bg-sp-surface text-sp-ink shadow-chip' : 'text-sp-ink-soft hover:text-sp-ink'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-sp-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-sp-brand" /> mark
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t-2 border-sp-danger" /> liq
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-full border border-sp-shade/15 px-2 py-0.5 text-sp-ink-soft hover:text-sp-ink"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="relative h-[220px] sm:h-[320px]">
        <div ref={containerRef} className={`h-full w-full ${enough ? '' : 'invisible'}`} />
        {!enough && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-sp-shade/20 text-center text-xs text-sp-ink-soft">
            <p className="font-semibold text-sp-ink">
              {chartError ? 'The chart could not load.' : points.length < 2 ? 'Not enough feed updates yet' : `No feed updates in the last ${range}`}
            </p>
            <p>
              {points.length < 2
                ? 'The line appears once the price feed has published at least two prices.'
                : 'Try a wider range.'}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-[10px] tabular-nums text-sp-ink-soft">
        <span>{lo === null ? '' : `low ${fmtPrice(lo)}`}</span>
        <span>{visible.length} feed updates</span>
        <span>{hi === null ? '' : `high ${fmtPrice(hi)}`}</span>
      </div>
    </section>
  );
}
