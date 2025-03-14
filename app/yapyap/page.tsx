'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import YapsMetrics from './components/YapsMetrics';
import YapsChecker from './components/YapsChecker';

export default function YapYap() {
  const { address } = useAccount();

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-[#2DFADA] via-[#2DFADA]/80 to-[#2DFADA]/60 text-transparent bg-clip-text">
              YapYap
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
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