'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { PostingNetwork } from '../hooks/useAIGenerator';
import { Badge } from '@/components/ui/badge';

interface AIPostGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  activeNetwork: PostingNetwork;
  aiPrompt: string;
  setAiPrompt: (prompt: string) => void;
  isGeneratingAI: boolean;
  onGenerate: () => void;
}

export default function AIPostGenerator({
  isOpen,
  onClose,
  activeNetwork,
  aiPrompt,
  setAiPrompt,
  isGeneratingAI,
  onGenerate
}: AIPostGeneratorProps) {

  const getNetworkTitle = (network: PostingNetwork): string => {
    switch (network) {
      case 'basecamp':
        return 'Camp';
      case 'linea':
        return 'Linea';
      case 'base':
      default:
        return 'Base';
    }
  };

  const getNetworkDescription = (network: PostingNetwork): string => {
    switch (network) {
      case 'basecamp':
        return 'Let AI help you create engaging Camp Network content with real-time web search';
      case 'linea':
        return 'Let AI help you create engaging Linea blockchain content with real-time web search';
      case 'base':
      default:
        return 'Let AI help you create engaging Base blockchain content with real-time web search';
    }
  };

  const getNetworkPlaceholder = (network: PostingNetwork): string => {
    switch (network) {
      case 'basecamp':
        return "I'm your personal Camp Network agent. How can I assist you with creating engaging content for the Camp community today?";
      case 'linea':
        return "I'm your personal Linea blockchain agent. How can I assist you with creating engaging content about Linea Layer 2 today?";
      case 'base':
      default:
        return "I'm your personal Base network agent. How can I assist you with creating engaging content today?";
    }
  };

  const getNetworkGradient = (network: PostingNetwork) => {
    switch (network) {
      case 'basecamp':
        return {
          background: 'bg-gradient-to-br from-black/90 to-orange-900/90',
          border: 'border-orange-500/30',
          shadow: 'shadow-[0_0_30px_rgba(249,115,22,0.3)]',
          titleGradient: 'bg-gradient-to-r from-orange-400 to-yellow-400',
          inputGradient: 'bg-gradient-to-r from-black/50 to-orange-900/50 border-orange-500/20 focus:ring-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.1)]',
          textColor: 'text-orange-400'
        };
      case 'linea':
        return {
          background: 'bg-black/95 backdrop-blur-xl',
          border: 'border-cyan-400/30',
          shadow: 'shadow-[0_0_30px_rgba(34,211,238,0.2)]',
          titleGradient: 'bg-gradient-to-r from-cyan-400 to-teal-400',
          inputGradient: 'bg-black/80 border-cyan-400/30 focus:ring-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.1)]',
          textColor: 'text-cyan-400'
        };
      case 'base':
      default:
        return {
          background: 'bg-white/95 backdrop-blur-xl',
          border: 'border-blue-200/50',
          shadow: 'shadow-[0_0_30px_rgba(0,82,255,0.15)]',
          titleGradient: 'bg-gradient-to-r from-blue-600 to-blue-800',
          inputGradient: 'bg-white/90 border-blue-200/50 focus:ring-blue-500/30 focus:border-blue-400 shadow-[0_0_15px_rgba(0,82,255,0.1)]',
          textColor: 'text-blue-600'
        };
    }
  };

  const networkStyles = getNetworkGradient(activeNetwork);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className={`${networkStyles.background} backdrop-blur-xl rounded-2xl p-6 max-w-md w-full mx-4 border ${networkStyles.border} ${networkStyles.shadow}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center mb-6 relative">
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 ${
                activeNetwork === 'basecamp'
                  ? 'bg-gradient-to-r from-transparent via-orange-500 to-transparent'
                  : activeNetwork === 'linea'
                  ? 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent'
                  : 'bg-gradient-to-r from-transparent via-blue-500 to-transparent'
              }`}></div>

              <div className="flex items-center justify-center mt-6">
                <div className="relative">
                  {/* Glowing background ring */}
                  <div className={`absolute inset-0 w-20 h-20 rounded-full blur-xl opacity-30 ${
                    activeNetwork === 'base'
                      ? 'bg-blue-500'
                      : activeNetwork === 'basecamp'
                      ? 'bg-orange-500'
                      : 'bg-cyan-500'
                  }`}></div>

                  {/* Main container with border */}
                  <div className={`relative flex items-center gap-4 p-4 rounded-2xl border-2 backdrop-blur-sm ${
                    activeNetwork === 'base'
                      ? 'bg-white/10 border-blue-300/30 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                      : activeNetwork === 'basecamp'
                      ? 'bg-black/10 border-orange-300/30 shadow-[0_0_20px_rgba(249,115,22,0.3)]'
                      : 'bg-black/10 border-cyan-300/30 shadow-[0_0_20px_rgba(34,211,238,0.3)]'
                  }`}>

                    {/* Logo with circular frame */}
                    <div className={`relative flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                      activeNetwork === 'base'
                        ? 'bg-white border-blue-300 shadow-lg'
                        : activeNetwork === 'basecamp'
                        ? 'bg-white border-orange-300 shadow-lg'
                        : 'bg-white border-cyan-300 shadow-lg'
                    }`}>
                      <div className="absolute inset-0 rounded-full blur-sm opacity-50"></div>
                      {activeNetwork === 'base' && (
                        <img
                          src="/brand-kit/base/logo/symbol/Base_Symbol_Blue.png"
                          alt="Base"
                          className="w-8 h-8 relative z-10 drop-shadow-md"
                        />
                      )}
                      {activeNetwork === 'basecamp' && (
                        <img
                          src="/Camp.png"
                          alt="Camp"
                          className="w-full h-full rounded-full relative z-10 drop-shadow-md object-cover"
                        />
                      )}
                      {activeNetwork === 'linea' && (
                        <img
                          src="/Logomark Blue BG.svg"
                          alt="Linea"
                          className="w-full h-full rounded-full relative z-10 drop-shadow-md object-cover"
                        />
                      )}
                    </div>

                    {/* Separator line */}
                    <div className={`w-px h-8 ${
                      activeNetwork === 'base'
                        ? 'bg-blue-300/50'
                        : activeNetwork === 'basecamp'
                        ? 'bg-orange-300/50'
                        : 'bg-cyan-300/50'
                    }`}></div>

                    {/* Badges with enhanced styling */}
                    <div className="flex flex-col gap-1">
                      <Badge variant="secondary" className="text-xs px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 shadow-lg hover:scale-105 transition-transform">
                        OpenAI GPT-5-nano 
                      </Badge>
                      <Badge variant="secondary" className="text-xs px-3 py-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0 shadow-lg hover:scale-105 transition-transform">
                        Web Search
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>



              <button
                onClick={onClose}
                className="absolute top-0 right-0 text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="relative">
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={getNetworkPlaceholder(activeNetwork)}
                                  className={`w-full px-4 py-3 ${networkStyles.inputGradient} backdrop-blur-md border rounded-xl ${activeNetwork === 'base' ? 'text-black' : 'text-white'} placeholder-gray-500 text-sm focus:outline-none focus:ring-2 resize-none`}
                rows={4}
                maxLength={500}
              />
              <div className="absolute bottom-3 right-3 text-xs text-gray-500">
                {aiPrompt.length}/500
              </div>
            </div>

            <div className="flex justify-between items-center mt-4">
              <button
                onClick={onClose}
                className={`px-4 py-2 text-sm transition-colors ${
                  activeNetwork === 'base'
                    ? 'text-gray-600 hover:text-gray-800'
                    : activeNetwork === 'linea'
                    ? 'text-cyan-400 hover:text-cyan-300'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={onGenerate}
                disabled={isGeneratingAI || !aiPrompt.trim()}
                className={`flex items-center gap-2 px-6 py-2 backdrop-blur-md rounded-xl font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeNetwork === 'basecamp'
                    ? 'bg-gradient-to-r from-orange-500/30 to-yellow-500/30 hover:shadow-[0_0_20px_rgba(249,115,22,0.5)] border-orange-500/20 text-white'
                    : activeNetwork === 'base'
                    ? 'bg-white hover:bg-blue-50 border-blue-200 text-blue-600 hover:text-blue-700 shadow-[0_0_15px_rgba(0,82,255,0.1)]'
                    : activeNetwork === 'linea'
                    ? 'bg-black hover:bg-gray-900 border-cyan-400/30 text-cyan-400 hover:text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.1)]'
                    : 'bg-gradient-to-r from-blue-500/30 to-purple-500/30 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] border-white/20 text-white'
                } border`}
              >
                {isGeneratingAI ? (
                  <>
                    <div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${
                      activeNetwork === 'base'
                        ? 'border-blue-600'
                        : activeNetwork === 'linea'
                        ? 'border-cyan-400'
                        : 'border-white'
                    }`}></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className={`w-5 h-5 ${
                    activeNetwork === 'base'
                      ? 'text-blue-600'
                      : activeNetwork === 'linea'
                      ? 'text-cyan-400'
                      : ''
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate
                  </span>
                )}
              </button>
            </div>
            {isGeneratingAI && (
                              <div                 className={`mt-4 p-4 rounded-xl backdrop-blur-md border shadow-lg ${
                  activeNetwork === 'basecamp'
                    ? 'bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border-orange-500/20'
                    : activeNetwork === 'base'
                    ? 'bg-blue-50/90 border-blue-200/30'
                    : activeNetwork === 'linea'
                    ? 'bg-black/80 border-cyan-400/20'
                    : 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-white/10'
                }`}>
                <p className={`text-sm text-center ${
                  activeNetwork === 'base'
                    ? 'text-gray-700'
                    : activeNetwork === 'linea'
                    ? 'text-cyan-300'
                    : 'text-white/80'
                }`}>
                  <div className="font-mono text-sm bg-black/20 p-2 rounded border border-green-400/20">
                    <span className={`${networkStyles.textColor}`}>
                      HACK GPT-5 + WebSearch Content Creator
                    </span>
                  </div>
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
