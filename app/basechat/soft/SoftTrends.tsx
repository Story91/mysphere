'use client';

/**
 * Widok Trends - i miejsce, w ktorym MIESZKA MARQUEE.
 *
 * PO CO GO STAD ZABRALISMY. Pasek z kursami jechal wczesniej na gorze feedu,
 * czyli tuz nad trescia, dla ktorej ludzie tu przychodza. Ruch w polu widzenia
 * przy czytaniu jest kosztowny: oko lapie go odruchowo, wiec kazde zdanie
 * w poscie konkuruje z animacja obok. Do tego kursy BTC nie zmieniaja niczego
 * w decyzji "przewijac dalej czy nie".
 *
 * Tutaj marquee jest na miejscu, bo caly ekran jest o liczbach - nikt nie wchodzi
 * w Trends, zeby czytac.
 *
 * ANIMACJA: linear i tylko tutaj. Ruch ciagly to jedyny przypadek, w ktorym
 * easing byloby bledem - przyspieszanie i zwalnianie taśmy wyglada jak zacinanie.
 * `prefers-reduced-motion` zatrzymuje ja calkowicie: to dekoracja, wiec przy
 * ograniczonym ruchu znika bez straty informacji.
 */

export type SoftTicker = { symbol: string; price: string; change: string; isUp: boolean };
export type SoftStat = { label: string; value: string };

export default function SoftTrends({
  tickers,
  stats,
  children,
}: {
  tickers: SoftTicker[];
  stats: SoftStat[];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 px-4 pb-32 pt-1">
      {/* Marquee. Tasma jest zduplikowana, zeby petla nie miala szwu - przy
          jednej kopii widac przeskok w chwili powrotu na poczatek. */}
      <section
        aria-label="Market prices"
        className="overflow-hidden rounded-card bg-soft-surface py-3 shadow-card"
      >
        <div className="soft-marquee flex w-max gap-8 px-4">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex gap-8" aria-hidden={copy === 1}>
              {tickers.map((ticker) => (
                <span key={`${copy}-${ticker.symbol}`} className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="font-soft-display text-[13.5px] font-bold text-soft-ink">
                    {ticker.symbol}
                  </span>
                  <span className="font-soft text-[13px] tabular-nums text-soft-ink-muted">
                    {ticker.price}
                  </span>
                  <span
                    className={`font-soft text-[12px] font-bold tabular-nums ${
                      ticker.isUp ? 'text-soft-primary-deep' : 'text-soft-accent-deep'
                    }`}
                  >
                    {ticker.isUp ? '▲' : '▼'} {ticker.change}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Network activity" className="grid grid-cols-2 gap-2.5">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-card bg-soft-surface p-4 shadow-card">
            <div className="font-soft-display text-[22px] font-bold tabular-nums text-soft-ink">
              {stat.value}
            </div>
            <div className="font-soft text-[11.5px] font-semibold uppercase tracking-wider text-soft-ink-faint">
              {stat.label}
            </div>
          </div>
        ))}
      </section>

      {children}
    </div>
  );
}
