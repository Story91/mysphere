'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';

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
  aiGeneratedContentForBase: string;
  aiGeneratedContentForCamp: string;
  aiGeneratedContentForLinea: string;

  // Functions
  generateAIPost: (activeNetwork: PostingNetwork) => Promise<void>;
  clearGeneratedContent: (network: PostingNetwork) => void;
  getGeneratedContent: (network: PostingNetwork) => string;
}

export function useAIGenerator(): UseAIGeneratorReturn {
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGeneratedContentForBase, setAiGeneratedContentForBase] = useState<string>('');
  const [aiGeneratedContentForCamp, setAiGeneratedContentForCamp] = useState<string>('');
  const [aiGeneratedContentForLinea, setAiGeneratedContentForLinea] = useState<string>('');

  const getSystemMessage = (network: PostingNetwork): string => {
    switch (network) {
      case 'basecamp':
        return "You are an assistant who generates engaging social media posts related to the Camp Network ecosystem. Your posts should be informative, but also friendly and encouraging interaction. Focus on community building, innovation, and the unique features of Camp Network.";
      case 'linea':
        return "You are an assistant who generates engaging social media posts related to the Linea blockchain ecosystem. Your posts should be informative, but also friendly and encouraging interaction. Focus on Layer 2 scaling, Ethereum compatibility, and the unique features of Linea.";
      case 'base':
      default:
        return "You are an assistant who generates engaging social media posts related to the Base blockchain ecosystem. Your posts should be informative, but also friendly and encouraging interaction.";
    }
  };

  const generateAIPost = async (activeNetwork: PostingNetwork) => {
    if (!aiPrompt.trim()) return;

    try {
      setIsGeneratingAI(true);
      const toastId = toast.loading("Generating AI post...");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://basebook.vercel.app',
            'X-Title': 'BaseBook',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: "deepseek/deepseek-r1:free",
            messages: [
              {
                role: "system",
                content: getSystemMessage(activeNetwork)
              },
              {
                role: "user",
                content: aiPrompt
              }
            ],
            temperature: 1,
            top_p: 1,
            repetition_penalty: 1
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('Received API response, status:', response.status);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('API Error:', errorData);
          throw new Error(errorData.error || `Error while generating post (${response.status})`);
        }

        const data = await response.json();
        console.log('Received data:', data);

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error('Invalid response structure:', data);
          throw new Error('Invalid API response');
        }

        const generatedPost = data.choices[0].message.content;
        console.log('Post generated:', generatedPost);

        // Set content based on network
        switch (activeNetwork) {
          case 'basecamp':
            setAiGeneratedContentForCamp(generatedPost);
            break;
          case 'linea':
            setAiGeneratedContentForLinea(generatedPost);
            break;
          case 'base':
          default:
            setAiGeneratedContentForBase(generatedPost);
            break;
        }

        setShowAIModal(false);
        setAiPrompt('');
        toast.success('AI post generated successfully!', { id: toastId });

      } catch (fetchError: unknown) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timeout exceeded');
        }
        throw fetchError;
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
    switch (network) {
      case 'basecamp':
        return aiGeneratedContentForCamp;
      case 'linea':
        return aiGeneratedContentForLinea;
      case 'base':
      default:
        return aiGeneratedContentForBase;
    }
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
