'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AIArtStyle } from './types';

interface AIPromptBuilderProps {
  onPromptChange: (prompt: string) => void;
  selectedStyle: AIArtStyle;
}

// Character attributes for prompt building
const GENDER_OPTIONS = [
  { id: 'male', name: 'Male', emoji: '👨' },
  { id: 'female', name: 'Female', emoji: '👩' },
  { id: 'non-binary', name: 'Non-binary', emoji: '🧑' },
];

const AGE_OPTIONS = [
  { id: 'young', name: 'Young Adult', emoji: '🧒' },
  { id: 'adult', name: 'Adult', emoji: '🧑' },
  { id: 'middle-aged', name: 'Middle-aged', emoji: '🧔' },
  { id: 'elderly', name: 'Elderly', emoji: '👴' },
];

const SKIN_TONE_OPTIONS = [
  { id: 'pale', name: 'Pale', color: '#ffecd2' },
  { id: 'light', name: 'Light', color: '#f5d0b9' },
  { id: 'medium', name: 'Medium', color: '#d4a574' },
  { id: 'tan', name: 'Tan', color: '#c68642' },
  { id: 'brown', name: 'Brown', color: '#8d5524' },
  { id: 'dark', name: 'Dark', color: '#5c3317' },
];

const HAIR_STYLE_OPTIONS = [
  { id: 'bald', name: 'Bald' },
  { id: 'short', name: 'Short' },
  { id: 'medium', name: 'Medium' },
  { id: 'long', name: 'Long' },
  { id: 'curly', name: 'Curly' },
  { id: 'wavy', name: 'Wavy' },
  { id: 'straight', name: 'Straight' },
  { id: 'spiky', name: 'Spiky' },
  { id: 'ponytail', name: 'Ponytail' },
  { id: 'braids', name: 'Braids' },
  { id: 'afro', name: 'Afro' },
  { id: 'mohawk', name: 'Mohawk' },
];

const HAIR_COLOR_OPTIONS = [
  { id: 'black', name: 'Black', color: '#1a1a1a' },
  { id: 'dark-brown', name: 'Dark Brown', color: '#3d2314' },
  { id: 'brown', name: 'Brown', color: '#6b4423' },
  { id: 'light-brown', name: 'Light Brown', color: '#a67b5b' },
  { id: 'blonde', name: 'Blonde', color: '#e8d4a8' },
  { id: 'platinum', name: 'Platinum', color: '#e5e5e5' },
  { id: 'ginger', name: 'Ginger', color: '#b55239' },
  { id: 'red', name: 'Red', color: '#8b0000' },
  { id: 'blue', name: 'Blue', color: '#0052FF' },
  { id: 'purple', name: 'Purple', color: '#8b5cf6' },
  { id: 'pink', name: 'Pink', color: '#ec4899' },
  { id: 'green', name: 'Green', color: '#10b981' },
  { id: 'white', name: 'White', color: '#ffffff' },
  { id: 'gray', name: 'Gray', color: '#6b7280' },
];

const EYE_COLOR_OPTIONS = [
  { id: 'brown', name: 'Brown', color: '#5c4033' },
  { id: 'hazel', name: 'Hazel', color: '#8e7618' },
  { id: 'green', name: 'Green', color: '#2e8b57' },
  { id: 'blue', name: 'Blue', color: '#4169e1' },
  { id: 'gray', name: 'Gray', color: '#708090' },
  { id: 'amber', name: 'Amber', color: '#ffbf00' },
];

const FACIAL_HAIR_OPTIONS = [
  { id: 'none', name: 'None' },
  { id: 'stubble', name: 'Stubble' },
  { id: 'goatee', name: 'Goatee' },
  { id: 'mustache', name: 'Mustache' },
  { id: 'beard', name: 'Full Beard' },
  { id: 'long-beard', name: 'Long Beard' },
];

const EXPRESSION_OPTIONS = [
  { id: 'neutral', name: 'Neutral', emoji: '😐' },
  { id: 'happy', name: 'Happy', emoji: '😊' },
  { id: 'confident', name: 'Confident', emoji: '😎' },
  { id: 'serious', name: 'Serious', emoji: '😤' },
  { id: 'mysterious', name: 'Mysterious', emoji: '🤔' },
  { id: 'friendly', name: 'Friendly', emoji: '🤗' },
];

