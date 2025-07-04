'use client';

import { useState, useEffect } from 'react';
import { getUserTipStats, getPostTipStats, TipStats as TipStatsType, PostTipStats } from '../../utils/firebase';

interface TipStatsProps {
  userAddress?: string;
  postId?: string;
  className?: string;
}

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
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="flex items-center space-x-1 bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-full px-3 py-1">
          <span className="text-xs">💰</span>
          <span className="text-xs font-medium text-green-700 dark:text-green-300">
            {userStats.ethReceived > 0 && (
              <span>{userStats.ethReceived.toFixed(4)} ETH</span>
            )}
            {userStats.ethReceived > 0 && userStats.usdcReceived > 0 && (
              <span className="mx-1">+</span>
            )}
            {userStats.usdcReceived > 0 && (
              <span>${userStats.usdcReceived.toFixed(2)} USDC</span>
            )}
          </span>
          <span className="text-xs text-green-600 dark:text-green-400">
            ({userStats.tipCount} tips)
          </span>
        </div>
      </div>
    );
  }

  // Post stats (for individual posts)
  if (postId && postStats && postStats.tipCount > 0) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="flex items-center space-x-1 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-full px-2 py-1">
          <span className="text-xs">🎯</span>
          <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">
            {postStats.ethTips > 0 && (
              <span>{postStats.ethTips.toFixed(4)} ETH</span>
            )}
            {postStats.ethTips > 0 && postStats.usdcTips > 0 && (
              <span className="mx-1">+</span>
            )}
            {postStats.usdcTips > 0 && (
              <span>${postStats.usdcTips.toFixed(2)} USDC</span>
            )}
          </span>
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            ({postStats.uniqueTippers} tippers)
          </span>
        </div>
      </div>
    );
  }

  return null;
}

export { TipStats }; 