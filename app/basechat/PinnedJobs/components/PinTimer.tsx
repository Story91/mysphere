'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Clock, Plus, Crown } from 'lucide-react';
import { formatTimeLeft } from '../utils/pinPricing';
import { PinDuration } from '../types/pinTypes';

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
    if (hoursLeft < 1) return 'text-red-500'; // Ostatnia godzina - czerwony
    if (hoursLeft < 6) return 'text-orange-500'; // Ostatnie 6 godzin - pomarańczowy
    return 'text-green-500'; // Więcej niż 6 godzin - zielony
  };

  const getProgressColor = () => {
    const hoursLeft = timeLeft / (60 * 60 * 1000);
    if (hoursLeft < 1) return 'bg-red-500';
    if (hoursLeft < 6) return 'bg-orange-500';
    return 'bg-green-500';
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
    <div className={`flex items-center justify-between p-2 sm:p-3 bg-gradient-to-r from-yellow-50/80 to-orange-50/80 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50 ${className}`}>
      <div className="flex items-center space-x-2 sm:space-x-3 flex-1">
        {/* Animated pin icon */}
        <div className="relative">
          <Crown className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        </div>
        
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <Clock className={`w-3 h-3 ${getTimerColor()}`} />
            <span className={`text-xs font-medium ${getTimerColor()}`}>
              {timeLeftFormatted} remaining
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-1000 ${getProgressColor()}`}
              style={{ width: `${getProgress()}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Extend button dla owner */}
      {isOwner && onExtendClick && (
        <button
          onClick={onExtendClick}
          className="flex items-center space-x-1 ml-2 sm:ml-3 px-2 sm:px-3 py-1 sm:py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-medium transition-all transform hover:scale-105 shadow-sm"
        >
          <Plus className="w-3 h-3" />
          <span>Extend</span>
        </button>
      )}
      
      {/* Pin type indicator */}
      <div className="ml-2 sm:ml-3 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-bold rounded-full">
        PAID
      </div>
    </div>
  );
} 