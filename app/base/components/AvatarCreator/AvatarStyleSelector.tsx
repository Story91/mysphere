'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { AIArtStyle, AI_STYLES } from './types';

interface AvatarStyleSelectorProps {
  selectedStyle: AIArtStyle;
  onStyleChange: (style: AIArtStyle) => void;
}

export default function AvatarStyleSelector({
  selectedStyle,
  onStyleChange,
}: AvatarStyleSelectorProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">AI Art Style</h3>
      
      <div className="flex flex-wrap gap-2">
        {AI_STYLES.map((style) => (
          <motion.button
            key={style.id}
            onClick={() => onStyleChange(style.id)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`relative px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              selectedStyle === style.id
                ? 'bg-[#0052FF] text-white shadow-lg shadow-[#0052FF]/25'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span className="text-base">{style.icon}</span>
            <span className="hidden sm:inline">{style.name}</span>
            
            {selectedStyle === style.id && (
              <motion.div
                layoutId="styleIndicator"
                className="absolute inset-0 rounded-xl bg-[#0052FF] -z-10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </div>
      
      {/* Selected style description */}
      <motion.p
        key={selectedStyle}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs text-gray-500"
      >
        {AI_STYLES.find(s => s.id === selectedStyle)?.description}
      </motion.p>
    </div>
  );
}

