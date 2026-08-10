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
  'Re-Definition': { suffix: 'text-soft-info' },
  // Zielen zarezerwowana w tej aplikacji dla rozliczonych pieniedzy - ten sam
  // kolor niesie kwota na paragonie i w rankingu.
  Paid: { suffix: 'text-emerald-700' },
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
          ? `bg-soft-primary border-soft-primary text-white ${style.active}`
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
    { href: '/asks', label: 'Asks' },
    // Money stoi TUZ ZA Askami, bo to ich druga polowa: Ask jest miejscem, w
    // ktorym pieniadze sie zaczynaja, a /money jedynym, w ktorym widac, gdzie
    // skonczyly. Do niedawna saldo do odebrania z kontraktu escrow pokazywalo
    // sie WYLACZNIE na /asks - czyli czlowiek, ktoremu przyznano wyplate,
    // dowiadywal sie o niej tylko wtedy, gdy sam wrocil na tamta liste.
    //
    // NAZWA: "Money", nie "Wallet" i nie "Portfolio". Portfel jest w prawym
    // rogu tej samej belki i pokazuje salda tokenow; ta strona nie zna zadnych
    // sald ani kursow i nie ma udawac, ze zna. "Portfolio" obiecywaloby wycene.
    { href: '/money', label: 'Money' },
    { href: '/base', label: 'MyBase' },
    { href: '/mycamp', label: 'MyCamp' },
    { href: '/MyAgents', label: 'MyAgents' },
    { href: '/MyClaw', label: 'MyClaw' },
    { href: '/leaderboard', label: 'Paid' },
    // "Curators" TUZ ZA "Paid", bo obie strony sa tym samym rodzajem rzeczy:
    // publicznym zapisem faktow z data, ktorego nie da sie przepisac. Paid
    // zapisuje pieniadze, ktore przeszly miedzy ludzmi; Curators zapisuje
    // zmiany parametrow skarbcow Morpho (prowizja, kurator, notowanie).
    //
    // DLACZEGO W OGOLE W BELCE: to samo zgloszenie co przy /asks - "nie widac
    // nic co wdrozylismy, skad oni maja wiedziec co robic". Strona, do ktorej
    // prowadzi wylacznie wpisanie adresu recznie, z punktu widzenia
    // uzytkownika nie istnieje.
    //
    // Do dolnego paska na telefonie (MobileBottomNav) tego NIE dopisujemy.
    // Tamten pasek trzyma cztery rzeczy, ktore sie ROBI (feed, Aski, pieniadze,
    // profil); to jest strona, ktora sie CZYTA, i pchanie jej miedzy przyciski
    // akcji zabraloby miejsce czemus, po co ludzie tam siegaja.
    { href: '/curators', label: 'Curators' },
    // "B20" obok "Curators", bo obie strony dotycza tego samego: rzeczy, ktore
    // istnieja NA BASE i o ktorych da sie powiedziec cos sprawdzalnego.
    //
    // Trafia tu z tego samego powodu, dla ktorego trafily tam /asks i /curators:
    // strona, do ktorej prowadzi wylacznie wpisanie adresu z palca, z punktu
    // widzenia uzytkownika nie istnieje. Sama zbudowana i niepodlinkowana byla
    // dokladnie tym bledem, ktory na tej liscie naprawialismy juz dwa razy.
    { href: '/launchpad', label: 'Startpad' },
    { href: '/b20', label: 'B20' },
    // "How" TUZ PRZED manifestem, bo odpowiadaja na dwa rozne pytania i to
    // pierwsze jest pilniejsze. /re-definition mowi, DLACZEGO ten produkt
    // istnieje - i ma prawo opisywac rzeczy, ktorych jeszcze nie ma. /how mowi,
    // CO DA SIE ZROBIC TERAZ, i nie ma tam ani jednego zdania w czasie
    // przyszlym.
    //
    // Zgloszenie, ktore to wywolalo, brzmialo wprost: "zrob tutorial dla
    // uzytkownikow co mozna robic w tej aplikacji". Wczesniej jedyna droga do
    // dowiedzenia sie, ze da sie sprzedac czesc posta albo zalozyc Aska
    // z budzetem, bylo natkniecie sie na przycisk.
    { href: '/how', label: 'How' },
    { href: '/re-definition', label: 'Re-Definition' },
  ];

  const navLinks: NavLink[] = allNavLinks.filter(
    (link) => link.href === '#' || !isRouteDisabled(link.href)
  );

  const isActiveLink = (href: string) => pathname === href || !!pathname?.startsWith(href + '/');

  return (
    <div className="group/top-nav sticky top-0 z-50 md:h-3">
    {/* Belka jest zwykla biala powierzchnia z jedna linia na dole. Wczesniej
        byla ciemnym szklem (#0052FF/10 + backdrop-blur-xl + dwie czarne
        nakladki) - jedynym ciemnym elementem nad lawendowym feedem. */}
    <header className="w-full bg-soft-surface border-b border-soft-line md:absolute md:left-0 md:top-0 md:[@media(hover:hover)]:-translate-y-[calc(100%-12px)] md:transition-transform md:[transition-duration:var(--dur-dropdown)] md:ease-out-strong md:group-hover/top-nav:translate-y-0 md:group-focus-within/top-nav:translate-y-0">
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
