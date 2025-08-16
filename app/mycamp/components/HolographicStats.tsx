'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { 
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import CountUp from 'react-countup';

interface StatsData {
  totalUsers: number;
  socialMediaConnections: {
    twitter: number;
    spotify: number;
    tiktok: number;
  };
  fullyConnectedUsers: number;
  averageConnectionsPerUser: number;
  growthTrendData: Array<{
    date: string;
    users: number;
    twitter: number;
    spotify: number;
    tiktok: number;
  }>;
}

interface HolographicStatsProps {
  data: StatsData;
  isVisible: boolean;
}

export default function HolographicStats({ data, isVisible }: HolographicStatsProps) {
  const [animatedParticles, setAnimatedParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);
  
  // Generate floating particles
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimatedParticles(prev => [
        ...prev.slice(-20),
        {
          id: Date.now(),
          x: Math.random() * 100,
          y: Math.random() * 100
        }
      ]);
    }, 500);
    return () => clearInterval(interval);
  }, []);
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-xl p-3">
          <p className="text-white/80 text-sm font-semibold">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value.toLocaleString()}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          {/* Holographic container */}
          <div className="relative rounded-3xl overflow-hidden">
            {/* Animated gradient background */}
            <motion.div
              className="absolute inset-0 opacity-30"
              animate={{
                background: [
                  'linear-gradient(45deg, #0EA5E9 0%, #A855F7 50%, #F97316 100%)',
                  'linear-gradient(45deg, #A855F7 0%, #F97316 50%, #0EA5E9 100%)',
                  'linear-gradient(45deg, #F97316 0%, #0EA5E9 50%, #A855F7 100%)',
                  'linear-gradient(45deg, #0EA5E9 0%, #A855F7 50%, #F97316 100%)',
                ]
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "linear"
              }}
            />
            
            {/* Glass effect */}
            <div className="relative backdrop-blur-2xl bg-white/[0.05] border border-white/[0.15] rounded-3xl p-8">
              {/* Floating particles */}
              {animatedParticles.map(particle => (
                <motion.div
                  key={particle.id}
                  className="absolute w-1 h-1 rounded-full bg-cyan-400/50"
                  style={{
                    left: `${particle.x}%`,
                    top: `${particle.y}%`,
                    boxShadow: '0 0 10px rgba(34, 211, 238, 0.5)'
                  }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ 
                    opacity: [0, 1, 0],
                    scale: [0, 1, 0],
                    y: -100
                  }}
                  transition={{ duration: 4 }}
                />
              ))}
              
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <motion.h3 
                  className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400"
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                  style={{
                    backgroundSize: '200% 200%'
                  }}
                >
                  Network Analytics Hub
                </motion.h3>
              </div>
              
              {/* Main stats grid - Social Media Platforms */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Users Card */}
                <motion.div
                  className="relative overflow-hidden rounded-2xl p-6"
                  style={{
                    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(14, 165, 233, 0.05))',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(14, 165, 233, 0.2)'
                  }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="relative z-10">
                    <p className="text-cyan-400/80 text-sm mb-2">MySphere Users</p>
                    <div className="text-4xl font-bold text-white mb-2">
                      <CountUp
                        start={0}
                        end={146655}
                        duration={2}
                        separator=","
                        useEasing={true}
                      />
                    </div>
                    <motion.div
                      className="h-1 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 1, delay: 0.5 }}
                    />
                  </div>
                  
                  {/* Animated background orb */}
                  <motion.div
                    className="absolute -right-10 -top-10 w-32 h-32 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(14, 165, 233, 0.3), transparent)',
                      filter: 'blur(20px)'
                    }}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  />
                </motion.div>
                
                {/* Twitter Card */}
                <motion.div
                  className="relative overflow-hidden rounded-2xl p-6"
                  style={{
                    background: 'linear-gradient(135deg, rgba(29, 161, 242, 0.1), rgba(29, 161, 242, 0.05))',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(29, 161, 242, 0.2)'
                  }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🐦</span>
                      <p className="text-blue-400/80 text-sm">Twitter</p>
                    </div>
                    <div className="text-4xl font-bold text-white mb-2">
                      <CountUp
                        start={0}
                        end={56094}
                        duration={2}
                        separator=","
                        useEasing={true}
                      />
                    </div>
                    <motion.div
                      className="h-1 bg-gradient-to-r from-blue-400 to-cyan-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(56094 / 146655) * 100}%` }}
                      transition={{ duration: 1, delay: 0.7 }}
                    />
                  </div>
                  
                  <motion.div
                    className="absolute -right-10 -bottom-10 w-32 h-32 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(29, 161, 242, 0.3), transparent)',
                      filter: 'blur(20px)'
                    }}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 1
                    }}
                  />
                </motion.div>
                
                {/* Spotify Card */}
                <motion.div
                  className="relative overflow-hidden rounded-2xl p-6"
                  style={{
                    background: 'linear-gradient(135deg, rgba(29, 185, 84, 0.1), rgba(29, 185, 84, 0.05))',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(29, 185, 84, 0.2)'
                  }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🎵</span>
                      <p className="text-green-400/80 text-sm">Spotify</p>
                    </div>
                    <div className="text-4xl font-bold text-white mb-2">
                      <CountUp
                        start={0}
                        end={2874}
                        duration={2}
                        separator=","
                        useEasing={true}
                      />
                    </div>
                    <motion.div
                      className="h-1 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(2874 / 146655) * 100}%` }}
                      transition={{ duration: 1, delay: 0.9 }}
                    />
                  </div>
                  
                  <motion.div
                    className="absolute -left-10 -top-10 w-32 h-32 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(29, 185, 84, 0.3), transparent)',
                      filter: 'blur(20px)'
                    }}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 2
                    }}
                  />
                </motion.div>
                
                {/* TikTok Card */}
                <motion.div
                  className="relative overflow-hidden rounded-2xl p-6"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 0, 80, 0.1), rgba(255, 0, 80, 0.05))',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 0, 80, 0.2)'
                  }}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🎬</span>
                      <p className="text-pink-400/80 text-sm">TikTok</p>
                    </div>
                    <div className="text-4xl font-bold text-white mb-2">
                      <CountUp
                        start={0}
                        end={3677}
                        duration={2}
                        separator=","
                        useEasing={true}
                      />
                    </div>
                    <motion.div
                      className="h-1 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(3677 / 146655) * 100}%` }}
                      transition={{ duration: 1, delay: 1.1 }}
                    />
                  </div>
                  
                  <motion.div
                    className="absolute -right-10 -top-10 w-32 h-32 rounded-full"
                    style={{
                      background: 'radial-gradient(circle, rgba(255, 0, 80, 0.3), transparent)',
                      filter: 'blur(20px)'
                    }}
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 2.5
                    }}
                  />
                </motion.div>
              </div>
              
              {/* Growth Chart - Always visible */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="h-80"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.growthTrendData}>
                    <defs>
                      <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.5)" />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="users"
                      stroke="#0EA5E9"
                      strokeWidth={2}
                      fill="url(#userGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
