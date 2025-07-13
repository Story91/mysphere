'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function CommunityBrowser() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h2 className="text-3xl font-bold text-white mb-2">Browse Communities 🔍</h2>
        <p className="text-gray-300">
          Discover and join amazing communities in the Spheres ecosystem
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 text-center"
      >
        <div className="text-6xl mb-4">🏗️</div>
        <h3 className="text-xl font-bold text-white mb-2">Coming Soon</h3>
        <p className="text-gray-400 mb-6">
          The community browser is currently under development. 
          This feature will allow you to discover, search, and join communities based on your interests.
        </p>
        
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-white">Planned Features:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="text-2xl mb-2">🔍</div>
              <h5 className="font-semibold text-white">Search & Filter</h5>
              <p className="text-sm text-gray-400">Find communities by name, category, or keywords</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="text-2xl mb-2">📊</div>
              <h5 className="font-semibold text-white">Community Stats</h5>
              <p className="text-sm text-gray-400">View member count, activity levels, and fees</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="text-2xl mb-2">🏷️</div>
              <h5 className="font-semibold text-white">Categories</h5>
              <p className="text-sm text-gray-400">Browse by category like DeFi, Gaming, Art</p>
            </div>
            <div className="bg-white/5 p-4 rounded-xl">
              <div className="text-2xl mb-2">⭐</div>
              <h5 className="font-semibold text-white">Recommendations</h5>
              <p className="text-sm text-gray-400">Get personalized community suggestions</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 