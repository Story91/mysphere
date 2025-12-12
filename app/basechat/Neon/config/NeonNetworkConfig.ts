import { defineChain } from 'viem';

// Neon EVM Network Configuration
// Docs: https://docs.neonevm.org/docs/quick_start

// Neon EVM Mainnet
export const NEON_MAINNET_CHAIN_ID = 245022934;
export const NEON_MAINNET_CHAIN_ID_HEX = '0xE9AC0CE';

// Neon EVM Devnet (Testnet)
export const NEON_DEVNET_CHAIN_ID = 245022926;
export const NEON_DEVNET_CHAIN_ID_HEX = '0xE9AC0C6';

// RPC URLs dla Neon EVM
export const NEON_MAINNET_RPC_URLS = [
  'https://neon-proxy-mainnet.solana.p2p.org',
  'https://neon-mainnet.everstake.one',
];

export const NEON_DEVNET_RPC_URLS = [
  'https://devnet.neonevm.org',
];

// Definicja chain dla Neon EVM Mainnet
export const neonMainnetChain = defineChain({
  id: NEON_MAINNET_CHAIN_ID,
  name: 'Neon EVM Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'NEON',
    symbol: 'NEON',
  },
  rpcUrls: {
    default: { http: [NEON_MAINNET_RPC_URLS[0]] },
    public: { http: NEON_MAINNET_RPC_URLS },
  },
  blockExplorers: {
    default: { 
      name: 'NeonScan', 
      url: 'https://neonscan.org',
      apiUrl: 'https://api.neonscan.org/hardhat/verify'
    },
  },
  testnet: false,
});

// Definicja chain dla Neon EVM Devnet
export const neonDevnetChain = defineChain({
  id: NEON_DEVNET_CHAIN_ID,
  name: 'Neon EVM Devnet',
  nativeCurrency: {
    decimals: 18,
    name: 'NEON',
    symbol: 'NEON',
  },
  rpcUrls: {
    default: { http: [NEON_DEVNET_RPC_URLS[0]] },
    public: { http: NEON_DEVNET_RPC_URLS },
  },
  blockExplorers: {
    default: { 
      name: 'NeonScan Devnet', 
      url: 'https://devnet.neonscan.org',
      apiUrl: 'https://devnet-api.neonscan.org/hardhat/verify'
    },
  },
  testnet: true,
});

// Export głównych konfiguracji
export const NEON_MAINNET_CONFIG = {
  chainId: NEON_MAINNET_CHAIN_ID,
  chainIdHex: NEON_MAINNET_CHAIN_ID_HEX,
  name: 'Neon EVM Mainnet',
  symbol: 'NEON',
  decimals: 18,
  rpcUrl: NEON_MAINNET_RPC_URLS[0],
  explorerUrl: 'https://neonscan.org',
  explorerApiUrl: 'https://api.neonscan.org/hardhat/verify',
  // Bridge do Solany
  neonPassUrl: 'https://neonpass.live',
  // Faucet (tylko devnet)
  faucetUrl: null,
} as const;

export const NEON_DEVNET_CONFIG = {
  chainId: NEON_DEVNET_CHAIN_ID,
  chainIdHex: NEON_DEVNET_CHAIN_ID_HEX,
  name: 'Neon EVM Devnet',
  symbol: 'NEON',
  decimals: 18,
  rpcUrl: NEON_DEVNET_RPC_URLS[0],
  explorerUrl: 'https://devnet.neonscan.org',
  explorerApiUrl: 'https://devnet-api.neonscan.org/hardhat/verify',
  // Bridge do Solany (devnet)
  neonPassUrl: 'https://devnet.neonpass.live',
  // Faucet dla devnetu
  faucetUrl: 'https://neonfaucet.org',
} as const;

// Użyj tej konfiguracji w zależności od środowiska
export const NEON_CONFIG = process.env.NEXT_PUBLIC_USE_NEON_DEVNET === 'true' 
  ? NEON_DEVNET_CONFIG 
  : NEON_MAINNET_CONFIG;

export const neonChain = process.env.NEXT_PUBLIC_USE_NEON_DEVNET === 'true'
  ? neonDevnetChain
  : neonMainnetChain;

