'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { Quest } from '../types/quest';

interface Quest3DCardProps {
  quest: Quest;
  isActive?: boolean;
  onComplete?: (questId: string) => void;
  onStart?: (questId: string) => void;
  index: number;
}

const Quest3DCard: React.FC<Quest3DCardProps> = ({ 
  quest, 
  isActive = false, 
  onComplete, 
  onStart, 
  index 
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [particleCount, setParticleCount] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Motion values for 3D effects
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 300, damping: 30 });
  const scale = useSpring(useMotionValue(1), { stiffness: 300, damping: 30 });

  useEffect(() => {
    if (quest.status === 'completed') {
      setParticleCount(20);
      setTimeout(() => setParticleCount(0), 3000);
    }
  }, [quest.status]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = event.clientX - centerX;
    const mouseY = event.clientY - centerY;

    x.set(mouseX);
    y.set(mouseY);

    rotateX.set(mouseY * -0.05);
    rotateY.set(mouseX * 0.05);
    scale.set(1.02);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rotateX.set(0);
    rotateY.set(0);
    scale.set(1);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'from-green-400 to-emerald-600';
      case 'medium': return 'from-yellow-400 to-orange-600';
      case 'hard': return 'from-red-400 to-pink-600';
      case 'legendary': return 'from-purple-400 via-pink-500 to-yellow-500';
      default: return 'from-gray-400 to-slate-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'from-green-400 to-emerald-600';
      case 'in_progress': return 'from-blue-400 to-cyan-600';
      case 'available': return 'from-cyan-400 to-blue-600';
      case 'locked': return 'from-gray-400 to-slate-600';
      default: return 'from-gray-400 to-slate-600';
    }
  };

  const handleAction = () => {
    if (quest.status === 'available' || quest.status === 'in_progress') {
      onStart?.(quest.id);
    } else if (quest.status === 'completed') {
      onComplete?.(quest.id);
    }
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ 
        opacity: 0, 
        y: 50,
        rotateX: -20,
        scale: 0.8
      }}
      animate={{ 
        opacity: 1, 
        y: 0,
        rotateX: 0,
        scale: 1
      }}
      transition={{ 
        delay: index * 0.1,
        duration: 0.6,
        ease: "easeOut"
      }}
      style={{
        rotateX,
        rotateY,
        scale,
        transformStyle: "preserve-3d"
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className={`
        relative w-full h-80 cursor-pointer select-none
        ${isActive ? 'z-10' : 'z-0'}
      `}
    >
      {/* Holographic Background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 rounded-2xl blur-xl"
        style={{ transform: "translateZ(-10px)" }}
      />

      {/* Main Card */}
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
        className="relative w-full h-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front of card */}
        <div 
          className="absolute inset-0 backface-hidden"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div className={`
            relative w-full h-full rounded-2xl overflow-hidden
            bg-gradient-to-br from-black/80 via-gray-900/80 to-slate-900/80
            backdrop-blur-xl border border-white/20
            ${quest.status === 'locked' ? 'grayscale' : ''}
          `}>
            
            {/* Animated border */}
            <motion.div
              initial={{ opacity: 0.5 }}
              animate={{ opacity: isHovered ? 1 : 0.5 }}
              className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${getStatusColor(quest.status)} p-[2px]`}
            >
              <div className="w-full h-full rounded-2xl bg-gradient-to-br from-black/90 via-gray-900/90 to-slate-900/90" />
            </motion.div>

            {/* Content */}
            <div className="relative z-10 p-6 h-full flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <motion.div
                  whileHover={{ scale: 1.2, rotate: 10 }}
                  transition={{ duration: 0.2 }}
                  className="text-4xl"
                >
                  {quest.icon}
                </motion.div>

                <div className="flex flex-col items-end gap-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                    className={`
                      px-3 py-1 rounded-full text-xs font-bold
                      bg-gradient-to-r ${getDifficultyColor(quest.difficulty)}
                      ${quest.difficulty === 'legendary' ? 'animate-pulse' : ''}
                    `}
                  >
                    {quest.difficulty.toUpperCase()}
                  </motion.div>

                  <div className="text-xs text-white/60">
                    Day {quest.day}
                  </div>
                </div>
              </div>

              {/* Title and Description */}
              <div className="flex-1 mb-4">
                <h3 className="text-xl font-bold text-white mb-2">
                  {quest.title}
                </h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  {quest.shortDescription}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-white/60">Progress</span>
                  <span className="text-xs text-white/60">
                    {quest.progress.percentage}%
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${quest.progress.percentage}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={`h-full bg-gradient-to-r ${quest.gradient} rounded-full`}
                  />
                </div>
              </div>

              {/* Rewards */}
              <div className="mb-4">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-yellow-400">⚡</span>
                    <span className="text-white">{quest.xpReward} XP</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-green-400">🪙</span>
                    <span className="text-white">{quest.tokenReward} CAMP</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-blue-400">⏱️</span>
                    <span className="text-white/60">{quest.estimatedTime}</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAction}
                disabled={quest.status === 'locked'}
                className={`
                  w-full py-3 px-4 rounded-xl font-bold text-sm
                  transition-all duration-300 relative overflow-hidden
                  ${quest.status === 'locked' 
                    ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed' 
                    : quest.status === 'completed'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-400 hover:to-emerald-500'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500'
                  }
                `}
              >
                {quest.status === 'locked' && '🔒 Locked'}
                {quest.status === 'available' && '🚀 Start Quest'}
                {quest.status === 'in_progress' && '⏳ Continue'}
                {quest.status === 'completed' && '✅ Completed'}
                {quest.status === 'failed' && '❌ Failed'}

                {/* Button glow effect */}
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  whileHover={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 bg-gradient-to-r from-white/20 via-white/10 to-white/20 rounded-xl"
                />
              </motion.button>
            </div>

            {/* Completion particles */}
            <AnimatePresence>
              {quest.status === 'completed' && (
                <div className="absolute inset-0 pointer-events-none">
                  {[...Array(particleCount)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ 
                        opacity: 0,
                        scale: 0,
                        x: Math.random() * 300,
                        y: Math.random() * 300
                      }}
                      animate={{ 
                        opacity: [0, 1, 0],
                        scale: [0, 1, 0],
                        x: Math.random() * 300,
                        y: Math.random() * 300
                      }}
                      transition={{
                        duration: 2,
                        delay: Math.random() * 0.5
                      }}
                      className="absolute w-2 h-2 bg-yellow-400 rounded-full"
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>

            {/* Status indicator */}
            <div className="absolute top-4 right-4">
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  opacity: [0.7, 1, 0.7]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className={`
                  w-3 h-3 rounded-full
                  ${quest.status === 'available' ? 'bg-cyan-400' : ''}
                  ${quest.status === 'in_progress' ? 'bg-blue-400' : ''}
                  ${quest.status === 'completed' ? 'bg-green-400' : ''}
                  ${quest.status === 'locked' ? 'bg-gray-400' : ''}
                  ${quest.status === 'failed' ? 'bg-red-400' : ''}
                `}
              />
            </div>

            {/* Flip indicator */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsFlipped(!isFlipped)}
              className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all duration-200"
            >
              ℹ️
            </motion.button>
          </div>
        </div>

        {/* Back of card */}
        <div 
          className="absolute inset-0 backface-hidden"
          style={{ 
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)"
          }}
        >
          <div className="relative w-full h-full rounded-2xl overflow-hidden bg-gradient-to-br from-black/90 via-gray-900/90 to-slate-900/90 backdrop-blur-xl border border-white/20">
            
            {/* Back content */}
            <div className="relative z-10 p-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Quest Details</h3>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsFlipped(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all duration-200"
                >
                  ←
                </motion.button>
              </div>

              <div className="flex-1 space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Full Description</h4>
                  <p className="text-white/70 text-sm leading-relaxed">
                    {quest.description}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Requirements</h4>
                  <div className="space-y-2">
                    {quest.requirements.map((req, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${req.current >= req.target ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className="text-white/60 text-sm">
                          {req.description} ({req.current}/{req.target})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {quest.unlockConditions && quest.unlockConditions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">Unlock Conditions</h4>
                    <div className="space-y-1">
                      {quest.unlockConditions.map((condition, i) => (
                        <div key={i} className="text-white/60 text-sm">
                          {condition.dayRequired && `Complete Day ${condition.dayRequired}`}
                          {condition.questId && `Complete quest: ${condition.questId}`}
                          {condition.socialConnected && `Connect ${condition.socialConnected}`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Quest3DCard; 