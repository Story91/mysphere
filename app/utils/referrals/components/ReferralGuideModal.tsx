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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 md:inset-8 lg:inset-12 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-[101] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <FiBook className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Referral System Guide</h2>
                    <p className="text-sm opacity-90">Everything you need to know about BaseChat referrals</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <FiX className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <div className="w-64 bg-gray-50 dark:bg-gray-800 p-4 overflow-y-auto hidden md:block">
                <nav className="space-y-1">
                  {sections.map(section => {
                    const Icon = section.icon;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-all ${
                          activeSection === section.id
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{section.label}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* Quick Stats */}
                <div className="mt-6 p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl text-white">
                  <h4 className="font-semibold mb-3">Quick Stats</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="opacity-90">Base Reward</span>
                      <span className="font-bold">100 pts</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-90">First Post</span>
                      <span className="font-bold">+50 pts</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-90">Max Milestone</span>
                      <span className="font-bold">5,000 pts</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 p-6 overflow-y-auto">
                {activeSection === 'quick-start' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                        🚀 Quick Start
                      </h3>
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
                        <ol className="space-y-4">
                          <li className="flex items-start">
                            <span className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold mr-3">1</span>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">Open Your Profile</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">Navigate to your profile in BaseChat</p>
                            </div>
                          </li>
                          <li className="flex items-start">
                            <span className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold mr-3">2</span>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">Click "Referral System"</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">Find the green button below your profile stats</p>
                            </div>
                          </li>
                          <li className="flex items-start">
                            <span className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold mr-3">3</span>
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">Copy Your Link</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">Your unique link is ready to share!</p>
                            </div>
                          </li>
                        </ol>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Your Referral Link Format</h4>
                      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                        <code className="text-sm text-blue-600 dark:text-blue-400">
                          https://mysphere.fun/join?ref=YOUR_CODE
                        </code>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === 'how-it-works' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                      📖 How It Works
                    </h3>
                    
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6">
                        <h4 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">For Referrers</h4>
                        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                          <li className="flex items-start">
                            <FiShare2 className="w-5 h-5 text-blue-500 mr-2 mt-0.5" />
                            <span>Share your unique referral link with friends</span>
                          </li>
                          <li className="flex items-start">
                            <FiUsers className="w-5 h-5 text-blue-500 mr-2 mt-0.5" />
                            <span>They join BaseChat using your link</span>
                          </li>
                          <li className="flex items-start">
                            <FiGift className="w-5 h-5 text-blue-500 mr-2 mt-0.5" />
                            <span>You earn 100 points instantly</span>
                          </li>
                          <li className="flex items-start">
                            <FiTrendingUp className="w-5 h-5 text-blue-500 mr-2 mt-0.5" />
                            <span>Get +50 bonus when they create their first post</span>
                          </li>
                        </ul>
                      </div>

                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6">
                        <h4 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">For New Users</h4>
                        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                          <li className="flex items-start">
                            <span className="text-green-500 mr-2">1.</span>
                            <span>Click on a referral link from a friend</span>
                          </li>
                          <li className="flex items-start">
                            <span className="text-green-500 mr-2">2.</span>
                            <span>Connect your wallet on the welcome page</span>
                          </li>
                          <li className="flex items-start">
                            <span className="text-green-500 mr-2">3.</span>
                            <span>You're automatically registered!</span>
                          </li>
                          <li className="flex items-start">
                            <span className="text-green-500 mr-2">4.</span>
                            <span>Start using BaseChat and get your own referral link</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === 'rewards' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                      💎 Rewards Structure
                    </h3>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-6">
                        <h4 className="font-semibold text-green-800 dark:text-green-400 mb-3">Base Rewards</h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700 dark:text-gray-300">Successful Referral</span>
                            <span className="font-bold text-green-600 dark:text-green-400">100 pts</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-700 dark:text-gray-300">First Post Bonus</span>
                            <span className="font-bold text-green-600 dark:text-green-400">+50 pts</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-6">
                        <h4 className="font-semibold text-purple-800 dark:text-purple-400 mb-3">Milestones</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-700 dark:text-gray-300">5 referrals</span>
                            <span className="font-bold text-purple-600 dark:text-purple-400">+250 pts</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-700 dark:text-gray-300">10 referrals</span>
                            <span className="font-bold text-purple-600 dark:text-purple-400">+500 pts</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-700 dark:text-gray-300">25 referrals</span>
                            <span className="font-bold text-purple-600 dark:text-purple-400">+1,500 pts</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-700 dark:text-gray-300">50 referrals</span>
                            <span className="font-bold text-purple-600 dark:text-purple-400">+5,000 pts</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-6">
                      <h4 className="font-semibold text-yellow-800 dark:text-yellow-400 mb-3">Example Calculation</h4>
                      <p className="text-gray-700 dark:text-gray-300 mb-3">If you refer 10 friends who all create posts:</p>
                      <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        <li>• Base rewards: 10 × 100 = 1,000 points</li>
                        <li>• First post bonuses: 10 × 50 = 500 points</li>
                        <li>• Milestone bonuses: 250 + 500 = 750 points</li>
                        <li className="font-bold text-yellow-800 dark:text-yellow-400">• Total: 2,250 points!</li>
                      </ul>
                    </div>
                  </div>
                )}

                {activeSection === 'dashboard' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                      📊 Using Your Dashboard
                    </h3>

                    <div className="space-y-4">
                      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                        <h4 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Overview Tab</h4>
                        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                          <li>• Your unique referral link with copy button</li>
                          <li>• QR code for easy sharing</li>
                          <li>• Total statistics and current rewards</li>
                          <li>• Progress to next milestone</li>
                        </ul>
                      </div>

                      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                        <h4 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">My Referrals Tab</h4>
                        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                          <li>• List of all your referrals</li>
                          <li>• Status indicators (Pending/Active/Rewarded)</li>
                          <li>• Join dates and wallet addresses</li>
                          <li>• Real-time updates every 30 seconds</li>
                        </ul>
                      </div>

                      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                        <h4 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Rewards Tab</h4>
                        <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                          <li>• Milestone achievements</li>
                          <li>• Total points earned</li>
                          <li>• Reward history breakdown</li>
                          <li>• Visual progress indicators</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === 'leaderboard' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                      🏆 Leaderboard
                    </h3>

                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6">
                      <h4 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Top Referrers</h4>
                      <p className="text-gray-700 dark:text-gray-300 mb-4">
                        The leaderboard showcases our community's top contributors. Compete for the top spots!
                      </p>
                      <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                        <li className="flex items-center">
                          <span className="text-2xl mr-2">🥇</span>
                          <span>Gold Medal - Top referrer</span>
                        </li>
                        <li className="flex items-center">
                          <span className="text-2xl mr-2">🥈</span>
                          <span>Silver Medal - 2nd place</span>
                        </li>
                        <li className="flex items-center">
                          <span className="text-2xl mr-2">🥉</span>
                          <span>Bronze Medal - 3rd place</span>
                        </li>
                      </ul>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
                      <h4 className="font-semibold text-lg mb-3 text-gray-900 dark:text-white">Where to Find</h4>
                      <p className="text-gray-700 dark:text-gray-300">
                        The leaderboard is located in the left panel of BaseChat, below your 3D profile card and above the Kaito YapScan integration.
                      </p>
                    </div>
                  </div>
                )}

                {activeSection === 'faq' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                      ❓ Frequently Asked Questions
                    </h3>

                    <div className="space-y-4">
                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Can I refer myself?
                        </h4>
                        <p className="text-gray-700 dark:text-gray-300">
                          No, the system automatically prevents self-referrals.
                        </p>
                      </div>

                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Can someone be referred by multiple people?
                        </h4>
                        <p className="text-gray-700 dark:text-gray-300">
                          No, each user can only be referred once - by the first person whose link they use.
                        </p>
                      </div>

                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          When do I receive my rewards?
                        </h4>
                        <p className="text-gray-700 dark:text-gray-300">
                          Base reward (100 points) is instant when someone joins. The bonus (50 points) comes when they create their first post.
                        </p>
                      </div>

                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Do referral links expire?
                        </h4>
                        <p className="text-gray-700 dark:text-gray-300">
                          No, your referral link is permanent and never expires.
                        </p>
                      </div>

                      <div className="border-l-4 border-blue-500 pl-4">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                          Is there a limit to referrals?
                        </h4>
                        <p className="text-gray-700 dark:text-gray-300">
                          No limit! Refer as many people as you want.
                        </p>
                      </div>
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

