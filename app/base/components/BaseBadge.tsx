'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface BaseBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'premium';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

export default function BaseBadge({
  children,
  variant = 'default',
  size = 'md',
  icon,
  pulse = false,
  className = '',
}: BaseBadgeProps) {
  const baseClasses = 'inline-flex items-center font-semibold rounded-full transition-all duration-300';

  const variantClasses = {
    default: 'bg-[#0052FF]/10 text-[#0052FF] border border-[#0052FF]/20',
    success: 'bg-green-100 text-green-700 border border-green-200',
    warning: 'bg-amber-100 text-amber-700 border border-amber-200',
    error: 'bg-red-100 text-red-700 border border-red-200',
    info: 'bg-blue-100 text-blue-700 border border-blue-200',
    premium: 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg shadow-[#0052FF]/25',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
    lg: 'px-4 py-1.5 text-base gap-2',
  };

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className} ${
        pulse ? 'animate-pulse' : ''
      }`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </motion.span>
  );
}

// Rank Badge Component
export function RankBadge({
  rank,
  size = 'md',
  showIcon = true,
}: {
  rank: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}) {
  const rankConfig: Record<string, { color: string; icon: string; gradient: string }> = {
    Newbie: {
      color: 'text-gray-600',
      icon: '🌱',
      gradient: 'from-gray-400 to-gray-500',
    },
    Explorer: {
      color: 'text-orange-600',
      icon: '🧭',
      gradient: 'from-orange-400 to-orange-500',
    },
    Trader: {
      color: 'text-yellow-600',
      icon: '💰',
      gradient: 'from-yellow-400 to-yellow-500',
    },
    Investor: {
      color: 'text-green-600',
      icon: '📈',
      gradient: 'from-green-400 to-green-500',
    },
    Whale: {
      color: 'text-blue-600',
      icon: '🐋',
      gradient: 'from-blue-400 to-blue-500',
    },
    Legend: {
      color: 'text-purple-600',
      icon: '👑',
      gradient: 'from-purple-400 to-purple-500',
    },
  };

  const config = rankConfig[rank] || rankConfig.Newbie;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-1.5 font-bold rounded-full bg-gradient-to-r ${config.gradient} text-white shadow-md ${sizeClasses[size]}`}
    >
      {showIcon && <span>{config.icon}</span>}
      <span>{rank}</span>
    </motion.span>
  );
}

// Achievement Badge Component
export function AchievementBadge({
  title,
  description,
  icon,
  unlocked = false,
  className = '',
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  unlocked?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${
        unlocked
          ? 'bg-gradient-to-r from-[#0052FF]/10 to-[#00A3FF]/10 border border-[#0052FF]/20'
          : 'bg-gray-100 border border-gray-200 opacity-50'
      } ${className}`}
    >
      <div
        className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          unlocked
            ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white'
            : 'bg-gray-300 text-gray-500'
        }`}
      >
        {icon}
      </div>
      <div>
        <h4 className={`font-semibold ${unlocked ? 'text-gray-900' : 'text-gray-500'}`}>
          {title}
        </h4>
        <p className={`text-sm ${unlocked ? 'text-gray-600' : 'text-gray-400'}`}>
          {description}
        </p>
      </div>
      {unlocked && (
        <div className="ml-auto">
          <span className="text-green-500 text-xl">✓</span>
        </div>
      )}
    </motion.div>
  );
}

