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
 * === DLACZEGO CZTERY POZYCJE, A NIE PIEC ===
 * Bylo tu trzy, z uzasadnieniem "przy 320px czwarta etykieta zaczyna sie
 * lamac". To ograniczenie dotyczy DLUGOSCI etykiety, nie samej liczby pozycji:
 * przy 320px pasek ma 288px wnetrza, a przycisk to max(44px, etykieta + 16px).
 * Cztery etykiety po najwyzej piec znakow ("Feed", "Asks", "Paid", "Money")
 * daja 4 x 44 = 176px, czyli 112px zapasu na odstepy. Piata pozycja albo
 * etykieta dluzsza niz piec znakow ten zapas zjada - i wtedy uzasadnienie
 * wyzej wraca w mocy.
 *
 * Czwarta pozycja to "Money" i nie jest ozdobnikiem: bez niej saldo do
 * odebrania z kontraktu escrow bylo widoczne WYLACZNIE na /asks, a na telefonie
 * dodatkowo tylko po wejsciu w tamta zakladke. Pieniadze, ktore czekaja na
 * czlowieka, nie moga byc schowane o jedno kliknięcie glebiej niz feed.
 *
 * Cztery kierunki: wrocic do feedu, zobaczyc pytania z kwota, zobaczyc
 * rozliczone platnosci wszystkich, zobaczyc WLASNE.
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
    // Paid mieszka teraz jako zakladka na /money - link prowadzi wprost do
    // niej, zamiast przez przekierowanie ze starego /leaderboard. Uboczny
    // skutek: pathname nie niesie query, wiec przy otwartej zakladce Paid
    // podswietla sie pigulka "Money" (ta sama strona), a nie ta. To wybor:
    // rozroznienie wymagaloby useSearchParams, a ten hook w komponencie
    // montowanym na kazdej stronie wymusza granice Suspense w calej aplikacji.
    href: '/money?tab=paid',
    label: 'Paid',
    icon: (
      <>
        <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" />
      </>
    ),
  },
  {
    href: '/money',
    label: 'Money',
    // Banknot, a nie slupki - slupki oznaczaja w tym pasku "Paid", czyli cudze
    // rozliczenia. Dwie strony o pieniadzach musza roznic sie KSZTALTEM, nie
    // samym napisem: przy 11.5px etykieta czytana katem oka nie rozstrzyga.
    icon: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  /**
   * ===== KOMPONENT SAM PILNUJE, GDZIE GO NIE MA =====
   *
   * Dotad wstawialy go POJEDYNCZE strony - i tylko dwie z osmiu to zrobily.
   * Na telefonie /asks i /money mialy dolny pasek, a /curators, /how,
   * /leaderboard, /re-definition i /join nie mialy nic w zasiegu kciuka:
   * jedynym wyjsciem byla gorna belka albo przycisk "wstecz" przegladarki.
   * Nowa strona domyslnie ladowala w tej gorszej grupie, bo trzeba bylo
   * PAMIETAC o dopisaniu paska.
   *
   * Teraz pasek stoi raz, w AppShell, a warunek widocznosci nalezy do niego
   * samego. Kazda przyszla trasa dostaje go bez pamietania o czymkolwiek.
   *
   * WYJATEK: /basechat. Tamtejszy dolny pasek NIE JEST nawigacja miedzy
   * stronami, tylko przelacznikiem trzech paneli jednej strony (Profile /
   * Feed / Trends) sterujacym jej stanem. Dwa paski jeden na drugim to dwa
   * rozne znaczenia tego samego miejsca na ekranie.
   */
  if (pathname === '/basechat' || pathname?.startsWith('/basechat/')) return null;

  return (
    <>
      <div className="group/bottom-nav fixed bottom-0 left-0 right-0 z-40 lg:hidden md:max-lg:[@media(hover:hover)]:translate-y-[calc(100%-14px)] md:max-lg:transition-transform md:max-lg:[transition-duration:var(--dur-dropdown)] md:max-lg:ease-out-strong md:max-lg:group-hover/bottom-nav:translate-y-0 md:max-lg:group-focus-within/bottom-nav:translate-y-0">
      <nav aria-label="Sections" className="border-t border-soft-line bg-soft-surface/95 backdrop-blur-xl">
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
      </div>

      {/* Miejsce pod pasek, zeby nie zaslanial konca tresci. */}
      <div className="h-20 md:max-lg:h-[14px] lg:h-0" />
    </>
  );
}
