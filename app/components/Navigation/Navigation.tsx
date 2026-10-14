'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import WalletButton from '../wallet/WalletButton';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
// @ts-ignore - config CommonJS wspoldzielony z next.config.js
import { isRouteDisabled } from '@/config/routeStatus';
import { NetworkSwitcher } from '../NetworkSwitcher';
import { NotificationsBell } from './NotificationsBell';

/* ---------------------------------------------------------------------------
   Naglowek aplikacji: logo, trasy, przelacznik sieci, dzwonek i portfel.

   Sam dropdown portfela mieszka w ../wallet/WalletButton - tutaj nie ma juz
   po nim niczego poza jednym wywolaniem komponentu.

   REDESIGN 2026-10-14 ("tablica zlecen"): belka byla rzedem kolorowych pigulek
   z gradientowymi obwodkami, siatka i rozbielonym tlem - dziesiec rzeczy
   walczacych o uwage, zanim ktokolwiek dotarl do tresci. Teraz to zwykle
   zakladki tekstowe: aktywna ma atrament i slizgajace sie podkreslenie, reszta
   jest przygaszona. Kolory tras (fuksja, zielen, cyjan...) znikly - kolor
   niosla tresc stron, nie belka.

   Kolory biora sie z tokenow motywu (--soft-*), wiec motyw sieci (Arc,
   Robinhood) dziala jak dotad. Na stronach Ask i $SPHERE belka dostaje tez
   wrapper `.board`, zeby przycisk portfela i reszta miala ten sam kierunek co
   strona pod nia.
--------------------------------------------------------------------------- */
type NavLink = {
  href: string;
  label: string;
};

const MOBILE_MENU_ID = 'mobile-nav-menu';

/** Strony przemalowane na "tablice zlecen" (patrz .board w globals.css). */
function usesBoardTheme(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === '/asks' ||
    pathname.startsWith('/asks/') ||
    pathname.startsWith('/ask/') ||
    pathname.startsWith('/startpad/sphere')
  );
}

/**
 * Zakladki desktopowe ze slizgajacym sie podkreslieniem.
 *
 * Pozycje i szerokosc wskaznika mierzymy z DOM (offsetLeft/offsetWidth aktywnego
 * linku), a nie liczymy z indeksu: etykiety maja rozna dlugosc. Pomiar powtarza
 * sie przy zmianie trasy, zmianie rozmiaru i po zaladowaniu fontow (zmiana kroju
 * zmienia szerokosci). Pierwszy pomiar idzie bez przejscia - wskaznik nie ma
 * wyjezdzac z lewego rogu przy wejsciu na strone.
 */
