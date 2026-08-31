'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import QuestSystem from './components/QuestSystem';

// Pojedyncza czastka tla - pozycje sa wyliczone z rozmiaru viewportu.
type BackgroundParticle = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  duration: number;
  delay: number;
};

// Epic Loading Component with 3D effects
const QuestLoader: React.FC = () => {
  // Pozycje czastek licza sie z window.innerWidth/innerHeight, a na serwerze nie
  // ma obiektu window - w renderze wywalalo to prerender ("window is not defined").
  // Na serwerze lista jest pusta; warstwa jest czysto dekoracyjna i startuje z
  // opacity 0, wiec dolozenie jej tuz po zamontowaniu niczego wizualnie nie zmienia.
  const [particles, setParticles] = useState<BackgroundParticle[]>([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 15 }, () => ({
        fromX: Math.random() * window.innerWidth,
        fromY: Math.random() * window.innerHeight,
        toX: Math.random() * window.innerWidth,
        toY: Math.random() * window.innerHeight,
        duration: 4 + Math.random() * 2,
        delay: Math.random() * 2,
      }))
    );
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
      <div className="text-center">
        {/* 3D Loading Animation */}
        <motion.div
          animate={{ 
            rotateY: [0, 360],
            rotateX: [0, 360, 0],
          }}
          transition={{ 
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="relative w-32 h-32 mx-auto mb-8"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Cube faces */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-600 rounded-2xl opacity-80"
               style={{ transform: "rotateY(0deg) translateZ(64px)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-pink-600 rounded-2xl opacity-80"
               style={{ transform: "rotateY(90deg) translateZ(64px)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-600 rounded-2xl opacity-80"
               style={{ transform: "rotateY(180deg) translateZ(64px)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-red-600 rounded-2xl opacity-80"
               style={{ transform: "rotateY(-90deg) translateZ(64px)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-600 rounded-2xl opacity-80"
               style={{ transform: "rotateX(90deg) translateZ(64px)" }} />
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-600 rounded-2xl opacity-80"
               style={{ transform: "rotateX(-90deg) translateZ(64px)" }} />
        </motion.div>

        {/* Loading Text */}
        <motion.h1
          animate={{ 
            backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="text-4xl font-black mb-4 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-400 bg-clip-text text-transparent bg-[length:200%_100%]"
        >
          Loading Quest System
        </motion.h1>

        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ 
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="text-white/70 text-lg mb-8"
        >
          Getting your quests ready...
        </motion.p>

        {/* Progress Bar */}
        <div className="w-64 mx-auto bg-white/10 rounded-full h-2 overflow-hidden">
          <motion.div
            animate={{ x: [-100, 300] }}
            transition={{ 
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="h-full w-24 bg-gradient-to-r from-cyan-400 to-purple-600 rounded-full"
          />
        </div>

        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none">
          {particles.map((particle, i) => (
            <motion.div
              key={i}
              initial={{
                opacity: 0,
                scale: 0,
                x: particle.fromX,
                y: particle.fromY
              }}
              animate={{
                opacity: [0, 0.8, 0],
                scale: [0, 1, 0],
                x: particle.toX,
                y: particle.toY
              }}
              transition={{
                duration: particle.duration,
                repeat: Infinity,
                delay: particle.delay,
                ease: "easeInOut"
              }}
              className="absolute w-2 h-2 bg-cyan-400 rounded-full"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Error Boundary Component
class QuestErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Quest System Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-900 via-orange-900 to-yellow-900 flex items-center justify-center">
          <div className="text-center bg-black/50 backdrop-blur-xl border border-red-500/30 rounded-3xl p-12">
            <div className="text-6xl mb-6">⚠️</div>
            <h1 className="text-3xl font-bold text-white mb-4">Quest System Error</h1>
            <p className="text-white/70 mb-6">
              Something went wrong while loading the quest system.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.location.reload()}
              className="bg-gradient-to-r from-red-500 to-orange-600 text-white px-8 py-3 rounded-xl font-bold hover:from-red-400 hover:to-orange-500 transition-all duration-300"
            >
              🔄 Reload Quest System
            </motion.button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Main Page Component
export default function QuestPage() {
  return (
    <QuestErrorBoundary>
      <Suspense fallback={<QuestLoader />}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <QuestSystem />
        </motion.div>
      </Suspense>
    </QuestErrorBoundary>
  );
} 