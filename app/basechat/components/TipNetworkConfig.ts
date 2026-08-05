// ===== MULTI-CHAIN TIPPING CONFIGURATION =====
// Konfiguracja wszystkich sieci i tokenów obsługiwanych przez system tipowania

import { base } from 'wagmi/chains';
import { CELO_CHAIN_ID } from '../Celo/config/CeloNetworkConfig';
import { WORLD_CHAIN_ID } from '../World/config/WorldChainNetworkConfig';
import { LINEA_CHAIN_ID } from '../Linea/config/LineaNetworkConfig';
import { BASECAMP_CHAIN_ID } from '../../contracts/BaseCampPostContract';
import { ETHEREUM_CHAIN_ID } from '../ETH/config/EthereumNetworkConfig';
import { ROBINHOOD_CHAIN_ID } from '../Robinhood/config/RobinhoodNetworkConfig';

// ===== TOKEN TYPES =====
export type TipToken = 'ETH' | 'USDC' | 'CELO' | 'WLD' | 'LINEA' | 'CAMP';
export type TipNetwork = 'base' | 'ethereum' | 'celo' | 'world' | 'linea' | 'camp' | 'robinhood';

// ===== TOKEN CONFIG =====
export interface TokenConfig {
  symbol: TipToken;
  name: string;
  decimals: number;
  isNative: boolean;
  contractAddress?: `0x${string}`;
  icon: string; // emoji (fallback)
  iconUrl?: string; // URL do obrazka z /public
  color: string; // kolor dla UI
}

// ===== NETWORK CONFIG =====
export interface NetworkConfig {
  id: TipNetwork;
  chainId: number;
  name: string;
  shortName: string;
  icon: string; // emoji (fallback)
  iconUrl?: string; // URL do obrazka z /public
  color: string;
  explorerUrl: string;
  explorerTxPath: string; // np. '/tx/' lub '/transaction/'
  tokens: TokenConfig[];
  nativeToken: TipToken;
}

// ===== ADRESY KONTRAKTÓW =====
export const TOKEN_ADDRESSES = {
  // Base
  USDC_BASE: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  // World Chain
  WLD_WORLD: '0x2cFc85d8E48F8EAB294be644d9E25C3030863003' as `0x${string}`,
  // Linea
  LINEA_LINEA: '0x1789e0043623282d5dcc7f213d703c6d8bafbb04' as `0x${string}`,
} as const;

// ===== DEFINICJE TOKENÓW =====
export const TOKENS: Record<TipToken, TokenConfig> = {
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    isNative: true,
    icon: '⟠',
    iconUrl: '/ethlogo.png',
    color: '#627EEA',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    isNative: false,
    contractAddress: TOKEN_ADDRESSES.USDC_BASE,
    icon: '💵',
    iconUrl: '/icons/usdc.svg',
    color: '#2775CA',
  },
  CELO: {
    symbol: 'CELO',
    name: 'Celo',
    decimals: 18,
    isNative: true,
    icon: '🟡',
    iconUrl: '/logotypy/AkeHh5LriDwrNIvVvUQ66wSHU.webp',
    color: '#FCFF52',
  },
  WLD: {
    symbol: 'WLD',
    name: 'Worldcoin',
    decimals: 18,
    isNative: false,
    contractAddress: TOKEN_ADDRESSES.WLD_WORLD,
    icon: '🌐',
    iconUrl: '/logotypy/logo-symbol.svg', // World logo
    color: '#000000',
  },
  LINEA: {
    symbol: 'LINEA',
    name: 'Linea',
    decimals: 18,
    isNative: false,
    contractAddress: TOKEN_ADDRESSES.LINEA_LINEA,
    icon: '⬡',
    iconUrl: '/Logomark Blue BG.png',
    color: '#61DFFF',
  },
  CAMP: {
    symbol: 'CAMP',
    name: 'Camp Token',
    decimals: 18,
    isNative: true,
    icon: '🏕️',
    iconUrl: '/Camp.png',
    color: '#FF6B35',
  },
};

