'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  DiceBearConfig, 
  DiceBearStyle, 
  DICEBEAR_STYLES, 
  BACKGROUND_OPTIONS 
} from './types';

interface DiceBearPanelProps {
  config: DiceBearConfig;
  onConfigChange: (config: DiceBearConfig) => void;
  baseName?: string | null;
}

export default function DiceBearPanel({ config, onConfigChange, baseName }: DiceBearPanelProps) {
  const [customSeed, setCustomSeed] = useState(config.seed);
  
  // Generate seed suggestions based on basename
  const seedSuggestions = useMemo(() => {
    const suggestions: string[] = [];
    
    if (baseName) {
      // Full basename (e.g., "john.base.eth")
      suggestions.push(baseName);
      
      // Just the name part (e.g., "john")
      const namePart = baseName.split('.')[0];
      if (namePart && namePart !== baseName) {
        suggestions.push(namePart);
      }
    }
    
    return suggestions;
  }, [baseName]);

  const handleSeedChange = (seed: string) => {
    setCustomSeed(seed);
    onConfigChange({ ...config, seed });
  };

  const handleStyleChange = (style: string) => {
    if (style === 'random') {
      // Pick a random style
      const randomStyle = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)];
      onConfigChange({ ...config, style: randomStyle.id });
    } else {
      onConfigChange({ ...config, style: style as DiceBearStyle });
    }
  };

  const handleBackgroundChange = (bgId: string) => {
    onConfigChange({ ...config, backgroundColor: bgId });
  };

  const handleRandomSeed = () => {
    const randomSeed = `base-${Math.random().toString(36).substring(2, 10)}`;
    setCustomSeed(randomSeed);
    onConfigChange({ ...config, seed: randomSeed });
  };

  return (
    <div className="space-y-6">
      {/* Seed Input */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">
          Enter any text - same seed always generates the same avatar
        </p>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={customSeed}
            onChange={(e) => handleSeedChange(e.target.value)}
            placeholder="Enter your name or any text..."
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20 outline-none transition-all text-gray-900 text-sm"
          />
          <button
            onClick={handleRandomSeed}
            className="px-4 py-2.5 rounded-xl bg-[#0052FF]/10 hover:bg-[#0052FF]/20 text-[#0052FF] text-sm font-medium transition-colors"
          >
            🎲
          </button>
        </div>

        {/* Seed suggestions based on basename */}
        {seedSuggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2">Suggested:</p>
            <div className="flex flex-wrap gap-1.5">
              {seedSuggestions.map((seed) => (
                <button
                  key={seed}
                  onClick={() => handleSeedChange(seed)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    customSeed === seed
                      ? 'bg-[#0052FF] text-white'
                      : 'bg-[#0052FF]/10 text-[#0052FF] hover:bg-[#0052FF]/20'
                  }`}
                >
                  {seed}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Style Selector */}
      <div>
        <label className="text-sm font-semibold text-gray-700 mb-2 block">
          Avatar Style
        </label>

        <div className="flex gap-2">
          <Select value={config.style} onValueChange={handleStyleChange}>
            <SelectTrigger className="flex-1 h-12 rounded-xl border-2 border-gray-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20">
              <SelectValue placeholder="Select a style">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{DICEBEAR_STYLES.find(s => s.id === config.style)?.icon}</span>
                  <span className="font-medium">{DICEBEAR_STYLES.find(s => s.id === config.style)?.name}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[300px] z-[100] bg-white" position="popper" sideOffset={4}>
              {/* All styles */}
              {DICEBEAR_STYLES.map((style) => (
                <SelectItem key={style.id} value={style.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{style.icon}</span>
                    <div>
                      <p className="font-medium">{style.name}</p>
                      <p className="text-xs text-gray-500">{style.description}</p>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Random button */}
          <button
            onClick={() => handleStyleChange('random')}
            className="px-4 h-12 rounded-xl bg-[#0052FF]/10 hover:bg-[#0052FF]/20 text-[#0052FF] font-medium transition-colors flex items-center gap-1.5"
            title="Random style"
          >
            <span>🎲</span>
          </button>
        </div>
      </div>

      {/* Background Color */}
      <div>
        <label className="text-sm font-semibold text-gray-700 mb-2 block">
          Background
        </label>
        
        <div className="grid grid-cols-4 gap-2">
          {BACKGROUND_OPTIONS.map((bg) => {
            const isLightColor = ['ffffff', 'f5f7fa', 'e6edff'].includes(bg.value) || bg.value.includes('#ffffff');
            const previewStyle: React.CSSProperties = bg.type === 'gradient' 
              ? { background: bg.value }
              : { backgroundColor: `#${bg.value}` };
            
            return (
              <button
                key={bg.id}
                onClick={() => handleBackgroundChange(bg.id)}
                className={`relative aspect-square rounded-xl border-2 transition-all overflow-hidden ${
                  config.backgroundColor === bg.id
                    ? 'border-[#0052FF] ring-2 ring-[#0052FF]/30 scale-105'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                style={previewStyle}
              >
                {isLightColor && (
                  <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]" />
                )}
                
                <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 backdrop-blur-sm">
                  <span className="text-[8px] font-medium text-white truncate block text-center">
                    {bg.name}
                  </span>
                </div>
                
                {config.backgroundColor === bg.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-[#0052FF] rounded-full flex items-center justify-center shadow-md">
                    <span className="text-white text-[8px]">✓</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 bg-[#0052FF]/5 rounded-xl border border-[#0052FF]/20">
        <div className="flex items-start gap-2">
          <span className="text-lg">💡</span>
          <div className="text-xs text-gray-600">
            <p className="font-medium text-gray-700 mb-1">How DiceBear works:</p>
            <p>The same seed always generates the identical avatar. Try your name, wallet address, or any unique text!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

