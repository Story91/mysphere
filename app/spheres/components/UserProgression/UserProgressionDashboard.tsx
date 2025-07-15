'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSpheresContract, UserAchievement, UserBoost, AchievementType, BoostType } from '../../hooks/useSpheresContract';
import { 
  Trophy, 
  Star, 
  Target, 
  Flame, 
  Award, 
  TrendingUp,
  Calendar,
  Users,
  MessageSquare,
  Zap,
  Crown,
  Shield,
  Gem,
  Heart,
  CheckCircle,
  Lock,
  ChevronRight,
  BarChart3,
  Medal,
  Gift,
  Clock,
  Activity,
  ArrowRight,
  Sparkles,
  User,
  BookOpen,
  Coins
} from 'lucide-react';

// Interfaces
interface Level {
  level: number;
  name: string;
  description: string;
  respectPointsRequired: number;
  respectPointsToNext: number;
  color: string;
  badge: string;
  rewards: LevelReward[];
}

interface LevelReward {
  type: 'respect_points' | 'nft' | 'badge' | 'access' | 'title';
  amount?: number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Use UserAchievement from hook instead of local interface
// interface Achievement moved to useSpheresContract.ts

// Get icon component for achievement
const getAchievementIcon = (iconName: string) => {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'Users': Users,
    'Trophy': Trophy,
    'Star': Star,
    'Flame': Flame
  };
  return iconMap[iconName] || Star;
};

// Get icon component for boost
const getBoostIcon = (iconName: string) => {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'Zap': Zap,
    'Star': Star,
    'DollarSign': Coins
  };
  return iconMap[iconName] || Zap;
};

