'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import React, { useState, useMemo } from 'react';
import './GooeyNav.css';

export type GooeyNavItem = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  color?: string;
  specialStyle?: 'base' | 'world' | 'celo' | 'camp' | 'linea' | 'ethereum';
};

export type GooeyNavProps = {
  items: GooeyNavItem[];
  className?: string;
};

// Helper function to convert hex to RGB
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [59, 130, 246]; // default blue
}

// Helper function to lighten color
function lightenColor(rgb: [number, number, number], factor: number): [number, number, number] {
  return [
    Math.min(255, rgb[0] + (255 - rgb[0]) * factor),
    Math.min(255, rgb[1] + (255 - rgb[1]) * factor),
    Math.min(255, rgb[2] + (255 - rgb[2]) * factor),
  ];
}

export default function GooeyNav({ items, className = '' }: GooeyNavProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  // Find active item and its color
  const activeItem = useMemo(() => items.find(item => item.isActive), [items]);
  const activeColor = activeItem?.color || '#3b82f6';
  const activeRgb = hexToRgb(activeColor);
  const lightenedRgb = lightenColor(activeRgb, 0.3);
  
  // Create gradient colors
  const gradientFrom = `rgb(${activeRgb[0]}, ${activeRgb[1]}, ${activeRgb[2]})`;
  const gradientTo = `rgb(${lightenedRgb[0]}, ${lightenedRgb[1]}, ${lightenedRgb[2]})`;

  return (
    <div className={`gooey-nav-container ${className}`}>
      <svg className="gooey-svg" style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="gooey" />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>
      
      <div className="flex items-center justify-center gap-2 overflow-x-auto lg:overflow-x-visible lg:grid lg:grid-cols-6 lg:gap-2 scrollbar-hide gooey-nav">
        {items.map((item, index) => {
          const itemColor = item.color || '#3b82f6';
          const itemRgb = hexToRgb(itemColor);
          const itemLightenedRgb = lightenColor(itemRgb, 0.3);
          const itemGradientFrom = `rgb(${itemRgb[0]}, ${itemRgb[1]}, ${itemRgb[2]})`;
          const itemGradientTo = `rgb(${itemLightenedRgb[0]}, ${itemLightenedRgb[1]}, ${itemLightenedRgb[2]})`;
          
          return (
            <motion.button
              key={index}
              onClick={item.onClick}
              onHoverStart={() => setHoveredIndex(index)}
              onHoverEnd={() => setHoveredIndex(null)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className={`
                gooey-nav-item relative px-4 py-3 rounded-2xl text-sm font-medium whitespace-nowrap
                flex items-center justify-center gap-2 transition-all duration-300
                ${item.isActive 
                  ? item.specialStyle === 'base' || item.specialStyle === 'world'
                    ? 'text-gray-900 shadow-lg'
                    : 'text-white shadow-lg'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                }
              `}
            >
              {/* Background for non-active items */}
              {!item.isActive && (
                <div className="absolute inset-0 rounded-2xl bg-gray-100 dark:bg-gray-700" />
              )}
              
              {/* Icon */}
              <div className="relative z-10 flex items-center justify-center">
                {item.icon}
              </div>
              
              {/* Label */}
              <span className={`relative z-10 hidden sm:inline ${
                item.specialStyle === 'celo' && item.isActive ? 'text-black' : ''
              }`}>
                {item.label}
              </span>
              
              {/* Active background with dynamic colors - fills entire button */}
              {item.isActive && (
                <motion.div
                  layoutId="gooeyActive"
                  className={`absolute inset-0 rounded-2xl ${
                    item.specialStyle === 'base' 
                      ? 'bg-white border-2' 
                      : item.specialStyle === 'world'
                      ? 'bg-white border'
                      : item.specialStyle === 'camp' || item.specialStyle === 'celo'
                      ? 'border'
                      : item.specialStyle === 'linea' || item.specialStyle === 'ethereum'
                      ? 'border'
                      : ''
                  }`}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  style={{ 
                    background: item.specialStyle === 'base' || item.specialStyle === 'world'
                      ? 'white' 
                      : `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                    borderColor: item.specialStyle === 'base' 
                      ? itemColor 
                      : item.specialStyle === 'world' || item.specialStyle === 'celo' || item.specialStyle === 'camp'
                      ? '#000000'
                      : item.specialStyle === 'linea'
                      ? '#7FFFD4' // jasno seledynowa
                      : item.specialStyle === 'ethereum'
                      ? '#ADD8E6' // bladoniebieska
                      : 'transparent',
                    borderWidth: item.specialStyle === 'base' ? '2px' : item.specialStyle === 'world' || item.specialStyle === 'celo' || item.specialStyle === 'camp' || item.specialStyle === 'linea' || item.specialStyle === 'ethereum' ? '1px' : '0px',
                    zIndex: 0
                  }}
                />
              )}
              
              {/* Hover blob effect with item's color - subtle background only */}
              {hoveredIndex === index && !item.isActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-2xl bg-gray-200 dark:bg-gray-600"
                  style={{ 
                    zIndex: 0
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

