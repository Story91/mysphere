'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface YapsMetricsProps {
  address: string;
}

interface YapsData {
  user_id: string;
  username: string;
  yaps_all: number;
  yaps_l24h: number;
  yaps_l48h: number;
  yaps_l7d: number;
  yaps_l30d: number;
  yaps_l3m: number;
  yaps_l6m: number;
  yaps_l12m: number;
}

export default function YapsMetrics({ address }: YapsMetricsProps) {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [yapsData, setYapsData] = useState<YapsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/yaps?username=${encodeURIComponent(username)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch Yaps data');
      }

      const data = await response.json();
      console.log('API Response:', data);
      setYapsData(data);
      setIsDetailsVisible(true); // Show details after successful fetch
    } catch (err) {
      console.error('Error details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch Yaps data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined || isNaN(num)) return '0';
    
    // Convert to number and round to 2 decimal places
    const rounded = Number(Number(num).toFixed(2));
    
    // Format with locale string
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="w-full max-w-6xl mx-auto font-['Coinbase_Display']">
      {/* Search Bar */}
      <div className="relative mb-4">
        <form onSubmit={handleSubmit}>
          <div className="relative w-full">
            <div className="absolute inset-0 rounded-2xl bg-gray-400/30 backdrop-blur-sm"></div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="X Username without @"
              className="relative w-full bg-transparent border-none rounded-2xl px-6 pr-32 py-3 text-gray-700 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-0 transition-all duration-300 font-['Coinbase_Display']"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <motion.button
                type="submit"
                disabled={!username || isLoading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-4 py-1.5 bg-white text-blue-600 font-semibold rounded-xl shadow-sm text-sm border border-blue-100 font-['Coinbase_Display']"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-blue-600" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Checking</span>
                  </div>
                ) : (
                  <span>YapScan</span>
                )}
              </motion.button>
            </div>
          </div>
        </form>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute -bottom-8 left-0 text-red-400 text-sm mt-2"
          >
            {error}
          </motion.div>
        )}
      </div>

      {yapsData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3 font-['Coinbase_Display']"
        >
          {/* User Profile */}
          {isDetailsVisible && (
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#2DFADA]/10 to-purple-500/10 rounded-2xl blur-xl"></div>
              <div className="relative bg-black/40 backdrop-blur-xl rounded-2xl p-4 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#2DFADA] to-purple-500 rounded-full blur-lg opacity-50"></div>
                    <div className="relative w-full h-full rounded-full bg-black/50 backdrop-blur-xl border border-white/10 flex items-center justify-center overflow-hidden">
                      <Image
                        src="/Kaito-AI.png"
                        alt="Kaito Logo"
                        width={28}
                        height={28}
                        className="object-contain"
                      />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-[500] text-white font-['Coinbase_Display']">{yapsData.username}</h2>
                    <div className="text-[#2DFADA] text-sm font-[500] font-['Coinbase_Display']">
                      Total Yaps: {formatNumber(yapsData.yaps_all)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isDetailsVisible && (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-sm font-[500] font-['Coinbase_Display']">Yaps Score Details</span>
                <button 
                  onClick={() => setIsDetailsVisible(false)}
                  className="text-gray-400 hover:text-gray-300"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-black dark:text-white text-sm font-[500] font-['Coinbase_Display']">Total Score:</span>
                  <span className="text-black dark:text-white text-sm font-[500] font-['Coinbase_Display']">{formatNumber(yapsData.yaps_all)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm font-['Coinbase_Display']">24h Change:</span>
                  <span className="text-[#2DFADA] text-sm font-[500] font-['Coinbase_Display']">+{formatNumber(yapsData.yaps_l24h)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm font-['Coinbase_Display']">7 Day Change:</span>
                  <span className="text-[#2DFADA] text-sm font-[500] font-['Coinbase_Display']">+{formatNumber(yapsData.yaps_l7d)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm font-['Coinbase_Display']">30 Day Change:</span>
                  <span className="text-[#2DFADA] text-sm font-[500] font-['Coinbase_Display']">+{formatNumber(yapsData.yaps_l30d)}</span>
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
} 