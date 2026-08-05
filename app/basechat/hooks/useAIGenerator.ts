'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';

export type PostingNetwork = 'base' | 'basecamp' | 'linea' | 'celo' | 'ethereum' | 'worldchain' | 'robinhood';

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
  aiGeneratedContentForCelo: { content: string; isAIGenerated: boolean } | string;
  aiGeneratedContentForEthereum: { content: string; isAIGenerated: boolean } | string;
  aiGeneratedContentForWorldChain: { content: string; isAIGenerated: boolean } | string;
  aiGeneratedContentForRobinhood: { content: string; isAIGenerated: boolean } | string;

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
  const [aiGeneratedContentForCelo, setAiGeneratedContentForCelo] = useState<{ content: string; isAIGenerated: boolean } | string>('');
  const [aiGeneratedContentForEthereum, setAiGeneratedContentForEthereum] = useState<{ content: string; isAIGenerated: boolean } | string>('');
  const [aiGeneratedContentForWorldChain, setAiGeneratedContentForWorldChain] = useState<{ content: string; isAIGenerated: boolean } | string>('');
  const [aiGeneratedContentForRobinhood, setAiGeneratedContentForRobinhood] = useState<{ content: string; isAIGenerated: boolean } | string>('');

  const getSystemMessage = (network: PostingNetwork): string => {
    const baseInstruction = "You are a social media content creator who generates viral, engaging posts that drive interaction and community engagement. Write in a conversational, authentic tone that resonates with crypto/blockchain enthusiasts. Use trending formats, emojis strategically, and include calls-to-action. Keep posts concise but impactful.";

    switch (network) {
      case 'basecamp':
        return `${baseInstruction} Focus on Camp Network's community building aspects, gaming features, and innovative ecosystem developments. Make it sound exciting and community-focused.`;
      case 'linea':
        return `${baseInstruction} Focus on Linea's Layer 2 scaling solutions, fast transactions, low fees, and Ethereum compatibility. Highlight speed and efficiency benefits.`;
      case 'celo':
        return `${baseInstruction} Focus on Celo's mobile-first approach, carbon-negative blockchain, and mission to make financial tools accessible to anyone with a mobile phone. Emphasize global impact and sustainability.`;
      case 'ethereum':
        return `${baseInstruction} Focus on Ethereum's role as the foundation of Web3, smart contracts, DeFi, and NFT ecosystems. Highlight innovation, decentralization, and the future of the internet.`;
      case 'worldchain':
        return `${baseInstruction} Focus on World Chain's mission to bring the next billion users onchain, Coinbase integration, and user-friendly blockchain experience. Emphasize accessibility and global reach.`;
      case 'robinhood':
        return `${baseInstruction} Focus on Robinhood Chain bringing tokenized real-world assets and traditional finance onchain with a familiar, retail-friendly experience. Emphasize accessibility, 24/7 markets and bridging TradFi with crypto.`;
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

      try {
        // Call our API route instead of direct OpenAI client
        const response = await fetch('/api/ai-generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: aiPrompt,
            network: activeNetwork
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate AI content');
        }

        const data = await response.json();
        const generatedPost = data.content;

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
          case 'celo':
            setAiGeneratedContentForCelo(aiGeneratedPost);
            break;
          case 'ethereum':
            setAiGeneratedContentForEthereum(aiGeneratedPost);
            break;
          case 'worldchain':
            setAiGeneratedContentForWorldChain(aiGeneratedPost);
            break;
          case 'robinhood':
            setAiGeneratedContentForRobinhood(aiGeneratedPost);
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
        console.error('AI Generation Error:', apiError);
        const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown API error';
        toast.error(`AI Generation Error: ${errorMessage}`, { id: toastId });
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
      case 'celo':
        setAiGeneratedContentForCelo('');
        break;
      case 'ethereum':
        setAiGeneratedContentForEthereum('');
        break;
      case 'worldchain':
        setAiGeneratedContentForWorldChain('');
        break;
      case 'robinhood':
        setAiGeneratedContentForRobinhood('');
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
      case 'celo':
        content = aiGeneratedContentForCelo;
        break;
      case 'ethereum':
        content = aiGeneratedContentForEthereum;
        break;
      case 'worldchain':
        content = aiGeneratedContentForWorldChain;
        break;
      case 'robinhood':
        content = aiGeneratedContentForRobinhood;
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
    aiGeneratedContentForCelo,
    aiGeneratedContentForEthereum,
    aiGeneratedContentForWorldChain,
    aiGeneratedContentForRobinhood,

    // Functions
    generateAIPost,
    clearGeneratedContent,
    getGeneratedContent
  };
}
