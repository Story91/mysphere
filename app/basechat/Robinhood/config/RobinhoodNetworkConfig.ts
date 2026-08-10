import { defineChain } from 'viem';

// Robinhood Chain Network Configuration
export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_ID_HEX = '0x1237';

// Testnet (na razie nieuzywany w wagmi config - trzymany dla kompletnosci)
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
export const ROBINHOOD_TESTNET_CHAIN_ID_HEX = '0xb626';

// RPC URLs dla Robinhood Chain.
//
// UWAGA PRODUKCYJNA: publiczny endpoint rpc.mainnet.chain.robinhood.com jest
// rate-limited i oficjalnie oznaczony jako "not recommended for production".
// Pod produkcje nalezy wstawic wlasny, dedykowany RPC (Alchemy / QuickNode)
// przez zmienna srodowiskowa NEXT_PUBLIC_ROBINHOOD_RPC_URL - publiczny endpoint
// zostaje wtedy tylko jako fallback ponizej.
export const ROBINHOOD_PUBLIC_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';

export const ROBINHOOD_RPC_URLS = [
  // Glowny RPC - dedykowany provider z env, z fallbackiem na publiczny
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || ROBINHOOD_PUBLIC_RPC_URL,
  // Zapasowy - publiczny endpoint (rate-limited)
  ROBINHOOD_PUBLIC_RPC_URL,
].filter((url, index, all) => all.indexOf(url) === index);

// Definicja chain dla Robinhood Chain
export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: { http: [ROBINHOOD_RPC_URLS[0]] }, // Glowny RPC
    public: { http: ROBINHOOD_RPC_URLS }, // Backup RPCs
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://robinhoodchain.blockscout.com',
      apiUrl: 'https://robinhoodchain.blockscout.com/api',
    },
  },
  contracts: {
    // Kanoniczny Multicall3 - ZMIERZONE eth_getCode 2026-08-10 (3808 B).
    // Bez tego wpisu viem odmawia batchowania odczytow bledem
    // "does not support contract multicall3" i caly board pada na starcie.
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    },
    // Kontrakt postow nie jest jeszcze wdrozony na tej sieci - patrz
    // RobinhoodPostContract.ts (adres z NEXT_PUBLIC_ROBINHOOD_POST_CONTRACT).
  },
  testnet: false,
});

// Export glownych konfiguracji
export const ROBINHOOD_CONFIG = {
  chainId: ROBINHOOD_CHAIN_ID,
  chainIdHex: ROBINHOOD_CHAIN_ID_HEX,
  name: 'Robinhood Chain',
  symbol: 'ETH',
  decimals: 18,
  rpcUrl: ROBINHOOD_RPC_URLS[0],
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  explorerApiUrl: 'https://robinhoodchain.blockscout.com/api',
} as const;