// DailyStreakButton Component
const DailyStreakButton: React.FC<{ communityId: number }> = ({ communityId }) => {
  const { updateDailyActivity, isLoading } = useSpheresContract();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateActivity = async () => {
    try {
      setIsUpdating(true);
      await updateDailyActivity(communityId);
      // Data will be refetched automatically by the hook
    } catch (err: any) {
      console.error('Failed to update daily activity:', err);
      // Error is already handled by the hook with toast
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <button
      onClick={handleUpdateActivity}
      disabled={isUpdating || isLoading}
      className="px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm rounded-lg hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
    >
      {isUpdating ? (
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
          <span>Updating...</span>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Flame className="w-3 h-3" />
          <span>Check In</span>
        </div>
      )}
    </button>
  );
};

interface UserProgressionDashboardProps {
  userId: string;
  communityId?: string;
}

const UserProgressionDashboard: React.FC<UserProgressionDashboardProps> = ({
  userId,
  communityId
}) => {
  const router = useRouter();
  const { 
    userStats, 
    userMemberships, 
    isLoading,
    streakSaversCount,
    achievementVouchersCount,
    userAchievements,
    userBoosts,
    useAchievementVoucher,
    unlockPremiumAchievement,
    purchaseBoost,
    activateBoost,
    utilityBoxFee,
    achievementUnlockFee,
    boostPurchaseFee,
    isConnected 
  } = useSpheresContract();

  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'levels' | 'boosts' | 'rewards'>('overview');
  const [selectedCategory, setSelectedCategory] = useState<'all' | UserAchievement['category']>('all');

  // Level definitions based on smart contract
  const levels: Level[] = [
    {
      level: 0,
      name: 'Newcomer',
      description: 'Welcome to the community! Start your Web3 journey.',
      respectPointsRequired: 0,
      respectPointsToNext: 100,
      color: 'from-gray-500 to-gray-600',
      badge: '👋',
      rewards: [
        { type: 'respect_points', amount: 10, description: 'Welcome bonus', icon: Star },
        { type: 'badge', description: 'Newcomer Badge', icon: Award }
      ]
    },
    {
      level: 1,
      name: 'Explorer',
      description: 'Learning the basics and exploring community possibilities.',
      respectPointsRequired: 100,
      respectPointsToNext: 400,
      color: 'from-blue-500 to-blue-600',
      badge: '🔍',
      rewards: [
        { type: 'respect_points', amount: 25, description: 'Exploration bonus', icon: Star },
        { type: 'access', description: 'Explorer channels access', icon: Shield }
      ]
    },
    {
      level: 2,
      name: 'Contributor',
      description: 'Actively participating in the community and sharing knowledge.',
      respectPointsRequired: 500,
      respectPointsToNext: 1500,
      color: 'from-green-500 to-green-600',
      badge: '💡',
      rewards: [
        { type: 'respect_points', amount: 50, description: 'Contribution bonus', icon: Star },
        { type: 'badge', description: 'Contributor Badge', icon: Award },
        { type: 'access', description: 'Exclusive events access', icon: Calendar }
      ]
    },
    {
      level: 3,
      name: 'Specialist',
      description: 'Expert in your field helping others grow.',
      respectPointsRequired: 2000,
      respectPointsToNext: 3000,
      color: 'from-purple-500 to-purple-600',
      badge: '🎓',
      rewards: [
        { type: 'respect_points', amount: 100, description: 'Specialist bonus', icon: Star },
        { type: 'nft', description: 'Specialist NFT', icon: Gem },
        { type: 'title', description: 'Specialist Title', icon: Crown }
      ]
    },
    {
      level: 4,
      name: 'Mentor',
      description: 'Leading others and sharing your experience.',
      respectPointsRequired: 5000,
      respectPointsToNext: 5000,
      color: 'from-orange-500 to-orange-600',
      badge: '👨‍🏫',
      rewards: [
        { type: 'respect_points', amount: 200, description: 'Mentor bonus', icon: Star },
        { type: 'access', description: 'Mentor panel', icon: Users },
        { type: 'nft', description: 'Mentor NFT', icon: Gem }
      ]
    },
    {
      level: 5,
      name: 'Master',
      description: 'Master of your craft with deep knowledge and experience.',
      respectPointsRequired: 10000,
      respectPointsToNext: 0,
      color: 'from-yellow-500 to-yellow-600',
      badge: '🏆',
      rewards: [
        { type: 'respect_points', amount: 500, description: 'Master bonus', icon: Star },
        { type: 'nft', description: 'Master NFT', icon: Gem },
        { type: 'title', description: 'Master Title', icon: Crown },
        { type: 'access', description: 'All privileges', icon: Shield }
      ]
    }
  ];



  // Calculate current level based on total respect points
  const calculateCurrentLevel = (totalRespectPoints: number) => {
    for (let i = levels.length - 1; i >= 0; i--) {
      if (totalRespectPoints >= levels[i].respectPointsRequired) {
        return levels[i];
      }
    }
    return levels[0];
  };

  // Calculate next level
  const calculateNextLevel = (currentLevel: Level) => {
    const nextLevelIndex = levels.findIndex(l => l.level === currentLevel.level) + 1;
    return nextLevelIndex < levels.length ? levels[nextLevelIndex] : null;
  };

  // Calculate progress to next level
  const calculateProgress = (totalRespectPoints: number, currentLevel: Level, nextLevel: Level | null) => {
    if (!nextLevel) return 100;
    
    const pointsInCurrentLevel = totalRespectPoints - currentLevel.respectPointsRequired;
    const pointsNeededForNext = nextLevel.respectPointsRequired - currentLevel.respectPointsRequired;
    
    return Math.min(100, (pointsInCurrentLevel / pointsNeededForNext) * 100);
  };

  const totalRespectPoints = userStats?.totalRespectPoints || 0;
  const currentLevel = calculateCurrentLevel(totalRespectPoints);
  const nextLevel = calculateNextLevel(currentLevel);
  const progressToNext = calculateProgress(totalRespectPoints, currentLevel, nextLevel);
  const pointsToNext = nextLevel ? nextLevel.respectPointsRequired - totalRespectPoints : 0;

  // All available achievements (both unlocked and locked)
  const allAchievements: (UserAchievement & { isUnlocked: boolean })[] = [
    {
      id: 'first_join',
      name: 'First Steps',
      description: 'Join your first community',
      category: 'community',
      rarity: 'common',
      icon: 'Users',
      respectPointsReward: 25,
      contractType: AchievementType.FIRST_JOIN,
      isUnlocked: userAchievements.some(a => a.contractType === AchievementType.FIRST_JOIN)
    },
    {
      id: 'level_up',
      name: 'Rising Star',
      description: 'Level up in a community',
      category: 'community',
      rarity: 'common',
      icon: 'Star',
      respectPointsReward: 50,
      contractType: AchievementType.LEVEL_UP,
      isUnlocked: userAchievements.some(a => a.contractType === AchievementType.LEVEL_UP)
    },
    {
      id: 'event_winner',
      name: 'Champion',
      description: 'Win your first event',
      category: 'events',
      rarity: 'rare',
      icon: 'Trophy',
      respectPointsReward: 100,
      contractType: AchievementType.EVENT_WINNER,
      isUnlocked: userAchievements.some(a => a.contractType === AchievementType.EVENT_WINNER)
    },
    {
      id: 'referral_master',
      name: 'Community Builder',
      description: 'Refer 5 new members',
      category: 'leadership',
      rarity: 'epic',
      icon: 'Users',
      respectPointsReward: 150,
      contractType: AchievementType.REFERRAL_MASTER,
      isUnlocked: userAchievements.some(a => a.contractType === AchievementType.REFERRAL_MASTER)
    },
    {
      id: 'streak_keeper',
      name: 'Consistency Master',
      description: 'Maintain a 7-day activity streak',
      category: 'social',
      rarity: 'rare',
      icon: 'Flame',
      respectPointsReward: 75,
      contractType: AchievementType.STREAK_KEEPER,
      isUnlocked: userAchievements.some(a => a.contractType === AchievementType.STREAK_KEEPER)
    }
  ];

  // Filter achievements
  const filteredAchievements = allAchievements.filter(achievement => 
    selectedCategory === 'all' || achievement.category === selectedCategory
  );

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔗</div>
            <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400">Please connect your wallet to view your progression</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="space-y-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Progression Dashboard
            </h1>
            <p className="text-gray-400">
              Track your progress, achievements and growth in the community
            </p>
          </div>

          {/* Navigation */}
          <div className="flex flex-wrap gap-2 mb-8">
            {[
              { id: 'overview', label: 'Overview', icon: TrendingUp },
              { id: 'achievements', label: 'Achievements', icon: Trophy },
              { id: 'levels', label: 'Levels', icon: Star },
              { id: 'boosts', label: 'Boosts', icon: Zap },
              { id: 'rewards', label: 'Rewards', icon: Gift }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab: Overview */}
          {activeTab === 'overview' && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Current Level Card */}
                <div className="bg-gradient-to-r from-gray-800/50 to-gray-700/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-600/20">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-full bg-gradient-to-r ${currentLevel.color} flex items-center justify-center text-2xl`}>
                        {currentLevel.badge}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-white">Level {currentLevel.level}</h3>
                        <p className="text-xl text-purple-400">{currentLevel.name}</p>
                        <p className="text-gray-400 text-sm">{currentLevel.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-white">{totalRespectPoints}</div>
                      <div className="text-sm text-gray-400">Respect Points</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {nextLevel && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Progress to {nextLevel.name}</span>
                        <span className="text-purple-400">{pointsToNext} points needed</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-3">
                        <motion.div 
                          className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${progressToNext}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{currentLevel.respectPointsRequired}</span>
                        <span>{nextLevel.respectPointsRequired}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    title="Communities"
                    value={userStats?.totalCommunitiesJoined || 0}
                    icon={Users}
                    color="from-blue-500 to-cyan-500"
                    description="Joined communities"
                  />
                  <StatCard
                    title="Events"
                    value={userStats?.totalEventsAttended || 0}
                    icon={Calendar}
                    color="from-green-500 to-teal-500"
                    description="Events attended"
                  />
                  <StatCard
                    title="ETH Earned"
                    value={parseFloat(userStats?.totalEthEarned || '0').toFixed(4)}
                    icon={Coins}
                    color="from-yellow-500 to-orange-500"
                    description="Total earnings"
                  />
                  <StatCard
                    title="Achievements"
                    value={allAchievements.filter(a => a.isUnlocked).length}
                    icon={Trophy}
                    color="from-purple-500 to-pink-500"
                    description="Unlocked achievements"
                  />
                </div>

                {/* Community Memberships */}
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-600/20">
                  <h3 className="text-xl font-bold text-white mb-4">Community Memberships</h3>
                  {userMemberships.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {userMemberships.map((membership) => (
                        <MembershipCard key={membership.communityId} membership={membership} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-gray-500 mx-auto mb-2" />
                      <p className="text-gray-400">No community memberships yet</p>
                      <button 
                        onClick={() => router.push('/spheres/community-browser')}
                        className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                      >
                        Browse Communities
                      </button>
                    </div>
                  )}
                </div>

                {/* Utility Box System */}
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-600/20">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Gift className="w-6 h-6" />
                    Utility Box System
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Streak Savers */}
                    <div className="bg-gray-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-lg bg-green-500/20">
                          <Shield className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">Streak Savers</h4>
                          <div className="text-2xl font-bold text-green-400">{streakSaversCount}</div>
                        </div>
                      </div>
                      <p className="text-gray-400 text-sm mb-3">Automatically protect your activity streak when you miss a day</p>
                      <div className="text-xs text-gray-500">Used automatically when needed</div>
                    </div>

                    {/* Achievement Vouchers */}
                    <div className="bg-gray-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-lg bg-orange-500/20">
                          <Trophy className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">Achievement Vouchers</h4>
                          <div className="text-2xl font-bold text-orange-400">{achievementVouchersCount}</div>
                        </div>
                      </div>
                      <p className="text-gray-400 text-sm mb-3">Unlock premium achievements without paying fees</p>
                      {achievementVouchersCount > 0 && (
                        <div className="text-xs text-green-400">Ready to use in Achievements tab!</div>
                      )}
                    </div>

                    {/* Utility Box Info */}
                    <div className="bg-gray-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-lg bg-purple-500/20">
                          <Gift className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-white">Open Utility Box</h4>
                          <div className="text-sm text-purple-400">Cost: {utilityBoxFee || '0.0001'} ETH</div>
                        </div>
                      </div>
                      <p className="text-gray-400 text-sm mb-3">Get random rewards from opening utility boxes</p>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>• 1% - NFT Collectible 🎨</div>
                        <div>• 4% - Achievement Voucher 🏆</div>
                        <div>• 10% - Streak Saver 🛡️</div>
                        <div>• 15% - Temporary Boosts ⚡</div>
                        <div>• 40% - Respect Points 💎</div>
                        <div>• 30% - Nothing 😔</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Active Boosts Section */}
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-600/20">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Zap className="w-6 h-6" />
                    Active Boosts
                  </h3>
                  {userBoosts && userBoosts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {userBoosts.filter(boost => boost.active && boost.expiresAt > Date.now() / 1000).map((boost) => (
                        <BoostCard key={boost.id} boost={boost} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <Zap className="w-12 h-12 text-gray-500 mx-auto mb-2" />
                      <p className="text-gray-400">No active boosts</p>
                      <p className="text-sm text-gray-500">Open Utility Boxes or purchase boosts to get started!</p>
                    </div>
                  )}
                </div>

                {/* Daily Activity Section */}
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-600/20">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Flame className="w-6 h-6" />
                    Daily Activity
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-2">Current Streaks</h4>
                      {userMemberships.length > 0 ? (
                        <div className="space-y-3">
                          {userMemberships.map((membership) => (
                            <div key={membership.communityId} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                              <div>
                                <div className="text-white font-medium">Community #{membership.communityId}</div>
                                <div className="text-sm text-gray-400">Current: {membership.currentStreak} days</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <div className="text-orange-400 font-bold">{membership.currentStreak}🔥</div>
                                  <div className="text-xs text-gray-500">Best: {membership.longestStreak}</div>
                                </div>
                                <DailyStreakButton communityId={membership.communityId} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <p className="text-gray-400">No active streaks yet</p>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <h4 className="text-lg font-semibold text-white mb-2">Streak Tips</h4>
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                          <p className="text-sm text-gray-300">Visit daily to maintain your streak</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Shield className="w-4 h-4 text-blue-400 mt-0.5" />
                          <p className="text-sm text-gray-300">Use Streak Savers if you miss a day</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Trophy className="w-4 h-4 text-yellow-400 mt-0.5" />
                          <p className="text-sm text-gray-300">Reach 7 days for special achievements</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Gift className="w-4 h-4 text-purple-400 mt-0.5" />
                          <p className="text-sm text-gray-300">Longer streaks unlock better rewards</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Tab: Achievements */}
          {activeTab === 'achievements' && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Achievement Categories */}
                <div className="flex flex-wrap gap-2">
                  {['all', 'social', 'financial', 'events', 'community', 'leadership'].map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category as any)}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        selectedCategory === category
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                      }`}
                    >
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Achievements Grid */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredAchievements.map((achievement) => (
                    <AchievementCard 
                      key={achievement.id} 
                      achievement={achievement}
                      onPurchase={async (achievementType) => {
                        try {
                          await unlockPremiumAchievement(achievementType);
                        } catch (error) {
                          console.error('Error purchasing achievement:', error);
                        }
                      }}
                      onUseVoucher={async (achievementType) => {
                        try {
                          await useAchievementVoucher(achievementType);
                        } catch (error) {
                          console.error('Error using voucher:', error);
                        }
                      }}
                      achievementVouchersCount={achievementVouchersCount}
                      achievementUnlockFee={achievementUnlockFee}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Tab: Levels */}
          {activeTab === 'levels' && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  {levels.map((level) => (
                    <LevelCard 
                      key={level.level} 
                      level={level} 
                      isCurrentLevel={level.level === currentLevel.level}
                      isUnlocked={totalRespectPoints >= level.respectPointsRequired}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Tab: Boosts */}
          {activeTab === 'boosts' && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <BoostManagement 
                  userBoosts={userBoosts}
                  onPurchaseBoost={purchaseBoost}
                  onActivateBoost={activateBoost}
                  boostPurchaseFee={boostPurchaseFee}
                />
              </motion.div>
            </AnimatePresence>
          )}

          {/* Tab: Rewards */}
          {activeTab === 'rewards' && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="text-center py-12">
                  <Gift className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Rewards System</h3>
                  <p className="text-gray-400">Earn rewards through achievements and level progression</p>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

// StatCard Component
const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
}> = ({ title, value, icon: Icon, color, description }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-gradient-to-r ${color}/20 rounded-2xl p-4 border border-white/10`}
  >
    <div className="flex items-center justify-between mb-2">
      <Icon className="w-6 h-6 text-white" />
      <div className="text-right">
        <div className="text-lg font-bold text-white">{value}</div>
        <div className="text-xs text-gray-300">{title}</div>
      </div>
    </div>
    <div className="text-xs text-gray-400">{description}</div>
  </motion.div>
);

// MembershipCard Component
const MembershipCard: React.FC<{ membership: any }> = ({ membership }) => (
  <div className="bg-gray-700/50 rounded-xl p-4 border border-gray-600/20">
    <div className="flex items-center justify-between mb-3">
      <h4 className="font-semibold text-white">Community #{membership.communityId}</h4>
      <div className="text-sm text-purple-400">Level {membership.level}</div>
    </div>
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-gray-400">Respect Points:</span>
        <span className="text-white">{membership.respectPoints}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Events Won:</span>
        <span className="text-green-400">{membership.totalEventsWon}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-gray-400">Longest Streak:</span>
        <span className="text-orange-400">{membership.longestStreak}</span>
      </div>
    </div>
  </div>
);

// Enhanced AchievementCard Component with Premium Features
const AchievementCard: React.FC<{ 
  achievement: UserAchievement & { isUnlocked: boolean };
  onPurchase?: (achievementType: AchievementType) => void;
  onUseVoucher?: (achievementType: AchievementType) => void;
  achievementVouchersCount?: number;
  achievementUnlockFee?: string;
}> = ({ achievement, onPurchase, onUseVoucher, achievementVouchersCount, achievementUnlockFee }) => {
  const IconComponent = getAchievementIcon(achievement.icon);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-4 rounded-xl border ${
        achievement.isUnlocked
          ? 'bg-green-500/10 border-green-500/30'
          : 'bg-gray-800/50 border-gray-600/20'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${
          achievement.isUnlocked 
            ? 'bg-green-500/20 text-green-400' 
            : 'bg-gray-700/50 text-gray-400'
        }`}>
          <IconComponent className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-white">{achievement.name}</h4>
          <p className="text-sm text-gray-400">{achievement.description}</p>
        </div>
        {achievement.isUnlocked && (
          <CheckCircle className="w-5 h-5 text-green-400" />
        )}
        {!achievement.isUnlocked && (
          <Lock className="w-5 h-5 text-gray-500" />
        )}
      </div>
      
      <div className="flex items-center justify-between text-sm mb-3">
        <span className={`px-2 py-1 rounded-full text-xs ${
          achievement.rarity === 'legendary' ? 'bg-yellow-500/20 text-yellow-400' :
          achievement.rarity === 'epic' ? 'bg-purple-500/20 text-purple-400' :
          achievement.rarity === 'rare' ? 'bg-blue-500/20 text-blue-400' :
          'bg-gray-500/20 text-gray-400'
        }`}>
          {achievement.rarity.charAt(0).toUpperCase() + achievement.rarity.slice(1)}
        </span>
        <span className="text-purple-400">+{achievement.respectPointsReward} RP</span>
      </div>

      {/* Premium unlock buttons for locked achievements */}
      {!achievement.isUnlocked && (
        <div className="space-y-2">
          {/* Use Voucher Button */}
          {achievementVouchersCount && achievementVouchersCount > 0 && (
            <button
              onClick={() => onUseVoucher?.(achievement.contractType)}
              className="w-full py-2 bg-orange-500/20 text-orange-400 rounded-lg text-sm hover:bg-orange-500/30 transition-colors flex items-center justify-center gap-2"
            >
              <Gift className="w-4 h-4" />
              Use Voucher (Free)
            </button>
          )}
          
          {/* Purchase Button */}
          <button
            onClick={() => onPurchase?.(achievement.contractType)}
            className="w-full py-2 bg-purple-500/20 text-purple-400 rounded-lg text-sm hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-2"
          >
            <Coins className="w-4 h-4" />
            Buy for {achievementUnlockFee || '0.0005'} ETH
          </button>
        </div>
      )}
    </motion.div>
  );
};

// BoostCard Component
const BoostCard: React.FC<{ boost: UserBoost }> = ({ boost }) => {
  const IconComponent = getBoostIcon(boost.icon);
  const timeLeft = Math.max(0, boost.expiresAt - Date.now() / 1000);
  const hoursLeft = Math.floor(timeLeft / 3600);
  const minutesLeft = Math.floor((timeLeft % 3600) / 60);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-4 rounded-xl border ${
        boost.active && timeLeft > 0
          ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30'
          : 'bg-gray-800/50 border-gray-600/20'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg bg-gradient-to-r ${boost.color}`}>
          <IconComponent className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-white">{boost.name}</h4>
          <p className="text-sm text-gray-400">{boost.description}</p>
        </div>
        {boost.active && timeLeft > 0 && (
          <div className="text-center">
            <div className="text-sm font-bold text-purple-400">{boost.multiplier}%</div>
            <div className="text-xs text-gray-400">Multiplier</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className={`px-2 py-1 rounded-full text-xs ${
          boost.active && timeLeft > 0
            ? 'bg-green-500/20 text-green-400'
            : 'bg-gray-500/20 text-gray-400'
        }`}>
          {boost.active && timeLeft > 0 ? 'Active' : 'Inactive'}
        </span>
        <span className="text-gray-400">
          {timeLeft > 0 ? `${hoursLeft}h ${minutesLeft}m left` : 'Expired'}
        </span>
      </div>
    </motion.div>
  );
};

// LevelCard Component
const LevelCard: React.FC<{ 
  level: Level; 
  isCurrentLevel: boolean; 
  isUnlocked: boolean; 
}> = ({ level, isCurrentLevel, isUnlocked }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className={`p-6 rounded-xl border ${
      isCurrentLevel
        ? 'bg-purple-500/10 border-purple-500/30'
        : isUnlocked
        ? 'bg-gray-800/50 border-gray-600/20'
        : 'bg-gray-900/50 border-gray-700/20 opacity-60'
    }`}
  >
    <div className="flex items-center gap-4 mb-4">
      <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${level.color} flex items-center justify-center text-xl`}>
        {isUnlocked ? level.badge : <Lock className="w-5 h-5" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Level {level.level}: {level.name}</h3>
          {isCurrentLevel && (
            <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">
              Current
            </span>
          )}
        </div>
        <p className="text-gray-400 text-sm">{level.description}</p>
        <p className="text-purple-400 text-sm">{level.respectPointsRequired} Respect Points required</p>
      </div>
    </div>
    
    {level.rewards.length > 0 && (
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-white">Rewards:</h4>
        <div className="grid gap-2">
          {level.rewards.map((reward, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <reward.icon className="w-4 h-4 text-purple-400" />
              <span className="text-gray-300">{reward.description}</span>
              {reward.amount && (
                <span className="text-purple-400">+{reward.amount}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
  </motion.div>
);

// Boost Management Component
const BoostManagement: React.FC<{
  userBoosts: UserBoost[];
  onPurchaseBoost: (boostType: BoostType, durationHours: number) => Promise<void>;
  onActivateBoost: (boostType: BoostType) => Promise<void>;
  boostPurchaseFee?: string;
}> = ({ userBoosts, onPurchaseBoost, onActivateBoost, boostPurchaseFee }) => {
  const [selectedDuration, setSelectedDuration] = useState<number>(24);

  // Calculate dynamic pricing based on duration
  const calculateBoostPrice = (durationHours: number): string => {
    if (!boostPurchaseFee) return '0.0005';
    const baseFee = parseFloat(boostPurchaseFee);
    const durationMultiplier = Math.max(1, durationHours / 24);
    const dynamicFee = baseFee * durationMultiplier;
    return dynamicFee.toFixed(4);
  };

  const availableBoosts = [
    {
      type: BoostType.EXPERIENCE_MULTIPLIER,
      name: 'Experience Multiplier',
      description: 'Double your respect points gain from all activities',
      icon: 'Zap',
      color: 'from-yellow-500 to-orange-500',
      multiplier: '2x'
    },
    {
      type: BoostType.REPUTATION_MULTIPLIER,
      name: 'Reputation Multiplier',
      description: '1.5x reputation gain from member ratings',
      icon: 'Star',
      color: 'from-purple-500 to-pink-500',
      multiplier: '1.5x'
    },
    {
      type: BoostType.EVENT_DISCOUNT,
      name: 'Event Discount',
      description: '20% discount on all event participation fees',
      icon: 'DollarSign',
      color: 'from-green-500 to-teal-500',
      multiplier: '20% off'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Active Boosts Section */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-600/20">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Zap className="w-6 h-6" />
          Active Boosts
        </h3>
        {userBoosts && userBoosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userBoosts.filter(boost => boost.active && boost.expiresAt > Date.now() / 1000).map((boost) => (
              <BoostCard key={boost.id} boost={boost} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Zap className="w-12 h-12 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400">No active boosts</p>
          </div>
        )}
      </div>

      {/* Purchase Boosts Section */}
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-600/20">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Coins className="w-6 h-6" />
          Purchase Boosts
        </h3>
        
        {/* Duration Selector */}
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-white mb-3">Select Duration</h4>
          <div className="flex flex-wrap gap-2">
            {[1, 6, 12, 24, 72, 168].map((hours) => (
              <button
                key={hours}
                onClick={() => setSelectedDuration(hours)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  selectedDuration === hours
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50'
                }`}
              >
                {hours < 24 ? `${hours}h` : `${hours / 24}d`}
              </button>
            ))}
          </div>
        </div>

        {/* Available Boosts */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableBoosts.map((boost) => {
            const IconComponent = getBoostIcon(boost.icon);
            const userBoost = userBoosts.find(ub => ub.boostType === boost.type);
            const isActive = userBoost?.active && userBoost?.expiresAt > Date.now() / 1000;
            
            return (
              <div
                key={boost.type}
                className="bg-gray-700/50 rounded-xl p-4 border border-gray-600/20"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-2 rounded-lg bg-gradient-to-r ${boost.color}`}>
                    <IconComponent className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-white">{boost.name}</h4>
                    <p className="text-sm text-gray-400">{boost.description}</p>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-purple-400">{boost.multiplier}</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 mb-2">
                    Cost: {calculateBoostPrice(selectedDuration)} ETH for {selectedDuration < 24 ? `${selectedDuration}h` : `${selectedDuration / 24}d`}
                  </div>
                  
                  <button
                    onClick={async () => {
                      try {
                        await onPurchaseBoost(boost.type, selectedDuration);
                      } catch (error) {
                        console.error('Error purchasing boost:', error);
                      }
                    }}
                    disabled={isActive}
                    className={`w-full py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 ${
                      isActive
                        ? 'bg-gray-600/50 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                    }`}
                  >
                    <Coins className="w-4 h-4" />
                    {isActive ? 'Already Active' : 'Purchase'}
                  </button>
                  
                  {userBoost && !userBoost.active && userBoost.expiresAt > Date.now() / 1000 && (
                    <button
                      onClick={async () => {
                        try {
                          await onActivateBoost(boost.type);
                        } catch (error) {
                          console.error('Error activating boost:', error);
                        }
                      }}
                      className="w-full py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      Activate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default UserProgressionDashboard; 