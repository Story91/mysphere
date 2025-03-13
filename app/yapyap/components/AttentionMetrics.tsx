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
  category: 'yaps' | 'engagement' | 'reach';
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
    const fetchAllMetrics = async () => {
      if (!username || !accessToken) return;

      try {
        setIsLoading(true);
        setError(null);

        // Fetch both Twitter and Yaps metrics
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const [twitterResponse, yapsResponse] = await Promise.all([
          fetch(`/api/x/metrics?access_token=${accessToken}&start_time=${weekAgo.toISOString()}`),
          fetch(`/api/yaps/metrics?username=${username}`)
        ]);

        if (!twitterResponse.ok || !yapsResponse.ok) {
          throw new Error('Failed to fetch metrics');
        }

        const twitterData = await twitterResponse.json();
        const yapsData: YapsMetrics = await yapsResponse.json();

        const tweets = twitterData.data || [];

        // Calculate Twitter metrics
        const totalMetrics: TweetMetrics = tweets.reduce((acc: TweetMetrics, tweet: any) => ({
          tweet_count: acc.tweet_count + 1,
          like_count: acc.like_count + (tweet.public_metrics?.like_count || 0),
          retweet_count: acc.retweet_count + (tweet.public_metrics?.retweet_count || 0),
          reply_count: acc.reply_count + (tweet.public_metrics?.reply_count || 0),
          quote_count: acc.quote_count + (tweet.public_metrics?.quote_count || 0),
          impression_count: acc.impression_count + (tweet.organic_metrics?.impression_count || 0),
          url_link_clicks: (acc.url_link_clicks || 0) + (tweet.organic_metrics?.url_link_clicks || 0),
          user_profile_clicks: (acc.user_profile_clicks || 0) + (tweet.organic_metrics?.user_profile_clicks || 0)
        }), {
          tweet_count: 0,
          like_count: 0,
          retweet_count: 0,
          reply_count: 0,
          quote_count: 0,
          impression_count: 0,
          url_link_clicks: 0,
          user_profile_clicks: 0
        });

        // Calculate engagement metrics
        const totalEngagements = totalMetrics.like_count + 
                               totalMetrics.retweet_count + 
                               totalMetrics.reply_count + 
                               totalMetrics.quote_count +
                               (totalMetrics.url_link_clicks || 0) +
                               (totalMetrics.user_profile_clicks || 0);

        const engagementRate = totalMetrics.impression_count > 0 
          ? (totalEngagements / totalMetrics.impression_count) * 100 
          : 0;

        // Combine all metrics
        const calculatedMetrics: AttentionMetric[] = [
          // Yaps Metrics
          {
            name: 'Total Yaps',
            value: yapsData.yaps_all,
            change: yapsData.yaps_l30d > 0 ? ((yapsData.yaps_all - yapsData.yaps_l30d) / yapsData.yaps_l30d) * 100 : 0,
            icon: '🏆',
            description: 'Your total Yaps score reflecting overall attention and influence',
            category: 'yaps'
          },
          {
            name: '24h Yaps',
            value: yapsData.yaps_l24h,
            change: yapsData.yaps_l48h > 0 ? ((yapsData.yaps_l24h - yapsData.yaps_l48h) / yapsData.yaps_l48h) * 100 : 0,
            icon: '⚡',
            description: 'Yaps earned in the last 24 hours',
            category: 'yaps'
          },
          {
            name: '7d Yaps',
            value: yapsData.yaps_l7d,
            change: yapsData.yaps_l30d > 0 ? ((yapsData.yaps_l7d - yapsData.yaps_l30d) / yapsData.yaps_l30d) * 100 : 0,
            icon: '📈',
            description: 'Yaps earned in the last 7 days',
            category: 'yaps'
          },
          {
            name: '30d Yaps',
            value: yapsData.yaps_l30d,
            change: yapsData.yaps_l3m > 0 ? ((yapsData.yaps_l30d - yapsData.yaps_l3m) / yapsData.yaps_l3m) * 100 : 0,
            icon: '📊',
            description: 'Yaps earned in the last 30 days',
            category: 'yaps'
          },
          // Engagement Metrics
          {
            name: 'Engagement Rate',
            value: engagementRate,
            change: 0,
            icon: '🎯',
            description: 'Percentage of impressions that resulted in engagement',
            category: 'engagement'
          },
          {
            name: 'Total Engagements',
            value: totalEngagements,
            change: 0,
            icon: '🤝',
            description: 'Sum of all interactions with your content',
            category: 'engagement'
          },
          {
            name: 'Likes',
            value: totalMetrics.like_count,
            change: 0,
            icon: '❤️',
            description: 'Total likes on your posts',
            category: 'engagement'
          },
          // Reach Metrics
          {
            name: 'Impressions',
            value: totalMetrics.impression_count,
            change: 0,
            icon: '👁️',
            description: 'Number of times your content was viewed',
            category: 'reach'
          },
          {
            name: 'Profile Visits',
            value: totalMetrics.user_profile_clicks || 0,
            change: 0,
            icon: '👤',
            description: 'Number of times users visited your profile',
            category: 'reach'
          },
          {
            name: 'Link Clicks',
            value: totalMetrics.url_link_clicks || 0,
            change: 0,
            icon: '🔗',
            description: 'Number of clicks on links in your posts',
            category: 'reach'
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

    fetchAllMetrics();
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

  const renderMetricsByCategory = (category: 'yaps' | 'engagement' | 'reach') => {
    const categoryMetrics = metrics.filter(m => m.category === category);
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-200 mb-4">
          {category.charAt(0).toUpperCase() + category.slice(1)} Metrics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryMetrics.map((metric, index) => (
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
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {renderMetricsByCategory('yaps')}
      {renderMetricsByCategory('engagement')}
      {renderMetricsByCategory('reach')}
    </div>
  );
} 