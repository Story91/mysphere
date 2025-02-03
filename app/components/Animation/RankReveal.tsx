import React, { useState, useEffect } from 'react';
import { UserRank, RANK_DESCRIPTIONS } from '../../utils/ranking';

interface RankRevealProps {
  rank: UserRank;
  onComplete: () => void;
}

export const RankReveal: React.FC<RankRevealProps> = ({
  rank,
  onComplete
}) => {
  const [showRank, setShowRank] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  useEffect(() => {
    const rankTimer = setTimeout(() => {
      setShowRank(true);
    }, 1000);

    const descriptionTimer = setTimeout(() => {
      setShowDescription(true);
    }, 2000);

    const completeTimer = setTimeout(() => {
      onComplete();
    }, 4000);

    return () => {
      clearTimeout(rankTimer);
      clearTimeout(descriptionTimer);
      clearTimeout(completeTimer);
    };
  }, []);

  return (
    <div className="backdrop-blur-lg bg-black/40 p-8 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative">
      <div className="text-center">
        <div className="text-2xl font-mono font-bold text-[#0052FF] mb-4">
          ANALYZING RANK
        </div>
        {showRank && (
          <div className="text-5xl font-mono font-bold text-white mb-4 animate-fadeIn">
            [{rank}]
          </div>
        )}
        {showDescription && (
          <div className="text-lg font-mono text-gray-400 animate-fadeIn">
            {RANK_DESCRIPTIONS[rank]}
          </div>
        )}
      </div>
    </div>
  );
};

export default RankReveal; 