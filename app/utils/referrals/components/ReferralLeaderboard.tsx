'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { FiTrendingUp, FiAward, FiUsers, FiChevronDown } from 'react-icons/fi';
import GlobalLeaderboardModal from './GlobalLeaderboardModal';

interface LeaderboardEntry {
  userId: string;
  userName?: string;
  totalReferrals: number;
  successfulReferrals: number;
  totalRewards: number;
  rank?: number;
}

export default function ReferralLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'all' | 'monthly' | 'weekly'>('all');
  const [showGlobalModal, setShowGlobalModal] = useState(false);

  useEffect(() => {
    loadLeaderboard();
  }, [timeFilter]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      // Query top 5 referrers from Firebase
      const statsQuery = query(
        collection(db, 'referralStats'),
        orderBy('successfulReferrals', 'desc'),
        limit(5)
      );
      
      const snapshot = await getDocs(statsQuery);
      const entries: LeaderboardEntry[] = [];
      
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        entries.push({
          userId: data.userId,
          userName: data.userName || `${data.userId.slice(0, 6)}...${data.userId.slice(-4)}`,
          totalReferrals: data.totalReferrals || 0,
          successfulReferrals: data.successfulReferrals || 0,
          totalRewards: data.totalRewards || 0,
          rank: 0 // Will be assigned after sorting
        });
      });
      
      // Sort by successfulReferrals first, then by totalRewards
      entries.sort((a, b) => {
        if (b.successfulReferrals !== a.successfulReferrals) {
          return b.successfulReferrals - a.successfulReferrals;
        }
        return b.totalRewards - a.totalRewards;
      });
      
      // Assign ranks
      entries.forEach((entry, index) => {
        entry.rank = index + 1;
      });
      
      setLeaderboard(entries);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMedalColor = (rank: number) => {
    switch(rank) {
      case 1: return 'from-yellow-400 to-yellow-600'; // Gold
      case 2: return 'from-gray-300 to-gray-500'; // Silver
      case 3: return 'from-orange-400 to-orange-600'; // Bronze
      default: return 'from-blue-400 to-blue-600';
    }
  };

  const getMedalEmoji = (rank: number) => {
    switch(rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '🏆';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FiAward className="text-xl" />
            Referral Leaders
          </h3>
          <div className="flex items-center gap-1 bg-white/20 rounded-lg p-1">
            {(['all', 'monthly', 'weekly'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  timeFilter === filter
                    ? 'bg-white text-purple-600'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                {filter === 'all' ? 'All Time' : filter === 'monthly' ? 'Month' : 'Week'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard List */}
      <div className="p-4">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mt-1"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <FiUsers className="text-3xl mx-auto mb-2 opacity-50" />
            <p className="text-sm">No referral data yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center space-x-3 p-2 rounded-lg transition-all hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  index < 3 ? 'bg-gradient-to-r from-transparent ' + (index === 0 ? 'to-yellow-50 dark:to-yellow-900/20' : index === 1 ? 'to-gray-50 dark:to-gray-700/20' : 'to-orange-50 dark:to-orange-900/20') : ''
                }`}
              >
                {/* Rank Badge */}
                <div className={`relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br ${getMedalColor(entry.rank || 0)} text-white font-bold text-sm`}>
                  {index < 3 ? (
                    <span className="text-lg">{getMedalEmoji(entry.rank || 0)}</span>
                  ) : (
                    <span>{entry.rank}</span>
                  )}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {entry.userName}
                    </p>
                    {index === 0 && (
                      <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs rounded-full font-medium">
                        TOP
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <FiUsers className="w-3 h-3" />
                      {entry.successfulReferrals} referrals
                    </span>
                    <span className="flex items-center gap-1">
                      <FiTrendingUp className="w-3 h-3" />
                      {entry.totalRewards} pts
                    </span>
                  </div>
                </div>

                {/* Points Badge */}
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {entry.totalRewards}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    points
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* View All Button */}
        {!loading && leaderboard.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowGlobalModal(true)}
              className="w-full px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-700 transition-all duration-300 flex items-center justify-center space-x-2"
            >
              <span>View All</span>
              <FiChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Global Leaderboard Modal */}
      <GlobalLeaderboardModal 
        isOpen={showGlobalModal}
        onClose={() => setShowGlobalModal(false)}
      />
    </motion.div>
  );
}
