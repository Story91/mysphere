"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  BaseLevelBonus, 
  PassiveBonus, 
  PassiveBonusType, 
  UnlockedFeature, 
  PlayerBonuses 
} from "@/types/contract";
import { 
  TrophyIcon, 
  StarIcon, 
  BoltIcon, 
  GiftIcon, 
  LockClosedIcon, 
  CheckCircleIcon,
  ArrowUpIcon,
  SparklesIcon,
  FireIcon,
  CubeIcon,
  ShieldCheckIcon,
  ClockIcon,
  CurrencyDollarIcon
} from "@heroicons/react/24/solid";

interface BonusesPanelProps {
  playerLevel: number;
  playerXp: number;
  className?: string;
}

// Mock data for base level bonuses - in real app this would come from contract
const BASE_LEVEL_BONUSES: BaseLevelBonus[] = [
  {
    level: 1,
    powerBonus: 5,
    xpMultiplier: 1.0,
    resourceMultiplier: 1.0,
    dailyCheckInBonus: 0,
    fusionCostReduction: 0,
    unlockedFeatures: ["Basic Gameplay", "Daily Check-in", "Element Collection"],
    passiveBonuses: []
  },
  {
    level: 2,
    powerBonus: 10,
    xpMultiplier: 1.05,
    resourceMultiplier: 1.05,
    dailyCheckInBonus: 25,
    fusionCostReduction: 2,
    unlockedFeatures: ["Element Fusion"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 5, description: "+5% XP from all sources" }
    ]
  },
  {
    level: 3,
    powerBonus: 15,
    xpMultiplier: 1.1,
    resourceMultiplier: 1.1,
    dailyCheckInBonus: 50,
    fusionCostReduction: 5,
    unlockedFeatures: ["Advanced Fusion"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 10, description: "+10% XP from all sources" },
      { type: PassiveBonusType.RESOURCE_GENERATION, value: 10, description: "+10% resources from missions" }
    ]
  },
  {
    level: 4,
    powerBonus: 20,
    xpMultiplier: 1.15,
    resourceMultiplier: 1.15,
    dailyCheckInBonus: 75,
    fusionCostReduction: 8,
    unlockedFeatures: ["Batch Minting"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 15, description: "+15% XP from all sources" },
      { type: PassiveBonusType.FUSION_DISCOUNT, value: 8, description: "8% reduction in fusion costs" }
    ]
  },
  {
    level: 5,
    powerBonus: 25,
    xpMultiplier: 1.2,
    resourceMultiplier: 1.2,
    dailyCheckInBonus: 100,
    fusionCostReduction: 10,
    unlockedFeatures: ["PvP Arena", "Player Battles"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 20, description: "+20% XP from all sources" },
      { type: PassiveBonusType.POWER_MULTIPLIER, value: 5, description: "+5% power to all elements" }
    ]
  },
  {
    level: 6,
    powerBonus: 30,
    xpMultiplier: 1.25,
    resourceMultiplier: 1.25,
    dailyCheckInBonus: 150,
    fusionCostReduction: 12,
    unlockedFeatures: ["Advanced Missions"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 25, description: "+25% XP from all sources" },
      { type: PassiveBonusType.MISSION_SPEED, value: 10, description: "10% faster mission completion" }
    ]
  },
  {
    level: 7,
    powerBonus: 35,
    xpMultiplier: 1.3,
    resourceMultiplier: 1.3,
    dailyCheckInBonus: 200,
    fusionCostReduction: 15,
    unlockedFeatures: ["Epic Fusion"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 30, description: "+30% XP from all sources" },
      { type: PassiveBonusType.RESOURCE_GENERATION, value: 30, description: "+30% resources from all sources" }
    ]
  },
  {
    level: 8,
    powerBonus: 40,
    xpMultiplier: 1.35,
    resourceMultiplier: 1.35,
    dailyCheckInBonus: 250,
    fusionCostReduction: 18,
    unlockedFeatures: ["Marketplace Trading"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 35, description: "+35% XP from all sources" },
      { type: PassiveBonusType.MARKETPLACE_FEE_REDUCTION, value: 20, description: "20% reduction in marketplace fees" }
    ]
  },
  {
    level: 9,
    powerBonus: 45,
    xpMultiplier: 1.4,
    resourceMultiplier: 1.4,
    dailyCheckInBonus: 300,
    fusionCostReduction: 20,
    unlockedFeatures: ["Advanced Trading"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 40, description: "+40% XP from all sources" },
      { type: PassiveBonusType.POWER_MULTIPLIER, value: 10, description: "+10% power to all elements" }
    ]
  },
  {
    level: 10,
    powerBonus: 50,
    xpMultiplier: 1.5,
    resourceMultiplier: 1.5,
    dailyCheckInBonus: 500,
    fusionCostReduction: 25,
    unlockedFeatures: ["Alliance System", "Genesis Fusion", "Endgame Content"],
    passiveBonuses: [
      { type: PassiveBonusType.XP_BOOST, value: 50, description: "+50% XP from all sources" },
      { type: PassiveBonusType.POWER_MULTIPLIER, value: 15, description: "+15% power to all elements" },
      { type: PassiveBonusType.RESOURCE_GENERATION, value: 50, description: "+50% resources from all sources" }
    ]
  }
];

