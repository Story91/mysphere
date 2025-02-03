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
import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';

// Stały adres administratora
const ADMIN_ADDRESS = "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd";
const ADMIN_BASENAME = "story91.base.eth";

export default function Navigation() {
  const pathname = usePathname();
  const { address } = useAccount();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (address) {
      setIsAdmin(address.toLowerCase() === ADMIN_ADDRESS.toLowerCase());
    }
  }, [address]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    try {
      // Wymuś odświeżenie danych z BaseScan API
      const response = await fetch('/api/refresh-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ address })
      });

      if (!response.ok) {
        throw new Error('Błąd odświeżania danych');
      }

      // Odśwież stronę
      router.refresh();
      
      // Przeładuj aktualną stronę
      window.location.reload();
    } catch (error) {
      console.error('Błąd odświeżania:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0052FF] bg-opacity-10 backdrop-blur-xl border-b border-[#0052FF]/20">
      {/* Cyber grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent)] bg-[length:30px_30px] opacity-60"></div>
      
      {/* Matrix rain effect */}
      <div className="absolute inset-0 bg-[url('/matrix-code.png')] opacity-5 animate-matrix"></div>
      
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0052FF]/10 via-transparent to-transparent"></div>

      <div className="max-w-7xl mx-auto px-6 py-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link 
              href="/"
              className="hover:scale-105 transition-transform duration-300 relative group"
            >
              <div className="absolute -inset-2 bg-gradient-to-r from-[#0052FF] to-[#00A3FF] opacity-0 group-hover:opacity-20 rounded-xl blur transition-all duration-300"></div>
              <Image
                src="/android-chrome-192x192.png"
                alt="BaseBook"
                width={40}
                height={40}
                className="rounded-xl relative"
              />
            </Link>
            <nav className="flex items-center space-x-2 bg-black/20 p-1.5 rounded-2xl backdrop-blur-xl border border-[#0052FF]/20 relative overflow-hidden">
              {/* Nav background glow */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/5 via-transparent to-[#0052FF]/5 animate-pulse"></div>
              
              <Link
                href="/basechat"
                className={`relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 flex items-center justify-center ${
                  pathname === '/basechat'
                    ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                    : 'text-[#0052FF]'
                }`}
              >
                <span className="relative z-10 flex items-center">
                  <Image
                    src="/elo2.png"
                    alt="SPHERE"
                    width={56}
                    height={56}
                    className="object-contain"
                  />
                </span>
                <div className="absolute inset-0 rounded-xl bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5 transition-all duration-300"></div>
                {pathname === '/basechat' && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                )}
              </Link>
              <Link
                href="/profile"
                className={`relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 ${
                  pathname === '/profile'
                    ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                    : 'text-gray-100 hover:text-[#0052FF]'
                }`}
              >
                <span className="relative z-10">Profile</span>
                <div className="absolute inset-0 rounded-xl bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5 transition-all duration-300"></div>
                {pathname === '/profile' && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                )}
              </Link>
              <Link
                href="/buy"
                className={`relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 ${
                  pathname === '/buy'
                    ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                    : 'text-gray-100 hover:text-[#0052FF]'
                }`}
              >
                <span className="relative z-10">Buy&Swap</span>
                <div className="absolute inset-0 rounded-xl bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5 transition-all duration-300"></div>
                {pathname === '/buy' && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                )}
              </Link>
              <Link
                href="/bridge"
                className={`relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 ${
                  pathname === '/bridge'
                    ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                    : 'text-gray-100 hover:text-[#0052FF]'
                }`}
              >
                <span className="relative z-10">Bridge</span>
                <div className="absolute inset-0 rounded-xl bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5 transition-all duration-300"></div>
                {pathname === '/bridge' && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                )}
              </Link>
              <Link
                href="/nft"
                className={`relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 ${
                  pathname === '/nft'
                    ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                    : 'text-gray-100 hover:text-[#0052FF]'
                }`}
              >
                <span className="relative z-10">NFT</span>
                <div className="absolute inset-0 rounded-xl bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5 transition-all duration-300"></div>
                {pathname === '/nft' && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                )}
              </Link>
              <Link
                href="/messages"
                className={`relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 ${
                  pathname === '/messages'
                    ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                    : 'text-gray-100 hover:text-[#0052FF]'
                }`}
              >
                <span className="relative z-10">DM</span>
                <div className="absolute inset-0 rounded-xl bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5 transition-all duration-300"></div>
                {pathname === '/messages' && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                )}
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`relative group px-5 py-2.5 rounded-xl font-['Coinbase_Display'] text-base transition-all duration-300 ${
                    pathname === '/admin'
                      ? 'text-white bg-[#0052FF] shadow-lg shadow-[#0052FF]/20'
                      : 'text-gray-100 hover:text-[#0052FF]'
                  }`}
                >
                  <span className="relative z-10">Admin</span>
                  <div className="absolute inset-0 rounded-xl bg-[#0052FF]/0 group-hover:bg-[#0052FF]/5 transition-all duration-300"></div>
                  {pathname === '/admin' && (
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] opacity-20 animate-pulse"></div>
                  )}
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`relative group p-2 rounded-xl transition-all duration-300 bg-[#0052FF] text-white hover:bg-[#0052FF]/90 flex items-center justify-center ${
                isRefreshing ? 'opacity-75 cursor-not-allowed' : ''
              }`}
              title="Odśwież"
            >
              <svg 
                className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                />
              </svg>
            </button>
            <div className="text-sm font-mono text-[#0052FF] animate-pulse">
              [BETA 0.9.1]
            </div>
            <Wallet>
              <ConnectWallet className="bg-[#0052FF] hover:bg-[#0052FF]/90 rounded-xl p-2">
                <ConnectWalletText>Log In</ConnectWalletText>
                <Avatar className="h-6 w-6" />
                <Name className="text-white" />
              </ConnectWallet>
              <WalletDropdown>
                <Identity 
                  className="px-4 pt-3 pb-2 bg-gradient-to-r from-[#0052FF]/10 to-[#00FFB3]/10 hover:from-[#0052FF]/20 hover:to-[#00FFB3]/20"
                  hasCopyAddressOnClick
                >
                  <Avatar />
                  <Name />
                  <Address />
                  <EthBalance />
                </Identity>
                <WalletDropdownBasename className="bg-gradient-to-r from-[#0052FF]/20 to-[#00FFB3]/20 hover:from-[#0052FF]/30 hover:to-[#00FFB3]/30" />
                <Link 
                  href="/profile"
                  target="_blank"
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0052FF]/20 to-[#FF00E5]/20 hover:from-[#0052FF]/30 hover:to-[#FF00E5]/30"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 15C15.3137 15 18 12.3137 18 9C18 5.68629 15.3137 3 12 3C8.68629 3 6 5.68629 6 9C6 12.3137 8.68629 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2.90625 20.2491C3.82834 18.6531 5.15423 17.3278 6.75064 16.4064C8.34705 15.485 10.1572 15 12.0002 15C13.8432 15 15.6534 15.4851 17.2498 16.4065C18.8462 17.3279 20.1721 18.6533 21.0942 20.2493" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  SPHERE Identity
                </Link>
                <Link 
                  href="https://keys.coinbase.com"
                  target="_blank"
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00FFB3]/20 to-[#FFAE00]/20 hover:from-[#00FFB3]/30 hover:to-[#FFAE00]/30"
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
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#FFAE00]/20 to-[#FF3B00]/20 hover:from-[#FFAE00]/30 hover:to-[#FF3B00]/30"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 21L15.8033 15.8033M15.8033 15.8033C17.1605 14.4461 18 12.5711 18 10.5C18 6.35786 14.6421 3 10.5 3C6.35786 3 3 6.35786 3 10.5C3 14.6421 6.35786 18 10.5 18C12.5711 18 14.4461 17.1605 15.8033 15.8033Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Base Scan
                </Link>
                <Link 
                  href="https://bridge.base.org"
                  target="_blank"
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#FF3B00]/20 to-[#0052FF]/20 hover:from-[#FF3B00]/30 hover:to-[#0052FF]/30"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 10V14M17 10V14M3 12H7M17 12H21M8 17H16C16.5523 17 17 16.5523 17 16V8C17 7.44772 16.5523 7 16 7H8C7.44772 7 7 7.44772 7 8V16C7 16.5523 7.44772 17 8 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Base Bridge
                </Link>
                <WalletDropdownFundLink className="bg-gradient-to-r from-[#0052FF]/20 to-[#00FFB3]/20 hover:from-[#0052FF]/30 hover:to-[#00FFB3]/30" />
                <WalletDropdownDisconnect className="bg-gradient-to-r from-[#FF3B00]/20 to-[#FF0000]/20 hover:from-[#FF3B00]/30 hover:to-[#FF0000]/30" />
              </WalletDropdown>
            </Wallet>
          </div>
        </div>
      </div>
    </header>
  );
} 