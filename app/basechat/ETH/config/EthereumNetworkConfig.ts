import { defineChain } from 'viem';

// Ethereum Network Configuration
export const ETHEREUM_CHAIN_ID = 1;
export const ETHEREUM_CHAIN_ID_HEX = '0x1';

// RPC URLs dla Ethereum
export const ETHEREUM_RPC_URLS = [
  'https://eth.llamarpc.com',
  'https://ethereum.publicnode.com',
  'https://rpc.ankr.com/eth',
];

// Definicja chain dla Ethereum
export const ethereumChain = defineChain({
  id: ETHEREUM_CHAIN_ID,
  name: 'Ethereum',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: [ETHEREUM_RPC_URLS[0]] },
    public: { http: ETHEREUM_RPC_URLS.slice(0, 2) },
  },
  blockExplorers: {
    default: { 
      name: 'Etherscan', 
      url: 'https://etherscan.io',
      apiUrl: 'https://api.etherscan.io/api'
    },
  },
  testnet: false,
});

// Export głównych konfiguracji
export const ETHEREUM_CONFIG = {
  chainId: ETHEREUM_CHAIN_ID,
  chainIdHex: ETHEREUM_CHAIN_ID_HEX,
  name: 'Ethereum',
  symbol: 'ETH',
  decimals: 18,
  rpcUrl: ETHEREUM_RPC_URLS[0],
  explorerUrl: 'https://etherscan.io',
  explorerApiUrl: 'https://api.etherscan.io/api',
} as const;

