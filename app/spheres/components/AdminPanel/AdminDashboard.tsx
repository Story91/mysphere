'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Users, DollarSign, Activity, TrendingUp, Shield, Globe, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

interface PlatformStats {
  totalCommunities: number;
  totalMembers: number;
  totalTransactions: number;
  activeCommunities: number;
  totalVolume: string;
  totalPlatformFees: string;
}

const mockStats: PlatformStats = {
  totalCommunities: 42,
  totalMembers: 1337,
  totalTransactions: 5682,
  activeCommunities: 38,
  totalVolume: "127.5 ETH",
  totalPlatformFees: "6.37 ETH"
};

const mockChartData = [
  { name: 'Jan', communities: 4, members: 120, volume: 12.5 },
  { name: 'Feb', communities: 8, members: 250, volume: 23.1 },
  { name: 'Mar', communities: 15, members: 450, volume: 45.2 },
  { name: 'Apr', communities: 23, members: 680, volume: 67.8 },
  { name: 'May', communities: 35, members: 950, volume: 89.4 },
  { name: 'Jun', communities: 42, members: 1337, volume: 127.5 },
];

const communityTypes = [
  { name: 'Gaming', value: 35, color: '#8B5CF6' },
  { name: 'Art', value: 25, color: '#06B6D4' },
  { name: 'Music', value: 20, color: '#10B981' },
  { name: 'Tech', value: 15, color: '#F59E0B' },
  { name: 'Other', value: 5, color: '#EF4444' },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats>(mockStats);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('6M');

  // Placeholder for real data fetching
  useEffect(() => {
    // TODO: Implement real data fetching from contract
    const fetchStats = async () => {
      setIsLoading(true);
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        setStats(mockStats);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Total Communities',
      value: stats.totalCommunities,
      icon: Users,
      color: 'bg-blue-500',
      change: '+12.5%',
      changeType: 'positive'
    },
    {
      title: 'Total Members',
      value: stats.totalMembers,
      icon: Globe,
      color: 'bg-green-500',
      change: '+8.3%',
      changeType: 'positive'
    },
    {
      title: 'Total Transactions',
      value: stats.totalTransactions,
      icon: Activity,
      color: 'bg-purple-500',
      change: '+23.1%',
      changeType: 'positive'
    },
    {
      title: 'Active Communities',
      value: stats.activeCommunities,
      icon: Zap,
      color: 'bg-orange-500',
      change: '+5.2%',
      changeType: 'positive'
    },
    {
      title: 'Total Volume',
      value: stats.totalVolume,
      icon: DollarSign,
      color: 'bg-emerald-500',
      change: '+45.6%',
      changeType: 'positive'
    },
    {
      title: 'Platform Fees',
      value: stats.totalPlatformFees,
      icon: TrendingUp,
      color: 'bg-cyan-500',
      change: '+34.2%',
      changeType: 'positive'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Platform Overview</h2>
        <div className="flex items-center space-x-2">
          {['1M', '3M', '6M', '1Y'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                timeRange === range
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-slate-600 transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${card.color}`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className={`text-sm font-medium ${
                  card.changeType === 'positive' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {card.change}
                </div>
              </div>
              <h3 className="text-slate-400 text-sm font-medium mb-1">{card.title}</h3>
              <p className="text-2xl font-bold text-white">{card.value}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Growth Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800 rounded-xl p-6 border border-slate-700"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Platform Growth</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={mockChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F3F4F6'
                }} 
              />
              <Line 
                type="monotone" 
                dataKey="members" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={{ fill: '#3B82F6', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="communities" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={{ fill: '#10B981', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Community Types */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800 rounded-xl p-6 border border-slate-700"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Community Types</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={communityTypes}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {communityTypes.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F3F4F6'
                }} 
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {communityTypes.map((type) => (
              <div key={type.name} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: type.color }}
                  />
                  <span className="text-slate-300 text-sm">{type.name}</span>
                </div>
                <span className="text-slate-400 text-sm">{type.value}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Volume Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Volume & Revenue</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={mockChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="name" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1F2937', 
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#F3F4F6'
              }} 
            />
            <Bar dataKey="volume" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Recent Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {[
            { action: 'New community created', user: 'CreatorDAO', time: '2 minutes ago', type: 'success' },
            { action: 'Community suspended', user: 'BadActor', time: '1 hour ago', type: 'warning' },
            { action: 'Fee structure updated', user: 'Admin', time: '3 hours ago', type: 'info' },
            { action: 'Large transaction', user: 'WhaleUser', time: '5 hours ago', type: 'success' },
            { action: 'User globally banned', user: 'Spammer', time: '1 day ago', type: 'error' }
          ].map((activity, index) => (
            <div key={index} className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${
                  activity.type === 'success' ? 'bg-green-400' :
                  activity.type === 'warning' ? 'bg-yellow-400' :
                  activity.type === 'error' ? 'bg-red-400' : 'bg-blue-400'
                }`} />
                <span className="text-white text-sm">{activity.action}</span>
                <span className="text-slate-400 text-sm">by {activity.user}</span>
              </div>
              <span className="text-slate-500 text-xs">{activity.time}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
} 