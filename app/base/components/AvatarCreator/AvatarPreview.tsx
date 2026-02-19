'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { DiceBearConfig, DiceBearStyle, BACKGROUND_OPTIONS } from './types';

interface AvatarPreviewProps {
  config: DiceBearConfig;
  size?: number;
  isLoading?: boolean;
}

export default function AvatarPreview({
  config,
  size = 280,
  isLoading = false,
}: AvatarPreviewProps) {
  const [imageError, setImageError] = useState(false);
  const [imageKey, setImageKey] = useState(0);

  // Get background style based on config
  const backgroundStyle = useMemo(() => {
    const bgOption = BACKGROUND_OPTIONS.find(bg => bg.id === config.backgroundColor);
    
    if (!bgOption) {
      return { backgroundColor: '#ffffff' };
    }

    if (bgOption.type === 'solid') {
      return { backgroundColor: `#${bgOption.value}` };
    }

    if (bgOption.type === 'gradient') {
      return { background: bgOption.value };
    }

    return { backgroundColor: '#ffffff' };
  }, [config.backgroundColor]);

  // Build DiceBear URL based on selected style
  const avatarUrl = useMemo(() => {
    setImageError(false);
    setImageKey(prev => prev + 1);
    
    const params = new URLSearchParams();
    params.set('seed', config.seed || 'base-user');
    
    // Scale the avatar (default is 100)
    params.set('scale', '80');
    
    if (config.flip) {
      params.set('flip', 'true');
    }
    
    if (config.radius > 0) {
      params.set('radius', config.radius.toString());
    }

    // Don't set backgroundColor for DiceBear - we handle it ourselves
    return `https://api.dicebear.com/7.x/${config.style}/svg?${params.toString()}`;
  }, [config.seed, config.style, config.flip, config.radius]);

  // Fallback URL using a different style
  const fallbackUrl = useMemo(() => {
    return `https://api.dicebear.com/7.x/notionists/svg?seed=${config.seed || 'base-user'}`;
  }, [config.seed]);

  const displayUrl = imageError ? fallbackUrl : avatarUrl;

  return (
    <div className="relative flex items-center justify-center">
      {/* Glow effect behind avatar */}
      <div 
        className="absolute rounded-full blur-3xl opacity-30"
        style={{
          width: size * 0.8,
          height: size * 0.8,
          background: `radial-gradient(circle, #0052FF 0%, transparent 70%)`,
        }}
      />
      
      {/* Avatar container */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative rounded-2xl overflow-hidden border-4 border-[#0052FF] shadow-2xl"
        style={{
          width: size,
          height: size,
          ...backgroundStyle,
        }}
      >
        <motion.img
          key={`${displayUrl}-${imageKey}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          src={displayUrl}
          alt="Avatar Preview"
          className="w-full h-full object-contain object-bottom relative z-10"
          onError={() => setImageError(true)}
        />
        
        {/* Loading overlay */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-20"
          >
            <div className="relative">
              <div className="w-16 h-16 border-4 border-[#0052FF]/20 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-[#0052FF] rounded-full animate-spin" />
            </div>
            <p className="mt-4 text-sm font-medium text-gray-600">Loading...</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
