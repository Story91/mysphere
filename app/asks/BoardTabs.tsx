'use client';

import Link from 'next/link';

export type BoardTab = { id: string; label: string; href: string };

/**
 * Przelacznik widokow /asks: segmenty ze slizgajacym sie wskaznikiem.
 *
 * Kazdy segment to <Link>, wiec adresy dzialaja, a wstecz wraca do poprzedniej
 * zakladki - wskaznik jest tylko ruchem, nie stanem. Pozycje liczy CSS z
 * indeksu (`.board-tabs-thumb`, globals.css), a komponent stoi w stalym miejscu
 * drzewa strony, wiec przy zmianie zakladki React go nie odmontowuje i
 * wskaznik naprawde przesuwa sie z jednego segmentu na drugi.
 */
export default function BoardTabs({
  tabs,
  active,
  label,
}: {
  tabs: BoardTab[];
  active: string;
  label: string;
}) {
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active)
  );

  return (
    <nav
      aria-label={label}
      className="w-full max-w-[380px] rounded-[12px] bg-soft-sunken p-1"
    >
      <div
        className="relative grid"
        style={
          {
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            '--n': tabs.length,
            '--i': index,
          } as React.CSSProperties
        }
      >
        <span
          aria-hidden="true"
          className="board-tabs-thumb pointer-events-none absolute inset-y-0 left-0 rounded-[9px] bg-soft-surface shadow-chip"
        />
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={tab.id === active ? 'page' : undefined}
            className={`relative z-10 inline-flex items-center justify-center rounded-[9px] px-2 py-2 font-soft-display text-[13px] font-semibold transition-colors [transition-duration:var(--dur-press)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
              tab.id === active ? 'text-soft-ink' : 'text-soft-ink-muted hover:text-soft-ink'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
