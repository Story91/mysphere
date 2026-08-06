'use client';

/**
 * Zakladki feedu jako pigulki.
 *
 * Z projektu (wariant 1b): padding 8/16, promien 999px, aktywna ma tlo fioletu,
 * bialy tekst grubosci 700 i cien; nieaktywna biale tlo i tekst 600 w kolorze
 * przygaszonym.
 *
 * DLACZEGO TO NIE JEST <nav>, TYLKO GRUPA PRZYCISKOW. Te zakladki nie zmieniaja
 * adresu - filtruja liste w miejscu. Oznaczenie ich nawigacja klamaloby
 * czytnikowi ekranu, ze prowadza gdzie indziej.
 *
 * ANIMACJA: sam kolor, bez ruchu. Ktos przelacza zakladki dziesiatki razy
 * dziennie, a animowane przejscie miedzy nimi po dziesiatym razie przestaje
 * cieszyc i zaczyna opozniac. Zostaje tylko nacisniecie - 140 ms, skala 0.97.
 */

export type SoftTab = { id: string; label: string };

export default function SoftTabs({
  tabs,
  activeTab,
  onSelect,
  className = '',
}: {
  tabs: SoftTab[];
  activeTab: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] ${className}`}
      role="group"
      aria-label="Filter the feed"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            aria-pressed={isActive}
            className={[
              'flex-none whitespace-nowrap rounded-pill px-4 py-2 font-soft text-[12.5px]',
              'transition-[background-color,color,transform] duration-[--dur-press] ease-out-strong',
              'active:scale-[0.97] outline-none',
              'focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-bg',
              isActive
                ? 'bg-soft-primary font-bold text-white shadow-[0_4px_12px_rgba(124,107,218,0.3)]'
                : 'bg-soft-surface font-semibold text-soft-ink-muted',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
