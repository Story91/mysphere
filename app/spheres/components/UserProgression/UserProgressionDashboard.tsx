'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Star, 
  Target, 
  Flame, 
  Award, 
  TrendingUp,
  Calendar,
  Users,
  MessageSquare,
  Zap,
  Crown,
  Shield,
  Gem,
  Heart,
  CheckCircle,
  Lock,
  ChevronRight,
  BarChart3,
  Medal,
  Gift,
  Clock,
  Activity
} from 'lucide-react';

// Interfejsy
interface Level {
  level: number;
  name: string;
  description: string;
  xpRequired: number;
  xpToNext: number;
  color: string;
  badge: string;
  rewards: LevelReward[];
}

interface LevelReward {
  type: 'token' | 'nft' | 'badge' | 'access' | 'title';
  amount?: number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: 'social' | 'financial' | 'creative' | 'technical' | 'leadership';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: React.ComponentType<{ className?: string }>;
  progress: number;
  maxProgress: number;
  isCompleted: boolean;
  completedAt?: Date;
  xpReward: number;
  tokenReward?: number;
  prerequisites?: string[];
}

interface UserStats {
  totalXP: number;
  currentLevel: number;
  nextLevelXP: number;
  totalMessages: number;
  totalEvents: number;
  totalTransactions: number;
  totalSpent: number;
  daysActive: number;
  longestStreak: number;
  currentStreak: number;
  totalReferrals: number;
  completedAchievements: number;
  totalAchievements: number;
}

interface UserProgressionDashboardProps {
  userId: string;
  communityId: string;
}

