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
import { FiX, FiSearch, FiChevronRight } from 'react-icons/fi';

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
      
      // Safety clamp of points for UI (defensive until backend rebuild completes)
      const rewardPerReferral = 100; // sync with DEFAULT_REFERRAL_CONFIG
      const firstPostBonus = 50;
      const maxMilestone = 5000; // highest milestone
      const safeEntries = entries.map((e) => {
        const theoreticalMax = (e.successfulReferrals * (rewardPerReferral + firstPostBonus)) + maxMilestone;
        return { ...e, totalRewards: Math.min(e.totalRewards, theoreticalMax) };
      });

      // Assign ranks
      safeEntries.forEach((entry, index) => {
        entry.rank = (reset ? 0 : leaderboard.length) + index + 1;
      });
      
      if (reset) {
        setLeaderboard(safeEntries);
      } else {
        setLeaderboard(prev => [...prev, ...safeEntries]);
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

  // Ranga to numer, nie tecza gradientow. Pierwsza trojka rozni sie sila
  // wypelnienia, reszta zostaje neutralna.
  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-soft-primary text-white';
    if (rank <= 3) return 'bg-soft-primary/15 text-soft-primary-deep';
    return 'bg-soft-sunken text-soft-ink-soft';
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
            className="fixed inset-0 bg-soft-ink/40 z-[100]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-3 md:inset-8 lg:inset-16 bg-soft-surface rounded-card shadow-float z-[101] overflow-hidden flex flex-col max-w-4xl mx-auto"
          >
            {/* Header */}
            <div className="border-b border-soft-line px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-soft-ink-faint">Leaderboard</p>
                  <h2 className="mt-0.5 font-soft-display text-xl font-bold leading-tight text-soft-ink sm:text-2xl">
                    Top referrers
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close leaderboard"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-soft-sunken text-soft-ink-muted transition-transform duration-[--dur-press] ease-out-strong hover:bg-soft-line hover:text-soft-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              {/* Search */}
              <div className="relative mt-3">
                <FiSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-soft-ink-faint" />
                <input
                  type="text"
                  placeholder="Search by username or address"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search the leaderboard"
                  className="w-full rounded-pill bg-soft-sunken py-2 pl-10 pr-4 font-soft text-sm text-soft-ink placeholder:text-soft-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
              {loading && leaderboard.length === 0 ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-[4.5rem] animate-pulse rounded-card bg-soft-sunken"></div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLeaderboard.map((entry, index) => (
                    <motion.div
                      key={entry.userId}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="rounded-card border border-soft-line p-3 transition-colors duration-[--dur-press] ease-out-strong hover:bg-soft-sunken"
                    >
                      <div className="flex items-center gap-3">
                        {/* Rank Badge */}
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-soft-display text-base font-bold tabular-nums ${getRankStyle(entry.rank)}`}>
                          {entry.rank}
                        </div>

                        {/* User Info */}
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate font-soft-display text-sm font-bold text-soft-ink">
                            {entry.userName}
                          </h4>
                          <p className="truncate font-soft text-xs tabular-nums text-soft-ink-faint">
                            {entry.userId.slice(0, 6)}...{entry.userId.slice(-4)}
                          </p>
                          <p className="mt-1 font-soft text-xs tabular-nums text-soft-ink-muted">
                            {entry.successfulReferrals} active
                            <span className="mx-1.5 text-soft-ink-faint">·</span>
                            {entry.totalReferrals} invited
                          </p>
                        </div>

                        {/* Punkty - jedyna wartosc w kolorze pieniedzy */}
                        <div className="shrink-0 text-right">
                          <p className="font-soft-display text-xl font-bold leading-none tabular-nums text-soft-accent-deep">
                            {entry.totalRewards}
                          </p>
                          <p className="mt-1 font-soft text-[0.625rem] uppercase tracking-wide text-soft-ink-faint">
                            points
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  {/* Load More Button */}
                  {hasMore && !searchTerm && (
                    <div className="flex justify-center pt-3">
                      <button
                        onClick={loadNextPage}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 rounded-pill bg-soft-sunken px-5 py-2.5 text-sm font-semibold text-soft-primary-deep transition-transform duration-[--dur-press] ease-out-strong hover:bg-soft-line active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                      >
                        {loading ? (
                          <>
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-soft-line border-t-soft-primary"></div>
                            <span>Loading</span>
                          </>
                        ) : (
                          <>
                            <span>Load more</span>
                            <FiChevronRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {filteredLeaderboard.length === 0 && !loading && (
                    <div className="py-12 text-center">
                      <FiSearch className="mx-auto mb-3 h-8 w-8 text-soft-ink-faint" />
                      <h3 className="font-soft-display text-base font-bold text-soft-ink">
                        {searchTerm ? 'Nothing matches that search' : 'Nothing to rank yet'}
                      </h3>
                      <p className="mx-auto mt-1 max-w-sm font-soft text-sm text-soft-ink-soft">
                        {searchTerm
                          ? 'Search only covers the entries loaded so far - try loading more, or a shorter phrase.'
                          : "Either nobody has referred anyone so far, or the list didn't load."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer - bez obietnicy "updated in real-time": dane sa pobierane
                przy otwarciu modala i przy "Load more", nie na zywo. */}
            <div className="border-t border-soft-line px-4 py-3 sm:px-6">
              <p className="font-soft text-xs tabular-nums text-soft-ink-soft">
                Showing {filteredLeaderboard.length} {filteredLeaderboard.length === 1 ? 'entry' : 'entries'}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