const UNLOCKED_FEATURES: UnlockedFeature[] = [
  { name: "Basic Gameplay", description: "Access to core game features", requiredLevel: 1, icon: "🎮", isUnlocked: true },
  { name: "Daily Check-in", description: "Daily rewards and streak bonuses", requiredLevel: 1, icon: "📅", isUnlocked: true },
  { name: "Element Collection", description: "Collect and manage elements", requiredLevel: 1, icon: "🧪", isUnlocked: true },
  { name: "Element Fusion", description: "Combine elements for upgrades", requiredLevel: 2, icon: "⚡", isUnlocked: false },
  { name: "Advanced Fusion", description: "More fusion combinations", requiredLevel: 3, icon: "🔮", isUnlocked: false },
  { name: "Batch Minting", description: "Mint multiple elements at once", requiredLevel: 4, icon: "📦", isUnlocked: false },
  { name: "PvP Arena", description: "Battle other players", requiredLevel: 5, icon: "⚔️", isUnlocked: false },
  { name: "Advanced Missions", description: "Access to harder missions", requiredLevel: 6, icon: "🎯", isUnlocked: false },
  { name: "Epic Fusion", description: "Create epic-level elements", requiredLevel: 7, icon: "💎", isUnlocked: false },
  { name: "Marketplace Trading", description: "Buy and sell elements", requiredLevel: 8, icon: "🏪", isUnlocked: false },
  { name: "Alliance System", description: "Join or create alliances", requiredLevel: 10, icon: "🤝", isUnlocked: false },
  { name: "Genesis Fusion", description: "Ultimate fusion capabilities", requiredLevel: 10, icon: "🌟", isUnlocked: false }
];

