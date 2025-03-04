'use client';

import { OnchainKitProvider } from '@coinbase/onchainkit';
import type { ReactNode } from 'react';
import { createConfig, WagmiConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { coinbaseWallet } from 'wagmi/connectors';

// Tworzymy niestandardowy łańcuch Base Sepolia z endpointem FlashBlock
const baseSepoliaFlashblock = {
  ...baseSepolia,
  id: 84532, // Base Sepolia chain ID
  name: 'Base Sepolia FlashBlock',
  rpcUrls: {
    default: {
      http: ['https://sepolia-preconf.base.org'],
      webSocket: ['wss://sepolia.flashblocks.base.org/ws']
    },
    public: {
      http: ['https://sepolia-preconf.base.org'],
      webSocket: ['wss://sepolia.flashblocks.base.org/ws']
    }
  }
};

const queryClient = new QueryClient();

// Tworzymy konfigurację z niestandardowym transportem
const config = createConfig({
  chains: [baseSepoliaFlashblock],
  connectors: [
    coinbaseWallet({
      appName: 'Flashblocks Demo',
    }),
  ],
  transports: {
    [baseSepoliaFlashblock.id]: http(baseSepoliaFlashblock.rpcUrls.default.http[0]),
  },
});

export function Providers(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiConfig config={config}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={baseSepoliaFlashblock}
          config={{ 
            appearance: { 
              mode: 'auto',
            }
          }}
        >
          {props.children}
        </OnchainKitProvider>
      </WagmiConfig>
    </QueryClientProvider>
  );
}

