import { defineChain } from 'viem';

// World Chain Network Configuration
export const WORLD_CHAIN_ID = 480;
export const WORLD_CHAIN_ID_HEX = '0x1e0';

// RPC URLs dla World Chain
export const WORLD_CHAIN_RPC_URLS = [
  'https://worldchain-mainnet.g.alchemy.com/public',
  'https://480.rpc.thirdweb.com',
  'https://worldchain.drpc.org',
];

// Definicja chain dla World Chain
export const worldChain = defineChain({
  id: WORLD_CHAIN_ID,
  name: 'World Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: [WORLD_CHAIN_RPC_URLS[0]] },
    public: { http: WORLD_CHAIN_RPC_URLS },
  },
  blockExplorers: {
    default: { 
      name: 'Worldscan', 
      url: 'https://worldscan.org',
    },
  },
  testnet: false,
});

// Export głównych konfiguracji
export const WORLD_CHAIN_CONFIG = {
  chainId: WORLD_CHAIN_ID,
  chainIdHex: WORLD_CHAIN_ID_HEX,
  name: 'World Chain',
  symbol: 'ETH',
  decimals: 18,
  rpcUrl: WORLD_CHAIN_RPC_URLS[0],
  explorerUrl: 'https://worldscan.org',
} as const;

