'use client';

import { motion } from 'framer-motion';
import BuyComponent from '../components/Buy/Buy';
import SwapComponent from '../components/Swap/Swap';
import OnchainKitSvg from '../svg/OnchainKit';
import Image from 'next/image';

export default function BuyPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Matrix background effect */}
      <div className="fixed inset-0 bg-black opacity-90">
        <div className="absolute inset-0 bg-[url('/matrix.png')] opacity-10 animate-matrix"></div>
      </div>

      {/* Cyber grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.1)_0%,transparent_70%)]"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent)',
        backgroundSize: '50px 50px'
      }}></div>

      {/* Glowing orbs */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse"></div>
      <div className="absolute top-0 right-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse delay-700"></div>
      <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-300"></div>
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-800"></div>
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-200"></div>
      <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-600"></div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 relative z-10 pt-8"
        >
          <div className="text-center space-y-4">
            <h1 className="text-xl text-gray-400">Powered by</h1>
            <div className="flex items-center justify-center space-x-8 mb-4">
              <div className="w-[150px]">
                <OnchainKitSvg className="w-full text-white hover:text-blue-400 transition-colors duration-300" />
              </div>
              <div className="w-[150px]">
                <Image
                  src="/elo2.png"
                  alt="Sphere Logo"
                  width={200}
                  height={34}
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <p className="text-xl text-gray-400 font-['Share_Tech_Mono'] max-w-2xl mx-auto">
              Purchase and swap your favorite Base ecosystem tokens directly through our secure interface
            </p>
            <p className="text-sm text-blue-400 font-['Share_Tech_Mono']">
              More tokens & meme section coming soon...
            </p>
          </div>
        </motion.div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 space-y-20">
          {/* Buy Section */}
          <BuyComponent />

          {/* Swap Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-black/50 backdrop-blur-xl rounded-xl border border-blue-500/30 p-8 shadow-lg hover:shadow-blue-500/20 transition-all duration-300 min-h-[600px]">
              <SwapComponent />
            </div>

            {/* Instructions Grid */}
            <div className="bg-black/50 backdrop-blur-xl rounded-xl border border-blue-500/30 p-8 shadow-lg hover:shadow-blue-500/20 transition-all duration-300 min-h-[600px]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-['Share_Tech_Mono'] text-[#0052FF]">
                  How to Buy & Swap
                </h3>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-[#0052FF] rounded-full animate-pulse delay-100"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse delay-200"></div>
                </div>
              </div>
              
              <div className="space-y-6">
                {/* Step 1 */}
                <div className="relative pl-8 group">
                  <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-[#0052FF]/10 border border-[#0052FF]/30 flex items-center justify-center group-hover:bg-[#0052FF]/20 group-hover:border-[#0052FF]/50 transition-all duration-300">
                    <span className="text-[#0052FF] text-sm">1</span>
                  </div>
                  <h4 className="text-white font-['Share_Tech_Mono'] text-lg mb-2 group-hover:text-[#0052FF] transition-colors duration-300">Buy Tokens Above</h4>
                  <p className="text-gray-400 text-sm">
                    Choose your preferred token (USDC, DEGEN, cbETH, TOSHI, DAI) and make a purchase using your preferred payment method.
                  </p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <div className="px-2 py-1 rounded-md bg-[#0052FF]/10 text-[#0052FF] text-xs">USDC</div>
                    <div className="px-2 py-1 rounded-md bg-[#0052FF]/10 text-[#0052FF] text-xs">DEGEN</div>
                    <div className="px-2 py-1 rounded-md bg-[#0052FF]/10 text-[#0052FF] text-xs">cbETH</div>
                    <div className="px-2 py-1 rounded-md bg-[#0052FF]/10 text-[#0052FF] text-xs">TOSHI</div>
                    <div className="px-2 py-1 rounded-md bg-[#0052FF]/10 text-[#0052FF] text-xs">DAI</div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative pl-8 group">
                  <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-[#0052FF]/10 border border-[#0052FF]/30 flex items-center justify-center group-hover:bg-[#0052FF]/20 group-hover:border-[#0052FF]/50 transition-all duration-300">
                    <span className="text-[#0052FF] text-sm">2</span>
                  </div>
                  <h4 className="text-white font-['Share_Tech_Mono'] text-lg mb-2 group-hover:text-[#0052FF] transition-colors duration-300">Connect Wallet</h4>
                  <p className="text-gray-400 text-sm">
                    Connect your wallet to access the swap feature. Make sure you have enough tokens for the swap.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#0052FF]/10 border border-[#0052FF]/30 flex items-center justify-center">
                      <svg className="w-3 h-3 text-[#0052FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0" />
                      </svg>
                    </div>
                    <div className="text-[#0052FF] text-xs">Secure Connection</div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="relative pl-8 group">
                  <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-[#0052FF]/10 border border-[#0052FF]/30 flex items-center justify-center group-hover:bg-[#0052FF]/20 group-hover:border-[#0052FF]/50 transition-all duration-300">
                    <span className="text-[#0052FF] text-sm">3</span>
                  </div>
                  <h4 className="text-white font-['Share_Tech_Mono'] text-lg mb-2 group-hover:text-[#0052FF] transition-colors duration-300">Swap to Base ETH</h4>
                  <p className="text-gray-400 text-sm">
                    Use the swap interface to convert your tokens to Base ETH. Review the transaction details and confirm.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="px-2 py-1 rounded-md bg-[#0052FF]/10 text-[#0052FF] text-xs">Base ETH</div>
                    <div className="text-[#0052FF] text-xs">Best rates guaranteed</div>
                  </div>
                </div>

                {/* Additional Info */}
                <div className="mt-8 p-4 rounded-lg bg-[#0052FF]/5 border border-[#0052FF]/10 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/0 via-[#0052FF]/5 to-[#0052FF]/0 group-hover:translate-x-full duration-1000 transition-transform"></div>
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-[#0052FF]/10">
                      <svg className="w-4 h-4 text-[#0052FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <p className="text-[#0052FF] text-sm font-['Share_Tech_Mono']">
                      Pro Tip: Check the current market rates and gas fees before swapping to get the best value for your tokens.
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-[#0052FF]/80">
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
                      <span>Low Fees</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      <span>Fast Swaps</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                      <span>Secure</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 