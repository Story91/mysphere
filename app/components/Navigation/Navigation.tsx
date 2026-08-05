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

const LINK_THEME: Record<string, { suffix: string; border: string; hoverBorder: string }> = {
  MySphere: { suffix: 'text-fuchsia-600', border: 'border-fuchsia-200', hoverBorder: 'hover:border-fuchsia-300' },
  'Re-Definition': { suffix: 'text-[#5B8CFF]', border: 'border-blue-200', hoverBorder: 'hover:border-blue-300' },
  // Zielen zarezerwowana w tej aplikacji dla rozliczonych pieniedzy - ten sam
  // kolor niesie kwota na paragonie i w rankingu.
  Paid: { suffix: 'text-emerald-600', border: 'border-emerald-200', hoverBorder: 'hover:border-emerald-300' },
  MyBase: { suffix: 'text-[#0052FF]', border: 'border-blue-200', hoverBorder: 'hover:border-blue-300' },
  MyCamp: { suffix: 'text-orange-600', border: 'border-orange-200', hoverBorder: 'hover:border-orange-300' },
  MyAgents: { suffix: 'text-cyan-600', border: 'border-cyan-200', hoverBorder: 'hover:border-cyan-300' },
  MyClaw: { suffix: 'text-red-500', border: 'border-red-200', hoverBorder: 'hover:border-red-300' },
};

/** "My" zostaje neutralne, sufiks bierze kolor swojej trasy. */
function NavLinkLabel({ label }: { label: string }) {
  if (!label.startsWith('My')) return <span>{label}</span>;
  const suffix = label.slice(2);
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-slate-900">My</span>
      <span className={LINK_THEME[label]?.suffix ?? 'text-sky-300'}>{suffix}</span>
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
    active: 'shadow-[0_10px_22px_rgba(0,0,0,0.24)] -translate-y-0.5',
    idle: 'opacity-95 hover:opacity-100 hover:-translate-y-0.5',
  },
  mobile: {
    layout: 'flex gap-2',
    active: 'shadow-[0_8px_20px_rgba(2,6,23,0.30)]',
    idle: 'opacity-95',
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
  const theme = LINK_THEME[link.label] ?? LINK_THEME.MyBase;
  const style = NAV_ITEM_VARIANT[variant];

  return (
    <Link
      href={link.href}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`${style.layout} items-center px-4 py-2.5 rounded-xl text-sm font-semibold border bg-white transition-all duration-200 ${theme.border} ${theme.hoverBorder} ${
        isActive ? style.active : style.idle
      }`}
    >
      {/* Ikony sa dekoracja przy tekstowej etykiecie obok - czytnik ekranu ma
          przeczytac "MyCamp", a nie "Camp MyCamp". */}
      {link.label === 'MyCamp' && (
        <Image src="/Camp.png" alt="" width={14} height={14} className="rounded-sm flex-shrink-0 brightness-110" />
      )}
      {link.label === 'MyClaw' && (
        <span className="text-sm flex-shrink-0" aria-hidden="true">🦞</span>
      )}
      <NavLinkLabel label={link.label} />
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
    { href: '/base', label: 'MyBase' },
    { href: '/mycamp', label: 'MyCamp' },
    { href: '/MyAgents', label: 'MyAgents' },
    { href: '/MyClaw', label: 'MyClaw' },
    { href: '/leaderboard', label: 'Paid' },
    { href: '/re-definition', label: 'Re-Definition' },
  ];

  const navLinks: NavLink[] = allNavLinks.filter(
    (link) => link.href === '#' || !isRouteDisabled(link.href)
  );

  const isActiveLink = (href: string) => pathname === href || !!pathname?.startsWith(href + '/');

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0052FF] bg-opacity-10 backdrop-blur-xl border-b border-[#0052FF]/20">
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent)] bg-[length:30px_30px] opacity-60"></div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/40"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link 
              href="/"
              className="hover:scale-105 transition-transform duration-300 relative group mr-5"
            >
              <div aria-hidden="true" className="absolute -inset-2 bg-gradient-to-r from-[#0052FF] to-[#00A3FF] opacity-0 group-hover:opacity-20 rounded-xl blur transition-all duration-300"></div>
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
            <nav aria-label="Main" className="hidden md:flex items-center gap-2 bg-white/20 border border-white/20 p-1.5 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.22)]">
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
              className="md:hidden p-2 rounded-lg text-gray-100 hover:bg-[#0052FF]/20"
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
            className="md:hidden mt-3 bg-white/20 border border-white/20 p-1.5 rounded-2xl flex flex-col gap-1 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
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
  );
}
