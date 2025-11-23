import { defineChain } from 'viem';

// Celo Network Configuration
export const CELO_CHAIN_ID = 42220;
export const CELO_CHAIN_ID_HEX = '0xa4ec';

// RPC URLs dla Celo
export const CELO_RPC_URLS = [
  'https://forno.celo.org',
  'https://celo-mainnet.infura.io/v3/YOUR_INFURA_KEY',
  'https://rpc.ankr.com/celo',
];

// Definicja chain dla Celo
export const celoChain = defineChain({
  id: CELO_CHAIN_ID,
  name: 'Celo',
  nativeCurrency: {
    decimals: 18,
    name: 'Celo',
    symbol: 'CELO',
  },
  rpcUrls: {
    default: { http: [CELO_RPC_URLS[0]] },
    public: { http: CELO_RPC_URLS.slice(0, 2) },
  },
  blockExplorers: {
    default: { 
      name: 'Celo Explorer', 
      url: 'https://explorer.celo.org',
      apiUrl: 'https://explorer.celo.org/api'
    },
  },
  testnet: false,
});

// Export głównych konfiguracji
export const CELO_CONFIG = {
  chainId: CELO_CHAIN_ID,
  chainIdHex: CELO_CHAIN_ID_HEX,
  name: 'Celo',
  symbol: 'CELO',
  decimals: 18,
  rpcUrl: CELO_RPC_URLS[0],
  explorerUrl: 'https://explorer.celo.org',
  explorerApiUrl: 'https://explorer.celo.org/api',
} as const;

