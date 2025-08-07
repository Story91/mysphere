'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiUsers, 
  FiGift, 
  FiTrendingUp, 
  FiCopy, 
  FiCheck,
  FiShare2,
  FiAward,
  FiClock,
  FiUserCheck,
  FiUserPlus
} from 'react-icons/fi';
import { 
  useReferralStats, 
  useUserReferrals, 
  useReferralLink,
  useReferralQRCode,
  useMilestoneProgress 
} from '../referralHooks';
import { DEFAULT_REFERRAL_CONFIG } from '../types';
import ReferralGuideModal from './ReferralGuideModal';

interface ReferralDashboardProps {
  userAddress: string;
  isOwnProfile: boolean;
}

export default function ReferralDashboard({ userAddress, isOwnProfile }: ReferralDashboardProps) {
  const { stats, loading: statsLoading, refresh: refreshStats } = useReferralStats(userAddress);
  const { referrals, loading: referralsLoading } = useUserReferrals(userAddress);
  const { copyToClipboard, copied } = useReferralLink(stats?.referralLink || null);
  const qrCodeUrl = useReferralQRCode(stats?.referralLink || null);
  const nextMilestone = useMilestoneProgress(stats);
  
  // Debug log
  console.log('ReferralDashboard - stats:', stats);
  console.log('ReferralDashboard - referralLink:', stats?.referralLink);
  
  const [showQRCode, setShowQRCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'referrals' | 'rewards'>('overview');
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Automatyczne odświeżanie co 30 sekund
  useEffect(() => {
    if (isOwnProfile) {
      const interval = setInterval(() => {
        refreshStats();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isOwnProfile, refreshStats]);

  if (statsLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    // Jeśli nie ma statystyk, wciąż możemy wygenerować link
    const fallbackCode = userAddress.slice(2, 8).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    const fallbackLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://basebook.app'}/join?ref=${fallbackCode}`;
    
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6"
      >
        <h2 className="text-xl font-bold mb-4">Initializing Referral System...</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">Your referral link is being generated...</p>
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-2">Temporary link (will update shortly):</p>
          <code className="text-xs break-all">{fallbackLink}</code>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <FiUsers className="text-3xl" />
            Referral System
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuideModal(true)}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors flex items-center gap-2"
              title="View Guide"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-sm">Guide</span>
            </button>
            {isOwnProfile && (
              <button
                onClick={refreshStats}
                className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                title="Refresh stats"
              >
                <FiTrendingUp />
              </button>
            )}
          </div>
        </div>

        {/* Main statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold">{stats.totalReferrals}</div>
            <div className="text-sm opacity-90">Total Referrals</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-300">{stats.successfulReferrals}</div>
            <div className="text-sm opacity-90">Active</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-300">{stats.totalRewards}</div>
            <div className="text-sm opacity-90">Points Earned</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b dark:border-gray-700">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-3 px-4 text-center transition-colors ${
            activeTab === 'overview'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('referrals')}
          className={`flex-1 py-3 px-4 text-center transition-colors ${
            activeTab === 'referrals'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          My Referrals ({referrals.length})
        </button>
        <button
          onClick={() => setActiveTab('rewards')}
          className={`flex-1 py-3 px-4 text-center transition-colors ${
            activeTab === 'rewards'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          Rewards
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Link referalowy */}
              {isOwnProfile && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                    <FiShare2 />
                    Your Referral Link
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={stats.referralLink}
                      readOnly
                      className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white font-medium"
                    />
                    <button
                      onClick={copyToClipboard}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      {copied ? <FiCheck /> : <FiCopy />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => setShowQRCode(!showQRCode)}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {showQRCode ? 'Hide' : 'Show'} QR Code
                    </button>
                  </div>
                  {showQRCode && qrCodeUrl && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 flex justify-center"
                    >
                      <img src={qrCodeUrl} alt="QR Code" className="rounded-lg shadow-lg" />
                    </motion.div>
                  )}
                </div>
              )}

              {/* Postęp do następnego kamienia milowego */}
              {nextMilestone && (
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
                    <FiAward />
                    Next Milestone
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">Goal: {nextMilestone.target} referrals</span>
                      <span className="font-semibold text-purple-600 dark:text-purple-400">
                        +{nextMilestone.reward} points
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(nextMilestone.progress, 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 text-center">
                      {stats.successfulReferrals} / {nextMilestone.target} ({nextMilestone.progress.toFixed(0)}%)
                    </div>
                  </div>
                </div>
              )}

              {/* Informacje o nagrodach */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                  <h4 className="font-semibold mb-2 text-green-800 dark:text-green-400">
                    Referral Reward
                  </h4>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-300">
                    {DEFAULT_REFERRAL_CONFIG.rewardPerReferral} points
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    For each active user
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <h4 className="font-semibold mb-2 text-blue-800 dark:text-blue-400">
                    First Post Bonus
                  </h4>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">
                    +{DEFAULT_REFERRAL_CONFIG.firstPostBonus} points
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    When referred user creates first post
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'referrals' && (
            <motion.div
              key="referrals"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {referralsLoading ? (
                <div className="text-center py-8 text-gray-500">
                  Loading referrals list...
                </div>
              ) : referrals.length === 0 ? (
                <div className="text-center py-8">
                  <FiUserPlus className="text-4xl text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    You don't have any referrals yet
                  </p>
                  {isOwnProfile && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                      Share your referral link with friends!
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {referrals.map((referral) => (
                    <div
                      key={referral.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          referral.status === 'completed' 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                        }`}>
                          {referral.status === 'completed' ? <FiUserCheck /> : <FiClock />}
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {referral.referredAddress.slice(0, 6)}...{referral.referredAddress.slice(-4)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(
                              referral.timestamp instanceof Date 
                                ? referral.timestamp 
                                : referral.timestamp.toDate()
                            ).toLocaleDateString('pl-PL')}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          referral.status === 'completed'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            : referral.status === 'rewarded'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                            : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                        }`}>
                          {referral.status === 'completed'                             ? 'Active' : 
                           referral.status === 'rewarded' ? 'Rewarded' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'rewards' && (
            <motion.div
              key="rewards"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-4"
            >
              {/* Kamienie milowe */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FiAward />
                  Milestones
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { count: 5, reward: 250, achieved: stats.milestones?.five },
                    { count: 10, reward: 500, achieved: stats.milestones?.ten },
                    { count: 25, reward: 1500, achieved: stats.milestones?.twentyFive },
                    { count: 50, reward: 5000, achieved: stats.milestones?.fifty }
                  ].map((milestone) => (
                    <div
                      key={milestone.count}
                      className={`p-3 rounded-lg text-center transition-all ${
                        milestone.achieved
                          ? 'bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30 border-2 border-green-500'
                          : 'bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className={`text-2xl font-bold ${
                        milestone.achieved ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
                      }`}>
                        {milestone.count}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">referrals</div>
                      <div className={`text-sm font-semibold mt-1 ${
                        milestone.achieved ? 'text-green-700 dark:text-green-300' : 'text-gray-500'
                      }`}>
                        +{milestone.reward}
                      </div>
                      {milestone.achieved && (
                        <FiCheck className="text-green-600 dark:text-green-400 mx-auto mt-1" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Podsumowanie nagród */}
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <FiGift />
                  Total Rewards
                </h3>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                  {stats.totalRewards} points
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  Earned through referral system
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Referral Guide Modal */}
      <ReferralGuideModal 
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
      />
    </motion.div>
  );
}