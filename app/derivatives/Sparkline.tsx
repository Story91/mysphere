'use client';

import { formatEther } from 'viem';
import { fmtPrice } from './format';

/**
 * Wykres ceny w jednym <svg>, bez biblioteki.
 *
 * Cala trudnosc jest w skali pionowej: ceny perpow roznia sie miedzy soba
 * o promile, wiec skala od zera daje plaska kreske na kazdym rynku. Skalujemy
 * wiec do ZAKRESU danych, a gdy zakres jest zerowy (jedna cena albo same
 * rowne), rysujemy linie przez srodek zamiast dzielic przez zero.
 *
 * `baseline` (cena mark) wchodzi do TEJ SAMEJ skali co punkty. To jest cala
 * wartosc tego wykresu na rynku perpetual: nie interesuje nas ksztalt feedu
 * sam w sobie, tylko BAZA - o ile vAMM odjechal od indeksu, bo to ona placi
 * funding. Jesli mark wypada poza zakresem historii, rozszerzamy zakres
 * zamiast chowac linie poza kadrem.
 *
 * Opisy sa HTML-em NAD svg, nie <text> w srodku: svg ma
 * `preserveAspectRatio="none"`, wiec kazdy tekst w nim zostalby rozciagniety
 * razem z krzywa.
 */
export default function Sparkline({
  points,
  baseline,
  baselineLabel = 'mark',
  width = 520,
  height = 120,
}: {
  points: bigint[];
  baseline?: bigint | null;
  baselineLabel?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-[14px] border border-dashed border-sp-shade/20 text-xs text-sp-ink-soft"
        style={{ height }}
      >
        Not enough price points to draw a chart
      </div>
    );
  }

  const values = points.map((p) => Number(formatEther(p)));
  const base = baseline != null ? Number(formatEther(baseline)) : null;
  const hasBase = base != null && Number.isFinite(base);

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const min = hasBase ? Math.min(dataMin, base) : dataMin;
  const max = hasBase ? Math.max(dataMax, base) : dataMax;
  const span = max - min;
  const pad = 10;
  const usable = height - pad * 2;
  const y = (v: number) => (span === 0 ? height / 2 : pad + (1 - (v - min) / span) * usable);

  const coords = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(2)},${y(v).toFixed(2)}`);

  const up = values[values.length - 1] >= values[0];
  const stroke = up ? '#059669' : '#dc2626';
  const areaPath = `M0,${height} L${coords.join(' L')} L${width},${height} Z`;
  const lastY = y(values[values.length - 1]);
  const baseY = hasBase ? y(base) : null;

  return (
    <div>
      {/* Warstwa opisow liczy swoje `top` w PROCENTACH tego kontenera, wiec
          kontener musi miec DOKLADNIE wysokosc wykresu. Gdy obejmowal takze
          wiersz min/max, etykieta marku ladowala na nim. */}
      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Index price history, ${values.length} points, from ${fmtPrice(points[0])} to ${fmtPrice(points[points.length - 1])}`}
        >
          <defs>
            <linearGradient id="deriv-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#deriv-spark)" />
          <polyline
            points={coords.join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {baseY != null && (
            <line
              x1="0"
              x2={width}
              y1={baseY}
              y2={baseY}
              stroke="rgb(124 107 218)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Kropka na ostatnim punkcie - pozycjonowana w PROCENTACH, bo svg jest
            rozciagany niejednorodnie i wspolrzedne w nim nie sa pikselami. */}
        <span
          className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-sp-surface"
          style={{ left: '100%', top: `${(lastY / height) * 100}%`, background: stroke }}
        />
        {baseY != null && (
          <span
            className="pointer-events-none absolute left-0 -translate-y-1/2 rounded-full bg-sp-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-sp-brand-deep"
            style={{ top: `${(baseY / height) * 100}%` }}
          >
            {baselineLabel}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-[10px] tabular-nums text-sp-ink-soft">
        <span>low {fmtPrice(points[values.indexOf(dataMin)] ?? points[0])}</span>
        <span>{values.length} feed updates</span>
        <span>high {fmtPrice(points[values.indexOf(dataMax)] ?? points[0])}</span>
      </div>
    </div>
  );
}
