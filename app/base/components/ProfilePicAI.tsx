'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BaseCard, { BaseCardContent, BaseCardHeader } from './BaseCard';
import BaseButton from './BaseButton';
import BaseBadge from './BaseBadge';

interface ProfilePicAIProps {
  onGenerated?: (imageData: string, metadata: any) => void;
}

// Base-themed character presets
const CHARACTER_PRESETS = [
  {
    id: 'base-builder',
    name: 'Base Builder',
    icon: '🔧',
    prompt: 'A futuristic digital avatar of a blockchain developer, wearing blue glasses, surrounded by holographic code, Base blockchain aesthetic, clean minimal design',
  },
  {
    id: 'crypto-whale',
    name: 'Crypto Whale',
    icon: '🐋',
    prompt: 'An elegant whale character in a cosmic blue ocean made of blockchain data, digital art style, Base blue color scheme',
  },
  {
    id: 'onchain-artist',
    name: 'Onchain Artist',
    icon: '🎨',
    prompt: 'A creative digital artist character holding a glowing brush, surrounded by NFT artworks, blue and white color palette, modern digital art',
  },
  {
    id: 'defi-wizard',
    name: 'DeFi Wizard',
    icon: '🧙',
    prompt: 'A mystical wizard character with glowing blue robes, casting spells made of cryptocurrency symbols, magical blockchain theme',
  },
  {
    id: 'nft-collector',
    name: 'NFT Collector',
    icon: '🖼️',
    prompt: 'A sophisticated collector character in a gallery of floating digital art, minimalist style, blue accents, modern aesthetic',
  },
  {
    id: 'base-explorer',
    name: 'Base Explorer',
    icon: '🚀',
    prompt: 'An astronaut character exploring a digital universe of Base blockchain, cosmic blue theme, futuristic design',
  },
];

const STYLE_OPTIONS = [
  { id: 'realistic', name: 'Realistic', icon: '📷' },
  { id: 'anime', name: 'Anime', icon: '🎌' },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: '🌆' },
  { id: '3d-render', name: '3D Render', icon: '🎮' },
  { id: 'pixel-art', name: 'Pixel Art', icon: '👾' },
  { id: 'watercolor', name: 'Watercolor', icon: '🎨' },
];

const ASPECT_RATIOS = [
  { id: '1:1', name: 'Square', width: 512, height: 512 },
  { id: '4:3', name: 'Landscape', width: 640, height: 480 },
  { id: '3:4', name: 'Portrait', width: 480, height: 640 },
];