function DesktopTabs({
  links,
  isActive,
}: {
  links: NavLink[];
  isActive: (href: string) => boolean;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);
  const activeHref = links.find((link) => isActive(link.href))?.href ?? null;

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list || !activeHref) {
      setBar(null);
      return;
    }
    const el = Array.from(list.querySelectorAll<HTMLAnchorElement>('a[data-href]')).find(
      (node) => node.dataset.href === activeHref
    );
    if (!el) {
      setBar(null);
      return;
    }
    setBar({ x: el.offsetLeft, w: el.offsetWidth });
  }, [activeHref]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    // Przejscie wlacza sie dopiero po pierwszym pomiarze.
    const frame = requestAnimationFrame(() => setAnimate(true));
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, [measure]);

  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul ref={listRef} className="relative flex items-center gap-0.5">
        {links.map((link) => {
          const active = link.href === activeHref;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                data-href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`relative inline-flex items-center rounded-lg px-3 py-2 font-soft-display text-[13.5px] font-semibold transition-colors [transition-duration:var(--dur-press)] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                  active ? 'text-soft-ink' : 'text-soft-ink-muted hover:text-soft-ink'
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        <li
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-0.5 left-0 h-[2px] list-none rounded-full bg-soft-ink ${
            animate ? 'transition-[transform,width,opacity] [transition-duration:var(--dur-sheet)] ease-drawer' : ''
          }`}
          style={{
            width: bar?.w ?? 0,
            transform: `translateX(${bar?.x ?? 0}px)`,
            opacity: bar ? 1 : 0,
          }}
        />
      </ul>
    </nav>
  );
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNotificationsClick = () => {
    router.push('/basechat?view=notifications');
  };

  // Pelna lista tras. Te wylaczone (config/routeStatus.js) sa odfiltrowywane
  // ponizej, zeby nawigacja nie prowadzila w przekierowanie. Wpisy zostaja tu
  // celowo - powrot trasy to usuniecie jej z DISABLED_ROUTES, bez ruszania UI.
  const allNavLinks: NavLink[] = [
    // MySphere === BaseChat. `/` to tylko przekierowanie na /basechat
    // (obsluzone serwerowo w next.config.js), wiec kierujemy tu wprost.
    { href: '/basechat', label: 'MySphere' },
    // Asks stoja TUZ ZA feedem, przed reszta.
    //
    // Powstala strona /asks, trasy API, karta i kompozytor - i NIC do nich nie
    // prowadzilo. Do /asks dalo sie dojsc wylacznie wpisujac adres recznie,
    // wiec z punktu widzenia kazdego uzytkownika ta funkcja nie istniala.
    // Zgloszenie brzmialo: "nie widac strony ASK ani nic co wdrozylismy, skad
    // oni maja wiedziec co robic".
    //
    // Miejsce w kolejnosci nie jest przypadkowe: Ask ma byc jednostka tego
    // produktu, wiec nie moze stac za czterema modulami, z ktorych wiekszosc
    // jest dzis wylaczona.
    //
    // "Money" i "Paid" NIE MAJA juz wlasnych wpisow - wlasna ksiega pieniedzy
    // i publiczna tasma rozliczonych platnosci mieszkaja jako zakladki tutaj
    // (?tab=money, ?tab=paid), obok Kuratorow. Powod ten sam co przy Paid
    // i Kuratorach wczesniej: skarga "za duzo pozycji w nawigacji", a wszystkie
    // te strony mowia o tej samej rzeczy - Ask jest miejscem, w ktorym
    // pieniadze sie zaczynaja, Money jedynym, w ktorym widac, gdzie skonczyly.
    // /money i /leaderboard przekierowuja tu serwerowo, karty OG zostaly pod
    // starymi adresami.
    { href: '/asks', label: 'Asks' },
    { href: '/base', label: 'MyBase' },
    { href: '/mycamp', label: 'MyCamp' },
    { href: '/MyAgents', label: 'MyAgents' },
    { href: '/MyClaw', label: 'MyClaw' },
    // "Curators" tez nie ma wlasnego wpisu - publiczny rejestr zmian kuratorow
    // skarbcow Morpho mieszka jako czwarta zakladka /asks (?tab=curators).
    // /curators przekierowuje na /asks?tab=curators.
    //
    // Startpad (krzywa launchpada) trafil do belki z tego samego powodu, co
    // /asks: strona, do ktorej prowadzi wylacznie wpisanie adresu z palca,
    // z punktu widzenia uzytkownika nie istnieje.
    { href: '/startpad', label: 'Startpad' },
    // $SPHERE zaraz za Startpadem: token pada zyje od 1.09.2026, a jedyna
    // droga do huba byla opcja schowana w dropdownie sieci na boardzie -
    // strona, do ktorej nie prowadzi zaden link, z punktu widzenia
    // uzytkownika nie istnieje (ta sama zasada, co przy /startpad wyzej).
    { href: '/startpad/sphere', label: '$SPHERE' },
    // "CAMP" jest CHWILOWO UKRYTE w belce - ta sama zasada co przy B20 nizej.
    // Trasa /marketplace DZIALA dalej pod adresem i NIE jest w DISABLED_ROUTES,
    // wiec nic nie przekierowuje; jest tylko niepokazana.
    //
    // POWOD (ustalone 11.09.2026, szczegoly w docs/CAMP-MARKETPLACE.md sekcja 0):
    // Camp Origin nie jest utrzymywany. Ich backend odmawia mintu - 403
    // "account surpassing plan limits" i na wysylce pliku, i na podpisie, co
    // sprawdzilismy mintem z linii polecen przy poprawnie wydanej sesji. Na
    // lancuchu: kolekcja IP NFT ma 265 mintow lacznie, ostatni z 1 maja 2026,
    // i ani jednej odsprzedazy w historii. Dzisiejszy ruch na Camp to
    // aktualizacje cen mostu LayerZero, nie ludzie. Prowadzenie uzytkownikow
    // z belki na strone, ktorej glowna akcja zawsze konczy sie bledem po
    // stronie Campa, byloby wysylaniem ich w sciane.
    //
    // POWROT DO BELKI = odkomentowanie ponizszej linii. Kolor obwodki czeka
    // w NAV_ACCENT, wiec nie trzeba ruszac niczego wiecej.
    // { href: '/marketplace', label: 'CAMP' },
    // Perps zaraz za $SPHERE: memy sparowane z perpami Flash na Base MAINNET
    // (/perps, od 2026-10-11). Wczesniej wpis prowadzil do /derivatives - vAMM
    // na Arc TESTNET bez prawdziwych pieniedzy i bez wdrozenia na mainnecie;
    // tamta trasa dziala dalej pod adresem, tylko nie ma jej w belce.
    { href: '/perps', label: 'Perps' },
    // "B20" jest CHWILOWO UKRYTE w belce (na zyczenie). Trasa /b20 DZIALA dalej
    // pod adresem - NIE dodajemy jej do DISABLED_ROUTES, wiec nie jest
    // przekierowana, tylko niepokazana w nawigacji. Powrot do belki =
    // odkomentowanie ponizszej linii.
    // { href: '/b20', label: 'B20' },
    // "How" i manifest odpowiadaja na dwa rozne pytania o ten sam produkt, wiec
    // stoja pod jednym wpisem jako dwie zakladki (?tab=re-definition).
    // /re-definition mowi, DLACZEGO ten produkt istnieje - i ma prawo opisywac
    // rzeczy, ktorych jeszcze nie ma. /how mowi, CO DA SIE ZROBIC TERAZ, i nie
    // ma tam ani jednego zdania w czasie przyszlym. Pierwsze pytanie jest
    // pilniejsze, wiec instrukcja jest zakladka domyslna, a manifest - druga.
    // /re-definition przekierowuje na /how?tab=re-definition.
    //
    // Zgloszenie, ktore postawilo tu instrukcje, brzmialo wprost: "zrob tutorial
    // dla uzytkownikow co mozna robic w tej aplikacji". Wczesniej jedyna droga
    // do dowiedzenia sie, ze da sie sprzedac czesc posta albo zalozyc Aska
    // z budzetem, bylo natkniecie sie na przycisk.
    { href: '/how', label: 'How' },
  ];

  const navLinks: NavLink[] = allNavLinks.filter(
    (link) => link.href === '#' || !isRouteDisabled(link.href)
  );

  const isActiveLink = (href: string) => {
    if (!pathname) return false;
    // Hub $SPHERE ma wlasny wpis w belce, wiec prefiksowe dopasowanie
    // /startpad nie moze zapalac dwoch wpisow naraz na /startpad/sphere/*.
    if (href === '/startpad' && pathname.startsWith('/startpad/sphere')) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className={`sticky top-0 z-50 ${usesBoardTheme(pathname) ? 'board' : ''}`}>
      {/* Belka: polprzezroczysta powierzchnia z rozmyciem i jedna linia na dole. */}
      <header className="w-full border-b border-soft-line bg-soft-surface/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="shrink-0 rounded-xl outline-none transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
              >
                <Image
                  src="/android-chrome-192x192.png"
                  alt="MySphere"
                  width={32}
                  height={32}
                  className="rounded-xl"
                  priority
                />
              </Link>

              <DesktopTabs links={navLinks} isActive={isActiveLink} />

              {/* Mobile Menu Button */}
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen((open) => !open)}
                aria-expanded={isMobileMenuOpen}
                aria-controls={MOBILE_MENU_ID}
                aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                className="rounded-lg p-2 text-soft-ink-muted outline-none transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken hover:text-soft-ink active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-soft-primary md:hidden"
              >
                <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <NetworkSwitcher />
              <NotificationsBell onNotificationsClick={handleNotificationsClick} />
              <WalletButton />
            </div>
          </div>

          {/* Mobile Navigation Menu: lista wierszy, nie kolumna pigulek. */}
          {isMobileMenuOpen && (
            <nav
              id={MOBILE_MENU_ID}
              aria-label="Mobile"
              className="mt-3 flex flex-col rounded-card border border-soft-line bg-soft-surface p-1.5 shadow-float animate-in fade-in-0 slide-in-from-top-2 duration-200 ease-out-strong md:hidden"
            >
              {navLinks.map((link) => {
                const active = isActiveLink(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center justify-between rounded-lg px-3 py-3 font-soft-display text-[15px] font-semibold outline-none transition-colors [transition-duration:var(--dur-press)] focus-visible:ring-2 focus-visible:ring-soft-primary ${
                      active ? 'bg-soft-sunken text-soft-ink' : 'text-soft-ink-muted hover:bg-soft-sunken hover:text-soft-ink'
                    }`}
                  >
                    {link.label}
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-soft-ink" aria-hidden="true" />}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      </header>
    </div>
  );
}
