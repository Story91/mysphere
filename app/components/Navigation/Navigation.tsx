// @ts-nocheck
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownLink,
  WalletDropdownDisconnect,
  WalletDropdownBasename,
  WalletDropdownFundLink,
  ConnectWalletText,
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from '@coinbase/onchainkit/identity';
// Import Base Pay components - commented out because SignInWithBaseButton is now in MockFeed
// import { SignInWithBaseButton } from '@base-org/account-ui/react';
// import { createBaseAccountSDK } from '@base-org/account';
import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import { ReactNode } from 'react';
import { NetworkSwitcher } from '../NetworkSwitcher';
import { NotificationsBell } from './NotificationsBell';

// Stały adres administratora
const ADMIN_ADDRESS = "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd";
const ADMIN_BASENAME = "story91.base.eth";

// Definicja typów dla elementów nawigacji
type NavLink = {
  href: string;
  label: string;
  isHighlighted?: boolean;
  icon?: ReactNode;
  isExternal?: boolean;
  isDisabled?: boolean;
  dropdownItems?: Array<{
    href: string;
    label: string;
    isHighlighted?: boolean;
    isFlashBlock?: boolean;
    isExternal?: boolean;
    isDisabled?: boolean;
  }>;
};

// Specjalny typ dla elementów z dropdownItems
type NavLinkWithDropdown = {
  label: string;
  dropdownItems: Array<{
    href: string;
    label: string;
    isHighlighted?: boolean;
    isFlashBlock?: boolean;
    isExternal?: boolean;
    isDisabled?: boolean;
  }>;
  isHighlighted?: boolean;
  icon?: ReactNode;
};

