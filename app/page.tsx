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
        const ethResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true');
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
    const interval = setInterval(fetchData, 15000);
    
    return () => clearInterval(interval);
  }, []);

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

      {/* Glowing orbs - góra, środek i dół */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse"></div>
      <div className="absolute top-0 right-1/3 w-96 h-96 bg-[#0052FF]/20 rounded-full filter blur-3xl animate-pulse delay-700"></div>
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-[#4C8FFF]/30 rounded-full filter blur-3xl animate-pulse delay-1000"></div>
      
      {/* Środkowe orby */}
      <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-300"></div>
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-[#0052FF]/15 rounded-full filter blur-3xl animate-pulse delay-800"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 w-72 h-72 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-500"></div>
      
      {/* Dolne orby */}
      <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-200"></div>
      <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-[#0052FF]/10 rounded-full filter blur-3xl animate-pulse delay-600"></div>
      <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-96 h-96 bg-[#0052FF]/5 rounded-full filter blur-3xl animate-pulse delay-900"></div>

      {/* Main content */}
      <div className="relative z-10">
        {/* Hero section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 relative"
        >
          <div className={`absolute inset-0 bg-gradient-to-r ${activeTheme.gradient} opacity-5 blur-3xl -z-10`}></div>
          <div className="flex items-center justify-center mt-2">
            <div className="transform hover:scale-105 transition-transform duration-300">
              <Image
                src="/elo2.png"
                alt="SPHERE"
                width={450}
                height={120}
                quality={100}
                priority
                className="object-contain"
              />
            </div>
          </div>
          <p className="font-['Coinbase_Display'] text-[#0052FF] text-xl text-center mt-4 mb-2 animate-pulse">Your gateway to the Base ecosystem</p>
          <p className="font-['Share_Tech_Mono'] text-sm text-[#0052FF] text-center mb-8">[BETA 0.9.1]</p>
          <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-transparent via-[#0052FF] to-transparent mb-4"></div>
        </motion.div>

        {/* Main features */}
        <div className="relative -mt-2">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[200px] mb-8"
          >
            <AnimatePresence>
              {/* Profile Card */}
              <motion.div variants={itemVariants} className="group">
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
                        <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">Profile</h2>
                      </div>
                      <p className="text-gray-400 text-lg font-['Coinbase_Display'] leading-relaxed">
                        View your on-chain identity, statistics, and achievements. Track your progress and ranking in the Base ecosystem.
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* BaseChat Card */}
              <motion.div variants={itemVariants} className="group">
                <Link href="/basechat" className="block h-full">
                  <div className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative ${
                    activeTheme.id === 'base'
                      ? 'border-[#0052FF]/30 group-hover:shadow-[#0052FF]/20'
                      : activeTheme.id === 'cyberpunk'
                      ? 'border-[#FF00FF]/30 group-hover:shadow-[#FF00FF]/20'
                      : 'border-[#00FF00]/30 group-hover:shadow-[#00FF00]/20'
                  }`}>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className={`absolute inset-0 bg-gradient-to-r from-[#FF00FF]/20 to-[#FF66FF]/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300`}></div>
                    </div>
                    
                    {/* Content */}
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">
                          <div className="inline-flex items-center">
                            <Image
                              src="/elo2.png"
                              alt="SPHERE"
                              width={67}
                              height={67}
                              className="object-contain"
                            />
                          </div>
                        </h2>
                      </div>
                      <p className="text-gray-400 text-lg font-['Coinbase_Display'] leading-relaxed">
                        Connect with other .base.eth owners, share updates, create daily posts about base and earn sphere points!
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Buy&Swap Card */}
              <motion.div variants={itemVariants} className="group">
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
                      <p className="text-gray-400 text-lg font-['Coinbase_Display'] leading-relaxed">
                        Purchase and swap tokens directly using various payment methods. Easy and secure way to enter the Base ecosystem.
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Bridge Card */}
              <motion.div variants={itemVariants} className="group">
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
                      <p className="text-gray-400 text-lg font-['Coinbase_Display'] leading-relaxed">
                        Bridge your assets between Ethereum and Base network. Fast and secure cross-chain transfers.
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* NFT Card */}
              <motion.div variants={itemVariants} className="group">
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
                      <p className="text-gray-400 text-lg font-['Coinbase_Display'] leading-relaxed">
                        Explore, collect, and mint NFTs on Base. View trending collections and manage your NFT portfolio.
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>

              {/* Get Started Card */}
              <motion.div variants={itemVariants} className="group">
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
                    <p className="text-gray-400 text-lg font-['Coinbase_Display'] leading-relaxed mb-4">
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
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Linia rozdzielająca przed BASE NETWORK STATUS */}
        <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-transparent via-[#0052FF] to-transparent mt-8 mb-8"></div>
        <h2 className="text-2xl font-['Coinbase_Display'] font-medium text-center mb-4 text-[#0052FF]">BASE NETWORK STATUS</h2>

        {/* Network Stats */}
        <div className="max-w-4xl mx-auto px-6 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-black/50 backdrop-blur-xl rounded-xl p-4 border border-[#0052FF]/30">
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
            <div className="bg-black/50 backdrop-blur-xl rounded-xl p-4 border border-[#0052FF]/30">
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
            <div className="bg-black/50 backdrop-blur-xl rounded-xl p-4 border border-[#0052FF]/30">
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
      <div className="fixed bottom-6 left-0 right-0 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-none bg-black/20 backdrop-blur-sm border border-[#0052FF]/20 hover:bg-black/40 transition-all shadow-[0_0_10px_rgba(0,82,255,0.15)] hover:shadow-[0_0_20px_rgba(0,82,255,0.4)] opacity-60 hover:opacity-100">
          <span className="font-['Coinbase_Display'] text-base font-medium text-white/70">Built on</span>
          <Link href="https://base.org" target="_blank" className="group flex items-center hover:opacity-90 transition-opacity">
            <Image 
              src="/brand-kit/base/logo/wordmark/Base_Wordmark_White.png"
              alt="Base Logo"
              width={60}
              height={20}
              className="group-hover:scale-105 transition-transform"
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
