import React, { useState, useEffect } from 'react';
import CountUp from 'react-countup';

interface PointsRevealProps {
  totalPoints: number;
  onComplete: () => void;
}

export const PointsReveal: React.FC<PointsRevealProps> = ({
  totalPoints,
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
    }, 1000);

    return () => clearTimeout(timer);
  }, [isMounted]);

  if (!isMounted) {
    return <div></div>;
  }

  return (
    <div className="backdrop-blur-lg bg-black/40 p-8 border border-[#0052FF]/20 shadow-[0_0_15px_rgba(0,82,255,0.1)] relative">
      <div className="text-center">
        <div className="text-2xl font-mono font-bold text-[#0052FF] mb-4">
          TOTAL POINTS
        </div>
        <div className="text-5xl font-mono font-bold text-white">
          <CountUp
            end={totalPoints}
            duration={2.5}
            separator=","
            onEnd={onComplete}
          />
        </div>
      </div>
    </div>
  );
}; 