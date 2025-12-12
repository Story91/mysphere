'use client';

import { useState, useEffect } from 'react';
import { getUserTipStats, getPostTipStats, TipStats as TipStatsType, PostTipStats } from '../../utils/firebase';
import { TOKENS, TipToken } from './TipNetworkConfig';

interface TipStatsProps {
  userAddress?: string;
  postId?: string;
  className?: string;
}

// Komponent ikony tokena
const TokenIcon = ({ token, size = 'sm' }: { token: TipToken; size?: 'sm' | 'md' }) => {
  const tokenConfig = TOKENS[token];
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  
  if (tokenConfig?.iconUrl) {
    return (
      <img 
        src={tokenConfig.iconUrl} 
        alt={tokenConfig.name} 
        className={`${sizeClass} object-contain rounded-full inline-block`}
        title={tokenConfig.name}
      />
    );
  }
  
  return (
    <span 
      className={size === 'sm' ? 'text-xs' : 'text-sm'}
      title={tokenConfig?.name || token}
    >
      {tokenConfig?.icon || '💰'}
    </span>
  );
};

// Formatuje wartość tokena
const formatTokenAmount = (amount: number, token: TipToken): string => {
  const decimals = TOKENS[token].decimals;
  if (decimals === 6) {
    return amount.toFixed(2);
  }
  // Dla tokenów z dużą precyzją, pokaż mniej miejsc jeśli wartość jest większa
  if (amount >= 1) {
    return amount.toFixed(4);
  }
  return amount.toFixed(6);
};

export default function TipStats({ userAddress, postId, className = '' }: TipStatsProps) {
  const [userStats, setUserStats] = useState<TipStatsType | null>(null);
  const [postStats, setPostStats] = useState<PostTipStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        if (userAddress) {
          const stats = await getUserTipStats(userAddress);
          setUserStats(stats);
        }
        
        if (postId) {
          const stats = await getPostTipStats(postId);
          setPostStats(stats);
        }
      } catch (error) {
        console.error('Error fetching tip stats:', error);
      } finally {
        setLoading(false);
      }
    };

    if (userAddress || postId) {
      fetchStats();
    }
  }, [userAddress, postId]);

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded px-2 py-1 text-xs">
          Loading...
        </div>
      </div>
    );
  }

  // User stats (for profiles)
  if (userAddress && userStats && userStats.tipCount > 0) {
    const tokenAmounts = [
      { token: 'ETH' as TipToken, amount: userStats.ethReceived },
      { token: 'USDC' as TipToken, amount: userStats.usdcReceived },
      { token: 'CELO' as TipToken, amount: userStats.celoReceived },
      { token: 'WLD' as TipToken, amount: userStats.wldReceived },
      { token: 'LINEA' as TipToken, amount: userStats.lineaReceived },
      { token: 'CAMP' as TipToken, amount: userStats.campReceived },
    ].filter(t => t.amount > 0);

    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="flex items-center space-x-1 bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full px-3 py-1">
          <span className="text-xs">💰</span>
          <div className="flex items-center space-x-2 text-xs font-medium text-green-700 dark:text-green-300">
            {tokenAmounts.map(({ token, amount }) => (
              <span key={token} className="flex items-center" title={`${amount} ${token}`}>
                <TokenIcon token={token} />
                <span className="ml-0.5">{formatTokenAmount(amount, token)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Post stats (for individual posts)
  if (postId && postStats && postStats.tipCount > 0) {
    const tokenAmounts = [
      { token: 'ETH' as TipToken, amount: postStats.ethTips },
      { token: 'USDC' as TipToken, amount: postStats.usdcTips },
      { token: 'CELO' as TipToken, amount: postStats.celoTips },
      { token: 'WLD' as TipToken, amount: postStats.wldTips },
      { token: 'LINEA' as TipToken, amount: postStats.lineaTips },
      { token: 'CAMP' as TipToken, amount: postStats.campTips },
    ].filter(t => t.amount > 0);

    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="flex items-center space-x-1 bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-900/40 dark:to-cyan-900/40 border border-blue-300 dark:border-blue-600 rounded-full px-2 py-1">
          <span className="text-xs">🎯</span>
          <div className="flex items-center space-x-2 text-xs font-medium text-blue-700 dark:text-blue-300">
            {tokenAmounts.map(({ token, amount }) => (
              <span key={token} className="flex items-center" title={`${amount} ${token}`}>
                <TokenIcon token={token} />
                <span className="ml-0.5">{formatTokenAmount(amount, token)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export { TipStats };
