import React, { useState, useEffect } from 'react';
import { BadgeInfo } from '../../utils/ranking';

interface BadgesRevealProps {
  earnedBadges: BadgeInfo[];
  onComplete: () => void;
}

export const BadgesReveal: React.FC<BadgesRevealProps> = ({
  earnedBadges,
  onComplete
}) => {
  const [visibleBadges, setVisibleBadges] = useState<number>(0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    
    if (visibleBadges < earnedBadges.length) {
      const timer = setTimeout(() => {
        setVisibleBadges(prev => prev + 1);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setTimeout(onComplete, 1000);
    }
  }, [visibleBadges, earnedBadges.length, onComplete, isMounted]);

  if (!isMounted) {
    return <div></div>;
  }

  return (
    <div className="backdrop-blur-lg bg-black/40 p-8 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative">
      <div className="text-center mb-8">
        <div className="text-2xl font-mono font-bold text-[#0052FF]">
          EARNED BADGES
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-4">
        {earnedBadges.slice(0, visibleBadges).map((badge, index) => (
          <div
            key={badge.name}
            className="backdrop-blur-lg bg-black/40 p-4 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative animate-fadeIn"
          >
            <div className="text-center">
              <div className="text-4xl text-[#0052FF] mb-2">
                <i className={`fas fa-${badge.icon}`} />
              </div>
              <div className="text-lg font-mono font-bold text-white mb-1">
                {badge.title}
              </div>
              <div className="text-sm font-mono text-gray-400">
                {badge.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BadgesReveal; 