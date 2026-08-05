// @ts-nocheck
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import WalletButton from '../wallet/WalletButton';
import { useState } from 'react';
// @ts-ignore - config CommonJS wspoldzielony z next.config.js
import { isRouteDisabled } from '@/config/routeStatus';
import { useFundingUrl } from './useFundingUrl';
import { NetworkSwitcher } from '../NetworkSwitcher';
import { NotificationsBell } from './NotificationsBell';

/* ---------------------------------------------------------------------------
   Tokeny dropdownu portfela.

   Powierzchnia jest CIEMNA, nie biala. Dropdown wisi pod przeszklonym, ciemnym
   headerem, a kazda inna plywajaca powierzchnia w aplikacji (karta Sphere
   Identity) tez jest ciemnogranatowa - wymuszony wczesniej `!bg-white` byl tu
   anomalia i dlatego calosc wygladala jak niestylowany default.

   Jeden rytm wiersza wymuszony rowniez na komponentach OnchainKit: mialy wlasne
   px-4 py-3, podczas gdy nasze <Link> mialy px-4 py-2, wiec ikony i etykiety
   nie trzymaly linii.
--------------------------------------------------------------------------- */
type NavLink = {
  href: string;
  label: string;
  isDisabled?: boolean;
};

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const fundingUrl = useFundingUrl();

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
    { href: '/re-definition', label: 'Re-Definition' },
  ];

  const navLinks: NavLink[] = allNavLinks.filter(
    (link) => link.href === '#' || !isRouteDisabled(link.href)
  );

  const linkTheme: Record<string, { suffix: string; border: string; hoverBorder: string }> = {
    MySphere: { suffix: 'text-fuchsia-600', border: 'border-fuchsia-200', hoverBorder: 'hover:border-fuchsia-300' },
    'Re-Definition': { suffix: 'text-[#5B8CFF]', border: 'border-blue-200', hoverBorder: 'hover:border-blue-300' },
    MyBase: { suffix: 'text-[#0052FF]', border: 'border-blue-200', hoverBorder: 'hover:border-blue-300' },
    MyCamp: { suffix: 'text-orange-600', border: 'border-orange-200', hoverBorder: 'hover:border-orange-300' },
    MyAgents: { suffix: 'text-cyan-600', border: 'border-cyan-200', hoverBorder: 'hover:border-cyan-300' },
    MyClaw: { suffix: 'text-red-500', border: 'border-red-200', hoverBorder: 'hover:border-red-300' },
  };

  const renderLinkLabel = (label: string) => {
    if (!label.startsWith('My')) return <span>{label}</span>;
    const suffix = label.slice(2);
    return (
      <span className="inline-flex items-center gap-0.5">
        <span className="text-slate-900">My</span>
        <span className={linkTheme[label]?.suffix ?? 'text-sky-300'}>{suffix}</span>
      </span>
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0052FF] bg-opacity-10 backdrop-blur-xl border-b border-[#0052FF]/20">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent)] bg-[length:30px_30px] opacity-60"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/40"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link 
              href="/"
              className="hover:scale-105 transition-transform duration-300 relative group mr-5"
            >
              <div className="absolute -inset-2 bg-gradient-to-r from-[#0052FF] to-[#00A3FF] opacity-0 group-hover:opacity-20 rounded-xl blur transition-all duration-300"></div>
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
            <nav className="hidden md:flex items-center gap-2 bg-white/20 border border-white/20 p-1.5 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.22)]">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || pathname?.startsWith(link.href + '/');
                if (link.isDisabled) {
                  return (
                    <span
                      key={link.href}
                      title="Coming soon"
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white/50 bg-white/10 border border-white/20 cursor-not-allowed select-none"
                    >
                      {link.label}
                      <span className="text-[10px] font-normal bg-white/20 text-white/70 px-1.5 py-0.5 rounded-full">soon</span>
                    </span>
                  );
                }
                const theme = linkTheme[link.label] ?? linkTheme.MyBase;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border bg-white transition-all duration-200 ${theme.border} ${theme.hoverBorder} ${
                      isActive
                        ? 'shadow-[0_10px_22px_rgba(0,0,0,0.24)] -translate-y-0.5'
                        : 'opacity-95 hover:opacity-100 hover:-translate-y-0.5'
                    }`}
                  >
                    {link.label === 'MyCamp' && (
                      <Image src="/Camp.png" alt="Camp" width={14} height={14} className="rounded-sm flex-shrink-0 brightness-110" />
                    )}
                    {link.label === 'MyClaw' && (
                      <span className="text-sm flex-shrink-0">🦞</span>
                    )}
                    {renderLinkLabel(link.label)}
                  </Link>
                );
              })}
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-100 hover:bg-[#0052FF]/20"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <nav className="md:hidden mt-3 bg-white/20 border border-white/20 p-1.5 rounded-2xl flex flex-col gap-1 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || pathname?.startsWith(link.href + '/');
              if (link.isDisabled) {
                return (
                  <span
                    key={link.href}
                    title="Coming soon"
                    className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium text-white/50 bg-white/10 border border-white/20 cursor-not-allowed"
                  >
                    <span>{link.label}</span>
                    <span className="text-[10px] bg-white/20 text-white/70 px-1.5 py-0.5 rounded-full">soon</span>
                  </span>
                );
              }
              const theme = linkTheme[link.label] ?? linkTheme.MyBase;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border bg-white transition-all duration-200 ${theme.border} ${theme.hoverBorder} ${
                    isActive
                      ? 'shadow-[0_8px_20px_rgba(2,6,23,0.30)]'
                      : 'opacity-95'
                  }`}
                >
                  {link.label === 'MyCamp' && (
                    <Image src="/Camp.png" alt="Camp" width={14} height={14} className="rounded-sm brightness-110" />
                  )}
                  {link.label === 'MyClaw' && (
                    <span className="text-sm flex-shrink-0">🦞</span>
                  )}
                  {renderLinkLabel(link.label)}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
