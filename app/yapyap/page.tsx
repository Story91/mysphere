'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import AttentionMetrics from './components/AttentionMetrics';
import ConnectX from './components/ConnectX';
import YapsChecker from './components/YapsChecker';

interface XAuthState {
  username: string;
  accessToken: string;
}

export default function YapYap() {
  const { address } = useAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [yapData, setYapData] = useState(null);
  const [xAuth, setXAuth] = useState<XAuthState | null>(null);
  const [showConnectX, setShowConnectX] = useState(false);

  const handleConnectX = () => {
    setShowConnectX(true);
  };

  const handleXConnected = (username: string, accessToken: string) => {
    setXAuth({ username, accessToken });
    setShowConnectX(false);
  };

  return (
    <main className="min-h-screen bg-[#0A0B0D]">
      <div className="absolute inset-0 bg-[#2DFADA]/5 mix-blend-overlay pointer-events-none" />
      
      {/* Hero Section with Gradient */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-[#2DFADA]/10 to-transparent opacity-30" />
          <div className="absolute inset-0 bg-[#0A0B0D]/80" />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-6xl font-bold mb-4">
              <span className="bg-gradient-to-r from-[#2DFADA] to-[#1A8F88] text-transparent bg-clip-text">
                YapYap
              </span>
            </h1>
            <p className="text-xl text-[#8B8F97] max-w-2xl mx-auto">
              Connect your X account to explore your tokenized attention metrics with Kaito Yaps Protocol.
            </p>
          </motion.div>

          {/* Connection Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12 bg-[#111318] p-6 rounded-2xl border border-[#2DFADA]/10"
          >
            <div className="flex flex-col md:flex-row items-center justify-between">
              <div className="flex items-center mb-4 md:mb-0">
                <div className={`w-3 h-3 rounded-full mr-3 ${address ? 'bg-[#2DFADA]' : 'bg-red-500'}`} />
                <span className="text-[#8B8F97]">
                  Wallet Connection: {address ? 'Connected' : 'Not Connected'}
                </span>
              </div>
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-3 ${xAuth ? 'bg-[#2DFADA]' : 'bg-red-500'}`} />
                <span className="text-[#8B8F97]">
                  X Account: {xAuth?.username || 'Not Connected'}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Attention Metrics Dashboard */}
          {address && xAuth && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-12"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2DFADA] to-[#1A8F88] p-[1px]">
                  <div className="w-full h-full rounded-full bg-[#111318] flex items-center justify-center">
                    <span className="text-2xl">📊</span>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white">Your Attention Metrics</h2>
              </div>
              <AttentionMetrics username={xAuth.username} accessToken={xAuth.accessToken} />
            </motion.div>
          )}

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Features Section */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-[#111318] p-8 rounded-2xl border border-[#2DFADA]/10"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2DFADA] to-[#1A8F88] p-[1px]">
                  <div className="w-full h-full rounded-full bg-[#111318] flex items-center justify-center">
                    <span className="text-2xl">🎯</span>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white">How It Works</h2>
              </div>
              <ul className="space-y-6">
                {[
                  { text: 'Connect your wallet to get started', icon: '💳' },
                  { text: 'Authenticate with your X account', icon: '🔐' },
                  { text: 'View your tokenized attention metrics', icon: '📊' }
                ].map((item, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className="flex items-center gap-4 text-[#8B8F97] hover:text-white transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#2DFADA]/10 flex items-center justify-center">
                      <span className="text-xl">{item.icon}</span>
                    </div>
                    <span>{item.text}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            {/* Getting Started Section */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-[#111318] p-8 rounded-2xl border border-[#2DFADA]/10"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2DFADA] to-[#1A8F88] p-[1px]">
                  <div className="w-full h-full rounded-full bg-[#111318] flex items-center justify-center">
                    <span className="text-2xl">🚀</span>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white">Getting Started</h2>
              </div>
              <div className="space-y-6">
                <p className="text-[#8B8F97]">
                  {!address 
                    ? 'Connect your wallet to begin exploring your attention metrics.'
                    : !xAuth 
                      ? 'Authenticate with your X account to view your Yaps score.'
                      : 'You\'re all set! View your attention metrics above.'}
                </p>
                {!xAuth && (
                  <button
                    onClick={handleConnectX}
                    className="w-full py-4 bg-gradient-to-r from-[#2DFADA] to-[#1A8F88] rounded-xl text-black font-semibold hover:opacity-90 transition-opacity flex items-center justify-center space-x-2"
                  >
                    <span>Connect X Account</span>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* YapsChecker Section */}
      {!xAuth && <YapsChecker />}

      {/* Connect X Modal */}
      <AnimatePresence>
        {showConnectX && (
          <ConnectX
            onConnect={handleXConnected}
            onCancel={() => setShowConnectX(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
} 