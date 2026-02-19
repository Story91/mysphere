'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AvatarCategory,
  AvatarConfig,
  AVATAR_CATEGORIES,
  HAIR_STYLES,
  HAIR_COLORS,
  SKIN_COLORS,
  FACIAL_HAIR_STYLES,
  EYE_STYLES,
  EYEBROW_STYLES,
  MOUTH_STYLES,
  ACCESSORIES_STYLES,
  CLOTHING_STYLES,
  CLOTHING_COLORS,
  BACKGROUND_OPTIONS,
  OptionItem,
  ColorOption,
} from './types';

interface AvatarCategoryPanelProps {
  activeCategory: AvatarCategory;
  onCategoryChange: (category: AvatarCategory) => void;
  config: AvatarConfig;
  onConfigChange: (updates: Partial<AvatarConfig>) => void;
}

// Color picker component with ToggleGroup
function ColorPicker({
  colors,
  selectedColor,
  onColorChange,
  label,
}: {
  colors: ColorOption[];
  selectedColor: string;
  onColorChange: (hex: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => (
          <button
            key={color.id}
            onClick={() => onColorChange(color.hex)}
            className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
              selectedColor === color.hex
                ? 'border-[#0052FF] ring-2 ring-[#0052FF]/30 scale-110'
                : 'border-gray-200 hover:border-gray-400'
            }`}
            style={{
              backgroundColor: color.hex === 'transparent' ? 'transparent' : `#${color.hex}`,
              backgroundImage: color.hex === 'transparent' 
                ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                : 'none',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
            }}
            title={color.name}
          />
        ))}
      </div>
    </div>
  );
}

