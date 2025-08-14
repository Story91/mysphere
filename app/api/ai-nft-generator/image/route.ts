import { NextRequest, NextResponse } from 'next/server';
import { fal } from '@ai-sdk/fal';
import { experimental_generateImage as generateImage } from 'ai';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.FAL_API_KEY && !process.env.FAL_KEY) {
      return NextResponse.json(
        { error: 'Missing Fal API key. Set FAL_API_KEY or FAL_KEY in your environment.' },
        { status: 500 }
      );
    }
    const { 
      prompt, 
      aspectRatio = '1:1', 
      style = 'realistic',
      styleInPrompt = false,
      modelId = 'fal-ai/fast-sdxl',
      guidanceScale = 7.5,
      steps = 25,
    } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Enhance prompt based on style
    const enhancedPrompt = styleInPrompt ? String(prompt) : enhancePromptForStyle(prompt, style);

    // Prepare provider options depending on model family
    const isSDXL = modelId.includes('fast-sdxl');

    const falOptions: Record<string, any> = isSDXL
      ? {
          // Minimal config for fast-sdxl – pozwól modelowi użyć domyślnych wartości
          image_size: mapAspectRatioToFalSize(aspectRatio),
          format: 'png',
        }
      : {
          aspect_ratio: aspectRatio,
          guidance_scale: Math.max(1, Number(guidanceScale) || 3.5),
          num_inference_steps: Math.max(1, Number(steps) || 28),
          negative_prompt: 'pixelated, blurry, low-quality, distorted, watermark, text, signature, frame, border',
        };

    // Generate image using Fal
    const { image, providerMetadata } = await generateImage({
      model: fal.image(modelId),
      prompt: enhancedPrompt,
      providerOptions: { fal: falOptions as any },
    });

    // Prefer hosted URL from Fal metadata if provided (mniej awaryjne)
    const falImageUrl = (providerMetadata as any)?.fal?.images?.[0]?.url as string | undefined;

    // Handle various image result shapes from AI SDK / Fal
    const anyImage: any = image as any;
    let resolvedImage: string | undefined = falImageUrl
      || (typeof anyImage?.url === 'string' ? anyImage.url : undefined)
      || (typeof anyImage?.base64 === 'string' ? `data:image/png;base64,${anyImage.base64}` : undefined);

    if (!resolvedImage) {
      // Last-resort: try to convert Uint8Array → base64 without Buffer (Edge safe)
      let bytes: Uint8Array | undefined;
      if (image instanceof Uint8Array) {
        bytes = image;
      } else if (typeof image === 'object' && image !== null && 'bytes' in image) {
        bytes = (image as any).bytes as Uint8Array;
      }
      if (bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as unknown as number[]);
        }
        resolvedImage = `data:image/png;base64,${btoa(binary)}`;
      }
    }

    return NextResponse.json({
      success: true,
      image: resolvedImage,
      metadata: {
        originalPrompt: prompt,
        enhancedPrompt,
        aspectRatio,
        style,
        modelId,
        revisedPrompt: providerMetadata?.fal ? String(providerMetadata.fal) : undefined,
      },
    });

  } catch (error) {
    console.error('❌ AI Image Generation Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate image', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function enhancePromptForStyle(prompt: string, style: string): string {
  const styleEnhancements = {
    realistic: 'photorealistic, high quality, professional photography, detailed, sharp focus',
    artistic: 'artistic, creative, expressive, unique style, masterpiece',
    abstract: 'abstract art, geometric, modern, contemporary, artistic interpretation',
    cyberpunk: 'cyberpunk style, neon lights, futuristic, digital art, sci-fi',
    vintage: 'vintage style, retro, nostalgic, classic, aged look',
    minimalist: 'minimalist, clean, simple, elegant, modern design',
    fantasy: 'fantasy art, magical, mystical, enchanted, otherworldly',
    anime: 'anime style, manga, japanese animation, vibrant colors',
  };

  const enhancement = styleEnhancements[style as keyof typeof styleEnhancements] || styleEnhancements.realistic;
  return `${prompt}, ${enhancement}`;
}

function mapAspectRatioToFalSize(ratio: string): string {
  const map: Record<string, string> = {
    '1:1': 'square_hd',
    '4:3': 'landscape_4_3',
    // For 3:4 portrait, fast-sdxl expects 'portrait_4_3'
    '3:4': 'portrait_4_3',
    '16:9': 'landscape_16_9',
    '9:16': 'portrait_16_9',
  };
  return map[ratio] || 'square_hd';
}
