'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";

export interface FalImageGeneratorProps {
	onGenerated: (dataUri: string, metadata: Record<string, unknown>) => void;
	aspectRatio?: string;
	onAspectRatioChange?: (ratio: string) => void;
}

const DEFAULT_MODEL_ID = 'fal-ai/fast-sdxl';

export default function FalImageGenerator({ onGenerated, aspectRatio: parentAspectRatio, onAspectRatioChange }: FalImageGeneratorProps) {
	const [prompt, setPrompt] = useState<string>('');
    const [imageStyle, setImageStyle] = useState<string>('realistic');
    const aspectRatio = parentAspectRatio || '1:1';
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string>('');
	const [elapsedMs, setElapsedMs] = useState<number>(0);
	const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Prompt customization states
    const [hairColor, setHairColor] = useState<string>('brown');
    const [accessories, setAccessories] = useState<string>('none');
    const [outfit, setOutfit] = useState<string>('casual');
    const [mood, setMood] = useState<string>('friendly');

    const styleKeys = ['realistic','artistic','abstract','cyberpunk','vintage','minimalist','fantasy','anime'] as const;
    
    // Function to replace variables in prompt templates
    const applyVariablesToPrompt = (template: string) => {
        return template
            .replace(/{HAIR_COLOR}/g, hairColor)
            .replace(/{ACCESSORIES}/g, accessories === 'none' ? '' : `with ${accessories}`)
            .replace(/{OUTFIT}/g, outfit)
            .replace(/{MOOD}/g, mood);
    };

    const applyStyleToPrompt = (base: string, styleKey: string) => {
        // First apply variables, then style
        const withVariables = applyVariablesToPrompt(base);
        let next = withVariables.trim().replace(/[\s,]+$/, '').replace(/\s+/g, ' ');
        for (const s of styleKeys) {
            const re = new RegExp(`,\\s*${s}$`, 'i');
            if (re.test(next)) next = next.replace(re, '');
        }
        return next ? `${next}, ${styleKey}` : styleKey;
    };

	const canGenerate = useMemo(() => prompt.trim().length > 0 && !isGenerating, [prompt, isGenerating]);

    // Function to get skeleton dimensions based on aspect ratio
    const getSkeletonDimensions = (ratio: string) => {
        const baseWidth = 256; // Base width for skeleton
        switch (ratio) {
            case '1:1': return { width: baseWidth, height: baseWidth };
            case '4:3': return { width: baseWidth, height: Math.round(baseWidth * 3/4) };
            case '3:4': return { width: Math.round(baseWidth * 3/4), height: baseWidth };
            case '16:9': return { width: baseWidth, height: Math.round(baseWidth * 9/16) };
            case '9:16': return { width: Math.round(baseWidth * 9/16), height: baseWidth };
            default: return { width: baseWidth, height: baseWidth };
        }
    };

	useEffect(() => {
		if (!isGenerating) return;
		const start = Date.now();
		timerRef.current = setInterval(() => setElapsedMs(Date.now() - start), 100);
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
			timerRef.current = null;
		};
	}, [isGenerating]);

	useEffect(() => {
		if (!isGenerating) setElapsedMs(0);
	}, [isGenerating]);

	const handleGenerate = useCallback(async () => {
		if (!canGenerate) return;
		setIsGenerating(true);
		setErrorMessage('');
		try {
            const styledPrompt = applyStyleToPrompt(prompt, imageStyle);
			const response = await fetch('/api/ai-nft-generator/image', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
                    prompt: styledPrompt,
					style: imageStyle,
					styleInPrompt: true,
					aspectRatio,
					modelId: DEFAULT_MODEL_ID,
					guidanceScale: 7.5,
					steps: 25,
				}),
			});

			const data = await response.json();
			if (!response.ok || !data?.image) {
				throw new Error(data?.error || `Server error: ${response.status}`);
			}
            onGenerated(String(data.image), {
				...(data?.metadata ?? {}),
				style: imageStyle,
				aspectRatio,
				modelId: DEFAULT_MODEL_ID,
			});
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
		} finally {
			setIsGenerating(false);
		}
    }, [canGenerate, prompt, imageStyle, aspectRatio, onGenerated]);

	return (
		<div className="space-y-4">
			<div>
				<label className="block text-purple-200 text-sm font-medium mb-2">Describe the image you want to create:</label>
				<textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="A futuristic cityscape at sunset..."
					className="w-full p-3 bg-black/40 border border-purple-500/30 rounded-lg text-white placeholder-purple-300/50 focus:border-purple-500/60 focus:outline-none resize-none"
					rows={3}
				/>

                {/* Prompt Customization Menubar */}
                <div className="mt-4 p-2 sm:p-3 bg-black/20 border border-purple-500/20 rounded-lg">
                    <h4 className="text-xs sm:text-sm font-medium text-purple-200 mb-2 sm:mb-3">Customize Character:</h4>
                    <Menubar className="bg-transparent border-purple-500/30 h-auto">
                        <MenubarMenu>
                            <MenubarTrigger className="text-purple-200 hover:bg-purple-500/20 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto">
                                <span className="hidden sm:inline">Hair Color: </span>
                                <span className="sm:hidden">Hair: </span>
                                {hairColor}
                            </MenubarTrigger>
                            <MenubarContent className="bg-black/90 border-purple-500/30">
                                {['brown', 'blonde', 'black', 'red', 'silver', 'blue', 'green', 'purple'].map((color) => (
                                    <MenubarItem 
                                        key={color}
                                        onClick={() => setHairColor(color)}
                                        className="text-purple-200 hover:bg-purple-500/20 capitalize"
                                    >
                                        {color}
                                    </MenubarItem>
                                ))}
                            </MenubarContent>
                        </MenubarMenu>
                        
                        <MenubarMenu>
                            <MenubarTrigger className="text-purple-200 hover:bg-purple-500/20 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto">
                                <span className="hidden sm:inline">Accessories: </span>
                                <span className="sm:hidden">Acc: </span>
                                {accessories}
                            </MenubarTrigger>
                            <MenubarContent className="bg-black/90 border-purple-500/30">
                                {['none', 'glasses', 'hat', 'backpack', 'binoculars', 'cape', 'magic staff', 'compass'].map((accessory) => (
                                    <MenubarItem 
                                        key={accessory}
                                        onClick={() => setAccessories(accessory)}
                                        className="text-purple-200 hover:bg-purple-500/20 capitalize"
                                    >
                                        {accessory}
                                    </MenubarItem>
                                ))}
                            </MenubarContent>
                        </MenubarMenu>

                        <MenubarMenu>
                            <MenubarTrigger className="text-purple-200 hover:bg-purple-500/20 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto">
                                <span className="hidden sm:inline">Outfit: </span>
                                <span className="sm:hidden">Outfit: </span>
                                {outfit}
                            </MenubarTrigger>
                            <MenubarContent className="bg-black/90 border-purple-500/30">
                                {['casual', 'formal', 'adventure', 'military', 'mystical', 'winter', 'summer', 'tactical'].map((outfitType) => (
                                    <MenubarItem 
                                        key={outfitType}
                                        onClick={() => setOutfit(outfitType)}
                                        className="text-purple-200 hover:bg-purple-500/20 capitalize"
                                    >
                                        {outfitType}
                                    </MenubarItem>
                                ))}
                            </MenubarContent>
                        </MenubarMenu>

                        <MenubarMenu>
                            <MenubarTrigger className="text-purple-200 hover:bg-purple-500/20 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto">
                                <span className="hidden sm:inline">Mood: </span>
                                <span className="sm:hidden">Mood: </span>
                                {mood}
                            </MenubarTrigger>
                            <MenubarContent className="bg-black/90 border-purple-500/30">
                                {['friendly', 'confident', 'mysterious', 'playful', 'serious', 'wise', 'brave', 'calm'].map((moodType) => (
                                    <MenubarItem 
                                        key={moodType}
                                        onClick={() => setMood(moodType)}
                                        className="text-purple-200 hover:bg-purple-500/20 capitalize"
                                    >
                                        {moodType}
                                    </MenubarItem>
                                ))}
                            </MenubarContent>
                        </MenubarMenu>
                    </Menubar>
                </div>

                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
					{[
                        { label: 'Bear Scout', style: 'realistic', prompt: 'Cute anthropomorphic bear character with {HAIR_COLOR} fur wearing {OUTFIT} scout uniform, stylized as a 3D collectible toy, large expressive eyes, detailed fur textures, Pixar style, {MOOD} heroic pose with camping badge {ACCESSORIES}, cinematic lighting, ultra realistic fabric materials, mountain forest background with camp tents, highly detailed, 8k, ultra sharp, trending on artstation' },
                        { label: 'Fox Explorer', style: 'realistic', prompt: 'Cute anthropomorphic fox character with {HAIR_COLOR} fur and explorer hat, stylized as a 3D collectible toy, large expressive eyes, detailed fur textures, {MOOD} adventure pose {ACCESSORIES}, cinematic lighting, ultra realistic materials, wilderness valley background with hiking trails, highly detailed, 8k, ultra sharp, trending on artstation' },
                        { label: 'Owl Ranger', style: 'fantasy', prompt: 'Cute anthropomorphic owl character with {HAIR_COLOR} feathers wearing {OUTFIT} park ranger uniform, stylized as a 3D collectible toy, large expressive eyes, detailed feather textures, Pixar style, {MOOD} wise guardian pose {ACCESSORIES}, cinematic lighting, ultra realistic fabric materials, moonlit forest background with watchtower, highly detailed, 8k, ultra sharp, trending on artstation' },
                        { label: 'Human Scout', style: 'realistic', prompt: 'Cute young scout character with {HAIR_COLOR} hair and {OUTFIT} scout outfit, stylized as a 3D collectible toy, large expressive eyes, detailed clothing textures, Pixar style, {MOOD} adventurous pose {ACCESSORIES}, cinematic lighting, ultra realistic fabric materials, pine forest trail background with mountains, highly detailed, 8k, ultra sharp, trending on artstation' },
                        { label: 'Wolf Guardian', style: 'fantasy', prompt: 'Cute anthropomorphic wolf character with {HAIR_COLOR} fur and {OUTFIT} nature guardian outfit, stylized as a 3D collectible toy, large expressive eyes, detailed fur textures, {MOOD} protective stance {ACCESSORIES}, cinematic lighting, ultra realistic materials, ancient forest background with stone ruins, highly detailed, 8k, ultra sharp, trending on artstation' },
                        { label: 'Nature Girl', style: 'realistic', prompt: 'Cute nature girl character with {HAIR_COLOR} hair and field notebook, wearing {OUTFIT} research outfit, stylized as a 3D collectible toy, large expressive eyes, detailed clothing textures, Pixar style, {MOOD} discovery pose {ACCESSORIES}, cinematic lighting, ultra realistic materials, wildflower meadow background with research station, highly detailed, 8k, ultra sharp, trending on artstation' },
                        { label: 'Forest Elf', style: 'fantasy', prompt: 'Cute anthropomorphic forest elf character with {HAIR_COLOR} hair and nature magic staff, wearing {OUTFIT} mystical robes, stylized as a 3D collectible toy, large expressive eyes, detailed mystical textures, Pixar style, {MOOD} magical pose {ACCESSORIES}, cinematic lighting, ultra realistic fabric materials, enchanted forest background with glowing plants, highly detailed, 8k, ultra sharp, trending on artstation' },
                        { label: 'Mountain Dwarf', style: 'fantasy', prompt: 'Cute anthropomorphic mountain dwarf character with {HAIR_COLOR} beard and climbing gear, wearing {OUTFIT} mountain outfit, stylized as a 3D collectible toy, large expressive eyes, detailed beard and equipment textures, Pixar style, {MOOD} climbing pose {ACCESSORIES}, cinematic lighting, ultra realistic materials, alpine peak background with snow and crystals, highly detailed, 8k, ultra sharp, trending on artstation' },
					].map((p) => (
						<button
							key={p.label}
                            onClick={() => {
                                if (p.style) setImageStyle(p.style);
                                setPrompt((_) => applyStyleToPrompt(p.prompt, p.style));
                            }}
							className="text-xs sm:text-sm px-2 py-1 rounded-md bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-100 transition-colors"
							type="button"
						>
							{p.label}
						</button>
					))}
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<label className="block text-purple-200 text-sm font-medium mb-2">Style:</label>
					<select
						value={imageStyle}
                        onChange={(e) => {
                            const val = e.target.value;
                            setImageStyle(val);
                            setPrompt((prev) => applyStyleToPrompt(prev, val));
                        }}
						className="w-full p-2 bg-black/40 border border-purple-500/30 rounded-lg text-white focus:border-purple-500/60 focus:outline-none"
					>
						<option value="realistic">Realistic</option>
						<option value="artistic">Artistic</option>
						<option value="abstract">Abstract</option>
						<option value="cyberpunk">Cyberpunk</option>
						<option value="vintage">Vintage</option>
						<option value="minimalist">Minimalist</option>
						<option value="fantasy">Fantasy</option>
						<option value="anime">Anime</option>
					</select>
				</div>
				<div>
					<label className="block text-purple-200 text-sm font-medium mb-2">Aspect Ratio:</label>
					<select
						value={aspectRatio}
						onChange={(e) => onAspectRatioChange?.(e.target.value)}
						className="w-full p-2 bg-black/40 border border-purple-500/30 rounded-lg text-white focus:border-purple-500/60 focus:outline-none"
					>
						<option value="1:1">Square (1:1)</option>
						<option value="4:3">Landscape (4:3)</option>
						<option value="3:4">Portrait (3:4)</option>
						<option value="16:9">Widescreen (16:9)</option>
						<option value="9:16">Vertical (9:16)</option>
					</select>
				</div>
			</div>

            {/* Advanced controls (guidance/steps) usunięte dla prostoty fast-sdxl */}

			<motion.button
				onClick={handleGenerate}
				disabled={!canGenerate}
				whileHover={{ scale: 1.02 }}
				whileTap={{ scale: 0.98 }}
				className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
			>
				{isGenerating && (
					<>
						<div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
						<span>{(elapsedMs / 1000).toFixed(1)}s</span>
					</>
				)}
				{!isGenerating && 'Generate AI Image'}
			</motion.button>

			{errorMessage && (
				<div className="text-red-300 text-sm">{errorMessage}</div>
			)}
		</div>
	);
}


