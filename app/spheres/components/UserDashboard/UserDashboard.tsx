'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import QuickActions from './QuickActions';
import ActivityOverview from './ActivityOverview';

// Simple StatCard component
const StatCard = ({ title, value, icon, color, subtitle }: {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  subtitle: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`bg-gradient-to-r ${color}/20 rounded-2xl p-6 border border-white/10`}
  >
    <div className="flex items-center justify-between mb-4">
      <div className="text-2xl">{icon}</div>
      <div className="text-right">
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-sm text-gray-300">{title}</div>
      </div>
    </div>
    <div className="text-sm text-gray-400">{subtitle}</div>
  </motion.div>
);

// Mobile Action Item component
const MobileActionItem = ({ action, onClick }: {
  action: any;
  onClick: () => void;
}) => (
  <motion.button
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    onClick={onClick}
    className="flex items-center space-x-3 w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all group"
  >
    <div className="text-lg">{action.icon}</div>
    <div className="flex-1 text-left">
      <h4 className="font-semibold text-white text-sm group-hover:text-white">
        {action.title}
      </h4>
      <p className="text-xs text-gray-400 group-hover:text-gray-300">
        {action.description}
      </p>
    </div>
    <div className="text-gray-400 group-hover:text-gray-300">
      →
    </div>
  </motion.button>
);

