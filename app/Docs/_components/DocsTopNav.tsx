'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOC_PAGES, docHref } from '../nav';

/**
 * Pasek nawigacji dokumentacji na telefonie i tablecie (ponizej `lg`, gdzie
 * sidebar jest schowany). Poziomy, przewijalny - te same pozycje co sidebar.
 */
export default function DocsTopNav() {
  const pathname = usePathname();

  const isActive = (slug: string) => {
    if (slug === '') return pathname === '/Docs' || pathname === '/Docs/';
    const href = docHref(slug);
    return pathname === href || pathname === `${href}/`;
  };

  return (
    <div className="mb-7 lg:hidden">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DOC_PAGES.map((p) => {
          const active = isActive(p.slug);
          return (
            <Link
              key={p.slug || 'overview'}
              href={docHref(p.slug)}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-pill border px-3.5 py-1.5 font-soft-display text-[12.5px] font-bold transition-colors [transition-duration:var(--dur-press)] ease-out-strong ${
                active
                  ? 'border-soft-primary bg-soft-primary text-white'
                  : 'border-soft-line bg-soft-surface text-soft-ink-muted hover:text-soft-ink'
              }`}
            >
              {p.title}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
