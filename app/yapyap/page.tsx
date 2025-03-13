'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import AttentionMetrics from './components/AttentionMetrics';
import ConnectX from './components/ConnectX';
import YapsChecker from './components/YapsChecker';

interface XAuthState {
  username: string;
}

export default function YapYap() {
  const { address } = useAccount();
  const [xAuth, setXAuth] = useState<XAuthState | null>(null);
  const [showConnectX, setShowConnectX] = useState(false);

  const handleConnectX = () => {
    setShowConnectX(true);
  };

  const handleXConnected = (username: string) => {
    setXAuth({ username });
    setShowConnectX(false);
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      {!xAuth && <YapsChecker />}
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-transparent bg-clip-text">
              YapYap
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Connect your X account to explore your Yaps metrics with Kaito Yaps Protocol.
            </p>
          </motion.div>

          {/* Connection Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12 bg-gray-800/50 p-6 rounded-2xl border border-gray-700"
          >
            <div className="flex flex-col md:flex-row items-center justify-between">
              <div className="flex items-center mb-4 md:mb-0">
                <div className={`w-3 h-3 rounded-full mr-3 ${address ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-gray-300">Wallet Connection: {address ? 'Connected' : 'Not Connected'}</span>
              </div>
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-3 ${xAuth ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-gray-300">X Account: {xAuth?.username || 'Not Connected'}</span>
              </div>
            </div>
          </motion.div>

          {/* Yaps Metrics Dashboard */}
          {address && xAuth && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-12"
            >
              <h2 className="text-2xl font-semibold mb-6 text-white">Your Yaps Metrics</h2>
              <AttentionMetrics username={xAuth.username} />
            </motion.div>
          )}

          {/* Main Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Features Section */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700"
            >
              <h2 className="text-2xl font-semibold mb-4 text-white">How It Works</h2>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-blue-500 mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-300">Connect your wallet to get started</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-blue-500 mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-300">Authenticate with your X account</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-blue-500 mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-300">View your Yaps metrics</span>
                </li>
              </ul>
            </motion.div>

            {/* Integration Section */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700"
            >
              <h2 className="text-2xl font-semibold mb-4 text-white">Getting Started</h2>
              <div className="space-y-4">
                <p className="text-gray-300">
                  {!address 
                    ? 'Connect your wallet to begin exploring your Yaps metrics.'
                    : !xAuth 
                      ? 'Authenticate with your X account to view your Yaps score.'
                      : 'You\'re all set! View your Yaps metrics above.'}
                </p>
                {!address ? (
                  <button
                    onClick={() => {/* TODO: Implement connection logic */}}
                    className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors duration-200 flex items-center justify-center space-x-2"
                  >
                    <span>Connect Wallet</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                ) : !xAuth && (
                  <button
                    onClick={handleConnectX}
                    className="w-full py-3 px-6 bg-black hover:bg-black/90 text-white rounded-xl transition-colors duration-200 flex items-center justify-center space-x-2"
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