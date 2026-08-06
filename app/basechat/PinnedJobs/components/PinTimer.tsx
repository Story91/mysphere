'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Clock, Plus, Crown } from 'lucide-react';
import { formatTimeLeft } from '../utils/pinPricing';
import { PinDuration } from '../../../utils/firebase';

interface PinTimerProps {
  postId: string;
  expiresAt: number;
  isPaidPin: boolean;
  pinOwner?: string;
  duration?: PinDuration;
  onExtendClick?: () => void;
  className?: string;
}

export default function PinTimer({
  postId,
  expiresAt,
  isPaidPin,
  pinOwner,
  duration,
  onExtendClick,
  className = ''
}: PinTimerProps) {
  const { address } = useAccount();
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const remaining = expiresAt - Date.now();
      setTimeLeft(Math.max(0, remaining));
      setIsExpired(remaining <= 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  // Nie pokazuj timera dla admin pins lub wygasłych
  if (!isPaidPin || isExpired) {
    return null;
  }

  const isOwner = address && pinOwner && address.toLowerCase() === pinOwner.toLowerCase();
  const timeLeftFormatted = formatTimeLeft(timeLeft);
  
  // Określ kolor w zależności od pozostałego czasu
  const getTimerColor = () => {
    const hoursLeft = timeLeft / (60 * 60 * 1000);
    if (hoursLeft < 1) return 'text-red-700'; // Ostatnia godzina - czerwony
    if (hoursLeft < 6) return 'text-soft-accent-deep'; // Ostatnie 6 godzin - pomarańczowy
    return 'text-soft-ink-muted'; // Więcej niż 6 godzin - spokojny
  };

  const getProgressColor = () => {
    const hoursLeft = timeLeft / (60 * 60 * 1000);
    if (hoursLeft < 1) return 'bg-red-600';
    if (hoursLeft < 6) return 'bg-soft-accent';
    return 'bg-soft-primary';
  };

  // Oblicz progress bar (dla demonstracji - można zrobić dokładniej)
  const getProgress = () => {
    if (!duration) return 100;
    
    // Mockup - w prawdziwej implementacji potrzebujemy startTime
    const totalDuration = {
      'HOUR_1': 60 * 60 * 1000,
      'HOURS_6': 6 * 60 * 60 * 1000,
      'HOURS_24': 24 * 60 * 60 * 1000,
      'DAYS_7': 7 * 24 * 60 * 60 * 1000
    }[duration] || 24 * 60 * 60 * 1000;
    
    return Math.max(0, (timeLeft / totalDuration) * 100);
  };

  return (
    <div className={`flex items-center justify-between p-2 sm:p-3 bg-soft-surface rounded-card border-2 border-soft-accent font-soft ${className}`}>
      <div className="flex items-center space-x-2 sm:space-x-3 flex-1">
        {/* Animated pin icon */}
        <div className="relative">
          <Crown className="w-4 h-4 text-soft-accent-deep" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
        </div>
        
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <Clock className={`w-3 h-3 ${getTimerColor()}`} />
            <span className={`text-xs font-medium ${getTimerColor()}`}>
              {timeLeftFormatted} remaining
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-soft-sunken rounded-pill h-1.5">
            <div
              className={`h-1.5 rounded-pill transition-[width] duration-1000 ease-out-strong ${getProgressColor()}`}
              style={{ width: `${getProgress()}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Extend button dla owner */}
      {isOwner && onExtendClick && (
        <button
          onClick={onExtendClick}
          className="flex items-center space-x-1 ml-2 sm:ml-3 px-2 sm:px-3 py-1 sm:py-1.5 bg-soft-sunken hover:bg-soft-line text-soft-ink border border-soft-line rounded-pill text-xs font-semibold shadow-chip transition-[background-color,transform] duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
        >
          <Plus className="w-3 h-3" />
          <span>Extend</span>
        </button>
      )}
      
      {/* Pin type indicator */}
      <div className="ml-2 sm:ml-3 px-2 sm:px-2.5 py-0.5 sm:py-1 bg-soft-accent text-soft-ink font-soft-display text-xs font-bold rounded-pill">
        PAID
      </div>
    </div>
  );
} 