export default function Navigation() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Handler for notifications bell click (Obsługa kliknięcia w dzwoneczek powiadomień)
  const handleNotificationsClick = () => {
    // Navigate to BaseChat with notifications view (Przejdź do BaseChat z widokiem powiadomień)
    router.push('/basechat?view=notifications');
  };
  
  useEffect(() => {
    if (address) {
      setIsAdmin(address.toLowerCase() === ADMIN_ADDRESS.toLowerCase());
    } else {
      setIsAdmin(false);
    }
  }, [address]);

  // Override OnchainKit modal "Sign up" text to "Sign In With Base"
  useEffect(() => {
    const replaceSignUpText = () => {
      // Find all text nodes containing "Sign up"
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
        console.log('🔄 Replacing "Sign up" with "Sign In With Base"');
        node.textContent = 'Sign In With Base';
      });

      // Also check elements that might contain "Sign up"
      const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, button, span, div');
      elements.forEach(element => {
        if (element.textContent && element.textContent.trim() === 'Sign up') {
          console.log('🔄 Replacing element "Sign up" with "Sign In With Base"');
          element.textContent = 'Sign In With Base';
        }
      });
    };

    // Run immediately
    replaceSignUpText();

    // Watch for DOM changes (when modal opens)
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any added node contains modal content
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
        // Delay to let modal render completely
        setTimeout(replaceSignUpText, 100);
        setTimeout(replaceSignUpText, 500); // Second check for slow renders
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, []);

  const navLinks: (NavLink | NavLinkWithDropdown)[] = [
    {
      label: 'Chains',
      dropdownItems: [
        { 
          href: '/mycamp', 
          label: 'Camp Network',
          isHighlighted: true 
        },
        { href: '/base', label: 'Base', isHighlighted: true },
        { href: '#', label: 'Linea', isDisabled: true },
        { href: '#', label: 'Celo', isDisabled: true },
        { href: '#', label: 'Ethereum', isDisabled: true },
        { href: '#', label: 'World Chain', isDisabled: true },
      ]
    },
    {
      label: 'NFT',
      dropdownItems: [
        { href: '/nft', label: 'SphereGenesis' },
        { href: '/quotes', label: 'Quotes on Base' },
      ]
    },
    { href: '#', label: 'Re-Definition', isDisabled: true },
    {
      label: 'Features',
      dropdownItems: [
        { href: '#', label: 'Spheres', isDisabled: true },
        { href: '#', label: 'Spherian', isDisabled: true },
        { href: '#', label: 'Mini-Apps', isDisabled: true },
        { href: '#', label: 'Builders Hub', isDisabled: true },
      ]
    },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0052FF] bg-opacity-10 backdrop-blur-xl border-b border-[#0052FF]/20">
      {/* Cyber grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent)] bg-[length:30px_30px] opacity-60"></div>
      
      {/* Gradient effect */}
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
                link.dropdownItems ? (
                  <div key={link.label} className="relative">
                    <button
                      onClick={() => setActiveDropdown(activeDropdown === link.label ? null : link.label)}
                      className={`relative px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 text-gray-100 hover:text-[#0052FF] ${
                        activeDropdown === link.label ? 'bg-white text-gray-900' : ''
                      }`}
                    >
                      <span className="relative z-10 flex items-center">
                        {link.icon && link.icon}
                        {link.label}
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </button>
                    {activeDropdown === link.label && (
                      <div className="absolute left-1/2 transform -translate-x-1/2 w-max mt-2 bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_8px_16px_rgba(0,0,0,0.1)] border border-[#0052FF]/10 overflow-hidden">
                        {link.dropdownItems.map((item) =>
                          item.isDisabled ? (
                            <span
                              key={item.href}
                              className="flex items-center gap-2 px-4 py-2.5 text-gray-400 cursor-not-allowed whitespace-nowrap"
                              title="Soon"
                            >
                              <svg
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M8 7H4M4 7V11M4 7L9 12M16 17H20M20 17V13M20 17L15 12"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span className="font-['Coinbase_Display']">
                                {item.label}
                              </span>
                              <span className="ml-1 text-xs text-gray-400">soon</span>
                            </span>
                          ) : (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setActiveDropdown(null)}
                              className="flex items-center gap-2 px-4 py-2.5 text-gray-900 hover:bg-[#0052FF]/5 transition-colors duration-200 whitespace-nowrap"
                              target={item.isExternal ? '_blank' : undefined}
                              rel={
                                item.isExternal
                                  ? 'noopener noreferrer'
                                  : undefined
                              }
                            >
                              {item.label === 'Camp Network' ? (
                                <Image src="/Camp.png" alt="Camp" width={16} height={16} className="inline" />
                              ) : item.label === 'Buy&Swap' ? (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M3 7L9 13M9 7L3 13M21 11L15 17M15 11L21 17"
                                    stroke="#0052FF"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="w-4 h-4"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M8 7H4M4 7V11M4 7L9 12M16 17H20M20 17V13M20 17L15 12"
                                    stroke="#0052FF"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                              <span className={`font-['Coinbase_Display'] ${item.isHighlighted ? 'font-semibold text-orange-600' : ''}`}>
                                {item.label}
                              </span>
                            </Link>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                ) : (
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
                          : link.isFlashBlock 
                            ? 'text-white bg-blue-700 shadow-lg shadow-blue-700/30' 
                            : link.isHighlighted 
                              ? 'text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20' 
                              : 'text-gray-100 hover:text-[#0052FF]'
                      }`}
                    >
                    {link.isFlashBlock && (
                      <div className="absolute inset-0 rounded-xl overflow-hidden">
                        <div className="absolute -inset-[1px] rounded-xl border border-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-[length:200%_200%] animate-gradient-rotate opacity-70"></div>
                      </div>
                    )}
                    <span className={`relative z-10 ${(link.isHighlighted || link.isFlashBlock) && 'font-bold'} flex items-center`}>
                      {link.icon && link.icon}
                      {link.label}
                    </span>
                    {!link.isFlashBlock && (
                      <div className={`absolute inset-0 rounded-xl ${
                        link.isHighlighted 
                          ? 'bg-gradient-to-r from-orange-500/80 to-orange-600/80 group-hover:from-orange-400 group-hover:to-orange-500' 
                          : 'bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5'
                        } transition-all duration-300`}></div>
                    )}
                    {pathname === link.href && !link.isHighlighted && !link.isFlashBlock && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                    )}
                    {link.isHighlighted && !link.isFlashBlock && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 opacity-80 animate-pulse"></div>
                    )}
                  </Link>
                  )
                )
              ))}
            </nav>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-100 hover:bg-[#0052FF]/20"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {isMobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <NetworkSwitcher />
            <NotificationsBell onNotificationsClick={handleNotificationsClick} />
            {/* Sign in with Base Button - ukryty, bo jest w MockFeed 
            <SignInWithBaseButton 
              colorScheme="light"
              onClick={handleSignInWithBase}
            />
            */}
            <Wallet>
              <ConnectWallet className="bg-[#0052FF] hover:bg-[#0052FF]/90 rounded-xl p-2">
                <ConnectWalletText>Log In</ConnectWalletText>
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
                    href="/profile" 
                    target="_blank"
                    className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 !text-gray-900 wallet-dropdown-link"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 15C15.3137 15 18 12.3137 18 9C18 5.68629 15.3137 3 12 3C8.68629 3 6 5.68629 6 9C6 12.3137 8.68629 15 12 15Z" stroke="#111111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2.90625 20.2491C3.82834 18.6531 5.15423 17.3278 6.75064 16.4064C8.34705 15.485 10.1572 15 12.0002 15C13.8432 15 15.6534 15.4851 17.2498 16.4065C18.8462 17.3279 20.1721 18.6533 21.0942 20.2493" stroke="#111111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    SPHERE Identity
                  </Link>
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
              link.dropdownItems ? (
                <div key={link.label}>
                  <button
                    onClick={() => setActiveDropdown(activeDropdown === link.label ? null : link.label)}
                    className="w-full text-left px-4 py-2 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 text-gray-100 hover:text-[#0052FF] hover:bg-[#0052FF]/5 flex items-center justify-between"
                  >
                    {link.label}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {activeDropdown === link.label && (
                    <div className="pl-4">
                      {link.dropdownItems.map((item) =>
                        item.isDisabled ? (
                          <span
                            key={item.href}
                            className="block px-4 py-2 text-gray-500 cursor-not-allowed flex items-center justify-between"
                            title="Soon"
                          >
                            <span>{item.label}</span>
                            <span className="text-xs text-gray-400">soon</span>
                          </span>
                        ) : (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => {
                              setActiveDropdown(null);
                              setIsMobileMenuOpen(false);
                            }}
                            className="block px-4 py-2 text-gray-100 hover:text-[#0052FF] hover:bg-[#0052FF]/5 rounded-xl transition-colors duration-200"
                          >
                            {item.label}
                          </Link>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ) : (
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
                        : link.isFlashBlock 
                          ? 'text-white bg-blue-700 relative shadow-lg shadow-blue-700/30' 
                          : link.isHighlighted 
                            ? 'text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20' 
                            : 'text-gray-100 hover:text-[#0052FF] hover:bg-[#0052FF]/5'
                    }`}
                  >
                  {link.isFlashBlock && (
                    <div className="absolute inset-0 rounded-xl overflow-hidden">
                      <div className="absolute -inset-[1px] rounded-xl border border-transparent bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-[length:200%_200%] animate-gradient-rotate opacity-70"></div>
                    </div>
                  )}
                  <span className={`flex items-center relative z-10 ${(link.isHighlighted || link.isFlashBlock) && 'font-bold'}`}>
                    {link.label}
                    {link.isHighlighted && !link.isFlashBlock && (
                      <span className="ml-1 inline-block animate-pulse">✨</span>
                    )}
                  </span>
                </Link>
                )
              )
            ))}
          </nav>
        )}
      </div>
    </header>
  );
} 