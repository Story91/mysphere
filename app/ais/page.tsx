'use client';

import { motion } from 'framer-motion';
import BuyComponent from '../components/Buy/Buy';
import SwapComponent from '../components/Swap/Swap';
import OnchainKitSvg from '../svg/OnchainKit';
import Image from 'next/image';
import ParticlesBackground from '../components/Background/ParticlesBackground';
import { useEffect, useState } from 'react';

interface TokenData {
  totalSupply: string;
  holders: number;
  transfers: number;
  price: string;
  marketCap: string;
  volume24h: string;
}

export default function BuyPage() {
  const [tokenData, setTokenData] = useState<TokenData>({
    totalSupply: '0',
    holders: 0,
    transfers: 0,
    price: '$0.00',
    marketCap: '$0.00',
    volume24h: '$0.00'
  });

  useEffect(() => {
    const fetchTokenData = async () => {
      try {
        const API_KEY = process.env.NEXT_PUBLIC_BASESCAN_API_KEY;
        const CONTRACT_ADDRESS = '0x26f732ed652a63ae66f365936fddd2389c051b31';
        
        // Fetch total supply
        const supplyResponse = await fetch(
          `https://api.basescan.org/api?module=stats&action=tokensupply&contractaddress=${CONTRACT_ADDRESS}&apikey=${API_KEY}`
        );
        const supplyData = await supplyResponse.json();
        console.log('Supply data:', supplyData);

        // Fetch token account balance and transactions
        const accountResponse = await fetch(
          `https://api.basescan.org/api?module=account&action=tokentx&contractaddress=${CONTRACT_ADDRESS}&page=1&offset=1000&sort=desc&apikey=${API_KEY}`
        );
        const accountData = await accountResponse.json();
        console.log('Account data:', accountData);

        // Calculate unique holders and transfer count
        const uniqueHolders = new Set();
        let transferCount = 0;
        
        if (accountData.status === '1' && accountData.result) {
          accountData.result.forEach((tx: any) => {
            uniqueHolders.add(tx.from);
            uniqueHolders.add(tx.to);
            transferCount++;
          });
        }

        // Get price data from DexScreener API
        const dexResponse = await fetch(
          'https://api.dexscreener.com/latest/dex/tokens/0x26f732ed652a63ae66f365936fddd2389c051b31'
        );
        const dexData = await dexResponse.json();
        console.log('DexScreener data:', dexData);

        let price = '$0.00';
        let marketCap = '$0.00';
        let volume24h = '$0.00';

        if (dexData.pairs && dexData.pairs[0]) {
          const pair = dexData.pairs[0];
          price = `$${parseFloat(pair.priceUsd || '0').toFixed(8)}`;
          marketCap = pair.fdv ? `$${parseInt(pair.fdv).toLocaleString()}` : '$0.00';
          volume24h = pair.volume.h24 ? `$${parseInt(pair.volume.h24).toLocaleString()}` : '$0.00';
        }

        // Update state with the fetched data
        setTokenData({
          totalSupply: supplyData.status === '1' ? 
            (parseInt(supplyData.result) / 10**18).toLocaleString() : '0',
          holders: uniqueHolders.size,
          transfers: transferCount,
          price,
          marketCap,
          volume24h
        });

      } catch (error) {
        console.error('Error fetching token data:', error);
      }
    };

    fetchTokenData();
    const interval = setInterval(fetchTokenData, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <ParticlesBackground />
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-blue-50/20 to-white/20 pb-32">
        {/* Utility Coming Soon Animation */}
        <motion.div 
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ 
            duration: 1,
            repeat: Infinity,
            repeatType: "reverse",
            repeatDelay: 2
          }}
          className="hidden lg:absolute lg:block right-8 top-20 transform bg-white/20 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/30 max-w-xs"
        >
          {/* Gradient Background Effects */}
          <div className="absolute -inset-[50px] bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-2xl rounded-full animate-pulse" />
          <div className="absolute -inset-[25px] bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 blur-xl rounded-full animate-pulse delay-75" />
          
          <motion.div
            animate={{
              scale: [1, 1.05, 1],
              rotate: [0, 2, -2, 0]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="relative text-center"
          >
            <span className="text-4xl mb-3 block">✨</span>
            <h3 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">Coming Soon</h3>
            <p className="text-blue-700">
              More exciting utilities and features for $AIS token holders!
            </p>
          </motion.div>
        </motion.div>

        {/* Navigation */}
        <nav className="relative z-20 px-6 py-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Image
                src="/aislogo.png"
                alt="All I See Is Base Logo"
                width={40}
                height={40}
                className="rounded-full"
              />
              <span className="text-blue-900 text-2xl font-bold">All I See Is Base</span>
            </div>
            <div className="flex items-center space-x-3 md:space-x-4">
              <a 
                href="https://app.uniswap.org/explore/tokens/base/0x26f732ed652a63ae66f365936fddd2389c051b31"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center md:space-x-3 bg-[#FF007A] text-white w-10 h-10 md:w-auto md:h-auto md:px-6 md:py-3 rounded-xl hover:bg-[#FF007A]/90 transition-all duration-300 shadow-lg hover:shadow-[#FF007A]/25 justify-center md:text-lg"
              >
                <Image
                  src="/uniswap-uni-logo-sticker.jpg"
                  alt="Uniswap Logo"
                  width={24}
                  height={24}
                  className="w-6 h-6 md:w-8 md:h-8 rounded-full"
                />
                <span className="hidden md:inline">Trade on Uniswap</span>
              </a>
              <a 
                href="https://dexscreener.com/base/0xe522120dc334afbee97974340544af808d121e06"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center md:space-x-3 bg-[#0D0D0D] text-white w-10 h-10 md:w-auto md:h-auto md:px-6 md:py-3 rounded-xl hover:bg-[#1A1A1A] transition-all duration-300 shadow-lg hover:shadow-[#0D0D0D]/25 justify-center md:text-lg"
              >
                <Image
                  src="/dex-screener-seeklogo.png"
                  alt="DexScreener Logo"
                  width={24}
                  height={24}
                  className="w-6 h-6 md:w-8 md:h-8 rounded-full"
                />
                <span className="hidden md:inline">View on DexScreener</span>
              </a>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="relative z-10 pt-20">
          <div className="max-w-7xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-20"
            >
              <h1 className="text-6xl font-bold text-blue-900 mb-4">
                INTRODUCING
                <span className="block text-8xl text-blue-500 mt-2">$AIS</span>
              </h1>
              <p className="text-2xl text-blue-700 font-['Share_Tech_Mono'] mt-6">
                ALL I SEE IS BASE...
              </p>
              <a 
                href="https://bankr.bot" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-block text-lg text-blue-400 hover:text-blue-500 transition-colors mb-8"
              >
                Fair launch by Bankr.bot
              </a>
              <div className="lg:hidden mt-8">
                <div className="relative group">
                  {/* Animated background glow */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-[#4C00FF] via-[#1CFEBA] to-[#4C00FF] rounded-2xl blur-xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-gradient-shift"></div>
                  
                  {/* Main container */}
                  <div className="relative p-0.5 bg-gradient-to-r from-[#4C00FF] via-[#1CFEBA] to-[#4C00FF] rounded-2xl animate-gradient-shift overflow-hidden">
                    {/* Content container */}
                    <div className="relative bg-black rounded-2xl p-6 overflow-hidden">
                      {/* Animated lines in background */}
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0f_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0f_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_70%,transparent_100%)]"></div>
                      
                      {/* Radial gradient overlay */}
                      <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,#1CFEBA15,transparent)]"></div>

                      <div className="relative">
                        {/* Glowing text */}
                        <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#4C00FF] via-[#1CFEBA] to-[#4C00FF] animate-gradient-shift mb-3 drop-shadow-[0_0_10px_rgba(28,254,186,0.3)]">
                          Coming Soon
                        </h3>
                        <p className="text-[#1CFEBA] text-base font-medium">
                          More exciting utilities and features for $AIS token holders!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Buy and Swap Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start max-w-5xl mx-auto mb-32">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full bg-white/80 backdrop-blur-xl rounded-2xl border border-blue-200 p-8 shadow-xl hover:shadow-blue-200/50 transition-all duration-300 relative z-30"
              >
                <BuyComponent />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
                className="w-full bg-white/80 backdrop-blur-xl rounded-2xl border border-blue-200 shadow-xl hover:shadow-blue-200/50 transition-all duration-300 lg:relative lg:z-20 [&:has(+_div[role=dialog])]:mb-[400px] lg:[&:has(+_div[role=dialog])]:mb-0"
              >
                <SwapComponent />
              </motion.div>
            </div>

            {/* Token Stats Animation */}
            <div className="max-w-5xl mx-auto relative z-10">
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ 
                  duration: 1,
                  delay: 0.5
                }}
                className="w-full mb-32 relative"
              >
                {/* Gradient Background Effects */}
                <div className="absolute -inset-[100px] bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-3xl rounded-full animate-pulse -z-10" />
                <div className="absolute -inset-[50px] bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 blur-2xl rounded-full animate-pulse delay-75 -z-10" />
                
                {/* Main Card */}
                <div className="relative bg-[#1a1b1f] rounded-3xl p-8 shadow-2xl border border-blue-500/20 w-full max-w-[420px] mx-auto overflow-hidden">
                  <motion.div
                    animate={{
                      scale: [1, 1.02, 1],
                      y: [0, -2, 0]
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="relative space-y-6"
                  >
                    <h3 className="text-2xl font-bold text-blue-400 mb-6">
                      $AIS STATS
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-2 border-b border-blue-500/20">
                        <span className="text-lg text-blue-400 font-medium">Total Supply:</span>
                        <span className="font-mono text-xl text-blue-300 font-semibold">{tokenData.totalSupply}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-blue-500/20">
                        <span className="text-lg text-blue-400 font-medium">Price:</span>
                        <span className="font-mono text-xl text-blue-300 font-semibold">{tokenData.price}</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-blue-500/20">
                        <span className="text-lg text-blue-400 font-medium">Market Cap:</span>
                        <span className="font-mono text-xl text-blue-300 font-semibold">{tokenData.marketCap}</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-lg text-blue-400 font-medium">24h Volume:</span>
                        <span className="font-mono text-xl text-blue-300 font-semibold">{tokenData.volume24h}</span>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 bg-black/10 backdrop-blur-md border-t border-black/5 mt-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <OnchainKitSvg className="w-32 text-blue-500 opacity-75" />
                <span className="text-blue-400">×</span>
                <Image
                  src="/elo2.png"
                  alt="Sphere Logo"
                  width={100}
                  height={20}
                  className="opacity-75"
                />
              </div>
              <p className="text-blue-600 text-sm">
                © 2024 AIS Token. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>

      {/* Add shimmer animation */}
      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 3s ease-in-out infinite;
        }
      `}</style>

      {/* Add gradient animation */}
      <style jsx global>{`
        @keyframes gradient-x {
          0% { background-position: 0% 50% }
          50% { background-position: 100% 50% }
          100% { background-position: 0% 50% }
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 3s linear infinite;
        }
      `}</style>

      {/* Add modern animations */}
      <style jsx global>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50% }
          50% { background-position: 100% 50% }
          100% { background-position: 0% 50% }
        }
        .animate-gradient-shift {
          background-size: 200% auto;
          animation: gradient-shift 4s linear infinite;
        }
        .group:hover .animate-gradient-shift {
          animation-duration: 2s;
        }
      `}</style>
    </>
  );
} 