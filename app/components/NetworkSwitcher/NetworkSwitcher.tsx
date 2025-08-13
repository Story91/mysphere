'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useAccount, useSwitchChain, useChainId } from 'wagmi';
import { base } from 'viem/chains';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { campMainnetChain } from '@/app/contracts/CampMainnet';
import { ENABLE_CAMP_MAINNET } from '@/config/camp';
import { lineaChain } from '@/app/basechat/Linea/config/LineaNetworkConfig';

// Definicja sieci z polskimi komentarzami
// Definition of networks with Polish comments
const baseEntry = {
  id: base.id,
  name: 'Base',
  shortName: 'BASE',
  iconUrl: '/brand-kit/base/logo/symbol/Base_Symbol_Blue.svg', // Ikona dla sieci Base
  color: '#0052FF',
  bgWhite: false,
} as const;

const campMainnetEntry = {
  id: campMainnetChain.id,
  name: 'Camp Mainnet',
  shortName: 'CAMP-M',
  iconUrl: '/Camp.png',
  color: '#FF6B35',
  disabled: !ENABLE_CAMP_MAINNET,
  bgWhite: true, // Białe tło pod logo, żeby było czytelne
} as const;

const campTestnetEntry = {
  id: baseCampChain.id,
  name: 'Camp Testnet',
  shortName: 'CAMP',
  iconUrl: '/Camp.png', // Ikona dla sieci Camp
  color: '#FF6B35',
  bgWhite: true, // Białe tło pod logo
} as const;

const lineaEntry = {
  id: lineaChain.id,
  name: 'Linea',
  shortName: 'LINEA',
  iconUrl: '/Logomark Blue BG.svg', // Ikona dla sieci Linea
  color: '#000000',
  bgWhite: false,
} as const;

// Kolejność: Base, Camp Testnet, Camp Mainnet (z kłódką gdy wyłączone), Linea
const networks = [baseEntry, campTestnetEntry, campMainnetEntry, lineaEntry] as const;
type Network = (typeof networks)[number];

export function NetworkSwitcher() {
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [activeNetwork, setActiveNetwork] = useState<Network>(networks[0]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Ustawia aktywną sieć na podstawie obecnego chainId
    // Sets the active network based on the current chainId
    const currentNetwork = networks.find((net) => net.id === chainId);
    if (currentNetwork) {
      setActiveNetwork(currentNetwork);
    } else {
      // Domyślnie Base, jeśli połączono z nieobsługiwaną siecią
      // Defaults to Base if connected to an unsupported network
      setActiveNetwork(networks[0]);
    }
  }, [chainId]);

  // Zamyka menu po kliknięciu poza komponentem
  // Closes the menu when clicking outside the component
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);

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
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-black/20 hover:bg-black/30 rounded-xl border border-[#0052FF]/20 hover:border-[#0052FF]/50 transition-all duration-200 backdrop-blur-xl"
        aria-label="Przełącz sieć"
      >
        <div className={`w-5 h-5 rounded-full overflow-hidden ${
          (activeNetwork as any).bgWhite ? 'bg-white' : 'bg-white/10'
        } flex items-center justify-center`}>
          <Image
            src={activeNetwork.iconUrl}
            alt={`Logo ${activeNetwork.name}`}
            width={16}
            height={16}
            className="object-contain"
          />
        </div>
        <span className="hidden sm:block text-white text-sm font-['Coinbase_Display'] font-medium">
          {activeNetwork.shortName}
        </span>
        <svg 
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
            {networks.map((network) => (
              <button
                key={network.id}
                onClick={() => !('disabled' in network && network.disabled) && handleNetworkSwitch(network.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-all duration-200 ${
                  network.id === chainId 
                    ? 'bg-[#0052FF]/20 text-white' 
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
                disabled={network.id === chainId || ('disabled' in network && network.disabled)}
                title={('disabled' in network && network.disabled) ? 'Locked' : undefined}
              >
                <div className={`w-6 h-6 rounded-full overflow-hidden ${
                  (network as any).bgWhite ? 'bg-white' : 'bg-white/10'
                } flex items-center justify-center flex-shrink-0`}>
                  <Image
                    src={network.iconUrl}
                    alt={`Logo ${network.name}`}
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-['Coinbase_Display'] font-medium text-sm truncate">
                    {network.name}
                  </div>
                </div>
                {/* Kłódka dla zablokowanych */}
                {('disabled' in network && network.disabled) ? (
                  <svg
                    className="w-3.5 h-3.5 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M7 10V8C7 5.79086 8.79086 4 11 4C13.2091 4 15 5.79086 15 8V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <rect x="5" y="10" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                ) : network.id === chainId && (
                  <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 