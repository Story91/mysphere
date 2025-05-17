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

function isRankLowerThanCurrent(rankToCheck: UserRank, currentRank: UserRank): boolean {
  const rankOrder = [
    UserRank.NEWBIE,
    UserRank.EXPLORER,
    UserRank.TRADER,
    UserRank.INVESTOR,
    UserRank.WHALE,
    UserRank.LEGEND
  ];
  
  const rankToCheckIndex = rankOrder.indexOf(rankToCheck);
  const currentRankIndex = rankOrder.indexOf(currentRank);
  
  return rankToCheckIndex < currentRankIndex;
}

function calculateProgressToNextRank(stats: RankingStats): number {
  // Znajdź indeks aktualnej rangi
  const currentRankIndex = RANK_INFO.findIndex(rank => rank.rank === stats.rank);
  
  // Jeśli jesteśmy na najwyższej randze, zwróć 100%
  if (currentRankIndex === RANK_INFO.length - 1) {
    return 100;
  }
  
  // Pobierz próg aktualnej rangi i próg następnej rangi
  const currentThreshold = RANK_INFO[currentRankIndex].threshold;
  const nextThreshold = RANK_INFO[currentRankIndex + 1].threshold;
  
  // Oblicz postęp między aktualną rangą a następną
  return calculateProgressBetweenRanks(stats.totalPoints, currentThreshold, nextThreshold);
}

