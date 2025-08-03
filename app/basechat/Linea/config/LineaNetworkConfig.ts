import { defineChain } from 'viem';

// Linea Network Configuration
export const LINEA_CHAIN_ID = 59144;
export const LINEA_CHAIN_ID_HEX = '0xe708';

// RPC URLs dla Linea (z chainlist)
export const LINEA_RPC_URLS = [
  'https://linea-rpc.publicnode.com',
  'https://linea.drpc.org',
  'https://rpc.linea.build',
  'https://linea.blockpi.network/v1/rpc/public'
];

// Definicja chain dla Linea
export const lineaChain = defineChain({
  id: LINEA_CHAIN_ID,
  name: 'Linea',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: [LINEA_RPC_URLS[0]] }, // Główny RPC
    public: { http: LINEA_RPC_URLS.slice(0, 2) }, // Backup RPCs
  },
  blockExplorers: {
    default: { 
      name: 'Lineascan', 
      url: 'https://lineascan.build',
      apiUrl: 'https://api.lineascan.build/api' // Etherscan API compatible
    },
  },
  contracts: {
    // Dodamy po deployu kontraktu
    // lineaPostContract: {
    //   address: '0x...', 
    // }
  },
  testnet: false,
});

// Export głównych konfiguracji
export const LINEA_CONFIG = {
  chainId: LINEA_CHAIN_ID,
  chainIdHex: LINEA_CHAIN_ID_HEX,
  name: 'Linea',
  symbol: 'ETH',
  decimals: 18,
  rpcUrl: LINEA_RPC_URLS[0],
  explorerUrl: 'https://lineascan.build',
  explorerApiUrl: 'https://api.lineascan.build/api',
  etherscanApiKey: 'HSHV72NNW6KVQA88YB5BFSZHTVPFWC2GJU', // Twój klucz API
} as const;