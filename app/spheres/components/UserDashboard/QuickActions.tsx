'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';

export default function QuickActions() {
  const { openUtilityBox, utilityBoxFee, formatEther, isLoading } = useSpheresContract();

  // Funkcja do otwierania UtilityBox
  const handleOpenUtilityBox = async () => {
    try {
      await openUtilityBox(1); // Używamy community ID 1 jako przykład
      toast.success('UtilityBox opened successfully! 🎁');
    } catch (error) {
      console.error('Error opening UtilityBox:', error);
      toast.error('Failed to open UtilityBox');
    }
  };

  const quickActions = [
    {
      id: 'browse',
      title: 'Browse Communities',
      description: 'Discover new communities to join',
      icon: '🔍',
      color: 'from-blue-500 to-cyan-500',
      action: () => {
        // Tutaj będzie implementacja przeglądania społeczności
        toast.success('Community browser opening soon!');
      }
    },
    {
      id: 'utilitybox',
      title: 'Open UtilityBox',
      description: `Cost: ${utilityBoxFee} ETH`,
      icon: '🎁',
      color: 'from-purple-500 to-pink-500',
      action: handleOpenUtilityBox
    },
    {
      id: 'achievements',
      title: 'View Achievements',
      description: 'Check your progress and rewards',
      icon: '🏆',
      color: 'from-yellow-500 to-orange-500',
      action: () => {
        toast.success('Achievements panel opening soon!');
      }
    },
    {
      id: 'create',
      title: 'Create Community',
      description: 'Start your own community',
      icon: '➕',
      color: 'from-green-500 to-emerald-500',
      action: () => {
        toast.success('Community creation opening soon!');
      }
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <h3 className="text-xl font-bold text-white mb-6">Quick Actions</h3>
      
      <div className="space-y-4">
        {quickActions.map((action, index) => (
          <motion.button
            key={action.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={action.action}
            disabled={isLoading}
            className={`w-full p-4 rounded-xl bg-gradient-to-r ${action.color} bg-opacity-20 border border-white/10 hover:border-white/20 transition-all group ${
              isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-opacity-30'
            }`}
          >
            <div className="flex items-center space-x-4">
              <div className="text-2xl">{action.icon}</div>
              <div className="flex-1 text-left">
                <h4 className="font-semibold text-white group-hover:text-white transition-colors">
                  {action.title}
                </h4>
                <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                  {action.description}
                </p>
              </div>
              <div className="text-gray-400 group-hover:text-gray-300 transition-colors">
                →
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Pro Tip */}
      <div className="mt-6 p-4 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl border border-indigo-500/20">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-lg">💡</span>
          <h4 className="font-semibold text-white">Pro Tip</h4>
        </div>
        <p className="text-sm text-gray-300">
          Open UtilityBoxes regularly to earn respect points, NFTs, and boosts. 
          The more active you are, the better rewards you'll receive!
        </p>
      </div>

      {/* Recent Activity Shortcut */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <h4 className="text-sm font-semibold text-white mb-3">Recent Activity</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Last UtilityBox opened</span>
            <span className="text-gray-300">2 hours ago</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Last event participated</span>
            <span className="text-gray-300">1 day ago</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Community joined</span>
            <span className="text-gray-300">3 days ago</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
} 