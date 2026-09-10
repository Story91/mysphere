'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickChart, LineChart as LineChartIcon, RefreshCw } from 'lucide-react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { ACTIVE_LAUNCHPAD_NETWORK, NATIVE_SYMBOL } from '../config';
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

/**
 * Kolory wykresu ida JavaScriptem, bo lightweight-charts rysuje na canvasie i
 * zmiennych CSS nie czyta. Zrodlem jest ta sama paleta sieci, co reszta
 * startpada (config.ts -> theme.chart), wiec czarno-zielony Robinhood nie ma
 * wykresu w barwach jasnego motywu. Brak motywu = wartosci jasne, czyli te,
 * ktore stoja tu od poczatku.
 */
const CHART =
  ACTIVE_LAUNCHPAD_NETWORK.theme?.chart ?? {
    background: 'transparent',
    text: '#8a8794',
    grid: 'rgba(0,0,0,0.05)',
    up: '#12a451',
    down: '#e0527f',
    line: '#7c6bda',
    lineFill: 'rgba(124,107,218,0.16)',
  };

// Tempo blokow bierzemy z konfiguracji sieci. Stalo tu wpisane "~2s", prawdziwe
// na Base i nieprawdziwe wszedzie indziej: Arc robi blok co 0,51 s, Robinhood co
// 0,1 s. Zdanie tlumaczy, skad na wykresie biora sie czasy, wiec nie moze klamac.
const SECONDS_PER_BLOCK = ACTIVE_LAUNCHPAD_NETWORK.secondsPerBlock;

/**
 * Ile slupkow widac po otwarciu. Tyle, co domyslny widok gieldy - reszta
 * historii czeka po lewej dla tego, kto przewinie.
 */
const VISIBLE_BARS = 180;

const UP = CHART.up;
const DOWN = CHART.down;

