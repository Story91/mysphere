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

// Konfiguracja wagmi z obsługą Farcaster Frame
const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http('https://mainnet.base.org')
  },
  connectors: [
    farcasterFrame(),
    injected(),
    coinbaseWallet({
      appName: 'BaseBook',
      appLogoUrl: '/android-chrome-192x192.png',
      darkMode: true
    }),
    walletConnect({ 
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || '',
      metadata: {
        name: 'BaseBook',
        description: 'Social network on Base',
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
              chain={base}
              config={{
                appearance: {
                  name: 'BaseBook',
                  logo: '/android-chrome-192x192.png',
                  mode: 'dark',
                  theme: 'base',
                },
                wallet: {
                  display: 'modal',
                  termsUrl: 'https://basebook.xyz/terms',
                  privacyUrl: 'https://basebook.xyz/privacy',
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