'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

interface HamburgerMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: (section: string) => void;
  userProgress: {
    currentDay: number;
    totalXP: number;
    questsCompleted: number;
    streakDays: number;
    tier: string;
  };
}

const HamburgerMenu: React.FC<HamburgerMenuProps> = ({ 
  isOpen, 
  onToggle, 
  onNavigate, 
  userProgress 
}) => {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onToggle();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onToggle]);

  if (!isMounted) return null;

  const menuItems = [
    {
      id: 'dashboard',
      title: 'Quest Dashboard',
      icon: '🎯',
      description: 'View your progress',
      gradient: 'from-blue-500 to-cyan-500',
      particles: 'blue'
    },
    {
      id: 'journey',
      title: '7-Day Journey',
      icon: '🗺️',
      description: 'Epic adventure path',
      gradient: 'from-purple-500 to-pink-500',
      particles: 'purple'
    },
    {
      id: 'nft-gallery',
      title: 'NFT Gallery',
      icon: '🎨',
      description: 'Your digital collection',
      gradient: 'from-orange-500 to-red-500',
      particles: 'orange'
    },
    {
      id: 'leaderboard',
      title: 'Leaderboard',
      icon: '🏆',
      description: 'Global rankings',
      gradient: 'from-yellow-500 to-orange-500',
      particles: 'yellow'
    },
    {
      id: 'badges',
      title: 'Badge Collection',
      icon: '🥇',
      description: 'Earned achievements',
      gradient: 'from-green-500 to-teal-500',
      particles: 'green'
    },
    {
      id: 'social-hub',
      title: 'Social Hub',
      icon: '🌐',
      description: 'Connect & share',
      gradient: 'from-indigo-500 to-purple-500',
      particles: 'indigo'
    },
    {
      id: 'settings',
      title: 'Settings',
      icon: '⚙️',
      description: 'Customize experience',
      gradient: 'from-gray-500 to-slate-500',
      particles: 'gray'
    }
  ];

  const handleNavigation = (itemId: string) => {
    setActiveSection(itemId);
    onNavigate(itemId);
    setTimeout(() => {
      onToggle();
    }, 300);
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
          />

          {/* Menu Container */}
          <motion.div
            ref={menuRef}
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 30,
              duration: 0.4
            }}
            className="fixed top-0 left-0 z-[9999] w-96 h-full max-w-[90vw] bg-gradient-to-br from-black/95 via-gray-900/95 to-slate-900/95 backdrop-blur-xl border-r border-white/10"
          >
            {/* Futuristic Background Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%)] bg-[length:20px_20px] opacity-50" />
            
            {/* Animated Glow Effect */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"
            />

            {/* Header Section */}
            <div className="relative p-6 pb-4 border-b border-white/10">
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="flex items-center justify-between mb-4"
              >
                <div className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-blue-600 rounded-full flex items-center justify-center"
                  >
                    <span className="text-white text-sm font-bold">Q</span>
                  </motion.div>
                  <h2 className="text-xl font-bold text-white">Quest Hub</h2>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onToggle}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all duration-200"
                >
                  ✕
                </motion.button>
              </motion.div>

              {/* User Progress Mini Card */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-cyan-400 text-sm font-medium">Day {userProgress.currentDay}</span>
                  <span className="text-white/60 text-xs">{userProgress.tier} Tier</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-yellow-400">⚡</span>
                    <span className="text-white">{userProgress.totalXP.toLocaleString()} XP</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-green-400">🎯</span>
                    <span className="text-white">{userProgress.questsCompleted}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-orange-400">🔥</span>
                    <span className="text-white">{userProgress.streakDays}d</span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Navigation Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {menuItems.map((item, index) => (
                <motion.button
                  key={item.id}
                  initial={{ x: -50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.1 + index * 0.05, duration: 0.3 }}
                  whileHover={{ 
                    scale: 1.02, 
                    x: 8,
                    transition: { duration: 0.2 }
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleNavigation(item.id)}
                  className={`w-full group relative overflow-hidden rounded-xl p-4 transition-all duration-300 ${
                    activeSection === item.id 
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30' 
                      : 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Animated Background */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    whileHover={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className={`absolute inset-0 bg-gradient-to-r ${item.gradient} opacity-10 rounded-xl`}
                  />

                  {/* Content */}
                  <div className="relative z-10 flex items-center gap-4">
                    <motion.div
                      whileHover={{ scale: 1.2, rotate: 10 }}
                      transition={{ duration: 0.2 }}
                      className="text-2xl"
                    >
                      {item.icon}
                    </motion.div>
                    
                    <div className="flex-1 text-left">
                      <h3 className="text-white font-medium text-sm mb-1">
                        {item.title}
                      </h3>
                      <p className="text-white/50 text-xs">
                        {item.description}
                      </p>
                    </div>

                    {/* Arrow indicator */}
                    <motion.div
                      initial={{ x: -10, opacity: 0 }}
                      whileHover={{ x: 0, opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-white/30 text-sm"
                    >
                      →
                    </motion.div>
                  </div>

                  {/* Hover glow effect */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    whileHover={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-xl"
                  />
                </motion.button>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="text-center text-white/30 text-xs"
              >
                Quest System v3.0
                <br />
                <span className="text-cyan-400">Camp Network</span>
              </motion.div>
            </div>

            {/* Ambient Particle Effects */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ 
                    opacity: 0, 
                    scale: 0,
                    x: Math.random() * 400,
                    y: Math.random() * 800
                  }}
                  animate={{ 
                    opacity: [0, 0.3, 0],
                    scale: [0, 1, 0],
                    x: Math.random() * 400,
                    y: Math.random() * 800
                  }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    repeat: Infinity,
                    delay: Math.random() * 2
                  }}
                  className="absolute w-1 h-1 bg-cyan-400 rounded-full"
                />
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default HamburgerMenu; 