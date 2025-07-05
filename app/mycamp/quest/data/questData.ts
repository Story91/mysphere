import { Quest, QuestDay, Badge, QuestReward } from '../types/quest';

export const EPIC_BADGES: Badge[] = [
  {
    id: 'genesis_explorer',
    name: 'Genesis Explorer',
    description: 'First to enter the Camp Network multiverse',
    icon: '🌌',
    rarity: 'legendary',
    gradient: 'from-purple-600 via-blue-600 to-cyan-400',
  },
  {
    id: 'social_architect',
    name: 'Social Architect',
    description: 'Master of all social platforms',
    icon: '🏗️',
    rarity: 'epic',
    gradient: 'from-orange-500 via-red-500 to-pink-500',
  },
  {
    id: 'content_creator',
    name: 'Content Creator',
    description: 'Legendary content creator in the metaverse',
    icon: '🎨',
    rarity: 'epic',
    gradient: 'from-green-400 via-blue-500 to-purple-600',
  },
  {
    id: 'network_guardian',
    name: 'Network Guardian',
    description: 'Protector of the Camp Network',
    icon: '🛡️',
    rarity: 'legendary',
    gradient: 'from-yellow-400 via-orange-500 to-red-600',
  },
  {
    id: 'dimension_walker',
    name: 'Dimension Walker',
    description: 'Traveler between digital dimensions',
    icon: '🌀',
    rarity: 'legendary',
    gradient: 'from-indigo-500 via-purple-600 to-pink-500',
  }
];

export const LEGENDARY_REWARDS: QuestReward[] = [
  {
    type: 'nft',
    nftContract: '0x1234...CampGenesis',
    title: 'Camp Genesis NFT',
    description: 'Ultra-rare 3D animated Camp Network Genesis collection',
    icon: '💎',
    rarity: 'legendary'
  },
  {
    type: 'nft',
    nftContract: '0x5678...CampHero',
    title: 'Camp Hero Avatar',
    description: '3D avatar NFT with special powers in the metaverse',
    icon: '🦸',
    rarity: 'epic'
  },
  {
    type: 'tokens',
    amount: 10000,
    title: 'CAMP Token Treasure',
    description: '10,000 CAMP tokens for completing the epic journey',
    icon: '💰',
    rarity: 'epic'
  }
];

