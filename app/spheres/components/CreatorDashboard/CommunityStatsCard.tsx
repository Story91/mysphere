'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { formatEther } from 'viem';

interface CommunityStatsCardProps {
  community: {
    id: number;
    name: string;
    description: string;
    totalMembers: number;
    balance: string;
    withdrawableBalance: string;
    joinFeeEth: string;
    monthlySubFeeEth: string;
    lifetimeSubFeeEth: string;
    status: number;
    createdAt: number;
  };
}

export default function CommunityStatsCard({ community }: CommunityStatsCardProps) {
  // Oblicz statystyki społeczności
  const stats = {
    totalRevenue: parseFloat(community.balance),
    withdrawableRevenue: parseFloat(community.withdrawableBalance),
    joinFee: parseFloat(community.joinFeeEth),
    monthlyFee: parseFloat(community.monthlySubFeeEth),
    lifetimeFee: parseFloat(community.lifetimeSubFeeEth),
    createdDaysAgo: Math.floor((Date.now() / 1000 - community.createdAt) / (24 * 60 * 60))
  };

  // Symulowane dane dla growth metrics (w rzeczywistej aplikacji pobierane z API)
  const growthMetrics = {
    newMembersThisWeek: Math.floor(Math.random() * 10) + 1,
    activeMembers: Math.floor(community.totalMembers * 0.7),
    retentionRate: Math.floor(Math.random() * 30) + 70,
    avgSessionTime: Math.floor(Math.random() * 60) + 15
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-white">{community.name}</h3>
          <p className="text-gray-400 text-sm">{community.description}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
          community.status === 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {community.status === 0 ? 'Active' : 'Inactive'}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-4 bg-white/5 rounded-xl">
          <div className="text-2xl font-bold text-blue-400">
            {community.totalMembers}
          </div>
          <div className="text-sm text-gray-400">Total Members</div>
        </div>
        <div className="text-center p-4 bg-white/5 rounded-xl">
          <div className="text-2xl font-bold text-green-400">
            {stats.totalRevenue.toFixed(4)}
          </div>
          <div className="text-sm text-gray-400">ETH Revenue</div>
        </div>
        <div className="text-center p-4 bg-white/5 rounded-xl">
          <div className="text-2xl font-bold text-purple-400">
            {growthMetrics.activeMembers}
          </div>
          <div className="text-sm text-gray-400">Active Members</div>
        </div>
        <div className="text-center p-4 bg-white/5 rounded-xl">
          <div className="text-2xl font-bold text-orange-400">
            {stats.createdDaysAgo}
          </div>
          <div className="text-sm text-gray-400">Days Old</div>
        </div>
      </div>

      {/* Pricing Info */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-white mb-3">Pricing Structure</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl border border-blue-500/20">
            <div className="text-sm text-gray-400 mb-1">Join Fee</div>
            <div className="text-xl font-bold text-white">{stats.joinFee.toFixed(4)} ETH</div>
          </div>
          <div className="p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl border border-green-500/20">
            <div className="text-sm text-gray-400 mb-1">Monthly Fee</div>
            <div className="text-xl font-bold text-white">{stats.monthlyFee.toFixed(4)} ETH</div>
          </div>
          <div className="p-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl border border-purple-500/20">
            <div className="text-sm text-gray-400 mb-1">Lifetime Fee</div>
            <div className="text-xl font-bold text-white">{stats.lifetimeFee.toFixed(4)} ETH</div>
          </div>
        </div>
      </div>

      {/* Growth Metrics */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-white mb-3">Growth Metrics</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-green-400">+{growthMetrics.newMembersThisWeek}</div>
            <div className="text-xs text-gray-400">New this week</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-blue-400">{growthMetrics.retentionRate}%</div>
            <div className="text-xs text-gray-400">Retention rate</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-purple-400">{growthMetrics.avgSessionTime}m</div>
            <div className="text-xs text-gray-400">Avg session</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-orange-400">
              {((growthMetrics.activeMembers / community.totalMembers) * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-400">Activity rate</div>
          </div>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="border-t border-white/10 pt-4">
        <h4 className="text-lg font-semibold text-white mb-3">Revenue Breakdown</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Total Balance</span>
            <span className="text-white font-semibold">{stats.totalRevenue.toFixed(4)} ETH</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Withdrawable</span>
            <span className="text-green-400 font-semibold">{stats.withdrawableRevenue.toFixed(4)} ETH</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Revenue per Member</span>
            <span className="text-purple-400 font-semibold">
              {community.totalMembers > 0 ? (stats.totalRevenue / community.totalMembers).toFixed(4) : '0.0000'} ETH
            </span>
          </div>
          
          {/* Progress Bar for Revenue */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Revenue Goal Progress</span>
              <span className="text-white">
                {((stats.totalRevenue / 1.0) * 100).toFixed(0)}% of 1.0 ETH
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="h-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"
                style={{ width: `${Math.min(100, (stats.totalRevenue / 1.0) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
} 