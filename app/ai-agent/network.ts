import { Chain } from 'viem';
import { base } from 'viem/chains';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { campMainnetChain } from '@/app/contracts/CampMainnet';
import { lineaChain } from '@/app/basechat/Linea/config/LineaNetworkConfig';

/**
 * Network interface for the AI agent
 */
export interface Network {
  protocolFamily: 'evm';
  chainId: number;
  networkId: string;
}

/**
 * Network ID to Chain ID mapping
 */
export const NETWORK_ID_TO_CHAIN_ID: Record<string, number> = {
  'base-mainnet': base.id,
  'base-testnet': 84532, // Base Sepolia
  'camp-mainnet': baseCampChain.id,
  'camp-testnet': 484, // Camp Network
  'linea-mainnet': lineaChain.id,
  'linea-testnet': 59140, // Linea Sepolia
  'ethereum-mainnet': 1,
  'ethereum-sepolia': 11155111,
};

/**
 * Network ID to Viem Chain mapping
 */
export const NETWORK_ID_TO_VIEM_CHAIN: Record<string, Chain> = {
  'base-mainnet': base,
  'base-testnet': {
    id: 84532,
    name: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://sepolia.base.org'] },
      public: { http: ['https://sepolia.base.org'] },
    },
    blockExplorers: {
      default: { name: 'Basescan', url: 'https://sepolia.basescan.org' },
    },
    testnet: true,
  },
  'camp-mainnet': baseCampChain,
  'camp-testnet': baseCampChain, // Using same config for testnet
  'linea-mainnet': lineaChain,
  'linea-testnet': {
    id: 59140,
    name: 'Linea Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://rpc.sepolia.linea.build'] },
      public: { http: ['https://rpc.sepolia.linea.build'] },
    },
    blockExplorers: {
      default: { name: 'Lineascan Sepolia', url: 'https://sepolia.lineascan.build' },
    },
    testnet: true,
  },
  'ethereum-mainnet': {
    id: 1,
    name: 'Ethereum',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://cloudflare-eth.com'] },
      public: { http: ['https://cloudflare-eth.com'] },
    },
    blockExplorers: {
      default: { name: 'Etherscan', url: 'https://etherscan.io' },
    },
    testnet: false,
  },
  'ethereum-sepolia': {
    id: 11155111,
    name: 'Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: ['https://rpc.sepolia.org'] },
      public: { http: ['https://rpc.sepolia.org'] },
    },
    blockExplorers: {
      default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
    },
    testnet: true,
  },
};

/**
 * Get network by network ID
 */
export function getNetworkById(networkId: string): Network | undefined {
  const chainId = NETWORK_ID_TO_CHAIN_ID[networkId];
  if (!chainId) return undefined;

  return {
    protocolFamily: 'evm',
    chainId,
    networkId,
  };
}

/**
 * Get Viem chain by network ID
 */
export function getViemChainById(networkId: string): Chain | undefined {
  return NETWORK_ID_TO_VIEM_CHAIN[networkId];
}

/**
 * Get all supported network IDs
 */
export function getSupportedNetworkIds(): string[] {
  return Object.keys(NETWORK_ID_TO_CHAIN_ID);
}

/**
 * Check if a network ID is supported
 */
export function isNetworkSupported(networkId: string): boolean {
  return networkId in NETWORK_ID_TO_CHAIN_ID;
}
