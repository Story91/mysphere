'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import OpenAI from 'openai';

export type PostingNetwork = 'base' | 'basecamp' | 'linea';

interface UseAIGeneratorReturn {
  // Modal state
  showAIModal: boolean;
  setShowAIModal: (show: boolean) => void;

  // AI generation state
  aiPrompt: string;
  setAiPrompt: (prompt: string) => void;
  isGeneratingAI: boolean;

  // Generated content for each network
  aiGeneratedContentForBase: { content: string; isAIGenerated: boolean } | string;
  aiGeneratedContentForCamp: { content: string; isAIGenerated: boolean } | string;
  aiGeneratedContentForLinea: { content: string; isAIGenerated: boolean } | string;

  // Functions
  generateAIPost: (activeNetwork: PostingNetwork) => Promise<void>;
  clearGeneratedContent: (network: PostingNetwork) => void;
  getGeneratedContent: (network: PostingNetwork) => string;
}

export function useAIGenerator(): UseAIGeneratorReturn {
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGeneratedContentForBase, setAiGeneratedContentForBase] = useState<{ content: string; isAIGenerated: boolean } | string>('');
  const [aiGeneratedContentForCamp, setAiGeneratedContentForCamp] = useState<{ content: string; isAIGenerated: boolean } | string>('');
  const [aiGeneratedContentForLinea, setAiGeneratedContentForLinea] = useState<{ content: string; isAIGenerated: boolean } | string>('');

  const getSystemMessage = (network: PostingNetwork): string => {
    const baseInstruction = "You are a social media content creator who generates viral, engaging posts that drive interaction and community engagement. Write in a conversational, authentic tone that resonates with crypto/blockchain enthusiasts. Use trending formats, emojis strategically, and include calls-to-action. Keep posts concise but impactful.";

    switch (network) {
      case 'basecamp':
        return `${baseInstruction} Focus on Camp Network's community building aspects, gaming features, and innovative ecosystem developments. Make it sound exciting and community-focused.`;
      case 'linea':
        return `${baseInstruction} Focus on Linea's Layer 2 scaling solutions, fast transactions, low fees, and Ethereum compatibility. Highlight speed and efficiency benefits.`;
      case 'base':
      default:
        return `${baseInstruction} Focus on Base blockchain's developer-friendly ecosystem, Coinbase integration, and growing dApp ecosystem. Emphasize accessibility and mainstream adoption.`;
    }
  };

  const generateAIPost = async (activeNetwork: PostingNetwork) => {
    if (!aiPrompt.trim()) return;

    try {
      setIsGeneratingAI(true);
      const toastId = toast.loading("Generating AI post...");

      // Initialize OpenAI client with the new API key
      const client = new OpenAI({
        apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY_POST || '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',
        dangerouslyAllowBrowser: true
      });

      try {
        const response = await client.responses.create({
          model: "gpt-5-nano",
          tools: [
            {
              type: "web_search_preview",
              search_context_size: "low"
            }
          ],
          instructions: getSystemMessage(activeNetwork),
          input: aiPrompt
        });

        console.log('Received OpenAI response:', response);

        // Get the generated content from response.output_text
        const generatedPost = response.output_text || 'No content generated';
        console.log('Post generated:', generatedPost);

        // Set content based on network with AI flag
        const aiGeneratedPost = {
          content: generatedPost,
          isAIGenerated: true
        };

        switch (activeNetwork) {
          case 'basecamp':
            setAiGeneratedContentForCamp(aiGeneratedPost);
            break;
          case 'linea':
            setAiGeneratedContentForLinea(aiGeneratedPost);
            break;
          case 'base':
          default:
            setAiGeneratedContentForBase(aiGeneratedPost);
            break;
        }

        setShowAIModal(false);
        setAiPrompt('');
        toast.success('AI post generated successfully with web search!', { id: toastId });

      } catch (apiError: unknown) {
        console.error('OpenAI API Error:', apiError);
        const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown API error';
        toast.error(`OpenAI API Error: ${errorMessage}`, { id: toastId });
      }

    } catch (error: unknown) {
      console.error('Error generating AI post:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`An error occurred while generating the post: ${errorMessage}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const clearGeneratedContent = (network: PostingNetwork) => {
    switch (network) {
      case 'basecamp':
        setAiGeneratedContentForCamp('');
        break;
      case 'linea':
        setAiGeneratedContentForLinea('');
        break;
      case 'base':
      default:
        setAiGeneratedContentForBase('');
        break;
    }
  };

  const getGeneratedContent = (network: PostingNetwork): string => {
    let content;
    switch (network) {
      case 'basecamp':
        content = aiGeneratedContentForCamp;
        break;
      case 'linea':
        content = aiGeneratedContentForLinea;
        break;
      case 'base':
      default:
        content = aiGeneratedContentForBase;
        break;
    }

    // Handle both old string format and new object format
    if (typeof content === 'string') {
      return content;
    }
    return content?.content || '';
  };

  return {
    // Modal state
    showAIModal,
    setShowAIModal,

    // AI generation state
    aiPrompt,
    setAiPrompt,
    isGeneratingAI,

    // Generated content for each network
    aiGeneratedContentForBase,
    aiGeneratedContentForCamp,
    aiGeneratedContentForLinea,

    // Functions
    generateAIPost,
    clearGeneratedContent,
    getGeneratedContent
  };
}