function calculateProgressBetweenRanks(points: number, lowerThreshold: number, upperThreshold: number): number {
  // Oblicz dokładny procent postępu
  const progress = (points - lowerThreshold) / (upperThreshold - lowerThreshold) * 100;
  
  // Upewnij się, że wartość jest między 0 a 100
  return Math.min(100, Math.max(0, progress));
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
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Grupowanie odznak według kategorii
  const groupedBadges = {
    transactions: BADGES.filter(badge => badge.name.toString().startsWith('Transaction')),
    tokens: BADGES.filter(badge => badge.name.toString().startsWith('Token')),
    nfts: BADGES.filter(badge => badge.name.toString().startsWith('NFT')),
    contracts: BADGES.filter(badge => badge.name.toString().startsWith('Contract'))
  };

  // Dodajemy useEffect do obsługi montowania komponentu
  useEffect(() => {
    setIsMounted(true);
  }, []);

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

    if (address && isMounted) {
      fetchData();
      // Odświeżaj co 5 sekund zamiast 5 minut
      const interval = setInterval(fetchData, REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [address, isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    
    const hasSeenAnimation = localStorage.getItem(`sphere-animation-${address}`);
    if (hasSeenAnimation) {
      setShowAnimation(false);
    }
  }, [address, isMounted]);

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

  // Jeśli komponent nie jest zamontowany, zwracamy pusty div
  if (!isMounted) {
    return <div></div>;
  }

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
        <div className="w-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl shadow-2xl p-2 sm:p-6 border border-gray-700/50 backdrop-blur-xl relative overflow-hidden">
          {/* Efekt świetlny w tle */}
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-purple-600/10 rounded-full filter blur-3xl"></div>
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-500/10 rounded-full filter blur-3xl"></div>
          
          {/* Struktura siatki */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(6,24,44,0.05)_0.5px,transparent_0.5px),linear-gradient(90deg,rgba(6,24,44,0.05)_0.5px,transparent_0.5px)] bg-[size:20px_20px] opacity-30"></div>
          
          <div className="flex items-center justify-between gap-2 mb-4 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00A3FF] flex items-center justify-center shadow-lg shadow-[#0052FF]/20">
              <img 
                src="/favicon_io (1)/apple-touch-icon.png" 
                alt="Sphere Logo" 
                className="w-6 h-6"
              />
              </div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Sphere Identity</h2>
            </div>
          </div>
          
          {!address ? (
            <div className="text-center py-10 backdrop-blur-sm bg-black/20 rounded-xl border border-gray-800">
              <div className="text-gray-400 mb-4">
                Connect wallet to view your profile
              </div>
              <div className="w-24 h-24 bg-gradient-to-br from-gray-800 to-gray-700 rounded-full mx-auto mb-4 animate-pulse"></div>
              <div className="h-4 w-32 bg-gradient-to-r from-gray-700 to-gray-800 rounded mx-auto mb-2 animate-pulse"></div>
              <div className="h-3 w-48 bg-gradient-to-r from-gray-800 to-gray-700 rounded mx-auto animate-pulse"></div>
            </div>
          ) : (
            <div className="space-y-6 relative z-10">
              {/* Panel nawigacyjny */}
              <div className="flex flex-wrap gap-2 p-1 bg-gray-800/50 backdrop-blur-md rounded-lg border border-gray-700/50 mb-6">
                <button 
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'overview' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Overview
                </button>
                <button 
                  onClick={() => setActiveTab('badges')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'badges' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Badges
                </button>
                <button 
                  onClick={() => setActiveTab('stats')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'stats' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Statistics
                </button>
                <button 
                  onClick={() => setActiveTab('ranks')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'ranks' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Ranks
                </button>
                <button 
                  onClick={() => setActiveTab('details')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'details' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Details
                </button>
              </div>

              {/* Główna sekcja karty */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Karta tożsamości zawsze widoczna */}
                <div className="w-full bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all shadow-lg">
                  <IdentityCard
                    address={address}
                    chain={base}
                  />
                  
                  {/* Rank display */}
                  <div className="mt-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 backdrop-blur-lg p-4 rounded-xl border border-blue-900/20">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-gray-400 text-xs uppercase tracking-wider">Your rank</h4>
                        <h3 className={`text-xl font-bold ${getRankColor(stats.rank)}`}>{stats.rank}</h3>
                      </div>
                      <div className="text-right">
                        <h4 className="text-gray-400 text-xs uppercase tracking-wider">Points</h4>
                        <h3 className="text-lg font-medium text-blue-400">{stats.totalPoints.toLocaleString()}</h3>
                      </div>
                    </div>

                    <div className="mt-2 w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                        style={{ 
                          width: `${calculateProgressToNextRank(stats)}%`,
                          transition: 'width 1s ease-in-out'
                        }}
                      ></div>
                    </div>
                    <p className="mt-1 text-xs text-gray-400 text-right">{calculateProgressToNextRank(stats).toFixed(1)}% progress to next rank</p>
                  </div>
                </div>
                
                {/* Treść zmieniająca się w zależności od zakładki */}
                <div className="w-full">
                  {/* Kontener z ustaloną minimalną wysokością */}
                  <div className="relative min-h-[450px]">
                    {/* Przegląd */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'overview' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg">
                        <h3 className="text-lg font-medium text-white mb-4">Your Progress</h3>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Transactions</span>
                              <span className="text-white">{stats.stats.transactions}</span>
                            </div>
                            <div className="mt-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" style={{ 
                                width: `${Math.min(100, stats.stats.transactions / 50 * 100)}%` 
                              }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Tokens</span>
                              <span className="text-white">{stats.stats.tokens}</span>
                            </div>
                            <div className="mt-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-green-500 to-teal-500 rounded-full" style={{ width: `${Math.min(100, stats.stats.tokens / 10 * 100)}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">NFTs</span>
                              <span className="text-white">{stats.stats.nfts}</span>
                            </div>
                            <div className="mt-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-pink-500 to-red-500 rounded-full" style={{ width: `${Math.min(100, stats.stats.nfts / 5 * 100)}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Contracts</span>
                              <span className="text-white">{stats.stats.contracts}</span>
                            </div>
                            <div className="mt-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${Math.min(100, stats.stats.contracts / 10 * 100)}%` }}></div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4">
                          <h4 className="text-gray-300 text-sm font-medium mb-2">Recent Badges</h4>
                          <div className="flex flex-wrap gap-2">
                            {earnedBadges.slice(0, 3).map((badge, index) => (
                              <div 
                                key={index}
                                className="bg-gradient-to-r from-gray-800 to-gray-900 p-2 rounded-lg border border-gray-700 flex items-center gap-2 group hover:border-blue-500/50 transition-all"
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-r ${
                                  badge.glowIntensity >= 5 ? 'from-blue-500 to-purple-500' :
                                  badge.glowIntensity >= 3 ? 'from-cyan-500 to-blue-500' :
                                  'from-teal-500 to-cyan-500'
                                }`}>
                                  <span className="text-white text-xs">{badge.glowIntensity}</span>
                                </div>
                                <div>
                                  <p className="text-xs text-white font-medium">{badge.name.toString()}</p>
                                  <p className="text-xs text-gray-400">{badge.title}</p>
                                </div>
                              </div>
                            ))}
                            {earnedBadges.length > 3 && (
                              <button 
                                onClick={() => setActiveTab('badges')}
                                className="px-3 py-2 rounded-lg text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all"
                              >
                                +{earnedBadges.length - 3} more
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Odznaki */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'badges' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg overflow-y-auto">
                        <h3 className="text-lg font-medium text-white mb-4">Your Badges</h3>
                        <div className="space-y-6">
                          {Object.entries(groupedBadges).map(([category, badges]) => (
                            <div key={category} className="space-y-2">
                              <h4 className="text-gray-300 text-sm font-medium capitalize">
                                {category === 'transactions' ? 'Transactions' : 
                                category === 'tokens' ? 'Tokens' : 
                                category === 'nfts' ? 'NFTs' : 'Contracts'}
                              </h4>
                              <div className="grid grid-cols-2 gap-2">
                                {badges.map((badge, index) => {
                                  const earned = badge.condition(stats);
                                  return (
                                    <div 
                                      key={index}
                                      className={`p-3 rounded-lg border ${
                                        earned 
                                          ? 'bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-blue-500/30' 
                                          : 'bg-gray-900/30 border-gray-800/30 opacity-50'
                                      } flex items-center gap-3 group transition-all`}
                                    >
                                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                        earned ? `bg-gradient-to-r ${
                                          badge.glowIntensity >= 5 ? 'from-blue-500 to-purple-500' :
                                          badge.glowIntensity >= 3 ? 'from-cyan-500 to-blue-500' :
                                          'from-teal-500 to-cyan-500'
                                        }` : 'bg-gray-800'
                                      }`}>
                                        <span className="text-white text-sm font-bold">{badge.glowIntensity}</span>
                                      </div>
                                      <div>
                                        <p className={`text-sm ${earned ? 'text-white' : 'text-gray-500'} font-medium`}>{badge.title}</p>
                                        <p className="text-xs text-gray-400">{badge.description}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Statystyki */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'stats' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg overflow-y-auto">
                        <h3 className="text-lg font-medium text-white mb-4">Detailed Statistics</h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                              <p className="text-gray-400 text-xs">Transactions</p>
                              <p className="text-xl font-bold text-white">{stats.stats.transactions}</p>
                              <p className="text-xs text-blue-400">{stats.breakdown.transactionPoints.toLocaleString()} points</p>
                            </div>
                            <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                              <p className="text-gray-400 text-xs">Unique Tokens</p>
                              <p className="text-xl font-bold text-white">{stats.stats.tokens}</p>
                              <p className="text-xs text-blue-400">{stats.breakdown.tokenPoints.toLocaleString()} points</p>
                            </div>
                            <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                              <p className="text-gray-400 text-xs">NFT Collection</p>
                              <p className="text-xl font-bold text-white">{stats.stats.nfts}</p>
                              <p className="text-xs text-blue-400">{stats.breakdown.nftPoints.toLocaleString()} points</p>
                            </div>
                            <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                              <p className="text-gray-400 text-xs">Unique Contracts</p>
                              <p className="text-xl font-bold text-white">{stats.stats.contracts}</p>
                              <p className="text-xs text-blue-400">{stats.breakdown.uniqueContractPoints.toLocaleString()} points</p>
                            </div>
                          </div>
                          
                          <div className="p-4 bg-gradient-to-br from-blue-900/20 to-blue-900/10 rounded-lg border border-blue-900/20">
                            <div className="flex justify-between">
                              <p className="text-gray-300">Total points:</p>
                              <p className="text-xl font-bold text-white">{stats.totalPoints.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Ranks */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'ranks' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg overflow-y-auto">
                        <h3 className="text-lg font-medium text-white mb-4">Rank System</h3>
                        
                        <div className="space-y-3">
                          {RANK_INFO.map((rankInfo, index) => (
                            <div 
                              key={rankInfo.rank}
                              className={`p-3 rounded-lg border transition-all ${
                                stats.rank === rankInfo.rank 
                                  ? 'bg-gradient-to-br from-blue-900/30 to-purple-900/20 border-blue-500/30 shadow-lg' 
                                  : 'bg-gray-900/30 border-gray-800/30'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                    rankInfo.rank === UserRank.NEWBIE ? 'bg-gray-600' :
                                    rankInfo.rank === UserRank.EXPLORER ? 'bg-orange-600' :
                                    rankInfo.rank === UserRank.TRADER ? 'bg-yellow-600' :
                                    rankInfo.rank === UserRank.INVESTOR ? 'bg-green-600' :
                                    rankInfo.rank === UserRank.WHALE ? 'bg-blue-600' :
                                    'bg-purple-600'
                                  }`}>
                                    <span className="text-white text-sm font-bold">{index + 1}</span>
                                  </div>
                                  <div>
                                    <h4 className={`text-lg font-bold ${rankInfo.color}`}>{rankInfo.rank}</h4>
                                    <p className="text-gray-400 text-sm">{rankInfo.description}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-gray-300 text-sm">Required points</p>
                                  <p className="text-white font-bold">{rankInfo.threshold.toLocaleString()}</p>
                                </div>
                                {stats.rank === rankInfo.rank && (
                                  <div className="absolute top-2 right-2">
                                    <div className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">Current</div>
                                  </div>
                                )}
                              </div>
                              
                              {index < RANK_INFO.length - 1 && (
                                <div className="mt-3 pt-2 border-t border-gray-800">
                                  <div className="flex justify-between text-xs text-gray-500">
                                    <span>Your progress</span>
                                    <span>
                                      {stats.rank === rankInfo.rank ? (
                                        <span className="text-blue-400">
                                          {stats.totalPoints.toLocaleString()} / {RANK_INFO[index + 1].threshold.toLocaleString()}
                                        </span>
                                      ) : isRankLowerThanCurrent(rankInfo.rank, stats.rank) ? (
                                        <span className="text-green-400">Completed</span>
                                      ) : (
                                        <span>Not reached yet</span>
                                      )}
                                    </span>
                                  </div>
                                  
                                  {stats.rank === rankInfo.rank && (
                                    <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full ${
                                          rankInfo.rank === UserRank.NEWBIE ? 'bg-gradient-to-r from-gray-500 to-gray-600' :
                                          rankInfo.rank === UserRank.EXPLORER ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                                          rankInfo.rank === UserRank.TRADER ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                                          rankInfo.rank === UserRank.INVESTOR ? 'bg-gradient-to-r from-green-500 to-green-600' :
                                          rankInfo.rank === UserRank.WHALE ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                                          'bg-gradient-to-r from-purple-500 to-purple-600'
                                        }`}
                                        style={{ 
                                          width: `${calculateProgressBetweenRanks(stats.totalPoints, rankInfo.threshold, RANK_INFO[index + 1].threshold)}%` 
                                        }}
                                      ></div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        
                        <div className="mt-6 p-4 bg-gradient-to-br from-blue-900/20 to-purple-900/10 rounded-lg border border-blue-900/20">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-full">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="text-white font-medium">How ranks work</h4>
                              <p className="text-gray-400 text-sm mt-1">
                                Your rank is determined by the total points you've earned through transactions, tokens, NFTs, and contract interactions. 
                                Higher ranks require more points and unlock exclusive features and recognition within the Sphere ecosystem.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Details */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'details' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg overflow-y-auto">
                        <h3 className="text-lg font-medium text-white mb-4">Point System</h3>
                        
                        <div className="space-y-4">
                          <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                            <h4 className="text-blue-400 font-medium">Transactions</h4>
                            <p className="text-gray-300 text-sm mt-1">{POINT_SYSTEM.transactions.description}</p>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                              <div className="p-2 bg-black/20 rounded-lg">
                                <p className="text-gray-400">Basic</p>
                                <p className="text-white font-medium">{POINT_SYSTEM.transactions.base} points</p>
                              </div>
                              <div className="p-2 bg-black/20 rounded-lg">
                                <p className="text-gray-400">Successful</p>
                                <p className="text-white font-medium">{POINT_SYSTEM.transactions.successful} points</p>
                              </div>
                              <div className="p-2 bg-black/20 rounded-lg">
                                <p className="text-gray-400">High Value</p>
                                <p className="text-white font-medium">{POINT_SYSTEM.transactions.highValue} points</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                            <h4 className="text-green-400 font-medium">Tokens</h4>
                            <p className="text-gray-300 text-sm mt-1">{POINT_SYSTEM.tokens.description}</p>
                            <div className="mt-2 text-xs p-2 bg-black/20 rounded-lg inline-block">
                              <p className="text-gray-400">Per token</p>
                              <p className="text-white font-medium">{POINT_SYSTEM.tokens.points} points</p>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                            <h4 className="text-pink-400 font-medium">NFTs</h4>
                            <p className="text-gray-300 text-sm mt-1">{POINT_SYSTEM.nfts.description}</p>
                            <div className="mt-2 text-xs p-2 bg-black/20 rounded-lg inline-block">
                              <p className="text-gray-400">Per NFT</p>
                              <p className="text-white font-medium">{POINT_SYSTEM.nfts.points} points</p>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                            <h4 className="text-amber-400 font-medium">Contracts</h4>
                            <p className="text-gray-300 text-sm mt-1">{POINT_SYSTEM.contracts.description}</p>
                            <div className="mt-2 text-xs p-2 bg-black/20 rounded-lg inline-block">
                              <p className="text-gray-400">Per contract</p>
                              <p className="text-white font-medium">{POINT_SYSTEM.contracts.points} points</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
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