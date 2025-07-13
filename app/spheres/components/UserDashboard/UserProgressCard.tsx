'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface UserProgressCardProps {
  userStats: {
    totalRespectPoints: number;
    averageLevel: number;
    communitiesJoined: number;
    totalEventsParticipated: number;
    totalSpent: number;
  } | null;
}

export default function UserProgressCard({ userStats }: UserProgressCardProps) {
  // Oblicz poziom globalny na podstawie punktów szacunku
  const calculateGlobalLevel = (respectPoints: number) => {
    if (respectPoints < 100) return 0;
    if (respectPoints < 500) return 1;
    if (respectPoints < 1500) return 2;
    if (respectPoints < 3000) return 3;
    if (respectPoints < 5000) return 4;
    return 5;
  };

  // Oblicz progress do następnego poziomu
  const calculateProgress = (respectPoints: number) => {
    const levelThresholds = [0, 100, 500, 1500, 3000, 5000];
    const currentLevel = calculateGlobalLevel(respectPoints);
    
    if (currentLevel === 5) return 100; // Maksymalny poziom
    
    const currentThreshold = levelThresholds[currentLevel];
    const nextThreshold = levelThresholds[currentLevel + 1];
    const progress = ((respectPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
    
    return Math.min(100, Math.max(0, progress));
  };

  const globalLevel = calculateGlobalLevel(userStats?.totalRespectPoints || 0);
  const progress = calculateProgress(userStats?.totalRespectPoints || 0);

  // Poziomy i ich opisy
  const levelInfo = [
    { level: 0, name: 'Newcomer', color: 'text-gray-400', bg: 'bg-gray-500/20' },
    { level: 1, name: 'Explorer', color: 'text-green-400', bg: 'bg-green-500/20' },
    { level: 2, name: 'Contributor', color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { level: 3, name: 'Veteran', color: 'text-purple-400', bg: 'bg-purple-500/20' },
    { level: 4, name: 'Expert', color: 'text-orange-400', bg: 'bg-orange-500/20' },
    { level: 5, name: 'Master', color: 'text-yellow-400', bg: 'bg-yellow-500/20' }
  ];

  const currentLevelInfo = levelInfo[globalLevel];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Your Progress</h3>
        <div className={`px-3 py-1 rounded-full text-sm font-semibold ${currentLevelInfo.bg} ${currentLevelInfo.color}`}>
          Level {globalLevel}: {currentLevelInfo.name}
        </div>
      </div>

      {/* Level Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">Progress to next level</span>
          <span className="text-white">{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, delay: 0.5 }}
            className="h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{userStats?.totalRespectPoints || 0} points</span>
          <span>{globalLevel < 5 ? 'Next: ' + [100, 500, 1500, 3000, 5000][globalLevel] + ' points' : 'MAX LEVEL'}</span>
        </div>
      </div>

      {/* Progress Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-4 bg-white/5 rounded-xl">
          <div className="text-2xl font-bold text-purple-400">
            {userStats?.totalRespectPoints || 0}
          </div>
          <div className="text-sm text-gray-400">Respect Points</div>
        </div>
        <div className="text-center p-4 bg-white/5 rounded-xl">
          <div className="text-2xl font-bold text-blue-400">
            {userStats?.averageLevel || 0}
          </div>
          <div className="text-sm text-gray-400">Avg Community Level</div>
        </div>
      </div>

      {/* Achievement Preview */}
      <div className="border-t border-white/10 pt-4">
        <h4 className="text-sm font-semibold text-white mb-3">Recent Achievements</h4>
        <div className="space-y-2">
          {userStats?.communitiesJoined && userStats.communitiesJoined > 0 && (
            <div className="flex items-center space-x-3 p-2 bg-white/5 rounded-lg">
              <div className="text-xl">🏘️</div>
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Community Member</div>
                <div className="text-xs text-gray-400">Joined {userStats.communitiesJoined} communities</div>
              </div>
            </div>
          )}
          {userStats?.totalEventsParticipated && userStats.totalEventsParticipated > 0 && (
            <div className="flex items-center space-x-3 p-2 bg-white/5 rounded-lg">
              <div className="text-xl">🎪</div>
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Event Participant</div>
                <div className="text-xs text-gray-400">Participated in {userStats.totalEventsParticipated} events</div>
              </div>
            </div>
          )}
          {globalLevel > 0 && (
            <div className="flex items-center space-x-3 p-2 bg-white/5 rounded-lg">
              <div className="text-xl">📈</div>
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Level Up</div>
                <div className="text-xs text-gray-400">Reached {currentLevelInfo.name} level</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
} 