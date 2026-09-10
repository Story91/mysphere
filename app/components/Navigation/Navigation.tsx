'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import WalletButton from '../wallet/WalletButton';
import { useState } from 'react';
// @ts-ignore - config CommonJS wspoldzielony z next.config.js
import { isRouteDisabled } from '@/config/routeStatus';
import { NetworkSwitcher } from '../NetworkSwitcher';
import { NotificationsBell } from './NotificationsBell';

/* ---------------------------------------------------------------------------
   Naglowek aplikacji: logo, trasy, przelacznik sieci, dzwonek i portfel.

   Sam dropdown portfela mieszka w ../wallet/WalletButton - tutaj nie ma juz
   po nim niczego poza jednym wywolaniem komponentu.
--------------------------------------------------------------------------- */
type NavLink = {
  href: string;
  label: string;
};

/**
 * Kolor sufiksu per trasa. Obramowania per trasa zniknely wraz z ciemnym
 * szklem: w Soft Social pigulka nawigacji ma jedna, wspolna linie, a kolorem
 * rozni ja wylacznie nazwa. Siedem roznych ramek na jasnym tle czytalo sie
 * jak siedem osobnych komponentow.
 *
 * Odcienie sa POGLEBIONE wzgledem poprzednich (600 -> 700 itd.), bo pigulka
 * jest teraz biala na cala szerokosc etykiety. Poprzednie cyan-600 i #5B8CFF
 * na bieli nie mialy nawet 3:1.
 */
const LINK_THEME: Record<string, { suffix: string }> = {
  MySphere: { suffix: 'text-fuchsia-700' },
  // Firmowy niebieski Base zostaje niezmieniony - to znak sieci, nie ozdobnik.
  MyBase: { suffix: 'text-[#0052FF]' },
  MyCamp: { suffix: 'text-soft-accent-deep' },
  MyAgents: { suffix: 'text-cyan-700' },
  MyClaw: { suffix: 'text-red-600' },
  Startpad: { suffix: 'text-soft-primary-deep' },
};

/**
 * "My" zostaje neutralne, sufiks bierze kolor swojej trasy.
 *
 * Na pigulce aktywnej caly napis jest bialy: fiolet marki pod spodem zjada
 * kazdy z kolorow tras, a emerald czy cyan na fiolecie to juz nie jest zaden
 * kontrast.
 */
function NavLinkLabel({ label, isActive }: { label: string; isActive: boolean }) {
  if (!label.startsWith('My')) return <span>{label}</span>;
  const suffix = label.slice(2);
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={isActive ? 'text-white' : 'text-soft-ink'}>My</span>
      <span className={isActive ? 'text-white' : LINK_THEME[label]?.suffix ?? 'text-soft-ink-muted'}>
        {suffix}
      </span>
    </span>
  );
}

const MOBILE_MENU_ID = 'mobile-nav-menu';

/**
 * Jedyna roznica miedzy wierszem desktopowym a mobilnym: kierunek flexa,
 * odstep i cien stanu aktywnego. Cala reszta (motyw trasy, ikony, etykieta)
 * byla dotad skopiowana w dwoch miejscach i rozjezdzala sie przy kazdej zmianie.
 */
const NAV_ITEM_VARIANT = {
  desktop: {
    layout: 'inline-flex gap-1.5',
    active: 'shadow-chip',
    idle: 'hover:bg-soft-sunken',
  },
  mobile: {
    layout: 'flex gap-2',
    active: 'shadow-chip',
    idle: 'hover:bg-soft-sunken',
  },
} as const;

