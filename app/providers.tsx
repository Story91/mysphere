// @ts-nocheck
'use client';

import { base } from 'viem/chains';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { createContext, useContext, useState, useMemo } from 'react';
import { createConfig, http } from 'wagmi';
import { WagmiConfig } from 'wagmi';
import { injected, walletConnect, coinbaseWallet, metaMask, safe } from 'wagmi/connectors';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FarcasterFrameProvider } from './components/FarcasterFrameProvider/FarcasterFrameProvider';
import { defineChain } from 'viem';
import { baseCampChain } from './contracts/BaseCampPostContract';
import { campMainnetChain } from './contracts/CampMainnet';
import { ENABLE_CAMP_MAINNET, CAMP_MAINNET } from '@/config/camp';
import { lineaChain } from './basechat/Linea/config/LineaNetworkConfig';
import { celoChain } from './basechat/Celo/config/CeloNetworkConfig';
import { ethereumChain } from './basechat/ETH/config/EthereumNetworkConfig';
import { worldChain } from './basechat/World/config/WorldChainNetworkConfig';

type ThemeMode = 'auto' | 'light' | 'dark';
type ThemeStyle = 'default' | 'base' | 'cyberpunk' | 'hacker';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  style: ThemeStyle;
  setStyle: (style: ThemeStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Domyslne opcje: bez nich staleTime=0 + refetchOnWindowFocus powoduje, ze kazdy
// powrot do zakladki re-fetchuje WSZYSTKIE query (identity per wiersz, useBalance,
// useName) po publicznych RPC.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Wagmi Configuration (bez Base Sepolia)
 * PL: Przygotowane dwie gałęzie konfiguracji, aby uniknąć błędu typów dla 484
 */
const CHAINS_BASE = [base, baseCampChain, lineaChain, celoChain, ethereumChain, worldChain] as const;
const TRANSPORTS_BASE = {
  [base.id]: http('https://mainnet.base.org'),
  [baseCampChain.id]: http('https://rpc.basecamp.t.raas.gelato.cloud'),
  [lineaChain.id]: http('https://linea-rpc.publicnode.com'),
  [celoChain.id]: http('https://forno.celo.org'),
  [ethereumChain.id]: http('https://eth.llamarpc.com'),
  [worldChain.id]: http('https://worldchain-mainnet.g.alchemy.com/public'),
} as const;

const CHAINS_WITH_CAMP_MAINNET = [
  ...CHAINS_BASE,
  campMainnetChain,
] as const;
const TRANSPORTS_WITH_CAMP_MAINNET = {
  ...TRANSPORTS_BASE,
  [campMainnetChain.id]: http(CAMP_MAINNET.RPC_HTTP),
} as const;

// Wallet metadata must match the origin actually serving the app — a hardcoded
// prod URL makes WalletConnect Verify / MetaMask flag localhost sessions as
// mismatched ("unverified") and some wallets refuse to connect.
const APP_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : 'https://mysphere.fun';

const COMMON_CONNECTORS = [
  // Aktualny connector spec miniapp (v2). @farcaster/frame-wagmi-connector
  // i @farcaster/frame-sdk to przestarzale nazwy - frame-sdk byl juz tylko shimem.
  farcasterMiniApp(),
  injected(),
  metaMask({
    dappMetadata: {
      name: 'MySphere',
      url: APP_ORIGIN,
      iconUrl: `${APP_ORIGIN}/android-chrome-192x192.png`,
    },
  }),
  coinbaseWallet({
    appName: 'MySphere',
    appLogoUrl: '/android-chrome-192x192.png',
    // Force Base network for smart wallet
    preference: 'smartWalletOnly',
    version: '4'
  }),
  walletConnect({
    projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || '',
    metadata: {
      name: 'MySphere',
      description: 'The onchain social Dapp on Base. Build, grow, and own your digital Sphere.',
      url: APP_ORIGIN,
      icons: [`${APP_ORIGIN}/android-chrome-192x192.png`]
    }
  }),
  safe(),
] as const;

export const wagmiConfig = ENABLE_CAMP_MAINNET
  ? createConfig({
      chains: CHAINS_WITH_CAMP_MAINNET,
      transports: TRANSPORTS_WITH_CAMP_MAINNET,
      connectors: COMMON_CONNECTORS as unknown as any,
    })
  : createConfig({
      chains: CHAINS_BASE,
      transports: TRANSPORTS_BASE,
      connectors: COMMON_CONNECTORS as unknown as any,
    });

export function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [style, setStyle] = useState<ThemeStyle>('base');

  // Bez useMemo kazdy render Providers tworzy nowy obiekt kontekstu i re-renderuje
  // kazdego konsumenta useTheme().
  const themeValue = useMemo(
    () => ({ mode, setMode, style, setStyle }),
    [mode, style]
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <QueryClientProvider client={queryClient}>
        <WagmiConfig config={wagmiConfig}>
          <FarcasterFrameProvider>
            <OnchainKitProvider
              apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
              chain={base}
              config={{
                appearance: {
                  name: 'MySphere',
                  logo: '/android-chrome-192x192.png',
                  mode: 'auto',
                  theme: 'base',
                },
                wallet: {
                  display: 'modal',
                  termsUrl: 'https://mysphere.fun/docs',
                  privacyUrl: 'https://mysphere.fun/docs',
                  supportedWallets: {
                    rabby: true,
                    trust: true,
                    frame: true,
                  },
                }
              }}
              projectId={process.env.NEXT_PUBLIC_CDP_PROJECT_ID}
            >
              {children}
            </OnchainKitProvider>
          </FarcasterFrameProvider>
        </WagmiConfig>
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}
