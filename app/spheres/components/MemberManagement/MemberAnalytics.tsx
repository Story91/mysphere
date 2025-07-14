'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Users, 
  Activity, 
  MessageSquare, 
  Calendar,
  Award,
  Target,
  Clock,
  PieChart,
  BarChart3,
  Download,
  Filter,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// Member analytics interface
interface MemberAnalytics {
  userId: string;
  username: string;
  avatar: string;
  joinedAt: Date;
  totalMessages: number;
  totalEventsAttended: number;
  totalPoints: number;
  level: number;
  activityScore: number;
  engagementRate: number;
  lastActiveDate: Date;
  weeklyActivity: {
    week: string;
    messages: number;
    events: number;
    points: number;
  }[];
  monthlyGrowth: {
    month: string;
    newMembers: number;
    activeMembers: number;
    retention: number;
  }[];
  roleHistory: {
    role: string;
    assignedAt: Date;
    assignedBy: string;
  }[];
  achievements: {
    id: string;
    name: string;
    description: string;
    earnedAt: Date;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
  }[];
}

// Community statistics interface
interface CommunityStats {
  totalMembers: number;
  activeMembers: number;
  newMembersThisMonth: number;
  averageEngagement: number;
  topContributors: {
    userId: string;
    username: string;
    points: number;
    rank: number;
  }[];
  activityByHour: {
    hour: number;
    activity: number;
  }[];
  membersByRole: {
    role: string;
    count: number;
    percentage: number;
  }[];
  retentionRate: number;
  growthRate: number;
}

interface MemberAnalyticsProps {
  communityId: string;
  analytics: MemberAnalytics[];
  communityStats: CommunityStats;
  onExportData: (format: 'csv' | 'json') => void;
  onRefreshData: () => void;
}

