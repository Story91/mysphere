'use client';

import { base } from 'viem/chains';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { createContext, useContext, useState } from 'react';
import { createConfig, http } from 'wagmi';
import { WagmiConfig } from 'wagmi';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FarcasterFrameProvider } from './components/FarcasterFrameProvider/FarcasterFrameProvider';
import { defineChain } from 'viem';
import { baseCampChain } from './contracts/BaseCampPostContract';

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
 * Wagmi Configuration
 * 
 * We define our configuration with multiple chains:
 * 1. Base Mainnet (base) - Primary network for the app
 * 2. BaseCamp (baseCampChain) - Secondary network for specific functionality
 * 
 * When using transactions for BaseCamp, ensure you explicitly specify 
 * the chain in both simulateContract and writeContract calls.
 * See BaseBook/app/basechat/components/BaseCampPosts/TransactionButtonBaseCamp.tsx
 * for an example implementation.
 */
const wagmiConfig = createConfig({
  chains: [base, baseCampChain],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
    [baseCampChain.id]: http('https://rpc.basecamp.t.raas.gelato.cloud'),
  },
  connectors: [
    farcasterFrame(),
    injected(),
    coinbaseWallet({
      appName: 'MySphere',
      appLogoUrl: '/android-chrome-192x192.png',
      darkMode: true
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
  ]
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [style, setStyle] = useState<ThemeStyle>('base');

  return (
    <ThemeContext.Provider value={{ mode, setMode, style, setStyle }}>
      <QueryClientProvider client={queryClient}>
        <WagmiConfig config={wagmiConfig}>
          <FarcasterFrameProvider>
            <OnchainKitProvider
              apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
              // We're using base as default, but the WagmiConfig above already supports BaseCamp
              chain={base}
              config={{
                appearance: {
                  name: 'MySphere',
                  logo: '/android-chrome-192x192.png',
                  mode: 'dark',
                  theme: 'base',
                },
                wallet: {
                  display: 'modal',
                  termsUrl: 'https://mysphere.fun/docs',
                  privacyUrl: 'https://basebook.xyz/docs',
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