function NavItem({
  link,
  isActive,
  variant,
  onClick,
}: {
  link: NavLink;
  isActive: boolean;
  variant: keyof typeof NAV_ITEM_VARIANT;
  onClick?: () => void;
}) {
  const style = NAV_ITEM_VARIANT[variant];

  /**
   * Startpad OGLADANY Z INNEJ STRONY dostaje delikatna obwodke w kolorze marki.
   *
   * To jest jedyne miejsce w belce, ktore prowadzi do rynku - reszta zakladek
   * to czytanie. Bez wyroznienia ginelo miedzy nimi, mimo ze jest tam
   * najwiecej powodow, zeby wejsc.
   *
   * ZADNEGO MIGANIA: pigulka pulsujaca w kolko przy kazdym ekranie zamienia
   * sie po minucie w szum, ktory mozg uczy sie omijac - a przy `prefers-
   * reduced-motion` po prostu nie wolno jej ruszac. Wystarczy, ze wyglada
   * inaczej niz sasiedzi.
   */
  const highlight = !isActive && link.label === 'Startpad';

  return (
    <Link
      href={link.href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      /* RUCH: zostaje samo nacisniecie. Nawigacja jest klikana dziesiatki razy
         dziennie - podnoszenie pigulki na hover po dziesiatym razie juz nie
         cieszy, tylko opoznia. */
      className={`${style.layout} items-center px-4 py-2.5 rounded-pill font-soft-display text-sm font-bold border transition-[background-color,border-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface ${
        isActive
          ? `bg-soft-primary border-soft-primary text-soft-on-primary ${style.active}`
          : highlight
            ? `bg-soft-primary/10 border-soft-primary text-soft-primary-deep shadow-[0_0_0_3px_rgba(124,107,218,0.12)] ${style.idle}`
            : `bg-soft-surface border-soft-line text-soft-ink-muted ${style.idle}`
      }`}
    >
      {/* Ikony sa dekoracja przy tekstowej etykiecie obok - czytnik ekranu ma
          przeczytac "MyCamp", a nie "Camp MyCamp". */}
      {link.label === 'MyCamp' && (
        /* brightness-110 bylo podbiciem pod ciemne szklo. Na bialej pigulce
           rozjasnia logo Camp bez powodu. */
        <Image src="/Camp.png" alt="" width={14} height={14} className="rounded-sm flex-shrink-0" />
      )}
      {link.label === 'MyClaw' && (
        <span className="text-sm flex-shrink-0" aria-hidden="true">🦞</span>
      )}
      <NavLinkLabel label={link.label} isActive={isActive} />
    </Link>
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
    // Perps zaraz za $SPHERE, bo to ten sam ruch co Startpad, tylko o stopien
    // dalej: tam tworca wystawia token na krzywej, tu wystawia FEED i rynek
    // lewarowany na Arc. Bez tego wpisu /derivatives bylo dokladnie tym, przed
    // czym ostrzega komentarz przy /startpad - trasa dostepna wylacznie
    // z palca, czyli dla uzytkownika nieistniejaca.
    { href: '/derivatives', label: 'Perps' },
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
    // /startpad nie moze zapalac dwoch pigulek naraz na /startpad/sphere/*.
    if (href === '/startpad' && pathname.startsWith('/startpad/sphere')) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="sticky top-0 z-50">
    {/* Belka jest zwykla biala powierzchnia z jedna linia na dole. Byla tu
        wersja chowana za gorna krawedzia z 12-px paskiem wysuwanym na hover -
        wycofana na zadanie: pasek nie zapowiadal, ze cokolwiek sie wysunie,
        wiec nawigacja wygladala na zepsuta. Belka stoi na stale. */}
    <header className="w-full bg-soft-surface border-b border-soft-line">
      {/* Obie nakladki zostaja - to ta sama siatka i to samo przyciemnienie,
          przemalowane na lawende. Siatka schodzi do ledwie widocznego sladu
          faktury, a czarny gradient staje sie miekkim zejsciem bieli w kolor
          tla strony tuz nad linia. */}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(124,107,218,0.05)_25%,rgba(124,107,218,0.05)_26%,transparent_27%,transparent_74%,rgba(124,107,218,0.05)_75%,rgba(124,107,218,0.05)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(124,107,218,0.05)_25%,rgba(124,107,218,0.05)_26%,transparent_27%,transparent_74%,rgba(124,107,218,0.05)_75%,rgba(124,107,218,0.05)_76%,transparent_77%,transparent)] bg-[length:30px_30px] opacity-60"></div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent to-soft-bg/70"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link
              href="/"
              className="relative group mr-5 rounded-xl transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
            >
              {/* Poswiata pod logo zostaje, tylko w fiolecie marki zamiast
                  niebieskiego gradientu Base. 300 ms na hover bylo dwa razy
                  dluzsze niz cokolwiek innego w belce. */}
              <div aria-hidden="true" className="absolute -inset-2 bg-soft-primary opacity-0 group-hover:opacity-20 rounded-xl blur transition-opacity [transition-duration:var(--dur-press)] ease-out-strong"></div>
              <Image
                src="/android-chrome-192x192.png"
                alt="MySphere"
                width={32}
                height={32}
                className="rounded-xl relative"
                priority
              />
            </Link>
            
            {/* Desktop Navigation */}
            <nav aria-label="Main" className="hidden md:flex items-center gap-2 bg-soft-sunken border border-soft-line p-1.5 rounded-pill">
              {navLinks.map((link) => (
                <NavItem key={link.href} link={link} isActive={isActiveLink(link.href)} variant="desktop" />
              ))}
            </nav>

            {/* Mobile Menu Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              aria-expanded={isMobileMenuOpen}
              aria-controls={MOBILE_MENU_ID}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="md:hidden p-2 rounded-pill text-soft-ink-muted hover:bg-soft-sunken hover:text-soft-ink transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
            >
              <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <nav
            id={MOBILE_MENU_ID}
            aria-label="Mobile"
            /* Panel jest lawendowy, nie bialy: pigulki w srodku sa biale i na
               bialym tle rozniloby je od panelu wylacznie obramowanie. */
            className="md:hidden mt-3 bg-soft-sunken border border-soft-line p-1.5 rounded-card flex flex-col gap-1 shadow-float animate-in fade-in-0 slide-in-from-top-2 duration-200 ease-out-strong"
          >
            {navLinks.map((link) => (
              <NavItem
                key={link.href}
                link={link}
                isActive={isActiveLink(link.href)}
                variant="mobile"
                onClick={() => setIsMobileMenuOpen(false)}
              />
            ))}
          </nav>
        )}
      </div>
    </header>
    </div>
  );
}
