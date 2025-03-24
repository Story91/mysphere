'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface TweetMetrics {
  tweet_count: number;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  impression_count: number;
  url_link_clicks?: number;
  user_profile_clicks?: number;
}

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

interface AttentionMetric {
  name: string;
  value: number;
  change: number;
  icon: string;
  description?: string;
}

interface AttentionMetricsProps {
  username: string;
}

export default function AttentionMetrics({ username }: AttentionMetricsProps) {
  const [metrics, setMetrics] = useState<AttentionMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!username) return;

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/yaps/metrics?username=${username}`);
        if (!response.ok) {
          throw new Error('Failed to fetch Yaps metrics');
        }

        const yapsData: YapsMetrics = await response.json();

        const calculatedMetrics: AttentionMetric[] = [
          {
            name: 'Total Yaps',
            value: yapsData.yaps_all,
            change: yapsData.yaps_l30d > 0 ? ((yapsData.yaps_all - yapsData.yaps_l30d) / yapsData.yaps_l30d) * 100 : 0,
            icon: '🏆',
            description: 'Your total Yaps score reflecting overall attention and influence'
          },
          {
            name: '24h Yaps',
            value: yapsData.yaps_l24h,
            change: yapsData.yaps_l48h > 0 ? ((yapsData.yaps_l24h - yapsData.yaps_l48h) / yapsData.yaps_l48h) * 100 : 0,
            icon: '⚡',
            description: 'Yaps earned in the last 24 hours'
          },
          {
            name: '7d Yaps',
            value: yapsData.yaps_l7d,
            change: yapsData.yaps_l30d > 0 ? ((yapsData.yaps_l7d - yapsData.yaps_l30d) / yapsData.yaps_l30d) * 100 : 0,
            icon: '📈',
            description: 'Yaps earned in the last 7 days'
          },
          {
            name: '30d Yaps',
            value: yapsData.yaps_l30d,
            change: yapsData.yaps_l3m > 0 ? ((yapsData.yaps_l30d - yapsData.yaps_l3m) / yapsData.yaps_l3m) * 100 : 0,
            icon: '📊',
            description: 'Yaps earned in the last 30 days'
          },
          {
            name: '3m Yaps',
            value: yapsData.yaps_l3m,
            change: yapsData.yaps_l6m > 0 ? ((yapsData.yaps_l3m - yapsData.yaps_l6m) / yapsData.yaps_l6m) * 100 : 0,
            icon: '📅',
            description: 'Yaps earned in the last 3 months'
          },
          {
            name: '6m Yaps',
            value: yapsData.yaps_l6m,
            change: yapsData.yaps_l12m > 0 ? ((yapsData.yaps_l6m - yapsData.yaps_l12m) / yapsData.yaps_l12m) * 100 : 0,
            icon: '📆',
            description: 'Yaps earned in the last 6 months'
          }
        ];

        setMetrics(calculatedMetrics);
      } catch (err) {
        setError('Failed to fetch Yaps metrics');
        console.error('Error fetching metrics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [username]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {metrics.map((metric, index) => (
        <motion.div
          key={metric.name}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 group relative"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-2xl">{metric.icon}</span>
            {metric.change !== 0 && (
              <div className={`flex items-center ${metric.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                <span className="text-sm">
                  {metric.change >= 0 ? '+' : ''}{metric.change.toFixed(2)}%
                </span>
                <svg
                  className={`w-4 h-4 ml-1 ${metric.change >= 0 ? 'rotate-0' : 'rotate-180'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </div>
            )}
          </div>
          <h3 className="text-gray-400 text-sm mb-1">{metric.name}</h3>
          <p className="text-2xl font-semibold text-white">
            {metric.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
          {metric.description && (
            <div className="absolute inset-0 bg-gray-900/95 p-4 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center text-center">
              <p className="text-sm text-gray-300">{metric.description}</p>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
} 