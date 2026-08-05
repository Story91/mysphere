'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useAccount, useSwitchChain, useChainId } from 'wagmi';
import { base } from 'viem/chains';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { campMainnetChain } from '@/app/contracts/CampMainnet';
import { ENABLE_CAMP_MAINNET } from '@/config/camp';
import { lineaChain } from '@/app/basechat/Linea/config/LineaNetworkConfig';
import { celoChain } from '@/app/basechat/Celo/config/CeloNetworkConfig';
import { ethereumChain } from '@/app/basechat/ETH/config/EthereumNetworkConfig';
import { worldChain } from '@/app/basechat/World/config/WorldChainNetworkConfig';
import { robinhoodChain } from '@/app/basechat/Robinhood/config/RobinhoodNetworkConfig';

// Definicja sieci z polskimi komentarzami
// Definition of networks with Polish comments
const baseEntry = {
  id: base.id,
  name: 'Base',
  shortName: 'BASE',
  iconUrl: '/logotypy/Base_basemark_blue.png', // Ikona dla sieci Base
  color: '#0052FF',
  bgWhite: false,
} as const;

const campMainnetEntry = {
  id: campMainnetChain.id,
  name: 'Camp',
  shortName: 'CAMP',
  iconUrl: '/Camp.png',
  color: '#FF6B35',
  disabled: !ENABLE_CAMP_MAINNET,
  bgWhite: true, // Białe tło pod logo, żeby było czytelne
} as const;

const lineaEntry = {
  id: lineaChain.id,
  name: 'Linea',
  shortName: 'LINEA',
  iconUrl: '/Logomark Blue BG.svg', // Ikona dla sieci Linea
  color: '#000000',
  bgWhite: false,
} as const;

const celoEntry = {
  id: celoChain.id,
  name: 'Celo',
  shortName: 'CELO',
  iconUrl: '/logotypy/AkeHh5LriDwrNIvVvUQ66wSHU.webp', // Ikona dla sieci Celo
  color: '#FCFF52',
  bgWhite: false, // Czarne tło
  bgBlack: true, // Czarne tło dla Celo
} as const;

const ethereumEntry = {
  id: ethereumChain.id,
  name: 'Ethereum',
  shortName: 'ETH',
  iconUrl: '/ethlogo.png', // Logo Ethereum
  color: '#627EEA',
  bgWhite: false,
} as const;

const worldChainEntry = {
  id: worldChain.id,
  name: 'World Chain',
  shortName: 'WORLD',
  iconUrl: '/logotypy/logo-symbol.svg', // Ikona dla sieci World Chain
  color: '#8B5CF6',
  bgWhite: true, // Białe tło dla World Chain
} as const;

const robinhoodEntry = {
  id: robinhoodChain.id,
  name: 'Robinhood Chain',
  shortName: 'RH',
  iconUrl: '/logotypy/robinhood.svg', // Ikona dla sieci Robinhood Chain
  color: '#00C805', // Firmowa zielen Robinhooda
  bgWhite: false,
} as const;

// Kolejność: Base, Camp Mainnet, Linea, Celo, Ethereum, World Chain, Robinhood Chain
const networks = [baseEntry, campMainnetEntry, lineaEntry, celoEntry, ethereumEntry, worldChainEntry, robinhoodEntry] as const;
type Network = (typeof networks)[number];

/** Tlo pod logo: nie kazdy wpis ma te pola, wiec pytamy przez `in`, nie przez `any`. */
function iconBackground(network: Network): string {
  if ('bgWhite' in network && network.bgWhite) return 'bg-white';
  if ('bgBlack' in network && network.bgBlack) return 'bg-black';
  return 'bg-white/10';
}

function isNetworkDisabled(network: Network): boolean {
  return 'disabled' in network && !!network.disabled;
}

export function NetworkSwitcher() {
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Aktywna siec WYNIKA z chainId, wiec jest wyliczana, a nie trzymana w stanie.
  // Wczesniej stan i efekt gonily sie o jeden render: pierwsza klatka po zmianie
  // sieci rysowala jeszcze poprzednie logo.
  // Domyslnie Base, gdy portfel siedzi na nieobslugiwanej sieci.
  const activeNetwork: Network = useMemo(
    () => networks.find((net) => net.id === chainId) ?? networks[0],
    [chainId]
  );

  // Zamyka menu po kliknięciu poza komponentem albo klawiszem Escape.
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  // Nie renderuj komponentu, jeśli portfel nie jest połączony
  // Do not render the component if the wallet is not connected
  if (!isConnected) {
    return null;
  }

  const handleNetworkSwitch = (networkId: number) => {
    if (switchChain) {
      switchChain({ chainId: networkId });
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Kompaktowy przycisk z aktualną siecią */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Switch network, currently ${activeNetwork.name}`}
        className="flex items-center gap-2 px-3 py-2 bg-black/20 hover:bg-black/30 rounded-xl border border-[#0052FF]/20 hover:border-[#0052FF]/50 transition-all duration-200 backdrop-blur-xl"
      >
        {activeNetwork.id === base.id ? (
          <div className="w-5 h-5 bg-white rounded p-0.5 flex items-center justify-center">
            <Image
              src="/logotypy/Base_square_blue.png"
              alt=""
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
        ) : (
          <>
            <div className={`w-5 h-5 rounded-full overflow-hidden ${iconBackground(activeNetwork)} flex items-center justify-center`}>
              <Image
                src={activeNetwork.iconUrl}
                alt=""
                width={16}
                height={16}
                className="object-contain"
              />
            </div>
            <span className="hidden sm:block text-white text-sm font-['Coinbase_Display'] font-medium">
              {activeNetwork.shortName}
            </span>
          </>
        )}
        <svg
          aria-hidden="true"
          className={`w-3 h-3 text-gray-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-black/90 backdrop-blur-xl border border-[#0052FF]/20 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-1">
            {networks.map((network) => {
              const isDisabled = isNetworkDisabled(network);
              const isCurrent = network.id === chainId;

              return (
              <button
                key={network.id}
                type="button"
                onClick={() => handleNetworkSwitch(network.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-all duration-200 ${
                  isCurrent
                    ? 'bg-[#0052FF]/20 text-white'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
                disabled={isCurrent || isDisabled}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={isDisabled ? `${network.name} (locked)` : network.name}
                title={isDisabled ? 'Locked' : undefined}
              >
                {network.id === base.id ? (
                  <div className="bg-white rounded-lg p-1.5 flex items-center justify-center flex-shrink-0">
                    <Image
                      src={network.iconUrl}
                      alt=""
                      width={50}
                      height={20}
                      className="object-contain h-5"
                    />
                  </div>
                ) : (
                  <div className={`w-6 h-6 rounded-full overflow-hidden ${iconBackground(network)} flex items-center justify-center flex-shrink-0`}>
                    <Image
                      src={network.iconUrl}
                      alt=""
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                  </div>
                )}
                {network.id !== base.id && (
                  <div className="flex-1 min-w-0">
                    <div className="font-['Coinbase_Display'] font-medium text-sm truncate">
                      {network.name}
                    </div>
                  </div>
                )}
                {/* Kłódka dla zablokowanych */}
                {isDisabled ? (
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M7 10V8C7 5.79086 8.79086 4 11 4C13.2091 4 15 5.79086 15 8V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <rect x="5" y="10" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                ) : isCurrent && (
                  <div aria-hidden="true" className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></div>
                )}
              </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
} 