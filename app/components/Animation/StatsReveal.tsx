import React, { useState, useEffect } from 'react';
import CountUp from 'react-countup';

interface StatsRevealProps {
  label: string;
  value: number;
  points: number;
  description: string;
  onComplete: () => void;
}

export const StatsReveal: React.FC<StatsRevealProps> = ({
  label,
  value,
  points,
  description,
  onComplete
}) => {
  const [showPoints, setShowPoints] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    
    const timer = setTimeout(() => {
      setShowPoints(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [isMounted]);

  const handlePointsComplete = () => {
    setTimeout(() => {
      onComplete();
    }, 1000);
  };

  if (!isMounted) {
    return <div></div>;
  }

  return (
    <div className="backdrop-blur-lg bg-black/40 p-4 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative">
      <div className="text-center">
        <div className="text-sm font-mono text-white mb-2">
          {label}
        </div>
        <div className="text-3xl font-mono font-bold text-[#0052FF] mb-2">
          <CountUp
            end={value}
            duration={2}
            onEnd={() => setShowPoints(true)}
          />
        </div>
        {showPoints && (
          <div className="text-xs font-mono text-gray-500 animate-fadeIn">
            <CountUp
              end={points}
              duration={1.5}
              prefix="+"
              suffix=" PTS"
              onEnd={handlePointsComplete}
            />
          </div>
        )}
        <div className="text-xs font-mono text-gray-400 mt-2">
          {description}
        </div>
      </div>
    </div>
  );
};

export default StatsReveal; 