'use client';

import NFTComponent from '../components/NFT/NFT';
import { motion } from 'framer-motion';

export default function NFTPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Matrix background effect */}
      <div className="fixed inset-0 bg-black opacity-90">
        {/* Usunięto odwołanie do matrix.png */}
      </div>

      {/* Cyber grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.1)_0%,transparent_70%)]"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent)',
        backgroundSize: '50px 50px'
      }}></div>

      {/* Glowing orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#0052FF]/30 rounded-full filter blur-3xl animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#4C8FFF]/30 rounded-full filter blur-3xl animate-pulse delay-1000"></div>

      {/* Main content */}
      <div className="relative container mx-auto px-4 py-12">
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
            SPHERE NFT Collection
          </h1>
          <p className="text-[#4C8FFF] max-w-2xl mx-auto text-lg" style={{ fontFamily: '"Share Tech Mono", monospace' }}>
            Discover exclusive NFTs that unlock special features and rewards in the SPHERE ecosystem. 
            Each token represents a unique access level and privileges.
          </p>
        </motion.div>

        {/* NFT Component */}
        <NFTComponent />
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Share+Tech+Mono&display=swap');

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

        @keyframes matrix {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(100%);
          }
        }

        .animate-matrix {
          animation: matrix 20s linear infinite;
        }
      `}</style>
    </div>
  );
} 