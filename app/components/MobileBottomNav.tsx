'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usesBoardTheme } from './Navigation/Navigation';

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
 * Piec pozycji to komplet, ktory miesci sie przy 320px, a StartPad w srodku
 * jest wypukly i najwazniejszy.
 *
 * MONEY ZOSTAJE TU MIMO SCALENIA. W gornej belce "Money" zniknelo jako wpis -
 * wlasna ksiega pieniedzy jest dzis zakladka /asks (?tab=money). Tutaj zostaje
 * osobnym przyciskiem, bo ten pasek nie odchudza sie z pozycji, tylko wybiera
 * piec najczestszych celow, a saldo do odebrania jest jednym z nich. Skrot
 * prowadzi wprost do zakladki.
 *
 * CENA TEGO SKROTU: `isActive` zna tylko sciezke, nie query (`usePathname`),
 * wiec na zakladce Money podswietla sie "Asks", a nie "Money". Swiadomie -
 * `useSearchParams` w komponencie renderowanym na KAZDEJ stronie wymusza
 * granice <Suspense> na wszystkich, ktore sa dzis statyczne. Zla pigulka jest
 * tansza niz wypchniecie calej apki z prerenderu.
 *
 * === STARTPAD (REDESIGN 2026-10-14) ===
 * Wypukly, fioletowy przycisk z rozowa odznaka "New" zniknal: jeden element
 * krzyczacy w pasku, w ktorym wszystko inne jest ciche, rozjezdzal sie z gorna
 * belka (zakladki tekstowe). Pasek to teraz piec rownych pozycji, aktywna ma
 * atrament i wskaznik na gornej krawedzi, ktory slizga sie miedzy pozycjami.
 * StartPad zostal w srodku; "nowosc" niesie mala morska kropka przy ikonie.
 */

type Poz = {
  href: string;
  label: string;
  /** Mala kropka przy ikonie - nowosc, nie odznaka. */
  fresh?: boolean;
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
    fresh: true,
    // Rakieta - launchpad.
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
    href: '/asks?tab=money',
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

  // Pierwsza aktywna pozycja; Money dzieli sciezke z Asks (patrz naglowek), wiec
  // wskaznik stoi na Asks. Brak aktywnej (np. /perps) chowa wskaznik.
  const activeIndex = POZYCJE.findIndex((poz) => isActive(poz.href.split('?')[0]));

  return (
    <div className={usesBoardTheme(pathname) ? 'board' : undefined}>
      <div className="group/bottom-nav fixed bottom-0 left-0 right-0 z-40 lg:hidden md:max-lg:[@media(hover:hover)]:translate-y-[calc(100%-14px)] md:max-lg:transition-transform md:max-lg:[transition-duration:var(--dur-dropdown)] md:max-lg:ease-out-strong md:max-lg:group-hover/bottom-nav:translate-y-0 md:max-lg:group-focus-within/bottom-nav:translate-y-0">
        <nav aria-label="Sections" className="relative border-t border-soft-line bg-soft-surface/90 backdrop-blur-md">
          {/* Wskaznik na gornej krawedzi: szerokosc jednej z pieciu kolumn,
              przesuniecie z indeksu - ten sam trik co .board-tabs-thumb. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-px left-0 h-[2px] rounded-full bg-soft-ink transition-[transform,opacity] [transition-duration:var(--dur-sheet)] ease-drawer"
            style={{
              width: `${100 / POZYCJE.length}%`,
              transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
              opacity: activeIndex >= 0 ? 1 : 0,
            }}
          />
          <div className="grid grid-cols-5 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5">
            {POZYCJE.map((poz, index) => {
              const aktywna = index === activeIndex;
              return (
                <Link
                  key={poz.href}
                  href={poz.href}
                  aria-current={aktywna ? 'page' : undefined}
                  className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg py-1 outline-none transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  <span className="relative">
                    <svg
                      className={`h-[22px] w-[22px] transition-colors [transition-duration:var(--dur-press)] ${aktywna ? 'text-soft-ink' : 'text-soft-ink-muted'}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={aktywna ? 2.2 : 1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {poz.icon}
                    </svg>
                    {poz.fresh && (
                      <>
                        <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-soft-ask ring-2 ring-soft-surface" aria-hidden="true" />
                        <span className="sr-only"> (new)</span>
                      </>
                    )}
                  </span>
                  <span className={`font-soft text-[11px] font-semibold ${aktywna ? 'text-soft-ink' : 'text-soft-ink-muted'}`}>
                    {poz.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Miejsce pod pasek, zeby nie zaslanial konca tresci. */}
      <div className="h-16 md:max-lg:h-[14px] lg:h-0" />
    </div>
  );
}
