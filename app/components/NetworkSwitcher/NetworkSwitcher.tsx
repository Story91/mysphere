'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useAccount, useSwitchChain, useChainId } from 'wagmi';
import { base, baseSepolia } from 'viem/chains';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { campMainnetChain } from '@/app/contracts/CampMainnet';
import { ENABLE_CAMP_MAINNET } from '@/config/camp';
import { lineaChain } from '@/app/basechat/Linea/config/LineaNetworkConfig';
import { celoChain } from '@/app/basechat/Celo/config/CeloNetworkConfig';
import { ethereumChain } from '@/app/basechat/ETH/config/EthereumNetworkConfig';
import { worldChain } from '@/app/basechat/World/config/WorldChainNetworkConfig';
import { robinhoodChain } from '@/app/basechat/Robinhood/config/RobinhoodNetworkConfig';
import { arcTestnet } from '@/app/startpad/arcChain';

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

const baseSepoliaEntry = {
  id: baseSepolia.id,
  name: 'Base Sepolia',
  shortName: 'SEP',
  iconUrl: '/logotypy/Base_basemark_blue.png',
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
  iconUrl: '/logotypy/world-symbol-dark.svg', // Ikona dla sieci World Chain
  color: '#8B5CF6',
  bgWhite: true, // Białe tło dla World Chain
} as const;

const robinhoodEntry = {
  id: robinhoodChain.id,
  name: 'Robinhood Chain',
  shortName: 'RH',
  iconUrl: '/robin.webp', // Oficjalne logo Robinhooda
  color: '#00C805', // Firmowa zielen Robinhooda
  bgWhite: false,
} as const;

/**
 * Arc (Circle) - testnet, mainnet rusza 16 wrzesnia 2026.
 *
 * Znak jest prawdziwym plikiem od wlasciciela. Przez chwile stal tu monogram,
 * bo oficjalnego logo nie bylo pod zadnym ze standardowych adresow (favicon,
 * apple-touch - wszystkie 404), a znak firmowy odrysowany z pamieci wyglada
 * jak zepsuty interfejs. Mechanizm monogramu ZOSTAJE dla kolejnej sieci bez
 * logo - patrz `networkIcon` i `NetworkMonogram` nizej.
 *
 * Barwa to blekit z motywu startpada dla tej sieci (app/startpad/config.ts).
 */
const arcEntry = {
  id: arcTestnet.id,
  name: 'Arc Testnet',
  shortName: 'ARC',
  iconUrl: '/arc.jpg', // Oficjalny znak Arc, dostarczony przez wlasciciela
  color: '#4D9AF0',
  bgWhite: false,
} as const;

// Kolejność: Base, Camp Mainnet, Linea, Celo, Ethereum, World Chain, Robinhood Chain, Arc
const networks = [baseEntry, baseSepoliaEntry, campMainnetEntry, lineaEntry, celoEntry, ethereumEntry, worldChainEntry, robinhoodEntry, arcEntry] as const;
type Network = (typeof networks)[number];

/** Adres pliku znaku sieci albo null, gdy wpis go nie ma (patrz `arcEntry`). */
function networkIcon(network: Network): string | null {
  return 'iconUrl' in network ? network.iconUrl : null;
}

/**
 * Zastepstwo znaku firmowego: dwie litery skrotu na barwie sieci. Ta sama
 * zasada, co przy tokenach bez logo w startpadzie - lepiej uczciwy monogram niz
 * logotyp odrysowany z pamieci.
 */
function NetworkMonogram({ network, size }: { network: Network; size: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center rounded-full font-soft-display font-extrabold text-white"
      style={{ width: size, height: size, backgroundColor: network.color, fontSize: Math.round(size * 0.42) }}
    >
      {network.shortName.slice(0, 2)}
    </span>
  );
}

/**
 * Tlo pod logo: nie kazdy wpis ma te pola, wiec pytamy przez `in`, nie przez `any`.
 *
 * Same znaki sieci sa nietykalne - zmienia sie wylacznie domyslna podkladka.
 * `bg-white/10` bylo bialym przydymieniem pod ciemne szklo; na bialej belce
 * jest niewidoczne, wiec krazek dostaje lawendowa powierzchnie zaglebiona.
 */
function iconBackground(network: Network): string {
  if ('bgWhite' in network && network.bgWhite) return 'bg-white';
  if ('bgBlack' in network && network.bgBlack) return 'bg-black';
  return 'bg-soft-sunken';
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
        className="flex items-center gap-2 px-3 py-2 bg-soft-surface hover:bg-soft-sunken rounded-pill border border-soft-line hover:border-soft-line-strong transition-[background-color,border-color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
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
            {networkIcon(activeNetwork) ? (
              <div className={`w-5 h-5 rounded-full overflow-hidden ${iconBackground(activeNetwork)} flex items-center justify-center`}>
                <Image
                  src={networkIcon(activeNetwork) as string}
                  alt=""
                  width={16}
                  height={16}
                  className="object-contain"
                />
              </div>
            ) : (
              <NetworkMonogram network={activeNetwork} size={20} />
            )}
            <span className="hidden sm:block text-soft-ink text-sm font-soft-display font-bold">
              {activeNetwork.shortName}
            </span>
          </>
        )}
        <svg
          aria-hidden="true"
          className={`w-3 h-3 text-soft-ink-faint transition-transform [transition-duration:var(--dur-press)] ease-out-strong ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        /* origin-top-right: menu wyrasta spod swojego przycisku, a nie ze
           swojego srodka. */
        <div className="absolute top-full right-0 mt-2 w-48 origin-top-right bg-soft-surface border border-soft-line rounded-card shadow-float z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 ease-out-strong">
          <div className="p-2">
            {networks.map((network) => {
              const isDisabled = isNetworkDisabled(network);
              const isCurrent = network.id === chainId;

              return (
              <button
                key={network.id}
                type="button"
                onClick={() => handleNetworkSwitch(network.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-pill transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.98] disabled:active:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-inset ${
                  isCurrent
                    ? 'bg-soft-sunken text-soft-ink'
                    : 'text-soft-ink-muted hover:bg-soft-sunken hover:text-soft-ink'
                }`}
                disabled={isCurrent || isDisabled}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={isDisabled ? `${network.name} (locked)` : network.name}
                title={isDisabled ? 'Locked' : undefined}
              >
                {network.id === base.id ? (
                  <div className="bg-white rounded-lg p-1.5 flex items-center justify-center flex-shrink-0">
                    <Image
                      src={networkIcon(network) as string}
                      alt=""
                      width={50}
                      height={20}
                      className="object-contain h-5"
                    />
                  </div>
                ) : (
                  networkIcon(network) ? (
                  <div className={`w-6 h-6 rounded-full overflow-hidden ${iconBackground(network)} flex items-center justify-center flex-shrink-0`}>
                    <Image
                      src={networkIcon(network) as string}
                      alt=""
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                  </div>
                  ) : (
                    <NetworkMonogram network={network} size={24} />
                  )
                )}
                {network.id !== base.id && (
                  <div className="flex-1 min-w-0">
                    <div className="font-soft-display font-bold text-sm truncate">
                      {network.name}
                    </div>
                  </div>
                )}
                {/* Kłódka dla zablokowanych */}
                {isDisabled ? (
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-soft-ink-faint"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M7 10V8C7 5.79086 8.79086 4 11 4C13.2091 4 15 5.79086 15 8V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <rect x="5" y="10" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                ) : isCurrent && (
                  <div aria-hidden="true" className="w-2 h-2 bg-soft-primary rounded-full flex-shrink-0"></div>
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