export default function UserDashboard() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { 
    address, 
    isConnected, 
    platformStats, 
    userStats, 
    userMemberships, 
    streakSaversCount,
    achievementVouchersCount,
    isLoading,
    isAdmin
  } = useSpheresContract();

  if (!isConnected) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🔗</div>
        <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-gray-400">Please connect your wallet to view your dashboard</p>
      </div>
    );
  }

  // Main action buttons
  const mainActions = [
    {
      title: 'Creator Dashboard',
      description: 'Create & manage communities',
      icon: '🎨',
      color: 'from-purple-500 to-pink-500',
      path: '/spheres/creator-dashboard'
    },
    {
      title: 'Browse Communities',
      description: 'Discover new communities',
      icon: '🏘️',
      color: 'from-blue-500 to-cyan-500',
      path: '/spheres/community-browser'
    },
    {
      title: 'Member Management',
      description: 'Manage community members',
      icon: '👥',
      color: 'from-cyan-500 to-blue-500',
      path: '/spheres/member-management'
    },
    {
      title: 'Event Management',
      description: 'Join and manage events',
      icon: '🎪',
      color: 'from-green-500 to-teal-500',
      path: '/spheres/event-management'
    },
    {
      title: 'Event Participation',
      description: 'Join events',
      icon: '🎯',
      color: 'from-pink-500 to-red-500',
      path: '/spheres/event-participation'
    },
    {
      title: 'User Progression',
      description: 'Track your progress',
      icon: '📈',
      color: 'from-indigo-500 to-purple-500',
      path: '/spheres/user-progression'
    },
    {
      title: 'UtilityBox',
      description: 'Open mystery boxes & rewards',
      icon: '🎁',
      color: 'from-orange-500 to-red-500',
      path: '/spheres/utility-box'
    },
    ...(isAdmin ? [{
      title: 'Admin Panel',
      description: 'Platform administration',
      icon: '⚙️',
      color: 'from-red-500 to-orange-500',
      path: '/spheres/admin'
    }] : [])
  ];

  const handleNavigation = (path: string) => {
    router.push(path);
    setMobileMenuOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Mobile Navigation */}
      <div className="block sm:hidden">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10"
        >
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl border border-purple-500/20 hover:border-purple-500/40 transition-all"
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">🚀</span>
              <span className="text-white font-semibold">Quick Actions</span>
            </div>
            <motion.div
              animate={{ rotate: mobileMenuOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <span className="text-white">↓</span>
            </motion.div>
          </button>
          
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-2 overflow-hidden"
            >
              {mainActions.map((action, index) => (
                <MobileActionItem
                  key={action.title}
                  action={action}
                  onClick={() => handleNavigation(action.path)}
                />
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Desktop Navigation */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4"
      >
        {mainActions.map((action, index) => (
          <motion.button
            key={action.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => router.push(action.path)}
            className={`p-4 rounded-xl bg-gradient-to-r ${action.color}/20 border border-white/10 hover:border-white/20 transition-all group text-left`}
          >
            <div className="flex items-center space-x-3">
              <div className="text-2xl">{action.icon}</div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white group-hover:text-white">
                  {action.title}
                </h3>
                <p className="text-xs text-gray-400 group-hover:text-gray-300">
                  {action.description}
                </p>
              </div>
            </div>
          </motion.button>
        ))}
      </motion.div>

      {/* Platform Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
      >
        <h3 className="text-xl font-bold text-white mb-4">Platform Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {platformStats?.totalCommunities || 0}
            </div>
            <div className="text-sm text-gray-400">Total Communities</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">
              {platformStats?.totalMembers || 0}
            </div>
            <div className="text-sm text-gray-400">Total Members</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              {platformStats?.totalTransactions || 0}
            </div>
            <div className="text-sm text-gray-400">Total Transactions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {platformStats?.totalVolume || '0'} ETH
            </div>
            <div className="text-sm text-gray-400">Total Volume</div>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <StatCard
          title="Respect Points"
          value={userStats?.totalRespectPoints || 0}
          icon="🏆"
          color="from-yellow-500 to-orange-500"
          subtitle="Community engagement"
        />
        <StatCard
          title="Communities"
          value={userStats?.totalCommunitiesJoined || 0}
          icon="🏘️"
          color="from-blue-500 to-cyan-500"
          subtitle="Communities joined"
        />
        <StatCard
          title="Events"
          value={userStats?.totalEventsAttended || 0}
          icon="🎪"
          color="from-purple-500 to-pink-500"
          subtitle="Events attended"
        />
        <StatCard
          title="ETH Earned"
          value={parseFloat(userStats?.totalEthEarned || '0').toFixed(4)}
          icon="💰"
          color="from-green-500 to-teal-500"
          subtitle="Total earnings"
        />
      </motion.div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
        >
          <h3 className="text-xl font-bold text-white mb-4">Your Progress</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Progress to next level</span>
              <span className="text-purple-400 font-bold">Level {userStats?.averageCommunityLevel || 0}: Newcomer</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, ((userStats?.totalRespectPoints || 0) / 100) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>{userStats?.totalRespectPoints || 0} points</span>
              <span>Next: {Math.max(0, 100 - (userStats?.totalRespectPoints || 0))} points</span>
            </div>
          </div>

          {/* Achievement Stats */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">
                {userStats?.totalRespectPoints || 0}
              </div>
              <div className="text-sm text-gray-400">Respect Points</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">
                {userStats?.averageCommunityLevel || 0}
              </div>
              <div className="text-sm text-gray-400">Avg Community Level</div>
            </div>
          </div>

          {/* Utility Box Items */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {streakSaversCount || 0}
              </div>
              <div className="text-sm text-gray-400">Streak Savers</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-400">
                {achievementVouchersCount || 0}
              </div>
              <div className="text-sm text-gray-400">Achievement Vouchers</div>
            </div>
          </div>

          {/* Recent Achievements */}
          <div className="mt-6">
            <h4 className="text-lg font-semibold text-white mb-3">Recent Achievements</h4>
            <div className="text-center text-gray-400 py-8">
              {userStats?.totalAchievements || 0} achievements unlocked
            </div>
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <ActivityOverview userStats={userStats ? {
            totalRespectPoints: userStats.totalRespectPoints,
            averageLevel: userStats.averageCommunityLevel,
            communitiesJoined: userStats.totalCommunitiesJoined,
            totalEventsParticipated: userStats.totalEventsAttended,
            totalSpent: parseFloat(userStats.totalEthEarned)
          } : null} />
        </motion.div>
      </div>

      {/* Activity & Tips Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <QuickActions />
      </motion.div>
    </div>
  );
} 