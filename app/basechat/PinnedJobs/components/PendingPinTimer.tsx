'use client';

import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { PinDuration } from '../../../utils/firebase';
import { PAID_PIN_CONTRACT_CONFIG } from '../config/contractConfig';

interface PendingPinTimerProps {
  postId: string;
  txHash: string;
  expectedAt: number;
  duration: PinDuration;
  className?: string;
}

export default function PendingPinTimer({
  postId,
  txHash,
  expectedAt,
  duration,
  className = ''
}: PendingPinTimerProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const remaining = expectedAt - Date.now();
      setTimeLeft(Math.max(0, remaining));
      setIsExpired(remaining <= 0);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expectedAt]);

  const formatTimeLeft = (timeLeft: number): string => {
    if (timeLeft <= 0) return 'Confirmation overdue';
    
    const minutes = Math.floor(timeLeft / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s remaining`;
    } else {
      return `${seconds}s remaining`;
    }
  };

  const getDurationLabel = (duration: PinDuration): string => {
    const labels: Record<PinDuration, string> = {
      'HOUR_1': '1 Hour',
      'HOURS_6': '6 Hours', 
      'HOURS_24': '24 Hours',
      'DAYS_7': '7 Days'
    };
    return labels[duration] || duration;
  };

  const getTimerColor = () => {
    if (isExpired) return 'text-red-700';
    if (timeLeft < 2 * 60 * 1000) return 'text-soft-accent-deep'; // < 2 minutes
    return 'text-soft-primary-deep';
  };

  const getProgressColor = () => {
    if (isExpired) return 'bg-red-600';
    if (timeLeft < 2 * 60 * 1000) return 'bg-soft-accent'; // < 2 minutes
    return 'bg-soft-primary';
  };

  const getProgress = () => {
    const totalTime = 90 * 1000; // 1.5 minutes expected
    const elapsed = totalTime - timeLeft;
    return Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
  };

  return (
    <div className={`flex items-center justify-between p-3 bg-soft-surface rounded-card border-2 border-soft-line-strong font-soft ${className}`}>
      <div className="flex items-center space-x-3 flex-1">
        {/* Animated pending icon */}
        <div className="relative">
          <Clock className="w-4 h-4 text-soft-primary-deep animate-pulse" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-soft-primary rounded-full animate-ping"></div>
        </div>
        
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <AlertCircle className={`w-3 h-3 ${getTimerColor()}`} />
            <span className={`text-xs font-medium ${getTimerColor()}`}>
              {isExpired ? 'Checking blockchain...' : `Pin confirmation: ${formatTimeLeft(timeLeft)}`}
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-soft-sunken rounded-pill h-1.5">
            <div
              className={`h-1.5 rounded-pill transition-[width] duration-1000 ease-out-strong ${getProgressColor()}`}
              style={{ width: `${getProgress()}%` }}
            ></div>
          </div>

          <div className="text-xs text-soft-ink-muted mt-1">
            Purchasing: {getDurationLabel(duration)} pin
          </div>
        </div>
      </div>

      {/* Transaction link */}
      <div className="flex items-center space-x-2 ml-3">
        <a
          href={`${PAID_PIN_CONTRACT_CONFIG.blockExplorer}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-1 px-2.5 py-1 bg-soft-sunken hover:bg-soft-line text-soft-ink border border-soft-line rounded-pill text-xs font-semibold transition-[background-color,transform] duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
        >
          <ExternalLink className="w-3 h-3" />
          <span>TX</span>
        </a>
        
        {/* Pin type indicator */}
        <div className="px-2 py-0.5 bg-soft-sunken text-soft-primary-deep font-soft-display text-xs font-bold rounded-pill">
          PENDING
        </div>
      </div>
    </div>
  );
} 