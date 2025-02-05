'use client';

import { base } from 'viem/chains';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { createContext, useContext, useState } from 'react';

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

export function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [style, setStyle] = useState<ThemeStyle>('base');

  return (
    <ThemeContext.Provider value={{ mode, setMode, style, setStyle }}>
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
          },
          // @ts-ignore
          coinbaseWallet: {
            appName: 'BaseBook',
            appLogoUrl: '/android-chrome-192x192.png',
            darkMode: true,
            defaultChain: base,
            chainId: 8453,
            jsonRpcUrl: 'https://base-mainnet.public.blastapi.io',
            fallbackRpcUrls: [
              'https://mainnet.base.org',
              'https://base.blockpi.network/v1/rpc/public'
            ]
          }
        }}
        projectId={process.env.NEXT_PUBLIC_CDP_PROJECT_ID}
      >
        {children}
      </OnchainKitProvider>
    </ThemeContext.Provider>
  );
}