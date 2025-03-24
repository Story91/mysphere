'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import YapsMetrics from './components/YapsMetrics';
import YapsChecker from './components/YapsChecker';

export default function YapYap() {
  const { address } = useAccount();

  return (
    <main className="min-h-screen bg-white text-gray-800">
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white relative overflow-hidden">
        {/* Niebieski akcent - gradient w tle */}
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-r from-blue-400/10 via-blue-500/5 to-blue-400/10"></div>
        <div className="absolute top-20 right-20 w-96 h-96 rounded-full bg-blue-400/5 blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-blue-500/5 blur-3xl"></div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 relative z-10">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 text-transparent bg-clip-text">
              YapYap
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Explore your Yaps metrics with Kaito Yaps Protocol.
            </p>
          </motion.div>

          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <YapsMetrics address={address || ''} />
          </motion.div>
        </div>
      </div>
    </main>
  );
} 