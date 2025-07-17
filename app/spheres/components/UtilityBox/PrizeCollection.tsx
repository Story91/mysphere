'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSavedPrizes } from './PrizeEventListener';
import { useRouter } from 'next/navigation';
import { 
  Trophy, 
  Shield, 
  Zap, 
  Star, 
  Ticket, 
  Package, 
  Crown, 
  Calendar,
  TrendingUp,
  Award,
  Filter,
  X
} from 'lucide-react';

// Prize type configuration with icons and colors
const PRIZE_TYPES = {
  'NFT': { icon: Trophy, color: 'text-yellow-400', bg: 'bg-yellow-400/10', name: 'Legendary NFT' },
  'Achievement Voucher': { icon: Ticket, color: 'text-purple-400', bg: 'bg-purple-400/10', name: 'Achievement Voucher' },
  'Streak Saver': { icon: Shield, color: 'text-blue-400', bg: 'bg-blue-400/10', name: 'Streak Saver' },
  'Boost': { icon: Zap, color: 'text-green-400', bg: 'bg-green-400/10', name: 'Boost' },
  'Respect Points': { icon: Star, color: 'text-pink-400', bg: 'bg-pink-400/10', name: 'Respect Points' },
  'Nothing': { icon: Package, color: 'text-gray-400', bg: 'bg-gray-400/10', name: 'Nothing' }
};

