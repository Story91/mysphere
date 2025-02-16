'use client';

import { IdentityCard } from '@coinbase/onchainkit/identity';
import { useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { useState, useEffect } from 'react';
import { calculateRanking, UserRank, RANK_DESCRIPTIONS, BADGES, Badge, BadgeInfo } from '../../utils/ranking';
import { InitialAnimation } from '../Animation/InitialAnimation';

const COINBASE_VERIFIED_ACCOUNT_SCHEMA_ID = '0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9';
const BASESCAN_API_KEY = 'YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN';
const REFRESH_INTERVAL = 30000; // 30 sekund

// Point system explanation
const POINT_SYSTEM = {
  transactions: {
    base: 10,
    successful: 15, // 10 * 1.5
    highValue: 20, // 10 * 2.0
    description: 'Points for each transaction. Bonus for successful and high-value (>1 ETH) transactions.'
  },
  tokens: {
    points: 50,
    description: 'Points for each unique token held in your wallet.'
  },
  nfts: {
    points: 100,
    description: 'Points for each unique NFT in your collection.'
  },
  contracts: {
    points: 25,
    description: 'Points for interacting with unique smart contracts.'
  }
};

// Rank thresholds with descriptions
const RANK_INFO = [
  {
    rank: UserRank.NEWBIE,
    threshold: 0,
    description: 'Starting your journey on Base',
    color: 'text-gray-600 dark:text-gray-400'
  },
  {
    rank: UserRank.EXPLORER,
    threshold: 4_500,
    description: 'Exploring Base possibilities',
    color: 'text-orange-600 dark:text-orange-400'
  },
  {
    rank: UserRank.TRADER,
    threshold: 22_500,
    description: 'Actively trading on Base',
    color: 'text-yellow-600 dark:text-yellow-400'
  },
  {
    rank: UserRank.INVESTOR,
    threshold: 90_000,
    description: 'Long-term investing in Base',
    color: 'text-green-600 dark:text-green-400'
  },
  {
    rank: UserRank.WHALE,
    threshold: 225_000,
    description: 'Significant player on Base',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    rank: UserRank.LEGEND,
    threshold: 450_000,
    description: 'Creating Base history',
    color: 'text-purple-600 dark:text-purple-400'
  }
];

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

export default function IdentityComponent() {
  const { address } = useAccount();
  const [stats, setStats] = useState<RankingStats>({
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
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPointSystem, setShowPointSystem] = useState(false);
  const [showRankSystem, setShowRankSystem] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationData, setAnimationData] = useState<RankingStats | null>(null);

  // Grupowanie odznak według kategorii
  const groupedBadges = {
    transactions: BADGES.filter(badge => badge.name.toString().startsWith('Transaction')),
    tokens: BADGES.filter(badge => badge.name.toString().startsWith('Token')),
    nfts: BADGES.filter(badge => badge.name.toString().startsWith('NFT')),
    contracts: BADGES.filter(badge => badge.name.toString().startsWith('Contract'))
  };

  useEffect(() => {
    async function fetchData() {
      if (!address) return;
      setIsLoading(true);

      try {
        // Fetch data from BaseScan
        const [txResponse, nftResponse, tokenResponse] = await Promise.all([
          fetch(`https://api.basescan.org/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${BASESCAN_API_KEY}`),
          fetch(`https://api.basescan.org/api?module=account&action=tokennfttx&address=${address}&apikey=${BASESCAN_API_KEY}`),
          fetch(`https://api.basescan.org/api?module=account&action=tokentx&address=${address}&apikey=${BASESCAN_API_KEY}`)
        ]);

        const [txData, nftData, tokenData] = await Promise.all([
          txResponse.json(),
          nftResponse.json(),
          tokenResponse.json()
        ]);

        // Calculate ranking
        const rankingStats = calculateRanking(
          txData.status === '1' ? txData.result : [],
          tokenData.status === '1' ? tokenData.result : [],
          nftData.status === '1' ? nftData.result : []
        );

        setStats(rankingStats);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (address) {
      fetchData();
      // Odświeżaj co 5 sekund zamiast 5 minut
      const interval = setInterval(fetchData, REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [address]);

  useEffect(() => {
    const hasSeenAnimation = localStorage.getItem(`sphere-animation-${address}`);
    if (hasSeenAnimation) {
      setShowAnimation(false);
    }
  }, [address]);

  // Function to color the rank
  const getRankColor = (rank: UserRank) => {
    switch (rank) {
      case UserRank.LEGEND:
        return 'text-purple-600 dark:text-purple-400';
      case UserRank.WHALE:
        return 'text-blue-600 dark:text-blue-400';
      case UserRank.INVESTOR:
        return 'text-green-600 dark:text-green-400';
      case UserRank.TRADER:
        return 'text-yellow-600 dark:text-yellow-400';
      case UserRank.EXPLORER:
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Calculate earned badges
  const earnedBadges = BADGES.filter(badge => badge.condition(stats));

  return (
    <>
      {showAnimation && animationData ? (
        <InitialAnimation
          stats={animationData}
          earnedBadges={BADGES.filter(badge => badge.condition(animationData))}
          address={address || ''}
          onComplete={() => {
            setShowAnimation(false);
            setAnimationData(null);
          }}
        />
      ) : (
        <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-2 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <img 
                src="/favicon_io (1)/apple-touch-icon.png" 
                alt="Sphere Logo" 
                className="w-6 h-6"
              />
              <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100">Sphere Identity</h2>
            </div>
          </div>
          
          {!address ? (
            <div className="text-center py-8">
              <div className="text-gray-500 dark:text-gray-400 mb-4">
                Connect wallet to view your profile
              </div>
              <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-4" />
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mx-auto mb-2" />
              <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded mx-auto" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="w-full">
                  <IdentityCard
                    address={address}
                    chain={base}
                    schemaId={COINBASE_VERIFIED_ACCOUNT_SCHEMA_ID}
                  />
                </div>

                {!isLoading && (
                  <button 
                    onClick={() => {
                      setAnimationData(stats);
                      setShowAnimation(true);
                    }}
                    className="relative w-full h-[72px] bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl border border-black/10 dark:border-white/10 text-[#0052FF] font-mono transition-all duration-300 flex flex-col items-center justify-center gap-1 rounded-xl overflow-hidden group"
                  >
                    {/* Efekt podświetlenia przy hover */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF05] via-[#0052FF10] to-[#0052FF05] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    {/* Animowana obwódka */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF20] via-[#0052FF40] to-[#0052FF20] opacity-0 group-hover:opacity-100 animate-pulse" style={{ clipPath: 'inset(0 round 0.75rem)' }} />
                    
                    <div className="relative z-10 flex flex-col items-center">
                      <span className="text-lg font-semibold tracking-wide">[SHOW ANIMATION]</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Click to view your stats animation</span>
                    </div>
                  </button>
                )}
              </div>

              {/* Basic Stats with Improved Visualization */}
              <div className="backdrop-blur-lg bg-black/90 p-6 relative">
                {/* Top Separator Line */}
                <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  {/* Transactions */}
                  <div className="backdrop-blur-lg bg-black/40 p-4 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative group hover:shadow-[0_0_20px_rgba(0,82,255,0.2)] transition-all duration-300">
                    <div className="text-center">
                      <div className="text-3xl font-mono font-bold text-[#0052FF] mb-1 animate-pulse">
                        {isLoading ? '...' : stats.stats.transactions}
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-white mb-1">
                        TRANSACTIONS
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-gray-400">
                        {isLoading ? '...' : `[${stats.breakdown.transactionPoints} PTS]`}
                      </div>
                    </div>
                  </div>

                  {/* Tokens */}
                  <div className="backdrop-blur-lg bg-black/40 p-4 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative group hover:shadow-[0_0_20px_rgba(0,82,255,0.2)] transition-all duration-300">
                    <div className="text-center">
                      <div className="text-3xl font-mono font-bold text-[#0052FF] mb-1 animate-pulse">
                        {isLoading ? '...' : stats.stats.tokens}
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-white mb-1">
                        TOKENS
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-gray-400">
                        {isLoading ? '...' : `[${stats.breakdown.tokenPoints} PTS]`}
                      </div>
                    </div>
                  </div>

                  {/* NFTs */}
                  <div className="backdrop-blur-lg bg-black/40 p-4 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative group hover:shadow-[0_0_20px_rgba(0,82,255,0.2)] transition-all duration-300">
                    <div className="text-center">
                      <div className="text-3xl font-mono font-bold text-[#0052FF] mb-1 animate-pulse">
                        {isLoading ? '...' : stats.stats.nfts}
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-white mb-1">
                        NFTs
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-gray-400">
                        {isLoading ? '...' : `[${stats.breakdown.nftPoints} PTS]`}
                      </div>
                    </div>
                  </div>

                  {/* Contracts */}
                  <div className="backdrop-blur-lg bg-black/40 p-4 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative group hover:shadow-[0_0_20px_rgba(0,82,255,0.2)] transition-all duration-300">
                    <div className="text-center">
                      <div className="text-3xl font-mono font-bold text-[#0052FF] mb-1 animate-pulse">
                        {isLoading ? '...' : stats.stats.contracts}
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-white mb-1">
                        CONTRACTS
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-gray-400">
                        {isLoading ? '...' : `[${stats.breakdown.uniqueContractPoints} PTS]`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Separator Line */}
                <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />
              </div>
              <p className="text-xs text-gray-500 mt-2 w-full" style={{ textAlign: 'justify' }}>
                SPHERE retrieves data from BaseScan API, which monitors your blockchain activity. - 
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent font-bold">Transactions</span>: the total number of transactions sent from your address. | 
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent font-bold">Tokens</span>: the number of token transfers, reflecting your cryptocurrency activity. | 
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent font-bold">NFTs</span>: the number of NFT-related operations. | 
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent font-bold">Contracts</span>: the number of interactions with smart contracts. | 
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent font-bold">Points are awarded based on a predefined algorithm</span> that reflects your network activity.
              </p>

              {/* Rank and Points with Progress Bar */}
              <div className="backdrop-blur-lg bg-black/90 p-6 relative">
                {/* Top Separator Line */}
                <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />

                <div className="backdrop-blur-lg bg-black/40 p-6 shadow-[0_0_15px_rgba(0,82,255,0.1)] border border-[#0052FF]/20">
                  <div className="grid gap-6">
                    {/* Current Rank */}
                    <div className="text-center">
                      <div className="text-3xl font-mono font-bold text-[#0052FF] mb-2">
                        {isLoading ? '...' : `[${stats.rank}]`}
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-white">
                        {RANK_DESCRIPTIONS[stats.rank]}
                      </div>
                    </div>

                    {/* Separator Line */}
                    <div className="h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />

                    {/* Total Points */}
                    <div className="text-center">
                      <div className="text-2xl font-mono font-bold text-[#0052FF]">
                        TOTAL POINTS:
                      </div>
                      <div className="text-4xl font-mono font-bold mt-2">
                        <span className="text-white animate-glow-pulse">
                          {isLoading ? '...' : stats.totalPoints.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Separator Line */}
                    <div className="h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />

                    {/* Progress */}
                    <div className="text-center">
                      <div className="text-3xl font-mono font-bold text-[#0052FF] mb-2">
                        {isLoading ? '...' : `[${stats.percentile}%]`}
                      </div>
                      <div className="text-xs sm:text-sm font-mono text-white mb-2">
                        PROGRESS TO NEXT RANK
                      </div>
                      <div className="mt-2 h-2 bg-black/50 rounded-none border border-[#0052FF]/20 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#0052FF]/50 to-[#0052FF]/30 transition-all duration-500 backdrop-blur-lg"
                          style={{ width: `${stats.percentile}%` }}
                        >
                          <div className="w-full h-full bg-[#0052FF]/20" />
                    </div>
                  </div>
                </div>
              </div>
                </div>

                {/* Bottom Separator Line */}
                <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />
              </div>

              {/* Point System i Rank System obok siebie */}
              <div className="mt-4 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Point System */}
                <div className="bg-black/90 backdrop-blur-lg p-6 relative min-h-[420px]">
                  {/* Top Separator Line */}
                  <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />

                  <div className="backdrop-blur-lg bg-black/40 p-4 shadow-[0_0_15px_rgba(0,82,255,0.1)] border border-[#0052FF]/20">
                    <h3 className="text-xl font-mono font-bold mb-4 text-center text-[#0052FF]">
                      &lt;POINT_SYSTEM/&gt;
                    </h3>
                    
                    <div className="grid gap-3">
                      <div className="relative backdrop-blur-lg bg-black/40 p-3 border border-[#0052FF]/20 flex-1">
                        <div className="relative z-10">
                          <div className="text-lg font-mono font-bold text-blue-600 dark:text-blue-400 mb-1">
                            TRANSACTIONS
                          </div>
                          <div className="text-xs sm:text-sm font-mono text-gray-400">
                            • Base: <span className="text-[#0052FF]">{POINT_SYSTEM.transactions.base} points</span><br />
                            • Successful: <span className="text-[#0052FF]">{POINT_SYSTEM.transactions.successful} points</span><br />
                            • High Value: <span className="text-[#0052FF]">{POINT_SYSTEM.transactions.highValue} points</span>
                            <div className="text-xs sm:text-sm italic mt-1">{POINT_SYSTEM.transactions.description}</div>
                          </div>
                        </div>
                      </div>

                      <div className="relative backdrop-blur-lg bg-black/40 p-3 border border-[#0052FF]/20 flex-1">
                        <div className="relative z-10">
                          <div className="text-lg font-mono font-bold text-green-600 dark:text-green-400 mb-1">
                            TOKENS
                          </div>
                          <div className="text-xs sm:text-sm font-mono text-gray-400">
                            • <span className="text-[#0052FF]">{POINT_SYSTEM.tokens.points} points</span> per unique token
                            <div className="text-xs sm:text-sm italic mt-1">{POINT_SYSTEM.tokens.description}</div>
                          </div>
                        </div>
                      </div>

                      <div className="relative backdrop-blur-lg bg-black/40 p-3 border border-[#0052FF]/20 flex-1">
                        <div className="relative z-10">
                          <div className="text-lg font-mono font-bold text-purple-600 dark:text-purple-400 mb-1">
                            NFTs
                          </div>
                          <div className="text-xs sm:text-sm font-mono text-gray-400">
                            • <span className="text-[#0052FF]">{POINT_SYSTEM.nfts.points} points</span> per unique NFT
                            <div className="text-xs sm:text-sm italic mt-1">{POINT_SYSTEM.nfts.description}</div>
                          </div>
                        </div>
                      </div>

                      <div className="relative backdrop-blur-lg bg-black/40 p-3 border border-[#0052FF]/20 flex-1">
                        <div className="relative z-10">
                          <div className="text-lg font-mono font-bold text-yellow-600 dark:text-yellow-400 mb-1">
                            CONTRACTS
                          </div>
                          <div className="text-xs sm:text-sm font-mono text-gray-400">
                            • <span className="text-[#0052FF]">{POINT_SYSTEM.contracts.points} points</span> per unique contract
                            <div className="text-xs sm:text-sm italic mt-1">{POINT_SYSTEM.contracts.description}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Separator Line */}
                  <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />
                </div>

                {/* Rank System */}
                <div className="bg-black/90 backdrop-blur-lg p-6 relative min-h-[420px]">
                  {/* Top Separator Line */}
                  <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />

                  <div className="backdrop-blur-lg bg-black/40 p-4 shadow-[0_0_15px_rgba(0,82,255,0.1)] border border-[#0052FF]/20">
                    <h3 className="text-xl font-mono font-bold mb-4 text-center text-[#0052FF]">
                      &lt;RANK_SYSTEM/&gt;
                    </h3>
                    
                    <div className="grid gap-3">
                      {RANK_INFO.map((rankInfo, index) => (
                        <div 
                          key={rankInfo.rank}
                          className={`relative backdrop-blur-lg transition-all duration-300 ${
                            stats.rank === rankInfo.rank 
                              ? 'border border-[#0052FF]/50 shadow-[0_0_15px_rgba(0,82,255,0.2)]' 
                              : 'border border-gray-800'
                          }`}
                        >
                          <div className={`absolute inset-0 transition-all duration-300 ${
                            stats.rank === rankInfo.rank ? 'bg-gradient-to-br from-[#0052FF]/10 to-[#0052FF]/5' : 'bg-black/50'
                          }`} />
                          
                          <div className="relative z-10 p-3 flex justify-between items-center">
                            <div>
                              <div className="text-lg sm:text-xl font-mono font-bold text-white">
                                {rankInfo.rank}
                              </div>
                              <div className="text-xs sm:text-sm font-mono text-gray-400">
                                {rankInfo.description}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm sm:text-base font-mono font-bold text-[#0052FF]">
                                {rankInfo.threshold.toLocaleString()} pts
                              </div>
                              {index < RANK_INFO.length - 1 && (
                                <div className="text-xs sm:text-sm font-mono text-gray-500">
                                  Next: {RANK_INFO[index + 1].threshold.toLocaleString()}
                                </div>
                              )}
                            </div>
                            {stats.rank === rankInfo.rank && (
                              <div className="absolute top-1 right-1 text-[#0052FF] text-xs font-mono animate-pulse">
                                [CURRENT]
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Separator Line */}
                  <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />
                </div>
              </div>

              {/* Badges Section */}
              <div className="mt-4 sm:mt-8 space-y-8">
                {/* Total Badges Counter */}
                <div className="backdrop-blur-lg bg-black/90 p-6 relative">
                  <div className="absolute top-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />
                  <div className="backdrop-blur-lg bg-black/40 p-6 shadow-[0_0_15px_rgba(0,82,255,0.2)] border border-[#0052FF]/20">
                    <div className="text-center flex flex-col sm:flex-row items-center justify-center gap-4">
                      <span className="text-2xl font-mono font-bold text-[#0052FF] animate-pulse">
                        [BADGES_EARNED: {earnedBadges.length}/{BADGES.length}]
                      </span>
                      <div className="relative group">
                        <button 
                          className="px-6 py-2 bg-[#0052FF]/10 border border-[#0052FF]/50 text-[#0052FF] font-mono text-sm hover:bg-[#0052FF]/20 transition-all duration-300"
                        >
                          Claim your badges
                      </button>
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs font-mono rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                          SOON
                    </div>
                  </div>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-gradient-to-r from-transparent via-[#0052FF] to-transparent animate-pulse" />
                </div>

                  {/* Transaction Badges */}
                <div className="space-y-4">
                  <h3 className="text-2xl font-mono font-bold text-center text-[#0052FF]">
                      &lt;TRANSACTION_MASTERY/&gt;
                    </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {groupedBadges.transactions.map((badge) => {
                        const isEarned = badge.condition(stats);
                        return (
                          <div
                            key={badge.name}
                            className={`relative group transition-all duration-300 transform hover:scale-[1.02] overflow-hidden badge-glass badge-hover ${
                              isEarned ? 'badge-glow' : ''
                            } ${
                              isEarned ? 'bg-gradient-to-br from-[#0052FF]/10 to-[#0052FF]/5' : 'bg-black/50'
                            } rounded-2xl`}
                          >
                            {/* Efekt szkła */}
                            <div className="absolute inset-0 backdrop-blur-xl bg-white/5 rounded-2xl" />
                            
                            {/* Podświetlenie */}
                            <div className={`absolute inset-0 ${
                              isEarned ? 'bg-[#0052FF]/5' : 'bg-black/50'
                            } transition-colors duration-300 rounded-2xl`} />
                            
                            {/* Border z gradientem */}
                            <div className={`absolute inset-0 border ${
                              isEarned ? 'border-[#0052FF]/30' : 'border-gray-800/30'
                            } transition-colors duration-300 rounded-2xl`} />
                            
                            {/* Efekt glow przy hover */}
                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                              isEarned ? 'badge-pulse' : ''
                            }`} />
                            
                            {/* Zawartość badge'a */}
                            <div className="relative p-4 z-10">
                              <div className={`flex items-center justify-center mb-3 ${
                                isEarned ? 'text-[#0052FF]' : 'text-gray-600'
                              }`}>
                                <i className={`fas fa-${badge.icon} text-3xl ${
                                  isEarned ? 'animate-pulse' : ''
                                }`} />
                              </div>
                              <div className="text-base font-mono font-bold text-center text-white mb-2">
                                {badge.title}
                              </div>
                              <div className="text-xs font-mono text-center text-gray-400 min-h-[40px]">
                                {badge.description}
                              </div>
                              {isEarned && (
                                <div className="absolute top-2 right-2 text-[#0052FF] text-xs font-mono animate-pulse">
                                  [VERIFIED]
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Token Badges */}
                <div className="space-y-4">
                  <h3 className="text-2xl font-mono font-bold text-center text-[#0052FF]">
                      &lt;TOKEN_EMPIRE/&gt;
                    </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {groupedBadges.tokens.map((badge) => {
                        const isEarned = badge.condition(stats);
                        return (
                          <div
                            key={badge.name}
                            className={`relative group transition-all duration-300 transform hover:scale-[1.02] overflow-hidden badge-glass badge-hover ${
                              isEarned ? 'badge-glow' : ''
                            } ${
                              isEarned ? 'bg-gradient-to-br from-[#0052FF]/10 to-[#0052FF]/5' : 'bg-black/50'
                            } rounded-2xl`}
                          >
                            {/* Efekt szkła */}
                            <div className="absolute inset-0 backdrop-blur-xl bg-white/5 rounded-2xl" />
                            
                            {/* Podświetlenie */}
                            <div className={`absolute inset-0 ${
                              isEarned ? 'bg-[#0052FF]/5' : 'bg-black/50'
                            } transition-colors duration-300 rounded-2xl`} />
                            
                            {/* Border z gradientem */}
                            <div className={`absolute inset-0 border ${
                              isEarned ? 'border-[#0052FF]/30' : 'border-gray-800/30'
                            } transition-colors duration-300 rounded-2xl`} />
                            
                            {/* Efekt glow przy hover */}
                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                              isEarned ? 'badge-pulse' : ''
                            }`} />
                            
                            {/* Zawartość badge'a */}
                            <div className="relative p-4 z-10">
                              <div className={`flex items-center justify-center mb-3 ${
                                isEarned ? 'text-[#0052FF]' : 'text-gray-600'
                              }`}>
                                <i className={`fas fa-${badge.icon} text-3xl ${
                                  isEarned ? 'animate-pulse' : ''
                                }`} />
                              </div>
                              <div className="text-base font-mono font-bold text-center text-white mb-2">
                                {badge.title}
                              </div>
                              <div className="text-xs font-mono text-center text-gray-400 min-h-[40px]">
                                {badge.description}
                              </div>
                              {isEarned && (
                                <div className="absolute top-2 right-2 text-[#0052FF] text-xs font-mono animate-pulse">
                                  [VERIFIED]
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* NFT Badges */}
                <div className="space-y-4">
                  <h3 className="text-2xl font-mono font-bold text-center text-[#0052FF]">
                      &lt;NFT_COLLECTION/&gt;
                    </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {groupedBadges.nfts.map((badge) => {
                        const isEarned = badge.condition(stats);
                        return (
                          <div
                            key={badge.name}
                            className={`relative group transition-all duration-300 transform hover:scale-[1.02] overflow-hidden badge-glass badge-hover ${
                              isEarned ? 'badge-glow' : ''
                            } ${
                              isEarned ? 'bg-gradient-to-br from-[#0052FF]/10 to-[#0052FF]/5' : 'bg-black/50'
                            } rounded-2xl`}
                          >
                            {/* Efekt szkła */}
                            <div className="absolute inset-0 backdrop-blur-xl bg-white/5 rounded-2xl" />
                            
                            {/* Podświetlenie */}
                            <div className={`absolute inset-0 ${
                              isEarned ? 'bg-[#0052FF]/5' : 'bg-black/50'
                            } transition-colors duration-300 rounded-2xl`} />
                            
                            {/* Border z gradientem */}
                            <div className={`absolute inset-0 border ${
                              isEarned ? 'border-[#0052FF]/30' : 'border-gray-800/30'
                            } transition-colors duration-300 rounded-2xl`} />
                            
                            {/* Efekt glow przy hover */}
                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                              isEarned ? 'badge-pulse' : ''
                            }`} />
                            
                            {/* Zawartość badge'a */}
                            <div className="relative p-4 z-10">
                              <div className={`flex items-center justify-center mb-3 ${
                                isEarned ? 'text-[#0052FF]' : 'text-gray-600'
                              }`}>
                                <i className={`fas fa-${badge.icon} text-3xl ${
                                  isEarned ? 'animate-pulse' : ''
                                }`} />
                              </div>
                              <div className="text-base font-mono font-bold text-center text-white mb-2">
                                {badge.title}
                              </div>
                              <div className="text-xs font-mono text-center text-gray-400 min-h-[40px]">
                                {badge.description}
                              </div>
                              {isEarned && (
                                <div className="absolute top-2 right-2 text-[#0052FF] text-xs font-mono animate-pulse">
                                  [VERIFIED]
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Contract Badges */}
                <div className="space-y-4">
                  <h3 className="text-2xl font-mono font-bold text-center text-[#0052FF]">
                      &lt;CONTRACT_EXPERTISE/&gt;
                    </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {groupedBadges.contracts.map((badge) => {
                        const isEarned = badge.condition(stats);
                        return (
                          <div
                            key={badge.name}
                            className={`relative group transition-all duration-300 transform hover:scale-[1.02] overflow-hidden badge-glass badge-hover ${
                              isEarned ? 'badge-glow' : ''
                            } ${
                              isEarned ? 'bg-gradient-to-br from-[#0052FF]/10 to-[#0052FF]/5' : 'bg-black/50'
                            } rounded-2xl`}
                          >
                            {/* Efekt szkła */}
                            <div className="absolute inset-0 backdrop-blur-xl bg-white/5 rounded-2xl" />
                            
                            {/* Podświetlenie */}
                            <div className={`absolute inset-0 ${
                              isEarned ? 'bg-[#0052FF]/5' : 'bg-black/50'
                            } transition-colors duration-300 rounded-2xl`} />
                            
                            {/* Border z gradientem */}
                            <div className={`absolute inset-0 border ${
                              isEarned ? 'border-[#0052FF]/30' : 'border-gray-800/30'
                            } transition-colors duration-300 rounded-2xl`} />
                            
                            {/* Efekt glow przy hover */}
                            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
                              isEarned ? 'badge-pulse' : ''
                            }`} />
                            
                            {/* Zawartość badge'a */}
                            <div className="relative p-4 z-10">
                              <div className={`flex items-center justify-center mb-3 ${
                                isEarned ? 'text-[#0052FF]' : 'text-gray-600'
                              }`}>
                                <i className={`fas fa-${badge.icon} text-3xl ${
                                  isEarned ? 'animate-pulse' : ''
                                }`} />
                              </div>
                              <div className="text-base font-mono font-bold text-center text-white mb-2">
                                {badge.title}
                              </div>
                              <div className="text-xs font-mono text-center text-gray-400 min-h-[40px]">
                                {badge.description}
                              </div>
                              {isEarned && (
                                <div className="absolute top-2 right-2 text-[#0052FF] text-xs font-mono animate-pulse">
                                  [VERIFIED]
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* BaseScan Link */}
              <div className="text-center">
                <a
                  href={`https://basescan.org/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                >
                  View details on BaseScan →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
} 