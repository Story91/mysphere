'use client';

import { useMemo, useState } from 'react';
import type { Candle } from '../../utils/b20/token';

/**
 * Wykres ceny tokena B20.
 *
 * ===========================================================================
 * DLACZEGO SVG, A NIE BIBLIOTEKA
 * ===========================================================================
 * Do narysowania jednej linii z 168 punktow nie trzeba 40 kB javascriptu.
 * Ten wykres nie ma zoomu, przesuwania ani skali logarytmicznej - ma pokazac
 * ksztalt i dac odczyt pod kursorem. SVG liczone raz w `useMemo` robi to
 * przy zerowym koszcie wejscia na strone.
 *
 * ===========================================================================
 * CO TEN WYKRES OBIECUJE, A CZEGO NIE
 * ===========================================================================
 * Dane sa CUDZE - to swiece godzinowe z GeckoTerminal, ktore indeksuje pule
 * v4 po identyfikatorze. Podpis mowi o tym wprost, bo inaczej czytelnik
 * zakladalby, ze policzylismy to sami z lancucha.
 *
 * Gdy swiec brakuje, komponent NIE RYSUJE plaskiej linii. Brak notowan to nie
 * jest cena zero - wolajacy dostaje `null` i pisze zdanie zamiast wykresu.
 *
 * Skala jest LINIOWA i zaczyna sie od minimum okna, nie od zera. Przy tokenie
 * kosztujacym 4e-6 dolara skala od zera dalaby plaska kreske przy dolnej
 * krawedzi - czyli wykres, ktory niczego nie pokazuje. Podpis podaje oba
 * konce zakresu, zeby nikt nie wzial wychylenia za wieksze, niz jest.
 */

const RANGES = [
  { key: '24h', label: '24H', hours: 24 },
  { key: '7d', label: '7D', hours: 168 },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

/** Cena w formie czytelnej takze przy 0.0000000042. */
function price(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  // Ponizej centa licza sie cyfry znaczace, nie miejsca po przecinku.
  return `$${value.toPrecision(3)}`;
}

export default function PriceChart({ candles }: { candles: Candle[] }) {
  const [range, setRange] = useState<RangeKey>('24h');
  const [hover, setHover] = useState<number | null>(null);

  const view = useMemo(() => {
    const hours = RANGES.find((r) => r.key === range)!.hours;
    const slice = candles.slice(-hours);
    if (slice.length < 2) return null;

    const lows = slice.map((c) => c.l).filter(Number.isFinite);
    const highs = slice.map((c) => c.h).filter(Number.isFinite);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    // Plaski szereg (min == max) dalby dzielenie przez zero - wtedy rysujemy
    // linie w polowie wysokosci, co jest prawda: cena sie nie zmieniala.
    const span = max - min || max || 1;

    const W = 100;
    const H = 36;
    const points = slice.map((c, i) => {
      const x = (i / (slice.length - 1)) * W;
      const y = H - ((c.c - min) / span) * H;
      return { x, y, c };
    });

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const area = `${line} L${W},${H} L0,${H} Z`;

    const first = slice[0].o;
    const last = slice[slice.length - 1].c;
    const move = first > 0 ? (last - first) / first : null;
    const volume = slice.reduce((sum, c) => sum + (Number.isFinite(c.v) ? c.v : 0), 0);

    return { slice, points, line, area, min, max, move, volume, W, H };
  }, [candles, range]);

  if (!view) {
    return (
      <p className="text-[12.5px] leading-[1.55] text-soft-ink-muted">
        Not enough price history to draw a chart yet.
      </p>
    );
  }

  const shown = hover !== null ? view.slice[hover] : view.slice[view.slice.length - 1];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-soft-display text-[24px] font-bold leading-none text-soft-ink">
            {price(shown.c)}
          </p>
          <p className="mt-1 text-[11.5px] text-soft-ink-faint">
            {hover !== null
              ? new Date(shown.t * 1000).toLocaleString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'latest'}
          </p>
        </div>

        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                setRange(r.key);
                setHover(null);
              }}
              className={`rounded-pill px-2.5 py-1 font-soft-display text-[11.5px] font-bold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.96] ${
                range === r.key
                  ? 'bg-soft-primary text-white'
                  : 'bg-soft-sunken text-soft-ink-muted hover:text-soft-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== WYKRES =====
          `preserveAspectRatio="none"` celowo: rozciagamy siatke na szerokosc
          kontenera, bo interesuje nas KSZTALT w czasie, a nie proporcje.
          Kreska ma `vector-effect`, zeby przy rozciaganiu nie zgrubiala. */}
      <div
        className="relative"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - box.left) / box.width;
          const i = Math.round(frac * (view.slice.length - 1));
          setHover(Math.max(0, Math.min(view.slice.length - 1, i)));
        }}
      >
        <svg
          viewBox={`0 0 ${view.W} ${view.H}`}
          preserveAspectRatio="none"
          className="h-[140px] w-full sm:h-[180px]"
          aria-label="Price over time"
        >
          <defs>
            <linearGradient id="b20fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(124 107 218)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="rgb(124 107 218)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={view.area} fill="url(#b20fill)" />
          <path
            d={view.line}
            fill="none"
            stroke="rgb(124 107 218)"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hover !== null && (
            <line
              x1={view.points[hover].x}
              y1="0"
              x2={view.points[hover].x}
              y2={view.H}
              stroke="rgb(124 107 218)"
              strokeWidth="1"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
              opacity="0.5"
            />
          )}
        </svg>
      </div>

      {/* Oba konce zakresu podane wprost - skala nie zaczyna sie od zera,
          wiec bez tego wychylenie wygladalo by na wieksze, niz jest. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11.5px] text-soft-ink-faint">
        <span>
          range {price(view.min)} – {price(view.max)}
        </span>
        <span>
          {view.volume > 0 ? `$${Math.round(view.volume).toLocaleString('en-US')} traded` : 'no volume in this window'}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-[1.5] text-soft-ink-faint">
        Hourly candles from GeckoTerminal, which indexes this pool. We did not compute these
        ourselves.
      </p>
    </div>
  );
}
