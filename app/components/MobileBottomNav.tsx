'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Dolny pasek dla tras SPOZA feedu.
 *
 * === PO CO OSOBNY KOMPONENT ===
 * Dolny pasek na /basechat nie jest nawigacja miedzy stronami - to przelacznik
 * TRZECH PANELI jednej strony (Profile / Feed / Trends), sterujacy jej stanem
 * `activeMobilePanel`. Poza feedem nie ma czego przelaczac, wiec tamten pasek
 * nie moze byc uzyty globalnie. Ten pasek to zwykle LINKI - dziala wszedzie.
 *
 * === POZYCJE ===
 * Odbicie gornej belki w zasiegu kciuka: Feed, Asks, StartPad, Money, How.
 * (Re-Definition zostaje w hamburgerze gornej belki - piec pozycji to komplet,
 * ktory miesci sie przy 320px, a StartPad w srodku jest wypukly i najwazniejszy.)
 *
 * === STARTPAD W SRODKU ===
 * StartPad to nowosc, wiec dostaje wyrozniony, PODNIESIONY przycisk w samym
 * srodku paska, z odznaka "New" - ma zachecac do klikniecia, nie ginac w rzedzie.
 */

type Poz = {
  href: string;
  label: string;
  special?: boolean;
  icon: ReactNode;
};

const POZYCJE: Poz[] = [
  {
    href: '/basechat',
    label: 'Feed',
    icon: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />,
  },
  {
    href: '/asks',
    label: 'Asks',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.9.7-.9 1.3v.3" />
        <path d="M12 16.5h.01" />
      </>
    ),
  },
  {
    href: '/startpad',
    label: 'StartPad',
    special: true,
    // Rakieta - launchpad. Wieksza i biala na fioletowym tle przycisku.
    icon: (
      <>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </>
    ),
  },
  {
    href: '/money',
    label: 'Money',
    icon: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
  },
  {
    href: '/how',
    label: 'How',
    // Ksiazka/przewodnik - "jak to dziala".
    icon: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || Boolean(pathname?.startsWith(href + '/'));

  /**
   * WYJATEK: /basechat. Tamtejszy dolny pasek to przelacznik trzech paneli
   * jednej strony, nie nawigacja miedzy stronami - dwa paski jeden na drugim
   * to dwa rozne znaczenia tego samego miejsca na ekranie.
   */
  if (pathname === '/basechat' || pathname?.startsWith('/basechat/')) return null;

  return (
    <>
      <div className="group/bottom-nav fixed bottom-0 left-0 right-0 z-40 lg:hidden md:max-lg:[@media(hover:hover)]:translate-y-[calc(100%-14px)] md:max-lg:transition-transform md:max-lg:[transition-duration:var(--dur-dropdown)] md:max-lg:ease-out-strong md:max-lg:group-hover/bottom-nav:translate-y-0 md:max-lg:group-focus-within/bottom-nav:translate-y-0">
        <nav aria-label="Sections" className="border-t border-soft-line bg-soft-surface/95 backdrop-blur-xl">
          {/* items-end + overflow-visible, zeby wypukly StartPad mogl wystawac ponad pasek */}
          <div className="flex items-end justify-around px-2 pb-3 pt-2">
            {POZYCJE.map((poz) => {
              const aktywna = isActive(poz.href);

              if (poz.special) {
                return (
                  <Link
                    key={poz.href}
                    href={poz.href}
                    aria-current={aktywna ? 'page' : undefined}
                    aria-label="StartPad - new"
                    className="relative -mt-6 flex flex-col items-center"
                  >
                    <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-soft-primary text-white shadow-[0_10px_28px_rgba(124,107,218,0.55)] ring-4 ring-soft-surface transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-95">
                      <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        {poz.icon}
                      </svg>
                      <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#ff4d7d] px-1.5 py-0.5 text-[8px] font-extrabold uppercase leading-none text-white shadow-[0_2px_6px_rgba(255,77,125,0.5)]">
                        New
                      </span>
                    </span>
                    <span className="mt-1 font-soft text-[11px] font-extrabold text-soft-primary-deep">StartPad</span>
                  </Link>
                );
              }

              return (
                <Link
                  key={poz.href}
                  href={poz.href}
                  aria-current={aktywna ? 'page' : undefined}
                  className="flex min-h-[44px] min-w-[44px] flex-col items-center rounded-card p-1.5 transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  <span className={`rounded-full p-1 ${aktywna ? 'bg-soft-sunken' : ''}`}>
                    <svg
                      className="h-6 w-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={aktywna ? '#7C6BDA' : '#8D86AB'}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {poz.icon}
                    </svg>
                  </span>
                  <span className={`mt-1 font-soft text-[11.5px] font-bold ${aktywna ? 'text-soft-primary-deep' : 'text-soft-ink-soft'}`}>
                    {poz.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Miejsce pod pasek, zeby nie zaslanial konca tresci. */}
      <div className="h-20 md:max-lg:h-[14px] lg:h-0" />
    </>
  );
}
