// @ts-nocheck
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
  WalletDropdownBasename,
  WalletDropdownFundLink,
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from '@coinbase/onchainkit/identity';
import { useState } from 'react';
import { NetworkSwitcher } from '../NetworkSwitcher';
import { NotificationsBell } from './NotificationsBell';

type NavLink = {
  href: string;
  label: string;
  isDisabled?: boolean;
};

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNotificationsClick = () => {
    router.push('/basechat?view=notifications');
  };

  const navLinks: NavLink[] = [
    { href: '/', label: 'MySphere' },
    { href: '/base', label: 'MyBase' },
    { href: '/mycamp', label: 'MyCamp' },
    { href: '/MyAgents', label: 'MyAgents' },
    { href: '/MyClaw', label: 'MyClaw' },
    { href: '#', label: 'Re-Definition', isDisabled: true },
  ];

  const linkTheme: Record<string, { suffix: string; border: string; hoverBorder: string }> = {
    MySphere: { suffix: 'text-fuchsia-600', border: 'border-fuchsia-200', hoverBorder: 'hover:border-fuchsia-300' },
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
            <Wallet>
              <ConnectWallet
                className="bg-[#0052FF] hover:bg-[#0052FF]/90 rounded-xl p-2"
                disconnectedLabel="Sign In With Base"
              >
                <Avatar className="h-6 w-6" />
                <Name className="text-white inline" />
              </ConnectWallet>
              {/* Bez nadpisywania pozycjonowania. OnchainKit renderuje ten dropdown
                  w FloatingPortal (na document.body) i ustawia position/top/left
                  INLINE przez Floating UI, kotwiczac go do przycisku ConnectWallet
                  (z flip + shift, wiec sam sie miesci w viewporcie). Klasy typu
                  `!fixed md:!absolute md:!top-full` biły te inline'owe style
                  !importantem - `top:100%` liczone wzgledem body wyrzucalo
                  dropdown na dol strony na desktopie. Zostaja tylko klasy
                  wygladu i szerokosci. */}
              <WalletDropdown className="!w-[calc(100%-32px)] md:!w-auto !max-w-[400px] !z-[9999] !bg-white wallet-dropdown">
                  <Identity hasCopyAddressOnClick className="!bg-white hover:!bg-gray-100 !text-gray-900 wallet-dropdown-link">
                    <Avatar />
                    <Name className="!text-gray-900" />
                    <Address className="!text-gray-900" />
                    <EthBalance className="!text-gray-900" />
                  </Identity>
                  <WalletDropdownBasename className="!bg-white hover:!bg-gray-100 !text-gray-900 wallet-dropdown-link" />
                  <Link 
                    href="https://keys.coinbase.com"
                    target="_blank"
                    className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 wallet-dropdown-link"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 16V8M12 8L9 11M12 8L15 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Wallet
                  </Link>
                  <Link 
                    href="https://basescan.org"
                    target="_blank"
                    className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 wallet-dropdown-link"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 21L15.8033 15.8033M15.8033 15.8033C17.1605 14.4461 18 12.5711 18 10.5C18 6.35786 14.6421 3 10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18C12.5711 18 14.4461 17.1605 15.8033 15.8033Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Base Scan
                  </Link>
                  <Link 
                    href="https://bridge.base.org"
                    target="_blank"
                    className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 text-gray-900 wallet-dropdown-link"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M7 10V14M17 10V14M3 12H7M17 12H21M8 17H16C16.5523 17 17 16.5523 17 16V8C17 7.44772 16.5523 7 16 7H8C7.44772 7 7 7.44772 7 8V16C7 16.5523 7.44772 17 8 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Base Bridge
                  </Link>
                  <WalletDropdownFundLink className="!bg-white hover:!bg-gray-100 !text-gray-900 wallet-dropdown-fund" />
                  <WalletDropdownDisconnect className="!bg-white hover:!bg-gray-100 !text-gray-900 wallet-dropdown-disconnect" />
              </WalletDropdown>
            </Wallet>
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
