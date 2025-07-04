'use client';

import { useState, useEffect } from 'react';
import { getRecentTips, getBulkUserNamesOptimized, Tip } from '../../utils/firebase';
import { formatDistanceToNow } from 'date-fns';

interface RecentTipsProps {
  userAddress: string;
  limit?: number;
  className?: string;
}

export default function RecentTips({ userAddress, limit = 10, className = '' }: RecentTipsProps) {
  const [tips, setTips] = useState<Tip[]>([]);
  const [senderNames, setSenderNames] = useState<{[key: string]: {name: string, avatar?: string}}>({});
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchRecentTips = async () => {
      setLoading(true);
      try {
        const recentTips = await getRecentTips(userAddress, limit);
        setTips(recentTips);
        
        // 🚀 ULTRA-CHEAP: Pobierz nazwy nadawców (95% oszczędności!)
        if (recentTips.length > 0) {
          const senderAddresses = [...new Set(recentTips.map(tip => tip.senderAddress))];
          const names = await getBulkUserNamesOptimized(senderAddresses);
          setSenderNames(names);
          console.log(`💰 RecentTips: fetched ${senderAddresses.length} sender names with ultra-cheap method`);
        }
      } catch (error) {
        console.error('Error fetching recent tips:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentTips();
  }, [userAddress, limit]);

  const formatTimestamp = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (error) {
      return 'recently';
    }
  };

  const getSenderName = (address: string) => {
    const user = senderNames[address];
    if (user?.name) return user.name;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const displayedTips = showAll ? tips : tips.slice(0, 3);

  if (loading) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm ${className}`}>
        <div className="flex items-center space-x-2 mb-3">
          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded w-4 h-4"></div>
          <div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded w-20 h-4"></div>
        </div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse bg-gray-100 dark:bg-gray-700 rounded p-2 h-12"></div>
          ))}
        </div>
      </div>
    );
  }

  if (tips.length === 0) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm ${className}`}>
        <div className="flex items-center space-x-2 mb-3">
          <span className="text-lg">🎯</span>
          <h3 className="font-medium text-gray-900 dark:text-white">Recent Tips</h3>
        </div>
        <div className="text-center py-4">
          <span className="text-gray-500 dark:text-gray-400 text-sm">No tips received yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-lg">🎯</span>
          <h3 className="font-medium text-gray-900 dark:text-white">Recent Tips</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({tips.length})
          </span>
        </div>
        {tips.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {showAll ? 'Show Less' : 'Show All'}
          </button>
        )}
      </div>
      
      <div className="space-y-2">
        {displayedTips.map((tip) => (
          <div key={tip.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-800 rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-green-700 dark:text-green-300">
                  {tip.token === 'ETH' ? 'Ξ' : '$'}
                </span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {getSenderName(tip.senderAddress)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimestamp(tip.timestamp)}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {parseFloat(tip.amount).toFixed(tip.token === 'ETH' ? 4 : 2)} {tip.token}
                </div>
                {tip.txHash && (
                  <a
                    href={`https://basescan.org/tx/${tip.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center space-x-1"
                  >
                    <span>View TX</span>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { RecentTips }; 