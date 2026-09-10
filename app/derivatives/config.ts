import type { Address } from 'viem';
import { arcTestnet } from '../startpad/arcChain';

/**
 * KONFIGURACJA MODULU DERYWATOW.
 *
 * ===========================================================================
 * DWIE SKALE USDC I ANI JEDNEGO MIEJSCA, W KTORYM SIE MYLA
 * ===========================================================================
 * Na Arc jednostka NATYWNA (gaz, `msg.value`) to USDC z 18 miejscami, a token
 * ERC-20 USDC pod `0x3600...0000` ma 6. Kolateral tego modulu to WYLACZNIE ten
 * drugi. Stad w calym froncie obowiazuja dokladnie dwie funkcje przeliczajace
 * (`usdc`/`fromUsdc` w `format.ts`) i ani jedno `parseEther` na kwocie
 * depozytu. Ceny, notional i PnL przychodza z kontraktow w WAD (18 miejsc) -
 * te formatujemy `formatEther`, i to jest jedyne ich zastosowanie tutaj.
 *
 * Adresy: po wdrozeniu wpisz je do `deployments/derivativeMarket.5042002.json`
 * i tutaj (albo podaj przez NEXT_PUBLIC_*). Dopoki sa zerowe, tablica pokazuje
 * jawny komunikat zamiast udawac pusty rynek.
 */

export const DERIV_CHAIN = arcTestnet;

const env = (name: string) => (process.env[name] || '').trim();

export const ORACLE_ADDRESS = (env('NEXT_PUBLIC_DERIV_ORACLE') ||
  '0x0000000000000000000000000000000000000000') as Address;
export const FACTORY_ADDRESS = (env('NEXT_PUBLIC_DERIV_FACTORY') ||
  '0x0000000000000000000000000000000000000000') as Address;
export const USDC_ADDRESS = (env('NEXT_PUBLIC_DERIV_USDC') ||
  '0x3600000000000000000000000000000000000000') as Address;

export const DEPLOYED = FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000';

/** Kolateral ma SZESC miejsc. Nie osiemnascie. */
export const USDC_DECIMALS = 6;

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

export const oracleAbi = [
  { type: 'function', name: 'marketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MIN_BOND_AMOUNT', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'CHALLENGE_BOND', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'getMarket',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'publisher', type: 'address' },
      { name: 'symbol', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'updatedAt', type: 'uint64' },
      { name: 'bond', type: 'uint256' },
      { name: 'slashed', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'marketStats',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'bond', type: 'uint256' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'updateCount', type: 'uint32' },
      { name: 'challengesOpened', type: 'uint32' },
      { name: 'frozen', type: 'bool' },
      { name: 'slashed', type: 'bool' },
    ],
  },
  { type: 'function', name: 'getTwap', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isActive', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'registerMarket',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'string' }, { type: 'uint256' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'topUpBond', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
  {
    type: 'function',
    name: 'submitPrice',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint64' }],
    outputs: [],
  },
  { type: 'function', name: 'challengePrice', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  {
    type: 'event',
    name: 'PriceSubmitted',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ],
  },
] as const;

export const factoryAbi = [
  { type: 'function', name: 'marketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'marketOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'allMarkets', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'INSURANCE', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'FEES', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'MIN_VIRTUAL_LIQUIDITY', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'createMarket',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
    outputs: [{ type: 'address' }],
  },
] as const;

export const marketAbi = [
  { type: 'function', name: 'ORACLE_MARKET_ID', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'CREATOR', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'markPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'indexPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'openInterestNotional', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'maxOpenInterest', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'creatorOiCap', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isMature', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'netSize', stateMutability: 'view', inputs: [], outputs: [{ type: 'int256' }] },
  { type: 'function', name: 'cumFunding', stateMutability: 'view', inputs: [], outputs: [{ type: 'int256' }] },
  { type: 'function', name: 'MAX_LEVERAGE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'MIN_MARGIN_USDC', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAINTENANCE_MARGIN_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  {
    type: 'function',
    name: 'getPosition',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [
      { name: 'size', type: 'int256' },
      { name: 'margin', type: 'uint256' },
      { name: 'openNotional', type: 'uint256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'funding', type: 'int256' },
    ],
  },
  { type: 'function', name: 'unrealizedPnl', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'int256' }] },
  { type: 'function', name: 'marginRatioBps', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'int256' }] },
  { type: 'function', name: 'liquidationPrice', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'openPosition',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'bool' }, { type: 'uint256' }, { type: 'uint8' }],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }],
  },
  { type: 'function', name: 'closePosition', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'liquidate', stateMutability: 'nonpayable', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'settleFunding', stateMutability: 'nonpayable', inputs: [], outputs: [] },
] as const;

export const insuranceAbi = [
  { type: 'function', name: 'balance', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalOi', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'requiredBalance', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'newPositionsPaused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'minRatioBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'notifyDeposit', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
] as const;

export const feesAbi = [
  { type: 'function', name: 'claimableNow', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'lockedTotal', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

export type MarketRow = {
  id: number;
  address: Address;
  symbol: string;
  creator: Address;
  markPrice: bigint;
  indexPrice: bigint;
  openInterest: bigint;
  maxOpenInterest: bigint;
  bond: bigint;
  createdAt: number;
  updateCount: number;
  challengesOpened: number;
  frozen: boolean;
  slashed: boolean;
  mature: boolean;
};
