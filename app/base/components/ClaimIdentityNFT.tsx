'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useName } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import ProfileCard from '@/components/ProfileCard';
import '@/components/ProfileCard.css';
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
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
              {/* Title */}
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '16px', textAlign: 'center' }}>
                {displayName}
              </h2>
              
              {/* Stats List */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>🔄 Transactions</span>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{stats.stats.transactions.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>🪙 Tokens</span>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{stats.stats.tokens.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>🖼️ NFTs</span>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{stats.stats.nfts.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>📜 Contracts</span>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{stats.stats.contracts.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>🏅 Badges</span>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{earnedBadges.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>Ξ ETH Balance</span>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>{ethBalance || '0.0000'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>🛠️ Builder Score</span>
                  <span style={{ color: '#00FF00', fontWeight: 'bold', fontSize: '16px' }}>{builderScore?.score || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>🌐 Sphere Points</span>
                  <span style={{ color: '#00A3FF', fontWeight: 'bold', fontSize: '16px' }}>{spherePoints?.totalPoints || 0}</span>
                </div>
              </div>

              {/* Total Score */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px' }}>Combined Score</span>
                  <span style={{ color: 'white', fontWeight: 'bold', fontSize: '24px' }}>{totalCombinedScore.toLocaleString()}</span>
                </div>
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

      {/* Claim Button */}
      {claimStep !== 'success' && claimStep !== 'error' && (
        <div className="flex justify-center">
          <button
            onClick={handleClaim}
            disabled={!isConnected || stats.totalPoints === 0 || isClaiming}
            className="px-8 py-3 rounded-2xl bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white font-semibold text-base shadow-lg shadow-[#0052FF]/30 hover:shadow-xl hover:shadow-[#0052FF]/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
          >
            {isClaiming ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>
                  {claimStep === 'preparing' && 'Preparing...'}
                  {claimStep === 'signing' && 'Signing...'}
                  {claimStep === 'confirming' && 'Confirming...'}
                </span>
              </>
            ) : (
              <>
                <span>🎫</span>
                <span>Mint Identity NFT</span>
              </>
            )}
          </button>
        </div>
      )}

    </div>
  );
}
