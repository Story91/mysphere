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
      // /api/yaps zwraca surowa odpowiedz Kaito - ten sam ksztalt, ktory
      // zwracal usuniety duplikat /api/yaps/metrics.
      const response = await fetch(`/api/yaps?username=${encodeURIComponent(username.trim())}`);
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

  const renderMetric = (label: string, value: number, icon: string) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800/50 p-4 rounded-xl border border-gray-700"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <h3 className="text-gray-400 text-sm">{label}</h3>
      </div>
      <p className="text-xl font-semibold text-white">
        {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </p>
    </motion.div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Check Yaps Score</h2>
        <p className="text-gray-400">Enter an X (Twitter) username to check their Yaps metrics</p>
      </div>

      <form onSubmit={handleCheck} className="mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter X username (without @)"
            className="flex-1 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading || !username.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {metrics && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-2xl">@</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">@{metrics.username}</h3>
                <p className="text-gray-400 text-sm">User ID: {metrics.user_id}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderMetric('Total Yaps', metrics.yaps_all, '🏆')}
            {renderMetric('Last 24h', metrics.yaps_l24h, '⚡')}
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