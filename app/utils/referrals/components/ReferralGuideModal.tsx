'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiX, 
  FiBook, 
  FiGift, 
  FiUsers, 
  FiTrendingUp,
  FiHelpCircle,
  FiAward,
  FiZap,
  FiTarget,
  FiShare2
} from 'react-icons/fi';

interface ReferralGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReferralGuideModal({ isOpen, onClose }: ReferralGuideModalProps) {
  const [activeSection, setActiveSection] = useState('quick-start');

  const sections = [
    { id: 'quick-start', label: 'Quick Start', icon: FiZap },
    { id: 'how-it-works', label: 'How It Works', icon: FiBook },
    { id: 'rewards', label: 'Rewards', icon: FiGift },
    { id: 'dashboard', label: 'Dashboard', icon: FiTarget },
    { id: 'leaderboard', label: 'Leaderboard', icon: FiAward },
    { id: 'faq', label: 'FAQ', icon: FiHelpCircle }
  ];

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
            className="fixed inset-3 md:inset-8 lg:inset-12 bg-soft-surface rounded-card shadow-float z-[101] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-soft-line px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-soft-ink-faint">Guide</p>
                <h2 className="mt-0.5 font-soft-display text-xl font-bold leading-tight text-soft-ink sm:text-2xl">
                  How referrals work
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close guide"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-soft-sunken text-soft-ink-muted transition-transform duration-[--dur-press] ease-out-strong hover:bg-soft-line hover:text-soft-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
              {/* Nawigacja. Wczesniej byla `hidden md:block` - na telefonie NIE DALO
                  SIE przelaczyc sekcji, widac bylo tylko "Quick Start". Teraz ten sam
                  zestaw przyciskow jest paskiem przewijanym w poziomie na mobile
                  i kolumna od md w gore. */}
              <div className="shrink-0 border-b border-soft-line bg-soft-bg px-3 py-2 md:w-60 md:overflow-y-auto md:border-b-0 md:border-r md:px-4 md:py-4">
                <nav className="flex gap-1.5 overflow-x-auto md:flex-col md:gap-1 md:overflow-x-visible">
                  {sections.map(section => {
                    const Icon = section.icon;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        aria-current={activeSection === section.id ? 'true' : undefined}
                        className={`flex shrink-0 items-center gap-2 rounded-pill px-3 py-2 transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary md:w-full ${
                          activeSection === section.id
                            ? 'bg-soft-primary text-white shadow-chip'
                            : 'text-soft-ink-muted hover:bg-soft-sunken hover:text-soft-ink'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="whitespace-nowrap text-sm font-semibold">{section.label}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* Quick Stats */}
                <div className="mt-4 hidden rounded-card bg-soft-surface p-4 shadow-chip md:block">
                  <h4 className="font-soft-display text-sm font-bold text-soft-ink">Quick stats</h4>
                  <dl className="mt-3 space-y-2 font-soft text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-soft-ink-muted">Base reward</dt>
                      <dd className="font-soft-display font-bold tabular-nums text-soft-accent-deep">100 pts</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-soft-ink-muted">First post</dt>
                      <dd className="font-soft-display font-bold tabular-nums text-soft-accent-deep">+50 pts</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-soft-ink-muted">Max milestone</dt>
                      <dd className="font-soft-display font-bold tabular-nums text-soft-accent-deep">5,000 pts</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                {activeSection === 'quick-start' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-soft-display text-lg font-bold text-soft-ink">
                        Quick start
                      </h3>
                      <ol className="mt-4 space-y-4">
                        {[
                          { title: 'Open your profile', body: 'Navigate to your profile in BaseChat.' },
                          { title: 'Click "Referral System"', body: 'The purple button sits below your profile stats.' },
                          { title: 'Copy your link', body: 'Your unique link is ready to share.' }
                        ].map((step, i) => (
                          <li key={step.title} className="flex items-start gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft-primary font-soft-display text-sm font-bold tabular-nums text-white">
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="font-soft-display text-sm font-bold text-soft-ink">{step.title}</p>
                              <p className="mt-0.5 font-soft text-sm text-soft-ink-muted">{step.body}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div>
                      <h4 className="font-soft-display text-sm font-bold text-soft-ink">Link format</h4>
                      <div className="mt-2 overflow-x-auto rounded-card bg-soft-sunken p-4">
                        <code className="whitespace-nowrap font-mono text-sm text-soft-primary-deep">
                          https://mysphere.fun/join?ref=YOUR_CODE
                        </code>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === 'how-it-works' && (
                  <div className="space-y-5">
                    <h3 className="font-soft-display text-lg font-bold text-soft-ink">
                      How it works
                    </h3>

                    <div className="space-y-4">
                      <div className="rounded-card border border-soft-line p-4 sm:p-5">
                        <h4 className="font-soft-display text-sm font-bold text-soft-ink">For referrers</h4>
                        <ul className="mt-3 space-y-2.5 font-soft text-sm text-soft-ink-muted">
                          <li className="flex items-start gap-2.5">
                            <FiShare2 className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" />
                            <span>Share your unique referral link with friends</span>
                          </li>
                          <li className="flex items-start gap-2.5">
                            <FiUsers className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" />
                            <span>They join BaseChat using your link</span>
                          </li>
                          <li className="flex items-start gap-2.5">
                            <FiGift className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" />
                            <span>You earn <strong className="font-soft-display tabular-nums text-soft-accent-deep">100 points</strong> instantly</span>
                          </li>
                          <li className="flex items-start gap-2.5">
                            <FiTrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" />
                            <span>Get <strong className="font-soft-display tabular-nums text-soft-accent-deep">+50</strong> when they publish their first post</span>
                          </li>
                        </ul>
                      </div>

                      <div className="rounded-card border border-soft-line p-4 sm:p-5">
                        <h4 className="font-soft-display text-sm font-bold text-soft-ink">For new users</h4>
                        <ol className="mt-3 space-y-2.5 font-soft text-sm text-soft-ink-muted">
                          {[
                            'Click a referral link from a friend',
                            'Connect your wallet on the welcome page',
                            "You're registered automatically",
                            'Start using BaseChat and get your own referral link'
                          ].map((step, i) => (
                            <li key={step} className="flex items-start gap-2.5">
                              <span className="font-soft-display font-bold tabular-nums text-soft-primary-deep">{i + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === 'rewards' && (
                  <div className="space-y-5">
                    <h3 className="font-soft-display text-lg font-bold text-soft-ink">
                      Rewards
                    </h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-card border border-soft-line p-4 sm:p-5">
                        <h4 className="font-soft-display text-sm font-bold text-soft-ink">Base rewards</h4>
                        <dl className="mt-3 space-y-2.5 font-soft text-sm">
                          {[
                            ['Successful referral', '100 pts'],
                            ['First post bonus', '+50 pts']
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between gap-3">
                              <dt className="text-soft-ink-muted">{label}</dt>
                              <dd className="font-soft-display font-bold tabular-nums text-soft-accent-deep">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <div className="rounded-card border border-soft-line p-4 sm:p-5">
                        <h4 className="font-soft-display text-sm font-bold text-soft-ink">Milestones</h4>
                        <dl className="mt-3 space-y-2.5 font-soft text-sm">
                          {[
                            ['5 referrals', '+250 pts'],
                            ['10 referrals', '+500 pts'],
                            ['25 referrals', '+1,500 pts'],
                            ['50 referrals', '+5,000 pts']
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between gap-3">
                              <dt className="tabular-nums text-soft-ink-muted">{label}</dt>
                              <dd className="font-soft-display font-bold tabular-nums text-soft-accent-deep">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    </div>

                    <div className="rounded-card bg-soft-sunken p-4 sm:p-5">
                      <h4 className="font-soft-display text-sm font-bold text-soft-ink">Example</h4>
                      <p className="mt-1 font-soft text-sm text-soft-ink-muted">
                        Ten friends join and all publish a post:
                      </p>
                      <ul className="mt-3 space-y-1.5 font-soft text-sm tabular-nums text-soft-ink-muted">
                        <li>Base rewards: 10 × 100 = 1,000</li>
                        <li>First post bonuses: 10 × 50 = 500</li>
                        <li>Milestone bonuses: 250 + 500 = 750</li>
                      </ul>
                      <p className="mt-3 border-t border-soft-line pt-3 font-soft-display text-lg font-bold tabular-nums text-soft-accent-deep">
                        2,250 points
                      </p>
                    </div>
                  </div>
                )}

                {activeSection === 'dashboard' && (
                  <div className="space-y-5">
                    <h3 className="font-soft-display text-lg font-bold text-soft-ink">
                      Your dashboard
                    </h3>

                    <div className="space-y-4">
                      {[
                        {
                          title: 'Overview',
                          items: [
                            'Your referral link with a copy button',
                            'QR code for sharing in person',
                            'Progress to the next milestone',
                            'What each referral is worth'
                          ]
                        },
                        {
                          title: 'Invites',
                          items: [
                            'Everyone who joined through your link',
                            'Status of each one: Pending, Active or Rewarded',
                            'Join date and shortened wallet address',
                            'Refreshes every 30 seconds'
                          ]
                        },
                        {
                          title: 'Rewards',
                          items: [
                            'Total points earned',
                            'Which milestones you have reached',
                            'How much each remaining milestone pays'
                          ]
                        }
                      ].map(tab => (
                        <div key={tab.title} className="rounded-card border border-soft-line p-4 sm:p-5">
                          <h4 className="font-soft-display text-sm font-bold text-soft-ink">{tab.title} tab</h4>
                          <ul className="mt-3 space-y-2 font-soft text-sm text-soft-ink-muted">
                            {tab.items.map(item => (
                              <li key={item} className="flex items-start gap-2.5">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-soft-line-strong" aria-hidden="true" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSection === 'leaderboard' && (
                  <div className="space-y-5">
                    <h3 className="font-soft-display text-lg font-bold text-soft-ink">
                      Leaderboard
                    </h3>

                    <div className="rounded-card border border-soft-line p-4 sm:p-5">
                      <h4 className="font-soft-display text-sm font-bold text-soft-ink">Top referrers</h4>
                      <p className="mt-1 font-soft text-sm text-soft-ink-muted">
                        Ranked by successful referrals first, then by points earned.
                      </p>
                      <ul className="mt-3 space-y-2 font-soft text-sm text-soft-ink-muted">
                        {[
                          ['1', 'Most referrals - highlighted at the top'],
                          ['2', 'Runner-up'],
                          ['3', 'Third place']
                        ].map(([rank, label]) => (
                          <li key={rank} className="flex items-center gap-2.5">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-soft-display text-xs font-bold tabular-nums ${
                              rank === '1' ? 'bg-soft-primary text-white' : 'bg-soft-primary/15 text-soft-primary-deep'
                            }`}>
                              {rank}
                            </span>
                            <span>{label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-card bg-soft-sunken p-4 sm:p-5">
                      <h4 className="font-soft-display text-sm font-bold text-soft-ink">Where to find it</h4>
                      <p className="mt-1 font-soft text-sm text-soft-ink-muted">
                        In the left panel of BaseChat, below your profile card. &quot;View all&quot; opens the full list.
                      </p>
                    </div>
                  </div>
                )}

                {activeSection === 'faq' && (
                  <div className="space-y-5">
                    <h3 className="font-soft-display text-lg font-bold text-soft-ink">
                      Questions
                    </h3>

                    <div className="divide-y divide-soft-line border-y border-soft-line">
                      {[
                        {
                          q: 'Can I refer myself?',
                          a: 'No - the system blocks self-referrals automatically.'
                        },
                        {
                          q: 'Can someone be referred by several people?',
                          a: 'No. Each user is referred once, by the first link they use.'
                        },
                        {
                          q: 'When do rewards arrive?',
                          a: 'The base 100 points land as soon as someone joins. The 50-point bonus follows their first post.'
                        },
                        {
                          q: 'Do referral links expire?',
                          a: 'No. Your link is permanent.'
                        },
                        {
                          q: 'Is there a limit on referrals?',
                          a: 'No limit - refer as many people as you like.'
                        }
                      ].map(item => (
                        <div key={item.q} className="py-4">
                          <h4 className="font-soft-display text-sm font-bold text-soft-ink">
                            {item.q}
                          </h4>
                          <p className="mt-1 font-soft text-sm text-soft-ink-muted">
                            {item.a}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

