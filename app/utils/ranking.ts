// User ranks
export enum UserRank {
  NEWBIE = 'Newbie',
  EXPLORER = 'Explorer',
  TRADER = 'Trader',
  INVESTOR = 'Investor',
  WHALE = 'Whale',
  LEGEND = 'Legend'
}

// Rank descriptions
export const RANK_DESCRIPTIONS = {
  [UserRank.NEWBIE]: 'Starting your journey on Base',
  [UserRank.EXPLORER]: 'Exploring Base possibilities',
  [UserRank.TRADER]: 'Actively trading on Base',
  [UserRank.INVESTOR]: 'Long-term investing in Base',
  [UserRank.WHALE]: 'Significant player on Base',
  [UserRank.LEGEND]: 'Creating Base history'
};

// Point thresholds for each rank (45x larger)
const RANK_THRESHOLDS = {
  [UserRank.NEWBIE]: 0,
  [UserRank.EXPLORER]: 4_500,      // was 100 * 45
  [UserRank.TRADER]: 22_500,       // was 500 * 45
  [UserRank.INVESTOR]: 90_000,     // was 2000 * 45
  [UserRank.WHALE]: 225_000,       // was 5000 * 45
  [UserRank.LEGEND]: 450_000       // was 10000 * 45
};

// Badge system
export enum Badge {
  // Transaction badges (6 levels)
  TRANSACTIONS_I = 'Transaction Starter',
  TRANSACTIONS_II = 'Transaction Novice',
  TRANSACTIONS_III = 'Transaction Adept',
  TRANSACTIONS_IV = 'Transaction Expert',
  TRANSACTIONS_V = 'Transaction Master',
  TRANSACTIONS_VI = 'Transaction Legend',

  // Token badges (6 levels)
  TOKENS_I = 'Token Starter',
  TOKENS_II = 'Token Novice',
  TOKENS_III = 'Token Adept',
  TOKENS_IV = 'Token Expert',
  TOKENS_V = 'Token Master',
  TOKENS_VI = 'Token Legend',

  // NFT badges (6 levels)
  NFT_I = 'NFT Starter',
  NFT_II = 'NFT Novice',
  NFT_III = 'NFT Adept',
  NFT_IV = 'NFT Expert',
  NFT_V = 'NFT Master',
  NFT_VI = 'NFT Legend',

  // Contract badges (6 levels)
  CONTRACTS_I = 'Contract Starter',
  CONTRACTS_II = 'Contract Novice',
  CONTRACTS_III = 'Contract Adept',
  CONTRACTS_IV = 'Contract Expert',
  CONTRACTS_V = 'Contract Master',
  CONTRACTS_VI = 'Contract Legend'
}

export interface BadgeInfo {
  name: Badge;
  title: string;
  description: string;
  icon: string;
  glowIntensity: number; // 1-6 dla każdego poziomu
  condition: (stats: RankingStats) => boolean;
}

