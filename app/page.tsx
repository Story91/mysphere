'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import OnchainkitSvg from './svg/OnchainKit';

const themes = [
  { id: 'base', name: 'Base', gradient: 'from-[#0052FF] via-[#1E4DD8] to-[#4C8FFF]' },
  { id: 'cyberpunk', name: 'Cyberpunk', gradient: 'from-[#FF00FF] via-[#FF00CC] to-[#FF0099]' },
  { id: 'hacker', name: 'Hacker', gradient: 'from-[#00FF00] via-[#00CC00] to-[#008800]' },
];

const tailwindConfig = {
  theme: {
    extend: {
      keyframes: {
        glow: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.8' }
        }
      },
      animation: {
        glow: 'glow 2s ease-in-out infinite'
      }
    }
  }
}

export default function HomePage() {
  const { address } = useAccount();
  const [activeTheme, setActiveTheme] = useState(themes[0]);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [ethPriceChange, setEthPriceChange] = useState<number | null>(null);
  const [gasPrice, setGasPrice] = useState<number | null>(null);
  const [gasPriceStatus, setGasPriceStatus] = useState<string>('');
  const [lastBlock, setLastBlock] = useState<number | null>(null);
  const [blockTime, setBlockTime] = useState(0);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const ethResponse = await fetch('/api/eth-price');

        if (!ethResponse.ok) {
          throw new Error(`HTTP error! status: ${ethResponse.status}`);
        }

        const ethData = await ethResponse.json();
        setEthPrice(Number(ethData.ethereum.usd.toFixed(2)));
        setEthPriceChange(Number(ethData.ethereum.usd_24h_change.toFixed(2)));
        
        const feeHistoryResponse = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_feeHistory',
            params: ['0x4', 'latest', [25, 50, 75]],
            id: 1
          })
        });
        const feeHistoryData = await feeHistoryResponse.json();
        
        // Pobieranie statusu sieci z BaseScan
        const baseStatusResponse = await fetch(
          `https://api.basescan.org/api?module=gastracker&action=gasoracle&apikey=${process.env.NEXT_PUBLIC_BASESCAN_API_KEY}`
        );
        const baseStatusData = await baseStatusResponse.json();
        
        // Pobieranie aktualnej ceny gazu z RPC
        const gasResponse = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_gasPrice',
            params: [],
            id: 1
          })
        });
        const gasData = await gasResponse.json();
        const currentGasPrice = parseInt(gasData.result, 16) / 1e9;
        setGasPrice(Number(currentGasPrice.toFixed(3)));

        // Ustawianie statusu na podstawie danych z BaseScan
        if (baseStatusData.status === '1' && baseStatusData.result) {
          const { SafeLow, Standard, Fast } = baseStatusData.result;
          if (currentGasPrice <= SafeLow) {
            setGasPriceStatus('VERY LOW');
          } else if (currentGasPrice <= Standard) {
            setGasPriceStatus('LOW');
          } else if (currentGasPrice <= Fast) {
            setGasPriceStatus('MEDIUM');
          } else {
            setGasPriceStatus('HIGH');
          }
        } else {
          // Fallback do poprzedniej logiki jeśli API nie odpowiada
          if (currentGasPrice < 0.001) {
            setGasPriceStatus('VERY LOW');
          } else if (currentGasPrice <= 0.005) {
            setGasPriceStatus('LOW');
          } else if (currentGasPrice <= 0.01) {
            setGasPriceStatus('MEDIUM');
          } else {
            setGasPriceStatus('HIGH');
          }
        }

        const rewardPercentiles = feeHistoryData.result.reward.flat().map((x: string): number => parseInt(x, 16) / 1e9);
        const avgReward = rewardPercentiles.reduce((a: number, b: number): number => a + b, 0) / rewardPercentiles.length;
        
        const blockResponse = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_blockNumber',
            params: [],
            id: 1
          })
        });
        const blockData = await blockResponse.json();
        if (blockData.result) {
          const blockNumber = parseInt(blockData.result, 16);
          setLastBlock(blockNumber);
          console.log('Latest block:', blockNumber);
        }

        const timeResponse = await fetch(`https://api.basescan.org/api?module=block&action=getblockreward&blockno=${lastBlock}&apikey=${process.env.NEXT_PUBLIC_BASESCAN_API_KEY}`);
        const timeData = await timeResponse.json();
        if (timeData.result && timeData.result.timeStamp) {
          setBlockTime(parseInt(timeData.result.timeStamp));
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 60000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black">
      {/* Background overlay */}
      <div className="fixed inset-0 bg-black/90"></div>

      {/* Cyber grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,82,255,0.1)_0%,transparent_70%)]"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 82, 255, 0.05) 25%, rgba(0, 82, 255, 0.05) 26%, transparent 27%, transparent 74%, rgba(0, 82, 255, 0.05) 75%, rgba(0, 82, 255, 0.05) 76%, transparent 77%, transparent)',
        backgroundSize: '50px 50px'
      }}></div>

      {/* Glowing orbs */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse"></div>
      <div className="absolute top-0 right-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse delay-700"></div>
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-[#4C8FFF]/30 rounded-full filter blur-3xl animate-pulse delay-1000"></div>
      
      <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-300"></div>
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-800"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 w-72 h-72 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-500"></div>
      
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-200"></div>
      <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-600"></div>
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-[#0052FF]/5 rounded-full filter blur-3xl animate-pulse delay-900"></div>

      {/* Main content */}
      <div className="relative z-10">
        {/* Hero section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 relative"
        >
          <div className={`absolute inset-0 bg-gradient-to-r ${activeTheme.gradient} opacity-5 blur-3xl -z-10`}></div>
          <div className="flex items-center justify-center mt-2 mb-4">
            <div className="transform hover:scale-105 transition-transform duration-300 px-4 md:px-0">
              <Image
                src="/elo2.png"
                alt="SPHERE"
                width={350}
                height={100}
                quality={100}
                priority
                className="object-contain w-[280px] md:w-[350px] h-auto max-w-full"
              />
            </div>
          </div>
          <p className="font-['Coinbase_Display'] text-[#0052FF] text-base md:text-xl text-center mt-2 mb-1 animate-pulse px-4">Your gateway to the Base ecosystem</p>
          <p className="font-['Share_Tech_Mono'] text-xs md:text-sm text-[#0052FF] text-center mb-4">[BETA 0.9.1]</p>
          <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-transparent via-[#0052FF] to-transparent mt-6 mb-6"></div>
        </motion.div>

        {/* Main features */}
        <div className="relative -mt-2 px-4 md:px-8 max-w-7xl mx-auto">
          <AnimatePresence>
            <motion.div
              key="features-container"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 auto-rows-fr mb-8 w-full"
            >
              {/* BaseChat Card - przeniesiony na początek */}
              <motion.div key="basechat-card" variants={itemVariants} className="group">
                <Link href="/basechat" className="block h-full">
                  <div className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border-2 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative ${
                    activeTheme.id === 'base'
                      ? 'border-white/50 shadow-[0_0_30px_rgba(255,255,255,0.4)]'
                      : activeTheme.id === 'cyberpunk'
                      ? 'border-[#FF00FF]/50 shadow-[0_0_30px_rgba(255,0,255,0.3)]'
                      : 'border-[#00FF00]/50 shadow-[0_0_30px_rgba(0,255,0,0.3)]'
                  }`}>
                    {/* Intensywny biały gradient */}
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/5 to-transparent rounded-xl animate-[pulse_8s_ease-in-out_infinite]"></div>
                    </div>
                    {/* Niebieski gradient */}
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/20 via-[#1E4DD8]/15 to-[#0052FF]/20 rounded-xl blur-xl animate-[pulse_6s_ease-in-out_infinite]"></div>
                    </div>
                    {/* Intensywne białe światło */}
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.5)_0%,transparent_60%)] blur-2xl animate-[pulse_4s_ease-in-out_infinite_1s]"></div>
                    </div>
                    {/* Niebieski akcent */}
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0052FF]/15 via-[#4C8FFF]/10 to-[#0052FF]/15 rounded-xl blur-xl animate-[pulse_7s_ease-in-out_infinite_2s]"></div>
                    </div>
                    {/* Świecące krawędzie */}
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-white/40 rounded-xl animate-[pulse_5s_ease-in-out_infinite_3s]"></div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10">
                      <div className="flex items-center justify-center gap-4 mb-4">
                        <Image
                          src="/elo2.png"
                          alt="SPHERE"
                          width={80}
                          height={80}
                          className="object-contain w-[80px] h-auto transform hover:scale-105 transition-transform duration-300"
                        />
                        <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#0052FF]/10 border border-[#0052FF]/20">
                          <span className="w-2 h-2 rounded-full bg-[#0052FF] animate-pulse mr-2"></span>
                          <span className="text-[#0052FF] text-sm font-['Share_Tech_Mono']">LAUNCH APP</span>
                        </span>
                      </div>
                      <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed text-center">
                        Connect with other .base.eth owners, share updates, create daily posts about base and earn sphere points!
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Identity Card (wcześniej Profile) */}
              <motion.div key="identity-card" variants={itemVariants} className="group">
                <Link href="/profile" className="block h-full">
                  <div className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative ${
                    activeTheme.id === 'base'
                      ? 'border-[#0052FF]/30 group-hover:shadow-[#0052FF]/20'
                      : activeTheme.id === 'cyberpunk'
                      ? 'border-[#FF00FF]/30 group-hover:shadow-[#FF00FF]/20'
                      : 'border-[#00FF00]/30 group-hover:shadow-[#00FF00]/20'
                  }`}>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className={`absolute inset-0 bg-gradient-to-r from-[#0052FF]/20 to-[#4C8FFF]/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300`}></div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xl md:text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">Identity</h2>
                      </div>
                      <p className="text-gray-400 text-sm md:text-lg font-['Coinbase_Display'] leading-relaxed">
                        View your on-chain identity, statistics, and achievements. Track your progress and ranking in the Base ecosystem.
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Buy&Swap Card */}
              <motion.div key="buyswap-card" variants={itemVariants} className="group">
                <Link href="/buy" className="block h-full">
                  <div className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative ${
                    activeTheme.id === 'base'
                      ? 'border-[#0052FF]/30 group-hover:shadow-[#0052FF]/20'
                      : activeTheme.id === 'cyberpunk'
                      ? 'border-[#FF00FF]/30 group-hover:shadow-[#FF00FF]/20'
                      : 'border-[#00FF00]/30 group-hover:shadow-[#00FF00]/20'
                  }`}>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className={`absolute inset-0 bg-gradient-to-r from-[#00FF00]/20 to-[#66FF66]/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300`}></div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">Buy&Swap</h2>
                      </div>
                      <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed">
                        Purchase and swap tokens directly using various payment methods. Easy and secure way to enter the Base ecosystem.
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Bridge Card */}
              <motion.div key="bridge-card" variants={itemVariants} className="group">
                <Link href="/bridge" className="block h-full">
                  <div className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative ${
                    activeTheme.id === 'base'
                      ? 'border-[#0052FF]/30 group-hover:shadow-[#0052FF]/20'
                      : activeTheme.id === 'cyberpunk'
                      ? 'border-[#FF00FF]/30 group-hover:shadow-[#FF00FF]/20'
                      : 'border-[#00FF00]/30 group-hover:shadow-[#00FF00]/20'
                  }`}>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className={`absolute inset-0 bg-gradient-to-r from-[#FFD700]/20 to-[#FFA500]/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300`}></div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">
                          Bridge
                        </h2>
                      </div>
                      <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed">
                        Bridge your assets between Ethereum and Base network. Fast and secure cross-chain transfers.
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* NFT Card */}
              <motion.div key="nft-card" variants={itemVariants} className="group">
                <Link href="/nft" className="block h-full">
                  <div className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative ${
                    activeTheme.id === 'base'
                      ? 'border-[#0052FF]/30 group-hover:shadow-[#0052FF]/20'
                      : activeTheme.id === 'cyberpunk'
                      ? 'border-[#FF00FF]/30 group-hover:shadow-[#FF00FF]/20'
                      : 'border-[#00FF00]/30 group-hover:shadow-[#00FF00]/20'
                  }`}>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className={`absolute inset-0 bg-gradient-to-r from-[#FF4500]/20 to-[#FF6347]/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300`}></div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">NFT</h2>
                      </div>
                      <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed">
                        Explore, collect, and mint NFTs on Base. View trending collections and manage your NFT portfolio.
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Get Started Card */}
              <motion.div key="getstarted-card" variants={itemVariants} className="group">
                <div className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative ${
                  activeTheme.id === 'base'
                    ? 'border-[#0052FF]/30 group-hover:shadow-[#0052FF]/20'
                    : activeTheme.id === 'cyberpunk'
                    ? 'border-[#FF00FF]/30 group-hover:shadow-[#FF00FF]/20'
                    : 'border-[#00FF00]/30 group-hover:shadow-[#00FF00]/20'
                }`}>
                  {/* Hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className={`absolute inset-0 bg-gradient-to-r from-[#8A2BE2]/20 to-[#9370DB]/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300`}></div>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">Get Started</h2>
                    </div>
                    <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed mb-4">
                      Connect your wallet to access all features and start your journey on Base.
                    </p>
                    {!address && (
                      <div className={`text-sm rounded-lg p-3 ${
                        activeTheme.id === 'base'
                          ? 'bg-[#0052FF]/10 text-[#0052FF]'
                          : activeTheme.id === 'cyberpunk'
                          ? 'bg-[#FF00FF]/10 text-[#FF00FF]'
                          : 'bg-[#00FF00]/10 text-[#00FF00]'
                      }`}>
                        Use the wallet button in the top right to connect
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Linia rozdzielająca przed BASE NETWORK STATUS */}
        <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-transparent via-[#0052FF] to-transparent mt-4 mb-4"></div>
        <h2 className="text-lg md:text-2xl font-['Coinbase_Display'] font-medium text-center mb-3 text-[#0052FF]">BASE NETWORK STATUS</h2>

        {/* Network Stats */}
        <div className="max-w-4xl mx-auto px-4 md:px-8 mb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <div className="bg-black/50 backdrop-blur-xl rounded-xl p-4 border border-[#0052FF]/30 max-w-sm mx-auto w-full">
              <h3 className="text-[#0052FF] text-sm font-['Coinbase_Display'] font-medium mb-2">ETH PRICE</h3>
              <p className="text-white text-xl font-['Coinbase_Display']">
                {ethPrice ? (
                  <>
                    ${ethPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className={`ml-2 text-sm ${ethPriceChange && ethPriceChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {ethPriceChange ? `${ethPriceChange.toFixed(2)}%` : ''}
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-400">Loading...</span>
                  </div>
                )}
              </p>
            </div>
            <div className="bg-black/50 backdrop-blur-xl rounded-xl p-4 border border-[#0052FF]/30 max-w-sm mx-auto w-full">
              <h3 className="text-[#0052FF] text-sm font-['Coinbase_Display'] font-medium mb-2">GAS PRICE</h3>
              <p className="text-white text-xl font-['Coinbase_Display']">
                {gasPrice ? (
                  <>
                    {gasPrice} GWEI
                    <span className={`ml-2 text-sm ${
                      gasPriceStatus === 'VERY LOW' ? 'text-green-400' :
                      gasPriceStatus === 'LOW' ? 'text-green-500' :
                      gasPriceStatus === 'MEDIUM' ? 'text-yellow-500' :
                      'text-red-500'
                    }`}>
                      {gasPriceStatus}
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-400">Loading...</span>
                  </div>
                )}
              </p>
            </div>
            <div className="bg-black/50 backdrop-blur-xl rounded-xl p-4 border border-[#0052FF]/30 max-w-sm mx-auto w-full">
              <h3 className="text-[#0052FF] text-sm font-['Coinbase_Display'] font-medium mb-2">LATEST BLOCK</h3>
              <p className="text-white text-xl font-['Coinbase_Display']">
                {lastBlock ? (
                  lastBlock.toLocaleString()
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-400">Loading...</span>
                  </div>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Built on Base section */}
      <div className="fixed bottom-4 md:bottom-6 left-0 right-0 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-none bg-black/20 backdrop-blur-sm border border-[#0052FF]/20 hover:bg-black/40 transition-all shadow-[0_0_10px_rgba(0,82,255,0.15)] hover:shadow-[0_0_20px_rgba(0,82,255,0.4)] opacity-60 hover:opacity-100">
          <span className="font-['Coinbase_Display'] text-base font-medium text-white/70">Built on</span>
          <Link href="https://base.org" target="_blank" className="group flex items-center hover:opacity-90 transition-opacity">
            <Image 
              src="/brand-kit/base/logo/wordmark/Base_Wordmark_White.png"
              alt="Base Logo"
              width={60}
              height={20}
              className="group-hover:scale-105 transition-transform w-[60px] h-auto"
            />
          </Link>
          <span className="font-['Coinbase_Display'] text-base font-medium text-white/70">with</span>
          <Link href="https://github.com/coinbase/onchainkit" target="_blank" className="group flex items-center gap-1 hover:opacity-90 transition-opacity">
            <OnchainkitSvg className="w-20 h-5 text-[#0052FF]/80 group-hover:text-[#0052FF] group-hover:scale-105 transition-all" />
          </Link>
        </div>
      </div>
    </div>
  );
}
