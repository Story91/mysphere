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

// Interfejs dla analityk członka
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

// Interfejs dla statystyk społeczności
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

  // Przykładowe dane analityk
  const [memberAnalytics, setMemberAnalytics] = useState<MemberAnalytics[]>([
    {
      userId: '1',
      username: 'AliceActive',
      avatar: '',
      joinedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      totalMessages: 245,
      totalEventsAttended: 12,
      totalPoints: 1850,
      level: 8,
      activityScore: 92,
      engagementRate: 0.85,
      lastActiveDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
      weeklyActivity: [
        { week: 'W1', messages: 45, events: 2, points: 320 },
        { week: 'W2', messages: 52, events: 3, points: 410 },
        { week: 'W3', messages: 38, events: 1, points: 280 },
        { week: 'W4', messages: 61, events: 4, points: 520 }
      ],
      monthlyGrowth: [
        { month: 'Jan', newMembers: 12, activeMembers: 45, retention: 0.85 },
        { month: 'Feb', newMembers: 18, activeMembers: 52, retention: 0.88 },
        { month: 'Mar', newMembers: 25, activeMembers: 68, retention: 0.92 }
      ],
      roleHistory: [
        { role: 'member', assignedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), assignedBy: 'System' },
        { role: 'moderator', assignedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), assignedBy: 'Admin' }
      ],
      achievements: [
        { id: '1', name: 'Aktywny członek', description: '100 wiadomości', earnedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), rarity: 'common' },
        { id: '2', name: 'Uczestnik eventów', description: '10 eventów', earnedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), rarity: 'rare' },
        { id: '3', name: 'Społeczność builder', description: '1000 punktów', earnedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), rarity: 'epic' }
      ]
    },
    {
      userId: '2',
      username: 'BobBuilder',
      avatar: '',
      joinedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      totalMessages: 180,
      totalEventsAttended: 8,
      totalPoints: 1420,
      level: 6,
      activityScore: 78,
      engagementRate: 0.72,
      lastActiveDate: new Date(Date.now() - 6 * 60 * 60 * 1000),
      weeklyActivity: [
        { week: 'W1', messages: 32, events: 1, points: 250 },
        { week: 'W2', messages: 28, events: 2, points: 320 },
        { week: 'W3', messages: 45, events: 3, points: 450 },
        { week: 'W4', messages: 35, events: 1, points: 280 }
      ],
      monthlyGrowth: [
        { month: 'Jan', newMembers: 8, activeMembers: 32, retention: 0.78 },
        { month: 'Feb', newMembers: 12, activeMembers: 38, retention: 0.82 },
        { month: 'Mar', newMembers: 15, activeMembers: 45, retention: 0.85 }
      ],
      roleHistory: [
        { role: 'member', assignedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), assignedBy: 'System' }
      ],
      achievements: [
        { id: '1', name: 'Aktywny członek', description: '100 wiadomości', earnedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), rarity: 'common' },
        { id: '4', name: 'Pomoc społeczności', description: '50 odpowiedzi', earnedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), rarity: 'rare' }
      ]
    }
  ]);

  const [stats, setStats] = useState<CommunityStats>({
    totalMembers: 156,
    activeMembers: 89,
    newMembersThisMonth: 23,
    averageEngagement: 0.78,
    topContributors: [
      { userId: '1', username: 'AliceActive', points: 1850, rank: 1 },
      { userId: '2', username: 'BobBuilder', points: 1420, rank: 2 },
      { userId: '3', username: 'CharlieDev', points: 1180, rank: 3 }
    ],
    activityByHour: [
      { hour: 0, activity: 12 }, { hour: 1, activity: 8 }, { hour: 2, activity: 5 },
      { hour: 3, activity: 3 }, { hour: 4, activity: 2 }, { hour: 5, activity: 4 },
      { hour: 6, activity: 15 }, { hour: 7, activity: 25 }, { hour: 8, activity: 45 },
      { hour: 9, activity: 65 }, { hour: 10, activity: 78 }, { hour: 11, activity: 82 },
      { hour: 12, activity: 95 }, { hour: 13, activity: 88 }, { hour: 14, activity: 92 },
      { hour: 15, activity: 85 }, { hour: 16, activity: 78 }, { hour: 17, activity: 72 },
      { hour: 18, activity: 68 }, { hour: 19, activity: 55 }, { hour: 20, activity: 45 },
      { hour: 21, activity: 35 }, { hour: 22, activity: 28 }, { hour: 23, activity: 18 }
    ],
    membersByRole: [
      { role: 'member', count: 125, percentage: 80.1 },
      { role: 'moderator', count: 20, percentage: 12.8 },
      { role: 'admin', count: 8, percentage: 5.1 },
      { role: 'owner', count: 3, percentage: 1.9 }
    ],
    retentionRate: 0.85,
    growthRate: 0.18
  });

  // Sortowanie członków
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

  // Funkcja określająca kolor achievement
  const getAchievementColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'text-gray-400 bg-gray-500/20';
      case 'rare': return 'text-blue-400 bg-blue-500/20';
      case 'epic': return 'text-purple-400 bg-purple-500/20';
      case 'legendary': return 'text-yellow-400 bg-yellow-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  // Funkcja formatowania daty
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString();
  };

  // Funkcja formatowania względnego czasu
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'wczoraj';
    if (diffDays < 7) return `${diffDays} dni temu`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} tygodni temu`;
    return `${Math.ceil(diffDays / 30)} miesięcy temu`;
  };

  return (
    <div className="space-y-6">
      {/* Nagłówek z kontrolami */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Analityka członków</h2>
          <p className="text-gray-400">Szczegółowe dane o aktywności i zaangażowaniu</p>
        </div>
        
        <div className="flex gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            <option value="week">Tydzień</option>
            <option value="month">Miesiąc</option>
            <option value="quarter">Kwartał</option>
            <option value="year">Rok</option>
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
            Eksport
          </button>
        </div>
      </div>

      {/* Główne statystyki */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{stats.totalMembers}</div>
              <div className="text-sm text-gray-400">Członków</div>
              <div className="text-xs text-green-400">+{stats.newMembersThisMonth} w tym miesiącu</div>
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
              <div className="text-sm text-gray-400">Aktywni</div>
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
              <div className="text-sm text-gray-400">Zaangażowanie</div>
              <div className="text-xs text-green-400">+{(stats.growthRate * 100).toFixed(1)}% wzrost</div>
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
              <div className="text-sm text-gray-400">Retencja</div>
              <div className="text-xs text-green-400">Bardzo dobra</div>
            </div>
          </div>
        </div>
      </div>

      {/* Wykresy aktywności */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aktywność w ciągu dnia */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Aktywność w ciągu dnia</h3>
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

        {/* Podział według ról */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Podział według ról</h3>
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
        <h3 className="text-lg font-semibold text-white mb-4">Najlepsi członkowie</h3>
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
                  <div className="text-sm text-gray-400">{contributor.points} punktów</div>
                </div>
              </div>
              <div className="text-2xl font-bold text-purple-400">#{contributor.rank}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Lista członków z analitykami */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Analityki członków</h3>
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1 bg-gray-700/50 border border-gray-600 rounded text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="points">Punkty</option>
              <option value="engagement">Zaangażowanie</option>
              <option value="activity">Aktywność</option>
              <option value="messages">Wiadomości</option>
            </select>
            <button
              onClick={() => setShowDetailed(!showDetailed)}
              className="flex items-center gap-1 px-3 py-1 bg-gray-700/50 border border-gray-600 rounded text-sm hover:bg-gray-600/50 transition-colors"
            >
              {showDetailed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Szczegóły
            </button>
          </div>
        </div>

        <div className="space-y-3">
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
                    <div className="text-xs text-gray-400">Zaangażowanie</div>
                  </div>
                  <button
                    onClick={() => setSelectedMember(selectedMember?.userId === member.userId ? null : member)}
                    className="p-2 hover:bg-gray-600/50 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Szczegółowe informacje */}
              {showDetailed && selectedMember?.userId === member.userId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 pt-4 border-t border-gray-600"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Aktywność tygodniowa */}
                    <div>
                      <h5 className="font-medium text-white mb-2">Aktywność tygodniowa</h5>
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

                    {/* Osiągnięcia */}
                    <div>
                      <h5 className="font-medium text-white mb-2">Osiągnięcia</h5>
                      <div className="space-y-2">
                        {member.achievements.map(achievement => (
                          <div key={achievement.id} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${getAchievementColor(achievement.rarity)}`}>
                              <Award className="w-3 h-3" />
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-white">{achievement.name}</div>
                              <div className="text-xs text-gray-400">{achievement.description}</div>
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatRelativeTime(achievement.earnedAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Historia ról */}
                  <div className="mt-4">
                    <h5 className="font-medium text-white mb-2">Historia ról</h5>
                    <div className="space-y-2">
                      {member.roleHistory.map((history, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-300 capitalize">{history.role}</span>
                          <span className="text-gray-400">{formatDate(history.assignedAt)}</span>
                          <span className="text-gray-500">przez {history.assignedBy}</span>
                        </div>
                      ))}
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