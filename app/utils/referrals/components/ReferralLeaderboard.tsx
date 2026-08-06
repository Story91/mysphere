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
import { FiUsers, FiChevronDown } from 'react-icons/fi';
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
      
      // Safety clamp: points cannot exceed logical max based on referrals (defensive UI)
      const rewardPerReferral = 100; // sync with DEFAULT_REFERRAL_CONFIG
      const firstPostBonus = 50;
      const maxMilestone = 5000; // highest milestone
      const safeEntries = entries.map((e) => {
        const theoreticalMax = (e.successfulReferrals * (rewardPerReferral + firstPostBonus)) + maxMilestone;
        return { ...e, totalRewards: Math.min(e.totalRewards, theoreticalMax) };
      });

      // Assign ranks
      safeEntries.forEach((entry, index) => {
        entry.rank = index + 1;
      });
      
      setLeaderboard(safeEntries);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  // Wczesniej kazda pozycja dostawala wlasny gradient i emoji medalu - piec
  // roznych kolorow na piec wierszy. Teraz rozroznia je sama waga: pierwszy ma
  // wypelniony krazek, kolejne sam numer.
  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-soft-primary text-white';
    if (rank <= 3) return 'bg-soft-primary/15 text-soft-primary-deep';
    return 'bg-soft-sunken text-soft-ink-soft';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-soft-surface rounded-card shadow-card overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-soft-display text-base font-bold text-soft-ink">
            Referral leaders
          </h3>
          <div className="flex items-center gap-0.5 rounded-pill bg-soft-sunken p-0.5">
            {(['all', 'monthly', 'weekly'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`rounded-pill px-2.5 py-1 text-xs font-semibold transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                  timeFilter === filter
                    ? 'bg-soft-surface text-soft-ink shadow-chip'
                    : 'text-soft-ink-muted hover:text-soft-ink'
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
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3">
                <div className="h-8 w-8 shrink-0 rounded-full bg-soft-sunken"></div>
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 rounded-pill bg-soft-sunken"></div>
                  <div className="h-2.5 w-1/2 rounded-pill bg-soft-sunken"></div>
                </div>
              </div>
            ))}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="py-8 text-center">
            <FiUsers className="mx-auto mb-2 h-7 w-7 text-soft-ink-faint" />
            <p className="font-soft-display text-sm font-bold text-soft-ink">
              Nothing to rank yet
            </p>
            <p className="mx-auto mt-1 max-w-[15rem] font-soft text-xs text-soft-ink-soft">
              Either nobody has referred anyone so far, or the list didn&apos;t load.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {leaderboard.map((entry, index) => (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3 rounded-card px-2 py-2 transition-colors duration-[--dur-press] ease-out-strong hover:bg-soft-sunken"
              >
                {/* Rank Badge */}
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-soft-display text-sm font-bold tabular-nums ${getRankStyle(entry.rank || 0)}`}>
                  {entry.rank}
                </div>

                {/* User Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-soft-display text-sm font-semibold text-soft-ink">
                    {entry.userName}
                  </p>
                  <p className="font-soft text-xs tabular-nums text-soft-ink-faint">
                    {entry.successfulReferrals} referrals
                  </p>
                </div>

                {/* Points Badge - jedyny kolor pieniedzy w tym wierszu */}
                <div className="shrink-0 text-right">
                  <div className="font-soft-display text-base font-bold leading-none tabular-nums text-soft-accent-deep">
                    {entry.totalRewards}
                  </div>
                  <div className="mt-0.5 font-soft text-[0.625rem] uppercase tracking-wide text-soft-ink-faint">
                    pts
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* View All Button */}
        {!loading && leaderboard.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowGlobalModal(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-pill bg-soft-sunken px-4 py-2 text-sm font-semibold text-soft-primary-deep transition-transform duration-[--dur-press] ease-out-strong hover:bg-soft-line active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
            >
              <span>View all</span>
              <FiChevronDown className="h-4 w-4" />
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
