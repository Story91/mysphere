'use client';

import { formatEther } from 'viem';

/**
 * Wykres ceny w jednym <svg>, bez biblioteki.
 *
 * Cala trudnosc jest w skali pionowej: ceny perpow roznia sie miedzy soba
 * o promile, wiec skala od zera daje plaska kreske na kazdym rynku. Skalujemy
 * wiec do ZAKRESU danych, a gdy zakres jest zerowy (jedna cena albo same
 * rowne), rysujemy linie przez srodek zamiast dzielic przez zero.
 */
export default function Sparkline({
  points,
  width = 520,
  height = 120,
}: {
  points: bigint[];
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
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 8;
  const usable = height - pad * 2;

  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = span === 0 ? height / 2 : pad + (1 - (v - min) / span) * usable;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const up = values[values.length - 1] >= values[0];
  const stroke = up ? '#059669' : '#dc2626';
  const areaPath = `M0,${height} L${coords.join(' L')} L${width},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-[120px] w-full"
      role="img"
      aria-label="Price chart"
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
    </svg>
  );
}
