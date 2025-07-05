// Advanced Quest System Types for Camp Network 3D Experience
export interface Quest {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  type: 'social_connect' | 'social_post' | 'social_engage' | 'network_activity' | 'creative' | 'community' | 'achievement' | 'special_event';
  category: 'daily' | 'weekly' | 'special' | 'achievement' | 'social' | 'network' | 'creative' | 'community';
  difficulty: 'easy' | 'medium' | 'hard' | 'legendary';
  day: number;
  xpReward: number;
  tokenReward: number;
  badgeReward?: string;
  estimatedTime: string;
  icon: string;
  gradient: string;
  featured?: boolean;
  status: 'locked' | 'available' | 'in_progress' | 'completed' | 'failed';
  unlockConditions?: Array<{
    dayRequired?: number;
    questId?: string;
    socialConnected?: string;
    level?: number;
    xp?: number;
  }>;
  requirements: QuestRequirement[];
  progress: QuestProgress;
  deadline?: Date;
  multiplier?: number;
  isChallenge?: boolean;
  teamQuest?: boolean;
  maxParticipants?: number;
  currentParticipants?: number;
}

export interface QuestRequirement {
  id: string;
  type: 'social_connect' | 'visit_page' | 'post_tweet' | 'like_post' | 'pin_post' | 'comment' | 'share_content' | 'transaction' | 'hold_token' | 'nft_mint' | 'complete_profile';
  target: number;
  current: number;
  description: string;
  socialPlatform?: 'twitter' | 'spotify' | 'tiktok' | 'discord' | 'telegram';
  verified?: boolean;
  metadata?: Record<string, any>;
}

export interface QuestProgress {
  completed: boolean;
  percentage: number;
  currentStep: number;
  totalSteps: number;
  startedAt?: Date;
  completedAt?: Date;
  timeSpent?: number;
}

export interface QuestDay {
  day: number;
  title: string;
  theme: string;
  description: string;
  unlocked: boolean;
  specialReward?: QuestReward;
  quests: Quest[];
  bgGradient?: string;
  accentColor?: string;
  particles?: string;
  unlockedAt?: Date;
  completedAt?: Date;
  totalXP?: number;
  totalTokens?: number;
  isWeekend?: boolean;
  bonusMultiplier?: number;
}

export interface QuestReward {
  type: 'nft' | 'badge' | 'tokens' | 'xp' | 'title' | 'special';
  nftContract?: string;
  badgeId?: string;
  title: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  amount?: number;
  tokenType?: string;
  claimed?: boolean;
  claimableAt?: Date;
  specialEffect?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  gradient: string;
  earnedAt?: Date;
  progress?: number;
  totalRequired?: number;
  isAnimated?: boolean;
  effect3D?: string;
}

export interface UserProgress {
  currentDay: number;
  currentLevel: number;
  totalXP: number;
  totalTokens: number;
  questsCompleted: number;
  streakDays: number;
  badges: Badge[];
  completedQuests: string[];
  inProgressQuests: string[];
  achievements: Achievement[];
  socialConnections: SocialConnection[];
  nftsOwned: NFTOwned[];
  rank: number;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legendary';
  joinedAt: Date;
  lastActiveAt: Date;
  preferences: UserPreferences;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  unlockedAt: Date;
  category: string;
  points: number;
  isSecret?: boolean;
  requirements: string[];
}

export interface SocialConnection {
  platform: 'twitter' | 'spotify' | 'tiktok' | 'discord' | 'telegram';
  username: string;
  verified: boolean;
  connectedAt: Date;
  followerCount?: number;
  engagementRate?: number;
  lastSyncAt?: Date;
}

export interface NFTOwned {
  contractAddress: string;
  tokenId: string;
  name: string;
  description: string;
  image: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  attributes: NFTAttribute[];
  mintedAt: Date;
  is3D?: boolean;
  animationUrl?: string;
}

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
  rarity?: number;
}

export interface UserPreferences {
  notifications: {
    questReminders: boolean;
    dailyRewards: boolean;
    socialUpdates: boolean;
    nftDrops: boolean;
  };
  privacy: {
    showProgress: boolean;
    showBadges: boolean;
    allowInvites: boolean;
  };
  display: {
    theme: 'dark' | 'light' | 'auto';
    animations: boolean;
    effects3D: boolean;
    particles: boolean;
  };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string;
  totalXP: number;
  questsCompleted: number;
  badges: Badge[];
  tier: string;
  isCurrentUser?: boolean;
  change?: number; // rank change from last week
}

export interface QuestStats {
  totalQuests: number;
  completedQuests: number;
  completionRate: number;
  averageCompletionTime: number;
  totalXPEarned: number;
  totalTokensEarned: number;
  streakDays: number;
  bestStreak: number;
  favoriteCategory: string;
  timeSpent: number;
  lastCompleted?: Date;
}

export interface QuestNotification {
  id: string;
  type: 'quest_available' | 'quest_completed' | 'reward_earned' | 'milestone_reached' | 'streak_bonus';
  title: string;
  message: string;
  icon: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  data?: Record<string, any>;
}

export interface QuestSession {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  questsAttempted: string[];
  questsCompleted: string[];
  xpEarned: number;
  tokensEarned: number;
  timeSpent: number;
  achievements: string[];
  socialInteractions: number;
}

// 3D Quest System Types
export interface Quest3D {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  model: string;
  animations: string[];
  effects: Effect3D[];
  interactions: Interaction3D[];
  isVisible: boolean;
  isInteractable: boolean;
}

export interface Effect3D {
  type: 'particles' | 'glow' | 'trail' | 'explosion' | 'portal' | 'magic';
  intensity: number;
  color: string;
  duration: number;
  loop: boolean;
  trigger: 'hover' | 'click' | 'complete' | 'unlock';
}

export interface Interaction3D {
  type: 'hover' | 'click' | 'proximity' | 'gaze';
  action: 'highlight' | 'animate' | 'popup' | 'navigate' | 'complete';
  parameters: Record<string, any>;
  cooldown?: number;
}

export interface QuestWorld {
  id: string;
  name: string;
  description: string;
  environment: '3d_space' | '2d_overlay' | 'mixed_reality';
  theme: string;
  skybox: string;
  ambientLight: string;
  objects: WorldObject[];
  physics: boolean;
  weather?: WeatherEffect;
  music?: string;
  sounds?: string[];
}

export interface WorldObject {
  id: string;
  type: 'quest_portal' | 'nft_display' | 'badge_shrine' | 'leaderboard' | 'social_hub' | 'shop';
  position: { x: number; y: number; z: number };
  model: string;
  interactive: boolean;
  questId?: string;
  metadata?: Record<string, any>;
}

export interface WeatherEffect {
  type: 'rain' | 'snow' | 'particles' | 'fog' | 'lightning' | 'aurora';
  intensity: number;
  color?: string;
  speed?: number;
  direction?: { x: number; y: number; z: number };
} 