export default function BonusesPanel({ playerLevel, playerXp, className = "" }: BonusesPanelProps) {
  const [selectedTab, setSelectedTab] = useState<'current' | 'progression'>('current');
  
  // Calculate player bonuses
  const calculatePlayerBonuses = (): PlayerBonuses => {
    const activeBonuses = BASE_LEVEL_BONUSES.filter(bonus => bonus.level <= playerLevel);
    const nextLevelBonuses = BASE_LEVEL_BONUSES.find(bonus => bonus.level === playerLevel + 1) || null;
    
    const totalPowerBonus = activeBonuses.reduce((sum, bonus) => sum + bonus.powerBonus, 0);
    const totalXpMultiplier = activeBonuses.reduce((sum, bonus) => sum + (bonus.xpMultiplier - 1), 0) + 1;
    const totalResourceMultiplier = activeBonuses.reduce((sum, bonus) => sum + (bonus.resourceMultiplier - 1), 0) + 1;
    
    const unlockedFeatures = UNLOCKED_FEATURES.map(feature => ({
      ...feature,
      isUnlocked: feature.requiredLevel <= playerLevel
    }));
    
    const nextUnlock = UNLOCKED_FEATURES.find(feature => feature.requiredLevel > playerLevel) || null;
    
    return {
      currentLevel: playerLevel,
      totalPowerBonus,
      totalXpMultiplier,
      totalResourceMultiplier,
      activeBonuses,
      nextLevelBonuses,
      unlockedFeatures,
      nextUnlock
    };
  };

  const playerBonuses = calculatePlayerBonuses();

  const getBonusIcon = (type: PassiveBonusType) => {
    switch (type) {
      case PassiveBonusType.POWER_MULTIPLIER:
        return <BoltIcon className="w-4 h-4" />;
      case PassiveBonusType.XP_BOOST:
        return <SparklesIcon className="w-4 h-4" />;
      case PassiveBonusType.RESOURCE_GENERATION:
        return <CubeIcon className="w-4 h-4" />;
      case PassiveBonusType.FUSION_DISCOUNT:
        return <CurrencyDollarIcon className="w-4 h-4" />;
      case PassiveBonusType.MISSION_SPEED:
        return <ClockIcon className="w-4 h-4" />;
      case PassiveBonusType.MARKETPLACE_FEE_REDUCTION:
        return <ShieldCheckIcon className="w-4 h-4" />;
      default:
        return <StarIcon className="w-4 h-4" />;
    }
  };

  const getBonusColor = (type: PassiveBonusType) => {
    switch (type) {
      case PassiveBonusType.POWER_MULTIPLIER:
        return "text-yellow-400 bg-yellow-400/10";
      case PassiveBonusType.XP_BOOST:
        return "text-purple-400 bg-purple-400/10";
      case PassiveBonusType.RESOURCE_GENERATION:
        return "text-green-400 bg-green-400/10";
      case PassiveBonusType.FUSION_DISCOUNT:
        return "text-blue-400 bg-blue-400/10";
      case PassiveBonusType.MISSION_SPEED:
        return "text-orange-400 bg-orange-400/10";
      case PassiveBonusType.MARKETPLACE_FEE_REDUCTION:
        return "text-red-400 bg-red-400/10";
      default:
        return "text-gray-400 bg-gray-400/10";
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrophyIcon className="w-8 h-8 text-yellow-500" />
          <div>
            <h2 className="text-2xl font-bold text-white">Base Level Bonuses</h2>
            <p className="text-sm text-gray-400">Level {playerLevel} • {playerBonuses.activeBonuses.length} active bonuses</p>
          </div>
        </div>
        
        <div className="flex bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setSelectedTab('current')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedTab === 'current'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Current Bonuses
          </button>
          <button
            onClick={() => setSelectedTab('progression')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedTab === 'progression'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Progression
          </button>
        </div>
      </div>

      {selectedTab === 'current' ? (
        <div className="space-y-6">
          {/* Current Level Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-xl p-6 border border-blue-500/30"
          >
            <h3 className="text-xl font-bold text-white mb-4">Level {playerLevel} Summary</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <BoltIcon className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-gray-300">Power Bonus</span>
                </div>
                <div className="text-xl font-bold text-yellow-400">+{playerBonuses.totalPowerBonus}</div>
              </div>
              
              <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <SparklesIcon className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-gray-300">XP Multiplier</span>
                </div>
                <div className="text-xl font-bold text-purple-400">{playerBonuses.totalXpMultiplier.toFixed(2)}x</div>
              </div>
              
              <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <CubeIcon className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300">Resource Multiplier</span>
                </div>
                <div className="text-xl font-bold text-green-400">{playerBonuses.totalResourceMultiplier.toFixed(2)}x</div>
              </div>
              
              <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircleIcon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-300">Features Unlocked</span>
                </div>
                <div className="text-xl font-bold text-blue-400">
                  {playerBonuses.unlockedFeatures.filter(f => f.isUnlocked).length}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Active Passive Bonuses */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50"
          >
            <h3 className="text-lg font-bold text-white mb-4">Active Passive Bonuses</h3>
            
            <div className="space-y-3">
              {playerBonuses.activeBonuses.flatMap(bonus => bonus.passiveBonuses).map((bonus, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${getBonusColor(bonus.type)}`}
                >
                  {getBonusIcon(bonus.type)}
                  <div>
                    <div className="font-medium text-white">{bonus.description}</div>
                    <div className="text-sm text-gray-400">+{bonus.value}% bonus</div>
                  </div>
                </motion.div>
              ))}
              
              {playerBonuses.activeBonuses.flatMap(bonus => bonus.passiveBonuses).length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <GiftIcon className="w-12 h-12 mx-auto mb-2 text-gray-500" />
                  <p>No passive bonuses yet. Level up to unlock bonuses!</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Unlocked Features */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50"
          >
            <h3 className="text-lg font-bold text-white mb-4">Unlocked Features</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {playerBonuses.unlockedFeatures.map((feature, index) => (
                <motion.div
                  key={feature.name}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 * index }}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    feature.isUnlocked
                      ? 'bg-green-500/10 border-green-500/30 text-green-400'
                      : 'bg-gray-700/30 border-gray-600/30 text-gray-500'
                  }`}
                >
                  {feature.isUnlocked ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : (
                    <LockClosedIcon className="w-5 h-5" />
                  )}
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <span>{feature.icon}</span>
                      <span>{feature.name}</span>
                    </div>
                    <div className="text-sm opacity-80">{feature.description}</div>
                    {!feature.isUnlocked && (
                      <div className="text-xs mt-1">Requires Level {feature.requiredLevel}</div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Next Level Preview */}
          {playerBonuses.nextLevelBonuses && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 rounded-xl p-6 border border-green-500/30"
            >
              <div className="flex items-center gap-3 mb-4">
                <ArrowUpIcon className="w-6 h-6 text-green-400" />
                <h3 className="text-xl font-bold text-white">Next Level ({playerLevel + 1}) Rewards</h3>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-yellow-500/10 rounded-lg p-3 border border-yellow-500/20">
                  <div className="text-sm text-gray-300">Power Bonus</div>
                  <div className="text-lg font-bold text-yellow-400">
                    +{playerBonuses.nextLevelBonuses.powerBonus} 
                    <span className="text-sm ml-1">({playerBonuses.nextLevelBonuses.powerBonus - (playerBonuses.activeBonuses[playerLevel - 1]?.powerBonus || 0)} more)</span>
                  </div>
                </div>
                
                <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                  <div className="text-sm text-gray-300">XP Multiplier</div>
                  <div className="text-lg font-bold text-purple-400">
                    {playerBonuses.nextLevelBonuses.xpMultiplier.toFixed(2)}x
                  </div>
                </div>
                
                <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                  <div className="text-sm text-gray-300">Check-in Bonus</div>
                  <div className="text-lg font-bold text-blue-400">
                    +{playerBonuses.nextLevelBonuses.dailyCheckInBonus} XP
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-white">New Passive Bonuses:</h4>
                {playerBonuses.nextLevelBonuses.passiveBonuses.map((bonus, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    {getBonusIcon(bonus.type)}
                    <span className="text-gray-300">{bonus.description}</span>
                  </div>
                ))}
              </div>
              
              {playerBonuses.nextLevelBonuses.unlockedFeatures.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-white mb-2">New Features:</h4>
                  <div className="flex flex-wrap gap-2">
                    {playerBonuses.nextLevelBonuses.unlockedFeatures.map((feature, index) => (
                      <span key={index} className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Level Progression Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50"
          >
            <h3 className="text-lg font-bold text-white mb-4">Level Progression Overview</h3>
            
            <div className="space-y-4">
              {BASE_LEVEL_BONUSES.map((bonus, index) => (
                <motion.div
                  key={bonus.level}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                    bonus.level <= playerLevel
                      ? 'bg-blue-500/10 border-blue-500/30'
                      : bonus.level === playerLevel + 1
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-gray-700/20 border-gray-600/20'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    bonus.level <= playerLevel
                      ? 'bg-blue-500 text-white'
                      : bonus.level === playerLevel + 1
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-600 text-gray-400'
                  }`}>
                    {bonus.level}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-2">
                      <span className="font-medium text-white">Level {bonus.level}</span>
                      <span className="text-sm text-gray-400">+{bonus.powerBonus} Power</span>
                      <span className="text-sm text-gray-400">{bonus.xpMultiplier}x XP</span>
                      {bonus.dailyCheckInBonus > 0 && (
                        <span className="text-sm text-gray-400">+{bonus.dailyCheckInBonus} Daily XP</span>
                      )}
                    </div>
                    
                    {bonus.unlockedFeatures.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {bonus.unlockedFeatures.map((feature, featureIndex) => (
                          <span key={featureIndex} className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">
                            {feature}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {bonus.level <= playerLevel && (
                    <CheckCircleIcon className="w-5 h-5 text-green-400" />
                  )}
                  {bonus.level > playerLevel && (
                    <LockClosedIcon className="w-5 h-5 text-gray-500" />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
} 