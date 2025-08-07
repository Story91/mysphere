'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  startAfter,
  DocumentSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase';
import { FiX, FiAward, FiTrendingUp, FiSearch, FiChevronLeft, FiChevronRight } from 'react-icons/fi';

interface LeaderboardEntry {
  userId: string;
  userName?: string;
  totalReferrals: number;
  successfulReferrals: number;
  totalRewards: number;
  rank: number;
}

interface GlobalLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ITEMS_PER_PAGE = 20;

export default function GlobalLeaderboardModal({ isOpen, onClose }: GlobalLeaderboardModalProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadLeaderboard(true);
    }
  }, [isOpen]);

  const loadLeaderboard = async (reset = false) => {
    if (loading) return;
    
    setLoading(true);
    try {
      let leaderboardQuery;
      
      if (reset) {
        // Reset pagination
        setCurrentPage(1);
        setLastDoc(null);
        leaderboardQuery = query(
          collection(db, 'referralStats'),
          orderBy('successfulReferrals', 'desc'),
          limit(ITEMS_PER_PAGE)
        );
      } else if (lastDoc) {
        // Pagination
        leaderboardQuery = query(
          collection(db, 'referralStats'),
          orderBy('successfulReferrals', 'desc'),
          startAfter(lastDoc),
          limit(ITEMS_PER_PAGE)
        );
      } else {
        setLoading(false);
        return;
      }
      
      const snapshot = await getDocs(leaderboardQuery);
      const entries: LeaderboardEntry[] = [];
      
      snapshot.docs.forEach((doc, index) => {
        const data = doc.data();
        const globalRank = reset ? index + 1 : leaderboard.length + index + 1;
        
        entries.push({
          userId: data.userId,
          userName: data.userName || `${data.userId.slice(0, 6)}...${data.userId.slice(-4)}`,
          totalReferrals: data.totalReferrals || 0,
          successfulReferrals: data.successfulReferrals || 0,
          totalRewards: data.totalRewards || 0,
          rank: globalRank
        });
      });
      
      if (reset) {
        setLeaderboard(entries);
      } else {
        setLeaderboard(prev => [...prev, ...entries]);
      }
      
      setHasMore(snapshot.docs.length === ITEMS_PER_PAGE);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      
    } catch (error) {
      console.error('Error loading global leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNextPage = () => {
    if (hasMore && !loading) {
      setCurrentPage(prev => prev + 1);
      loadLeaderboard(false);
    }
  };

  const filteredLeaderboard = leaderboard.filter(entry => 
    entry.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.userId.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 md:inset-8 lg:inset-16 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[101] overflow-hidden flex flex-col max-w-4xl mx-auto"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-600 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <FiAward className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Global Referral Leaderboard</h2>
                    <p className="text-sm text-white/80">Top referrers in the BaseChat community</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
                >
                  <FiX className="w-6 h-6" />
                </button>
              </div>

              {/* Search */}
              <div className="mt-4 relative">
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by username or address..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/20 text-white placeholder-white/70 rounded-lg border border-white/30 focus:border-white/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading && leaderboard.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeaderboard.map((entry, index) => (
                    <motion.div
                      key={entry.userId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          {/* Rank Badge */}
                          <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${getMedalColor(entry.rank)} flex items-center justify-center text-white font-bold shadow-lg`}>
                            <span className="text-lg">{entry.rank <= 3 ? getMedalEmoji(entry.rank) : entry.rank}</span>
                          </div>

                          {/* User Info */}
                          <div>
                            <h4 className="font-semibold text-gray-900 dark:text-white">
                              {entry.userName}
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {entry.userId.slice(0, 6)}...{entry.userId.slice(-4)}
                            </p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center space-x-6 text-sm">
                          <div className="text-center">
                            <p className="font-bold text-green-600 dark:text-green-400">
                              {entry.successfulReferrals}
                            </p>
                            <p className="text-gray-500 dark:text-gray-400">Successful</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-blue-600 dark:text-blue-400">
                              {entry.totalReferrals}
                            </p>
                            <p className="text-gray-500 dark:text-gray-400">Total</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-purple-600 dark:text-purple-400">
                              {entry.totalRewards}
                            </p>
                            <p className="text-gray-500 dark:text-gray-400">Points</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  {/* Load More Button */}
                  {hasMore && !searchTerm && (
                    <div className="flex justify-center mt-6">
                      <button
                        onClick={loadNextPage}
                        disabled={loading}
                        className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                      >
                        {loading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <FiChevronRight className="w-4 h-4" />
                            <span>Load More</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {filteredLeaderboard.length === 0 && !loading && (
                    <div className="text-center py-12">
                      <div className="text-gray-400 dark:text-gray-500 mb-2">
                        <FiSearch className="w-12 h-12 mx-auto mb-4" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                        No results found
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400">
                        Try adjusting your search terms
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
                <p>Showing {filteredLeaderboard.length} entries</p>
                <p>Updated in real-time</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
