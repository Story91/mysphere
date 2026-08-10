import { baseSepolia } from 'viem/chains';

export const LAUNCHPAD_CHAIN = baseSepolia;
// Domyslne wartosci to wdrozenie z 2026-08-10 15:42 UTC (70% tworca / 30%
// protokol, buyback z dzialki tworcy) - docs/LAUNCHPAD-STAN.md. Wczesniejsze
// wdrozenia (0xA760...4F97, 0x0712...0844) sa MARTWE: inne ABI albo stary
// model oplat. Fallback MUSI nadazac za wdrozeniem - produkcja bez zmiennych
// srodowiskowych patrzy wlasnie tutaj.
export const LAUNCHPAD_ADDRESS =
  (process.env.NEXT_PUBLIC_LAUNCHPAD_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
  '0x811d6dE17E2D021A564Bc699e353ead7FE7258ba';
export const LIQUIDITY_VAULT_ADDRESS =
  (process.env.NEXT_PUBLIC_LIQUIDITY_VAULT_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
  '0x21F2c3506170cb670102B6fB5be6b6dbDb73b88b';
export const LAUNCH_HOOK_ADDRESS =
  (process.env.NEXT_PUBLIC_LAUNCH_HOOK_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
  '0xfaEF39f75aACC1271D7173748245A69CBD09e044';

export const launchpadAbi = [
  {
    type: 'function',
    name: 'launch',
    stateMutability: 'payable',
    inputs: [
      { name: 'name_', type: 'string' },
      { name: 'symbol_', type: 'string' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  {
    // Rozszerzony start. UWAGA: wdrozenie spod `LAUNCHPAD_ADDRESS` moze byc
    // STARSZE niz ta funkcja. Interfejs NIE MOZE zakladac, ze ona tam jest -
    // wykrywa to odczytem `MAX_BUYBACK_BPS`, patrz `LaunchpadBoard`.
    type: 'function',
    name: 'launchAdvanced',
    stateMutability: 'payable',
    inputs: [
      { name: 'name_', type: 'string' },
      { name: 'symbol_', type: 'string' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'feeBps_', type: 'uint16' },
      { name: 'creatorFeeBps_', type: 'uint16' },
      { name: 'buybackBps_', type: 'uint16' },
      { name: 'windowCap_', type: 'uint256' },
      { name: 'receiverAccounts_', type: 'address[]' },
      { name: 'receiverSharesBps_', type: 'uint16[]' },
      { name: 'metadataURI_', type: 'string' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  {
    // KOLEJNOSC ZWROTEK MUSI ZGADZAC SIE Z CurveLaunchpad.launchOf CO DO POLA.
    // Wszystkie sa statyczne, wiec przestawienie ich NIE wywala dekodera -
    // po cichu zwraca inne pole. Bylo tu `startedAt` przed rezerwami, przez co
    // to, co interfejs pokazywal jako zebrane ETH, bylo rezerwa TOKENA.
    type: 'function',
    name: 'launchOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'ethReserve', type: 'uint256' },
      { name: 'tokenReserve', type: 'uint256' },
      { name: 'startedAt', type: 'uint40' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  {
    type: 'function',
    name: 'quoteBuy',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'ethIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'tokensOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'refund', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'VAULT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'HOOK',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event',
    name: 'Launched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'launchId', type: 'bytes32', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'totalSupply', type: 'uint256', indexed: false },
      { name: 'curveSupply', type: 'uint256', indexed: false },
      { name: 'tMin', type: 'uint256', indexed: false },
      { name: 'rVirt', type: 'uint256', indexed: false },
      { name: 'feeBps', type: 'uint16', indexed: false },
      { name: 'creatorFeeBps', type: 'uint16', indexed: false },
      { name: 'startedAt', type: 'uint40', indexed: false },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  WYJSCIE Z POZYCJI - sprzedaz na krzywej                              */
  /* -------------------------------------------------------------------- */

  {
    type: 'function',
    name: 'quoteSell',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'ethOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'sell',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensIn', type: 'uint256' },
      { name: 'minEthOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'ethOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sellWithPermit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensIn', type: 'uint256' },
      { name: 'minEthOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'permitDeadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [{ name: 'ethOut', type: 'uint256' }],
  },

  /* -------------------------------------------------------------------- */
  /*  AWANS - bezuprawnieniowy, z nagroda dla wolajacego                   */
  /* -------------------------------------------------------------------- */

  {
    type: 'function',
    name: 'graduate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'gradFeeOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'fee', type: 'uint256' },
      { name: 'callerReward', type: 'uint256' },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  WYPLATY - oplaty sa PULLEM, nie pushem                               */
  /* -------------------------------------------------------------------- */

  {
    type: 'function',
    name: 'claimable',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimFor',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [],
  },

  /* -------------------------------------------------------------------- */
  /*  ODCZYTY POMOCNICZE                                                   */
  /* -------------------------------------------------------------------- */

  {
    type: 'function',
    name: 'spotPriceWeiPerToken',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'windowBought',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  { type: 'function', name: 'T0', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'T_MIN', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'R_VIRT', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'MAX_BUY', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'LAUNCH_WINDOW',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'WINDOW_ADDR_CAP',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  { type: 'function', name: 'FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'CREATOR_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'MAX_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'MAX_CREATOR_SHARE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'MAX_BUYBACK_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'MAX_FEE_RECIPIENTS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  {
    type: 'function',
    name: 'feeConfigOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'feeBps', type: 'uint16' },
      { name: 'creatorFeeBps', type: 'uint16' },
      { name: 'receiverCount', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'metadataURI',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
  },

  /* -------------------------------------------------------------------- */
  /*  ZDARZENIA - jedyne zrodlo wykresu przed awansem                      */
  /* -------------------------------------------------------------------- */

  {
    type: 'event',
    name: 'Bought',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'ethIn', type: 'uint256', indexed: false },
      { name: 'ethNet', type: 'uint256', indexed: false },
      { name: 'feeEth', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'refund', type: 'uint256', indexed: false },
      { name: 'ethReserveAfter', type: 'uint256', indexed: false },
      { name: 'tokenReserveAfter', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Sold',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'tokensIn', type: 'uint256', indexed: false },
      { name: 'ethGross', type: 'uint256', indexed: false },
      { name: 'feeEth', type: 'uint256', indexed: false },
      { name: 'ethOut', type: 'uint256', indexed: false },
      { name: 'ethReserveAfter', type: 'uint256', indexed: false },
      { name: 'tokenReserveAfter', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CurveLocked',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'ethReserve', type: 'uint256', indexed: false },
      { name: 'tokenReserve', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Graduated',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'ethToPool', type: 'uint256', indexed: false },
      { name: 'tokensToPool', type: 'uint256', indexed: false },
      { name: 'tokensToDead', type: 'uint256', indexed: false },
      { name: 'gradFee', type: 'uint256', indexed: false },
      { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'caller', type: 'address', indexed: true },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  BLEDY - bez nich viem pokazuje surowy selektor zamiast powodu         */
  /* -------------------------------------------------------------------- */

  {
    type: 'event',
    name: 'LaunchConfigured',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'buybackBps', type: 'uint16', indexed: false },
      { name: 'windowCap', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LaunchMetadataSet',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'metadataURI', type: 'string', indexed: false },
    ],
  },

  { type: 'error', name: 'UnknownToken', inputs: [] },
  { type: 'error', name: 'InvalidFeeConfig', inputs: [] },
  { type: 'error', name: 'InvalidFeeReceiver', inputs: [] },
  { type: 'error', name: 'TooManyFeeRecipients', inputs: [] },
  { type: 'error', name: 'FeeTooHigh', inputs: [] },
  { type: 'error', name: 'Expired', inputs: [] },
  { type: 'error', name: 'SlippageRequired', inputs: [] },
  { type: 'error', name: 'Slippage', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'DustTrade', inputs: [] },
  { type: 'error', name: 'BuyTooLarge', inputs: [] },
  { type: 'error', name: 'WindowCap', inputs: [] },
  { type: 'error', name: 'CreatorLocked', inputs: [] },
  { type: 'error', name: 'CurveIsLocked', inputs: [] },
  { type: 'error', name: 'AlreadyGraduated', inputs: [] },
  { type: 'error', name: 'NotLocked', inputs: [] },
  { type: 'error', name: 'ReserveTooSmallToGraduate', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'Arithmetic', inputs: [] },
  { type: 'error', name: 'Reentrancy', inputs: [] },
  { type: 'error', name: 'EthTransferFailed', inputs: [] },
  { type: 'error', name: 'TokenTransferFailed', inputs: [] },
] as const;

export const erc20Abi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
] as const;

export const liquidityVaultAbi = [
  { type: 'function', name: 'poolKeyOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] }] },
  { type: 'function', name: 'positionOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: 'poolId', type: 'bytes32' }, { name: 'liquidity', type: 'uint128' }, { name: 'tickLower', type: 'int24' }, { name: 'tickUpper', type: 'int24' }] },
  { type: 'function', name: 'seeded', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'creatorOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'claimableEth', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimableToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }, { name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'harvest', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'function', name: 'claimEth', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimToken', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'event', name: 'Harvested', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'poolId', type: 'bytes32', indexed: true }, { name: 'caller', type: 'address', indexed: true }, { name: 'fee0', type: 'uint256', indexed: false }, { name: 'fee1', type: 'uint256', indexed: false }] },
] as const;

export const hookAbi = [
  { type: 'function', name: 'pendingEth', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'pendingToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimableEth', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimableToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }, { name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'settle', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'function', name: 'HOOK_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'PROTOCOL_SHARE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'buybackBps', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'pendingBuybackEth', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'buybackTokens', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'executeBuyback',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'AutoBuyback',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'ethIn', type: 'uint256', indexed: false },
      { name: 'tokensBought', type: 'uint256', indexed: false },
      { name: 'caller', type: 'address', indexed: true },
    ],
  },
  { type: 'error', name: 'NothingToBuyback', inputs: [] },
  { type: 'function', name: 'claimEth', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimToken', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'event', name: 'HookFeeSettled', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'ethToProtocol', type: 'uint256', indexed: false }, { name: 'ethToCreator', type: 'uint256', indexed: false }, { name: 'ethToBuyback', type: 'uint256', indexed: false }, { name: 'tokenToProtocol', type: 'uint256', indexed: false }, { name: 'tokenToCreator', type: 'uint256', indexed: false }] },
] as const;

/**
 * Stan startu, tak jak go numeruje `CurveLaunchpad.State`. Zero znaczy "ten
 * kontrakt nie zna tego tokena" i nie jest stanem, ktory wolno pokazac jako
 * pusta krzywa - to jest nieznany adres.
 */
export const LAUNCH_STATE = ['None', 'Curve', 'Locked', 'Graduated'] as const;

export type LaunchState = (typeof LAUNCH_STATE)[number];

/** Zbiorka do awansu wynika ze stalych krzywej i jest DOKLADNIE 3.00 ETH. */
export const CURVE_TARGET_ETH = 3;

/**
 * Blok wdrozenia launchpada na Base Sepolia. `getLogs` od bloku 0 na publicznym
 * RPC albo trwa wieczne, albo dostaje limit zakresu - a przed tym blokiem
 * zadnego `Launched` z definicji nie ma.
 */
export const LAUNCHPAD_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK ?? '45302335'
);

export type LaunchpadToken = {
  id: string;
  name: string;
  symbol: string;
  creator: string;
  address?: `0x${string}`;
  state: 'Curve' | 'Locked' | 'Graduated';
  raised: number;
  target: number;
  holders: number;
  age: string;
  accent: string;
  live?: boolean;
  volume?: number;
  trades?: number;
  lastPrice?: number;
  /** Logo z profilu tworcy albo z `metadataURI`. Lancuch sam go NIE zna. */
  logoUrl?: string;
};

export const previewTokens: LaunchpadToken[] = [
  {
    id: 'lumen',
    name: 'Lumen Commons',
    symbol: 'LUMEN',
    creator: '0x93f...8b4',
    state: 'Curve',
    raised: 2.42,
    target: 3,
    holders: 84,
    age: '18 min',
    accent: '#8b78e6',
  },
  {
    id: 'moss',
    name: 'Moss Radio',
    symbol: 'MOSS',
    creator: '0x2ab...d19',
    state: 'Graduated',
    raised: 3,
    target: 3,
    holders: 216,
    age: '1 h',
    accent: '#5fa78c',
  },
  {
    id: 'nook',
    name: 'Nook Notes',
    symbol: 'NOOK',
    creator: '0x7cf...031',
    state: 'Locked',
    raised: 3,
    target: 3,
    holders: 143,
    age: '2 h',
    accent: '#d78a55',
  },
  {
    id: 'orbit',
    name: 'Orbit Garden',
    symbol: 'ORBT',
    creator: '0xd11...a62',
    state: 'Curve',
    raised: 0.84,
    target: 3,
    holders: 31,
    age: '4 h',
    accent: '#5b8bd9',
  },
];
