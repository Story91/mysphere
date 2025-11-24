'use client';

import { motion } from 'framer-motion';
import React from 'react';

export type GlassIconItem = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
};

export type GlassIconsProps = {
  items: GlassIconItem[];
  className?: string;
};

export default function GlassIcons({ items, className = '' }: GlassIconsProps) {
  return (
    <div className={`flex items-center gap-2 overflow-x-auto lg:overflow-x-visible lg:grid lg:grid-cols-6 lg:gap-2 scrollbar-hide ${className}`}>
      {items.map((item, index) => (
        <motion.button
          key={index}
          onClick={item.onClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`
            flex-shrink-0 lg:flex-1 px-4 py-3 rounded-xl text-sm font-medium whitespace-nowrap
            flex items-center justify-center gap-2 transition-all duration-300
            relative overflow-hidden group
            ${item.isActive 
              ? 'bg-gradient-to-br from-blue-500/30 to-purple-500/30 backdrop-blur-xl border border-white/20 shadow-lg shadow-blue-500/20' 
              : 'bg-white/10 dark:bg-gray-800/50 backdrop-blur-xl border border-white/10 dark:border-gray-700/50 hover:bg-white/20 dark:hover:bg-gray-700/70 hover:border-white/30'
            }
          `}
        >
          {/* Glass effect overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* Icon */}
          <div className={`relative z-10 ${item.isActive ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>
            {item.icon}
          </div>
          
          {/* Label */}
          <span className={`relative z-10 ${item.isActive ? 'text-white font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
            {item.label}
          </span>
          
          {/* Active indicator */}
          {item.isActive && (
            <motion.div
              layoutId="glassActive"
              className="absolute inset-0 bg-gradient-to-br from-blue-500/40 to-purple-500/40 rounded-xl"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
            />
          )}
        </motion.button>
      ))}
    </div>
  );
}

