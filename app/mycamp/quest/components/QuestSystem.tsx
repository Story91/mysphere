'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SEVEN_DAY_JOURNEY, QUEST_THEMES } from '../data/questData';
import { QuestDay, Quest, UserProgress } from '../types/quest';
import Quest3DCard from './Quest3DCard';
import HamburgerMenu from './HamburgerMenu';

const QuestSystem: React.FC = () => {
  const [currentDay, setCurrentDay] = useState(1);
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('journey');
  const [questData, setQuestData] = useState<QuestDay[]>(SEVEN_DAY_JOURNEY);
  const [userProgress, setUserProgress] = useState<UserProgress>({
    currentDay: 1,
    currentLevel: 1,
    totalXP: 0,
    totalTokens: 0,
    questsCompleted: 0,
    streakDays: 0,
    badges: [],
    completedQuests: [],
    inProgressQuests: [],
    achievements: [],
    socialConnections: [],
    nftsOwned: [],
    rank: 0,
    tier: 'bronze',
    joinedAt: new Date(),
    lastActiveAt: new Date(),
    preferences: {
      notifications: {
        questReminders: true,
        dailyRewards: true,
        socialUpdates: true,
        nftDrops: true
      },
      privacy: {
        showProgress: true,
        showBadges: true,
        allowInvites: true
      },
      display: {
        theme: 'dark',
        animations: true,
        effects3D: true,
        particles: true
      }
    }
  });

  const backgroundRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const getCurrentDayTheme = () => {
    return QUEST_THEMES[`day${currentDay}` as keyof typeof QUEST_THEMES] || QUEST_THEMES.day1;
  };

  const handleQuestStart = (questId: string) => {
    setQuestData(prev => 
      prev.map(day => ({
        ...day,
        quests: day.quests.map(quest => 
          quest.id === questId 
            ? { ...quest, status: 'in_progress' as const }
            : quest
        )
      }))
    );
    
    setUserProgress(prev => ({
      ...prev,
      inProgressQuests: [...prev.inProgressQuests, questId]
    }));
  };

  const handleQuestComplete = (questId: string) => {
    const quest = questData.flatMap(day => day.quests).find(q => q.id === questId);
    if (!quest) return;

    setQuestData(prev => 
      prev.map(day => ({
        ...day,
        quests: day.quests.map(q => 
          q.id === questId 
            ? { ...q, status: 'completed' as const, progress: { ...q.progress, completed: true, percentage: 100 } }
            : q
        )
      }))
    );
    
    setUserProgress(prev => ({
      ...prev,
      totalXP: prev.totalXP + quest.xpReward,
      totalTokens: prev.totalTokens + quest.tokenReward,
      questsCompleted: prev.questsCompleted + 1,
      completedQuests: [...prev.completedQuests, questId],
      inProgressQuests: prev.inProgressQuests.filter(id => id !== questId)
    }));
  };

  const handleNavigation = (section: string) => {
    setActiveSection(section);
  };

  const renderDayNavigation = () => (
    <div className="flex justify-center mb-8">
      <div className="flex gap-2 bg-black/40 backdrop-blur-xl p-2 rounded-2xl border border-white/20">
        {questData.map((day, index) => (
          <motion.button
            key={day.day}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCurrentDay(day.day)}
            className={`
              relative px-4 py-2 rounded-xl font-bold text-sm transition-all duration-300
              ${currentDay === day.day 
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white' 
                : 'text-white/70 hover:text-white hover:bg-white/10'
              }
            `}
          >
            <span className="relative z-10">Day {day.day}</span>
            
            {day.unlocked && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-black" />
            )}
            
            {currentDay === day.day && (
              <motion.div
                layoutId="dayHighlight"
                className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 rounded-xl"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );

  const renderQuestJourney = () => {
    const currentDayData = questData.find(day => day.day === currentDay);
    if (!currentDayData) return null;

    const theme = getCurrentDayTheme();

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="space-y-8"
      >
        {/* Day Header */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-center relative"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent blur-3xl" />
          
          <div className="relative z-10 bg-gradient-to-br from-black/80 via-gray-900/80 to-slate-900/80 backdrop-blur-xl border border-white/20 rounded-3xl p-8">
            <motion.h1
              animate={{ 
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-4xl md:text-6xl font-black mb-4 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent bg-[length:200%_100%]"
            >
              {currentDayData.title}
            </motion.h1>
            
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-xl text-white/80 mb-4"
            >
              {currentDayData.description}
            </motion.p>
            
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">🎯</span>
                <span className="text-white/70">{currentDayData.quests.length} Quests</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">⚡</span>
                <span className="text-white/70">
                  {currentDayData.quests.reduce((sum, q) => sum + q.xpReward, 0)} XP
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-400">🪙</span>
                <span className="text-white/70">
                  {currentDayData.quests.reduce((sum, q) => sum + q.tokenReward, 0)} CAMP
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quest Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {currentDayData.quests.map((quest, index) => (
            <Quest3DCard
              key={quest.id}
              quest={quest}
              index={index}
              onStart={handleQuestStart}
              onComplete={handleQuestComplete}
              isActive={selectedQuest?.id === quest.id}
            />
          ))}
        </div>

        {/* Day Special Reward */}
        {currentDayData.specialReward && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-center"
          >
            <div className="bg-gradient-to-br from-purple-900/50 via-pink-900/50 to-orange-900/50 backdrop-blur-xl border border-purple-500/30 rounded-3xl p-8">
              <h3 className="text-2xl font-bold text-white mb-4">
                🎁 Day {currentDay} Special Reward
              </h3>
              <div className="flex items-center justify-center gap-4 mb-4">
                <span className="text-4xl">{currentDayData.specialReward.icon}</span>
                <div>
                  <h4 className="text-xl font-bold text-white">{currentDayData.specialReward.title}</h4>
                  <p className="text-white/70">{currentDayData.specialReward.description}</p>
                </div>
              </div>
              <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white`}>
                {currentDayData.specialReward.rarity.toUpperCase()}
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    );
  };

  const renderDashboard = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="space-y-6"
    >
      <div className="text-center">
        <h2 className="text-4xl font-bold text-white mb-4">Quest Dashboard</h2>
        <p className="text-white/70">Track your epic journey through Camp Network</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-cyan-500/20 to-blue-600/20 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-2">{userProgress.totalXP.toLocaleString()}</div>
            <div className="text-white/70">Total XP</div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-green-500/20 to-emerald-600/20 backdrop-blur-xl border border-green-500/30 rounded-2xl p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400 mb-2">{userProgress.questsCompleted}</div>
            <div className="text-white/70">Quests Completed</div>
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-orange-500/20 to-red-600/20 backdrop-blur-xl border border-orange-500/30 rounded-2xl p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-400 mb-2">{userProgress.streakDays}</div>
            <div className="text-white/70">Day Streak</div>
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return renderDashboard();
      case 'journey':
        return renderQuestJourney();
      default:
        return (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🚧</div>
            <h2 className="text-2xl font-bold text-white mb-2">Coming Soon</h2>
            <p className="text-white/70">This section is under development</p>
          </div>
        );
    }
  };

  const theme = getCurrentDayTheme();

  return (
    <div className={`min-h-screen relative overflow-hidden bg-gradient-to-br ${theme.bgGradient}`}>
      {/* Dynamic Background */}
      <div 
        ref={backgroundRef}
        className="absolute inset-0 transition-all duration-1000"
        style={{
          background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(56, 189, 248, 0.1) 0%, transparent 50%)`
        }}
      />

      {/* 3D Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(56,189,248,0.03)_25%,rgba(56,189,248,0.03)_26%,transparent_27%,transparent_74%,rgba(56,189,248,0.03)_75%,rgba(56,189,248,0.03)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(56,189,248,0.03)_25%,rgba(56,189,248,0.03)_26%,transparent_27%,transparent_74%,rgba(56,189,248,0.03)_75%,rgba(56,189,248,0.03)_76%,transparent_77%,transparent)] bg-[length:50px_50px] opacity-40" />

      {/* Floating Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0,
              scale: 0,
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight
            }}
            animate={{ 
              opacity: [0, 0.6, 0],
              scale: [0, 1, 0],
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight
            }}
            transition={{
              duration: 6 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 3,
              ease: "easeInOut"
            }}
            className="absolute w-2 h-2 bg-cyan-400 rounded-full"
          />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 p-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Hamburger Menu Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="relative p-3 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 backdrop-blur-xl border border-cyan-500/30 rounded-xl hover:from-cyan-500/30 hover:to-blue-600/30 transition-all duration-300"
          >
            <motion.div
              animate={{ rotate: isMenuOpen ? 45 : 0 }}
              transition={{ duration: 0.2 }}
              className="w-6 h-6 flex flex-col justify-center space-y-1"
            >
              <motion.div
                animate={{ 
                  width: isMenuOpen ? "100%" : "100%",
                  rotate: isMenuOpen ? 45 : 0,
                  y: isMenuOpen ? 8 : 0
                }}
                transition={{ duration: 0.2 }}
                className="h-0.5 bg-white rounded-full"
              />
              <motion.div
                animate={{ 
                  opacity: isMenuOpen ? 0 : 1,
                  width: isMenuOpen ? "0%" : "75%"
                }}
                transition={{ duration: 0.2 }}
                className="h-0.5 bg-white rounded-full"
              />
              <motion.div
                animate={{ 
                  width: isMenuOpen ? "100%" : "50%",
                  rotate: isMenuOpen ? -45 : 0,
                  y: isMenuOpen ? -8 : 0
                }}
                transition={{ duration: 0.2 }}
                className="h-0.5 bg-white rounded-full"
              />
            </motion.div>
          </motion.button>

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-2xl md:text-3xl font-black text-white">
              🏕️ <span className="bg-gradient-to-r from-cyan-400 to-blue-600 bg-clip-text text-transparent">Camp Quest</span>
            </h1>
            <p className="text-white/60 text-sm">Epic 7-Day Journey</p>
          </motion.div>

          {/* User Progress */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-gradient-to-r from-purple-500/20 to-pink-600/20 backdrop-blur-xl border border-purple-500/30 rounded-xl p-3"
          >
            <div className="flex items-center gap-3 text-sm">
              <div className="text-center">
                <div className="text-white font-bold">{userProgress.totalXP.toLocaleString()}</div>
                <div className="text-white/60 text-xs">XP</div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold">{userProgress.questsCompleted}</div>
                <div className="text-white/60 text-xs">Quests</div>
              </div>
              <div className="text-center">
                <div className="text-white font-bold">{userProgress.streakDays}</div>
                <div className="text-white/60 text-xs">Streak</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        {activeSection === 'journey' && renderDayNavigation()}
        {renderContent()}
      </div>

      {/* Hamburger Menu */}
      <HamburgerMenu
        isOpen={isMenuOpen}
        onToggle={() => setIsMenuOpen(!isMenuOpen)}
        onNavigate={handleNavigation}
        userProgress={{
          currentDay: userProgress.currentDay,
          totalXP: userProgress.totalXP,
          questsCompleted: userProgress.questsCompleted,
          streakDays: userProgress.streakDays,
          tier: userProgress.tier
        }}
      />
    </div>
  );
};

export default QuestSystem; 