const MemberAnalytics: React.FC<MemberAnalyticsProps> = ({
  communityId,
  analytics,
  communityStats,
  onExportData,
  onRefreshData
}) => {
  const [selectedMember, setSelectedMember] = useState<MemberAnalytics | null>(null);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [sortBy, setSortBy] = useState<'points' | 'engagement' | 'activity' | 'messages'>('points');
  const [showDetailed, setShowDetailed] = useState(false);

  // Example analytics data - will be replaced with real contract data
  const [memberAnalytics, setMemberAnalytics] = useState<MemberAnalytics[]>([]);
  const [stats, setStats] = useState<CommunityStats>({
    totalMembers: 0,
    activeMembers: 0,
    newMembersThisMonth: 0,
    averageEngagement: 0,
    topContributors: [],
    activityByHour: [],
    membersByRole: [],
    retentionRate: 0,
    growthRate: 0
  });

  // Load analytics data from contract
  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        // Use actual analytics data from props or default to existing if not provided
        const analyticsData = analytics.length > 0 ? analytics : memberAnalytics;
        
        // Process and format the analytics data
        const processedAnalytics = analyticsData.map(member => ({
          ...member,
          weeklyActivity: member.weeklyActivity || [],
          monthlyGrowth: member.monthlyGrowth || [],
          roleHistory: member.roleHistory || [],
          achievements: member.achievements || []
        }));
        
        setMemberAnalytics(processedAnalytics);
        
        // Use provided community stats or calculate from member data
        if (communityStats) {
          setStats(communityStats);
        } else {
          // Calculate stats from member data if not provided
          const totalMembers = processedAnalytics.length;
          const activeMembers = processedAnalytics.filter(m => 
            m.lastActiveDate && (new Date().getTime() - m.lastActiveDate.getTime()) < 7 * 24 * 60 * 60 * 1000
          ).length;
          
          const averageEngagement = totalMembers > 0 
            ? processedAnalytics.reduce((sum, m) => sum + m.engagementRate, 0) / totalMembers 
            : 0;
          
          const topContributors = processedAnalytics
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .slice(0, 3)
            .map((member, index) => ({
              userId: member.userId,
              username: member.username,
              points: member.totalPoints,
              rank: index + 1
            }));
          
          setStats({
            totalMembers,
            activeMembers,
            newMembersThisMonth: 0, // Would need historical data to calculate
            averageEngagement,
            topContributors,
            activityByHour: [], // Would need detailed activity logs
            membersByRole: [], // Would need role data
            retentionRate: 0.85, // Default value - would need historical data
            growthRate: 0.1 // Default value - would need historical data
          });
        }
      } catch (error) {
        console.error('Failed to load analytics:', error);
        // Keep existing state on error
      }
    };

    loadAnalytics();
  }, [analytics, communityStats]);

  // Sort members
  const sortedMembers = [...memberAnalytics].sort((a, b) => {
    switch (sortBy) {
      case 'points':
        return b.totalPoints - a.totalPoints;
      case 'engagement':
        return b.engagementRate - a.engagementRate;
      case 'activity':
        return b.activityScore - a.activityScore;
      case 'messages':
        return b.totalMessages - a.totalMessages;
      default:
        return 0;
    }
  });

  // Get rarity color
  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'text-gray-400';
      case 'rare': return 'text-blue-400';
      case 'epic': return 'text-purple-400';
      case 'legendary': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Member Analytics</h2>
          <p className="text-gray-400">Detailed data on activity and engagement</p>
        </div>
        
        <div className="flex gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
          
          <button
            onClick={onRefreshData}
            className="p-2 bg-gray-800/50 border border-gray-700 rounded-lg hover:bg-gray-700/50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => onExportData('csv')}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Main statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.totalMembers}</div>
              <div className="text-sm text-gray-400">Members</div>
              <div className="text-xs text-green-400">+{stats.newMembersThisMonth} this month</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.activeMembers}</div>
              <div className="text-sm text-gray-400">Active</div>
              <div className="text-xs text-green-400">{((stats.activeMembers / stats.totalMembers) * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{(stats.averageEngagement * 100).toFixed(1)}%</div>
              <div className="text-sm text-gray-400">Engagement</div>
              <div className="text-xs text-green-400">+{(stats.growthRate * 100).toFixed(1)}% growth</div>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{(stats.retentionRate * 100).toFixed(1)}%</div>
              <div className="text-sm text-gray-400">Retention</div>
              <div className="text-xs text-green-400">Very good</div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Activity</h3>
          <div className="h-40 flex items-end gap-1">
            {stats.activityByHour.map((item, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full bg-gradient-to-t from-purple-500 to-pink-500 rounded-t opacity-80 hover:opacity-100 transition-opacity"
                  style={{ height: `${(item.activity / 100) * 100}%` }}
                />
                <div className="text-xs text-gray-400 mt-1">{item.hour}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribution by Roles */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Distribution by Roles</h3>
          <div className="space-y-3">
            {stats.membersByRole.map((role, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full" />
                  <span className="text-sm text-gray-300 capitalize">{role.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                      style={{ width: `${role.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-white w-12 text-right">{role.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Contributors */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Top Members</h3>
        <div className="space-y-3">
          {stats.topContributors.map((contributor, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">
                    {contributor.username.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-white">{contributor.username}</div>
                  <div className="text-sm text-gray-400">{contributor.points} points</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-purple-400">#{contributor.rank}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Members list with analytics */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Member Analytics</h3>
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1 bg-gray-700/50 border border-gray-600 rounded text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="points">Points</option>
              <option value="engagement">Engagement</option>
              <option value="activity">Activity</option>
              <option value="messages">Messages</option>
            </select>
            <button
              onClick={() => setShowDetailed(!showDetailed)}
              className="flex items-center gap-1 px-3 py-1 bg-gray-700/50 border border-gray-600 rounded text-sm hover:bg-gray-600/50 transition-colors"
            >
              {showDetailed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Details
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {sortedMembers.map((member, index) => (
            <div key={member.userId} className="bg-gray-700/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">
                      {member.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-white">{member.username}</h4>
                      <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                        Lvl {member.level}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {member.totalMessages}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {member.totalEventsAttended}
                      </span>
                      <span className="flex items-center gap-1">
                        <Award className="w-3 h-3" />
                        {member.totalPoints}
                      </span>
                      <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        {member.activityScore}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">
                      {(member.engagementRate * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">Engagement</div>
                  </div>
                  <button
                    onClick={() => setSelectedMember(selectedMember?.userId === member.userId ? null : member)}
                    className="p-2 hover:bg-gray-600/50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Detailed information */}
              {showDetailed && selectedMember?.userId === member.userId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 pt-4 border-t border-gray-600"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Weekly activity */}
                    <div>
                      <h5 className="font-medium text-white mb-2">Weekly Activity</h5>
                      <div className="space-y-2">
                        {member.weeklyActivity.map((week, index) => (
                          <div key={index} className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">{week.week}</span>
                            <div className="flex gap-3">
                              <span className="text-blue-400">{week.messages} msg</span>
                              <span className="text-green-400">{week.events} events</span>
                              <span className="text-purple-400">{week.points} pts</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Achievements */}
                    <div>
                      <h5 className="font-medium text-white mb-2">Achievements</h5>
                      <div className="space-y-2">
                        {member.achievements.map((achievement, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div className={`w-2 h-2 rounded-full ${getRarityColor(achievement.rarity)}`} />
                            <span className="text-gray-300">{achievement.name}</span>
                            <span className="text-xs text-gray-500">
                              {achievement.earnedAt.toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MemberAnalytics; 