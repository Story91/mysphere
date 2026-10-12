import { parseAbi, type Address } from 'viem';

/**
 * RAIDY - wspolne kupno ekipy (contracts/launchpad/raid/RaidVault.sol).
 * Jeden vault na siec, dla rynku ETH (launchpad.buy) i rynkow perpow (PerpZap).
 * Brak wpisu = brak raidow w UI.
 */
export const RAID_VAULT_BY_CHAIN: Record<number, Address | undefined> = {
  // Wdrozony 2026-10-12, blok 52494333 (scripts/output/raid-vault-base.json).
  8453: '0x000fF26384921f6886f82125559Ccb1270df5d1d',
};

export function raidVaultOf(chainId: number): Address | null {
  return RAID_VAULT_BY_CHAIN[chainId] ?? null;
}

export const raidVaultAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct Raid { address leader; uint8 mode; uint8 status; address launchpad; address token; address zap; uint40 executeAfter; uint40 expiresAt; uint256 totalEth; uint256 tokensBought; uint256 ethLeft; uint256 perpLeft; string note; }',
  'function createEthRaid(address launchpad, address token, uint40 executeAfter, uint40 expiresAt, string note) payable returns (uint256)',
  'function createPerpRaid(address launchpad, address token, address zap, PoolKey ethPool, PoolKey perpPool, uint40 executeAfter, uint40 expiresAt, string note) payable returns (uint256)',
  'function join(uint256 id) payable',
  'function leave(uint256 id)',
  'function execute(uint256 id, uint256 minPerpOut, uint256 minTokensOut) returns (uint256)',
  'function cancel(uint256 id)',
  'function claim(uint256 id)',
  'function refund(uint256 id)',
  'function raidCount() view returns (uint256)',
  'function raidOf(uint256 id) view returns (Raid)',
  'function deposits(uint256 id, address member) view returns (uint256)',
  'function settled(uint256 id, address member) view returns (bool)',
]);

export const RAID_STATUS = ['None', 'Open', 'Executed', 'Cancelled'] as const;
export type RaidStatus = (typeof RAID_STATUS)[number];

/** Raid w JSON-ie z /api/launchpad/raids (biginty jako tekst). */
export type RaidView = {
  id: number;
  leader: Address;
  mode: 'eth' | 'perp';
  status: RaidStatus;
  launchpad: Address;
  token: Address;
  executeAfter: number;
  expiresAt: number;
  totalEth: string;
  tokensBought: string;
  note: string;
};

/**
 * Okno startowe launchpada: przez pierwsze 300 s limit na ADRES (16 mln
 * tokenow na rynku ETH). Raid to jeden adres, wiec start raidu wczesniej
 * moglby odbic sie od `WindowCap` - UI nie pozwala ustawic startu w oknie.
 */
export const LAUNCH_WINDOW_SECONDS = 300;
