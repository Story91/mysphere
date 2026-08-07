'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Dolny pasek dla tras SPOZA feedu.
 *
 * === PO CO OSOBNY KOMPONENT ===
 * Dolny pasek na /basechat nie jest nawigacja miedzy stronami - to przelacznik
 * TRZECH PANELI jednej strony (Profile / Feed / Trends), sterujacy jej stanem
 * `activeMobilePanel`. Poza feedem nie ma czego przelaczac, wiec tamten pasek
 * nie moze byc uzyty globalnie.
 *
 * Skutek byl taki, ze /asks nie mialo na telefonie ZADNEGO dolnego paska.
 * Zgloszenie: "jak wlaczam ask to znika menu na dole, ciezko przeskoczyc gdzie
 * indziej". Gorna belka byla, ale na telefonie chowa sie pod hamburgerem -
 * czyli wyjscie istnialo, tylko nie bylo widoczne.
 *
 * Ten pasek to zwykle LINKI, nie przelacznik stanu. Dziala wiec na kazdej
 * trasie i mozna go dolozyc wszedzie tam, gdzie ktos moze utknac.
 *
 * === DLACZEGO TRZY POZYCJE, A NIE PIEC ===
 * Przy 320px czwarta etykieta zaczyna sie lamac. Trzy pozycje to trzy
 * kierunki, w ktore czlowiek naprawde chce wyjsc: wrocic do feedu, zobaczyc
 * pytania z kwota, zobaczyc rozliczone platnosci.
 */

const POZYCJE = [
  {
    href: '/basechat',
    label: 'Feed',
    icon: (
      <path d="M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
    ),
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
    href: '/leaderboard',
    label: 'Paid',
    icon: (
      <>
        <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" />
      </>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="Sections"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-soft-line bg-soft-surface/95 backdrop-blur-xl lg:hidden"
      >
        <div className="flex items-center justify-around p-4">
          {POZYCJE.map((poz) => {
            // `startsWith` z ukosnikiem, zeby /asks nie zapalalo sie na
            // /askstore ani podobnym - a jednoczesnie zeby podtrasy liczyly sie
            // jako ta sama sekcja.
            const aktywna =
              pathname === poz.href || Boolean(pathname?.startsWith(poz.href + '/'));

            return (
              <Link
                key={poz.href}
                href={poz.href}
                aria-current={aktywna ? 'page' : undefined}
                className="flex min-h-[44px] min-w-[44px] flex-col items-center rounded-card p-2 transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
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
                <span
                  className={`mt-1 font-soft text-[11.5px] font-bold ${
                    aktywna ? 'text-soft-primary-deep' : 'text-soft-ink-soft'
                  }`}
                >
                  {poz.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Miejsce pod pasek, zeby nie zaslanial konca tresci. */}
      <div className="h-20 lg:h-0" />
    </>
  );
}
