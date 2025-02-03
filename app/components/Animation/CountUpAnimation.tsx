import React, { useState, useEffect } from 'react';

interface CountUpAnimationProps {
  endValue: number;
  onComplete: () => void;
}

export const CountUpAnimation: React.FC<CountUpAnimationProps> = ({
  endValue,
  onComplete
}) => {
  const [count, setCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  
  useEffect(() => {
    const duration = 2000; // 2 sekundy
    const steps = 60;
    const increment = endValue / steps;
    let current = 0;
    
    const interval = setInterval(() => {
      current += 1;
      if (current >= steps) {
        setCount(endValue);
        setIsComplete(true);
        clearInterval(interval);
        onComplete();
      } else {
        setCount(prev => Math.min(endValue, prev + increment));
      }
    }, duration / steps);
    
    return () => clearInterval(interval);
  }, [endValue]);

  return (
    <div className="relative inline-block">
      <div className="text-6xl font-mono font-bold text-white relative z-10">
        {Math.floor(count).toLocaleString()} <span className="text-[#0052FF]">PTS</span>
      </div>
      <div 
        className={`absolute inset-0 bg-gradient-to-r from-transparent via-[#0052FF15] to-transparent transition-opacity duration-300 ${
          isComplete ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          animation: isComplete ? 'gradient-x 2s linear infinite' : 'none'
        }}
      />
    </div>
  );
};

export default CountUpAnimation; 