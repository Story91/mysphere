'use client';

import { base } from 'viem/chains';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { createContext, useContext, useState } from 'react';
import { createConfig, http } from 'wagmi';
import { WagmiConfig } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';
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
import { CampProvider } from '@campnetwork/origin/react';
import { PrivyProvider } from '@privy-io/react-auth';

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

const queryClient = new QueryClient();

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

const COMMON_CONNECTORS = [
  farcasterFrame(),
  injected(),
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
      url: 'https://mysphere.fun',
      icons: ['https://mysphere.fun/android-chrome-192x192.png']
    }
  })
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

  return (
    <ThemeContext.Provider value={{ mode, setMode, style, setStyle }}>
      <QueryClientProvider client={queryClient}>
        <WagmiConfig config={wagmiConfig}>
          <RainbowKitProvider>
          <CampProvider 
            clientId={process.env.NEXT_PUBLIC_CAMP_CLIENT_ID!}
            redirectUri={typeof window !== 'undefined' ? `${window.location.origin}/mycamp` : ''}
          >
            <FarcasterFrameProvider>
              <PrivyProvider
                appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
                config={{
                  loginMethods: ['email', 'wallet', 'google', 'twitter'],
                  appearance: {
                    theme: 'dark',
                    accentColor: '#0052FF',
                    showWalletLoginFirst: false,
                  },
                  defaultChain: base,
                  supportedChains: [base],
                  // embeddedWallets: {
                  //   createOnLogin: 'users-without-wallets',
                  // },
                }}
              >
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
                    }
                  }}
                  projectId={process.env.NEXT_PUBLIC_CDP_PROJECT_ID}
                >
                  {children}
                </OnchainKitProvider>
              </PrivyProvider>
            </FarcasterFrameProvider>
          </CampProvider>
          </RainbowKitProvider>
        </WagmiConfig>
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}