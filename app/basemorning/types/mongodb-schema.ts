// MongoDB Schema Types for Base Morning Game
import { ObjectId } from 'mongodb';

export interface MongoPlayer {
  _id?: ObjectId;
  address: string;
  xp: number;
  lastCheckIn: number;
  streak: number;
  baseLevel: number;
  isActive: boolean;
  lastPvpBattle: number;
  pvpWins: number;
  resources: number;
  allianceId: number;
  
  // Additional computed fields
  totalElements: number;
  totalSpent: number; // in wei
  totalEarned: number; // in wei
  achievements: string[];
  rank?: number;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastSeen: Date;
}

export interface MongoElement {
  _id?: ObjectId;
  tokenId: string;
  owner: string;
  elementType: number; // 0-4 (Fire, Water, Earth, Air, Light)
  rarity: number; // 0-3 (Common, Uncommon, Rare, Epic)
  level: number;
  power: number;
  mintedAt: number;
  mintPrice: string; // in wei as string
  
  // Additional metadata
  isFused: boolean;
  fusedFrom?: string[]; // token IDs that were burned to create this
  fusedInto?: string; // token ID this was burned to create
  
  // Trading data
  isForSale: boolean;
  salePrice?: string; // in wei as string
  tradeHistory: TradeRecord[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeRecord {
  from: string;
  to: string;
  price: string; // in wei as string
  timestamp: Date;
  txHash: string;
}

export interface MongoTrade {
  _id?: ObjectId;
  tradeId: string;
  seller: string;
  buyer?: string;
  tokenId: string;
  price: string; // in wei as string
  isActive: boolean;
  isCompleted: boolean;
  
  // Timestamps
  createdAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface ContractEvent {
  _id?: ObjectId;
  eventName: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  address: string; // contract address
  
  // Event data (varies by event type)
  data: {
    player?: string;
    tokenId?: string;
    quantity?: number;
    price?: string;
    tradeId?: string;
    xpEarned?: number;
    streak?: number;
    level?: number;
    [key: string]: any;
  };
  
  // Timestamps
  timestamp: Date;
  blockTimestamp: number;
  
  // Processing status
  processed: boolean;
  processedAt?: Date;
  processingError?: string;
}

export interface LeaderboardEntry {
  _id?: ObjectId;
  address: string;
  playerData: {
    xp: number;
    baseLevel: number;
    streak: number;
    totalElements: number;
    totalSpent: number;
    totalEarned: number;
    pvpWins: number;
  };
  
  // Rankings
  ranks: {
    xp: number;
    level: number;
    elements: number;
    spending: number;
    pvp: number;
    overall: number;
  };
  
  // Timestamps
  calculatedAt: Date;
  lastUpdated: Date;
}

export interface AchievementProgress {
  _id?: ObjectId;
  address: string;
  achievementId: string;
  progress: number;
  requirement: number;
  isCompleted: boolean;
  completedAt?: Date;
  
  // Achievement metadata
  name: string;
  description: string;
  xpReward: number;
  resourceReward: number;
  achievementType: string;
}

// Utility types for queries
export interface PlayerStats {
  totalPlayers: number;
  activePlayers: number; // checked in last 7 days
  topLevel: number;
  totalXP: number;
  totalElements: number;
  totalTrades: number;
  totalVolume: string; // in wei as string
}

export interface ElementStats {
  totalMinted: number;
  totalBurned: number; // from fusion
  averageLevel: number;
  rarityDistribution: {
    common: number;
    uncommon: number;
    rare: number;
    epic: number;
  };
  typeDistribution: {
    fire: number;
    water: number;
    earth: number;
    air: number;
    light: number;
  };
}

// Event processing types
export interface EventProcessor {
  eventName: string;
  handler: (event: ContractEvent) => Promise<void>;
}

export interface IndexerStatus {
  _id?: ObjectId;
  type: string; // 'main' for primary indexer status
  lastProcessedBlock: number;
  isRunning: boolean;
  lastRunAt: Date;
  errors: string[];
  eventsProcessed: number;
} 