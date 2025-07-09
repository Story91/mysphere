import { Address } from "viem";

export enum ElementType {
  REACTOR = "REACTOR",
  STORAGE = "STORAGE",
  DEFENSE_TOWER = "DEFENSE_TOWER",
  LIVING_MODULE = "LIVING_MODULE",
  TECH_LAB = "TECH_LAB"
}

export enum Rarity {
  COMMON = "COMMON",
  UNCOMMON = "UNCOMMON",
  RARE = "RARE",
  EPIC = "EPIC",
  GENESIS = "GENESIS"
}

export interface BaseElement {
  id: string;
  elementType: ElementType;
  rarity: Rarity;
  level: number;
  power: number;
  mintedAt: number;
}

export interface Player {
  xp: bigint;
  lastCheckIn: bigint;
  streak: bigint;
  baseLevel: number;
  isActive: boolean;
}

export interface LevelRequirement {
  elementCount: number;
  minElementLevel: number;
  requiredXP: bigint;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  completed: boolean;
  reward: {
    xp: number;
    element?: {
      type: ElementType;
      rarity: Rarity;
    };
  };
}

export interface GameStats {
  totalPlayers: number;
  totalElements: number;
  topStreak: number;
  topLevel: number;
}

// NEW: Fusion types for different fusion modes
export enum FusionType {
  STANDARD = "STANDARD",    // 3 identical -> higher rarity
  EPIC = "EPIC",           // 3 identical Epic -> higher level
  GENESIS = "GENESIS"      // 5 different Epic -> Genesis
}

export interface FusionPreview {
  type: FusionType;
  requiredElements: number;
  inputElements: BaseElement[];
  outputPreview: {
    elementType: ElementType;
    rarity: Rarity;
    level: number;
    estimatedPower: number;
  };
  cost: {
    eth: string;
    resources?: number;
  };
  isValid: boolean;
  errorMessage?: string;
}

export interface ContractFunctions {
  // NFT Contract
  mint: (player: Address, elementType: ElementType, rarity: Rarity, level: number) => Promise<string>;
  getElement: (tokenId: string) => Promise<BaseElement>;
  getPlayerElements: (player: Address) => Promise<string[]>;
  
  // Game Contract
  register: () => Promise<void>;
  checkIn: () => Promise<void>;
  fuseElements: (tokenIds: string[]) => Promise<void>;
  levelUp: () => Promise<void>;
  getPlayer: (address: Address) => Promise<Player>;
  getLevelRequirement: (level: number) => Promise<LevelRequirement>;
  checkLevelUpEligibility: (player: Address) => Promise<boolean>;
} 