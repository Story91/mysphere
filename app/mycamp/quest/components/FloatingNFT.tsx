'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QuestReward } from '../types/quest';

interface FloatingNFTProps {
  reward: QuestReward;
  isVisible: boolean;
  onClaim?: () => void;
  position?: { x: number; y: number; z: number };
}

const FloatingNFT: React.FC<FloatingNFTProps> = ({ 
  reward, 
  isVisible, 
  onClaim,
  position = { x: 0, y: 0, z: 0 }
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);
  const [particlesActive, setParticlesActive] = useState(false);
  const nftRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && !isClaimed) {
      setParticlesActive(true);
      const timer = setTimeout(() => setParticlesActive(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, isClaimed]);

  const handleClaim = () => {
    if (!isClaimed && onClaim) {
      setIsClaimed(true);
      onClaim();
      
      // Trigger celebration effect
      setParticlesActive(true);
      setTimeout(() => setParticlesActive(false), 3000);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'from-gray-400 to-slate-600';
      case 'rare': return 'from-blue-400 to-cyan-600';
      case 'epic': return 'from-purple-400 to-pink-600';
      case 'legendary': return 'from-yellow-400 via-orange-500 to-red-600';
      default: return 'from-gray-400 to-slate-600';
    }
  };

  const getRarityGlow = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'rgba(148, 163, 184, 0.5)';
      case 'rare': return 'rgba(56, 189, 248, 0.5)';
      case 'epic': return 'rgba(168, 85, 247, 0.5)';
      case 'legendary': return 'rgba(251, 191, 36, 0.8)';
      default: return 'rgba(148, 163, 184, 0.5)';
    }
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={nftRef}
        initial={{ 
          opacity: 0, 
          scale: 0,
          rotateY: -180,
          y: 100
        }}
        animate={{ 
          opacity: 1, 
          scale: 1,
          rotateY: 0,
          y: 0
        }}
        exit={{ 
          opacity: 0, 
          scale: 0.5,
          rotateY: 180,
          y: -100
        }}
        transition={{ 
          duration: 1,
          ease: "easeOut",
          type: "spring",
          stiffness: 300,
          damping: 30
        }}
        style={{
          transformStyle: "preserve-3d",
          position: 'absolute',
          left: position.x,
          top: position.y,
          zIndex: position.z,
        }}
        className="pointer-events-auto"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Holographic Glow Base */}
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.8, 0.3]
          }}
          transition={{ 
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute inset-0 rounded-3xl blur-2xl"
          style={{ 
            background: `radial-gradient(circle, ${getRarityGlow(reward.rarity)} 0%, transparent 70%)`,
            transform: "translateZ(-20px) scale(1.5)"
          }}
        />

        {/* Main NFT Container */}
        <motion.div
          animate={{ 
            rotateY: [0, 360],
            rotateX: isHovered ? [0, 10, -10, 0] : 0,
          }}
          transition={{ 
            rotateY: { duration: 8, repeat: Infinity, ease: "linear" },
            rotateX: { duration: 2, repeat: Infinity, ease: "easeInOut" }
          }}
          className="relative w-64 h-80 bg-gradient-to-br from-black/90 via-gray-900/90 to-slate-900/90 backdrop-blur-xl border-2 rounded-3xl overflow-hidden"
          style={{ 
            borderImage: `linear-gradient(45deg, ${getRarityColor(reward.rarity)}) 1`,
            boxShadow: `0 0 30px ${getRarityGlow(reward.rarity)}`
          }}
        >
          {/* Animated Border */}
          <motion.div
            animate={{ 
              background: [
                `conic-gradient(from 0deg, ${getRarityColor(reward.rarity)}, transparent, ${getRarityColor(reward.rarity)})`,
                `conic-gradient(from 360deg, ${getRarityColor(reward.rarity)}, transparent, ${getRarityColor(reward.rarity)})`,
              ]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 p-[3px] rounded-3xl"
          >
            <div className="w-full h-full rounded-3xl bg-gradient-to-br from-black/95 via-gray-900/95 to-slate-900/95" />
          </motion.div>

          {/* Content */}
          <div className="relative z-10 p-6 h-full flex flex-col items-center justify-center text-center">
            {/* NFT Icon */}
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                rotateZ: isHovered ? [0, 5, -5, 0] : 0
              }}
              transition={{ 
                scale: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                rotateZ: { duration: 1, repeat: Infinity, ease: "easeInOut" }
              }}
              className="text-8xl mb-4 filter drop-shadow-2xl"
            >
              {reward.icon}
            </motion.div>

            {/* Title */}
            <h3 className="text-2xl font-bold text-white mb-2">
              {reward.title}
            </h3>

            {/* Description */}
            <p className="text-white/70 text-sm mb-4 leading-relaxed">
              {reward.description}
            </p>

            {/* Rarity Badge */}
            <motion.div
              animate={{ 
                scale: reward.rarity === 'legendary' ? [1, 1.1, 1] : 1,
                boxShadow: reward.rarity === 'legendary' ? [
                  '0 0 20px rgba(251, 191, 36, 0.5)',
                  '0 0 40px rgba(251, 191, 36, 0.8)',
                  '0 0 20px rgba(251, 191, 36, 0.5)'
                ] : 'none'
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className={`
                px-4 py-2 rounded-full text-sm font-bold mb-6
                bg-gradient-to-r ${getRarityColor(reward.rarity)}
                ${reward.rarity === 'legendary' ? 'animate-pulse' : ''}
              `}
            >
              {reward.rarity.toUpperCase()}
            </motion.div>

            {/* Claim Button */}
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleClaim}
              disabled={isClaimed}
              className={`
                px-8 py-3 rounded-xl font-bold text-sm transition-all duration-300
                ${isClaimed 
                  ? 'bg-green-500/50 text-green-200 cursor-default' 
                  : `bg-gradient-to-r ${getRarityColor(reward.rarity)} text-white hover:scale-105`
                }
              `}
            >
              {isClaimed ? '✅ Claimed' : '🎁 Claim NFT'}
            </motion.button>

            {/* Contract Address (for verification) */}
            {reward.nftContract && (
              <div className="mt-4 text-xs text-white/40 font-mono">
                {reward.nftContract.substring(0, 8)}...{reward.nftContract.substring(reward.nftContract.length - 6)}
              </div>
            )}
          </div>

          {/* Holographic Shine Effect */}
          <motion.div
            animate={{ 
              x: [-100, 400],
              opacity: [0, 0.8, 0]
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: Math.random() * 2
            }}
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 rounded-3xl"
            style={{ transform: "translateZ(10px)" }}
          />

          {/* Status Indicator */}
          <div className="absolute top-4 right-4">
            <motion.div
              animate={{ 
                scale: [1, 1.3, 1],
                opacity: [0.7, 1, 0.7]
              }}
              transition={{ 
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className={`
                w-4 h-4 rounded-full
                ${isClaimed ? 'bg-green-400' : 'bg-yellow-400'}
              `}
            />
          </div>
        </motion.div>

        {/* Celebration Particles */}
        <AnimatePresence>
          {particlesActive && (
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(30)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ 
                    opacity: 0,
                    scale: 0,
                    x: 0,
                    y: 0,
                    z: 0
                  }}
                  animate={{ 
                    opacity: [0, 1, 0],
                    scale: [0, 1.5, 0],
                    x: (Math.random() - 0.5) * 400,
                    y: (Math.random() - 0.5) * 400,
                    z: Math.random() * 100
                  }}
                  transition={{
                    duration: 2 + Math.random(),
                    delay: Math.random() * 0.5,
                    ease: "easeOut"
                  }}
                  className="absolute w-3 h-3 rounded-full"
                  style={{ 
                    background: getRarityGlow(reward.rarity),
                    transform: `translate3d(var(--tw-translate-x), var(--tw-translate-y), ${Math.random() * 50}px)`
                  }}
                />
              ))}
            </div>
          )}
        </AnimatePresence>

        {/* Floating Info Panel */}
        <AnimatePresence>
          {isHovered && !isClaimed && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: -10, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute -bottom-16 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-xl border border-white/20 rounded-xl p-3 text-center min-w-max"
            >
              <div className="text-white text-sm font-medium">
                Click to claim your {reward.rarity} NFT!
              </div>
              <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-black/90 absolute -top-4 left-1/2 -translate-x-1/2" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default FloatingNFT; 