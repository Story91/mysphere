'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
// Warstwa tozsamosci na wagmi/viem - zamiennik @coinbase/onchainkit/identity
import { useName } from '../../../utils/identity';
import { base } from 'wagmi/chains';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BaseCard, { BaseCardContent, BaseCardHeader } from '../BaseCard';
import BaseButton from '../BaseButton';
import BaseBadge from '../BaseBadge';
import AvatarPreview from './AvatarPreview';
import DiceBearPanel from './DiceBearPanel';
import AIPromptBuilder from './AIPromptBuilder';
import {
  DiceBearConfig,
  AIArtStyle,
  AI_STYLES,
  BACKGROUND_OPTIONS,
} from './types';

interface AvatarCreatorProps {
  onGenerated?: (imageData: string, metadata: any) => void;
  onDiceBearChange?: (diceBearUrl: string, config: DiceBearConfig) => void;
}

type CreatorMode = 'base-avatar' | 'ai-studio';

// Default DiceBear config
const DEFAULT_DICEBEAR_CONFIG: DiceBearConfig = {
  seed: 'base-user',
  style: 'adventurer',
  backgroundColor: 'white',
  flip: false,
  radius: 0,
};

export default function AvatarCreator({ onGenerated, onDiceBearChange }: AvatarCreatorProps) {
  // Get user's basename
  const { address } = useAccount();
  const { data: baseName } = useName({ address: address as `0x${string}`, chain: base });
  
  // Creator mode: Base Avatar (DiceBear) or AI Studio
  const [creatorMode, setCreatorMode] = useState<CreatorMode>('base-avatar');
  
  // Base Avatar configuration state (DiceBear) - simple config
  const [diceBearConfig, setDiceBearConfig] = useState<DiceBearConfig>(DEFAULT_DICEBEAR_CONFIG);
  
  // AI Studio state (separate from Base Avatar)
  const [selectedAIStyle, setSelectedAIStyle] = useState<AIArtStyle>('3d-cartoon');
  const [aiPrompt, setAiPrompt] = useState<string>('');
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer effect for generation
  useEffect(() => {
    if (isGenerating) {
      const start = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - start);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGenerating]);

  // Notify parent when DiceBear config changes
  // For ProfileCard we don't include backgroundColor - let the card handle the background
  useEffect(() => {
    if (onDiceBearChange) {
      const params = new URLSearchParams();
      params.set('seed', diceBearConfig.seed);
      params.set('scale', '90');
      if (diceBearConfig.flip) params.set('flip', 'true');
      if (diceBearConfig.radius > 0) params.set('radius', diceBearConfig.radius.toString());
      
      // No backgroundColor - transparent avatar for ProfileCard
      const url = `https://api.dicebear.com/7.x/${diceBearConfig.style}/svg?${params.toString()}`;
      onDiceBearChange(url, diceBearConfig);
    }
  }, [diceBearConfig, onDiceBearChange]);

  // Generate AI image
  const handleGenerate = useCallback(async () => {
    if (!aiPrompt.trim()) {
      setError('Please build your prompt first');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setElapsedMs(0);

    try {
      // Add style suffix to prompt
      const styleConfig = AI_STYLES.find(s => s.id === selectedAIStyle);
      const fullPrompt = `${aiPrompt}, ${styleConfig?.promptSuffix || ''}`;

      const response = await fetch('/api/ai-nft-generator/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fullPrompt,
          style: selectedAIStyle,
          aspectRatio: '1:1',
          modelId: 'fal-ai/fast-sdxl',
          guidanceScale: 7.5,
          steps: 25,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.image) {
        throw new Error(data?.error || `Server error: ${response.status}`);
      }

      setGeneratedImage(data.image);
      onGenerated?.(data.image, {
        prompt: fullPrompt,
        style: selectedAIStyle,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsGenerating(false);
    }
  }, [aiPrompt, selectedAIStyle, onGenerated]);

  // Randomize Base Avatar - random seed + random style
  const handleRandomize = useCallback(() => {
    const randomSeed = `random-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const randomStyleIndex = Math.floor(Math.random() * 26); // Number of DiceBear styles
    const styles = ['adventurer', 'adventurer-neutral', 'avataaars', 'avataaars-neutral', 'big-ears', 'big-ears-neutral', 'big-smile', 'bottts', 'bottts-neutral', 'croodles', 'croodles-neutral', 'fun-emoji', 'icons', 'identicon', 'initials', 'lorelei', 'lorelei-neutral', 'micah', 'miniavs', 'notionists', 'notionists-neutral', 'open-peeps', 'personas', 'pixel-art', 'pixel-art-neutral', 'rings'] as const;
    const randomStyle = styles[randomStyleIndex];
    setDiceBearConfig(prev => ({ ...prev, seed: randomSeed, style: randomStyle }));
  }, []);

  // Download Base Avatar
  const handleDownloadBaseAvatar = useCallback(() => {
    const bgOption = BACKGROUND_OPTIONS.find(bg => bg.id === diceBearConfig.backgroundColor);
    const bgColor = bgOption?.type === 'solid' ? bgOption.value : 'ffffff';
    
    const params = new URLSearchParams();
    params.set('seed', diceBearConfig.seed);
    params.set('backgroundColor', bgColor);
    if (diceBearConfig.flip) params.set('flip', 'true');
    if (diceBearConfig.radius > 0) params.set('radius', diceBearConfig.radius.toString());
    
    const url = `https://api.dicebear.com/7.x/${diceBearConfig.style}/png?${params.toString()}&size=512`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `base-avatar-${diceBearConfig.seed}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [diceBearConfig]);

  // Download AI Generated image
  const handleDownloadAI = useCallback(() => {
    if (!generatedImage) return;
    
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `base-avatar-ai-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generatedImage]);

  return (
    <BaseCard variant="glass" className="overflow-visible">

      <BaseCardContent className="space-y-6">
        {/* Mode Switcher: Base Avatar vs AI Studio */}
        <Tabs 
          value={creatorMode} 
          onValueChange={(v) => setCreatorMode(v as CreatorMode)}
          className="w-full"
        >
          <div className="relative group">
            {/* Electric Border - Rotating gradient - jedna ramka wokół całej grupy */}
            <div className="absolute -inset-[2px] rounded-2xl overflow-hidden">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0%,#0052FF_10%,#00FF00_20%,#00A3FF_30%,transparent_40%)]"
              />
            </div>
            <TabsList className="relative w-full grid grid-cols-2 h-14 p-1 bg-black rounded-2xl gap-0">
              <TabsTrigger 
                value="base-avatar"
                className="flex items-center justify-center h-full bg-black rounded-l-xl text-base font-bold tracking-wide data-[state=active]:text-[#0052FF] data-[state=inactive]:text-gray-400 transition-colors relative after:absolute after:right-0 after:top-1/2 after:-translate-y-1/2 after:w-px after:h-2/3 after:bg-gray-700"
              >
                Base Avatar
              </TabsTrigger>
              <TabsTrigger 
                value="ai-studio"
                className="flex items-center justify-center h-full bg-black rounded-r-xl text-base font-bold tracking-wide data-[state=active]:text-[#FF00FF] data-[state=inactive]:text-gray-400 transition-colors"
              >
                AI Studio
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ==================== BASE AVATAR MODE ==================== */}
          <TabsContent value="base-avatar" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Preview */}
              <div className="flex flex-col items-center gap-4">
                <AvatarPreview
                  config={diceBearConfig}
                  size={300}
                  isLoading={false}
                />
                
                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleRandomize}
                    className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <span>🎲</span>
                    <span>Random</span>
                  </button>
                  <button
                    onClick={handleDownloadBaseAvatar}
                    className="px-4 py-2.5 rounded-xl bg-[#0052FF] hover:bg-[#0052FF]/90 text-white text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-[#0052FF]/20"
                  >
                    <span>📥</span>
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Right: DiceBear Panel */}
              <div className="bg-gray-50/50 rounded-2xl p-4 border border-gray-100">
                <DiceBearPanel
                  config={diceBearConfig}
                  onConfigChange={setDiceBearConfig}
                  baseName={baseName}
                />
              </div>
            </div>

            {/* Ready badge */}
            <div className="mt-6 flex items-center justify-center">
              <BaseBadge variant="info" icon={<span>💡</span>}>
                Switch to AI Studio for custom artistic avatars with full control
              </BaseBadge>
            </div>
          </TabsContent>

          {/* ==================== AI STUDIO MODE ==================== */}
          <TabsContent value="ai-studio" className="mt-6 space-y-6">
            {/* AI Preview - same position as Base Avatar */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                {/* Glow effect behind avatar */}
                <div 
                  className="absolute rounded-full blur-3xl opacity-30"
                  style={{
                    width: 208,
                    height: 208,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: `radial-gradient(circle, #0052FF 0%, transparent 70%)`,
                  }}
                />
                
                {/* Avatar frame */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="relative rounded-2xl overflow-hidden border-4 border-white shadow-2xl bg-gradient-to-br from-gray-100 to-gray-200"
                  style={{ width: 260, height: 260 }}
                >
                  {isGenerating ? (
                    /* Loading state */
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                      <div className="relative">
                        <div className="w-16 h-16 border-4 border-[#0052FF]/20 rounded-full" />
                        <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-[#0052FF] rounded-full animate-spin" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-gray-600">Generating with AI...</p>
                      <p className="mt-1 text-xs text-gray-400">{(elapsedMs / 1000).toFixed(1)}s</p>
                    </div>
                  ) : generatedImage ? (
                    /* Generated image */
                    <motion.img
                      key="generated"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      src={generatedImage}
                      alt="AI Generated Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    /* Placeholder silhouette */
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#0052FF]/5 via-white to-[#6A8BFF]/10">
                      {/* Silhouette SVG */}
                      <svg 
                        viewBox="0 0 100 100" 
                        className="w-32 h-32 text-[#0052FF]/20"
                        fill="currentColor"
                      >
                        {/* Head */}
                        <circle cx="50" cy="30" r="18" />
                        {/* Body */}
                        <ellipse cx="50" cy="75" rx="28" ry="22" />
                        {/* Neck */}
                        <rect x="42" y="45" width="16" height="12" rx="2" />
                      </svg>
                      <p className="mt-2 text-xs text-gray-400 text-center px-4">
                        Build your prompt below<br/>and generate AI avatar
                      </p>
                    </div>
                  )}
                </motion.div>
              </div>
              
              {/* Action buttons under preview */}
              <div className="flex gap-2">
                {generatedImage ? (
                  <>
                    <button
                      onClick={handleDownloadAI}
                      className="px-4 py-2.5 rounded-xl bg-[#0052FF] hover:bg-[#0052FF]/90 text-white text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-[#0052FF]/20"
                    >
                      <span>📥</span>
                      <span>Download</span>
                    </button>
                    <button
                      onClick={() => setGeneratedImage(null)}
                      className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      <span>🗑️</span>
                      <span>Clear</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !aiPrompt.trim()}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-[#0052FF]/30 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <span>✨</span>
                        <span>Generate Avatar</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* AI Style Selector */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-3 block">Choose AI Art Style</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                {AI_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedAIStyle(style.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                      selectedAIStyle === style.id
                        ? 'border-[#0052FF] bg-[#0052FF]/5 shadow-lg shadow-[#0052FF]/10'
                        : 'border-gray-200 hover:border-[#0052FF]/50 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl">{style.icon}</span>
                    <span className="text-[10px] font-medium text-gray-700 text-center leading-tight">{style.name}</span>
                  </button>
                ))}
              </div>
              
              {/* Style description + Prompt Preview */}
              <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {AI_STYLES.find(s => s.id === selectedAIStyle)?.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {AI_STYLES.find(s => s.id === selectedAIStyle)?.description}
                    </p>
                  </div>
                </div>
                
                {/* AI Prompt Preview */}
                {aiPrompt && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-xs font-medium text-gray-500 mb-1">Current Prompt:</p>
                    <p className="text-xs text-gray-600 font-mono bg-white p-2 rounded-lg border border-gray-100 break-words">
                      {aiPrompt}
                      <span className="text-[#0052FF]">, {AI_STYLES.find(s => s.id === selectedAIStyle)?.promptSuffix?.slice(0, 50)}...</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Prompt Builder - completely separate from DiceBear */}
            <AIPromptBuilder
              onPromptChange={setAiPrompt}
              selectedStyle={selectedAIStyle}
            />

            {/* Success message when generated */}
            {generatedImage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center"
              >
                <BaseBadge variant="success" icon={<span>✓</span>}>
                  Avatar generated! Ready for NFT minting
                </BaseBadge>
              </motion.div>
            )}

            {/* Info about generation */}
            {!aiPrompt.trim() && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <p className="text-xs text-amber-700">
                  💡 Build your character description above to enable the Generate button
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-red-50 border border-red-200"
              >
                <p className="text-red-600 text-sm">{error}</p>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </BaseCardContent>
    </BaseCard>
  );
}
