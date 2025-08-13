import { defineChain } from 'viem';
import { CAMP_MAINNET } from '@/config/camp';

// PL: Definicja Camp Mainnet jako łańcucha wagmi/viem (zablokowany przez flagę w config)
export const campMainnetChain = defineChain({
  id: CAMP_MAINNET.CHAIN_ID,
  name: 'Camp Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'CAMP',
    symbol: 'CAMP',
  },
  rpcUrls: {
    default: { http: [CAMP_MAINNET.RPC_HTTP] },
    public: { http: [CAMP_MAINNET.RPC_HTTP] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: CAMP_MAINNET.EXPLORER },
  },
  testnet: false,
});


