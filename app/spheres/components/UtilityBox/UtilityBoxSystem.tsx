'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpheresContract } from '../../hooks/useSpheresContract';
import { toast } from 'react-hot-toast';
import { 
  Gift, 
  Star, 
  Gem, 
  Trophy, 
  Zap, 
  Heart,
  Crown,
  Shield,
  Medal,
  Award,
  Sparkles,
  Package,
  Lock,
  Clock,
  DollarSign,
  ChevronRight,
  RotateCcw,
  TrendingUp,
  Target,
  Flame,
  Eye,
  Plus,
  Coins
} from 'lucide-react';

// Interfejsy
interface UtilityBox {
  id: string;
  name: string;
  description: string;
  type: 'common' | 'rare' | 'epic' | 'legendary';
  price: number;
  currency: 'ETH' | 'tokens' | 'points';
  cooldown: number; // w minutach
  maxDaily: number;
  imageUrl?: string;
  animation: 'sparkle' | 'glow' | 'pulse' | 'rotate';
  rewards: BoxReward[];
  requirements?: {
    level?: number;
    achievements?: string[];
    membership?: string;
  };
  isUnlocked: boolean;
  isAvailable: boolean;
  nextAvailableTime?: Date;
  dailyOpened: number;
}

interface BoxReward {
  id: string;
  type: 'token' | 'nft' | 'badge' | 'points' | 'xp' | 'access';
  name: string;
  description: string;
  amount: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  probability: number; // 0-100
  icon: React.ComponentType<{ className?: string }>;
  imageUrl?: string;
  isExclusive?: boolean;
}

interface OpeningResult {
  boxId: string;
  rewards: BoxReward[];
  isJackpot: boolean;
  totalValue: number;
  xpEarned: number;
}

interface UserStats {
  totalBoxesOpened: number;
  totalValueEarned: number;
  rareRewards: number;
  epicRewards: number;
  legendaryRewards: number;
  longestStreak: number;
  currentStreak: number;
  favoriteBoxType: string;
  lastOpened: Date;
  totalSpent: number;
}

interface UtilityBoxSystemProps {
  userId: string;
  communityId: string;
  userLevel: number;
  userTokens: number;
  userPoints: number;
}