// Option grid component using ToggleGroup
function OptionGrid({
  options,
  selectedOption,
  onOptionChange,
  columns = 3,
}: {
  options: OptionItem[];
  selectedOption: string;
  onOptionChange: (id: string) => void;
  columns?: number;
}) {
  return (
    <ToggleGroup
      type="single"
      value={selectedOption}
      onValueChange={(value) => value && onOptionChange(value)}
      className={`grid gap-2 w-full`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.id}
          value={option.id}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-all text-center border ${
            selectedOption === option.id
              ? 'bg-[#0052FF] text-white border-[#0052FF] shadow-md'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
          }`}
        >
          {option.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export default function AvatarCategoryPanel({
  activeCategory,
  onCategoryChange,
  config,
  onConfigChange,
}: AvatarCategoryPanelProps) {
  return (
    <Tabs 
      value={activeCategory} 
      onValueChange={(value) => onCategoryChange(value as AvatarCategory)}
      className="w-full"
    >
      {/* Category Tabs */}
      <TabsList className="w-full grid grid-cols-7 h-auto p-1 bg-gray-100/80">
        {AVATAR_CATEGORIES.map((category) => (
          <TabsTrigger
            key={category.id}
            value={category.id}
            className="flex flex-col items-center gap-0.5 py-2 px-1 text-xs data-[state=active]:bg-white data-[state=active]:text-[#0052FF] data-[state=active]:shadow-md"
          >
            <span className="text-base">{category.icon}</span>
            <span className="hidden sm:inline text-[10px]">{category.name}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Skin Tab */}
      <TabsContent value="skin" className="mt-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <ColorPicker
            colors={SKIN_COLORS}
            selectedColor={config.skinColor}
            onColorChange={(hex) => onConfigChange({ skinColor: hex })}
            label="Skin Tone"
          />
        </motion.div>
      </TabsContent>

      {/* Hair Tab */}
      <TabsContent value="hair" className="mt-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Hair Style</label>
            <ScrollArea className="h-48 rounded-lg border border-gray-200 p-2">
              <OptionGrid
                options={HAIR_STYLES}
                selectedOption={config.hair}
                onOptionChange={(id) => onConfigChange({ hair: id })}
                columns={3}
              />
            </ScrollArea>
          </div>
          <ColorPicker
            colors={HAIR_COLORS}
            selectedColor={config.hairColor}
            onColorChange={(hex) => onConfigChange({ hairColor: hex })}
            label="Hair Color"
          />
        </motion.div>
      </TabsContent>

      {/* Eyes Tab */}
      <TabsContent value="eyes" className="mt-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Eye Style</label>
            <ScrollArea className="h-32 rounded-lg border border-gray-200 p-2">
              <OptionGrid
                options={EYE_STYLES}
                selectedOption={config.eyes}
                onOptionChange={(id) => onConfigChange({ eyes: id })}
                columns={3}
              />
            </ScrollArea>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Eyebrows</label>
            <ScrollArea className="h-32 rounded-lg border border-gray-200 p-2">
              <OptionGrid
                options={EYEBROW_STYLES}
                selectedOption={config.eyebrows}
                onOptionChange={(id) => onConfigChange({ eyebrows: id })}
                columns={3}
              />
            </ScrollArea>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Mouth</label>
            <ScrollArea className="h-32 rounded-lg border border-gray-200 p-2">
              <OptionGrid
                options={MOUTH_STYLES}
                selectedOption={config.mouth}
                onOptionChange={(id) => onConfigChange({ mouth: id })}
                columns={3}
              />
            </ScrollArea>
          </div>
        </motion.div>
      </TabsContent>

      {/* Facial Hair Tab */}
      <TabsContent value="facial-hair" className="mt-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Facial Hair Style</label>
            <OptionGrid
              options={FACIAL_HAIR_STYLES}
              selectedOption={config.facialHair}
              onOptionChange={(id) => onConfigChange({ facialHair: id })}
              columns={2}
            />
          </div>
          {config.facialHair !== 'none' && (
            <ColorPicker
              colors={HAIR_COLORS}
              selectedColor={config.facialHairColor}
              onColorChange={(hex) => onConfigChange({ facialHairColor: hex })}
              label="Facial Hair Color"
            />
          )}
        </motion.div>
      </TabsContent>

      {/* Accessories Tab */}
      <TabsContent value="accessories" className="mt-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Glasses / Accessories</label>
            <OptionGrid
              options={ACCESSORIES_STYLES}
              selectedOption={config.accessories}
              onOptionChange={(id) => onConfigChange({ accessories: id })}
              columns={2}
            />
          </div>
        </motion.div>
      </TabsContent>

      {/* Clothing Tab */}
      <TabsContent value="clothing" className="mt-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Clothing Style</label>
            <ScrollArea className="h-36 rounded-lg border border-gray-200 p-2">
              <OptionGrid
                options={CLOTHING_STYLES}
                selectedOption={config.clothing}
                onOptionChange={(id) => onConfigChange({ clothing: id })}
                columns={3}
              />
            </ScrollArea>
          </div>
          <ColorPicker
            colors={CLOTHING_COLORS}
            selectedColor={config.clothingColor}
            onColorChange={(hex) => onConfigChange({ clothingColor: hex })}
            label="Clothing Color"
          />
        </motion.div>
      </TabsContent>

      {/* Background Tab */}
      <TabsContent value="background" className="mt-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-gray-600 mb-3 block">Background Color</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {BACKGROUND_OPTIONS.map((bg) => {
                // Check if it's a light color that needs inner border for visibility
                const isLightColor = ['ffffff', 'f5f7fa', 'e6edff'].includes(bg.value) || bg.value.includes('#ffffff');
                
                // Build inline style for the preview
                const previewStyle: React.CSSProperties = bg.type === 'gradient' 
                  ? { background: bg.value }
                  : { backgroundColor: `#${bg.value}` };
                
                return (
                  <button
                    key={bg.id}
                    onClick={() => onConfigChange({ backgroundColor: bg.id })}
                    className={`relative aspect-square rounded-xl border-2 transition-all overflow-hidden ${
                      config.backgroundColor === bg.id
                        ? 'border-[#0052FF] ring-2 ring-[#0052FF]/30 scale-105'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    style={previewStyle}
                  >
                    {/* Inner shadow for light colors */}
                    {isLightColor && (
                      <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]" />
                    )}
                    
                    {/* Label */}
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-1 bg-black/60 backdrop-blur-sm">
                      <span className="text-[10px] font-medium text-white truncate block text-center">
                        {bg.name}
                      </span>
                    </div>
                    
                    {/* Selected checkmark */}
                    {config.backgroundColor === bg.id && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-[#0052FF] rounded-full flex items-center justify-center shadow-md">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Base Brand Info */}
          <div className="p-3 bg-[#0052FF]/5 rounded-lg border border-[#0052FF]/20">
            <div className="flex items-center gap-2 text-xs text-[#0052FF]">
              <span className="text-base">🔵</span>
              <span className="font-medium">Base Theme Colors</span>
            </div>
          </div>
        </motion.div>
      </TabsContent>
    </Tabs>
  );
}
