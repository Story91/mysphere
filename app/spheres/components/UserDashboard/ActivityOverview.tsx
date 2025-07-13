'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface ActivityOverviewProps {
  userStats: {
    totalRespectPoints: number;
    averageLevel: number;
    communitiesJoined: number;
    totalEventsParticipated: number;
    totalSpent: number;
  } | null;
}

export default function ActivityOverview({ userStats }: ActivityOverviewProps) {
  // Symulowane dane aktywności (w rzeczywistej aplikacji będą pobierane z API)
  const recentActivity = [
    {
      id: 1,
      type: 'utility_box',
      title: 'Opened UtilityBox',
      description: 'Received 50 respect points and a streak saver',
      timestamp: '2 hours ago',
      icon: '🎁',
      color: 'text-purple-400'
    },
    {
      id: 2,
      type: 'event',
      title: 'Joined Community Event',
      description: 'Participated in "Web3 Workshop" - placed 3rd',
      timestamp: '1 day ago',
      icon: '🎪',
      color: 'text-green-400'
    },
    {
      id: 3,
      type: 'level_up',
      title: 'Level Up!',
      description: 'Reached level 2 in "Crypto Developers"',
      timestamp: '2 days ago',
      icon: '📈',
      color: 'text-blue-400'
    },
    {
      id: 4,
      type: 'achievement',
      title: 'Achievement Unlocked',
      description: 'Event Participant - Join 5 events',
      timestamp: '3 days ago',
      icon: '🏆',
      color: 'text-yellow-400'
    },
    {
      id: 5,
      type: 'community',
      title: 'Joined Community',
      description: 'Became a member of "Base Builders"',
      timestamp: '1 week ago',
      icon: '🏘️',
      color: 'text-cyan-400'
    }
  ];

  // Oblicz statystyki aktywności
  const activityStats = {
    thisWeek: {
      utilityBoxes: 3,
      events: 1,
      respectEarned: 150
    },
    thisMonth: {
      utilityBoxes: 12,
      events: 7,
      respectEarned: 580
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <h3 className="text-xl font-bold text-white mb-6">Activity Overview</h3>

      {/* Weekly Stats */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-white mb-3">This Week</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <div className="text-lg font-bold text-purple-400">
              {activityStats.thisWeek.utilityBoxes}
            </div>
            <div className="text-xs text-gray-400">Boxes</div>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <div className="text-lg font-bold text-green-400">
              {activityStats.thisWeek.events}
            </div>
            <div className="text-xs text-gray-400">Events</div>
          </div>
          <div className="text-center p-3 bg-white/5 rounded-xl">
            <div className="text-lg font-bold text-blue-400">
              {activityStats.thisWeek.respectEarned}
            </div>
            <div className="text-xs text-gray-400">Respect</div>
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-3">Recent Activity</h4>
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {recentActivity.map((activity, index) => (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-start space-x-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <div className={`text-lg ${activity.color}`}>
                {activity.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h5 className="text-sm font-medium text-white truncate">
                  {activity.title}
                </h5>
                <p className="text-xs text-gray-400 mt-1">
                  {activity.description}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {activity.timestamp}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Activity Summary */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Total Activity Score</span>
          <span className="text-white font-semibold">
            {(userStats?.totalRespectPoints || 0) + (userStats?.totalEventsParticipated || 0) * 10}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm mt-1">
          <span className="text-gray-400">Active Communities</span>
          <span className="text-white font-semibold">
            {userStats?.communitiesJoined || 0}
          </span>
        </div>
      </div>

      {/* Progress Encouragement */}
      <div className="mt-4 p-3 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl border border-green-500/20">
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-sm">🎯</span>
          <h4 className="text-sm font-semibold text-white">Keep Going!</h4>
        </div>
        <p className="text-xs text-gray-300">
          You're doing great! Continue participating in events and opening UtilityBoxes to earn more rewards.
        </p>
      </div>
    </motion.div>
  );
} 