const ACCESSORIES_OPTIONS = [
  { id: 'none', name: 'None' },
  { id: 'glasses', name: 'Glasses' },
  { id: 'sunglasses', name: 'Sunglasses' },
  { id: 'earrings', name: 'Earrings' },
  { id: 'headphones', name: 'Headphones' },
  { id: 'hat', name: 'Hat' },
  { id: 'cap', name: 'Cap' },
  { id: 'beanie', name: 'Beanie' },
  { id: 'headband', name: 'Headband' },
];

const CLOTHING_OPTIONS = [
  { id: 'casual', name: 'Casual' },
  { id: 't-shirt', name: 'T-Shirt' },
  { id: 'hoodie', name: 'Hoodie' },
  { id: 'formal', name: 'Formal Shirt' },
  { id: 'suit', name: 'Suit' },
  { id: 'jacket', name: 'Jacket' },
  { id: 'sweater', name: 'Sweater' },
  { id: 'tank-top', name: 'Tank Top' },
];

const BACKGROUND_OPTIONS = [
  { id: 'simple-white', name: 'Simple White' },
  { id: 'simple-blue', name: 'Base Blue' },
  { id: 'gradient-blue', name: 'Blue Gradient' },
  { id: 'abstract', name: 'Abstract' },
  { id: 'geometric', name: 'Geometric' },
  { id: 'nature', name: 'Nature' },
  { id: 'city', name: 'City' },
  { id: 'studio', name: 'Studio' },
];

