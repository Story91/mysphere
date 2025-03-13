'use client';

import { useState, useEffect } from 'react';
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

interface XMetrics {
  engagement_rate: number;
  total_impressions: number;
  total_likes: number;
  total_replies: number;
  total_reposts: number;
  total_quotes: number;
  url_link_clicks: number;
  user_profile_clicks: number;
}

interface AttentionMetricsProps {
  username: string;
  accessToken: string;
}

export default function AttentionMetrics({ username, accessToken }: AttentionMetricsProps) {
  const [newPost, setNewPost] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [includeStats, setIncludeStats] = useState({
    yaps: false,
    engagement: false
  });
  const [yapsMetrics, setYapsMetrics] = useState<YapsMetrics | null>(null);
  const [xMetrics, setXMetrics] = useState<XMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch Yaps metrics
        const yapsResponse = await fetch(`/api/yaps/metrics?username=${username}`);
        if (!yapsResponse.ok) {
          throw new Error('Failed to fetch Yaps metrics');
        }
        const yapsData = await yapsResponse.json();
        setYapsMetrics(yapsData);

        // Fetch X metrics
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const xResponse = await fetch(
          `/api/x/metrics?access_token=${accessToken}&start_time=${weekAgo.toISOString()}`
        );
        if (!xResponse.ok) {
          throw new Error('Failed to fetch X metrics');
        }
        const xData = await xResponse.json();
        
        // Calculate total metrics from X data
        const totalMetrics: XMetrics = xData.data.reduce((acc: any, tweet: any) => ({
          engagement_rate: acc.engagement_rate + (tweet.engagement_rate || 0),
          total_impressions: acc.total_impressions + (tweet.impression_count || 0),
          total_likes: acc.total_likes + (tweet.like_count || 0),
          total_replies: acc.total_replies + (tweet.reply_count || 0),
          total_reposts: acc.total_reposts + (tweet.repost_count || 0),
          total_quotes: acc.total_quotes + (tweet.quote_count || 0),
          url_link_clicks: acc.url_link_clicks + (tweet.url_link_clicks || 0),
          user_profile_clicks: acc.user_profile_clicks + (tweet.user_profile_clicks || 0),
        }), {
          engagement_rate: 0,
          total_impressions: 0,
          total_likes: 0,
          total_replies: 0,
          total_reposts: 0,
          total_quotes: 0,
          url_link_clicks: 0,
          user_profile_clicks: 0,
        });

        // Calculate average engagement rate
        totalMetrics.engagement_rate = totalMetrics.engagement_rate / xData.data.length;

        setXMetrics(totalMetrics);
      } catch (err) {
        console.error('Error fetching metrics:', err);
        setError('Failed to fetch metrics');
      } finally {
        setIsLoading(false);
      }
    };

    if (username && accessToken) {
      fetchMetrics();
    }
  }, [username, accessToken]);

  const getStatsText = () => {
    if (!yapsMetrics || !xMetrics) return '';
    
    let statsText = '';
    
    if (includeStats.yaps) {
      statsText += `\n\n📊 Yaps Stats:\n`;
      statsText += `Total Yaps: ${yapsMetrics.yaps_all.toLocaleString()}\n`;
      const growthRate = yapsMetrics.yaps_l30d > 0 
        ? ((yapsMetrics.yaps_all - yapsMetrics.yaps_l30d) / yapsMetrics.yaps_l30d) * 100 
        : 0;
      statsText += `30d Growth Rate: ${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(2)}%`;
    }

    if (includeStats.engagement) {
      statsText += `\n\n📈 X Stats (7d):\n`;
      statsText += `Engagement Rate: ${xMetrics.engagement_rate.toFixed(2)}%\n`;
      statsText += `Total Impressions: ${xMetrics.total_impressions.toLocaleString()}\n`;
      statsText += `Total Interactions: ${(
        xMetrics.total_likes +
        xMetrics.total_replies +
        xMetrics.total_reposts +
        xMetrics.total_quotes
      ).toLocaleString()}`;
    }

    return statsText;
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim()) return;

    setIsPosting(true);
    setPostError(null);

    const finalText = `${newPost}${getStatsText()}\n\nPosted via MySphere.fun 🌐`;

    try {
      const response = await fetch('/api/x/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: finalText,
          accessToken
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to post tweet');
      }

      setNewPost('');
      setIncludeStats({ yaps: false, engagement: false });
    } catch (err) {
      setPostError('Failed to post tweet. Please try again.');
      console.error('Post error:', err);
    } finally {
      setIsPosting(false);
    }
  };

  const renderMetricCard = (label: string, value: number | string, icon: string, period: string = '7d', change?: number) => (
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
            <div className="flex items-center gap-2">
              <h3 className="text-[#8B8F97] text-sm">{label}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#2DFADA]/10 text-[#2DFADA]">
                Last {period}
              </span>
            </div>
            <p className="text-2xl font-bold text-white">
              {typeof value === 'number' 
                ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : value}
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2DFADA]"></div>
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
    <div className="space-y-8">
      {/* New Post Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111318] rounded-xl p-6 border border-[#2DFADA]/10"
      >
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <span className="text-2xl">✍️</span> Create New Post
        </h3>
        <form onSubmit={handlePost} className="space-y-4">
          <div className="relative">
            <textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="What's happening?"
              className="w-full bg-[#0A0B0D] border border-[#2DFADA]/20 rounded-xl px-4 py-3 text-white placeholder-[#8B8F97] focus:outline-none focus:border-[#2DFADA]/40 focus:ring-2 focus:ring-[#2DFADA]/10 min-h-[100px]"
              maxLength={280}
            />
            <div className="absolute bottom-2 right-2 text-[#8B8F97] text-sm">
              {(newPost.length + (includeStats.yaps ? 100 : 0) + (includeStats.engagement ? 100 : 0) + 25)}/280
            </div>
          </div>

          {/* Stats Options */}
          <div className="flex items-center gap-4 px-2">
            <label className="flex items-center gap-2 text-[#8B8F97] hover:text-white transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={includeStats.yaps}
                onChange={(e) => setIncludeStats(prev => ({ ...prev, yaps: e.target.checked }))}
                className="form-checkbox h-4 w-4 rounded border-[#2DFADA]/20 bg-[#0A0B0D] text-[#2DFADA] focus:ring-[#2DFADA]/20"
              />
              <span className="flex items-center gap-1">
                <span className="text-lg">📊</span> Include Yaps Stats
              </span>
            </label>
            <label className="flex items-center gap-2 text-[#8B8F97] hover:text-white transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={includeStats.engagement}
                onChange={(e) => setIncludeStats(prev => ({ ...prev, engagement: e.target.checked }))}
                className="form-checkbox h-4 w-4 rounded border-[#2DFADA]/20 bg-[#0A0B0D] text-[#2DFADA] focus:ring-[#2DFADA]/20"
              />
              <span className="flex items-center gap-1">
                <span className="text-lg">📈</span> Include X Stats
              </span>
            </label>
          </div>

          {/* Preview */}
          {(includeStats.yaps || includeStats.engagement) && yapsMetrics && xMetrics && (
            <div className="bg-[#0A0B0D] rounded-xl p-4 border border-[#2DFADA]/20">
              <h4 className="text-[#8B8F97] text-sm mb-2">Preview of stats to be included:</h4>
              <pre className="text-white text-sm whitespace-pre-wrap font-mono">
                {getStatsText()}
                {"\n\nPosted via MySphere.fun 🌐"}
              </pre>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPosting || !newPost.trim()}
              className="px-6 py-2 bg-gradient-to-r from-[#2DFADA] to-[#1A8F88] rounded-xl text-black font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isPosting ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Posting...</span>
                </>
              ) : (
                <>
                  <span>Post</span>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </>
              )}
            </button>
          </div>
          {postError && (
            <div className="text-red-500 text-sm mt-2">{postError}</div>
          )}
        </form>
      </motion.div>

      {/* Yaps Metrics */}
      {yapsMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {renderMetricCard('Total Yaps', yapsMetrics.yaps_all, '🏆', 'all time')}
          {renderMetricCard('24h Yaps', yapsMetrics.yaps_l24h, '⚡', '24h', 
            yapsMetrics.yaps_l48h > 0 ? ((yapsMetrics.yaps_l24h - yapsMetrics.yaps_l48h) / yapsMetrics.yaps_l48h) * 100 : 0)}
          {renderMetricCard('7d Yaps', yapsMetrics.yaps_l7d, '📈', '7d',
            yapsMetrics.yaps_l30d > 0 ? ((yapsMetrics.yaps_l7d - yapsMetrics.yaps_l30d) / yapsMetrics.yaps_l30d) * 100 : 0)}
          {renderMetricCard('30d Yaps', yapsMetrics.yaps_l30d, '📊', '30d',
            yapsMetrics.yaps_l3m > 0 ? ((yapsMetrics.yaps_l30d - yapsMetrics.yaps_l3m) / yapsMetrics.yaps_l3m) * 100 : 0)}
        </div>
      )}

      {/* X Metrics */}
      {xMetrics && (
        <>
          {/* Engagement Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderMetricCard('Engagement Rate', `${xMetrics.engagement_rate.toFixed(2)}%`, '🎯', '7d')}
            {renderMetricCard('Total Impressions', xMetrics.total_impressions, '👁️', '7d')}
            {renderMetricCard('Profile Visits', xMetrics.user_profile_clicks, '👤', '7d')}
            {renderMetricCard('Link Clicks', xMetrics.url_link_clicks, '🔗', '7d')}
          </div>

          {/* Interaction Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {renderMetricCard('Total Likes', xMetrics.total_likes, '❤️', '7d')}
            {renderMetricCard('Total Replies', xMetrics.total_replies, '💬', '7d')}
            {renderMetricCard('Total Reposts', xMetrics.total_reposts, '🔄', '7d')}
            {renderMetricCard('Total Quotes', xMetrics.total_quotes, '💫', '7d')}
          </div>
        </>
      )}
    </div>
  );
} 