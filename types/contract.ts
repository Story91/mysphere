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
  resources: number;
  activeMissions: number[];
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

// NEW: Trade Market types
export interface Trade {
  id: number;
  seller: Address;
  tokenId: string;
  price: bigint;
  isActive: boolean;
  element: BaseElement;
  listedAt: number;
}

export interface MarketFilters {
  elementType?: ElementType;
  rarity?: Rarity;
  minLevel?: number;
  maxLevel?: number;
  minPrice?: string;
  maxPrice?: string;
  minPower?: number;
  maxPower?: number;
  sortBy: 'price' | 'power' | 'level' | 'newest' | 'oldest';
  sortOrder: 'asc' | 'desc';
}

export interface MarketStats {
  totalTrades: number;
  totalVolume: bigint;
  averagePrice: bigint;
  floorPrice: bigint;
  mostExpensive: bigint;
}

// NEW: Mission system types
export interface Mission {
  id: number;
  name: string;
  description: string;
  duration: number; // in seconds
  xpReward: number;
  resourceReward: number;
  minBaseLevel: number;
  requiredElements: number;
  requiredElementType: ElementType;
  isActive: boolean;
  isCompleted: boolean;
  startedAt?: number;
  completedAt?: number;
  progress?: number;
}

export enum MissionStatus {
  LOCKED = "LOCKED",
  AVAILABLE = "AVAILABLE", 
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED"
}

export interface MissionProgress {
  missionId: number;
  status: MissionStatus;
  startedAt?: number;
  completedAt?: number;
  elementsUsed?: string[];
  canComplete: boolean;
  timeRemaining?: number;
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
  
  // Mission Contract Functions
  getMission: (missionId: number) => Promise<Mission>;
  startMission: (missionId: number, elementIds: string[]) => Promise<void>;
  completeMission: (missionId: number) => Promise<void>;
  getPlayerMissions: (player: Address) => Promise<MissionProgress[]>;
  getTotalMissions: () => Promise<number>;
  
  // Trade Market Functions
  createTrade: (tokenId: string, price: bigint) => Promise<void>;
  cancelTrade: (tradeId: number) => Promise<void>;
  completeTrade: (tradeId: number, price: bigint) => Promise<void>;
  getTrade: (tradeId: number) => Promise<Trade>;
  getAllTrades: () => Promise<Trade[]>;
  getTotalTrades: () => Promise<number>;
}

// NEW: Base Level Bonus System
export interface BaseLevelBonus {
  level: number;
  powerBonus: number;
  xpMultiplier: number;
  resourceMultiplier: number;
  dailyCheckInBonus: number;
  fusionCostReduction: number;
  unlockedFeatures: string[];
  passiveBonuses: PassiveBonus[];
}

export interface PassiveBonus {
  type: PassiveBonusType;
  value: number;
  description: string;
}

export enum PassiveBonusType {
  POWER_MULTIPLIER = "POWER_MULTIPLIER",
  XP_BOOST = "XP_BOOST", 
  RESOURCE_GENERATION = "RESOURCE_GENERATION",
  FUSION_DISCOUNT = "FUSION_DISCOUNT",
  MISSION_SPEED = "MISSION_SPEED",
  MARKETPLACE_FEE_REDUCTION = "MARKETPLACE_FEE_REDUCTION"
}

export interface UnlockedFeature {
  name: string;
  description: string;
  requiredLevel: number;
  icon: string;
  isUnlocked: boolean;
}

export interface PlayerBonuses {
  currentLevel: number;
  totalPowerBonus: number;
  totalXpMultiplier: number;
  totalResourceMultiplier: number;
  activeBonuses: BaseLevelBonus[];
  nextLevelBonuses: BaseLevelBonus | null;
  unlockedFeatures: UnlockedFeature[];
  nextUnlock: UnlockedFeature | null;
} 