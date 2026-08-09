import Link from 'next/link';

/**
 * Nawigacja sekcji B20.
 *
 * KOLEJNOSC JEST TU CALA TRESCIA. Rynek jest pierwszy, bo to on ma sens dla
 * kogos, kto wchodzi z ulicy. Tworzenie drugie. Narzedzia - kopalnia adresow
 * i budowniczy memo - trzecie i ostatnie, bo to sa rzeczy dla kogos, kto juz
 * wie, po co tu jest. Wczesniej stalo to w odwrotnej kolejnosci i wlasnie to
 * bylo zarzutem: konsola techniczna zamiast rynku.
 */
export default function B20Nav({ active }: { active: 'market' | 'create' | 'tools' }) {
  const items: { id: 'market' | 'create' | 'tools'; href: string; label: string }[] = [
    { id: 'market', href: '/b20', label: 'Market' },
    { id: 'create', href: '/b20/create', label: 'Create' },
    { id: 'tools', href: '/b20/tools', label: 'Tools' },
  ];

  return (
    <nav className="mb-4 flex gap-1.5" aria-label="B20 sections">
      {items.map((item) => {
        const current = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`rounded-pill border px-3.5 py-1.5 font-soft-display text-[12.5px] font-bold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] ${
              current
                ? 'border-soft-line-strong bg-soft-surface text-soft-ink shadow-card'
                : 'border-transparent bg-transparent text-soft-ink-faint'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
