import React, { useState, useEffect } from 'react';
import { StatsReveal } from './StatsReveal';
import { PointsReveal } from './PointsReveal';
import { RankReveal } from './RankReveal';
import { BadgesReveal } from './BadgesReveal';
import { UserRank, RANK_DESCRIPTIONS } from '../../utils/ranking';
import Image from 'next/image';

interface InitialAnimationProps {
  stats: {
    stats: {
      transactions: number;
      tokens: number;
      nfts: number;
      contracts: number;
    };
    totalPoints: number;
    rank: UserRank;
    breakdown: {
      transactionPoints: number;
      tokenPoints: number;
      nftPoints: number;
      uniqueContractPoints: number;
    };
  };
  earnedBadges: any[];
  address: string;
  onComplete: () => void;
}

export const InitialAnimation: React.FC<InitialAnimationProps> = ({
  stats,
  earnedBadges,
  address,
  onComplete
}) => {
  const [animationStep, setAnimationStep] = useState(0);
  const [showControls, setShowControls] = useState(false);

  const ANIMATION_STEPS = {
    WELCOME: 0,
    STATS: 1,
    POINTS: 2,
    RANK: 3,
    BADGES: 4,
    FAREWELL: 5,
    COMPLETE: 6
  };

  const nextStep = () => {
    if (animationStep < ANIMATION_STEPS.COMPLETE) {
      setAnimationStep(prev => prev + 1);
      if (animationStep === ANIMATION_STEPS.BADGES) {
        setShowControls(true);
      }
    } else {
      localStorage.setItem(`sphere-animation-${address}`, 'true');
      onComplete();
    }
  };

  const restartAnimation = () => {
    setAnimationStep(ANIMATION_STEPS.WELCOME);
    setShowControls(false);
  };

  useEffect(() => {
    if (animationStep === ANIMATION_STEPS.WELCOME) {
      const timer = setTimeout(() => nextStep(), 2500);
      return () => clearTimeout(timer);
    }
  }, [animationStep]);

  const handleStatsComplete = () => setTimeout(() => nextStep(), 2500);
  const handlePointsComplete = () => setTimeout(() => nextStep(), 2000);
  const handleRankComplete = () => setTimeout(() => nextStep(), 2000);
  const handleBadgesComplete = () => setTimeout(() => nextStep(), 2000);

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-lg z-50 flex items-center justify-center">
      <div className="max-w-2xl w-full space-y-8">
        {/* Animacja powitalna */}
        {animationStep === ANIMATION_STEPS.WELCOME && (
          <div className="space-y-8 animate-fadeIn text-center">
            {/* Logo Sphere */}
            <div className="relative w-160 h-160 mx-auto mb-8 animate-fadeIn">
              <Image
                src="/elo2.png"
                alt="Sphere Logo"
                width={640}
                height={640}
                className="object-contain"
              />
            </div>
            
            {/* Logo Base i tekst powitalny */}
            <div className="space-y-4 animate-fadeIn animate-delay-200">
              <div className="relative h-12 mx-auto">
                <Image
                  src="/brand-kit/base/logo/wordmark/Base_Wordmark_White.png"
                  alt="Base Network"
                  width={200}
                  height={48}
                  className="object-contain mx-auto"
                />
              </div>
              <h2 className="text-4xl font-mono font-bold text-white mt-4">
                WELCOME ON NETWORK
              </h2>
            </div>

            {/* Tekst inicjalizacji */}
            <div className="mt-8 animate-fadeIn animate-delay-400">
              <p className="text-lg font-mono text-gray-400">
                Initializing your Base Network profile analysis...
              </p>
            </div>
          </div>
        )}

        {/* Stats Step */}
        {animationStep === ANIMATION_STEPS.STATS && (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-3xl font-mono font-bold text-[#0052FF] text-center">
              &lt;ANALYZING_YOUR_ACTIVITY/&gt;
            </h2>
            <p className="text-lg font-mono text-gray-400 text-center animate-fadeIn animate-delay-300">
              Scanning your on-chain footprint...
            </p>
            <div className="grid grid-cols-2 gap-6 mt-8">
              <StatsReveal 
                label="TRANSACTIONS"
                value={stats.stats.transactions}
                points={stats.breakdown.transactionPoints}
                description="Total transactions executed on Base Network"
                onComplete={handleStatsComplete}
              />
              <StatsReveal 
                label="TOKENS"
                value={stats.stats.tokens}
                points={stats.breakdown.tokenPoints}
                description="Unique tokens interacted with"
                onComplete={() => {}}
              />
              <StatsReveal 
                label="NFTs"
                value={stats.stats.nfts}
                points={stats.breakdown.nftPoints}
                description="NFT collections explored"
                onComplete={() => {}}
              />
              <StatsReveal 
                label="CONTRACTS"
                value={stats.stats.contracts}
                points={stats.breakdown.uniqueContractPoints}
                description="Smart contracts engaged"
                onComplete={() => {}}
              />
            </div>
            <p className="text-lg font-mono text-green-400 text-center mt-6 animate-fadeIn animate-delay-500">
              [ANALYSIS_COMPLETE] Activity scan successful!
            </p>
          </div>
        )}

        {/* Points Step */}
        {animationStep === ANIMATION_STEPS.POINTS && (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-3xl font-mono font-bold text-[#0052FF] text-center">
              &lt;CALCULATING_SPHERE_SCORE/&gt;
            </h2>
            <p className="text-lg font-mono text-gray-400 text-center animate-fadeIn animate-delay-300">
              Processing your achievements and contributions...
            </p>
            <div className="mt-8">
              <PointsReveal
                totalPoints={stats.totalPoints}
                onComplete={handlePointsComplete}
              />
            </div>
            <p className="text-lg font-mono text-green-400 text-center mt-6 animate-fadeIn animate-delay-500">
              [SCORE_CALCULATED] Your impact has been measured!
            </p>
          </div>
        )}

        {/* Rank Step */}
        {animationStep === ANIMATION_STEPS.RANK && (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-3xl font-mono font-bold text-[#0052FF] text-center">
              &lt;DETERMINING_SPHERE_RANK/&gt;
            </h2>
            <p className="text-lg font-mono text-gray-400 text-center animate-fadeIn animate-delay-300">
              Evaluating your position in the Base ecosystem...
            </p>
            <div className="mt-8">
              <RankReveal
                rank={stats.rank}
                onComplete={handleRankComplete}
              />
            </div>
            <p className="text-lg font-mono text-green-400 text-center mt-6 animate-fadeIn animate-delay-500">
              [RANK_ASSIGNED] Your influence level has been established!
            </p>
          </div>
        )}

        {/* Badges Step */}
        {animationStep === ANIMATION_STEPS.BADGES && (
          <div className="space-y-6 animate-fadeIn">
            <h2 className="text-3xl font-mono font-bold text-[#0052FF] text-center">
              &lt;UNLOCKING_ACHIEVEMENTS/&gt;
            </h2>
            <p className="text-lg font-mono text-gray-400 text-center animate-fadeIn animate-delay-300">
              Revealing your earned badges and accomplishments...
            </p>
            <div className="mt-8">
              <BadgesReveal
                earnedBadges={earnedBadges}
                onComplete={handleBadgesComplete}
              />
            </div>
            <p className="text-lg font-mono text-green-400 text-center mt-6 animate-fadeIn animate-delay-500">
              [BADGES_UNLOCKED] Your achievements have been recognized!
            </p>
          </div>
        )}

        {/* Farewell Step */}
        {animationStep === ANIMATION_STEPS.FAREWELL && (
          <div className="flex flex-col items-center justify-center h-full animate-fadeIn">
            {/* Nagłówek z podświetleniem */}
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF] via-white to-[#0052FF] opacity-10 blur-2xl -z-10" />
              <h2 className="text-3xl font-mono font-bold text-[#0052FF] relative">
                &lt;INITIALIZATION_COMPLETE/&gt;
              </h2>
            </div>
            
            {/* Logo i tekst z wspólnymi efektami */}
            <div className="relative w-[500px] group">
              {/* Efekty tła dla całości - powiększone o 20% */}
              <div className="absolute -top-[20%] inset-x-0 h-[700px] bg-gradient-to-r from-white via-white to-[#0052FF] opacity-20 blur-3xl group-hover:opacity-30 transition-opacity duration-500" />
              <div className="absolute -top-[20%] inset-x-0 h-[700px] bg-gradient-to-l from-[#0052FF] via-[#0052FF] to-white opacity-10 blur-2xl group-hover:opacity-20 transition-opacity duration-500" />
              
              <div className="relative z-10">
                {/* Logo */}
                <Image
                  src="/elo2.png"
                  alt="Sphere Logo"
                  width={500}
                  height={500}
                  className="object-contain transform group-hover:scale-105 transition-transform duration-500"
                />

                {/* Tekst */}
                <div className="space-y-4 text-center">
                  <p className="text-2xl font-mono text-[#0052FF] font-bold animate-fadeIn animate-delay-200">
                    [SPHERE_EVOLUTION_INCOMING]
                  </p>
                  <div className="animate-fadeIn animate-delay-300">
                    <p className="text-lg font-mono text-gray-400 mb-4">
                      Get ready for more. Coming soon:
                    </p>
                    <div className="flex flex-col space-y-2">
                      <p className="text-md font-mono text-white">• Extended on-chain statistics</p>
                      <p className="text-md font-mono text-white">• New points and achievements</p>
                      <p className="text-md font-mono text-white">• Interactive educational challenges</p>
                      <p className="text-md font-mono text-white">• Exclusive activity rewards</p>
                    </div>
                  </div>
                  <p className="text-lg font-mono text-[#0052FF] mt-4 animate-fadeIn animate-delay-400">
                    [STAY_TUNED_FOR_UPDATES]
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Przyciski kontrolne */}
        <div className="absolute bottom-8 right-8 flex gap-4">
          {showControls ? (
            <>
              <button 
                onClick={restartAnimation}
                className="text-sm font-mono text-[#0052FF] hover:text-white transition-colors duration-200"
              >
                [WATCH_AGAIN]
              </button>
              <button 
                onClick={onComplete}
                className="text-sm font-mono text-gray-400 hover:text-white transition-colors duration-200"
              >
                [CLOSE]
              </button>
            </>
          ) : (
            <button 
              onClick={onComplete}
              className="text-sm font-mono text-gray-400 hover:text-white transition-colors duration-200"
            >
              [SKIP_ANIMATION]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 