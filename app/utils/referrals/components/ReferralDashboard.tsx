'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiTrendingUp,
  FiCopy,
  FiCheck,
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
      <div className="bg-soft-surface rounded-card p-5 shadow-card">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-24 rounded-pill bg-soft-sunken"></div>
          <div className="h-10 w-40 rounded-card bg-soft-sunken"></div>
          <div className="space-y-2">
            <div className="h-3 rounded-pill bg-soft-sunken"></div>
            <div className="h-3 w-5/6 rounded-pill bg-soft-sunken"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    // Kiedys stal tu link zbudowany z Math.random() podany jako "tymczasowy".
    // To byl WYMYSLONY link - nie istnial po stronie bazy, wiec kazdy, kto go
    // skopiowal, rozdawal martwy adres. Zamiast tego mowimy wprost, ze linku
    // jeszcze nie ma.
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-soft-surface rounded-card shadow-card p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-soft-ink-faint">Referrals</p>
        <h2 className="mt-1 font-soft-display text-xl font-bold text-soft-ink">
          Setting up your referral link
        </h2>
        <p className="mt-2 font-soft text-sm text-soft-ink-muted">
          The link isn&apos;t ready yet. It shows up here as soon as it&apos;s generated - refresh in a moment.
        </p>
        <div className="mt-4 h-10 rounded-card bg-soft-sunken animate-pulse"></div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-soft-surface rounded-card shadow-card overflow-hidden"
    >
      {/* Header - bez banera gradientowego. Jedna rzecz dominuje: zarobione punkty. */}
      <div className="px-4 sm:px-5 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-soft-ink-faint">Referrals</p>
            <h2 className="mt-0.5 font-soft-display text-xl font-bold leading-tight text-soft-ink">
              Invite friends, earn points
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1.5 rounded-pill bg-soft-sunken px-3 py-1.5 text-xs font-semibold text-soft-primary-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-line active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              title="View Guide"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Guide</span>
            </button>
            {isOwnProfile && (
              <button
                onClick={refreshStats}
                className="inline-flex h-8 w-8 items-center justify-center rounded-pill bg-soft-sunken text-soft-primary-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-line active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                title="Refresh stats"
                aria-label="Refresh stats"
              >
                <FiTrendingUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bohater ekranu: punkty. To jedyna liczba w kolorze pieniedzy. */}
        <div className="mt-5 flex flex-wrap items-end gap-x-7 gap-y-3">
          <div>
            <div className="font-soft-display text-4xl font-bold leading-none tabular-nums text-soft-accent-deep">
              {stats.totalRewards}
            </div>
            <div className="mt-1.5 font-soft text-sm text-soft-ink-muted">points earned</div>
          </div>
          <div className="flex items-end gap-6 pb-1">
            <div>
              <div className="font-soft-display text-lg font-bold leading-none tabular-nums text-soft-ink">
                {stats.successfulReferrals}
              </div>
              <div className="mt-1 text-xs text-soft-ink-soft">active</div>
            </div>
            <div>
              <div className="font-soft-display text-lg font-bold leading-none tabular-nums text-soft-ink">
                {stats.totalReferrals}
              </div>
              <div className="mt-1 text-xs text-soft-ink-soft">invited</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs - segment na wciecie, zamiast podkreslen w obcym niebieskim */}
      <div className="px-4 sm:px-5 pt-4">
        <div className="flex gap-1 rounded-pill bg-soft-sunken p-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`min-w-0 flex-1 truncate rounded-pill px-2 py-1.5 text-xs font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
              activeTab === 'overview'
                ? 'bg-soft-surface text-soft-ink shadow-chip'
                : 'text-soft-ink-muted hover:text-soft-ink'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('referrals')}
            className={`min-w-0 flex-1 truncate rounded-pill px-2 py-1.5 text-xs font-semibold tabular-nums transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
              activeTab === 'referrals'
                ? 'bg-soft-surface text-soft-ink shadow-chip'
                : 'text-soft-ink-muted hover:text-soft-ink'
            }`}
          >
            Invites ({referrals.length})
          </button>
          <button
            onClick={() => setActiveTab('rewards')}
            className={`min-w-0 flex-1 truncate rounded-pill px-2 py-1.5 text-xs font-semibold transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
              activeTab === 'rewards'
                ? 'bg-soft-surface text-soft-ink shadow-chip'
                : 'text-soft-ink-muted hover:text-soft-ink'
            }`}
          >
            Rewards
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Link referalowy - glowna akcja tej zakladki */}
              {isOwnProfile && (
                <div className="rounded-card bg-soft-sunken p-4">
                  <h3 className="font-soft-display text-sm font-bold text-soft-ink">
                    Your referral link
                  </h3>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={stats.referralLink}
                      readOnly
                      aria-label="Your referral link"
                      className="min-w-0 flex-1 rounded-pill border border-soft-line bg-soft-surface px-4 py-2 font-soft text-sm text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                    />
                    <button
                      onClick={copyToClipboard}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-pill bg-soft-primary px-5 py-2 text-sm font-semibold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                    >
                      {copied ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <button
                    onClick={() => setShowQRCode(!showQRCode)}
                    aria-expanded={showQRCode}
                    className="mt-3 rounded-pill text-xs font-semibold text-soft-primary-deep transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    {showQRCode ? 'Hide' : 'Show'} QR code
                  </button>
                  {showQRCode && qrCodeUrl && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 flex justify-center overflow-hidden"
                    >
                      <img src={qrCodeUrl} alt="QR code for your referral link" className="rounded-card bg-soft-surface p-2 shadow-chip" />
                    </motion.div>
                  )}
                </div>
              )}

              {/* Postęp do następnego kamienia milowego */}
              {nextMilestone && (
                <div className="rounded-card border border-soft-line p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-soft-display text-sm font-bold text-soft-ink">
                      Next milestone
                    </h3>
                    <span className="font-soft-display text-sm font-bold tabular-nums text-soft-accent-deep">
                      +{nextMilestone.reward} pts
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-soft-sunken">
                    <div
                      className="h-full rounded-pill bg-soft-primary transition-all"
                      style={{ width: `${Math.min(nextMilestone.progress, 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 font-soft text-xs tabular-nums text-soft-ink-muted">
                    {stats.successfulReferrals} of {nextMilestone.target} referrals ({nextMilestone.progress.toFixed(0)}%)
                  </p>
                </div>
              )}

              {/* Informacje o nagrodach */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-card border border-soft-line p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-soft-ink-faint">
                    Per referral
                  </p>
                  <p className="mt-1 font-soft-display text-2xl font-bold tabular-nums text-soft-accent-deep">
                    {DEFAULT_REFERRAL_CONFIG.rewardPerReferral}
                    <span className="ml-1 text-sm font-semibold text-soft-ink-muted">pts</span>
                  </p>
                  <p className="mt-1 font-soft text-xs text-soft-ink-soft">
                    For each active user
                  </p>
                </div>
                <div className="rounded-card border border-soft-line p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-soft-ink-faint">
                    First post bonus
                  </p>
                  <p className="mt-1 font-soft-display text-2xl font-bold tabular-nums text-soft-accent-deep">
                    +{DEFAULT_REFERRAL_CONFIG.firstPostBonus}
                    <span className="ml-1 text-sm font-semibold text-soft-ink-muted">pts</span>
                  </p>
                  <p className="mt-1 font-soft text-xs text-soft-ink-soft">
                    When they publish their first post
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
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-card bg-soft-sunken"></div>
                  ))}
                </div>
              ) : referrals.length === 0 ? (
                <div className="py-10 text-center">
                  <FiUserPlus className="mx-auto mb-3 h-8 w-8 text-soft-ink-faint" />
                  <p className="font-soft-display text-sm font-bold text-soft-ink">
                    No referrals yet
                  </p>
                  <p className="mx-auto mt-1 max-w-xs font-soft text-xs text-soft-ink-soft">
                    {isOwnProfile
                      ? 'Share your link - people who join through it show up here.'
                      : 'Nobody has joined through this profile yet.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {referrals.map((referral) => (
                    <div
                      key={referral.id}
                      className="flex items-center justify-between gap-3 rounded-card border border-soft-line p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          referral.status === 'completed'
                            ? 'bg-soft-info-soft text-soft-info'
                            : 'bg-soft-sunken text-soft-ink-soft'
                        }`}>
                          {referral.status === 'completed' ? <FiUserCheck className="h-4 w-4" /> : <FiClock className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-soft-display text-sm font-semibold tabular-nums text-soft-ink">
                            {referral.referredAddress.slice(0, 6)}...{referral.referredAddress.slice(-4)}
                          </p>
                          <p className="font-soft text-xs tabular-nums text-soft-ink-faint">
                            {new Date(
                              referral.timestamp instanceof Date
                                ? referral.timestamp
                                : referral.timestamp.toDate()
                            ).toLocaleDateString('pl-PL')}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold ${
                        referral.status === 'completed'
                          ? 'bg-soft-info-soft text-soft-info'
                          : referral.status === 'rewarded'
                          ? 'bg-soft-accent-soft text-soft-accent-deep'
                          : 'bg-soft-sunken text-soft-ink-muted'
                      }`}>
                        {referral.status === 'completed'                             ? 'Active' :
                         referral.status === 'rewarded' ? 'Rewarded' : 'Pending'}
                      </span>
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
              {/* Podsumowanie nagród - najwazniejsza liczba tej zakladki */}
              <div className="rounded-card bg-soft-sunken p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-soft-ink-faint">
                  Total rewards
                </p>
                <p className="mt-1 font-soft-display text-3xl font-bold tabular-nums text-soft-accent-deep">
                  {stats.totalRewards}
                  <span className="ml-1.5 text-base font-semibold text-soft-ink-muted">points</span>
                </p>
                <p className="mt-1 font-soft text-xs text-soft-ink-soft">
                  Earned through the referral system
                </p>
              </div>

              {/* Kamienie milowe */}
              <div>
                <h3 className="font-soft-display text-sm font-bold text-soft-ink">
                  Milestones
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  {[
                    { count: 5, reward: 250, achieved: stats.milestones?.five },
                    { count: 10, reward: 500, achieved: stats.milestones?.ten },
                    { count: 25, reward: 1500, achieved: stats.milestones?.twentyFive },
                    { count: 50, reward: 5000, achieved: stats.milestones?.fifty }
                  ].map((milestone) => (
                    <div
                      key={milestone.count}
                      className={`rounded-card border p-3 text-center ${
                        milestone.achieved
                          ? 'border-soft-accent-soft bg-soft-accent-soft/50'
                          : 'border-soft-line bg-soft-surface'
                      }`}
                    >
                      <div className={`font-soft-display text-2xl font-bold leading-none tabular-nums ${
                        milestone.achieved ? 'text-soft-ink' : 'text-soft-ink-faint'
                      }`}>
                        {milestone.count}
                      </div>
                      <div className="mt-1 font-soft text-xs text-soft-ink-soft">referrals</div>
                      <div className={`mt-2 font-soft-display text-sm font-bold tabular-nums ${
                        milestone.achieved ? 'text-soft-accent-deep' : 'text-soft-ink-faint'
                      }`}>
                        +{milestone.reward}
                      </div>
                      {milestone.achieved && (
                        <FiCheck className="mx-auto mt-1 h-3.5 w-3.5 text-soft-accent-deep" aria-label="Milestone reached" />
                      )}
                    </div>
                  ))}
                </div>
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