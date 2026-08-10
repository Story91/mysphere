'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickChart, LineChart as LineChartIcon, RefreshCw } from 'lucide-react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { formatUsd } from '../useEthUsd';
import {
  buildCandles,
  buildLine,
  fmtPrice,
  priceToNumber,
  START_PRICE_WEI,
  SUPPLY_TOKENS,
  toPricePoints,
  type TradeEntry,
} from './detailShared';

/**
 * Wykres cenowy z lightweight-charts, importowany DYNAMICZNIE: biblioteka
 * rysuje na canvasie i nie ma czego robic w SSR, a statyczny import wciagalby
 * ja do bundla kazdej strony z ta trasa.
 */

type ChartModule = typeof import('lightweight-charts');
type IntervalSec = 60 | 300 | 3600;
type Mode = 'price' | 'mcap';
type Style = 'candles' | 'line';

const INTERVALS: Array<{ value: IntervalSec; label: string }> = [
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
  { value: 3600, label: '1h' },
];

const UP = '#12a451';
const DOWN = '#e0527f';

export default function PriceChart({
  trades,
  startedAt,
  state,
  graduatedTs,
  lastPriceWei,
  loading,
  ethUsd,
}: {
  trades: TradeEntry[];
  startedAt: number;
  state: string;
  graduatedTs: number | null;
  /** Aktualna cena spot z lancucha; po graduacji ostatnia cena krzywej. */
  lastPriceWei: bigint;
  loading: boolean;
  /** Kurs ETH/USD do dopisku przy naglowku; null = dopisek znika. */
  ethUsd: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const modRef = useRef<ChartModule | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const [ready, setReady] = useState(false);
  const [chartError, setChartError] = useState(false);
  // null = wybor automatyczny; user nadpisuje raz i jego wybor zostaje.
  const [intervalSec, setIntervalSec] = useState<IntervalSec | null>(null);
  const [mode, setMode] = useState<Mode>('price');
  const [style, setStyle] = useState<Style | null>(null);

  const lastTradeTs = trades.length ? trades[trades.length - 1].ts : startedAt;
  const span = Math.max(0, lastTradeTs - startedAt);
  // Interwal dobrany do wieku rynku: mlody token na swiecach 1h to jeden slupek.
  const autoInterval: IntervalSec = span < 5400 ? 60 : span < 43_200 ? 300 : 3600;
  const effInterval = intervalSec ?? autoInterval;
  // Kilka transakcji nie sklada sie w swiece - linia schodkowa mowi wtedy wiecej.
  const autoStyle: Style = trades.length >= 8 ? 'candles' : 'line';
  const effStyle = style ?? autoStyle;

  // Po graduacji krzywa jest historia - nie dociagamy plaskiej linii do
  // "teraz", bo sugerowalaby, ze cena wciaz stoi na krzywej. Czas "teraz"
  // jest sciety do pelnej minuty, zeby memo nie przeliczalo sie co render.
  const nowMinute = Math.floor(Date.now() / 60_000) * 60;
  const endTs = state === 'Graduated' && graduatedTs !== null ? graduatedTs : nowMinute;
  const points = useMemo(
    () => toPricePoints(trades, startedAt, mode, endTs),
    [trades, startedAt, mode, endTs]
  );
  const candles = useMemo(() => buildCandles(points, effInterval), [points, effInterval]);
  const linePoints = useMemo(() => buildLine(points), [points]);

  const scale = mode === 'mcap' ? Number(SUPPLY_TOKENS) : 1;
  const currentValue = trades.length
    ? priceToNumber(trades[trades.length - 1].priceWei) * scale
    : lastPriceWei > 0n
      ? priceToNumber(lastPriceWei) * scale
      : priceToNumber(START_PRICE_WEI) * scale;
  const multiple = trades.length
    ? Number(trades[trades.length - 1].priceWei) / Number(START_PRICE_WEI)
    : lastPriceWei > 0n
      ? Number(lastPriceWei) / Number(START_PRICE_WEI)
      : 1;

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
            textColor: '#8a8794',
            fontFamily: 'Nunito, system-ui, sans-serif',
          },
          grid: {
            vertLines: { color: 'rgba(0,0,0,0.05)' },
            horzLines: { color: 'rgba(0,0,0,0.05)' },
          },
          rightPriceScale: { borderVisible: false },
          timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
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
    }
    // Ceny krzywej siegaja 7.5e-10 ETH; wbudowane formaty ucinalyby je do zera.
    const priceFormat = {
      type: 'custom' as const,
      formatter: (value: number) => fmtPrice(value),
      minMove: mode === 'mcap' ? 0.000001 : 1e-12,
    };
    let series: ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;
    if (effStyle === 'candles') {
      series = chart.addSeries(mod.CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        borderVisible: false,
        priceFormat,
      });
      series.setData(candles.map((candle) => ({ ...candle, time: candle.time as Time })));
    } else {
      series = chart.addSeries(mod.LineSeries, {
        color: '#7c6bda',
        lineWidth: 2,
        lineType: mod.LineType.WithSteps,
        priceFormat,
      });
      series.setData(linePoints.map((point) => ({ time: point.time as Time, value: point.value })));
    }
    seriesRef.current = series;

    if (graduatedTs !== null) {
      // Znacznik musi lezec na czasie ISTNIEJACEGO punktu danych, inaczej
      // biblioteka go nie narysuje - bierzemy ostatni punkt przed graduacja.
      const times = effStyle === 'candles' ? candles.map((candle) => candle.time) : linePoints.map((point) => point.time);
      let at: number | undefined;
      for (const time of times) {
        if (time <= graduatedTs) at = time;
        else break;
      }
      at ??= times[times.length - 1];
      if (at !== undefined) {
        mod.createSeriesMarkers(series, [
          { time: at as Time, position: 'aboveBar', color: UP, shape: 'circle', text: 'Graduated' },
        ]);
      }
    }
    chart.timeScale().fitContent();
  }, [ready, effStyle, mode, candles, linePoints, graduatedTs]);

  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-black/40">
            {mode === 'mcap' ? 'Market cap' : state === 'Graduated' ? 'Last curve price' : 'Price'}
          </p>
          <p className="mt-1 font-soft-display text-[26px] font-extrabold leading-none text-[#16141b]">
            {fmtPrice(currentValue)} <span className="text-[14px] text-black/40">ETH</span>
            {/* Sam wykres zostaje w ETH - USD jest tylko dopiskiem przy naglowku. */}
            {ethUsd !== null && <span className="ml-1.5 text-[13px] font-bold text-black/35">· {formatUsd(currentValue * ethUsd)}</span>}
          </p>
          <p className="mt-1 text-[11px] font-bold text-black/45">
            {multiple >= 1 ? (
              <span className="text-[#0b9a51]">{multiple.toFixed(multiple >= 10 ? 1 : 2)}x since launch</span>
            ) : (
              <span className="text-[#a34b08]">{multiple.toFixed(2)}x since launch</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex overflow-hidden rounded-full border border-black/10" role="tablist" aria-label="Chart interval">
            {INTERVALS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={effInterval === item.value}
                onClick={() => setIntervalSec(item.value)}
                className={`px-2.5 py-1.5 text-[11px] font-extrabold transition-colors ${effInterval === item.value ? 'bg-soft-primary text-white' : 'bg-white text-black/50 hover:text-soft-primary-deep'}`}
              >
                {item.label}
              </button>
            ))}
          </span>
          <span className="inline-flex overflow-hidden rounded-full border border-black/10" role="tablist" aria-label="Chart style">
            <button
              type="button"
              role="tab"
              aria-selected={effStyle === 'candles'}
              onClick={() => setStyle('candles')}
              className={`px-2.5 py-1.5 transition-colors ${effStyle === 'candles' ? 'bg-soft-primary text-white' : 'bg-white text-black/50 hover:text-soft-primary-deep'}`}
              aria-label="Candlestick chart"
            >
              <CandlestickChart className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effStyle === 'line'}
              onClick={() => setStyle('line')}
              className={`px-2.5 py-1.5 transition-colors ${effStyle === 'line' ? 'bg-soft-primary text-white' : 'bg-white text-black/50 hover:text-soft-primary-deep'}`}
              aria-label="Line chart"
            >
              <LineChartIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
          <span className="inline-flex overflow-hidden rounded-full border border-black/10" role="tablist" aria-label="Price or market cap">
            {(['price', 'mcap'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                onClick={() => setMode(item)}
                className={`px-2.5 py-1.5 text-[11px] font-extrabold transition-colors ${mode === item ? 'bg-soft-primary text-white' : 'bg-white text-black/50 hover:text-soft-primary-deep'}`}
              >
                {item === 'price' ? 'Price' : 'MCap'}
              </button>
            ))}
          </span>
        </div>
      </div>

      <div className="relative mt-4">
        {state === 'Graduated' && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-[#edfff4] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#0b9a51]">
            Graduated — trading moved to Uniswap v4
          </span>
        )}
        {chartError ? (
          <div className="flex h-[320px] items-center justify-center rounded-xl bg-[#f8f7fc] text-[12px] text-black/45">
            The chart library failed to load. Trades below still show the full history.
          </div>
        ) : (
          <div ref={containerRef} className="h-[320px] w-full sm:h-[380px]" />
        )}
        {loading && trades.length === 0 && !chartError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70">
            <span className="inline-flex items-center gap-2 text-[12px] font-bold text-black/50">
              <RefreshCw className="h-4 w-4 animate-spin text-soft-primary" aria-hidden="true" />
              Building the chart from onchain trades...
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-black/35">
        Every point is the exact post-trade curve price from Bought/Sold events. Timestamps are estimated from block numbers (~2s per block).
      </p>
    </section>
  );
}
