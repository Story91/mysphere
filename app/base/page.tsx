'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import BaseCard, { BaseCardContent } from './components/BaseCard';
import BaseBadge from './components/BaseBadge';
import BaseIdentity from './components/BaseIdentity';
import ProfilePicAI from './components/ProfilePicAI';
import ClaimIdentityNFT from './components/ClaimIdentityNFT';
import { calculateRanking, BADGES, UserRank, RankingStats } from '../utils/ranking';
import { fetchBuilderScore, TalentScore } from './utils/talentApi';
import { fetchSpherePoints, SpherePoints } from './utils/spherePoints';

type ActiveView = 'identity' | 'profile-pic' | 'claim';

// Cache configuration - must match BaseIdentity.tsx
const CACHE_KEY_PREFIX = 'baseIdentity_hybrid_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default function BasePage() {
  const { address, isConnected } = useAccount();
  const [activeView, setActiveView] = useState<ActiveView>('identity');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  
  // Builder Score and Sphere Points
  const [builderScore, setBuilderScore] = useState<TalentScore | null>(null);
  const [spherePoints, setSpherePoints] = useState<SpherePoints | null>(null);
  const [ethBalance, setEthBalance] = useState<string>('0');
  
  // Stats for claim component
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

  // Earned badges
  const earnedBadges = BADGES.filter(badge => badge.condition(stats));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load stats from cache for claim component (uses hybrid cache from BaseIdentity)
  useEffect(() => {
    if (!address || !isMounted) return;

    const loadCachedStats = () => {
      try {
        // Load from hybrid cache (same format as BaseIdentity.tsx)
        const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${address}`);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL && data) {
            // Create ranking stats from cached wallet data
            const transactionPoints = (data.transactionCount || 0) * 10;
            const tokenPoints = (data.tokenCount || 0) * 50;
            const nftPoints = (data.nftCount || 0) * 100;
            const contractPoints = (data.contractInteractionCount || 0) * 25;
            const totalPoints = transactionPoints + tokenPoints + nftPoints + contractPoints;

            let rank = UserRank.NEWBIE;
            if (totalPoints >= 450_000) rank = UserRank.LEGEND;
            else if (totalPoints >= 225_000) rank = UserRank.WHALE;
            else if (totalPoints >= 90_000) rank = UserRank.INVESTOR;
            else if (totalPoints >= 22_500) rank = UserRank.TRADER;
            else if (totalPoints >= 4_500) rank = UserRank.EXPLORER;

            const rankingStats: RankingStats = {
              totalPoints,
              rank,
              percentile: Math.min(99.99, (totalPoints / 450_000) * 100),
              breakdown: {
                transactionPoints,
                tokenPoints,
                nftPoints,
                uniqueContractPoints: contractPoints
              },
              stats: {
                transactions: data.transactionCount || 0,
                tokens: data.tokenCount || 0,
                nfts: data.nftCount || 0,
                contracts: data.contractInteractionCount || 0
              }
            };

            setStats(rankingStats);
            
            // Also update ETH balance
            if (data.ethBalanceFormatted) {
              setEthBalance(data.ethBalanceFormatted);
            }
          }
        }
      } catch (error) {
        console.error('Error loading cached stats:', error);
      }
    };

    loadCachedStats();

    // Also listen for storage changes (when BaseIdentity updates cache)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.includes('baseIdentity_hybrid_')) {
        loadCachedStats();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Poll for updates every 2 seconds to catch changes from BaseIdentity
    const pollInterval = setInterval(loadCachedStats, 2000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
    };
  }, [address, isMounted]);

  // Fetch Builder Score and Sphere Points
  useEffect(() => {
    if (!address || !isMounted) return;

    const fetchExtras = async () => {
      try {
        const [score, points] = await Promise.all([
          fetchBuilderScore(address).catch(() => null),
          fetchSpherePoints(address).catch(() => null)
        ]);
        setBuilderScore(score);
        setSpherePoints(points);
      } catch (error) {
        console.error('Error fetching extras:', error);
      }
    };

    // Load from hybrid cache for ETH balance
    const loadEthBalance = () => {
      try {
        const cached = localStorage.getItem(`baseIdentity_hybrid_${address}`);
        if (cached) {
          const { data } = JSON.parse(cached);
          if (data?.ethBalanceFormatted) {
            setEthBalance(data.ethBalanceFormatted);
          }
        }
      } catch (e) {
        // Ignore
      }
    };

    fetchExtras();
    loadEthBalance();

    // Re-fetch when switching to claim view
    if (activeView === 'claim') {
      fetchExtras();
      loadEthBalance();
    }
  }, [address, isMounted, activeView]);

  const handleImageGenerated = (imageData: string, metadata: any) => {
    setGeneratedImage(imageData);
  };

  const navigationItems = [
    {
      id: 'identity' as const,
      step: 1,
      name: 'Check Stats',
      icon: '🪪',
      description: 'View your onchain activity',
    },
    {
      id: 'profile-pic' as const,
      step: 2,
      name: 'Create Avatar',
      icon: '🎨',
      description: 'Generate AI profile picture',
    },
    {
      id: 'claim' as const,
      step: 3,
      name: 'Mint NFT',
      icon: '🎫',
      description: 'Claim your identity NFT',
    },
  ];

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50/30 to-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#0052FF] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50/30 to-white">
      {/* Background Pattern */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(0,82,255,0.03)_25%,rgba(0,82,255,0.03)_26%,transparent_27%,transparent_74%,rgba(0,82,255,0.03)_75%,rgba(0,82,255,0.03)_76%,transparent_77%,transparent)] bg-[length:50px_50px] opacity-60" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Pill Navigation with Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center mb-8"
        >
          <div className="relative inline-flex items-center bg-white rounded-full p-1 shadow-lg border border-gray-200">
            {/* Animated pill background */}
            <div className="relative flex items-center">
              <motion.div
                className="absolute h-[calc(100%-4px)] top-[2px] bg-gradient-to-r from-[#0052FF] to-[#00A3FF] rounded-full shadow-md"
                layout
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{
                  width: `calc(${100 / navigationItems.length}% - 2px)`,
                  left: `calc(${navigationItems.findIndex(item => item.id === activeView) * (100 / navigationItems.length)}% + 1px)`,
                }}
              />
              
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`relative z-10 flex items-center gap-1.5 px-4 py-2 rounded-full transition-all duration-200 ${
                    activeView === item.id
                      ? 'text-white font-semibold'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {/* Step Number */}
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    activeView === item.id
                      ? 'bg-white/30 text-white'
                      : 'bg-gray-100 text-[#0052FF]'
                  }`}>
                    {item.step}
                  </span>
                  <span className="text-sm whitespace-nowrap">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="max-w-4xl mx-auto"
        >
          <AnimatePresence mode="wait">
            {activeView === 'identity' && (
              <motion.div
                key="identity"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <BaseIdentity />
              </motion.div>
            )}

            {activeView === 'profile-pic' && (
              <motion.div
                key="profile-pic"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <ProfilePicAI onGenerated={handleImageGenerated} />
              </motion.div>
            )}

            {activeView === 'claim' && (
              <motion.div
                key="claim"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
              >
                <ClaimIdentityNFT
                  stats={stats}
                  earnedBadges={earnedBadges}
                  generatedImage={generatedImage}
                  builderScore={builderScore}
                  spherePoints={spherePoints}
                  ethBalance={ethBalance}
                  onClaim={() => {
                    // Handle successful claim
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </div>
    </div>
  );
}
