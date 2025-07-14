'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { useAccount } from 'wagmi';

export default function QuickActions() {
  const { address } = useAccount();
  const { isLoading } = useSpheresContract();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
    >
      <h3 className="text-xl font-bold text-white mb-6">Activity & Tips</h3>

      {/* Pro Tip */}
      <div className="p-4 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl border border-indigo-500/20 mb-6">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-lg">💡</span>
          <h4 className="font-semibold text-white">Pro Tip</h4>
        </div>
        <p className="text-sm text-gray-300">
          Use the management panels to efficiently organize your communities. 
          Regular engagement through events and member management builds stronger communities!
        </p>
      </div>

      {/* Recent Activity */}
      <div className="pt-4 border-t border-white/10">
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