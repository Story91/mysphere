'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export interface FalImageGeneratorProps {
	onGenerated: (dataUri: string, metadata: Record<string, unknown>) => void;
}

const DEFAULT_MODEL_ID = 'fal-ai/fast-sdxl';

export default function FalImageGenerator({ onGenerated }: FalImageGeneratorProps) {
	const [prompt, setPrompt] = useState<string>('');
    const [imageStyle, setImageStyle] = useState<string>('realistic');
    const [aspectRatio, setAspectRatio] = useState<string>('1:1');
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
	const [errorMessage, setErrorMessage] = useState<string>('');
	const [elapsedMs, setElapsedMs] = useState<number>(0);
	const timerRef = useRef<NodeJS.Timeout | null>(null);

    const styleKeys = ['realistic','artistic','abstract','cyberpunk','vintage','minimalist','fantasy','anime'] as const;
    const applyStyleToPrompt = (base: string, styleKey: string) => {
        let next = base.trim().replace(/[\s,]+$/, '');
        for (const s of styleKeys) {
            const re = new RegExp(`,\\s*${s}$`, 'i');
            if (re.test(next)) next = next.replace(re, '');
        }
        return next ? `${next}, ${styleKey}` : styleKey;
    };

	const canGenerate = useMemo(() => prompt.trim().length > 0 && !isGenerating, [prompt, isGenerating]);

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
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
					{[
                        { label: 'Chibi fox', style: 'anime', prompt: 'Chibi fox character avatar, centered headshot, big expressive eyes, cute smile, clean pastel background, thick outline, vector art, sticker style, smooth shading, high detail, no text, no watermark' },
                        { label: 'Robot boy', style: 'artistic', prompt: 'Friendly robot boy character avatar, head and shoulders, cartoon style, glossy metal with soft reflections, simple gradient background, bold outline, high detail, no text, no watermark' },
                        { label: 'Pirate kid', style: 'anime', prompt: 'Cartoon pirate kid avatar, headshot, eye patch, striped shirt, simple blue background, bold outline, cel shading, cute expression, no text, no watermark' },
                        { label: 'Wizard cat', style: 'fantasy', prompt: 'Wizard cat character avatar wearing hat and cape, centered headshot, tiny sparkles, flat clean background, sticker style, vector look, no text, no watermark' },
                        { label: 'Cyber girl', style: 'cyberpunk', prompt: 'Cyberpunk girl character avatar, neon accents and holographic hair, centered portrait, clean dark gradient background, bold outline, high detail, no text, no watermark' },
                        { label: 'Samurai panda', style: 'fantasy', prompt: 'Samurai panda avatar, head and shoulders, lacquered armor details, plain background, cartoon style, strong outline, no text, no watermark' },
                        { label: 'Astronaut kid', style: 'artistic', prompt: 'Astronaut kid avatar inside helmet, centered face, subtle reflections on visor, plain background, cute cartoon style, bold outline, no text, no watermark' },
                        { label: 'Retro hero', style: 'artistic', prompt: 'Retro pixel-art hero avatar, centered head, crisp pixel grid, flat background, no text, no watermark' },
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
						onChange={(e) => setAspectRatio(e.target.value)}
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


