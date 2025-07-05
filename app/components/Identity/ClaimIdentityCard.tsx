import React, { useEffect, useRef, useState } from 'react';
import { UserRank, BadgeInfo } from '../../utils/ranking';
import { useName } from '@coinbase/onchainkit/identity';
import { base } from 'wagmi/chains';
import './ClaimIdentityCard.css';

interface ClaimIdentityCardProps {
  address: string;
  stats: {
    totalPoints: number;
    rank: UserRank;
    stats: {
      transactions: number;
      tokens: number;
      nfts: number;
      contracts: number;
    };
  };
  earnedBadges: BadgeInfo[];
  onClaim: () => void;
  isClaiming: boolean;
  enableTilt?: boolean;
  className?: string;
  userName?: string;
}

const ClaimIdentityCard: React.FC<ClaimIdentityCardProps> = ({
  address,
  stats,
  earnedBadges,
  onClaim,
  isClaiming,
  enableTilt = true,
  className = "",
  userName
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  
  // Get user name from OnchainKit (ENS, .base.eth or shortened address)
  const { data: onchainName } = useName({ address: address as `0x${string}`, chain: base });

  // Detect mobile devices
  useEffect(() => {
    const detectMobile = () => {
      const isMobile = window.innerWidth <= 768 || 
                      /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                      ('ontouchstart' in window) ||
                      (navigator.maxTouchPoints > 0);
      
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      
      setIsMobileDevice(isMobile || prefersReducedMotion);
    };

    detectMobile();
    window.addEventListener('resize', detectMobile);
    
    return () => window.removeEventListener('resize', detectMobile);
  }, []);

  // Set static styles for mobile devices
  useEffect(() => {
    if (isMobileDevice) {
      const wrap = wrapRef.current;
      const card = cardRef.current;

      if (!wrap || !card) return;

      // Set static position for mobile
      wrap.style.setProperty('--pointer-x', '50%');
      wrap.style.setProperty('--pointer-y', '50%');
      wrap.style.setProperty('--pointer-from-center', '0');
      wrap.style.setProperty('--pointer-from-top', '0.5');
      wrap.style.setProperty('--pointer-from-left', '0.5');
      wrap.style.setProperty('--rotate-x', '0deg');
      wrap.style.setProperty('--rotate-y', '0deg');
      wrap.style.setProperty('--background-x', '50%');
      wrap.style.setProperty('--background-y', '50%');

      // Add mobile class for CSS targeting
      wrap.classList.add('mobile-device');

      // Enable touch scrolling
      const content = card.querySelector('.claim-content') as HTMLElement;
      if (content) {
        content.style.touchAction = 'pan-y';
        content.style.overscrollBehavior = 'contain';
        
        // Add touch event listeners for better mobile interaction
        let isScrolling = false;
        
        const handleTouchStart = () => {
          isScrolling = false;
        };
        
        const handleTouchMove = () => {
          isScrolling = true;
        };
        
        const handleTouchEnd = (e: TouchEvent) => {
          if (!isScrolling) {
            // Single tap - prevent any unwanted interactions
            e.preventDefault();
          }
        };
        
        content.addEventListener('touchstart', handleTouchStart, { passive: true });
        content.addEventListener('touchmove', handleTouchMove, { passive: true });
        content.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        return () => {
          content.removeEventListener('touchstart', handleTouchStart);
          content.removeEventListener('touchmove', handleTouchMove);
          content.removeEventListener('touchend', handleTouchEnd);
        };
      }
    }
  }, [isMobileDevice]);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enableTilt || isMobileDevice) return;
    
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

    const properties = {
      "--pointer-x": `${percentX}%`,
      "--pointer-y": `${percentY}%`,
      "--pointer-from-center": `${Math.min(Math.hypot(percentY - 50, percentX - 50) / 50, 1)}`,
      "--pointer-from-top": `${percentY / 100}`,
      "--pointer-from-left": `${percentX / 100}`,
      "--rotate-x": `${-(centerX / 5)}deg`,
      "--rotate-y": `${centerY / 4}deg`,
      "--background-x": `${35 + (percentX / 100) * 30}%`,
      "--background-y": `${35 + (percentY / 100) * 30}%`,
    };

    Object.entries(properties).forEach(([property, value]) => {
      wrap.style.setProperty(property, value);
    });
  };

  const handlePointerEnter = () => {
    if (!enableTilt || isMobileDevice) return;
    
    const card = cardRef.current;
    const wrap = wrapRef.current;
    
    if (!card || !wrap) return;

    wrap.classList.add("active");
    card.classList.add("active");
  };

  const handlePointerLeave = () => {
    if (!enableTilt || isMobileDevice) return;
    
    const card = cardRef.current;
    const wrap = wrapRef.current;
    
    if (!card || !wrap) return;

    wrap.classList.remove("active");
    card.classList.remove("active");
  };

  const getRankColor = (rank: UserRank) => {
    switch (rank) {
      case UserRank.LEGEND:
        return 'text-purple-400';
      case UserRank.WHALE:
        return 'text-blue-400';
      case UserRank.INVESTOR:
        return 'text-green-400';
      case UserRank.TRADER:
        return 'text-yellow-400';
      case UserRank.EXPLORER:
        return 'text-orange-400';
      default:
        return 'text-gray-400';
    }
  };

  const getRankBadgeColor = (rank: UserRank) => {
    switch (rank) {
      case UserRank.LEGEND:
        return 'bg-purple-500';
      case UserRank.WHALE:
        return 'bg-blue-500';
      case UserRank.INVESTOR:
        return 'bg-green-500';
      case UserRank.TRADER:
        return 'bg-yellow-500';
      case UserRank.EXPLORER:
        return 'bg-orange-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="claim-identity-container">
      <div
        ref={wrapRef}
        className={`claim-card-wrapper ${className}`.trim()}
        onPointerMove={handlePointerMove}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <section ref={cardRef} className="claim-card">
          <div className="claim-inside">
            <div className="claim-shine" />
            <div className="claim-glare" />
            <div className="claim-hologram" />
            <div className="claim-content">
                             {/* Logo and Title */}
               <div className="claim-header">
                 <div className="claim-header-row">
                   <div className="claim-logo">
                     <svg width="32" height="32" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
                       <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H3.9565e-07C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="currentColor"/>
                     </svg>
                   </div>
                   <h2 className="claim-title">Sphere Identity</h2>
                 </div>
               </div>

              {/* Stats */}
              <div className="claim-stats">
                <div className="claim-stat-row">
                  <div className="claim-stat-item">
                    <span className="claim-stat-label">Your Rank</span>
                    <div className="claim-rank-badge">
                      <span className={`claim-rank-text ${getRankColor(stats.rank)}`}>
                        {stats.rank}
                      </span>
                      <div className={`claim-rank-indicator ${getRankBadgeColor(stats.rank)}`} />
                    </div>
                  </div>
                  <div className="claim-stat-item">
                    <span className="claim-stat-label">Points</span>
                    <span className="claim-stat-value">{stats.totalPoints.toLocaleString()}</span>
                  </div>
                </div>

                                 <div className="claim-stat-row">
                   <div className="claim-stat-item claim-badges-item">
                     <span className="claim-stat-label">Earned Badges</span>
                     <div className="claim-badge-count">
                       <div className="claim-badge-icon">
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                           <circle cx="12" cy="8" r="7"/>
                           <path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/>
                         </svg>
                       </div>
                       <span className="claim-badge-number">{earnedBadges.length}</span>
                     </div>
                   </div>
                 </div>

                 <div className="claim-stats-grid">
                   <div className="claim-grid-item">
                     <span className="claim-grid-label">Transactions</span>
                     <span className="claim-grid-value">{stats.stats.transactions}</span>
                   </div>
                   <div className="claim-grid-item">
                     <span className="claim-grid-label">NFTs</span>
                     <span className="claim-grid-value">{stats.stats.nfts}</span>
                   </div>
                   <div className="claim-grid-item">
                     <span className="claim-grid-label">Tokens</span>
                     <span className="claim-grid-value">{stats.stats.tokens}</span>
                   </div>
                   <div className="claim-grid-item">
                     <span className="claim-grid-label">Contracts</span>
                     <span className="claim-grid-value">{stats.stats.contracts}</span>
                   </div>
                 </div>

                 {/* User Name */}
                 <div className="claim-user-name">
                   {onchainName || userName || `${address.slice(0, 6)}...${address.slice(-4)}`}
                 </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      
      {/* Claim Button - Outside the card */}
      <button
        onClick={onClaim}
        disabled={true}
        className={`w-full px-6 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform relative overflow-hidden ${
          true
            ? 'bg-gray-600 cursor-not-allowed opacity-50 text-gray-400' 
            : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-purple-500/25 hover:scale-105'
        }`}
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {isClaiming ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Claiming...</span>
            </>
          ) : (
            <>
              <span>🚫 Claim Temporarily Disabled</span>
            </>
          )}
        </span>
        {!isClaiming && (
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 animate-pulse"></div>
        )}
      </button>
      
      {/* Temporary notice */}
      <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400">⚠️</span>
          <div className="text-sm">
            <p className="text-yellow-300 font-medium">Claim Feature Temporarily Disabled</p>
            <p className="text-yellow-400/80 text-xs mt-1">
              We're optimizing the blockchain data fetching system. The claim feature will be re-enabled soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClaimIdentityCard; 