// ===== DEFINICJE SIECI =====
export const NETWORKS: Record<TipNetwork, NetworkConfig> = {
  base: {
    id: 'base',
    chainId: base.id,
    name: 'Base',
    shortName: 'Base',
    icon: '🔵',
    iconUrl: '/logotypy/Base_square_blue.png',
    color: '#0052FF',
    explorerUrl: 'https://basescan.org',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    tokens: [
      TOKENS.ETH,
      TOKENS.USDC,
    ],
  },
  ethereum: {
    id: 'ethereum',
    chainId: ETHEREUM_CHAIN_ID,
    name: 'Ethereum',
    shortName: 'ETH',
    icon: '⟠',
    iconUrl: '/ethlogo.png',
    color: '#627EEA',
    explorerUrl: 'https://etherscan.io',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    tokens: [
      TOKENS.ETH,
    ],
  },
  celo: {
    id: 'celo',
    chainId: CELO_CHAIN_ID,
    name: 'Celo',
    shortName: 'Celo',
    icon: '🟡',
    iconUrl: '/logotypy/AkeHh5LriDwrNIvVvUQ66wSHU.webp',
    color: '#FCFF52',
    explorerUrl: 'https://celoscan.io',
    explorerTxPath: '/tx/',
    nativeToken: 'CELO',
    tokens: [
      TOKENS.CELO,
    ],
  },
  world: {
    id: 'world',
    chainId: WORLD_CHAIN_ID,
    name: 'World Chain',
    shortName: 'World',
    icon: '🌐',
    iconUrl: '/logotypy/logo-symbol.svg',
    color: '#000000',
    explorerUrl: 'https://worldscan.org',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    tokens: [
      TOKENS.ETH,
      TOKENS.WLD,
    ],
  },
  linea: {
    id: 'linea',
    chainId: LINEA_CHAIN_ID,
    name: 'Linea',
    shortName: 'Linea',
    icon: '⬡',
    iconUrl: '/Logomark Blue BG.png',
    color: '#61DFFF',
    explorerUrl: 'https://lineascan.build',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    tokens: [
      TOKENS.ETH,
      TOKENS.LINEA,
    ],
  },
  // Robinhood Chain - tipy to zwykle transfery natywnego ETH, wiec dzialaja
  // od razu, niezaleznie od tego czy kontrakt postow jest juz wdrozony.
  robinhood: {
    id: 'robinhood',
    chainId: ROBINHOOD_CHAIN_ID,
    name: 'Robinhood Chain',
    shortName: 'Robinhood',
    icon: '🟢',
    iconUrl: '/logotypy/robinhood.svg',
    color: '#00C805', // Firmowa zielen Robinhooda
    explorerUrl: 'https://robinhoodchain.blockscout.com',
    explorerTxPath: '/tx/',
    nativeToken: 'ETH',
    tokens: [
      // ETH jest juz zdefiniowany w TOKENS - reuzywamy zamiast duplikowac
      TOKENS.ETH,
    ],
  },
  camp: {
    id: 'camp',
    chainId: BASECAMP_CHAIN_ID,
    name: 'Camp Network',
    shortName: 'Camp',
    icon: '🏕️',
    iconUrl: '/Camp.png',
    color: '#FF6B35',
    explorerUrl: 'https://basecamp.cloud',
    explorerTxPath: '/tx/',
    nativeToken: 'CAMP',
    tokens: [
      TOKENS.CAMP,
    ],
  },
};

// ===== HELPER FUNCTIONS =====

/**
 * Pobiera konfigurację sieci na podstawie chainId
 */
export const getNetworkByChainId = (chainId: number): NetworkConfig | undefined => {
  return Object.values(NETWORKS).find(network => network.chainId === chainId);
};

/**
 * Pobiera konfigurację sieci na podstawie nazwy
 */
export const getNetworkById = (networkId: TipNetwork): NetworkConfig => {
  return NETWORKS[networkId];
};

/**
 * Pobiera konfigurację tokena
 */
export const getTokenConfig = (token: TipToken): TokenConfig => {
  return TOKENS[token];
};

/**
 * Sprawdza czy dany token jest dostępny na danej sieci
 */
export const isTokenAvailableOnNetwork = (token: TipToken, networkId: TipNetwork): boolean => {
  const network = NETWORKS[networkId];
  return network.tokens.some(t => t.symbol === token);
};

/**
 * Pobiera dostępne tokeny dla danej sieci
 */
export const getTokensForNetwork = (networkId: TipNetwork): TokenConfig[] => {
  return NETWORKS[networkId].tokens;
};

/**
 * Pobiera domyślny token dla sieci
 */
export const getDefaultTokenForNetwork = (networkId: TipNetwork): TokenConfig => {
  const network = NETWORKS[networkId];
  return TOKENS[network.nativeToken];
};

/**
 * Generuje link do explorera dla transakcji
 */
export const getExplorerTxLink = (networkId: TipNetwork, txHash: string): string => {
  const network = NETWORKS[networkId];
  return `${network.explorerUrl}${network.explorerTxPath}${txHash}`;
};

/**
 * Mapuje chainId na TipNetwork
 */
export const chainIdToNetwork = (chainId: number): TipNetwork | undefined => {
  const network = getNetworkByChainId(chainId);
  return network?.id;
};

/**
 * Quick amounts dla różnych tokenów
 */
export const QUICK_AMOUNTS: Record<TipToken, string[]> = {
  ETH: ['0.001', '0.01', '0.1'],
  USDC: ['1', '5', '10'],
  CELO: ['1', '5', '10'],
  WLD: ['1', '5', '10'],
  LINEA: ['10', '50', '100'],
  CAMP: ['0.01', '0.1', '1'],
};

/**
 * Pobiera quick amounts dla tokena
 */
export const getQuickAmounts = (token: TipToken): string[] => {
  return QUICK_AMOUNTS[token];
};

// ===== ERC20 ABI =====
export const ERC20_TRANSFER_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

// ===== LISTA WSZYSTKICH SIECI (do UI) =====
export const ALL_NETWORKS = Object.values(NETWORKS);
export const ALL_TOKENS = Object.values(TOKENS);

