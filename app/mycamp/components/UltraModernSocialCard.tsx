'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { FaTwitter, FaSpotify, FaTiktok, FaDiscord } from 'react-icons/fa';

interface SocialCardProps {
  platform: 'twitter' | 'spotify' | 'tiktok' | 'discord';
  isConnected: boolean;
  onConnect: () => void;
  delay?: number;
}

const platformConfig = {
  twitter: {
    name: 'Twitter',
    icon: FaTwitter,
    gradient: 'from-blue-400 via-cyan-500 to-blue-600',
    glowColor: 'rgba(59, 130, 246, 0.5)',
    accentColor: '#1DA1F2',
    bgPattern: 'radial-gradient(circle at 20% 80%, rgba(29, 161, 242, 0.15) 0%, transparent 50%)',
    description: 'Connect your Twitter account',
    connectedText: 'Account connected',
    particles: '#60A5FA'
  },
  spotify: {
    name: 'Spotify',
    icon: FaSpotify,
    gradient: 'from-green-400 via-emerald-500 to-green-600',
    glowColor: 'rgba(34, 197, 94, 0.5)',
    accentColor: '#1DB954',
    bgPattern: 'radial-gradient(circle at 80% 20%, rgba(29, 185, 84, 0.15) 0%, transparent 50%)',
    description: 'Share your music taste',
    connectedText: 'Music synced',
    particles: '#4ADE80'
  },
  tiktok: {
    name: 'TikTok',
    icon: FaTiktok,
    gradient: 'from-pink-400 via-purple-500 to-indigo-600',
    glowColor: 'rgba(236, 72, 153, 0.5)',
    accentColor: '#FF0050',
    bgPattern: 'radial-gradient(circle at 50% 50%, rgba(255, 0, 80, 0.15) 0%, transparent 50%)',
    description: 'Share creative videos',
    connectedText: 'Videos linked',
    particles: '#EC4899'
  },
  discord: {
    name: 'Discord',
    icon: FaDiscord,
    gradient: 'from-indigo-400 via-purple-500 to-purple-600',
    glowColor: 'rgba(99, 102, 241, 0.5)',
    accentColor: '#5865F2',
    bgPattern: 'radial-gradient(circle at 30% 70%, rgba(88, 101, 242, 0.15) 0%, transparent 50%)',
    description: 'Join the community',
    connectedText: 'Server joined',
    particles: '#818CF8'
  }
};

export default function UltraModernSocialCard({ platform, isConnected, onConnect, delay = 0 }: SocialCardProps) {
  const config = platformConfig[platform];
  const Icon = config.icon;
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);
  
  // 3D tilt effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [10, -10]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-10, 10]), { stiffness: 300, damping: 30 });
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    mouseX.set((x / width) - 0.5);
    mouseY.set((y / height) - 0.5);
  };
  
  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };
  
  // Generate particles on hover
  useEffect(() => {
    if (isHovered) {
      const interval = setInterval(() => {
        setParticles(prev => [
          ...prev.slice(-10),
          {
            id: Date.now(),
            x: Math.random() * 100,
            y: Math.random() * 100
          }
        ]);
      }, 200);
      return () => clearInterval(interval);
    }
  }, [isHovered]);
  
  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ 
        duration: 0.8, 
        delay,
        type: "spring",
        stiffness: 100
      }}
      whileHover={{ scale: 1.02 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d'
      }}
      className="relative group"
    >
      {/* Glow effect behind card */}
      <motion.div
        className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"
        style={{
          background: `linear-gradient(135deg, ${config.glowColor}, transparent)`,
        }}
        animate={isHovered ? {
          scale: [1, 1.2, 1],
        } : {}}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      {/* Main card */}
      <div className="relative overflow-hidden rounded-3xl backdrop-blur-2xl bg-white/[0.08] border border-white/[0.15] hover:border-white/[0.25] transition-all duration-500 p-6 h-full">
        {/* Background pattern */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{ background: config.bgPattern }}
        />
        
        {/* Animated gradient overlay */}
        <motion.div
          className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-500`}
          animate={isHovered ? {
            backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
          } : {}}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "linear"
          }}
        />
        
        {/* Floating particles */}
        {particles.map(particle => (
          <motion.div
            key={particle.id}
            className="absolute w-1 h-1 rounded-full"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              backgroundColor: config.particles,
              boxShadow: `0 0 6px ${config.particles}`
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ 
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
              y: -50
            }}
            transition={{ duration: 2 }}
          />
        ))}
        
        {/* Status indicator */}
        <motion.div className="absolute top-4 right-4">
          <div className="relative">
            <motion.div
              className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-400'}`}
              animate={isConnected ? {
                scale: [1, 1.2, 1],
                opacity: [1, 0.8, 1]
              } : {}}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            {isConnected && (
              <motion.div
                className="absolute inset-0 rounded-full bg-green-400"
                animate={{
                  scale: [1, 2, 2.5],
                  opacity: [0.5, 0.2, 0]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeOut"
                }}
              />
            )}
          </div>
        </motion.div>
        
        {/* Icon container with 3D effect */}
        <motion.div 
          className="relative z-10 mb-6"
          animate={isHovered ? {
            y: [-2, 2, -2]
          } : {}}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <div className="relative">
            {/* Icon background glow */}
            <motion.div
              className="absolute inset-0 rounded-2xl blur-2xl"
              style={{
                background: `linear-gradient(135deg, ${config.accentColor}40, transparent)`,
              }}
              animate={{
                opacity: [0.5, 1, 0.5]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
            
            {/* Icon container */}
            <div 
              className="relative w-20 h-20 mx-auto rounded-2xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${config.accentColor}20, ${config.accentColor}10)`,
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              <Icon className="w-10 h-10 text-white/90" />
            </div>
          </div>
        </motion.div>
        
        {/* Content */}
        <div className="relative z-10 text-center">
          <h3 className="text-xl font-bold text-white mb-2 tracking-wide">
            {config.name}
          </h3>
          <p className="text-white/60 text-sm mb-6">
            {isConnected ? config.connectedText : config.description}
          </p>
          
          {/* Connect button with liquid effect */}
          <motion.button
            onClick={onConnect}
            className="relative w-full overflow-hidden rounded-xl py-3 px-6 font-semibold text-sm transition-all duration-300"
            style={{
              background: isConnected 
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1))'
                : `linear-gradient(135deg, ${config.accentColor}30, ${config.accentColor}20)`,
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Liquid animation */}
            <motion.div
              className="absolute inset-0 opacity-0 group-hover:opacity-100"
              style={{
                background: `linear-gradient(90deg, transparent, ${config.accentColor}20, transparent)`,
              }}
              animate={isHovered ? {
                x: ['-100%', '100%']
              } : {}}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear"
              }}
            />
            
            <span className="relative z-10 text-white/90">
              {isConnected ? 'Disconnect' : 'Connect'}
            </span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
