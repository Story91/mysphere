'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useName } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import ProfileCard from '@/components/ProfileCard';
import '@/components/ProfileCard.css';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import BaseCard, { BaseCardContent } from './BaseCard';
import BaseButton from './BaseButton';
import BaseBadge from './BaseBadge';
import { RankingStats, BadgeInfo, UserRank } from '../../utils/ranking';
import { TalentScore } from '../utils/talentApi';
import { SpherePoints } from '../utils/spherePoints';

interface ClaimIdentityNFTProps {
  stats: RankingStats;
  earnedBadges: BadgeInfo[];
  generatedImage?: string | null;
  diceBearAvatar?: string | null;
  builderScore?: TalentScore | null;
  spherePoints?: SpherePoints | null;
  ethBalance?: string;
  onClaim?: () => void;
}

export default function ClaimIdentityNFT({ 
  stats, 
  earnedBadges, 
  generatedImage, 
  diceBearAvatar,
  builderScore,
  spherePoints,
  ethBalance,
  onClaim 
}: ClaimIdentityNFTProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: baseName } = useName({ address: address as `0x${string}`, chain: base });
  
  const [isClaiming, setIsClaiming] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<'dicebear' | 'ai'>('dicebear');
  const [claimStep, setClaimStep] = useState<'idle' | 'preparing' | 'signing' | 'confirming' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    if (!address || isClaiming) return;

    setIsClaiming(true);
    setClaimStep('preparing');
    setError(null);

    try {
      if (chainId !== base.id) {
        setClaimStep('preparing');
        await switchChain({ chainId: base.id });
      }

      setClaimStep('signing');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setClaimStep('confirming');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setClaimStep('success');
      setTxHash('0x' + Math.random().toString(16).slice(2, 66));
      onClaim?.();
      
    } catch (err) {
      console.error('Claim error:', err);
      setError(err instanceof Error ? err.message : 'Failed to claim NFT');
      setClaimStep('error');
    } finally {
      setIsClaiming(false);
    }
  };

  const resetClaim = () => {
    setClaimStep('idle');
    setTxHash(null);
    setError(null);
  };

  const displayName = baseName || `${address?.slice(0, 6)}...${address?.slice(-4)}`;

  // Calculate combined score
  const totalCombinedScore = stats.totalPoints + 
    (builderScore?.score || 0) + 
    (spherePoints?.totalPoints || 0);

  return (
    <div className="space-y-6">
      {/* Avatar Selector - above the card */}
      {(diceBearAvatar || generatedImage) && (
        <div className="flex justify-center">
          <div className="flex gap-2 p-1.5 bg-white rounded-2xl shadow-lg border border-gray-200">
            <button
              onClick={() => setSelectedAvatar('dicebear')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                selectedAvatar === 'dicebear'
                  ? 'bg-[#0052FF] text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>🎭</span>
              <span>Base Avatar</span>
            </button>
            <button
              onClick={() => setSelectedAvatar('ai')}
              disabled={!generatedImage}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                selectedAvatar === 'ai'
                  ? 'bg-[#0052FF] text-white shadow-md'
                  : generatedImage 
                    ? 'text-gray-600 hover:bg-gray-100'
                    : 'text-gray-300 cursor-not-allowed'
              }`}
            >
              <span>✨</span>
              <span>AI Avatar</span>
              {!generatedImage && <span className="text-xs opacity-60">(create first)</span>}
            </button>
          </div>
        </div>
      )}

      {/* ProfileCard NFT Display */}
      <div className="flex justify-center">
        <ProfileCard
          avatarUrl={
            selectedAvatar === 'ai' && generatedImage 
              ? generatedImage 
              : diceBearAvatar || '/Base_square_blue.png'
          }
          iconUrl="/_base-brand/1_Base Brand Assets/Basemark/Base_basemark_white.png"
          showUserInfo={false}
          enableTilt={true}
          behindGlowEnabled={true}
          behindGlowColor="rgba(0, 82, 255, 0.5)"
          behindGlowSize="60%"
          innerGradient="linear-gradient(145deg, #0052FF44 0%, #00A3FF33 100%)"
          avatarMode={selectedAvatar === 'ai' && generatedImage ? 'cover' : 'contain'}
          enableFlip={true}
          logoUrl="/android-chrome-512x512.png"
          ensName={baseName || displayName}
          bottomBadge="Sphere Identity"
          bottomBadgeIcon="verify"
          backContent={
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', width: '100%' }}>
              {/* Title */}
              <h2 className="pc-back-title">
                {displayName}
              </h2>

              {/* Rank & Total Points Badges */}
              <div className="pc-back-badges">
                <div className="pc-back-badge-item">
                  <span>🌱</span>
                  <span>{stats.rank}</span>
                </div>
                <div className="pc-back-badge-item">
                  <span>⭐</span>
                  <span>{stats.totalPoints.toLocaleString()}</span>
                </div>
              </div>
              
              {/* Stats List - compact */}
              <div className="pc-back-stats">
                <div className="pc-back-stat-row">
                  <span className="pc-back-stat-label">🔄 Transactions</span>
                  <span className="pc-back-stat-value">{stats.stats.transactions.toLocaleString()}</span>
                </div>
                <div className="pc-back-stat-row">
                  <span className="pc-back-stat-label">🪙 Tokens</span>
                  <span className="pc-back-stat-value">{stats.stats.tokens.toLocaleString()}</span>
                </div>
                <div className="pc-back-stat-row">
                  <span className="pc-back-stat-label">🖼️ NFTs</span>
                  <span className="pc-back-stat-value">{stats.stats.nfts.toLocaleString()}</span>
                </div>
                <div className="pc-back-stat-row">
                  <span className="pc-back-stat-label">📜 Contracts</span>
                  <span className="pc-back-stat-value">{stats.stats.contracts.toLocaleString()}</span>
                </div>
                <div className="pc-back-stat-row">
                  <span className="pc-back-stat-label">🏅 Badges</span>
                  <span className="pc-back-stat-value">{earnedBadges.length}</span>
                </div>
                <div className="pc-back-stat-row">
                  <span className="pc-back-stat-label">Ξ ETH Balance</span>
                  <span className="pc-back-stat-value">{ethBalance || '0.0000'}</span>
                </div>
                <div className="pc-back-stat-row">
                  <span className="pc-back-stat-label">🛠️ Builder Score</span>
                  <span className="pc-back-stat-value green">{builderScore?.score || 0}</span>
                </div>
                <div className="pc-back-stat-row">
                  <span className="pc-back-stat-label">🌐 Sphere Points</span>
                  <span className="pc-back-stat-value blue">{spherePoints?.totalPoints || 0}</span>
                </div>
              </div>

              {/* Combined Score (all sources) */}
              <div className="pc-back-total">
                <span className="pc-back-total-label">Combined Score</span>
                <span className="pc-back-total-value">{totalCombinedScore.toLocaleString()}</span>
              </div>
            </div>
          }
        />
      </div>

      {/* Claim Status */}
      <AnimatePresence mode="wait">
        {claimStep === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <BaseCard variant="default" className="border-green-200 bg-green-50">
              <BaseCardContent className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 mx-auto flex items-center justify-center mb-4">
                  <span className="text-3xl">✅</span>
                </div>
                <h3 className="text-xl font-bold text-green-800 mb-2">NFT Claimed Successfully!</h3>
                <p className="text-green-600 mb-4">Your Base Identity NFT is now in your wallet.</p>
                {txHash && (
                  <a
                    href={`https://basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0052FF] hover:underline text-sm"
                  >
                    View transaction →
                  </a>
                )}
              </BaseCardContent>
            </BaseCard>
          </motion.div>
        )}

        {claimStep === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <BaseCard variant="default" className="border-red-200 bg-red-50">
              <BaseCardContent className="text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 mx-auto flex items-center justify-center mb-4">
                  <span className="text-3xl">❌</span>
                </div>
                <h3 className="text-xl font-bold text-red-800 mb-2">Claim Failed</h3>
                <p className="text-red-600 mb-4">{error || 'Something went wrong. Please try again.'}</p>
                <BaseButton onClick={resetClaim} variant="secondary">
                  Try Again
                </BaseButton>
              </BaseCardContent>
            </BaseCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Claim Button - Currently disabled */}
      {claimStep !== 'success' && claimStep !== 'error' && (
        <div className="flex justify-center">
          <button
            disabled={true}
            className="px-8 py-3 rounded-2xl bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white font-semibold text-base shadow-lg shadow-[#0052FF]/30 transition-all opacity-50 cursor-not-allowed flex items-center gap-2"
          >
            <span>🔒</span>
            <span>Mint Your Sphere Identity</span>
            <span className="text-xs ml-1 opacity-70">(Coming Soon)</span>
          </button>
        </div>
      )}

      {/* Coming Soon Info */}
      <Alert className="bg-gradient-to-r from-[#0052FF]/5 to-[#00A3FF]/5 border-[#0052FF]/20">
        <span className="text-lg">🚀</span>
        <AlertTitle className="text-[#0052FF] font-semibold">
          Sphere Identity System Update
        </AlertTitle>
        <AlertDescription className="text-gray-600">
          <p className="mt-1">
            We're building a unified scoring system that combines:
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0052FF]"></span>
              <span>Onchain Activity (transactions, tokens, NFTs, contracts)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00FF00]"></span>
              <span>Builder Score from Talent Protocol</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00A3FF]"></span>
              <span>Sphere Points (posts, likes, activity)</span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            Your identity rank and total points will be calculated based on all these metrics. Stay tuned for the full launch!
          </p>
        </AlertDescription>
      </Alert>

    </div>
  );
}
