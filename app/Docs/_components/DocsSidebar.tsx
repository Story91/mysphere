'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DOC_GROUPS, DOC_PAGES, docHref } from '../nav';

/** Sidebar dokumentacji (desktop). Kliencki tylko po to, zeby podswietlic
 *  aktywna strone z `usePathname`. */
export default function DocsSidebar() {
  const pathname = usePathname();

  const isActive = (slug: string) => {
    if (slug === '') return pathname === '/Docs' || pathname === '/Docs/';
    const href = docHref(slug);
    return pathname === href || pathname === `${href}/`;
  };

  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6">
      {DOC_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-2 px-2.5 font-soft text-[11px] font-bold uppercase tracking-[0.14em] text-soft-ink-faint">
            {group}
          </p>
          <ul className="flex flex-col gap-0.5">
            {DOC_PAGES.filter((p) => p.group === group).map((p) => {
              const active = isActive(p.slug);
              return (
                <li key={p.slug || 'overview'}>
                  <Link
                    href={docHref(p.slug)}
                    aria-current={active ? 'page' : undefined}
                    className={`block rounded-lg px-2.5 py-1.5 font-soft-display text-[13.5px] font-semibold transition-colors [transition-duration:var(--dur-press)] ease-out-strong ${
                      active
                        ? 'bg-soft-primary text-white'
                        : 'text-soft-ink-muted hover:bg-soft-sunken hover:text-soft-ink'
                    }`}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* Whitepaper zyje jako osobny, samodzielny plik (statyczny HTML) - stad
          zwykly <a target=_blank>, a nie wpis w liscie tras dokumentacji. */}
      <a
        href="/mysphere-whitepaper-english.html"
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg px-2.5 py-1.5 font-soft-display text-[13.5px] font-semibold text-soft-ink-muted transition-colors hover:bg-soft-sunken hover:text-soft-ink"
      >
        Whitepaper ↗
      </a>
    </nav>
  );
}
