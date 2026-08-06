'use client';

/**
 * Przelacznik widokow na TELEFONIE - w panelu Profil, nie na feedzie.
 *
 * PO CO GO TU PRZENIESLISMY. "All Posts / My Profile / Follows / Friends /
 * Discover" siedzialy dotad na gorze glownego feedu, jako rzad kolorowych
 * kafli. Zabieraly pierwszy ekran telefonu i konkurowaly z trescia, po ktora
 * ludzie tu przychodza - a cztery z pieciu pozycji to nie jest feed, tylko
 * osobne widoki.
 *
 * Tak samo rozwiazuje to Twitter: os czasu jest sama, a wszystko, co "moje",
 * siedzi za profilem. Glowny ekran ma jedno zadanie.
 *
 * Na desktopie NIC SIE NIE ZMIENIA - tam jest miejsce w bok i rzad kafli
 * nikomu nie przeszkadza. Ten komponent renderuje sie wylacznie ponizej `lg`.
 *
 * DOSTEPNOSC: lista pozycji z aria-current na aktywnej. Kazda ma opis, bo sama
 * nazwa ("Discover") nie mowi, dokad prowadzi.
 */

export type SoftSection = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  onSelect: () => void;
  isActive: boolean;
};

export default function SoftSectionList({ sections }: { sections: SoftSection[] }) {
  return (
    <nav aria-label="Views" className="mb-4 flex flex-col gap-2 lg:hidden">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={section.onSelect}
          aria-current={section.isActive ? 'page' : undefined}
          className={[
            'flex w-full items-center gap-3 rounded-card p-3.5 text-left',
            'transition-[background-color,transform] duration-[--dur-press] ease-out-strong',
            'active:scale-[0.98] outline-none',
            'focus-visible:ring-2 focus-visible:ring-soft-primary',
            section.isActive ? 'bg-soft-primary text-white' : 'bg-soft-surface shadow-card',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'flex h-10 w-10 flex-none items-center justify-center rounded-[14px]',
              section.isActive ? 'bg-white/20 text-white' : 'bg-soft-sunken text-soft-primary',
            ].join(' ')}
          >
            {section.icon}
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={`block font-soft-display text-[14.5px] font-bold ${
                section.isActive ? 'text-white' : 'text-soft-ink'
              }`}
            >
              {section.label}
            </span>
            <span
              className={`block font-soft text-[12px] ${
                section.isActive ? 'text-white/80' : 'text-soft-ink-faint'
              }`}
            >
              {section.description}
            </span>
          </span>

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
        </button>
      ))}
    </nav>
  );
}
