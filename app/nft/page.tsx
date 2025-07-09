'use client';

import NFTComponent from '../components/NFT/NFT';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function NFTPage() {
  const [hoveredSwitch, setHoveredSwitch] = useState<string | null>(null);

  return (
    <div className="min-h-screen relative" style={{
      background: 'linear-gradient(135deg, #000000 0%, #0a0a0a 25%, #001122 50%, #001a33 75%, #002244 100%)'
    }}>
      {/* Animated gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-blue-950/20 to-blue-900/30 animate-pulse" style={{
        animation: 'gradientShift 8s ease-in-out infinite'
      }} />

      {/* Main content */}
      <div className="relative container mx-auto px-4 py-12 z-30">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-6xl font-black mb-4 cyber-glitch" style={{
            fontFamily: '"Orbitron", sans-serif',
            background: 'linear-gradient(to right, #0052FF, #4C8FFF, #0052FF)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 0 20px rgba(0, 82, 255, 0.5)'
          }}>
            Sphere Genesis
          </h1>
          <p className="text-[#4C8FFF] max-w-2xl mx-auto text-lg" style={{ fontFamily: '"Share Tech Mono", monospace' }}>
            Discover exclusive Genesis NFTs that unlock special features and rewards in the SPHERE ecosystem. 
            Each token represents a unique access level and privileges.
          </p>
        </motion.div>

        {/* Przełączniki z animowanymi gradientami */}
        <div className="flex flex-wrap justify-center gap-6 mb-10">
          {/* Główny przełącznik - aktywny */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative"
          >
            <div className="px-10 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-[#0052FF] via-[#4C8FFF] to-[#0052FF] shadow-lg transform hover:scale-105 transition-all duration-300 cursor-pointer backdrop-blur-md">
              MySphere
            </div>
          </motion.div>

          {/* Przełącznik SBT - zablokowany */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            onMouseEnter={() => setHoveredSwitch('sbt')}
            onMouseLeave={() => setHoveredSwitch(null)}
            className="relative group"
          >
            {/* Animowany border */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FF3D00] via-[#FFB800] to-[#FF3D00] opacity-30 blur-sm group-hover:opacity-50 group-hover:blur-md transition-all duration-500 animate-[gradient_3s_ease_infinite]"></div>
            
            {/* Wewnętrzny przycisk */}
            <div className="relative px-10 py-3 rounded-xl font-medium border border-orange-500/30 bg-black/80 text-gray-400 overflow-hidden cursor-not-allowed group-hover:shadow-[0_0_20px_rgba(255,69,0,0.3)] transition-all duration-300">
              
              {/* Animowany gradient przepływający w tle */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#FF3D00]/10 via-[#FFB800]/10 to-[#FF3D00]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                backgroundSize: '200% 100%',
                animation: 'shimmerGradient 3s linear infinite'
              }}></div>
              
              {/* Tekst i kłódka */}
              <div className="flex items-center justify-center space-x-2">
                <span>SBT</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>

              {/* Tooltip */}
              {hoveredSwitch === 'sbt' && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1 bg-black/80 backdrop-blur-md border border-orange-500/30 rounded text-xs text-orange-400 whitespace-nowrap">
                  Coming Soon
                </div>
              )}
            </div>
          </motion.div>

          {/* Przełącznik GENESIS - zablokowany */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            onMouseEnter={() => setHoveredSwitch('genesis')}
            onMouseLeave={() => setHoveredSwitch(null)}
            className="relative group"
          >
            {/* Animowany border */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#7928CA] via-[#FF0080] to-[#7928CA] opacity-30 blur-sm group-hover:opacity-50 group-hover:blur-md transition-all duration-500 animate-[gradient_3s_ease_infinite]"></div>
            
            {/* Wewnętrzny przycisk */}
            <div className="relative px-10 py-3 rounded-xl font-medium border border-pink-500/30 bg-black/80 text-gray-400 overflow-hidden cursor-not-allowed group-hover:shadow-[0_0_20px_rgba(255,0,128,0.3)] transition-all duration-300">
              
              {/* Animowany gradient przepływający w tle */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#7928CA]/10 via-[#FF0080]/10 to-[#7928CA]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                backgroundSize: '200% 100%',
                animation: 'shimmerGradient 3s linear infinite'
              }}></div>
              
              {/* Tekst i kłódka */}
              <div className="flex items-center justify-center space-x-2">
                <span>GENESIS</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>

              {/* Tooltip */}
              {hoveredSwitch === 'genesis' && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1 bg-black/80 backdrop-blur-md border border-pink-500/30 rounded text-xs text-pink-400 whitespace-nowrap">
                  Coming Soon
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* NFT Component */}
        <NFTComponent />
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Share+Tech+Mono&display=swap');

        @keyframes gradientShift {
          0% { opacity: 0.3; }
          50% { opacity: 0.6; }
          100% { opacity: 0.3; }
        }

        .cyber-glitch {
          position: relative;
          text-shadow: 0.05em 0 0 rgba(255,0,0,0.75),
                      -0.025em -0.05em 0 rgba(0,255,0,0.75),
                      0.025em 0.05em 0 rgba(0,0,255,0.75);
          animation: glitch 500ms infinite;
        }

        .cyber-card {
          position: relative;
          overflow: hidden;
        }

        .cyber-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.1),
            transparent
          );
          transition: 0.5s;
        }

        .cyber-card:hover::before {
          left: 100%;
        }

        @keyframes glitch {
          0% {
            text-shadow: 0.05em 0 0 rgba(255,0,0,0.75),
                        -0.025em -0.05em 0 rgba(0,255,0,0.75),
                        0.025em 0.05em 0 rgba(0,0,255,0.75);
          }
          14% {
            text-shadow: 0.05em 0 0 rgba(255,0,0,0.75),
                        -0.025em -0.05em 0 rgba(0,255,0,0.75),
                        0.025em 0.05em 0 rgba(0,0,255,0.75);
          }
          15% {
            text-shadow: -0.05em -0.025em 0 rgba(255,0,0,0.75),
                        0.025em 0.025em 0 rgba(0,255,0,0.75),
                        -0.05em -0.05em 0 rgba(0,0,255,0.75);
          }
          49% {
            text-shadow: -0.05em -0.025em 0 rgba(255,0,0,0.75),
                        0.025em 0.025em 0 rgba(0,255,0,0.75),
                        -0.05em -0.05em 0 rgba(0,0,255,0.75);
          }
          50% {
            text-shadow: 0.025em 0.05em 0 rgba(255,0,0,0.75),
                        0.05em 0 0 rgba(0,255,0,0.75),
                        0 -0.05em 0 rgba(0,0,255,0.75);
          }
          99% {
            text-shadow: 0.025em 0.05em 0 rgba(255,0,0,0.75),
                        0.05em 0 0 rgba(0,255,0,0.75),
                        0 -0.05em 0 rgba(0,0,255,0.75);
          }
          100% {
            text-shadow: -0.025em 0 0 rgba(255,0,0,0.75),
                        -0.025em -0.025em 0 rgba(0,255,0,0.75),
                        -0.025em -0.05em 0 rgba(0,0,255,0.75);
          }
        }

        @keyframes shimmerGradient {
          0% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }

        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
} 