export const SEVEN_DAY_JOURNEY: QuestDay[] = [
  {
    day: 1,
    title: 'Genesis Awakening',
    theme: 'Digital Birth',
    description: 'Welcome to the Camp Network metaverse. Your journey begins now.',
    unlocked: true,
    specialReward: {
      type: 'badge',
      badgeId: 'genesis_explorer',
      title: 'Genesis Explorer Badge',
      description: 'You are one of the first explorers',
      icon: '🌌',
      rarity: 'legendary'
    },
    quests: [
      {
        id: 'day1_connect_wallet',
        title: 'Connect Your Digital Soul',
        description: 'Link your wallet to begin your transformation into a digital being',
        shortDescription: 'Connect wallet to Camp Network',
        type: 'network_activity',
        category: 'daily',
        difficulty: 'easy',
        day: 1,
        xpReward: 500,
        tokenReward: 100,
        estimatedTime: '2 min',
        icon: '🔗',
        gradient: 'from-cyan-400 to-blue-600',
        featured: true,
        status: 'available',
        requirements: [{
          id: 'wallet_connect',
          type: 'visit_page',
          target: 1,
          current: 0,
          description: 'Connect your wallet to Camp Network'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      },
      {
        id: 'day1_twitter_connect',
        title: 'Social Dimension Portal',
        description: 'Open the first portal to the social multiverse by connecting Twitter',
        shortDescription: 'Connect Twitter account',
        type: 'social_connect',
        category: 'social',
        difficulty: 'easy',
        day: 1,
        xpReward: 750,
        tokenReward: 150,
        estimatedTime: '3 min',
        icon: '🐦',
        gradient: 'from-blue-400 to-cyan-600',
        status: 'available',
        requirements: [{
          id: 'twitter_connect',
          type: 'social_connect',
          target: 1,
          current: 0,
          description: 'Connect your Twitter account',
          socialPlatform: 'twitter'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      },
      {
        id: 'day1_first_tweet',
        title: 'First Echo in the Void',
        description: 'Send your first message across the digital dimensions',
        shortDescription: 'Post about joining Camp Network',
        type: 'social_post',
        category: 'social',
        difficulty: 'medium',
        day: 1,
        xpReward: 1000,
        tokenReward: 200,
        estimatedTime: '5 min',
        icon: '📢',
        gradient: 'from-purple-400 to-pink-600',
        status: 'locked',
        unlockConditions: [{ socialConnected: 'twitter' }],
        requirements: [{
          id: 'first_tweet',
          type: 'post_tweet',
          target: 1,
          current: 0,
          description: 'Tweet about joining Camp Network with #CampNetworkGenesis'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      }
    ]
  },
  {
    day: 2,
    title: 'Social Expansion',
    theme: 'Multi-Platform Mastery',
    description: 'Expand your influence across multiple social dimensions',
    unlocked: false,
    specialReward: {
      type: 'nft',
      nftContract: '0x2222...SocialMaster',
      title: 'Social Master NFT',
      description: '3D social media orb NFT',
      icon: '🌐',
      rarity: 'epic'
    },
    quests: [
      {
        id: 'day2_spotify_connect',
        title: 'Harmonic Resonance',
        description: 'Connect to the musical dimension through Spotify',
        shortDescription: 'Connect Spotify account',
        type: 'social_connect',
        category: 'social',
        difficulty: 'easy',
        day: 2,
        xpReward: 750,
        tokenReward: 150,
        estimatedTime: '3 min',
        icon: '🎵',
        gradient: 'from-green-400 to-emerald-600',
        status: 'locked',
        unlockConditions: [{ dayRequired: 1 }],
        requirements: [{
          id: 'spotify_connect',
          type: 'social_connect',
          target: 1,
          current: 0,
          description: 'Connect your Spotify account',
          socialPlatform: 'spotify'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      },
      {
        id: 'day2_tiktok_connect',
        title: 'Viral Vortex',
        description: 'Enter the fast-paced dimension of viral content',
        shortDescription: 'Connect TikTok account',
        type: 'social_connect',
        category: 'social',
        difficulty: 'easy',
        day: 2,
        xpReward: 750,
        tokenReward: 150,
        estimatedTime: '3 min',
        icon: '🎬',
        gradient: 'from-pink-400 to-rose-600',
        status: 'locked',
        unlockConditions: [{ dayRequired: 1 }],
        requirements: [{
          id: 'tiktok_connect',
          type: 'social_connect',
          target: 1,
          current: 0,
          description: 'Connect your TikTok account',
          socialPlatform: 'tiktok'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      },
      {
        id: 'day2_engage_storm',
        title: 'Engagement Storm',
        description: 'Create a whirlwind of engagement across all platforms',
        shortDescription: 'Like and share 10 Camp Network posts',
        type: 'social_engage',
        category: 'social',
        difficulty: 'medium',
        day: 2,
        xpReward: 1250,
        tokenReward: 250,
        estimatedTime: '15 min',
        icon: '⚡',
        gradient: 'from-yellow-400 to-orange-600',
        status: 'locked',
        unlockConditions: [{ socialConnected: 'twitter' }],
        requirements: [{
          id: 'engage_posts',
          type: 'like_post',
          target: 10,
          current: 0,
          description: 'Like 10 Camp Network related posts'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 10
        }
      }
    ]
  },
  {
    day: 3,
    title: 'Content Creation',
    theme: 'Digital Artistry',
    description: 'Become a creator in the digital multiverse',
    unlocked: false,
    specialReward: {
      type: 'badge',
      badgeId: 'content_creator',
      title: 'Content Creator Badge',
      description: 'Master of digital creation',
      icon: '🎨',
      rarity: 'epic'
    },
    quests: [
      {
        id: 'day3_viral_content',
        title: 'Viral Genesis',
        description: 'Create content that resonates across dimensions',
        shortDescription: 'Create viral Camp Network content',
        type: 'creative',
        category: 'creative',
        difficulty: 'hard',
        day: 3,
        xpReward: 2000,
        tokenReward: 400,
        estimatedTime: '30 min',
        icon: '🔥',
        gradient: 'from-red-500 to-yellow-500',
        status: 'locked',
        unlockConditions: [{ dayRequired: 2 }],
        requirements: [{
          id: 'viral_content',
          type: 'post_tweet',
          target: 1,
          current: 0,
          description: 'Create original content about Camp Network that gets 50+ likes'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      },
      {
        id: 'day3_pin_masterpiece',
        title: 'Immortalize Your Vision',
        description: 'Pin your greatest creation to your profile',
        shortDescription: 'Pin your best Camp Network post',
        type: 'social_engage',
        category: 'social',
        difficulty: 'medium',
        day: 3,
        xpReward: 1500,
        tokenReward: 300,
        estimatedTime: '2 min',
        icon: '📌',
        gradient: 'from-indigo-500 to-purple-600',
        status: 'locked',
        unlockConditions: [{ questId: 'day3_viral_content' }],
        requirements: [{
          id: 'pin_post',
          type: 'pin_post',
          target: 1,
          current: 0,
          description: 'Pin your Camp Network post to your profile'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      }
    ]
  },
  {
    day: 4,
    title: 'Network Integration',
    theme: 'On-Chain Mastery',
    description: 'Master the blockchain dimension of Camp Network',
    unlocked: false,
    specialReward: {
      type: 'nft',
      nftContract: '0x4444...ChainMaster',
      title: 'Chain Master NFT',
      description: '3D blockchain cube NFT with special animations',
      icon: '⛓️',
      rarity: 'epic'
    },
    quests: [
      {
        id: 'day4_first_transaction',
        title: 'Digital Alchemy',
        description: 'Perform your first transaction on Camp Network',
        shortDescription: 'Make first on-chain transaction',
        type: 'network_activity',
        category: 'network',
        difficulty: 'medium',
        day: 4,
        xpReward: 1750,
        tokenReward: 350,
        estimatedTime: '10 min',
        icon: '💫',
        gradient: 'from-cyan-400 to-blue-600',
        status: 'locked',
        unlockConditions: [{ dayRequired: 3 }],
        requirements: [{
          id: 'first_tx',
          type: 'transaction',
          target: 1,
          current: 0,
          description: 'Complete your first transaction on Camp Network'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      },
      {
        id: 'day4_hold_tokens',
        title: 'Digital Treasure Keeper',
        description: 'Accumulate and hold CAMP tokens',
        shortDescription: 'Hold 1000+ CAMP tokens',
        type: 'network_activity',
        category: 'network',
        difficulty: 'hard',
        day: 4,
        xpReward: 2500,
        tokenReward: 500,
        estimatedTime: '15 min',
        icon: '💎',
        gradient: 'from-emerald-400 to-green-600',
        status: 'locked',
        unlockConditions: [{ questId: 'day4_first_transaction' }],
        requirements: [{
          id: 'hold_tokens',
          type: 'hold_token',
          target: 1000,
          current: 0,
          description: 'Hold at least 1000 CAMP tokens in your wallet'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1000
        }
      }
    ]
  },
  {
    day: 5,
    title: 'Community Building',
    theme: 'Social Architecture',
    description: 'Build and lead communities in the metaverse',
    unlocked: false,
    specialReward: {
      type: 'badge',
      badgeId: 'social_architect',
      title: 'Social Architect Badge',
      description: 'Master community builder',
      icon: '🏗️',
      rarity: 'epic'
    },
    quests: [
      {
        id: 'day5_invite_friends',
        title: 'Dimensional Recruitment',
        description: 'Invite friends to join your journey',
        shortDescription: 'Invite 5 friends to Camp Network',
        type: 'community',
        category: 'community',
        difficulty: 'hard',
        day: 5,
        xpReward: 3000,
        tokenReward: 600,
        estimatedTime: '20 min',
        icon: '👥',
        gradient: 'from-purple-500 to-pink-600',
        status: 'locked',
        unlockConditions: [{ dayRequired: 4 }],
        requirements: [{
          id: 'invite_friends',
          type: 'share_content',
          target: 5,
          current: 0,
          description: 'Successfully invite 5 friends to join Camp Network'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 5
        }
      },
      {
        id: 'day5_comment_warrior',
        title: 'Voice of the Community',
        description: 'Engage meaningfully with community content',
        shortDescription: 'Leave 20 meaningful comments',
        type: 'social_engage',
        category: 'community',
        difficulty: 'medium',
        day: 5,
        xpReward: 2000,
        tokenReward: 400,
        estimatedTime: '25 min',
        icon: '💬',
        gradient: 'from-blue-500 to-cyan-600',
        status: 'locked',
        unlockConditions: [{ dayRequired: 4 }],
        requirements: [{
          id: 'meaningful_comments',
          type: 'comment',
          target: 20,
          current: 0,
          description: 'Leave 20 meaningful comments on Camp Network content'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 20
        }
      }
    ]
  },
  {
    day: 6,
    title: 'NFT Mastery',
    theme: 'Digital Ownership',
    description: 'Master the art of digital ownership and creation',
    unlocked: false,
    specialReward: {
      type: 'nft',
      nftContract: '0x6666...NFTMaster',
      title: 'NFT Master Crystal',
      description: 'Legendary 3D crystal NFT that evolves',
      icon: '💎',
      rarity: 'legendary'
    },
    quests: [
      {
        id: 'day6_mint_genesis',
        title: 'Digital Genesis',
        description: 'Mint your first Camp Network NFT',
        shortDescription: 'Mint your Genesis NFT',
        type: 'achievement',
        category: 'achievement',
        difficulty: 'legendary',
        day: 6,
        xpReward: 5000,
        tokenReward: 1000,
        estimatedTime: '15 min',
        icon: '🎭',
        gradient: 'from-purple-600 to-indigo-800',
        status: 'locked',
        unlockConditions: [{ dayRequired: 5 }],
        requirements: [{
          id: 'mint_nft',
          type: 'nft_mint',
          target: 1,
          current: 0,
          description: 'Mint your unique Camp Network Genesis NFT'
        }],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 1
        }
      }
    ]
  },
  {
    day: 7,
    title: 'Legendary Ascension',
    theme: 'Ultimate Transformation',
    description: 'Achieve legendary status in the Camp Network multiverse',
    unlocked: false,
    specialReward: {
      type: 'nft',
      nftContract: '0x7777...LegendaryHero',
      title: 'Legendary Hero NFT',
      description: 'Ultra-rare animated hero avatar with special powers',
      icon: '👑',
      rarity: 'legendary'
    },
    quests: [
      {
        id: 'day7_ultimate_achievement',
        title: 'Dimensional Transcendence',
        description: 'Complete the ultimate challenge and transcend to legendary status',
        shortDescription: 'Achieve legendary status',
        type: 'special_event',
        category: 'achievement',
        difficulty: 'legendary',
        day: 7,
        xpReward: 10000,
        tokenReward: 2000,
        badgeReward: 'dimension_walker',
        estimatedTime: '30 min',
        icon: '🌟',
        gradient: 'from-yellow-400 via-orange-500 to-red-600',
        featured: true,
        status: 'locked',
        unlockConditions: [{ dayRequired: 6 }],
        requirements: [
          {
            id: 'complete_all_previous',
            type: 'complete_profile',
            target: 6,
            current: 0,
            description: 'Complete all previous day challenges'
          },
          {
            id: 'earn_50k_xp',
            type: 'complete_profile',
            target: 50000,
            current: 0,
            description: 'Earn a total of 50,000 XP'
          }
        ],
        progress: {
          completed: false,
          percentage: 0,
          currentStep: 0,
          totalSteps: 2
        }
      }
    ]
  }
];

export const QUEST_THEMES = {
  day1: {
    bgGradient: 'from-indigo-900 via-purple-900 to-pink-900',
    accentColor: 'cyan',
    particles: 'cosmic'
  },
  day2: {
    bgGradient: 'from-blue-900 via-cyan-900 to-teal-900',
    accentColor: 'blue',
    particles: 'social'
  },
  day3: {
    bgGradient: 'from-purple-900 via-pink-900 to-red-900',
    accentColor: 'pink',
    particles: 'creative'
  },
  day4: {
    bgGradient: 'from-green-900 via-emerald-900 to-cyan-900',
    accentColor: 'emerald',
    particles: 'blockchain'
  },
  day5: {
    bgGradient: 'from-orange-900 via-red-900 to-pink-900',
    accentColor: 'orange',
    particles: 'community'
  },
  day6: {
    bgGradient: 'from-violet-900 via-purple-900 to-indigo-900',
    accentColor: 'violet',
    particles: 'nft'
  },
  day7: {
    bgGradient: 'from-yellow-900 via-orange-900 to-red-900',
    accentColor: 'yellow',
    particles: 'legendary'
  }
}; 