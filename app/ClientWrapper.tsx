'use client';

import { base } from 'viem/chains';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { ThemeProvider } from './context/ThemeContext';
import '@coinbase/onchainkit/styles.css';

export default function ClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <OnchainKitProvider 
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY} 
      chain={base}
    >
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </OnchainKitProvider>
  );
} 