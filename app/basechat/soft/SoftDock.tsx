'use client';

/**
 * Plywajacy dock na dole ekranu.
 *
 * PO CO. Dotychczasowa nawigacja mobilna byla na GORZE, czyli w miejscu, do
 * ktorego kciuk nie siega bez przekladania telefonu. Trzy widoki, miedzy
 * ktorymi realnie sie krazy - feed, profil, trendy - siedza teraz w zasiegu.
 *
 * Z projektu (wariant 1b): pigulka na dole, aktywny element ma tlo lawendowe,
 * promien 14px i kropke pod ikona; nieaktywne sa samymi ikonami w kolorze
 * przygaszonym.
 *
 * KROPKA POD AKTYWNA IKONA NIE JEST OZDOBA. Ikony w docku roznia sie ksztaltem,
 * ale nie na tyle, zeby stan aktywny dalo sie odczytac z samego koloru - zwlaszcza
 * przy jasnym ekranie w sloncu. Kropka podaje te sama informacje ksztaltem.
 *
 * `pb-[env(safe-area-inset-bottom)]` - bez tego dock wchodzi pod pasek gestow
 * na iPhonie i dolny rzad ikon lapie polowe dotyku.
 */

export type SoftDockItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

export default function SoftDock({
  items,
  activeItem,
  onSelect,
}: {
  items: SoftDockItem[];
  activeItem: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(12px,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-pill bg-soft-surface px-2 py-1.5 shadow-float">
        {items.map((item) => {
          const isActive = item.id === activeItem;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className={[
                'flex flex-col items-center gap-[3px] rounded-[14px] px-4 py-1.5',
                'transition-[background-color,transform] duration-[--dur-press] ease-out-strong',
                'active:scale-[0.94] outline-none',
                'focus-visible:ring-2 focus-visible:ring-soft-primary',
                isActive ? 'bg-soft-sunken text-soft-primary' : 'text-soft-line-strong',
              ].join(' ')}
            >
              <span aria-hidden="true" className="flex h-[22px] w-[22px] items-center justify-center">
                {item.icon}
              </span>
              {/* Kropka rysuje sie zawsze, ale przezroczysta gdy nieaktywna -
                  dzieki temu wysokosc przycisku nie skacze przy przelaczaniu. */}
              <span
                aria-hidden="true"
                className={`h-1 w-1 rounded-full bg-soft-primary transition-opacity duration-[--dur-press] ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Ikony docka. Kreski 2.2 przy aktywnej, 2 przy reszcie - tak jak w projekcie. */
export const SOFT_DOCK_ICONS = {
  feed: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" />
    </svg>
  ),
  profile: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0116 0" />
    </svg>
  ),
  trends: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 21v-8M11 21V6M18 21v-12" />
    </svg>
  ),
} as const;