const UserProgressionDashboard: React.FC<UserProgressionDashboardProps> = ({
  userId,
  communityId
}) => {
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [currentLevel, setCurrentLevel] = useState<Level | null>(null);
  const [nextLevel, setNextLevel] = useState<Level | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'achievements' | 'levels' | 'rewards'>('overview');
  const [selectedCategory, setSelectedCategory] = useState<'all' | Achievement['category']>('all');

  // Definicja poziomów
  const levels: Level[] = [
    {
      level: 1,
      name: 'Newcomer',
      description: 'Witaj w społeczności! Rozpocznij swoją przygodę z Web3.',
      xpRequired: 0,
      xpToNext: 100,
      color: 'from-gray-500 to-gray-600',
      badge: '👋',
      rewards: [
        { type: 'token', amount: 10, description: 'Powitalne tokeny', icon: Star },
        { type: 'badge', description: 'Newcomer Badge', icon: Award }
      ]
    },
    {
      level: 2,
      name: 'Explorer',
      description: 'Poznajesz podstawy i eksploruje możliwości społeczności.',
      xpRequired: 100,
      xpToNext: 250,
      color: 'from-blue-500 to-blue-600',
      badge: '🔍',
      rewards: [
        { type: 'token', amount: 25, description: 'Tokeny za eksplorację', icon: Star },
        { type: 'access', description: 'Dostęp do kanałów Explorer', icon: Shield }
      ]
    },
    {
      level: 3,
      name: 'Contributor',
      description: 'Aktywnie uczestniczysz w społeczności i dzielisz się wiedzą.',
      xpRequired: 350,
      xpToNext: 500,
      color: 'from-green-500 to-green-600',
      badge: '💡',
      rewards: [
        { type: 'token', amount: 50, description: 'Tokeny za wkład', icon: Star },
        { type: 'badge', description: 'Contributor Badge', icon: Award },
        { type: 'access', description: 'Dostęp do ekskluzywnych eventów', icon: Calendar }
      ]
    },
    {
      level: 4,
      name: 'Specialist',
      description: 'Jesteś ekspertem w swojej dziedzinie i pomagasz innym.',
      xpRequired: 850,
      xpToNext: 1000,
      color: 'from-purple-500 to-purple-600',
      badge: '🎓',
      rewards: [
        { type: 'token', amount: 100, description: 'Tokeny specjalisty', icon: Star },
        { type: 'nft', description: 'Specialist NFT', icon: Gem },
        { type: 'title', description: 'Specialist Title', icon: Crown }
      ]
    },
    {
      level: 5,
      name: 'Mentor',
      description: 'Prowadzisz innych i dzielisz się swoim doświadczeniem.',
      xpRequired: 1850,
      xpToNext: 1500,
      color: 'from-orange-500 to-orange-600',
      badge: '👨‍🏫',
      rewards: [
        { type: 'token', amount: 200, description: 'Tokeny mentora', icon: Star },
        { type: 'access', description: 'Panel mentora', icon: Users },
        { type: 'nft', description: 'Mentor NFT', icon: Gem }
      ]
    },
    {
      level: 6,
      name: 'Master',
      description: 'Mistrz swojego fachu z głęboką wiedzą i doświadczeniem.',
      xpRequired: 3350,
      xpToNext: 0,
      color: 'from-yellow-500 to-yellow-600',
      badge: '🏆',
      rewards: [
        { type: 'token', amount: 500, description: 'Tokeny mistrza', icon: Star },
        { type: 'nft', description: 'Master NFT', icon: Gem },
        { type: 'title', description: 'Master Title', icon: Crown },
        { type: 'access', description: 'Wszystkie uprawnienia', icon: Shield }
      ]
    }
  ];

  // Definicja achievementów
  const achievementDefinitions: Achievement[] = [
    {
      id: 'first_message',
      name: 'Pierwsza wiadomość',
      description: 'Napisz swoją pierwszą wiadomość w społeczności',
      category: 'social',
      rarity: 'common',
      icon: MessageSquare,
      progress: 1,
      maxProgress: 1,
      isCompleted: true,
      completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      xpReward: 10,
      tokenReward: 5
    },
    {
      id: 'active_week',
      name: 'Aktywny tydzień',
      description: 'Bądź aktywny przez 7 dni z rzędu',
      category: 'social',
      rarity: 'common',
      icon: Calendar,
      progress: 5,
      maxProgress: 7,
      isCompleted: false,
      xpReward: 50,
      tokenReward: 20
    },
    {
      id: 'big_spender',
      name: 'Wielki wydawca',
      description: 'Wydaj łącznie 1 ETH w społeczności',
      category: 'financial',
      rarity: 'rare',
      icon: Gem,
      progress: 0.65,
      maxProgress: 1,
      isCompleted: false,
      xpReward: 200,
      tokenReward: 100
    },
    {
      id: 'event_master',
      name: 'Mistrz eventów',
      description: 'Weź udział w 10 eventach społeczności',
      category: 'social',
      rarity: 'rare',
      icon: Trophy,
      progress: 7,
      maxProgress: 10,
      isCompleted: false,
      xpReward: 150,
      tokenReward: 75
    },
    {
      id: 'creator_supreme',
      name: 'Najwyższy twórca',
      description: 'Stwórz społeczność z 100+ członkami',
      category: 'leadership',
      rarity: 'epic',
      icon: Crown,
      progress: 0,
      maxProgress: 100,
      isCompleted: false,
      xpReward: 500,
      tokenReward: 250,
      prerequisites: ['mentor_level']
    },
    {
      id: 'social_butterfly',
      name: 'Społeczny motyl',
      description: 'Napisz 1000 wiadomości w społeczności',
      category: 'social',
      rarity: 'epic',
      icon: Heart,
      progress: 245,
      maxProgress: 1000,
      isCompleted: false,
      xpReward: 300,
      tokenReward: 150
    },
    {
      id: 'legend',
      name: 'Legenda',
      description: 'Osiągnij poziom Master i ukończ wszystkie inne achievementy',
      category: 'leadership',
      rarity: 'legendary',
      icon: Medal,
      progress: 0,
      maxProgress: 1,
      isCompleted: false,
      xpReward: 1000,
      tokenReward: 500,
      prerequisites: ['master_level', 'all_achievements']
    }
  ];

  // Przykładowe dane użytkownika
  useEffect(() => {
    const loadUserData = async () => {
      setLoading(true);
      
      const mockStats: UserStats = {
        totalXP: 1250,
        currentLevel: 3,
        nextLevelXP: 1850,
        totalMessages: 245,
        totalEvents: 7,
        totalTransactions: 12,
        totalSpent: 0.65,
        daysActive: 45,
        longestStreak: 14,
        currentStreak: 5,
        totalReferrals: 3,
        completedAchievements: 1,
        totalAchievements: achievementDefinitions.length
      };

      setUserStats(mockStats);
      setCurrentLevel(levels[mockStats.currentLevel - 1]);
      setNextLevel(levels[mockStats.currentLevel]);
      setAchievements(achievementDefinitions);
      setLoading(false);
    };

    loadUserData();
  }, [userId, communityId]);

  // Funkcja określająca kolor rarify
  const getRarityColor = (rarity: Achievement['rarity']) => {
    switch (rarity) {
      case 'common': return 'from-gray-500 to-gray-600';
      case 'rare': return 'from-blue-500 to-blue-600';
      case 'epic': return 'from-purple-500 to-purple-600';
      case 'legendary': return 'from-yellow-500 to-yellow-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  // Funkcja filtrowania achievementów
  const filteredAchievements = achievements.filter(achievement => 
    selectedCategory === 'all' || achievement.category === selectedCategory
  );

  // Funkcja obliczająca postęp do następnego poziomu
  const getProgressToNextLevel = () => {
    if (!userStats || !currentLevel || !nextLevel) return 0;
    const currentLevelXP = currentLevel.xpRequired;
    const nextLevelXP = nextLevel.xpRequired;
    const userXP = userStats.totalXP;
    
    return ((userXP - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!userStats || !currentLevel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="text-red-400 text-lg">Błąd ładowania danych użytkownika</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Nagłówek */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Dashboard progresji
          </h1>
          <p className="text-gray-400">
            Śledź swoje postępy, osiągnięcia i rozwój w społeczności
          </p>
        </div>

        {/* Nawigacja */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { id: 'overview', label: 'Przegląd', icon: TrendingUp },
            { id: 'achievements', label: 'Osiągnięcia', icon: Trophy },
            { id: 'levels', label: 'Poziomy', icon: Star },
            { id: 'rewards', label: 'Nagrody', icon: Gift }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Przegląd */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Aktualny poziom */}
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${currentLevel.color} flex items-center justify-center text-2xl`}>
                  {currentLevel.badge}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">{currentLevel.name}</h2>
                  <p className="text-gray-400">{currentLevel.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-gray-400">Poziom {currentLevel.level}</span>
                    <span className="text-sm text-purple-400">•</span>
                    <span className="text-sm text-purple-400">{userStats.totalXP} XP</span>
                  </div>
                </div>
              </div>

              {/* Pasek postępu */}
              {nextLevel && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Postęp do następnego poziomu</span>
                    <span className="text-sm text-white">
                      {userStats.totalXP} / {nextLevel.xpRequired} XP
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-1000"
                      style={{ width: `${getProgressToNextLevel()}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-500">
                      {nextLevel.xpRequired - userStats.totalXP} XP do następnego poziomu
                    </span>
                    <span className="text-xs text-purple-400">
                      {nextLevel.name}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Statystyki */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats.totalMessages}</div>
                    <div className="text-sm text-gray-400">Wiadomości</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats.totalEvents}</div>
                    <div className="text-sm text-gray-400">Eventy</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Flame className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats.currentStreak}</div>
                    <div className="text-sm text-gray-400">Aktualna seria</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats.completedAchievements}</div>
                    <div className="text-sm text-gray-400">Osiągnięcia</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ostatnie osiągnięcia */}
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Ostatnie osiągnięcia</h3>
              <div className="space-y-3">
                {achievements.filter(a => a.isCompleted).slice(-3).map(achievement => (
                  <div key={achievement.id} className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getRarityColor(achievement.rarity)} flex items-center justify-center`}>
                      <achievement.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{achievement.name}</h4>
                      <p className="text-sm text-gray-400">{achievement.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-green-400">+{achievement.xpReward} XP</div>
                      {achievement.tokenReward && (
                        <div className="text-xs text-purple-400">+{achievement.tokenReward} tokens</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Osiągnięcia */}
        {activeTab === 'achievements' && (
          <div className="space-y-4">
            {/* Filtry */}
            <div className="flex flex-wrap gap-2">
              {['all', 'social', 'financial', 'creative', 'technical', 'leadership'].map(category => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category as any)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                    selectedCategory === category
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                  }`}
                >
                  {category === 'all' ? 'Wszystkie' : 
                   category === 'social' ? 'Społeczne' :
                   category === 'financial' ? 'Finansowe' :
                   category === 'creative' ? 'Kreatywne' :
                   category === 'technical' ? 'Techniczne' :
                   'Liderskie'}
                </button>
              ))}
            </div>

            {/* Lista osiągnięć */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAchievements.map(achievement => (
                <div key={achievement.id} className={`bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border ${
                  achievement.isCompleted ? 'border-green-500/50' : 'border-gray-700'
                }`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getRarityColor(achievement.rarity)} flex items-center justify-center`}>
                      <achievement.icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex items-center gap-2">
                      {achievement.isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-gray-600 rounded-full" />
                      )}
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        achievement.rarity === 'common' ? 'bg-gray-500/20 text-gray-400' :
                        achievement.rarity === 'rare' ? 'bg-blue-500/20 text-blue-400' :
                        achievement.rarity === 'epic' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {achievement.rarity}
                      </span>
                    </div>
                  </div>

                  <h4 className="font-semibold text-white mb-1">{achievement.name}</h4>
                  <p className="text-sm text-gray-400 mb-3">{achievement.description}</p>

                  {/* Pasek postępu */}
                  {!achievement.isCompleted && (
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-500">Postęp</span>
                        <span className="text-xs text-white">
                          {achievement.progress} / {achievement.maxProgress}
                        </span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(achievement.progress / achievement.maxProgress) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Nagrody */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-yellow-400">+{achievement.xpReward} XP</span>
                    </div>
                    {achievement.tokenReward && (
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-purple-400">+{achievement.tokenReward}</span>
                      </div>
                    )}
                  </div>

                  {/* Data ukończenia */}
                  {achievement.isCompleted && achievement.completedAt && (
                    <div className="mt-2 pt-2 border-t border-gray-700">
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        Ukończono: {achievement.completedAt.toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Poziomy */}
        {activeTab === 'levels' && (
          <div className="space-y-4">
            {levels.map((level, index) => (
              <div key={level.level} className={`bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border ${
                level.level === currentLevel.level ? 'border-purple-500/50' : 
                level.level < currentLevel.level ? 'border-green-500/50' : 'border-gray-700'
              }`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${level.color} flex items-center justify-center text-2xl`}>
                    {level.badge}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white">{level.name}</h3>
                      <span className="text-sm text-gray-400">Poziom {level.level}</span>
                      {level.level === currentLevel.level && (
                        <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                          Aktualny
                        </span>
                      )}
                      {level.level < currentLevel.level && (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      )}
                      {level.level > currentLevel.level && (
                        <Lock className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <p className="text-gray-400 mt-1">{level.description}</p>
                    <div className="text-sm text-gray-500 mt-1">
                      {level.xpRequired} XP wymagane
                      {level.xpToNext > 0 && ` • ${level.xpToNext} XP do następnego poziomu`}
                    </div>
                  </div>
                </div>

                {/* Nagrody */}
                <div className="space-y-2">
                  <h4 className="font-semibold text-white">Nagrody za poziom:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {level.rewards.map((reward, rewardIndex) => (
                      <div key={rewardIndex} className="flex items-center gap-2 p-2 bg-gray-700/30 rounded-lg">
                        <reward.icon className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-gray-300">
                          {reward.amount && `${reward.amount}x `}{reward.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Nagrody */}
        {activeTab === 'rewards' && (
          <div className="space-y-6">
            {/* Podsumowanie nagród */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Star className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">1,250</div>
                    <div className="text-sm text-gray-400">Tokeny zdobyte</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Gem className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">3</div>
                    <div className="text-sm text-gray-400">NFT zdobyte</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <Award className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">5</div>
                    <div className="text-sm text-gray-400">Badges zdobyte</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Historia nagród */}
            <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Historia nagród</h3>
              <div className="space-y-3">
                {[
                  { type: 'badge', name: 'Newcomer Badge', date: '2024-01-15', source: 'Poziom 1' },
                  { type: 'token', name: '50 Community Tokens', date: '2024-01-20', source: 'Achievement: Pierwsza wiadomość' },
                  { type: 'nft', name: 'Early Adopter NFT', date: '2024-01-25', source: 'Poziom 2' },
                  { type: 'token', name: '100 Community Tokens', date: '2024-02-01', source: 'Poziom 3' },
                  { type: 'badge', name: 'Contributor Badge', date: '2024-02-05', source: 'Poziom 3' }
                ].map((reward, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-700/30 rounded-lg">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                      {reward.type === 'token' ? <Star className="w-5 h-5 text-white" /> :
                       reward.type === 'nft' ? <Gem className="w-5 h-5 text-white" /> :
                       <Award className="w-5 h-5 text-white" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{reward.name}</h4>
                      <p className="text-sm text-gray-400">Źródło: {reward.source}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400">{reward.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProgressionDashboard; 