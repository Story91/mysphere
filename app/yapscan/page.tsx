'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import YapsMetrics from './components/YapsMetrics';
import YapsChecker from './components/YapsChecker';

export default function YapScan() {
  const { address } = useAccount();

  return (
    <main className="min-h-screen bg-white text-gray-800 font-['Coinbase_Display']">
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
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 text-transparent bg-clip-text font-['Coinbase_Display']">
              YapScan
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto font-['Coinbase_Display']">
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
          
          {/* Information Section about Yaps */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-16 bg-white rounded-xl p-8 shadow-sm border border-blue-100 font-['Coinbase_Display']"
          >
            <h2 className="text-2xl font-bold mb-6 text-blue-600 font-['Coinbase_Display']">Yaps from Kaito - What is it and how does it work?</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 text-blue-700 font-['Coinbase_Display']">What are Yaps?</h3>
                <p className="text-gray-700 font-['Coinbase_Display']">
                  Yaps is a scoring system introduced by the Kaito protocol that measures your activity and engagement within the ecosystem. 
                  These points reflect your presence and participation in the network, which may bring various benefits in the future.
                </p>
              </div>
              
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 text-blue-700 font-['Coinbase_Display']">Why collect Yaps?</h3>
                <ul className="list-disc list-inside text-gray-700 space-y-2 font-['Coinbase_Display']">
                  <li>Track progress - Yaps allow you to monitor your engagement over time</li>
                  <li>Potential rewards - In the future, Yaps may be used for various initiatives within the Kaito ecosystem</li>
                  <li>Community status - A higher Yaps score can demonstrate active participation in the network</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold mb-3 text-blue-700 font-['Coinbase_Display']">How to increase your Yaps score?</h3>
                <p className="text-gray-700 font-['Coinbase_Display']">
                  While the exact scoring algorithm is not publicly known, regularly using the Kaito protocol features 
                  and participating in the ecosystem likely positively affects your score. Remember that Yaps is not just 
                  a number - it reflects your participation in an evolving network.
                </p>
              </div>
            </div>
            
            <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-500 font-['Coinbase_Display']">
                <strong>Note:</strong> Collecting Yaps should not be the sole purpose of using the Kaito protocol. 
                The most important thing is to use tools and services in a way that is valuable to you. 
                Yaps are just an additional element measuring your engagement.
              </p>
              <p className="text-sm text-gray-500 mt-2 font-['Coinbase_Display']">
                This information is for educational purposes. For more details, please refer to the official Kaito documentation.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
} 