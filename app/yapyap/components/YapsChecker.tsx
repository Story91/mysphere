'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface YapsMetrics {
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

export default function YapsChecker() {
  const [username, setUsername] = useState('');
  const [metrics, setMetrics] = useState<YapsMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    setError(null);
    setMetrics(null);

    try {
      const response = await fetch(`/api/yaps/metrics?username=${encodeURIComponent(username.trim())}`);
      if (!response.ok) {
        throw new Error('Failed to fetch Yaps metrics');
      }
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError('Failed to fetch Yaps metrics. Please try again.');
      console.error('Yaps check error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMetric = (label: string, value: number, icon: string, change?: number) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#111318] rounded-xl p-6 hover:bg-[#161922] transition-all duration-300 border border-[#2DFADA]/10"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2DFADA] to-[#1A8F88] p-[1px]">
            <div className="w-full h-full rounded-full bg-[#111318] flex items-center justify-center">
              <span className="text-2xl">{icon}</span>
            </div>
          </div>
          <div>
            <h3 className="text-[#8B8F97] text-sm">{label}</h3>
            <p className="text-2xl font-bold text-white">
              {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        {change !== undefined && (
          <div className={`text-sm font-medium ${change >= 0 ? 'text-[#2DFADA]' : 'text-red-500'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <div className="relative mb-12">
        <div className="absolute inset-0 bg-gradient-to-r from-[#2DFADA] to-[#1A8F88] opacity-10 blur-xl" />
        <div className="relative text-center z-10">
          <h2 className="text-4xl font-bold text-white mb-3">Check Yaps Score</h2>
          <p className="text-[#8B8F97] text-lg">Enter an X (Twitter) username to check their Yaps metrics</p>
        </div>
      </div>

      <form onSubmit={handleCheck} className="mb-12">
        <div className="flex gap-3 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <div className="absolute inset-0 bg-gradient-to-r from-[#2DFADA] to-[#1A8F88] rounded-xl opacity-20 blur-sm" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter X username (without @)"
              className="relative w-full bg-[#111318] border border-[#2DFADA]/20 rounded-xl px-6 py-4 text-white placeholder-[#8B8F97] focus:outline-none focus:border-[#2DFADA]/40 focus:ring-2 focus:ring-[#2DFADA]/10"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !username.trim()}
            className="px-8 py-4 bg-gradient-to-r from-[#2DFADA] to-[#1A8F88] rounded-xl text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#2DFADA]/10"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Checking...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Check</span>
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto mb-8 bg-red-500/10 border border-red-500/20 rounded-xl p-4"
        >
          <p className="text-sm text-red-500">{error}</p>
        </motion.div>
      )}

      {metrics && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#111318] rounded-xl border border-[#2DFADA]/10 p-8 mb-8"
          >
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-gradient-to-br from-[#2DFADA] to-[#1A8F88] rounded-full p-[1px]">
                <div className="w-full h-full rounded-full bg-[#111318] flex items-center justify-center">
                  <span className="text-3xl">@</span>
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-1">@{metrics.username}</h3>
                <p className="text-[#8B8F97]">User ID: {metrics.user_id}</p>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderMetric('Total Yaps', metrics.yaps_all, '🏆')}
            {renderMetric('Last 24h', metrics.yaps_l24h, '⚡', 
              metrics.yaps_l48h > 0 ? ((metrics.yaps_l24h - metrics.yaps_l48h) / metrics.yaps_l48h) * 100 : 0)}
            {renderMetric('Last 7 Days', metrics.yaps_l7d, '📈')}
            {renderMetric('Last 30 Days', metrics.yaps_l30d, '📊')}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderMetric('Last 3 Months', metrics.yaps_l3m, '📅')}
            {renderMetric('Last 6 Months', metrics.yaps_l6m, '📆')}
            {renderMetric('Last 12 Months', metrics.yaps_l12m, '🗓️')}
            {renderMetric('48h Change', metrics.yaps_l48h, '📊')}
          </div>
        </motion.div>
      )}
    </div>
  );
} 