// Rarity configuration
const RARITY_CONFIG = {
  'legendary': { color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Legendary', icon: '👑' },
  'rare': { color: 'text-purple-400', bg: 'bg-purple-400/10', label: 'Rare', icon: '✨' },
  'common': { color: 'text-gray-400', bg: 'bg-gray-400/10', label: 'Common', icon: '📦' }
};

export default function PrizeCollection() {
  const router = useRouter();
  const { getPrizes, getStats, clearPrizes } = useSavedPrizes();
  const [filterType, setFilterType] = useState<string>('all');
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const allPrizes = getPrizes();
  const stats = getStats();

  // Filter prizes
  const filteredPrizes = allPrizes.filter((prize: any) => {
    const typeMatch = filterType === 'all' || prize.type === filterType;
    const rarityMatch = filterRarity === 'all' || prize.rarity === filterRarity;
    return typeMatch && rarityMatch;
  });

  // Sort by timestamp (newest first)
  const sortedPrizes = filteredPrizes.sort((a: any, b: any) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Achievement milestones
  const achievements = [
    { threshold: 1, name: 'First Box', icon: '🎁', achieved: stats.totalBoxes >= 1 },
    { threshold: 10, name: 'Collector', icon: '📚', achieved: stats.totalBoxes >= 10 },
    { threshold: 50, name: 'Box Expert', icon: '🏆', achieved: stats.totalBoxes >= 50 },
    { threshold: 1, name: 'Legend', icon: '👑', achieved: stats.legendaryCount >= 1, type: 'legendary' },
    { threshold: 5, name: 'Rarity Hunter', icon: '✨', achieved: stats.rareCount >= 5, type: 'rare' },
    { threshold: 1000, name: 'Points Master', icon: '💎', achieved: stats.totalValue >= 1000, type: 'points' }
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const PrizeCard = ({ prize, index }: { prize: any, index: number }) => {
    const prizeConfig = PRIZE_TYPES[prize.type as keyof typeof PRIZE_TYPES] || PRIZE_TYPES['Nothing'];
    const rarityConfig = RARITY_CONFIG[prize.rarity as keyof typeof RARITY_CONFIG] || RARITY_CONFIG['common'];
    const Icon = prizeConfig.icon;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className={`${prizeConfig.bg} border border-white/10 rounded-xl p-4 relative overflow-hidden`}
      >
        {/* Rarity indicator */}
        <div className={`absolute top-2 right-2 ${rarityConfig.bg} ${rarityConfig.color} text-xs font-bold px-2 py-1 rounded-full`}>
          {rarityConfig.icon} {rarityConfig.label}
        </div>

        {/* Prize icon and info */}
        <div className="flex items-start gap-3">
          <div className={`p-3 ${prizeConfig.bg} rounded-lg`}>
            <Icon className={`h-6 w-6 ${prizeConfig.color}`} />
          </div>
          
          <div className="flex-1">
            <h3 className="font-semibold text-white mb-1">{prizeConfig.name}</h3>
            {prize.value > 0 && (
              <p className={`text-sm ${prizeConfig.color} font-medium`}>
                {prize.type === 'Respect Points' ? `+${prize.value} points` : `Value: ${prize.value}`}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(prize.timestamp)}
            </p>
          </div>
        </div>

        {/* Special effects for rare items */}
        {prize.rarity === 'legendary' && (
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/5 to-transparent pointer-events-none" />
        )}
        {prize.rarity === 'rare' && (
          <div className="absolute inset-0 bg-gradient-to-r from-purple-400/5 to-transparent pointer-events-none" />
        )}
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Crown className="h-5 w-5 text-white" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">My Collection</h2>
            <p className="text-gray-300">UtilityBox rewards history</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            <Filter className="h-5 w-5 text-white" />
          </button>
          
                      {allPrizes.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to clear your rewards history?')) {
                    clearPrizes();
                  }
                }}
                className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
              >
                <X className="h-5 w-5 text-red-400" />
              </button>
            )}
        </div>
      </motion.div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white/5 rounded-xl p-4 border border-white/10"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Filter by Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                >
                  <option value="all">All Types</option>
                  {Object.entries(PRIZE_TYPES).map(([key, config]) => (
                    <option key={key} value={key}>{config.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Filter by Rarity</label>
                <select
                  value={filterRarity}
                  onChange={(e) => setFilterRarity(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white"
                >
                  <option value="all">All Rarities</option>
                  {Object.entries(RARITY_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-5 w-5 text-purple-400" />
            <span className="text-sm text-gray-400">Total</span>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalBoxes}</div>
        </div>
        
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            <span className="text-sm text-gray-400">Legendary</span>
          </div>
          <div className="text-2xl font-bold text-yellow-400">{stats.legendaryCount}</div>
        </div>
        
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-5 w-5 text-purple-400" />
            <span className="text-sm text-gray-400">Rare</span>
          </div>
          <div className="text-2xl font-bold text-purple-400">{stats.rareCount}</div>
        </div>
        
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-green-400" />
            <span className="text-sm text-gray-400">Points</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{stats.totalValue}</div>
        </div>
      </motion.div>

      {/* Achievements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/5 rounded-xl p-6 border border-white/10"
      >
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Award className="h-6 w-6 text-yellow-400" />
          Collector Achievements
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {achievements.map((achievement, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                achievement.achieved 
                  ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                  : 'bg-gray-500/10 border-gray-500/30 text-gray-400'
              }`}
            >
              <div className="text-2xl mb-2">{achievement.icon}</div>
              <div className="font-semibold">{achievement.name}</div>
              {achievement.achieved && (
                <div className="text-xs mt-1 text-green-300">✓ Unlocked</div>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Prize List */}
      {sortedPrizes.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <h3 className="text-xl font-bold text-white">
            Rewards History ({filteredPrizes.length})
          </h3>
          
          <div className="grid gap-4">
            {sortedPrizes.map((prize: any, index: number) => (
              <PrizeCard key={prize.id} prize={prize} index={index} />
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12"
        >
          <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Rewards</h3>
          <p className="text-gray-400 mb-6">
            {filterType === 'all' && filterRarity === 'all'
              ? 'Open your first UtilityBox to start your collection!'
              : 'No rewards matching the selected filters.'
            }
          </p>
          <button
            onClick={() => router.push('/spheres/utility-box')}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Open UtilityBox
          </button>
        </motion.div>
      )}
    </div>
  );
} 