'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface RecentActivityCardProps {
  community: {
    id: number;
    name: string;
    totalMembers: number;
  };
}

export default function RecentActivityCard({ community }: RecentActivityCardProps) {
  // Symulowane dane aktywności (w rzeczywistej aplikacji pobierane z API)
  const recentActivity = [
    {
      id: 1,
      type: 'member_joined',
      user: '0x1234...5678',
      action: 'joined the community',
      timestamp: '2 hours ago',
      icon: '👥',
      color: 'text-green-400'
    },
    {
      id: 2,
      type: 'event_created',
      user: 'You',
      action: 'created "Web3 Workshop"',
      timestamp: '4 hours ago',
      icon: '🎪',
      color: 'text-purple-400'
    },
    {
      id: 3,
      type: 'utilitybox_opened',
      user: '0xabcd...efgh',
      action: 'opened a UtilityBox',
      timestamp: '6 hours ago',
      icon: '🎁',
      color: 'text-orange-400'
    },
    {
      id: 4,
      type: 'level_up',
      user: '0x9876...5432',
      action: 'reached level 3',
      timestamp: '8 hours ago',
      icon: '📈',
      color: 'text-blue-400'
    },
    {
      id: 5,
      type: 'event_participation',
      user: '0xdef0...1234',
      action: 'joined "NFT Art Competition"',
      timestamp: '10 hours ago',
      icon: '🎨',
      color: 'text-pink-400'
    },
    {
      id: 6,
      type: 'withdrawal',
      user: 'You',
      action: 'withdrew 0.05 ETH',
      timestamp: '1 day ago',
      icon: '💸',
      color: 'text-yellow-400'
    },
    {
      id: 7,
      type: 'achievement_unlocked',
      user: '0x5678...9abc',
      action: 'unlocked "Event Host" achievement',
      timestamp: '1 day ago',
      icon: '🏆',
      color: 'text-cyan-400'
    },
    {
      id: 8,
      type: 'member_promoted',
      user: 'You',
      action: 'promoted 0xabcd...efgh to moderator',
      timestamp: '2 days ago',
      icon: '⭐',
      color: 'text-indigo-400'
    }
  ];

  // Engagement metrics
  const engagementMetrics = {
    dailyActiveUsers: Math.floor(community.totalMembers * 0.4),
    weeklyActiveUsers: Math.floor(community.totalMembers * 0.7),
    monthlyActiveUsers: Math.floor(community.totalMembers * 0.9),
    engagementRate: Math.floor(Math.random() * 20) + 60, // 60-80%
    averageSessionTime: Math.floor(Math.random() * 30) + 25, // 25-55 minutes
    retentionRate: Math.floor(Math.random() * 15) + 75 // 75-90%
  };

  const formatAddress = (address: string) => {
    if (address === 'You') return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Recent Activity</h3>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-400">Live</span>
        </div>
      </div>

      {/* Engagement Metrics */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-white mb-3">Community Engagement</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-white/5 rounded-xl">
            <div className="text-sm font-bold text-green-400">
              {engagementMetrics.dailyActiveUsers}
            </div>
            <div className="text-xs text-gray-400">Daily Active</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl">
            <div className="text-sm font-bold text-blue-400">
              {engagementMetrics.engagementRate}%
            </div>
            <div className="text-xs text-gray-400">Engagement</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl">
            <div className="text-sm font-bold text-purple-400">
              {engagementMetrics.averageSessionTime}m
            </div>
            <div className="text-xs text-gray-400">Avg Session</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl">
            <div className="text-sm font-bold text-orange-400">
              {engagementMetrics.retentionRate}%
            </div>
            <div className="text-xs text-gray-400">Retention</div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-white mb-3">Activity Feed</h4>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {recentActivity.map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-start space-x-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <div className={`text-lg ${activity.color} min-w-[24px]`}>
                {activity.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-white font-medium">
                    {formatAddress(activity.user)}
                  </span>
                  <span className="text-sm text-gray-400">
                    {activity.action}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {activity.timestamp}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Activity Summary */}
      <div className="border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Activity Summary</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">New Members</span>
              <span className="text-green-400 font-semibold">+12 this week</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Events Created</span>
              <span className="text-purple-400 font-semibold">3 this month</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">UtilityBoxes Opened</span>
              <span className="text-orange-400 font-semibold">45 today</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Level Ups</span>
              <span className="text-blue-400 font-semibold">8 this week</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Achievements</span>
              <span className="text-cyan-400 font-semibold">15 unlocked</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Revenue Generated</span>
              <span className="text-yellow-400 font-semibold">0.25 ETH</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex space-x-2">
          <button className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm transition-colors">
            View All
          </button>
          <button className="flex-1 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm transition-colors">
            Export
          </button>
          <button className="flex-1 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition-colors">
            Analytics
          </button>
        </div>
      </div>
    </motion.div>
  );
} 