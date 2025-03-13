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
}

interface AttentionMetric {
  name: string;
  value: number;
  change: number;
  icon: string;
}

interface AttentionMetricsProps {
  username: string;
  accessToken: string;
}

export default function AttentionMetrics({ username, accessToken }: AttentionMetricsProps) {
  const [metrics, setMetrics] = useState<AttentionMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!username || !accessToken) return;

      try {
        setIsLoading(true);
        setError(null);

        // Get user's tweets from the last 7 days
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const response = await fetch(`https://api.x.com/2/users/me/tweets?start_time=${weekAgo.toISOString()}&tweet.fields=public_metrics`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch tweet metrics');
        }

        const data = await response.json();
        const tweets = data.data || [];

        // Calculate total metrics
        const totalMetrics: TweetMetrics = tweets.reduce((acc: TweetMetrics, tweet: any) => ({
          tweet_count: acc.tweet_count + 1,
          like_count: acc.like_count + (tweet.public_metrics.like_count || 0),
          retweet_count: acc.retweet_count + (tweet.public_metrics.retweet_count || 0),
          reply_count: acc.reply_count + (tweet.public_metrics.reply_count || 0),
          quote_count: acc.quote_count + (tweet.public_metrics.quote_count || 0),
          impression_count: acc.impression_count + (tweet.public_metrics.impression_count || 0)
        }), {
          tweet_count: 0,
          like_count: 0,
          retweet_count: 0,
          reply_count: 0,
          quote_count: 0,
          impression_count: 0
        });

        // Calculate engagement rate
        const totalEngagements = totalMetrics.like_count + totalMetrics.retweet_count + 
                               totalMetrics.reply_count + totalMetrics.quote_count;
        const engagementRate = totalMetrics.impression_count > 0 
          ? (totalEngagements / totalMetrics.impression_count) * 100 
          : 0;

        // Transform metrics for display
        const calculatedMetrics: AttentionMetric[] = [
          {
            name: 'Engagement Rate',
            value: engagementRate,
            change: 0, // We would need historical data to calculate change
            icon: '📈'
          },
          {
            name: 'Total Engagements',
            value: totalEngagements,
            change: 0,
            icon: '🔄'
          },
          {
            name: 'Impressions',
            value: totalMetrics.impression_count,
            change: 0,
            icon: '👁️'
          },
          {
            name: 'Tweet Count',
            value: totalMetrics.tweet_count,
            change: 0,
            icon: '📝'
          }
        ];

        setMetrics(calculatedMetrics);
      } catch (err) {
        setError('Failed to fetch attention metrics');
        console.error('Error fetching metrics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [username, accessToken]);

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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric, index) => (
        <motion.div
          key={metric.name}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="bg-gray-800/50 p-6 rounded-xl border border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-2xl">{metric.icon}</span>
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
          </div>
          <h3 className="text-gray-400 text-sm mb-1">{metric.name}</h3>
          <p className="text-2xl font-semibold text-white">
            {metric.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </motion.div>
      ))}
    </div>
  );
} 