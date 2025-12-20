'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { IdentityCard } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import BaseCard, { BaseCardContent, BaseCardHeader, BaseStatsCard } from './BaseCard';
import BaseButton from './BaseButton';
import BaseBadge, { RankBadge } from './BaseBadge';
import { BADGES, UserRank, RankingStats } from '../../utils/ranking';
import { 
  getBalance, 
  getTransactionCount, 
  getTokenTransfers, 
  getNFTTransfers, 
  getERC1155Transfers,
  getTransactions,
  formatEthBalance,
  countUniqueTokens,
  countUniqueNFTs,
  countUniqueContracts,
  WalletStats,
  TokenInfo,
  NFTInfo,
  TransactionInfo
} from '../utils/cdpApi';
import { fetchBuilderScore, TalentScore } from '../utils/talentApi';
import { fetchSpherePoints, SpherePoints } from '../utils/spherePoints';

// Cache configuration
const CACHE_KEY_PREFIX = 'baseIdentity_hybrid_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface DataStatus {
  loaded: boolean;
  error: string | null;
  timestamp: number | null;
}

export default function BaseIdentity() {
  const { address, isConnected } = useAccount();
  
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

  const [walletData, setWalletData] = useState<WalletStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'badges' | 'stats' | 'details'>('overview');
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Builder Score and Sphere Points
  const [builderScore, setBuilderScore] = useState<TalentScore | null>(null);
  const [spherePoints, setSpherePoints] = useState<SpherePoints | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(false);

  const [dataStatus, setDataStatus] = useState<Record<string, DataStatus>>({
    eth: { loaded: false, error: null, timestamp: null },
    tokens: { loaded: false, error: null, timestamp: null },
    nfts: { loaded: false, error: null, timestamp: null },
    transactions: { loaded: false, error: null, timestamp: null }
  });

  const [isMounted, setIsMounted] = useState(false);
  const hasInitialized = useRef(false);
  const globalStopFlag = useRef(false);

  useEffect(() => {
    setIsMounted(true);
    return () => {
      globalStopFlag.current = true;
    };
  }, []);

  // Cache functions
  const getCacheKey = (addr: string) => `${CACHE_KEY_PREFIX}${addr}`;

  const loadFromCache = useCallback((addr: string): WalletStats | null => {
    try {
      const cached = localStorage.getItem(getCacheKey(addr));
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          // Restore BigInt for ethBalance
          data.ethBalance = BigInt(data.ethBalance);
          return data;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }, []);

  const saveToCache = useCallback((addr: string, data: WalletStats) => {
    try {
      // Convert BigInt to string for JSON serialization
      const serializable = {
        ...data,
        ethBalance: data.ethBalance.toString()
      };
      localStorage.setItem(getCacheKey(addr), JSON.stringify({
        data: serializable,
        timestamp: Date.now()
      }));
    } catch (error) {
      // Cache save failed, continue without caching
    }
  }, []);

  // Calculate ranking from wallet stats
  const calculateRankingFromStats = useCallback((walletStats: WalletStats): RankingStats => {
    const transactionPoints = walletStats.transactionCount * 10;
    const tokenPoints = walletStats.tokenCount * 50;
    const nftPoints = walletStats.nftCount * 100;
    const contractPoints = walletStats.contractInteractionCount * 25;
    const totalPoints = transactionPoints + tokenPoints + nftPoints + contractPoints;

    let rank = UserRank.NEWBIE;
    if (totalPoints >= 450_000) rank = UserRank.LEGEND;
    else if (totalPoints >= 225_000) rank = UserRank.WHALE;
    else if (totalPoints >= 90_000) rank = UserRank.INVESTOR;
    else if (totalPoints >= 22_500) rank = UserRank.TRADER;
    else if (totalPoints >= 4_500) rank = UserRank.EXPLORER;

    const percentile = Math.min(99.99, (totalPoints / 450_000) * 100);

    return {
      totalPoints,
      rank,
      percentile,
      breakdown: {
        transactionPoints,
        tokenPoints,
        nftPoints,
        uniqueContractPoints: contractPoints
      },
      stats: {
        transactions: walletStats.transactionCount,
        tokens: walletStats.tokenCount,
        nfts: walletStats.nftCount,
        contracts: walletStats.contractInteractionCount
      }
    };
  }, []);

  // Retry helper - keeps trying until success or max retries
  const fetchWithRetry = async <T,>(
    fetchFn: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (globalStopFlag.current) throw new Error('Stopped');
      
      try {
        const result = await fetchFn();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.log(`Attempt ${attempt}/${maxRetries} failed, retrying in ${delayMs}ms...`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    throw lastError || new Error('Max retries reached');
  };

  // Sequential data fetch - each tile loads one by one with retry
  const fetchData = useCallback(async () => {
    if (!address || isLoading || globalStopFlag.current) return;

    setIsLoading(true);
    setFetchError(null);

    // Reset status
    setDataStatus({
      eth: { loaded: false, error: null, timestamp: null },
      tokens: { loaded: false, error: null, timestamp: null },
      nfts: { loaded: false, error: null, timestamp: null },
      transactions: { loaded: false, error: null, timestamp: null }
    });

    // Accumulated data
    let ethBalance = BigInt(0);
    let transactionCount = 0;
    let tokenTransfers: TokenInfo[] = [];
    let nftTransfers: NFTInfo[] = [];
    let transactions: TransactionInfo[] = [];

    try {
      // Step 1: ETH Balance & Transaction Count (CDP) - with retry
      try {
        ethBalance = await fetchWithRetry(() => getBalance(address), 3, 500);
        transactionCount = await fetchWithRetry(() => getTransactionCount(address), 3, 500);
        
        setDataStatus(prev => ({
          ...prev,
          eth: { loaded: true, error: null, timestamp: Date.now() }
        }));
        setStats(prev => ({
          ...prev,
          stats: { ...prev.stats, transactions: transactionCount },
          breakdown: { ...prev.breakdown, transactionPoints: transactionCount * 10 },
          totalPoints: transactionCount * 10 + prev.breakdown.tokenPoints + prev.breakdown.nftPoints + prev.breakdown.uniqueContractPoints
        }));
      } catch (error) {
        console.error('ETH fetch failed after retries:', error);
        setDataStatus(prev => ({
          ...prev,
          eth: { loaded: false, error: 'Failed to fetch ETH balance', timestamp: null }
        }));
        // Don't continue if basic data fails
        throw new Error('Failed to fetch basic wallet data');
      }

      if (globalStopFlag.current) return;

      // Step 2: Tokens (Etherscan) - with retry, wait for success
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit delay
      try {
        tokenTransfers = await fetchWithRetry(
          () => getTokenTransfers(address),
          5, // More retries for Etherscan
          1500 // Longer delay between retries
        );
        const tokenCount = countUniqueTokens(tokenTransfers);
        
        setDataStatus(prev => ({
          ...prev,
          tokens: { loaded: true, error: null, timestamp: Date.now() }
        }));
        setStats(prev => ({
          ...prev,
          stats: { ...prev.stats, tokens: tokenCount },
          breakdown: { ...prev.breakdown, tokenPoints: tokenCount * 50 },
          totalPoints: prev.breakdown.transactionPoints + tokenCount * 50 + prev.breakdown.nftPoints + prev.breakdown.uniqueContractPoints
        }));
      } catch (error) {
        console.error('Tokens fetch failed after retries:', error);
        setDataStatus(prev => ({
          ...prev,
          tokens: { loaded: false, error: 'Failed to fetch tokens', timestamp: null }
        }));
      }

      if (globalStopFlag.current) return;

      // Step 3: NFTs (Etherscan) - with retry, wait for success
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit delay
      try {
        const [erc721, erc1155] = await Promise.all([
          fetchWithRetry(() => getNFTTransfers(address), 5, 1500),
          fetchWithRetry(() => getERC1155Transfers(address), 5, 1500)
        ]);
        nftTransfers = [...erc721, ...erc1155];
        const nftCount = countUniqueNFTs(nftTransfers);
        
        setDataStatus(prev => ({
          ...prev,
          nfts: { loaded: true, error: null, timestamp: Date.now() }
        }));
        setStats(prev => ({
          ...prev,
          stats: { ...prev.stats, nfts: nftCount },
          breakdown: { ...prev.breakdown, nftPoints: nftCount * 100 },
          totalPoints: prev.breakdown.transactionPoints + prev.breakdown.tokenPoints + nftCount * 100 + prev.breakdown.uniqueContractPoints
        }));
      } catch (error) {
        console.error('NFTs fetch failed after retries:', error);
        setDataStatus(prev => ({
          ...prev,
          nfts: { loaded: false, error: 'Failed to fetch NFTs', timestamp: null }
        }));
      }

      if (globalStopFlag.current) return;

      // Step 4: Transactions/Contracts (Etherscan) - with retry, wait for success
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit delay
      try {
        transactions = await fetchWithRetry(
          () => getTransactions(address),
          5, // More retries for Etherscan
          1500 // Longer delay between retries
        );
        const contractCount = countUniqueContracts(transactions);
        
        setDataStatus(prev => ({
          ...prev,
          transactions: { loaded: true, error: null, timestamp: Date.now() }
        }));
        setStats(prev => ({
          ...prev,
          stats: { ...prev.stats, contracts: contractCount },
          breakdown: { ...prev.breakdown, uniqueContractPoints: contractCount * 25 },
          totalPoints: prev.breakdown.transactionPoints + prev.breakdown.tokenPoints + prev.breakdown.nftPoints + contractCount * 25
        }));
      } catch (error) {
        console.error('Transactions fetch failed after retries:', error);
        setDataStatus(prev => ({
          ...prev,
          transactions: { loaded: false, error: 'Failed to fetch transactions', timestamp: null }
        }));
      }

      // Final calculations
      const tokenCount = countUniqueTokens(tokenTransfers);
      const nftCount = countUniqueNFTs(nftTransfers);
      const contractCount = countUniqueContracts(transactions);

      const walletStats: WalletStats = {
        ethBalance,
        ethBalanceFormatted: formatEthBalance(ethBalance),
        transactionCount,
        tokenCount,
        nftCount,
        contractInteractionCount: contractCount,
        transactions,
        tokenTransfers,
        nftTransfers,
        source: {
          balance: 'cdp',
          transactions: 'etherscan',
          tokens: 'etherscan',
          nfts: 'etherscan',
        },
      };

      setWalletData(walletStats);
      saveToCache(address, walletStats);

      // Final ranking calculation
      const rankingStats = calculateRankingFromStats(walletStats);
      setStats(rankingStats);
      setLastFetchTime(Date.now());

      // Fetch Builder Score and Sphere Points in parallel (non-blocking)
      setLoadingExtras(true);
      Promise.all([
        fetchBuilderScore(address).catch(() => null),
        fetchSpherePoints(address).catch(() => null)
      ]).then(([score, points]) => {
        setBuilderScore(score);
        setSpherePoints(points);
      }).finally(() => {
        setLoadingExtras(false);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch data';
      setFetchError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [address, isLoading, saveToCache, calculateRankingFromStats]);

  // Initial data load from cache
  useEffect(() => {
    if (!address || !isMounted || hasInitialized.current) return;

    hasInitialized.current = true;

    const cachedData = loadFromCache(address);
    if (cachedData) {
      setWalletData(cachedData);
      const rankingStats = calculateRankingFromStats(cachedData);
      setStats(rankingStats);

      const now = Date.now();
      setDataStatus({
        eth: { loaded: true, error: null, timestamp: now },
        tokens: { loaded: true, error: null, timestamp: now },
        nfts: { loaded: true, error: null, timestamp: now },
        transactions: { loaded: true, error: null, timestamp: now }
      });
      
      setLastFetchTime(now);
    }
  }, [address, isMounted, loadFromCache, calculateRankingFromStats]);

  // Reset on address change
  useEffect(() => {
    hasInitialized.current = false;
    globalStopFlag.current = false;
  }, [address]);

  // Calculate progress to next rank
  const getProgressToNextRank = useCallback(() => {
    const RANK_THRESHOLDS: Record<string, number> = {
      [UserRank.NEWBIE]: 0,
      [UserRank.EXPLORER]: 4_500,
      [UserRank.TRADER]: 22_500,
      [UserRank.INVESTOR]: 90_000,
      [UserRank.WHALE]: 225_000,
      [UserRank.LEGEND]: 450_000
    };

    const ranks = Object.entries(RANK_THRESHOLDS);
    const currentRankIndex = ranks.findIndex(([rank]) => rank === stats.rank);

    if (currentRankIndex === ranks.length - 1) return 100;

    const currentThreshold = RANK_THRESHOLDS[stats.rank];
    const nextThreshold = ranks[currentRankIndex + 1][1];

    return Math.min(100, ((stats.totalPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100);
  }, [stats.rank, stats.totalPoints]);

  // Earned badges
  const earnedBadges = BADGES.filter(badge => badge.condition(stats));

  // Group badges by category
  const groupedBadges = {
    transactions: BADGES.filter(badge => badge.name.toString().startsWith('Transaction')),
    tokens: BADGES.filter(badge => badge.name.toString().startsWith('Token')),
    nfts: BADGES.filter(badge => badge.name.toString().startsWith('NFT')),
    contracts: BADGES.filter(badge => badge.name.toString().startsWith('Contract'))
  };

  if (!isMounted) return null;

  if (!isConnected) {
    return (
      <BaseCard variant="glass" className="text-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#0052FF] to-[#00A3FF] flex items-center justify-center">
            <span className="text-4xl">🔐</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Connect Your Wallet</h2>
          <p className="text-gray-500 max-w-md">
            Connect your wallet to view your Base identity, stats, and achievements.
          </p>
        </div>
      </BaseCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <BaseCard variant="gradient">
        <BaseCardContent className="flex flex-col md:flex-row items-center gap-6">
          {/* Identity Card */}
          <div className="flex-shrink-0">
            <div className="p-4 bg-white rounded-2xl shadow-lg">
              <IdentityCard address={address as `0x${string}`} chain={base} />
            </div>
          </div>

          {/* Stats Overview */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center gap-3 justify-center md:justify-start mb-4">
              <RankBadge rank={stats.rank} size="lg" />
              <BaseBadge variant="info">
                {stats.totalPoints.toLocaleString()} pts
              </BaseBadge>
            </div>

            {/* Score Cards Row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {/* ETH Balance */}
              {walletData && (
                <div className="p-3 rounded-xl bg-white/50 border border-white/20 text-center">
                  <p className="text-xs text-gray-500">ETH Balance</p>
                  <p className="text-lg font-bold text-gray-900">
                    {walletData.ethBalanceFormatted}
                  </p>
                </div>
              )}
              
              {/* Builder Score - Black with neon green */}
              <div className="p-3 rounded-xl bg-black border-2 border-[#00FF00] text-center shadow-[0_0_15px_rgba(0,255,0,0.3)] relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,0,0.1),transparent_70%)]" />
                <p className="text-xs text-white relative z-10">Builder Score</p>
                {loadingExtras ? (
                  <div className="h-6 flex items-center justify-center relative z-10">
                    <div className="w-4 h-4 border-2 border-[#00FF00] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <p className="text-lg font-bold text-[#00FF00] relative z-10 drop-shadow-[0_0_8px_rgba(0,255,0,0.8)]">
                    {builderScore?.score || 0}
                  </p>
                )}
              </div>
              
              {/* Sphere Points - White with blue border + Sphere logo */}
              <div className="p-3 rounded-xl bg-white border-2 border-[#0052FF] text-center shadow-[0_0_10px_rgba(0,82,255,0.2)] relative">
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full overflow-hidden border-2 border-[#0052FF] bg-white shadow-md">
                  <img src="/android-chrome-192x192.png" alt="Sphere" className="w-full h-full object-cover" />
                </div>
                <p className="text-xs text-[#0052FF]">Sphere Points</p>
                {loadingExtras ? (
                  <div className="h-6 flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <p className="text-lg font-bold text-[#0052FF]">
                    {spherePoints?.totalPoints || 0}
                  </p>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progress to next rank</span>
                <span>{getProgressToNextRank().toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${getProgressToNextRank()}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-[#0052FF] to-[#00A3FF] rounded-full"
                />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.stats.transactions}</p>
                <p className="text-xs text-gray-500">Transactions</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.stats.tokens}</p>
                <p className="text-xs text-gray-500">Tokens</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.stats.nfts}</p>
                <p className="text-xs text-gray-500">NFTs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{earnedBadges.length}</p>
                <p className="text-xs text-gray-500">Badges</p>
              </div>
            </div>
          </div>
        </BaseCardContent>
      </BaseCard>

      {/* Data Status & Refresh */}
      <BaseCard variant="default">
        <BaseCardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900">Onchain Data</h3>
                <span className="px-2 py-0.5 text-xs bg-[#0052FF]/10 text-[#0052FF] rounded-full font-medium">
                  CDP Node
                </span>
                <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full font-medium">
                  Etherscan V2
                </span>
              </div>
              <p className="text-sm text-gray-500">
                {lastFetchTime
                  ? `Last updated: ${new Date(lastFetchTime).toLocaleTimeString()}`
                  : 'Click Refresh to load onchain data'}
              </p>
            </div>
            <BaseButton
              onClick={fetchData}
              loading={isLoading}
              variant="primary"
              icon={<span>🔄</span>}
            >
              Refresh Stats
            </BaseButton>
          </div>

          {/* Data Status Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(dataStatus).map(([dataType, status]) => {
              const hasData = status.loaded;
              const hasError = status.error && !hasData;
              const source = dataType === 'eth' ? 'CDP' : 'Etherscan';

              return (
                <div
                  key={dataType}
                  className={`p-3 rounded-xl border transition-all ${
                    isLoading && !hasData
                      ? 'bg-blue-50 border-blue-200'
                      : hasData
                        ? 'bg-green-50 border-green-200'
                        : hasError
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isLoading && !hasData ? (
                      <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                    ) : hasData ? (
                      <span className="text-green-500">✓</span>
                    ) : hasError ? (
                      <span className="text-red-500">✗</span>
                    ) : (
                      <span className="text-gray-400">○</span>
                    )}
                    <div>
                      <span className="text-sm font-medium capitalize text-gray-700">
                        {dataType === 'eth' ? 'ETH Balance' : dataType}
                      </span>
                      <p className="text-xs text-gray-400">{source}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {fetchError && (
            <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200">
              <p className="text-red-600 text-sm">{fetchError}</p>
            </div>
          )}
        </BaseCardContent>
      </BaseCard>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
        {(['overview', 'badges', 'stats', 'details'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? 'bg-white text-[#0052FF] shadow-md'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab === 'overview' && '📊 '}
            {tab === 'badges' && '🏆 '}
            {tab === 'stats' && '📈 '}
            {tab === 'details' && '📋 '}
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            <BaseStatsCard
              title="Transactions"
              value={stats.stats.transactions}
              subtitle={`${stats.breakdown.transactionPoints.toLocaleString()} pts`}
              icon={<span className="text-2xl">📤</span>}
              isLoading={isLoading && !dataStatus.eth.loaded}
              isLoaded={dataStatus.eth.loaded}
            />
            <BaseStatsCard
              title="Tokens"
              value={stats.stats.tokens}
              subtitle={`${stats.breakdown.tokenPoints.toLocaleString()} pts`}
              icon={<span className="text-2xl">🪙</span>}
              isLoading={isLoading && dataStatus.eth.loaded && !dataStatus.tokens.loaded}
              isLoaded={dataStatus.tokens.loaded}
            />
            <BaseStatsCard
              title="NFTs"
              value={stats.stats.nfts}
              subtitle={`${stats.breakdown.nftPoints.toLocaleString()} pts`}
              icon={<span className="text-2xl">🖼️</span>}
              isLoading={isLoading && dataStatus.tokens.loaded && !dataStatus.nfts.loaded}
              isLoaded={dataStatus.nfts.loaded}
            />
            <BaseStatsCard
              title="Contracts"
              value={stats.stats.contracts}
              subtitle={`${stats.breakdown.uniqueContractPoints.toLocaleString()} pts`}
              icon={<span className="text-2xl">📜</span>}
              isLoading={isLoading && dataStatus.nfts.loaded && !dataStatus.transactions.loaded}
              isLoaded={dataStatus.transactions.loaded}
            />
          </motion.div>
        )}

        {activeTab === 'badges' && (
          <motion.div
            key="badges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {Object.entries(groupedBadges).map(([category, badges]) => (
              <BaseCard key={category} variant="default">
                <BaseCardHeader>
                  <h3 className="text-lg font-semibold text-gray-900 capitalize flex items-center gap-2">
                    {category === 'transactions' && '📤'}
                    {category === 'tokens' && '🪙'}
                    {category === 'nfts' && '🖼️'}
                    {category === 'contracts' && '📜'}
                    {category}
                  </h3>
                </BaseCardHeader>
                <BaseCardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {badges.map((badge, index) => {
                    const isUnlocked = badge.condition(stats);
                    return (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                          isUnlocked
                            ? 'bg-gradient-to-r from-[#0052FF]/5 to-[#00A3FF]/5 border-[#0052FF]/20'
                            : 'bg-gray-50 border-gray-200 opacity-60'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                            isUnlocked
                              ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white'
                              : 'bg-gray-300 text-gray-500'
                          }`}
                        >
                          {badge.glowIntensity}
                        </div>
                        <div className="flex-1">
                          <p className={`font-medium ${isUnlocked ? 'text-gray-900' : 'text-gray-500'}`}>
                            {badge.title}
                          </p>
                          <p className="text-xs text-gray-500">{badge.description}</p>
                        </div>
                        {isUnlocked && <span className="text-green-500 text-xl">✓</span>}
                      </div>
                    );
                  })}
                </BaseCardContent>
              </BaseCard>
            ))}
          </motion.div>
        )}

        {activeTab === 'stats' && (
          <motion.div
            key="stats"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <BaseCard variant="default">
              <BaseCardHeader>
                <h3 className="text-lg font-bold text-gray-900">Detailed Statistics</h3>
              </BaseCardHeader>
              <BaseCardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <p className="text-sm text-gray-500">Total Points</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.totalPoints.toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <p className="text-sm text-gray-500">Percentile</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.percentile.toFixed(2)}%</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-700">Points Breakdown</h4>
                  {[
                    { label: 'Transaction Points', value: stats.breakdown.transactionPoints, color: 'from-blue-500 to-purple-500' },
                    { label: 'Token Points', value: stats.breakdown.tokenPoints, color: 'from-green-500 to-teal-500' },
                    { label: 'NFT Points', value: stats.breakdown.nftPoints, color: 'from-pink-500 to-red-500' },
                    { label: 'Contract Points', value: stats.breakdown.uniqueContractPoints, color: 'from-amber-500 to-orange-500' },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{item.label}</span>
                        <span className="font-medium text-gray-900">{item.value.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${item.color} rounded-full`}
                          style={{ width: `${Math.min(100, (item.value / stats.totalPoints) * 100 || 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </BaseCardContent>
            </BaseCard>
          </motion.div>
        )}

        {activeTab === 'details' && (
          <motion.div
            key="details"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <BaseCard variant="default">
              <BaseCardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-lg font-bold text-gray-900">Hybrid Data Sources</h3>
                  <div className="flex gap-2">
                    <span className="text-xs bg-[#0052FF] text-white px-2 py-1 rounded-full">
                      CDP Node RPC
                    </span>
                    <span className="text-xs bg-amber-500 text-white px-2 py-1 rounded-full">
                      Etherscan V2
                    </span>
                  </div>
                </div>
              </BaseCardHeader>
              <BaseCardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-[#0052FF]/5 border border-[#0052FF]/20">
                  <h4 className="font-semibold text-[#0052FF] mb-2">🔗 CDP Node RPC</h4>
                  <p className="text-sm text-gray-600 mb-2">
                    Fast, reliable blockchain data directly from Coinbase:
                  </p>
                  <ul className="space-y-1 text-sm text-gray-500">
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">eth_getBalance</code> - ETH balance</li>
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">eth_getTransactionCount</code> - Nonce</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <h4 className="font-semibold text-amber-700 mb-2">🔍 Etherscan API V2</h4>
                  <p className="text-sm text-gray-600 mb-2">
                    Comprehensive indexed data for tokens and NFTs (chainid=8453 for Base):
                  </p>
                  <ul className="space-y-1 text-sm text-gray-500">
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">tokentx</code> - ERC20 token transfers</li>
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">tokennfttx</code> - ERC721 NFT transfers</li>
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">token1155tx</code> - ERC1155 transfers</li>
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">txlist</code> - Transaction history</li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <h4 className="font-semibold text-blue-800 mb-2">📤 Transactions</h4>
                    <p className="text-sm text-blue-600">10 points per transaction</p>
                  </div>
                  <div className="p-4 rounded-xl bg-green-50 border border-green-200">
                    <h4 className="font-semibold text-green-800 mb-2">🪙 Tokens</h4>
                    <p className="text-sm text-green-600">50 points per unique token</p>
                  </div>
                  <div className="p-4 rounded-xl bg-pink-50 border border-pink-200">
                    <h4 className="font-semibold text-pink-800 mb-2">🖼️ NFTs</h4>
                    <p className="text-sm text-pink-600">100 points per unique NFT</p>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <h4 className="font-semibold text-amber-800 mb-2">📜 Contracts</h4>
                    <p className="text-sm text-amber-600">25 points per unique contract</p>
                  </div>
                </div>
              </BaseCardContent>
            </BaseCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BaseScan Link */}
      <div className="text-center">
        <a
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0052FF] hover:text-[#0041CC] text-sm font-medium inline-flex items-center gap-1"
        >
          View on BaseScan
          <span>→</span>
        </a>
      </div>
    </div>
  );
}
