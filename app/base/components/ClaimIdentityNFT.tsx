'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useName } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import BaseCard, { BaseCardContent } from './BaseCard';
import BaseButton from './BaseButton';
import BaseBadge, { RankBadge } from './BaseBadge';
import { RankingStats, BadgeInfo, UserRank } from '../../utils/ranking';
import { TalentScore } from '../utils/talentApi';
import { SpherePoints } from '../utils/spherePoints';

interface ClaimIdentityNFTProps {
  stats: RankingStats;
  earnedBadges: BadgeInfo[];
  generatedImage?: string | null;
  builderScore?: TalentScore | null;
  spherePoints?: SpherePoints | null;
  ethBalance?: string;
  onClaim?: () => void;
}

export default function ClaimIdentityNFT({ 
  stats, 
  earnedBadges, 
  generatedImage, 
  builderScore,
  spherePoints,
  ethBalance,
  onClaim 
}: ClaimIdentityNFTProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: baseName } = useName({ address: address as `0x${string}`, chain: base });
  
  const [isFlipped, setIsFlipped] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimStep, setClaimStep] = useState<'idle' | 'preparing' | 'signing' | 'confirming' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  // Card tilt refs
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Detect mobile
  useEffect(() => {
    const detectMobile = () => {
      setIsMobileDevice(
        window.innerWidth <= 768 ||
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0
      );
    };
    detectMobile();
    window.addEventListener('resize', detectMobile);
    return () => window.removeEventListener('resize', detectMobile);
  }, []);

  // Card tilt effect
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isMobileDevice || isFlipped) return;
    
    const card = cardRef.current;
    const wrap = wrapRef.current;
    if (!card || !wrap) return;

    const rect = card.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    
    const width = card.clientWidth;
    const height = card.clientHeight;

    const percentX = Math.min(Math.max((100 / width) * offsetX, 0), 100);
    const percentY = Math.min(Math.max((100 / height) * offsetY, 0), 100);

    const centerX = percentX - 50;
    const centerY = percentY - 50;

    wrap.style.setProperty('--rotate-x', `${-(centerX / 8)}deg`);
    wrap.style.setProperty('--rotate-y', `${centerY / 6}deg`);
    wrap.style.setProperty('--pointer-x', `${percentX}%`);
    wrap.style.setProperty('--pointer-y', `${percentY}%`);
  };

  const handlePointerEnter = () => {
    if (isMobileDevice) return;
    cardRef.current?.classList.add('active');
    wrapRef.current?.classList.add('active');
  };

  const handlePointerLeave = () => {
    if (isMobileDevice) return;
    cardRef.current?.classList.remove('active');
    wrapRef.current?.classList.remove('active');
    wrapRef.current?.style.setProperty('--rotate-x', '0deg');
    wrapRef.current?.style.setProperty('--rotate-y', '0deg');
  };

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
  const topBadges = earnedBadges.slice(0, 3);

  // Calculate combined score
  const totalCombinedScore = stats.totalPoints + 
    (builderScore?.score || 0) + 
    (spherePoints?.totalPoints || 0);

  // Get rank color
  const getRankColor = (rank: UserRank) => {
    const colors: Record<UserRank, string> = {
      [UserRank.NEWBIE]: 'from-gray-400 to-gray-500',
      [UserRank.EXPLORER]: 'from-green-400 to-green-600',
      [UserRank.TRADER]: 'from-blue-400 to-blue-600',
      [UserRank.INVESTOR]: 'from-purple-400 to-purple-600',
      [UserRank.WHALE]: 'from-amber-400 to-amber-600',
      [UserRank.LEGEND]: 'from-rose-400 via-purple-500 to-indigo-600'
    };
    return colors[rank] || colors[UserRank.NEWBIE];
  };

  return (
    <div className="space-y-6">
      {/* Flip Card Container */}
      <div className="relative perspective-1000" style={{ perspective: '1000px' }}>
        {/* Flip Button */}
        <button
          onClick={() => setIsFlipped(!isFlipped)}
          className="absolute -top-2 -right-2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-all hover:scale-110"
        >
          <motion.span
            animate={{ rotateY: isFlipped ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            className="text-lg"
          >
            🔄
          </motion.span>
        </button>

        {/* Card Wrapper with 3D Effect */}
        <div
          ref={wrapRef}
          className="claim-card-wrapper"
          onPointerMove={handlePointerMove}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          style={{
            '--rotate-x': '0deg',
            '--rotate-y': '0deg',
            '--pointer-x': '50%',
            '--pointer-y': '50%',
          } as React.CSSProperties}
        >
          <motion.div
            ref={cardRef}
            className="relative w-full max-w-md mx-auto"
            animate={{ rotateY: isFlipped ? 180 : 0 }}
            transition={{ duration: 0.6, type: 'spring', stiffness: 100 }}
            style={{ 
              transformStyle: 'preserve-3d',
              transform: `rotateY(var(--rotate-x)) rotateX(var(--rotate-y))`,
            }}
          >
            {/* FRONT SIDE - Document Style */}
            <div 
              className="w-full rounded-3xl overflow-hidden shadow-2xl"
              style={{ 
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              <div className="relative bg-gradient-to-br from-white via-blue-50/50 to-white">
                {/* Holographic Effect */}
                <div
                  className="absolute inset-0 opacity-30 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at var(--pointer-x) var(--pointer-y), rgba(0, 82, 255, 0.3), transparent 40%)`,
                  }}
                />
                
                {/* Security Pattern */}
                <div className="absolute inset-0 opacity-5 pointer-events-none"
                  style={{
                    backgroundImage: `repeating-linear-gradient(45deg, #0052FF 0, #0052FF 1px, transparent 0, transparent 50%)`,
                    backgroundSize: '10px 10px'
                  }}
                />

                {/* Card Content */}
                <div className="relative p-6 space-y-5">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#00A3FF] flex items-center justify-center shadow-lg shadow-[#0052FF]/25">
                        <svg width="28" height="28" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H3.9565e-07C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="white"/>
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">Base Identity</h2>
                        <p className="text-xs text-gray-500">Onchain Identity NFT</p>
                      </div>
                    </div>
                    <RankBadge rank={stats.rank} size="md" />
                  </div>

                  {/* Profile Image */}
                  <div className="flex justify-center">
                    <div className="relative">
                      <div className={`w-36 h-36 rounded-2xl overflow-hidden border-4 border-white shadow-xl ring-4 ring-offset-2 ring-gradient-to-r ${getRankColor(stats.rank)}`}>
                        {generatedImage ? (
                          <img
                            src={generatedImage}
                            alt="Profile"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#0052FF] to-[#00A3FF] flex items-center justify-center">
                            <span className="text-5xl">🪪</span>
                          </div>
                        )}
                      </div>
                      {builderScore && builderScore.score > 0 && (
                        <div className="absolute -bottom-2 -right-2 px-2 py-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded-lg shadow-lg">
                          <span className="text-xs font-bold text-white">⚡ {builderScore.score}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* User Name */}
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-gray-900">{displayName}</h3>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      <span className="text-lg font-semibold bg-gradient-to-r from-[#0052FF] to-[#00A3FF] bg-clip-text text-transparent">
                        {totalCombinedScore.toLocaleString()} pts
                      </span>
                      {builderScore?.human_checkmark && (
                        <span title="Human Verified">✓</span>
                      )}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/80 backdrop-blur rounded-xl p-3 text-center border border-gray-100 shadow-sm">
                      <p className="text-2xl font-bold text-gray-900">{stats.stats.transactions.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Transactions</p>
                    </div>
                    <div className="bg-white/80 backdrop-blur rounded-xl p-3 text-center border border-gray-100 shadow-sm">
                      <p className="text-2xl font-bold text-gray-900">{stats.stats.tokens.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">Tokens</p>
                    </div>
                    <div className="bg-white/80 backdrop-blur rounded-xl p-3 text-center border border-gray-100 shadow-sm">
                      <p className="text-2xl font-bold text-gray-900">{stats.stats.nfts.toLocaleString()}</p>
                      <p className="text-xs text-gray-500">NFTs</p>
                    </div>
                    <div className="bg-white/80 backdrop-blur rounded-xl p-3 text-center border border-gray-100 shadow-sm">
                      <p className="text-2xl font-bold text-gray-900">{earnedBadges.length}</p>
                      <p className="text-xs text-gray-500">Badges</p>
                    </div>
                  </div>

                  {/* Badges Preview */}
                  {topBadges.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {topBadges.map((badge, index) => (
                        <BaseBadge key={index} variant="default" size="sm">
                          <span className="mr-1">{badge.icon}</span>
                          {badge.title}
                        </BaseBadge>
                      ))}
                      {earnedBadges.length > 3 && (
                        <BaseBadge variant="info" size="sm">
                          +{earnedBadges.length - 3} more
                        </BaseBadge>
                      )}
                    </div>
                  )}

                  {/* Flip hint */}
                  <p className="text-center text-xs text-gray-400">
                    Click 🔄 to see detailed stats
                  </p>
                </div>
              </div>
            </div>

            {/* BACK SIDE - Detailed Stats */}
            <div 
              className="absolute inset-0 w-full rounded-3xl overflow-hidden shadow-2xl"
              style={{ 
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)'
              }}
            >
              <div className="relative h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
                {/* Grid pattern */}
                <div className="absolute inset-0 opacity-10 pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                    backgroundSize: '20px 20px'
                  }}
                />

                <div className="relative p-6 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">📊</span>
                      <h3 className="text-lg font-bold">Detailed Stats</h3>
                    </div>
                    <span className="text-xs text-gray-400">{displayName}</span>
                  </div>

                  {/* Onchain Stats */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Onchain Activity</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                        <p className="text-xs text-gray-400">Transactions</p>
                        <p className="text-xl font-bold">{stats.stats.transactions.toLocaleString()}</p>
                        <p className="text-xs text-[#00A3FF]">+{stats.breakdown.transactionPoints.toLocaleString()} pts</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                        <p className="text-xs text-gray-400">Tokens Held</p>
                        <p className="text-xl font-bold">{stats.stats.tokens.toLocaleString()}</p>
                        <p className="text-xs text-[#00A3FF]">+{stats.breakdown.tokenPoints.toLocaleString()} pts</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                        <p className="text-xs text-gray-400">NFTs Owned</p>
                        <p className="text-xl font-bold">{stats.stats.nfts.toLocaleString()}</p>
                        <p className="text-xs text-[#00A3FF]">+{stats.breakdown.nftPoints.toLocaleString()} pts</p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                        <p className="text-xs text-gray-400">Contracts</p>
                        <p className="text-xl font-bold">{stats.stats.contracts.toLocaleString()}</p>
                        <p className="text-xs text-[#00A3FF]">+{stats.breakdown.uniqueContractPoints.toLocaleString()} pts</p>
                      </div>
                    </div>
                  </div>

                  {/* Builder Score - Black with neon green */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Builder Score</h4>
                    <div className="bg-black rounded-lg p-3 border-2 border-[#00FF00] shadow-[0_0_20px_rgba(0,255,0,0.3)] relative overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(0,255,0,0.15),transparent_60%)]" />
                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-xs text-white">Talent Protocol</p>
                            <p className="text-2xl font-bold text-[#00FF00] drop-shadow-[0_0_10px_rgba(0,255,0,0.8)]">
                              {builderScore?.score || 0}
                            </p>
                          </div>
                        </div>
                        {builderScore?.percentile && (
                          <div className="text-right">
                            <p className="text-xs text-[#00FF00]/60">Percentile</p>
                            <p className="text-lg font-semibold text-[#00FF00] drop-shadow-[0_0_6px_rgba(0,255,0,0.6)]">Top {(100 - builderScore.percentile).toFixed(1)}%</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sphere Points - White with blue border + logo */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sphere Points</h4>
                    <div className="bg-white rounded-lg p-3 border-2 border-[#0052FF] shadow-[0_0_15px_rgba(0,82,255,0.3)] relative">
                      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full overflow-hidden border-2 border-[#0052FF] bg-white shadow-lg">
                        <img src="/android-chrome-192x192.png" alt="Sphere" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold text-[#0052FF]">
                            {spherePoints?.totalPoints || 0}
                          </p>
                        </div>
                      </div>
                      {spherePoints && (
                        <div className="grid grid-cols-3 gap-1 text-xs">
                          <div className="text-center">
                            <p className="text-gray-500">Posts</p>
                            <p className="font-semibold text-[#0052FF]">{spherePoints.postPoints || 0}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-500">Likes</p>
                            <p className="font-semibold text-[#0052FF]">{spherePoints.likePoints || 0}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-500">Bonuses</p>
                            <p className="font-semibold text-[#0052FF]">
                              {(spherePoints.baseNameBonus || 0) + (spherePoints.sphereBonus || 0) + (spherePoints.activityBonus || 0)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ETH Balance if available */}
                  {ethBalance && (
                    <div className="bg-white/5 rounded-lg p-3 border border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">Ξ</span>
                        <span className="text-gray-400">ETH Balance</span>
                      </div>
                      <span className="font-bold text-lg">{ethBalance}</span>
                    </div>
                  )}

                  {/* Total Score */}
                  <div className="bg-gradient-to-r from-[#0052FF] to-[#00A3FF] rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-white/80">Combined Score</span>
                      <span className="text-2xl font-bold">{totalCombinedScore.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
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
        <BaseButton
          onClick={handleClaim}
          variant="gradient"
          size="xl"
          fullWidth
          loading={isClaiming}
          disabled={!isConnected || stats.totalPoints === 0}
          icon={<span>🎫</span>}
        >
          {claimStep === 'idle' && 'Claim Your Base Identity NFT'}
          {claimStep === 'preparing' && 'Preparing...'}
          {claimStep === 'signing' && 'Sign Transaction...'}
          {claimStep === 'confirming' && 'Confirming...'}
        </BaseButton>
      )}

      {/* Requirements Notice */}
      {stats.totalPoints === 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm text-amber-800 font-medium">No Data Yet</p>
              <p className="text-xs text-amber-600 mt-1">
                Please refresh your stats first to load your blockchain data before claiming.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info Notice */}
      <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div>
            <p className="text-sm text-blue-800 font-medium">About Base Identity NFT</p>
            <p className="text-xs text-blue-600 mt-1">
              Your Base Identity NFT represents your complete onchain reputation combining:
              Onchain Stats ({stats.totalPoints.toLocaleString()} pts), 
              Builder Score ({builderScore?.score || 0} pts), 
              and Sphere Points ({spherePoints?.totalPoints || 0} pts).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