export const BADGES: BadgeInfo[] = [
  // Transaction badges
  {
    name: Badge.TRANSACTIONS_I,
    title: 'Initiate',
    description: 'Complete 40 transactions',
    icon: 'bolt',
    glowIntensity: 1,
    condition: (stats) => stats.stats.transactions >= 40
  },
  {
    name: Badge.TRANSACTIONS_II,
    title: 'Trader',
    description: 'Complete 200 transactions',
    icon: 'bolt',
    glowIntensity: 2,
    condition: (stats) => stats.stats.transactions >= 200
  },
  {
    name: Badge.TRANSACTIONS_III,
    title: 'Merchant',
    description: 'Complete 400 transactions',
    icon: 'bolt',
    glowIntensity: 3,
    condition: (stats) => stats.stats.transactions >= 400
  },
  {
    name: Badge.TRANSACTIONS_IV,
    title: 'Broker',
    description: 'Complete 1000 transactions',
    icon: 'bolt',
    glowIntensity: 4,
    condition: (stats) => stats.stats.transactions >= 1000
  },
  {
    name: Badge.TRANSACTIONS_V,
    title: 'Magnate',
    description: 'Complete 2500 transactions',
    icon: 'bolt',
    glowIntensity: 5,
    condition: (stats) => stats.stats.transactions >= 2500
  },
  {
    name: Badge.TRANSACTIONS_VI,
    title: 'Transaction Oracle',
    description: 'Complete 5000 transactions',
    icon: 'bolt',
    glowIntensity: 6,
    condition: (stats) => stats.stats.transactions >= 5000
  },

  // Token badges
  {
    name: Badge.TOKENS_I,
    title: 'Collector',
    description: 'Hold 1 unique token',
    icon: 'coins',
    glowIntensity: 1,
    condition: (stats) => stats.stats.tokens >= 1
  },
  {
    name: Badge.TOKENS_II,
    title: 'Accumulator',
    description: 'Hold 10 unique tokens',
    icon: 'coins',
    glowIntensity: 2,
    condition: (stats) => stats.stats.tokens >= 10
  },
  {
    name: Badge.TOKENS_III,
    title: 'Treasurer',
    description: 'Hold 25 unique tokens',
    icon: 'coins',
    glowIntensity: 3,
    condition: (stats) => stats.stats.tokens >= 25
  },
  {
    name: Badge.TOKENS_IV,
    title: 'Vault Master',
    description: 'Hold 100 unique tokens',
    icon: 'coins',
    glowIntensity: 4,
    condition: (stats) => stats.stats.tokens >= 100
  },
  {
    name: Badge.TOKENS_V,
    title: 'Token Emperor',
    description: 'Hold 250 unique tokens',
    icon: 'coins',
    glowIntensity: 5,
    condition: (stats) => stats.stats.tokens >= 250
  },
  {
    name: Badge.TOKENS_VI,
    title: 'Token Sovereign',
    description: 'Hold 500 unique tokens',
    icon: 'coins',
    glowIntensity: 6,
    condition: (stats) => stats.stats.tokens >= 500
  },

  // NFT badges
  {
    name: Badge.NFT_I,
    title: 'Collector',
    description: 'Own 1 unique NFT',
    icon: 'image',
    glowIntensity: 1,
    condition: (stats) => stats.stats.nfts >= 1
  },
  {
    name: Badge.NFT_II,
    title: 'Artist',
    description: 'Own 25 unique NFTs',
    icon: 'image',
    glowIntensity: 2,
    condition: (stats) => stats.stats.nfts >= 25
  },
  {
    name: Badge.NFT_III,
    title: 'Curator',
    description: 'Own 100 unique NFTs',
    icon: 'image',
    glowIntensity: 3,
    condition: (stats) => stats.stats.nfts >= 100
  },
  {
    name: Badge.NFT_IV,
    title: 'NFT Virtuoso',
    description: 'Own 500 unique NFTs',
    icon: 'image',
    glowIntensity: 4,
    condition: (stats) => stats.stats.nfts >= 500
  },
  {
    name: Badge.NFT_V,
    title: 'NFT Maestro',
    description: 'Own 1000 unique NFTs',
    icon: 'image',
    glowIntensity: 5,
    condition: (stats) => stats.stats.nfts >= 1000
  },
  {
    name: Badge.NFT_VI,
    title: 'NFT Legend',
    description: 'Own 1500 unique NFTs',
    icon: 'image',
    glowIntensity: 6,
    condition: (stats) => stats.stats.nfts >= 1500
  },

  // Contract badges
  {
    name: Badge.CONTRACTS_I,
    title: 'Explorer',
    description: 'Interact with 1 unique contract',
    icon: 'code',
    glowIntensity: 1,
    condition: (stats) => stats.stats.contracts >= 1
  },
  {
    name: Badge.CONTRACTS_II,
    title: 'Adventurer',
    description: 'Interact with 25 unique contracts',
    icon: 'code',
    glowIntensity: 2,
    condition: (stats) => stats.stats.contracts >= 25
  },
  {
    name: Badge.CONTRACTS_III,
    title: 'Pioneer',
    description: 'Interact with 100 unique contracts',
    icon: 'code',
    glowIntensity: 3,
    condition: (stats) => stats.stats.contracts >= 100
  },
  {
    name: Badge.CONTRACTS_IV,
    title: 'Innovator',
    description: 'Interact with 500 unique contracts',
    icon: 'code',
    glowIntensity: 4,
    condition: (stats) => stats.stats.contracts >= 500
  },
  {
    name: Badge.CONTRACTS_V,
    title: 'Architect',
    description: 'Interact with 1000 unique contracts',
    icon: 'code',
    glowIntensity: 5,
    condition: (stats) => stats.stats.contracts >= 1000
  },
  {
    name: Badge.CONTRACTS_VI,
    title: 'Contract Oracle',
    description: 'Interact with 2000 unique contracts',
    icon: 'code',
    glowIntensity: 6,
    condition: (stats) => stats.stats.contracts >= 2000
  }
];

