'use client';

import React from 'react';
import { motion } from 'framer-motion';

// Add shimmer animation keyframes
const shimmerKeyframes = `
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
`;

// Inject styles once
if (typeof document !== 'undefined') {
  const styleId = 'base-card-shimmer-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = shimmerKeyframes;
    document.head.appendChild(style);
  }
}

interface BaseCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'solid' | 'gradient';
  hover?: boolean;
  glow?: boolean;
  onClick?: () => void;
}

export default function BaseCard({
  children,
  className = '',
  variant = 'default',
  hover = true,
  glow = false,
  onClick,
}: BaseCardProps) {
  const baseClasses = 'rounded-2xl overflow-hidden transition-all duration-300';

  const variantClasses = {
    default: 'bg-white/95 backdrop-blur-xl border border-[#0052FF]/10 shadow-lg',
    glass: 'bg-white/60 backdrop-blur-2xl border border-white/20 shadow-xl',
    solid: 'bg-white border border-gray-200 shadow-md',
    gradient: 'bg-gradient-to-br from-white via-blue-50/50 to-white border border-[#0052FF]/10 shadow-lg',
  };

  const hoverClasses = hover
    ? 'hover:shadow-xl hover:shadow-[#0052FF]/10 hover:border-[#0052FF]/30 hover:scale-[1.02] cursor-pointer'
    : '';

  const glowClasses = glow
    ? 'ring-2 ring-[#0052FF]/20 shadow-[0_0_30px_rgba(0,82,255,0.15)]'
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`${baseClasses} ${variantClasses[variant]} ${hoverClasses} ${glowClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}

// Card Header Component
export function BaseCardHeader({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-6 border-b border-gray-100 ${className}`}>
      {children}
    </div>
  );
}

// Card Content Component
export function BaseCardContent({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

// Card Footer Component
export function BaseCardFooter({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-6 pt-0 border-t border-gray-100 ${className}`}>
      {children}
    </div>
  );
}

// Stats Card Variant with loading states
export function BaseStatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className = '',
  isLoading = false,
  isLoaded = false,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  className?: string;
  isLoading?: boolean;
  isLoaded?: boolean;
}) {
  // Determine border/ring styling based on state
  const stateClasses = isLoading
    ? 'ring-2 ring-[#0052FF] ring-opacity-50 animate-pulse'
    : isLoaded
      ? 'ring-2 ring-green-400 ring-opacity-50'
      : '';

  return (
    <BaseCard variant="gradient" className={`${className} ${stateClasses} transition-all duration-300`}>
      <div className="p-6 relative">
        {/* Loading overlay */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/5 via-[#00A3FF]/10 to-[#0052FF]/5 rounded-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shimmer" 
              style={{ 
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite linear'
              }}
            />
          </motion.div>
        )}

        {/* Success flash */}
        {isLoaded && (
          <motion.div
            initial={{ opacity: 0.5, scale: 1.05 }}
            animate={{ opacity: 0, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-green-400/20 rounded-2xl"
          />
        )}

        <div className="flex items-start justify-between relative z-10">
          <div>
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">
              {title}
            </p>
            <motion.h3 
              key={value}
              initial={isLoaded ? { scale: 1.1, color: '#0052FF' } : false}
              animate={{ scale: 1, color: '#111827' }}
              transition={{ duration: 0.3 }}
              className="mt-2 text-3xl font-bold text-gray-900"
            >
              {isLoading ? (
                <span className="inline-block w-16 h-8 bg-gray-200 rounded animate-pulse" />
              ) : (
                typeof value === 'number' ? value.toLocaleString() : value
              )}
            </motion.h3>
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            )}
            {trend && (
              <div className={`mt-2 flex items-center text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <span>{trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
              </div>
            )}
          </div>
          {icon && (
            <motion.div 
              className={`p-3 rounded-xl transition-all duration-300 ${
                isLoading 
                  ? 'bg-[#0052FF]/20 animate-bounce' 
                  : isLoaded
                    ? 'bg-green-100 text-green-600'
                    : 'bg-[#0052FF]/10 text-[#0052FF]'
              }`}
              animate={isLoading ? { y: [0, -4, 0] } : {}}
              transition={{ repeat: Infinity, duration: 0.6 }}
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin" />
              ) : (
                icon
              )}
            </motion.div>
          )}
        </div>
      </div>
    </BaseCard>
  );
}

