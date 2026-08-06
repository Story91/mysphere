'use client';

/**
 * Przelacznik widokow - lista, nie rzad kafli na feedzie.
 *
 * PO CO GO TU PRZENIESLISMY. "All Posts / My Profile / My Feed / Follows /
 * Friends / Discover" siedzialy dotad na gorze glownego feedu: na telefonie
 * jako rzad kolorowych kafli, na desktopie jako siatka <GlassIcons/>. Cztery
 * z szesciu pozycji nie sa feedem, tylko osobnymi widokami - a mimo to
 * zabieraly pierwszy ekran i konkurowaly z trescia, po ktora ludzie tu
 * przychodza.
 *
 * Tak samo rozwiazuje to Twitter: os czasu jest sama, a nawigacja siedzi
 * w kolumnie obok. Glowny ekran ma jedno zadanie.
 *
 * DWA WARIANTY, JEDEN KOMPONENT:
 *  - `comfortable` (telefon) - ikona 40px i zdanie opisu, bo tam ta lista
 *    jest calym ekranem i moze oddychac;
 *  - `compact` (desktop) - ikona 36px, bez opisu, bo tam jest szescioma
 *    pozycjami stalej nawigacji nad profilem i nie moze zjesc pol kolumny.
 * Opisy nie znikaja bez sladu: w wariancie kompaktowym ida do `title`.
 *
 * DOSTEPNOSC: <nav> z etykieta, aria-current na aktywnej pozycji, widoczny
 * pierscien fokusa. Widocznoscia na danej szerokosci steruje `className`
 * z miejsca uzycia - komponent sam niczego nie chowa.
 */

export type SoftSection = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  onSelect: () => void;
  isActive: boolean;
};

export default function SoftSectionList({
  sections,
  className = '',
  ariaLabel = 'Views',
  variant = 'comfortable',
}: {
  sections: SoftSection[];
  className?: string;
  ariaLabel?: string;
  variant?: 'comfortable' | 'compact';
}) {
  const isCompact = variant === 'compact';

  return (
    <nav aria-label={ariaLabel} className={`flex flex-col ${isCompact ? 'gap-1' : 'gap-2'} ${className}`}>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={section.onSelect}
          aria-current={section.isActive ? 'page' : undefined}
          title={isCompact ? section.description : undefined}
          className={[
            'flex w-full items-center gap-3 rounded-card text-left',
            isCompact ? 'p-2' : 'p-3.5',
            'transition-[background-color,transform] duration-[--dur-press] ease-out-strong',
            'active:scale-[0.98] outline-none',
            'focus-visible:ring-2 focus-visible:ring-soft-primary',
            section.isActive
              ? 'bg-soft-primary text-white'
              : isCompact
                ? 'bg-transparent hover:bg-soft-sunken'
                : 'bg-soft-surface shadow-card',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'flex flex-none items-center justify-center rounded-[14px]',
              isCompact ? 'h-9 w-9' : 'h-10 w-10',
              section.isActive ? 'bg-white/20 text-white' : 'bg-soft-sunken text-soft-primary',
            ].join(' ')}
          >
            {section.icon}
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={`block truncate font-soft-display font-bold ${
                isCompact ? 'text-[14px]' : 'text-[14.5px]'
              } ${section.isActive ? 'text-white' : 'text-soft-ink'}`}
            >
              {section.label}
            </span>
            {!isCompact && (
              <span
                className={`block font-soft text-[12px] ${
                  section.isActive ? 'text-white/80' : 'text-soft-ink-faint'
                }`}
              >
                {section.description}
              </span>
            )}
          </span>

          {!isCompact && (
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={section.isActive ? 'text-white/70' : 'text-soft-line-strong'}
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          )}
        </button>
      ))}
    </nav>
  );
}