export default function ProfilePicAI({ onGenerated }: ProfilePicAIProps) {
  const [selectedPreset, setSelectedPreset] = useState(CHARACTER_PRESETS[0]);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState(STYLE_OPTIONS[0]);
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer effect
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
      setElapsedMs(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGenerating]);

  const finalPrompt = useMemo(() => {
    const basePrompt = useCustomPrompt ? customPrompt : selectedPreset.prompt;
    return `${basePrompt}, ${selectedStyle.id} style, high quality, detailed, Base blockchain theme, blue and white color scheme`;
  }, [useCustomPrompt, customPrompt, selectedPreset.prompt, selectedStyle.id]);

  const canGenerate = useMemo(() => {
    if (useCustomPrompt) {
      return customPrompt.trim().length > 10 && !isGenerating;
    }
    return !isGenerating;
  }, [useCustomPrompt, customPrompt, isGenerating]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/ai-nft-generator/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          style: selectedStyle.id,
          aspectRatio: aspectRatio.id,
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
        prompt: finalPrompt,
        style: selectedStyle.id,
        aspectRatio: aspectRatio.id,
        preset: useCustomPrompt ? 'custom' : selectedPreset.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, finalPrompt, selectedStyle.id, aspectRatio.id, selectedPreset.id, useCustomPrompt, onGenerated]);

  const handleDownload = useCallback(() => {
    if (!generatedImage) return;
    
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `base-profile-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generatedImage]);

  return (
    <BaseCard variant="glass" className="overflow-visible">
      <BaseCardHeader className="border-b border-[#0052FF]/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#0052FF] to-[#00A3FF] flex items-center justify-center">
            <span className="text-xl">🎨</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Profile Pic AI</h2>
            <p className="text-sm text-gray-500">Generate your unique Base identity</p>
          </div>
        </div>
      </BaseCardHeader>

      <BaseCardContent className="space-y-6">
        {/* Preset or Custom Toggle */}
        <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setUseCustomPrompt(false)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              !useCustomPrompt
                ? 'bg-white text-[#0052FF] shadow-md'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ✨ Character Presets
          </button>
          <button
            onClick={() => setUseCustomPrompt(true)}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              useCustomPrompt
                ? 'bg-white text-[#0052FF] shadow-md'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ✏️ Custom Prompt
          </button>
        </div>

        {/* Character Presets Grid */}
        <AnimatePresence mode="wait">
          {!useCustomPrompt ? (
            <motion.div
              key="presets"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-2 sm:grid-cols-3 gap-3"
            >
              {CHARACTER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    selectedPreset.id === preset.id
                      ? 'border-[#0052FF] bg-[#0052FF]/5 shadow-lg shadow-[#0052FF]/10'
                      : 'border-gray-200 hover:border-[#0052FF]/50 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-2xl mb-2 block">{preset.icon}</span>
                  <span className="text-sm font-medium text-gray-900">{preset.name}</span>
                </button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="custom"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Describe your ideal profile picture... (e.g., A cyberpunk character with blue neon accents)"
                className="w-full h-32 p-4 rounded-xl border-2 border-gray-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/20 outline-none resize-none transition-all text-gray-900 placeholder-gray-400"
              />
              <p className="mt-2 text-xs text-gray-500">
                Tip: Be descriptive for better results. Minimum 10 characters.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Style Selection */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Art Style</h3>
          <div className="flex flex-wrap gap-2">
            {STYLE_OPTIONS.map((style) => (
              <button
                key={style.id}
                onClick={() => setSelectedStyle(style)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  selectedStyle.id === style.id
                    ? 'bg-[#0052FF] text-white shadow-lg shadow-[#0052FF]/25'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>{style.icon}</span>
                <span>{style.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Aspect Ratio</h3>
          <div className="flex gap-2">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                onClick={() => setAspectRatio(ratio)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  aspectRatio.id === ratio.id
                    ? 'bg-[#0052FF] text-white shadow-lg shadow-[#0052FF]/25'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {ratio.name}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <BaseButton
          onClick={handleGenerate}
          variant="gradient"
          size="lg"
          fullWidth
          loading={isGenerating}
          disabled={!canGenerate}
        >
          {isGenerating ? `Generating... ${(elapsedMs / 1000).toFixed(1)}s` : '✨ Generate Profile Pic'}
        </BaseButton>

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

        {/* Generated Image Preview */}
        <AnimatePresence>
          {generatedImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative"
            >
              <div className="rounded-2xl overflow-hidden border-2 border-[#0052FF]/20 shadow-xl shadow-[#0052FF]/10">
                <img
                  src={generatedImage}
                  alt="Generated Profile"
                  className="w-full h-auto"
                />
              </div>
              <div className="mt-4 flex gap-3">
                <BaseButton
                  onClick={handleDownload}
                  variant="secondary"
                  icon={<span>📥</span>}
                  className="flex-1"
                >
                  Download
                </BaseButton>
                <BaseButton
                  onClick={handleGenerate}
                  variant="outline"
                  icon={<span>🔄</span>}
                  className="flex-1"
                  disabled={isGenerating}
                >
                  Regenerate
                </BaseButton>
              </div>
              <div className="mt-3 flex items-center justify-center">
                <BaseBadge variant="success" icon={<span>✓</span>}>
                  Ready for NFT minting
                </BaseBadge>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </BaseCardContent>
    </BaseCard>
  );
}

