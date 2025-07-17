'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Shield, Zap, Star, Ticket, Package, Sparkles } from 'lucide-react';

interface PrizeRevealAnimationProps {
  isRevealing: boolean;
  finalPrize?: {
    type: string;
    value: number;
    rarity: string;
  } | null;
  onRevealComplete?: () => void;
}

// Prize configuration for animation
const PRIZE_ICONS = {
  'NFT': { icon: Trophy, color: 'text-yellow-400', gradient: 'from-yellow-400 to-yellow-600' },
  'Achievement Voucher': { icon: Ticket, color: 'text-purple-400', gradient: 'from-purple-400 to-purple-600' },
  'Streak Saver': { icon: Shield, color: 'text-blue-400', gradient: 'from-blue-400 to-blue-600' },
  'Boost': { icon: Zap, color: 'text-green-400', gradient: 'from-green-400 to-green-600' },
  'Respect Points': { icon: Star, color: 'text-pink-400', gradient: 'from-pink-400 to-pink-600' },
  'Nothing': { icon: Package, color: 'text-gray-400', gradient: 'from-gray-400 to-gray-600' }
};

const SLOT_ITEMS = Object.keys(PRIZE_ICONS);

export default function PrizeRevealAnimation({ 
  isRevealing, 
  finalPrize, 
  onRevealComplete 
}: PrizeRevealAnimationProps) {
  const [slotState, setSlotState] = useState<'spinning' | 'stopping' | 'revealed'>('spinning');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [spinSpeed, setSpinSpeed] = useState(100);

  useEffect(() => {
    if (!isRevealing) {
      setSlotState('spinning');
      setCurrentIndex(0);
      setSpinSpeed(100);
      return;
    }

    let interval: NodeJS.Timeout;
    let timeout1: NodeJS.Timeout;
    let timeout2: NodeJS.Timeout;
    let emergencyTimeout: NodeJS.Timeout;

    // Phase 1: Fast spinning (2 seconds)
    setSlotState('spinning');
    interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % SLOT_ITEMS.length);
    }, spinSpeed);

    // Phase 2: Start slowing down (after 2 seconds)
    timeout1 = setTimeout(() => {
      setSpinSpeed(200);
      clearInterval(interval);
      interval = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % SLOT_ITEMS.length);
      }, 200);
    }, 2000);

    // Phase 3: Final slow down and reveal (after 3.5 seconds)
    timeout2 = setTimeout(() => {
      setSlotState('stopping');
      clearInterval(interval);
      
      // Map prize type to slot item
      const mapPrizeToSlotItem = (prizeType: string): string => {
        if (prizeType.includes('NFT') || prizeType === 'Legendary NFT') return 'NFT';
        if (prizeType.includes('Achievement Voucher')) return 'Achievement Voucher';
        if (prizeType.includes('Streak Saver')) return 'Streak Saver';
        if (prizeType.includes('Boost')) return 'Boost';
        if (prizeType.includes('Respect Points')) return 'Respect Points';
        if (prizeType === 'Nothing') return 'Nothing';
        return 'Nothing'; // fallback
      };
      
      // Find the final prize index with proper mapping
      const mappedPrizeType = finalPrize ? mapPrizeToSlotItem(finalPrize.type) : 'Nothing';
      const finalIndex = SLOT_ITEMS.indexOf(mappedPrizeType);
      
      console.log('🎰 Animation final phase:', {
        originalPrizeType: finalPrize?.type,
        mappedPrizeType,
        finalIndex,
        slotItems: SLOT_ITEMS,
        currentPos: currentIndex
      });
      
      // Emergency fallback if still not found
      const safeIndex = finalIndex >= 0 ? finalIndex : SLOT_ITEMS.indexOf('Nothing');
      
      // Slow reveal to final position
      let currentPos = currentIndex;
      let attempts = 0;
      const maxAttempts = SLOT_ITEMS.length * 2; // Safety limit
      
      const slowInterval = setInterval(() => {
        currentPos = (currentPos + 1) % SLOT_ITEMS.length;
        setCurrentIndex(currentPos);
        attempts++;
        
        console.log(`🎰 Slot position: ${currentPos}, target: ${safeIndex}, attempts: ${attempts}`);
        
        if (currentPos === safeIndex || attempts >= maxAttempts) {
          clearInterval(slowInterval);
          setSlotState('revealed');
          console.log('🎰 Animation completed:', { currentPos, safeIndex, attempts });
          setTimeout(() => onRevealComplete?.(), 1000);
        }
      }, 400);
      
    }, 3500);

    // Emergency timeout - force completion after 10 seconds max
    emergencyTimeout = setTimeout(() => {
      console.warn('🚨 Animation emergency timeout triggered!');
      setSlotState('revealed');
      onRevealComplete?.();
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(emergencyTimeout);
    };
  }, [isRevealing, finalPrize, onRevealComplete]);

  if (!isRevealing) return null;

  const currentPrize = SLOT_ITEMS[currentIndex];
  const prizeConfig = PRIZE_ICONS[currentPrize as keyof typeof PRIZE_ICONS];
  const Icon = prizeConfig.icon;

  const isLegendary = finalPrize?.rarity === 'legendary' && slotState === 'revealed';
  const isRare = finalPrize?.rarity === 'rare' && slotState === 'revealed';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      >
        {/* Background particles for legendary */}
        {isLegendary && (
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(50)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-yellow-400 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  scale: [0, 1, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                }}
              />
            ))}
          </div>
        )}

        {/* Main reveal container */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ 
            scale: slotState === 'revealed' ? 1.1 : 1,
            opacity: 1 
          }}
          className={`relative bg-gradient-to-br ${
            isLegendary 
              ? 'from-yellow-500/20 to-orange-500/20 border-yellow-400/50' 
              : isRare 
              ? 'from-purple-500/20 to-pink-500/20 border-purple-400/50'
              : 'from-slate-500/20 to-slate-600/20 border-slate-400/50'
          } border-2 rounded-3xl p-8 backdrop-blur-sm max-w-md w-full mx-4`}
        >
          {/* Prize reveal area */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-6">
              {slotState === 'spinning' && '🎰 Drawing...'}
              {slotState === 'stopping' && '⏳ Almost...'}
              {slotState === 'revealed' && '🎉 Your Prize!'}
            </h2>

            {/* Slot machine effect */}
            <div className="relative h-32 w-32 mx-auto mb-6 bg-white/10 rounded-full border-4 border-white/20 overflow-hidden">
              <motion.div
                animate={{
                  rotate: slotState === 'spinning' ? 360 : 0,
                }}
                transition={{
                  duration: slotState === 'spinning' ? 0.5 : 2,
                  repeat: slotState === 'spinning' ? Infinity : 0,
                  ease: slotState === 'spinning' ? 'linear' : 'easeOut'
                }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className={`p-6 rounded-full bg-gradient-to-r ${prizeConfig.gradient}`}>
                  <Icon className="h-12 w-12 text-white" />
                </div>
              </motion.div>

              {/* Sparkle effects for rare items */}
              {(isRare || isLegendary) && slotState === 'revealed' && (
                <div className="absolute inset-0">
                  {[...Array(8)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute"
                      style={{
                        left: '50%',
                        top: '50%',
                        transform: `rotate(${i * 45}deg) translateY(-60px)`,
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ 
                        scale: [0, 1, 0],
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 1,
                        repeat: Infinity,
                        delay: i * 0.1,
                      }}
                    >
                      <Sparkles className="h-4 w-4 text-yellow-400" />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Prize details */}
            <AnimatePresence mode="wait">
              {slotState === 'revealed' && finalPrize && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <h3 className={`text-xl font-bold ${prizeConfig.color}`}>
                    {currentPrize === 'Nothing' ? 'Try Again!' : 
                     currentPrize === 'Respect Points' ? `+${finalPrize.value} Respect Points` :
                     currentPrize}
                  </h3>
                  
                  {/* Rarity badge */}
                  {finalPrize.rarity !== 'common' && (
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${
                      finalPrize.rarity === 'legendary' 
                        ? 'bg-yellow-400/20 text-yellow-400' 
                        : 'bg-purple-400/20 text-purple-400'
                    }`}>
                      {finalPrize.rarity === 'legendary' ? '👑 LEGENDARY' : '✨ RARE'}
                    </div>
                  )}

                  {/* Special message for legendary */}
                  {isLegendary && (
                    <motion.p
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-yellow-300 font-semibold"
                    >
                      🔥 Incredibly rare reward! 🔥
                    </motion.p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Progress indicator */}
            <div className="mt-6">
              <div className="flex justify-center space-x-2">
                {[1, 2, 3].map((step) => (
                  <div
                    key={step}
                    className={`w-2 h-2 rounded-full ${
                      (step === 1 && slotState !== 'spinning') ||
                      (step === 2 && slotState === 'revealed') ||
                      (step === 3 && slotState === 'revealed')
                        ? 'bg-purple-400'
                        : 'bg-white/20'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
} 