export default function PriceChart({
  trades,
  startedAt,
  state,
  graduatedTs,
  lastPriceWei,
  loading,
  ethUsd,
  poolId = null,
}: {
  trades: TradeEntry[];
  startedAt: number;
  state: string;
  graduatedTs: number | null;
  /** Aktualna cena z lancucha: spot krzywej, a po graduacji cena puli (slot0 / ostatni swap). */
  lastPriceWei: bigint;
  loading: boolean;
  /** Kurs ETH/USD do dopisku przy naglowku; null = dopisek znika. */
  ethUsd: number | null;
  /** Po graduacji: poolId v4 = identyfikator pary na DexScreenerze (przelacznik zrodla wykresu). */
  poolId?: string | null;
}) {
  // Zrodlo wykresu po graduacji: nasz (swapy z lancucha) albo osadzony
  // DexScreener. DexScreener widzi wylacznie pule, wiec przelacznik istnieje
  // tylko dla zgraduowanych tokenow na Base; krzywa zawsze jest nasza.
  const [source, setSource] = useState<'native' | 'dexscreener'>('native');
  const dexscreenerId =
    state === 'Graduated' && ACTIVE_LAUNCHPAD_NETWORK.chain.id === 8453 && poolId && /^0x[0-9a-fA-F]{64}$/.test(poolId) && !/^0x0+$/.test(poolId)
      ? poolId
      : null;
  const showDexscreener = source === 'dexscreener' && dexscreenerId !== null;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const modRef = useRef<ChartModule | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const [ready, setReady] = useState(false);
  // Klucz widoku, dla ktorego juz ustawilismy zakres osi czasu. Zmiana
  // interwalu/stylu/trybu przestawia widok; sam naplyw nowych swiec NIE, bo
  // inaczej kazde odswiezenie wyrywaloby uzytkownika z miejsca, w ktore sam
  // sie przewinal.
  const rangeKey = useRef<string | null>(null);
  /** Ile slupkow mial wykres w poprzednim przebiegu - do wykrycia prawej krawedzi. */
  const prevBars = useRef(0);
  const [chartError, setChartError] = useState(false);
  // null = wybor automatyczny; user nadpisuje raz i jego wybor zostaje.
  const [intervalSec, setIntervalSec] = useState<IntervalSec | null>(null);
  const [mode, setMode] = useState<Mode>('price');
  const [style, setStyle] = useState<Style | null>(null);

  /**
   * Wykres startuje ZAWSZE na swiecach 1m - taki jest domysl kazdej gieldy i
   * tego oczekuje ktos, kto wchodzi na strone tokena.
   *
   * Stal tu wczesniej automat: interwal dobierany do wieku rynku (1h dla
   * starszych) i linia schodkowa zamiast swiec ponizej osmiu transakcji.
   * Bronil czytelnosci mlodego rynku, ale kosztem tego, ze ten sam token
   * wygladal inaczej w zaleznosci od tego, kiedy sie na niego weszlo. Wybor
   * uzytkownika (przelaczniki obok) nadal wygrywa i zostaje do konca sesji.
   */
  const effInterval: IntervalSec = intervalSec ?? 60;
  const effStyle: Style = style ?? 'candles';

  // Po graduacji punkty ida ze swapow puli v4 (ethReserveAfter == 0n) - wtedy
  // wykres ciagnie sie do "teraz" jak na krzywej. Dopoki puli nie ma albo
  // nie bylo w niej swapu, nie dociagamy plaskiej linii z ostatniej ceny
  // krzywej, bo sugerowalaby, ze cena wciaz na niej stoi. Czas "teraz" jest
  // sciety do pelnej minuty, zeby memo nie przeliczalo sie co render.
  const nowMinute = Math.floor(Date.now() / 60_000) * 60;
  const hasPoolPoints = useMemo(() => trades.some((trade) => trade.ethReserveAfter === 0n), [trades]);
  const endTs = state === 'Graduated' && graduatedTs !== null && !hasPoolPoints ? graduatedTs : nowMinute;

  /**
   * KAPITALIZACJA IDZIE W DOLARACH.
   *
   * "26.27 ETH kapitalizacji" nie mowi nikomu nic - kazdy, kto siega po ten
   * przelacznik, chce wiedziec, ile ten token jest wart w pieniadzu, ktory zna.
   * Cena zostaje w ETH, bo tam liczy sie ruch wzgledem pary, a nie kwota.
   *
   * Gdy kurs ETH/USD jeszcze nie doszedl, kapitalizacja zostaje w ETH i tak
   * jest podpisana - zaden ekran nie pokazuje liczby z niewiadoma jednostka.
   */
  const mcapInUsd = mode === 'mcap' && ethUsd !== null;
  const scale = mode === 'mcap' ? Number(SUPPLY_TOKENS) * (ethUsd ?? 1) : 1;

  const points = useMemo(
    () => toPricePoints(trades, startedAt, scale, endTs),
    [trades, startedAt, scale, endTs]
  );
  const candles = useMemo(() => buildCandles(points, effInterval), [points, effInterval]);
  const linePoints = useMemo(() => buildLine(points), [points]);

  // Naglowek: po graduacji zywa cena puli (slot0 / ostatni swap) wygrywa
  // z ostatnia transakcja z listy - do pierwszego swapu w puli lista konczy
  // sie na krzywej, a to juz nie jest cena tokena.
  const headWei =
    state === 'Graduated' && lastPriceWei > 0n
      ? lastPriceWei
      : trades.length
        ? trades[trades.length - 1].priceWei
        : lastPriceWei > 0n
          ? lastPriceWei
          : START_PRICE_WEI;
  const currentValue = priceToNumber(headWei) * scale;
  const multiple = Number(headWei) / Number(START_PRICE_WEI);
  const poolLive = state === 'Graduated' && (hasPoolPoints || lastPriceWei > 0n);

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
            background: { color: CHART.background },
            textColor: CHART.text,
            fontFamily: 'Nunito, system-ui, sans-serif',
          },
          grid: {
            vertLines: { color: CHART.grid },
            horzLines: { color: CHART.grid },
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
    // Zakres SPRZED podmiany danych. `setData` w lightweight-charts sam
    // przestawia os czasu na cala zawartosc - bez tej migawki kazde
    // odswiezenie (co 30 s albo po zywej transakcji) wyrzucaloby widok z
    // powrotem na cala historie scisnieta do szerokosci ekranu.
    const beforeRange = seriesRef.current ? chart.timeScale().getVisibleLogicalRange() : null;
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    // Ceny krzywej siegaja 7.5e-10 ETH; wbudowane formaty ucinalyby je do zera.
    const priceFormat = {
      type: 'custom' as const,
      // Os musi byc w tej samej jednostce, co naglowek - inaczej ktos czyta
      // "28.00" jako dolary przy kapitalizacji podanej w ETH albo odwrotnie.
      formatter: (value: number) => (mcapInUsd ? formatUsd(value) : fmtPrice(value)),
      minMove: mcapInUsd ? 0.01 : mode === 'mcap' ? 0.000001 : 1e-12,
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
        color: CHART.line,
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
    // DOMYSLNE OKNO: ostatnie VISIBLE_BARS slupkow, nie cala historia.
    //
    // `fitContent()` upychal wszystko na jednym ekranie - przy 1m i osmiu
    // dniach zycia tokena to ponad 11 000 swiec, kazda ponizej piksela.
    // Wykres wygladal jak kreska z klaksem po prawej. Kazda gielda pokazuje
    // okno ostatnich kilkuset slupkow i pozwala odjechac w lewo; robimy tak
    // samo, a przy krotkiej historii zostaje `fitContent`.
    const bars = effStyle === 'candles' ? candles.length : linePoints.length;
    const key = `${effStyle}|${mode}|${effInterval}`;
    // Przelaczenie interwalu/stylu/trybu zawsze wraca na swiezy koniec.
    const switched = rangeKey.current !== key;
    rangeKey.current = key;
    // "Stoi przy prawej krawedzi" = przed podmiana danych widzial ostatni
    // slupek. Kto odjechal w lewo, ma tam zostac.
    const atRightEdge = !beforeRange || beforeRange.to >= prevBars.current - 2;

    const applyRange = () => {
      // Wykres mogl w miedzyczasie zniknac (przelaczenie na DexScreener,
      // odmontowanie strony) - wtedy nie ma czego ustawiac.
      if (chartRef.current !== chart) return;
      if (bars <= VISIBLE_BARS) {
        chart.timeScale().fitContent();
      } else if (switched || atRightEdge) {
        // Prawy margines na kilka slupkow, zeby swieza swieca nie kleila sie
        // do krawedzi - tak samo jak `rightOffset` na gieldach.
        chart.timeScale().setVisibleLogicalRange({ from: bars - VISIBLE_BARS, to: bars + 3 });
      } else if (beforeRange) {
        chart.timeScale().setVisibleLogicalRange(beforeRange);
      }
    };

    // DWA RAZY, i to nie z ostroznosci. Przy pierwszym renderze kontener ma
    // jeszcze zerowa szerokosc (`autoSize` czeka na ResizeObserver), a os
    // czasu bez wymiarow nie przyjmuje zakresu - `getVisibleLogicalRange()`
    // oddaje wtedy `null` i ustawienie przepada. Drugie podejscie leci po
    // ulozeniu layoutu i to ono decyduje.
    applyRange();
    const raf = requestAnimationFrame(applyRange);
    prevBars.current = bars;
    return () => cancelAnimationFrame(raf);
    // `mcapInUsd` w zaleznosciach nie jest formalnoscia: kurs ETH/USD dochodzi
    // asynchronicznie, wiec bez tego os zostawalaby w ETH u kazdego, kto
    // otworzyl kapitalizacje przed odpowiedzia z kursem.
  }, [ready, effStyle, mode, mcapInUsd, effInterval, candles, linePoints, graduatedTs]);

  return (
    <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-sp-shade/40">
            {mode === 'mcap' ? 'Market cap' : state === 'Graduated' ? (poolLive ? 'Pool price' : 'Last curve price') : 'Price'}
          </p>
          <p className="mt-1 font-soft-display text-[26px] font-extrabold leading-none text-sp-ink">
            {mcapInUsd ? (
              <>
                {formatUsd(currentValue)}
                {/* Kapitalizacja prowadzi w dolarach, a ETH zostaje dopiskiem -
                    odwrotnie niz przy cenie, gdzie liczy sie ruch wzgledem pary. */}
                <span className="ml-1.5 text-[13px] font-bold text-sp-shade/35">
                  · {fmtPrice(currentValue / (ethUsd as number))} {NATIVE_SYMBOL}
                </span>
              </>
            ) : (
              <>
                {fmtPrice(currentValue)} <span className="text-[14px] text-sp-shade/40">{NATIVE_SYMBOL}</span>
                {/* Wykres ceny zostaje w jednostce natywnej - USD jest dopiskiem. */}
                {ethUsd !== null && (
                  <span className="ml-1.5 text-[13px] font-bold text-sp-shade/35">· {formatUsd(currentValue * ethUsd)}</span>
                )}
              </>
            )}
          </p>
          <p className="mt-1 text-[11px] font-bold text-sp-shade/45">
            {multiple >= 1 ? (
              <span className="text-sp-up">{multiple.toFixed(multiple >= 10 ? 1 : 2)}x since launch</span>
            ) : (
              <span className="text-sp-down-deep">{multiple.toFixed(2)}x since launch</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex overflow-hidden rounded-full border border-sp-shade/10" role="tablist" aria-label="Chart interval">
            {INTERVALS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={effInterval === item.value}
                onClick={() => setIntervalSec(item.value)}
                className={`px-2.5 py-1.5 text-[11px] font-extrabold transition-colors ${effInterval === item.value ? 'bg-soft-primary text-sp-on-brand' : 'bg-sp-surface text-sp-shade/50 hover:text-soft-primary-deep'}`}
              >
                {item.label}
              </button>
            ))}
          </span>
          <span className="inline-flex overflow-hidden rounded-full border border-sp-shade/10" role="tablist" aria-label="Chart style">
            <button
              type="button"
              role="tab"
              aria-selected={effStyle === 'candles'}
              onClick={() => setStyle('candles')}
              className={`px-2.5 py-1.5 transition-colors ${effStyle === 'candles' ? 'bg-soft-primary text-sp-on-brand' : 'bg-sp-surface text-sp-shade/50 hover:text-soft-primary-deep'}`}
              aria-label="Candlestick chart"
            >
              <CandlestickChart className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={effStyle === 'line'}
              onClick={() => setStyle('line')}
              className={`px-2.5 py-1.5 transition-colors ${effStyle === 'line' ? 'bg-soft-primary text-sp-on-brand' : 'bg-sp-surface text-sp-shade/50 hover:text-soft-primary-deep'}`}
              aria-label="Line chart"
            >
              <LineChartIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
          {dexscreenerId && (
            <span className="inline-flex overflow-hidden rounded-full border border-sp-shade/10" role="tablist" aria-label="Chart source">
              {(['native', 'dexscreener'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={source === item}
                  onClick={() => setSource(item)}
                  className={`px-2.5 py-1.5 text-[11px] font-extrabold transition-colors ${source === item ? 'bg-soft-primary text-sp-on-brand' : 'bg-sp-surface text-sp-shade/50 hover:text-soft-primary-deep'}`}
                >
                  {item === 'native' ? 'Onchain' : 'DexScreener'}
                </button>
              ))}
            </span>
          )}
          <span className="inline-flex overflow-hidden rounded-full border border-sp-shade/10" role="tablist" aria-label="Price or market cap">
            {(['price', 'mcap'] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={mode === item}
                onClick={() => setMode(item)}
                className={`px-2.5 py-1.5 text-[11px] font-extrabold transition-colors ${mode === item ? 'bg-soft-primary text-sp-on-brand' : 'bg-sp-surface text-sp-shade/50 hover:text-soft-primary-deep'}`}
              >
                {item === 'price' ? 'Price' : 'MCap'}
              </button>
            ))}
          </span>
        </div>
      </div>

      <div className="relative mt-4">
        {state === 'Graduated' && (
          <span className="absolute left-2 top-2 z-10 rounded-full bg-sp-up-soft px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-sp-up">
            {poolLive ? 'Uniswap v4 pool · live' : 'Graduated: trading moved to Uniswap v4'}
          </span>
        )}
        {showDexscreener && (
          <iframe
            title="DexScreener chart"
            src={`https://dexscreener.com/base/${dexscreenerId}?embed=1&theme=light&trades=0&info=0`}
            className="h-[320px] w-full rounded-xl border-0 sm:h-[380px]"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups"
            referrerPolicy="no-referrer"
          />
        )}
        {/* Kontener naszego wykresu zostaje w DOM (ukryty) - lightweight-charts
            trzyma do niego referencje; odmontowanie i ponowne montowanie
            przy kazdym przelaczeniu kosztowaloby pelna inicjalizacje. */}
        {chartError ? (
          <div className={`flex h-[320px] items-center justify-center rounded-xl bg-sp-sunken text-[12px] text-sp-shade/45 ${showDexscreener ? 'hidden' : ''}`}>
            The chart library failed to load. Trades below still show the full history.
          </div>
        ) : (
          <div ref={containerRef} className={`h-[320px] w-full sm:h-[380px] ${showDexscreener ? 'hidden' : ''}`} />
        )}
        {loading && trades.length === 0 && !chartError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-sp-surface/70">
            <span className="inline-flex items-center gap-2 text-[12px] font-bold text-sp-shade/50">
              <RefreshCw className="h-4 w-4 animate-spin text-soft-primary" aria-hidden="true" />
              Building the chart from onchain trades...
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10.5px] text-sp-shade/35">
        Every point is the exact post-trade price: Bought/Sold events on the curve, Swap events in the Uniswap v4 pool after graduation. Timestamps are estimated from block numbers (~{SECONDS_PER_BLOCK}s per block).
      </p>
    </section>
  );
}