const UtilityBoxSystem: React.FC<UtilityBoxSystemProps> = ({
  userId,
  communityId,
  userLevel,
  userTokens,
  userPoints
}) => {
  const [boxes, setBoxes] = useState<UtilityBox[]>([]);
  const [selectedBox, setSelectedBox] = useState<UtilityBox | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [openingResult, setOpeningResult] = useState<OpeningResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'boxes' | 'inventory' | 'stats'>('boxes');

  // Definicje boxów
  const boxDefinitions: UtilityBox[] = [
    {
      id: 'starter_box',
      name: 'Starter Box',
      description: 'Podstawowy box dla nowych członków społeczności. Zawiera przydatne zasoby na początek.',
      type: 'common',
      price: 0,
      currency: 'tokens',
      cooldown: 60, // 1 godzina
      maxDaily: 3,
      animation: 'sparkle',
      rewards: [
        { id: 'tokens_small', type: 'token', name: 'Community Tokens', description: '10-50 tokenów', amount: 30, rarity: 'common', probability: 70, icon: Coins },
        { id: 'xp_small', type: 'xp', name: 'Experience Points', description: '5-20 XP', amount: 10, rarity: 'common', probability: 50, icon: Zap },
        { id: 'badge_newcomer', type: 'badge', name: 'Newcomer Badge', description: 'Badge dla nowych członków', amount: 1, rarity: 'common', probability: 20, icon: Award }
      ],
      isUnlocked: true,
      isAvailable: true,
      dailyOpened: 0
    },
    {
      id: 'community_box',
      name: 'Community Box',
      description: 'Box dla aktywnych członków społeczności. Lepsze nagrody za zaangażowanie.',
      type: 'rare',
      price: 50,
      currency: 'tokens',
      cooldown: 120, // 2 godziny
      maxDaily: 5,
      animation: 'glow',
      rewards: [
        { id: 'tokens_medium', type: 'token', name: 'Community Tokens', description: '50-200 tokenów', amount: 125, rarity: 'rare', probability: 60, icon: Coins },
        { id: 'nft_common', type: 'nft', name: 'Community NFT', description: 'Limitowane NFT społeczności', amount: 1, rarity: 'rare', probability: 15, icon: Gem },
        { id: 'access_vip', type: 'access', name: 'VIP Access', description: '24h dostęp do kanałów VIP', amount: 1, rarity: 'rare', probability: 10, icon: Crown },
        { id: 'xp_medium', type: 'xp', name: 'Experience Points', description: '20-100 XP', amount: 60, rarity: 'rare', probability: 40, icon: Zap }
      ],
      requirements: { level: 2 },
      isUnlocked: userLevel >= 2,
      isAvailable: true,
      dailyOpened: 0
    },
    {
      id: 'premium_box',
      name: 'Premium Box',
      description: 'Ekskluzywny box dla członków premium. Zawiera rzadkie nagrody i ekskluzywne przedmioty.',
      type: 'epic',
      price: 0.01,
      currency: 'ETH',
      cooldown: 360, // 6 godzin
      maxDaily: 2,
      animation: 'pulse',
      rewards: [
        { id: 'tokens_large', type: 'token', name: 'Premium Tokens', description: '200-500 tokenów', amount: 350, rarity: 'epic', probability: 50, icon: Coins },
        { id: 'nft_rare', type: 'nft', name: 'Rare NFT', description: 'Rzadkie NFT kolekcjonerskie', amount: 1, rarity: 'epic', probability: 25, icon: Gem },
        { id: 'badge_premium', type: 'badge', name: 'Premium Badge', description: 'Ekskluzywny badge premium', amount: 1, rarity: 'epic', probability: 15, icon: Star },
        { id: 'access_exclusive', type: 'access', name: 'Exclusive Access', description: 'Dostęp do ekskluzywnych eventów', amount: 1, rarity: 'epic', probability: 8, icon: Shield }
      ],
      requirements: { level: 4, membership: 'premium' },
      isUnlocked: userLevel >= 4,
      isAvailable: true,
      dailyOpened: 0
    },
    {
      id: 'legendary_box',
      name: 'Legendary Box',
      description: 'Legendarny box dla mistrzów społeczności. Najrzadsze nagrody i unikalne przedmioty.',
      type: 'legendary',
      price: 0.05,
      currency: 'ETH',
      cooldown: 1440, // 24 godziny
      maxDaily: 1,
      animation: 'rotate',
      rewards: [
        { id: 'tokens_huge', type: 'token', name: 'Legendary Tokens', description: '1000-2000 tokenów', amount: 1500, rarity: 'legendary', probability: 40, icon: Coins },
        { id: 'nft_legendary', type: 'nft', name: 'Legendary NFT', description: 'Wyjątkowe NFT kolekcjonerskie', amount: 1, rarity: 'legendary', probability: 20, icon: Trophy },
        { id: 'badge_legend', type: 'badge', name: 'Legend Badge', description: 'Badge dla legend społeczności', amount: 1, rarity: 'legendary', probability: 10, icon: Medal, isExclusive: true },
        { id: 'access_founder', type: 'access', name: 'Founder Access', description: 'Dostęp na poziomie założyciela', amount: 1, rarity: 'legendary', probability: 5, icon: Crown, isExclusive: true }
      ],
      requirements: { level: 6, achievements: ['master_level', 'premium_member'] },
      isUnlocked: userLevel >= 6,
      isAvailable: true,
      dailyOpened: 0
    }
  ];

  // Przykładowe dane użytkownika
  useEffect(() => {
    const loadUserData = async () => {
      setLoading(true);
      
      const mockStats: UserStats = {
        totalBoxesOpened: 47,
        totalValueEarned: 3250,
        rareRewards: 12,
        epicRewards: 3,
        legendaryRewards: 1,
        longestStreak: 14,
        currentStreak: 5,
        favoriteBoxType: 'Community Box',
        lastOpened: new Date(Date.now() - 2 * 60 * 60 * 1000),
        totalSpent: 0.15
      };

      setBoxes(boxDefinitions);
      setUserStats(mockStats);
      setLoading(false);
    };

    loadUserData();
  }, [userId, communityId, userLevel]);

  // Funkcja otwierania boxa
  const handleOpenBox = async (box: UtilityBox) => {
    if (!canOpenBox(box)) return;
    
    setSelectedBox(box);
    setIsOpening(true);
    
    try {
      // Symulacja otwierania boxa
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const result = generateBoxRewards(box);
      setOpeningResult(result);
      setShowResult(true);
      
      // Aktualizacja statystyk
      if (userStats) {
        setUserStats(prev => prev ? {
          ...prev,
          totalBoxesOpened: prev.totalBoxesOpened + 1,
          totalValueEarned: prev.totalValueEarned + result.totalValue,
          rareRewards: prev.rareRewards + result.rewards.filter(r => r.rarity === 'rare').length,
          epicRewards: prev.epicRewards + result.rewards.filter(r => r.rarity === 'epic').length,
          legendaryRewards: prev.legendaryRewards + result.rewards.filter(r => r.rarity === 'legendary').length,
          lastOpened: new Date(),
          currentStreak: prev.currentStreak + 1
        } : null);
      }
      
      // Aktualizacja boxa
      setBoxes(prev => prev.map(b => 
        b.id === box.id 
          ? { 
              ...b, 
              dailyOpened: b.dailyOpened + 1,
              nextAvailableTime: new Date(Date.now() + b.cooldown * 60 * 1000)
            } 
          : b
      ));
      
      toast.success('Box otwarty pomyślnie!');
      
    } catch (error) {
      toast.error('Błąd podczas otwierania boxa');
    } finally {
      setIsOpening(false);
    }
  };

  // Funkcja generowania nagród
  const generateBoxRewards = (box: UtilityBox): OpeningResult => {
    const rewards: BoxReward[] = [];
    let totalValue = 0;
    let isJackpot = false;

    // Losowanie nagród na podstawie prawdopodobieństwa
    box.rewards.forEach(reward => {
      const roll = Math.random() * 100;
      if (roll <= reward.probability) {
        rewards.push(reward);
        totalValue += reward.amount;
        
        // Sprawdzenie jackpota dla legendarnch nagród
        if (reward.rarity === 'legendary' && reward.isExclusive) {
          isJackpot = true;
        }
      }
    });

    // Gwarancja przynajmniej jednej nagrody
    if (rewards.length === 0) {
      rewards.push(box.rewards[0]);
      totalValue = box.rewards[0].amount;
    }

    return {
      boxId: box.id,
      rewards,
      isJackpot,
      totalValue,
      xpEarned: Math.floor(totalValue * 0.1)
    };
  };

  // Funkcja sprawdzająca czy można otworzyć box
  const canOpenBox = (box: UtilityBox): boolean => {
    if (!box.isUnlocked || !box.isAvailable) return false;
    if (box.dailyOpened >= box.maxDaily) return false;
    if (box.nextAvailableTime && box.nextAvailableTime > new Date()) return false;
    
    // Sprawdzenie wymagań finansowych
    if (box.currency === 'tokens' && userTokens < box.price) return false;
    if (box.currency === 'points' && userPoints < box.price) return false;
    
    return true;
  };

  // Funkcja określająca kolor typu boxa
  const getBoxTypeColor = (type: UtilityBox['type']) => {
    switch (type) {
      case 'common': return 'from-gray-500 to-gray-600';
      case 'rare': return 'from-blue-500 to-blue-600';
      case 'epic': return 'from-purple-500 to-purple-600';
      case 'legendary': return 'from-yellow-500 to-yellow-600';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  // Funkcja określająca kolor rzadkości nagrody
  const getRewardRarityColor = (rarity: BoxReward['rarity']) => {
    switch (rarity) {
      case 'common': return 'border-gray-500 bg-gray-500/10';
      case 'rare': return 'border-blue-500 bg-blue-500/10';
      case 'epic': return 'border-purple-500 bg-purple-500/10';
      case 'legendary': return 'border-yellow-500 bg-yellow-500/10';
      default: return 'border-gray-500 bg-gray-500/10';
    }
  };

  // Funkcja animacji boxa
  const getBoxAnimation = (animation: UtilityBox['animation']) => {
    switch (animation) {
      case 'sparkle': return 'animate-pulse';
      case 'glow': return 'animate-pulse';
      case 'pulse': return 'animate-bounce';
      case 'rotate': return 'animate-spin';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-pink-900/20 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Nagłówek */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            UtilityBox System
          </h1>
          <p className="text-gray-400">
            Otwieraj boxy, zdobywaj nagrody i rozwijaj swoją kolekcję
          </p>
        </div>

        {/* Nawigacja */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { id: 'boxes', label: 'Boxy', icon: Package },
            { id: 'inventory', label: 'Inwentarz', icon: Gift },
            { id: 'stats', label: 'Statystyki', icon: TrendingUp }
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

        {/* Tab: Boxy */}
        {activeTab === 'boxes' && (
          <div className="space-y-6">
            {/* Zasoby użytkownika */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Coins className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userTokens}</div>
                    <div className="text-sm text-gray-400">Tokeny</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userPoints}</div>
                    <div className="text-sm text-gray-400">Punkty</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Flame className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats?.currentStreak || 0}</div>
                    <div className="text-sm text-gray-400">Seria</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Lista boxów */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {boxes.map(box => (
                <div key={box.id} className={`bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border ${
                  box.isUnlocked ? 'border-gray-700' : 'border-gray-800'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-16 h-16 rounded-lg bg-gradient-to-br ${getBoxTypeColor(box.type)} flex items-center justify-center relative`}>
                      <Package className={`w-8 h-8 text-white ${box.isAvailable ? getBoxAnimation(box.animation) : ''}`} />
                      {box.animation === 'sparkle' && box.isAvailable && (
                        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-transparent via-white/20 to-transparent animate-ping"></div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`px-2 py-1 text-xs rounded-full ${getBoxTypeColor(box.type)} text-white`}>
                        {box.type}
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        {box.dailyOpened}/{box.maxDaily} dziś
                      </div>
                    </div>
                  </div>

                  <h3 className="text-lg font-semibold text-white mb-2">{box.name}</h3>
                  <p className="text-sm text-gray-400 mb-4">{box.description}</p>

                  {/* Cena */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1 text-sm">
                      <DollarSign className="w-4 h-4 text-gray-400" />
                      <span className="text-white">
                        {box.price === 0 ? 'Darmowy' : `${box.price} ${box.currency}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-400">
                      <Clock className="w-4 h-4" />
                      <span>{box.cooldown}min</span>
                    </div>
                  </div>

                  {/* Najlepsze nagrody */}
                  <div className="mb-4">
                    <div className="text-sm font-medium text-gray-300 mb-2">Możliwe nagrody:</div>
                    <div className="flex flex-wrap gap-1">
                      {box.rewards.slice(0, 3).map((reward, index) => (
                        <div key={index} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${getRewardRarityColor(reward.rarity)}`}>
                          <reward.icon className="w-3 h-3" />
                          <span>{reward.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Przycisk otwierania */}
                  <button
                    onClick={() => handleOpenBox(box)}
                    disabled={!canOpenBox(box)}
                    className={`w-full py-3 rounded-lg font-medium transition-all duration-200 ${
                      canOpenBox(box)
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600'
                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {!box.isUnlocked ? (
                      <div className="flex items-center justify-center gap-2">
                        <Lock className="w-4 h-4" />
                        Zablokowany
                      </div>
                    ) : box.dailyOpened >= box.maxDaily ? (
                      <div className="flex items-center justify-center gap-2">
                        <Clock className="w-4 h-4" />
                        Limit dzienny
                      </div>
                    ) : box.nextAvailableTime && box.nextAvailableTime > new Date() ? (
                      <div className="flex items-center justify-center gap-2">
                        <RotateCcw className="w-4 h-4" />
                        Cooldown
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Gift className="w-4 h-4" />
                        Otwórz box
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: Statystyki */}
        {activeTab === 'stats' && userStats && (
          <div className="space-y-6">
            {/* Główne statystyki */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Package className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats.totalBoxesOpened}</div>
                    <div className="text-sm text-gray-400">Boxy otwarte</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Coins className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats.totalValueEarned}</div>
                    <div className="text-sm text-gray-400">Wartość zdobyta</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats.legendaryRewards}</div>
                    <div className="text-sm text-gray-400">Legendary nagrody</div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Flame className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{userStats.longestStreak}</div>
                    <div className="text-sm text-gray-400">Najdłuższa seria</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Szczegółowe statystyki */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Rozkład nagród</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Rare:</span>
                    <span className="text-blue-400 font-semibold">{userStats.rareRewards}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Epic:</span>
                    <span className="text-purple-400 font-semibold">{userStats.epicRewards}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Legendary:</span>
                    <span className="text-yellow-400 font-semibold">{userStats.legendaryRewards}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800/30 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Inne statystyki</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Ulubiony box:</span>
                    <span className="text-white">{userStats.favoriteBoxType}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Łącznie wydane:</span>
                    <span className="text-white">{userStats.totalSpent} ETH</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Ostatnio otwarte:</span>
                    <span className="text-white">{userStats.lastOpened.toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal otwierania boxa */}
        <AnimatePresence>
          {isOpening && selectedBox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
            >
              <div className="text-center">
                <motion.div
                  animate={{ 
                    scale: [1, 1.2, 1],
                    rotate: [0, 360, 0]
                  }}
                  transition={{ 
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className={`w-32 h-32 mx-auto mb-6 rounded-lg bg-gradient-to-br ${getBoxTypeColor(selectedBox.type)} flex items-center justify-center relative`}
                >
                  <Package className="w-16 h-16 text-white" />
                  <motion.div
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1, repeat: Infinity }}
                    className="absolute inset-0 rounded-lg bg-gradient-to-br from-transparent via-white/30 to-transparent"
                  />
                </motion.div>
                <h2 className="text-2xl font-bold text-white mb-2">Otwieranie boxa...</h2>
                <p className="text-gray-400">{selectedBox.name}</p>
                <div className="mt-4 flex items-center justify-center gap-1">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal wyników */}
        <AnimatePresence>
          {showResult && openingResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700"
              >
                <div className="p-6">
                  <div className="text-center mb-6">
                    {openingResult.isJackpot && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="mb-4"
                      >
                        <div className="text-6xl">🎉</div>
                        <div className="text-2xl font-bold text-yellow-400">JACKPOT!</div>
                      </motion.div>
                    )}
                    <h3 className="text-xl font-bold text-white mb-2">Gratulacje!</h3>
                    <p className="text-gray-400">Zdobyłeś następujące nagrody:</p>
                  </div>

                  <div className="space-y-3 mb-6">
                    {openingResult.rewards.map((reward, index) => (
                      <motion.div
                        key={reward.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`flex items-center gap-3 p-3 rounded-lg ${getRewardRarityColor(reward.rarity)}`}
                      >
                        <reward.icon className="w-8 h-8 text-white" />
                        <div className="flex-1">
                          <h4 className="font-semibold text-white">{reward.name}</h4>
                          <p className="text-sm text-gray-400">{reward.description}</p>
                        </div>
                        {reward.isExclusive && (
                          <div className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full">
                            Ekskluzywne
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>

                  <div className="bg-gray-700/30 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-400">Łączna wartość:</span>
                      <span className="text-white font-semibold">{openingResult.totalValue}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Bonus XP:</span>
                      <span className="text-blue-400 font-semibold">+{openingResult.xpEarned}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setShowResult(false);
                      setOpeningResult(null);
                      setSelectedBox(null);
                    }}
                    className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 font-medium"
                  >
                    Odbierz nagrody
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default UtilityBoxSystem; 