// Points for different activities
const POINTS = {
  TRANSACTION: 10,
  TOKEN_HOLDING: 50,
  NFT_HOLDING: 100,
  UNIQUE_CONTRACT: 25,
  SUCCESSFUL_TX_MULTIPLIER: 1.5,
  HIGH_VALUE_TX_MULTIPLIER: 2.0
};

interface RankingStats {
  totalPoints: number;
  rank: UserRank;
  percentile: number;
  breakdown: {
    transactionPoints: number;
    tokenPoints: number;
    nftPoints: number;
    uniqueContractPoints: number;
  };
  stats: {
    transactions: number;
    tokens: number;
    nfts: number;
    contracts: number;
  };
}

export function calculateRanking(
  transactions: any[],
  tokens: any[],
  nfts: any[]
): RankingStats {
  // Check if we have data
  if (!Array.isArray(transactions)) transactions = [];
  if (!Array.isArray(tokens)) tokens = [];
  if (!Array.isArray(nfts)) nfts = [];

  try {
    // Calculate points for transactions
    const txCount = transactions.length;
    const successfulTx = transactions.filter(tx => tx.isError === '0').length;
    const highValueTx = transactions.filter(tx => {
      try {
        return parseFloat(tx.value) > 1000000000000000000; // > 1 ETH
      } catch {
        return false;
      }
    }).length;

    const transactionPoints = Math.floor(
      txCount * POINTS.TRANSACTION +
      successfulTx * POINTS.TRANSACTION * (POINTS.SUCCESSFUL_TX_MULTIPLIER - 1) +
      highValueTx * POINTS.TRANSACTION * (POINTS.HIGH_VALUE_TX_MULTIPLIER - 1)
    );

    // Points for tokens (unique contract addresses only)
    const uniqueTokens = new Set(
      tokens
        .filter(tx => tx && tx.contractAddress)
        .map(tx => tx.contractAddress.toLowerCase())
    ).size;
    const tokenPoints = uniqueTokens * POINTS.TOKEN_HOLDING;

    // Points for NFTs (unique tokens only)
    const uniqueNFTs = new Set(
      nfts
        .filter(tx => tx && tx.contractAddress && tx.tokenID)
        .map(tx => `${tx.contractAddress.toLowerCase()}-${tx.tokenID}`)
    ).size;
    const nftPoints = uniqueNFTs * POINTS.NFT_HOLDING;

    // Points for unique contracts
    const uniqueContracts = new Set(
      transactions
        .filter(tx => tx && tx.to)
        .map(tx => tx.to.toLowerCase())
    ).size;
    const uniqueContractPoints = uniqueContracts * POINTS.UNIQUE_CONTRACT;

    // Total points (rounded to 2 decimal places)
    const totalPoints = Math.round(
      (transactionPoints + tokenPoints + nftPoints + uniqueContractPoints) * 100
    ) / 100;

    // Determine rank
    let rank = UserRank.NEWBIE;
    for (const [rankName, threshold] of Object.entries(RANK_THRESHOLDS)) {
      if (totalPoints >= threshold) {
        rank = rankName as UserRank;
      } else {
        break;
      }
    }

    // Calculate percentage to next rank
    const currentThreshold = RANK_THRESHOLDS[rank];
    const nextRank = Object.entries(RANK_THRESHOLDS).find(
      ([_, threshold]) => threshold > totalPoints
    );
    const percentile = nextRank
      ? Math.min(
          Math.round(
            ((totalPoints - currentThreshold) /
              (nextRank[1] - currentThreshold)) *
              10000
          ) / 100,
          99.99
        )
      : 100;

    return {
      totalPoints,
      rank,
      percentile,
      breakdown: {
        transactionPoints: Math.round(transactionPoints * 100) / 100,
        tokenPoints: Math.round(tokenPoints * 100) / 100,
        nftPoints: Math.round(nftPoints * 100) / 100,
        uniqueContractPoints: Math.round(uniqueContractPoints * 100) / 100
      },
      stats: {
        transactions: txCount,
        tokens: uniqueTokens,
        nfts: uniqueNFTs,
        contracts: uniqueContracts
      }
    };
  } catch (error) {
    console.error('Error calculating ranking:', error);
    return {
      totalPoints: 0,
      rank: UserRank.NEWBIE,
      percentile: 0,
      breakdown: {
        transactionPoints: 0,
        tokenPoints: 0,
        nftPoints: 0,
        uniqueContractPoints: 0
      },
      stats: {
        transactions: 0,
        tokens: 0,
        nfts: 0,
        contracts: 0
      }
    };
  }
} 