export default function AIPromptBuilder({ onPromptChange, selectedStyle }: AIPromptBuilderProps) {
  // State for all character attributes
  const [gender, setGender] = useState('male');
  const [age, setAge] = useState('adult');
  const [skinTone, setSkinTone] = useState('medium');
  const [hairStyle, setHairStyle] = useState('short');
  const [hairColor, setHairColor] = useState('brown');
  const [eyeColor, setEyeColor] = useState('brown');
  const [facialHair, setFacialHair] = useState('none');
  const [expression, setExpression] = useState('friendly');
  const [accessories, setAccessories] = useState<string[]>([]);
  const [clothing, setClothing] = useState('hoodie');
  const [background, setBackground] = useState('simple-blue');
  const [customDetails, setCustomDetails] = useState('');

  // Build prompt from selections
  const builtPrompt = useMemo(() => {
    const parts: string[] = [];

    // Base description
    const genderName = GENDER_OPTIONS.find(g => g.id === gender)?.name || 'person';
    const ageName = AGE_OPTIONS.find(a => a.id === age)?.name?.toLowerCase() || '';
    parts.push(`portrait of a ${ageName} ${genderName.toLowerCase()}`);

    // Skin
    const skinName = SKIN_TONE_OPTIONS.find(s => s.id === skinTone)?.name || '';
    if (skinName) parts.push(`with ${skinName.toLowerCase()} skin`);

    // Hair
    if (hairStyle !== 'bald') {
      const hairStyleName = HAIR_STYLE_OPTIONS.find(h => h.id === hairStyle)?.name || '';
      const hairColorName = HAIR_COLOR_OPTIONS.find(h => h.id === hairColor)?.name || '';
      parts.push(`${hairColorName.toLowerCase()} ${hairStyleName.toLowerCase()} hair`);
    } else {
      parts.push('bald head');
    }

    // Eyes
    const eyeColorName = EYE_COLOR_OPTIONS.find(e => e.id === eyeColor)?.name || '';
    if (eyeColorName) parts.push(`${eyeColorName.toLowerCase()} eyes`);

    // Facial hair
    if (facialHair !== 'none') {
      const facialHairName = FACIAL_HAIR_OPTIONS.find(f => f.id === facialHair)?.name || '';
      parts.push(`with ${facialHairName.toLowerCase()}`);
    }

    // Expression
    const expressionName = EXPRESSION_OPTIONS.find(e => e.id === expression)?.name || '';
    if (expressionName) parts.push(`${expressionName.toLowerCase()} expression`);

    // Accessories
    if (accessories.length > 0) {
      const accessoryNames = accessories.map(a => 
        ACCESSORIES_OPTIONS.find(opt => opt.id === a)?.name?.toLowerCase()
      ).filter(Boolean);
      if (accessoryNames.length > 0) {
        parts.push(`wearing ${accessoryNames.join(' and ')}`);
      }
    }

    // Clothing
    const clothingName = CLOTHING_OPTIONS.find(c => c.id === clothing)?.name || '';
    if (clothingName) parts.push(`wearing ${clothingName.toLowerCase()}`);

    // Background
    const bgName = BACKGROUND_OPTIONS.find(b => b.id === background)?.name || '';
    if (bgName) {
      if (background === 'simple-blue') {
        parts.push('on Base blue (#0052FF) background');
      } else if (background === 'gradient-blue') {
        parts.push('on blue gradient background');
      } else {
        parts.push(`${bgName.toLowerCase()} background`);
      }
    }

    // Custom details
    if (customDetails.trim()) {
      parts.push(customDetails.trim());
    }

    return parts.join(', ');
  }, [gender, age, skinTone, hairStyle, hairColor, eyeColor, facialHair, expression, accessories, clothing, background, customDetails]);

  // Notify parent of prompt changes
  useEffect(() => {
    onPromptChange(builtPrompt);
  }, [builtPrompt, onPromptChange]);

  // Toggle accessory
  const toggleAccessory = (id: string) => {
    setAccessories(prev => 
      prev.includes(id) 
        ? prev.filter(a => a !== id)
        : [...prev, id]
    );
  };

  // Option button component
  const OptionButton = ({ 
    selected, 
    onClick, 
    children,
    color,
  }: { 
    selected: boolean; 
    onClick: () => void; 
    children: React.ReactNode;
    color?: string;
  }) => (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
        selected
          ? 'border-[#0052FF] bg-[#0052FF]/10 text-[#0052FF] shadow-sm'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
      }`}
      style={color ? { borderLeftWidth: 4, borderLeftColor: color } : undefined}
    >
      {children}
    </button>
  );

  // Color button component
  const ColorButton = ({
    selected,
    onClick,
    color,
    name,
  }: {
    selected: boolean;
    onClick: () => void;
    color: string;
    name: string;
  }) => (
    <button
      onClick={onClick}
      className={`w-8 h-8 rounded-full border-2 transition-all ${
        selected 
          ? 'border-[#0052FF] ring-2 ring-[#0052FF]/30 scale-110' 
          : 'border-gray-200 hover:border-gray-400'
      }`}
      style={{ backgroundColor: color }}
      title={name}
    />
  );

  return (
    <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Build Your Character</h3>
      
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="w-full grid grid-cols-4 h-9 p-1 bg-gray-100 mb-4">
          <TabsTrigger value="basic" className="text-xs">Basic</TabsTrigger>
          <TabsTrigger value="hair" className="text-xs">Hair</TabsTrigger>
          <TabsTrigger value="style" className="text-xs">Style</TabsTrigger>
          <TabsTrigger value="extra" className="text-xs">Extra</TabsTrigger>
        </TabsList>

        {/* Basic Tab */}
        <TabsContent value="basic" className="space-y-4">
          {/* Gender */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Gender</label>
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.id}
                  selected={gender === opt.id}
                  onClick={() => setGender(opt.id)}
                >
                  {opt.emoji} {opt.name}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Age */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Age</label>
            <div className="flex flex-wrap gap-2">
              {AGE_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.id}
                  selected={age === opt.id}
                  onClick={() => setAge(opt.id)}
                >
                  {opt.name}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Skin Tone */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Skin Tone</label>
            <div className="flex flex-wrap gap-2">
              {SKIN_TONE_OPTIONS.map(opt => (
                <ColorButton
                  key={opt.id}
                  selected={skinTone === opt.id}
                  onClick={() => setSkinTone(opt.id)}
                  color={opt.color}
                  name={opt.name}
                />
              ))}
            </div>
          </div>

          {/* Eye Color */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Eye Color</label>
            <div className="flex flex-wrap gap-2">
              {EYE_COLOR_OPTIONS.map(opt => (
                <ColorButton
                  key={opt.id}
                  selected={eyeColor === opt.id}
                  onClick={() => setEyeColor(opt.id)}
                  color={opt.color}
                  name={opt.name}
                />
              ))}
            </div>
          </div>

          {/* Expression */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Expression</label>
            <div className="flex flex-wrap gap-2">
              {EXPRESSION_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.id}
                  selected={expression === opt.id}
                  onClick={() => setExpression(opt.id)}
                >
                  {opt.emoji} {opt.name}
                </OptionButton>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Hair Tab */}
        <TabsContent value="hair" className="space-y-4">
          {/* Hair Style */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Hair Style</label>
            <ScrollArea className="h-24">
              <div className="flex flex-wrap gap-2">
                {HAIR_STYLE_OPTIONS.map(opt => (
                  <OptionButton
                    key={opt.id}
                    selected={hairStyle === opt.id}
                    onClick={() => setHairStyle(opt.id)}
                  >
                    {opt.name}
                  </OptionButton>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Hair Color */}
          {hairStyle !== 'bald' && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-2 block">Hair Color</label>
              <div className="flex flex-wrap gap-2">
                {HAIR_COLOR_OPTIONS.map(opt => (
                  <ColorButton
                    key={opt.id}
                    selected={hairColor === opt.id}
                    onClick={() => setHairColor(opt.id)}
                    color={opt.color}
                    name={opt.name}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Facial Hair */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Facial Hair</label>
            <div className="flex flex-wrap gap-2">
              {FACIAL_HAIR_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.id}
                  selected={facialHair === opt.id}
                  onClick={() => setFacialHair(opt.id)}
                >
                  {opt.name}
                </OptionButton>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Style Tab */}
        <TabsContent value="style" className="space-y-4">
          {/* Clothing */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Clothing</label>
            <div className="flex flex-wrap gap-2">
              {CLOTHING_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.id}
                  selected={clothing === opt.id}
                  onClick={() => setClothing(opt.id)}
                >
                  {opt.name}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Accessories */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Accessories (select multiple)</label>
            <div className="flex flex-wrap gap-2">
              {ACCESSORIES_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.id}
                  selected={accessories.includes(opt.id)}
                  onClick={() => toggleAccessory(opt.id)}
                >
                  {opt.name}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* Background */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Background</label>
            <div className="flex flex-wrap gap-2">
              {BACKGROUND_OPTIONS.map(opt => (
                <OptionButton
                  key={opt.id}
                  selected={background === opt.id}
                  onClick={() => setBackground(opt.id)}
                >
                  {opt.name}
                </OptionButton>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Extra Tab */}
        <TabsContent value="extra" className="space-y-4">
          {/* Custom Details */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">
              Custom Details (optional)
            </label>
            <textarea
              value={customDetails}
              onChange={(e) => setCustomDetails(e.target.value)}
              placeholder="Add any extra details... (e.g., 'tattoos on arms', 'freckles', 'scar on cheek')"
              className="w-full p-3 rounded-lg border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF]/20 outline-none resize-none"
              rows={3}
            />
          </div>

          {/* Quick presets */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Quick Presets</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setGender('male');
                  setAge('adult');
                  setHairStyle('short');
                  setHairColor('brown');
                  setFacialHair('stubble');
                  setClothing('hoodie');
                  setExpression('confident');
                  setAccessories([]);
                }}
                className="p-3 rounded-lg border border-gray-200 hover:border-[#0052FF] hover:bg-[#0052FF]/5 text-left transition-all"
              >
                <span className="text-lg">👨‍💻</span>
                <p className="text-xs font-medium text-gray-700 mt-1">Developer</p>
              </button>
              <button
                onClick={() => {
                  setGender('female');
                  setAge('young');
                  setHairStyle('long');
                  setHairColor('blonde');
                  setFacialHair('none');
                  setClothing('formal');
                  setExpression('friendly');
                  setAccessories(['glasses']);
                }}
                className="p-3 rounded-lg border border-gray-200 hover:border-[#0052FF] hover:bg-[#0052FF]/5 text-left transition-all"
              >
                <span className="text-lg">👩‍💼</span>
                <p className="text-xs font-medium text-gray-700 mt-1">Professional</p>
              </button>
              <button
                onClick={() => {
                  setGender('non-binary');
                  setAge('young');
                  setHairStyle('mohawk');
                  setHairColor('blue');
                  setFacialHair('none');
                  setClothing('jacket');
                  setExpression('confident');
                  setAccessories(['earrings', 'headphones']);
                }}
                className="p-3 rounded-lg border border-gray-200 hover:border-[#0052FF] hover:bg-[#0052FF]/5 text-left transition-all"
              >
                <span className="text-lg">🎸</span>
                <p className="text-xs font-medium text-gray-700 mt-1">Creative</p>
              </button>
              <button
                onClick={() => {
                  setGender('male');
                  setAge('middle-aged');
                  setHairStyle('bald');
                  setFacialHair('beard');
                  setClothing('suit');
                  setExpression('serious');
                  setAccessories(['glasses']);
                }}
                className="p-3 rounded-lg border border-gray-200 hover:border-[#0052FF] hover:bg-[#0052FF]/5 text-left transition-all"
              >
                <span className="text-lg">🧔</span>
                <p className="text-xs font-medium text-gray-700 mt-1">Executive</p>
              </button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

