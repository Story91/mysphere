'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Settings, Save, RotateCcw, TrendingUp, Percent, Coins, Zap, Users } from 'lucide-react';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';

interface FeeSettings {
  creationFee: string;
  utilityBoxFee: string;
  achievementUnlockFee: string;
  boostPurchaseFee: string;
  eventPlatformFee: string;
  withdrawalFeePercentage: number;
  defaultPlatformFeePercentage: number;
  maxPlatformFeePercentage: number;
}

interface FeeStats {
  totalFeesCollected: string;
  feesLast30Days: string;
  averageFeePerTransaction: string;
  totalTransactions: number;
}

const mockFeeSettings: FeeSettings = {
  creationFee: "0.01",
  utilityBoxFee: "0.0001",
  achievementUnlockFee: "0.0005",
  boostPurchaseFee: "0.0005",
  eventPlatformFee: "0.002",
  withdrawalFeePercentage: 10, // 1%
  defaultPlatformFeePercentage: 25, // 2.5%
  maxPlatformFeePercentage: 100 // 10%
};

const mockFeeStats: FeeStats = {
  totalFeesCollected: "234.56",
  feesLast30Days: "45.67",
  averageFeePerTransaction: "0.0123",
  totalTransactions: 19087
};

export default function AdminFeeManagement() {
  const spheresContract = useSpheresContract();
  const [feeSettings, setFeeSettings] = useState<FeeSettings>(mockFeeSettings);
  const [feeStats, setFeeStats] = useState<FeeStats>(mockFeeStats);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<FeeSettings>(mockFeeSettings);

  // Update fee setting and track changes
  const updateFeeSetting = (key: keyof FeeSettings, value: string | number) => {
    setFeeSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  };

  // Reset to original settings
  const resetToOriginal = () => {
    setFeeSettings(originalSettings);
    setHasChanges(false);
  };

  // Save fee settings
  const handleSaveFeeSettings = async () => {
    setIsLoading(true);
    try {
      // Call real contract functions
      await spheresContract.setCreationFee(feeSettings.creationFee);
      await spheresContract.setUtilityBoxFee(feeSettings.utilityBoxFee);
      await spheresContract.setAchievementUnlockFee(feeSettings.achievementUnlockFee);
      await spheresContract.setBoostPurchaseFee(feeSettings.boostPurchaseFee);
      await spheresContract.setEventPlatformFee(feeSettings.eventPlatformFee);
      await spheresContract.setWithdrawalFeePercentage(feeSettings.withdrawalFeePercentage);
      
      setOriginalSettings(feeSettings);
      setHasChanges(false);
      
      // Refresh contract data
      spheresContract.refetchAll();
      
      toast.success('Fee settings updated successfully!');
    } catch (error) {
      console.error('Error updating fee settings:', error);
      toast.error('Failed to update fee settings');
    } finally {
      setIsLoading(false);
    }
  };

  const feeCards = [
    {
      title: 'Community Creation',
      value: feeSettings.creationFee,
      unit: 'ETH',
      key: 'creationFee' as keyof FeeSettings,
      icon: Users,
      color: 'bg-blue-500',
      description: 'Fee for creating a new community'
    },
    {
      title: 'Utility Box',
      value: feeSettings.utilityBoxFee,
      unit: 'ETH',
      key: 'utilityBoxFee' as keyof FeeSettings,
      icon: Zap,
      color: 'bg-purple-500',
      description: 'Fee for opening a utility box'
    },
    {
      title: 'Achievement Unlock',
      value: feeSettings.achievementUnlockFee,
      unit: 'ETH',
      key: 'achievementUnlockFee' as keyof FeeSettings,
      icon: TrendingUp,
      color: 'bg-green-500',
      description: 'Fee for premium achievement unlock'
    },
    {
      title: 'Boost Purchase',
      value: feeSettings.boostPurchaseFee,
      unit: 'ETH',
      key: 'boostPurchaseFee' as keyof FeeSettings,
      icon: Coins,
      color: 'bg-orange-500',
      description: 'Fee for purchasing boosts'
    },
    {
      title: 'Event Platform',
      value: feeSettings.eventPlatformFee,
      unit: 'ETH',
      key: 'eventPlatformFee' as keyof FeeSettings,
      icon: Settings,
      color: 'bg-cyan-500',
      description: 'Platform fee for creating events'
    }
  ];

  const percentageFees = [
    {
      title: 'Withdrawal Fee',
      value: feeSettings.withdrawalFeePercentage,
      key: 'withdrawalFeePercentage' as keyof FeeSettings,
      max: 50,
      description: 'Percentage fee on community fund withdrawals'
    },
    {
      title: 'Default Platform Fee',
      value: feeSettings.defaultPlatformFeePercentage,
      key: 'defaultPlatformFeePercentage' as keyof FeeSettings,
      max: 100,
      description: 'Default platform fee percentage for new communities'
    },
    {
      title: 'Max Platform Fee',
      value: feeSettings.maxPlatformFeePercentage,
      key: 'maxPlatformFeePercentage' as keyof FeeSettings,
      max: 200,
      description: 'Maximum platform fee percentage allowed'
    }
  ];

  const statCards = [
    {
      title: 'Total Fees Collected',
      value: feeStats.totalFeesCollected,
      unit: 'ETH',
      icon: DollarSign,
      color: 'bg-emerald-500',
      change: '+12.5%',
      changeType: 'positive'
    },
    {
      title: 'Fees (Last 30 Days)',
      value: feeStats.feesLast30Days,
      unit: 'ETH',
      icon: TrendingUp,
      color: 'bg-blue-500',
      change: '+8.3%',
      changeType: 'positive'
    },
    {
      title: 'Average Fee/Transaction',
      value: feeStats.averageFeePerTransaction,
      unit: 'ETH',
      icon: Percent,
      color: 'bg-purple-500',
      change: '+2.1%',
      changeType: 'positive'
    },
    {
      title: 'Total Transactions',
      value: feeStats.totalTransactions,
      unit: '',
      icon: Coins,
      color: 'bg-orange-500',
      change: '+156',
      changeType: 'positive'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Fee Management</h2>
        <div className="flex items-center space-x-3">
          {hasChanges && (
            <button
              onClick={resetToOriginal}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center space-x-2"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset</span>
            </button>
          )}
          <button
            onClick={handleSaveFeeSettings}
            disabled={isLoading || !hasChanges}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span>{isLoading ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* Fee Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-800 rounded-xl p-6 border border-slate-700"
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
              <p className="text-2xl font-bold text-white">
                {card.value} {card.unit}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Fixed Fee Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Fixed Fee Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {feeCards.map((fee, index) => (
            <div key={fee.key} className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${fee.color}`}>
                  <fee.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="text-white font-medium">{fee.title}</h4>
                  <p className="text-slate-400 text-sm">{fee.description}</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  value={fee.value}
                  onChange={(e) => updateFeeSetting(fee.key, e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500 pr-12"
                />
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">
                  {fee.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Percentage Fee Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Percentage Fee Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {percentageFees.map((fee, index) => (
            <div key={fee.key} className="space-y-3">
              <div>
                <h4 className="text-white font-medium">{fee.title}</h4>
                <p className="text-slate-400 text-sm">{fee.description}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">
                    {(fee.value / 10).toFixed(1)}%
                  </span>
                  <span className="text-slate-500 text-xs">
                    Max: {(fee.max / 10).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={fee.max}
                  step="5"
                  value={fee.value}
                  onChange={(e) => updateFeeSetting(fee.key, parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <input
                  type="number"
                  min="0"
                  max={fee.max}
                  step="5"
                  value={fee.value}
                  onChange={(e) => updateFeeSetting(fee.key, parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Fee Impact Analysis */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Fee Impact Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="text-white font-medium">Revenue Projections</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Daily Revenue (Est.)</span>
                <span className="text-green-400 font-mono">1.23 ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Monthly Revenue (Est.)</span>
                <span className="text-green-400 font-mono">36.9 ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Annual Revenue (Est.)</span>
                <span className="text-green-400 font-mono">449.55 ETH</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h4 className="text-white font-medium">Fee Distribution</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Platform Fees</span>
                <span className="text-blue-400">65%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Community Creators</span>
                <span className="text-purple-400">30%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Gas & Operations</span>
                <span className="text-orange-400">5%</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Fee History */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-slate-800 rounded-xl p-6 border border-slate-700"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Recent Fee Changes</h3>
        <div className="space-y-3">
          {[
            { date: '2024-01-20', change: 'Utility Box fee reduced from 0.0002 to 0.0001 ETH', type: 'decrease' },
            { date: '2024-01-15', change: 'Platform fee increased from 2.0% to 2.5%', type: 'increase' },
            { date: '2024-01-10', change: 'Event platform fee introduced at 0.002 ETH', type: 'new' },
            { date: '2024-01-05', change: 'Achievement unlock fee adjusted to 0.0005 ETH', type: 'adjust' }
          ].map((item, index) => (
            <div key={index} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-b-0">
              <div className="flex items-center space-x-3">
                <div className={`w-2 h-2 rounded-full ${
                  item.type === 'increase' ? 'bg-red-400' :
                  item.type === 'decrease' ? 'bg-green-400' :
                  item.type === 'new' ? 'bg-blue-400' : 'bg-yellow-400'
                }`} />
                <span className="text-white text-sm">{item.change}</span>
              </div>
              <span className="text-slate-500 text-xs">{item.date}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
} 