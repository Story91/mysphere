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
import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import { NetworkSwitcher } from '../NetworkSwitcher';
import { NotificationsBell } from './NotificationsBell';

type NavLink = {
  href: string;
  label: string;
  isHighlighted?: boolean;
  isDisabled?: boolean;
};

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleNotificationsClick = () => {
    router.push('/basechat?view=notifications');
  };

  // Override OnchainKit modal "Sign up" text to "Sign In With Base"
  useEffect(() => {
    const replaceSignUpText = () => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      const nodesToUpdate = [];
      
      while (node = walker.nextNode()) {
        if (node.textContent && node.textContent.trim() === 'Sign up') {
          nodesToUpdate.push(node);
        }
      }

      nodesToUpdate.forEach(node => {
        node.textContent = 'Sign In With Base';
      });

      const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, button, span, div');
      elements.forEach(element => {
        if (element.textContent && element.textContent.trim() === 'Sign up') {
          element.textContent = 'Sign In With Base';
        }
      });
    };

    replaceSignUpText();

    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (
                element.querySelector('[data-testid*="connect"]') ||
                element.querySelector('[role="dialog"]') ||
                element.textContent?.includes('Sign up')
              ) {
                shouldCheck = true;
              }
            }
          });
        }
      });
      
      if (shouldCheck) {
        setTimeout(replaceSignUpText, 100);
        setTimeout(replaceSignUpText, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, []);

  const navLinks: NavLink[] = [
    { href: '/basechat', label: 'Base' },
    { href: '/mycamp', label: 'Camp Network', isHighlighted: true },
    { href: '#', label: 'Re-Definition', isDisabled: true },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0052FF] bg-opacity-10 backdrop-blur-xl border-b border-[#0052FF]/20">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent)] bg-[length:30px_30px] opacity-60"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 to-black/40"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link 
              href="/"
              className="hover:scale-105 transition-transform duration-300 relative group mr-6"
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
            <nav className="hidden md:flex items-center space-x-2 bg-black/20 p-1.5 rounded-2xl backdrop-blur-xl border border-[#0052FF]/20 relative">
              {navLinks.map((link) => (
                link.isDisabled ? (
                  <span
                    key={link.href}
                    className="relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 text-gray-400 cursor-not-allowed flex items-center"
                    title="Soon"
                  >
                    {link.label}
                    <span className="ml-2 text-xs text-gray-500">soon</span>
                  </span>
                ) : (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 ${
                      pathname === link.href
                        ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                        : link.isHighlighted 
                          ? 'text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20' 
                          : 'text-gray-100 hover:text-[#0052FF]'
                    }`}
                  >
                    <span className={`relative z-10 ${link.isHighlighted && 'font-bold'} flex items-center`}>
                      {link.label === 'Camp Network' && (
                        <Image src="/Camp.png" alt="Camp" width={16} height={16} className="inline mr-1.5" />
                      )}
                      {link.label}
                    </span>
                    <div className={`absolute inset-0 rounded-xl ${
                      link.isHighlighted 
                        ? 'bg-gradient-to-r from-orange-500/80 to-orange-600/80 group-hover:from-orange-400 group-hover:to-orange-500' 
                        : 'bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5'
                      } transition-all duration-300`}></div>
                    {pathname === link.href && !link.isHighlighted && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                    )}
                    {link.isHighlighted && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 opacity-80 animate-pulse"></div>
                    )}
                  </Link>
                )
              ))}
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
              <ConnectWallet className="bg-[#0052FF] hover:bg-[#0052FF]/90 rounded-xl p-2">
                <Avatar className="h-6 w-6" />
                <Name className="text-white inline" />
              </ConnectWallet>
              <WalletDropdown className="!fixed md:!absolute !top-[70px] md:!top-full !right-4 !w-[calc(100%-32px)] md:!w-auto !max-w-[400px] !z-[9999] !bg-white wallet-dropdown">
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
          <nav className="md:hidden mt-4 bg-black/20 p-2 rounded-2xl backdrop-blur-xl border border-[#0052FF]/20">
            {navLinks.map((link) => (
              link.isDisabled ? (
                <span
                  key={link.href}
                  className="block px-4 py-2 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 mb-1 last:mb-0 text-gray-500 cursor-not-allowed flex items-center justify-between"
                  title="Soon"
                >
                  <span>{link.label}</span>
                  <span className="text-xs text-gray-400">soon</span>
                </span>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-4 py-2 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 mb-1 last:mb-0 ${
                    pathname === link.href
                      ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                      : link.isHighlighted 
                        ? 'text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20' 
                        : 'text-gray-100 hover:text-[#0052FF] hover:bg-[#0052FF]/5'
                  }`}
                >
                  <span className={`flex items-center relative z-10 ${link.isHighlighted && 'font-bold'}`}>
                    {link.label === 'Camp Network' && (
                      <Image src="/Camp.png" alt="Camp" width={16} height={16} className="inline mr-1.5" />
                    )}
                    {link.label}
                  </span>
                </Link>
              )
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
