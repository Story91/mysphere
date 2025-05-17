'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import OnchainkitSvg from './svg/OnchainKit';
// import HomeNeonBackground from './components/Backgrounds/HomeNeonBackground';
import { getGlobalStats } from './utils/firebase';
import { FiUsers, FiFileText, FiMessageCircle, FiHeart } from 'react-icons/fi';
import { BiGasPump } from 'react-icons/bi';
import { FaEthereum } from 'react-icons/fa';
import { MdOutlineStackedLineChart } from 'react-icons/md';
// import { CircularProgress } from '@mui/material';

// Ikony dla sekcji community
import { FaTwitter as Twitter, FaDiscord as Discord, FaBook as Book, FaBlog as Blog } from 'react-icons/fa';

// Dodaj import dla ikon
import { FaCheckCircle, FaExternalLinkAlt } from 'react-icons/fa';

const themes = [
  { id: 'base', name: 'Base', gradient: 'from-[#0052FF] via-[#1E4DD8] to-[#4C8FFF]' },
  { id: 'cyberpunk', name: 'Cyberpunk', gradient: 'from-[#FF00FF] via-[#FF00CC] to-[#FF0099]' },
  { id: 'hacker', name: 'Hacker', gradient: 'from-[#00FF00] via-[#00CC00] to-[#008800]' },
];

// Linki do zasobów społecznościowych
const communityLinks = [
  { 
    icon: Book, 
    title: 'Read the Docs', 
    description: 'Learn about the MySphere.', 
    url: '/docs',
    bgClass: 'bg-black/80 hover:bg-black/90 backdrop-blur-md border border-gray-800 hover:border-blue-500'
  },
  { 
    icon: Twitter, 
    title: 'Follow @MySphereAI', 
    description: 'Announcements about MySphere .', 
    url: 'https://twitter.com/mysphereai',
    bgClass: 'bg-black/80 hover:bg-black/90 backdrop-blur-md border border-gray-800 hover:border-blue-500'
  },
  { 
    icon: Discord, 
    title: 'Join Discord', 
    description: 'Connect with the SPHERE community.', 
    url: 'https://discord.com/invite/TGJpz5SH48',
    bgClass: 'bg-black/80 hover:bg-black/90 backdrop-blur-md border border-gray-800 hover:border-blue-500'
  },
  { 
    icon: Blog, 
    title: 'SPHERE Blog', 
    description: 'Stay updated on all things MySphere.', 
    url: '#',
    disabled: true,
    bgClass: 'bg-black/80 backdrop-blur-md border border-gray-700 opacity-50 cursor-not-allowed'
  }
];

// Navigation links to include in the Join Community section
const navigationLinks = {
  main: [
    { title: 'MySphere', url: '/basechat' },
    { title: 'Identity', url: '/profile' }
  ]
};

// Linki do zasobów dla deweloperów i zarządzania
const resourceLinks = {
  finance: [
    { title: 'Bridge', url: '/bridge' },
    { title: 'Earn', url: '/earn' },
    { title: 'Buy $AIS', url: '/ais' },
  ],
  nft: [
    { title: 'SphereGenesis', url: '/nft' },
    { title: 'Quotes on Base', url: '/quotes' },
  ],
  tools: [
    { title: 'FLASHBLOCK', url: '/flashblock' },
  ],
  governance: [
    { title: 'Docs', url: '/Docs' },
    { title: 'Forum', url: '#', disabled: true },
  ],
  community: [
    { title: 'Follow @MySphereAI', url: 'https://twitter.com/mysphereai' },
    { title: 'Join Discord', url: 'https://discord.com/invite/TGJpz5SH48' },
    { title: 'MySphere Blog', url: '#', disabled: true },
    { title: 'Follow us on Farcaster', url: '#', disabled: true },
  ]
};

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

// Funkcja do pobierania danych o transakcjach dla określonych kontraktów na sieci Base
async function getBaseContractTransactions() {
  // Adresy kontraktów do monitorowania
  const contractAddresses = [
    "0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7", 
    "0x9c44802843a670732383f62b2f3304f92ec1702b"
  ];
  
  // Pobieranie danych o transakcjach dla pojedynczego kontraktu
  async function fetchContractData(contractAddress: string) {
    try {
      // Pobierz aktualny numer bloku
      const blockResponse = await fetch('https://mainnet.base.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      });
      
      const blockData = await blockResponse.json();
      const latestBlock = parseInt(blockData.result, 16);
      
      // Rzeczywiste liczby transakcji na podstawie BaseScan
      let totalTransactions = 0;
      if (contractAddress === "0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7") {
        // Pierwszy kontrakt ma 1,365 transakcji według BaseScan
        totalTransactions = 1365;
      } else if (contractAddress === "0x9c44802843a670732383f62b2f3304f92ec1702b") {
        // Drugi kontrakt ma 59 transakcji według BaseScan
        totalTransactions = 59;
      }
      
      // Sprawdź czy to kontrakt (to nadal warto sprawdzić)
      const codeResponse = await fetch('https://mainnet.base.org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getCode',
          params: [contractAddress, 'latest'],
          id: 1
        })
      });
      
      const codeData = await codeResponse.json();
      const isContract = codeData.result !== '0x' && codeData.result !== '';
      
      if (!isContract) {
        console.log(`Adres ${contractAddress} nie jest kontraktem`);
        return { address: contractAddress, transactions: 0 };
      }
      
      return { 
        address: contractAddress, 
        transactions: totalTransactions,
        latestBlock: latestBlock
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Błąd pobierania danych dla ${contractAddress}:`, error);
      return { address: contractAddress, transactions: 0, error: errorMessage };
    }
  }
  
  // Pobierz dane dla wszystkich kontraktów równolegle
  const contractsData = await Promise.all(
    contractAddresses.map(address => fetchContractData(address))
  );
  
  // Oblicz łączną liczbę transakcji
  const totalTransactions = contractsData.reduce(
    (sum, contract) => sum + (contract.transactions || 0), 
    0
  );
  
  return {
    contracts: contractsData,
    totalTransactions: totalTransactions,
    timestamp: new Date().toISOString()
  };
}

// Funkcja do jednorazowego pobrania i zapisania danych
async function fetchAndStoreContractData(setTransactionsCount: React.Dispatch<React.SetStateAction<number>>) {
  try {
    // Próba odczytu danych z localStorage dla natychmiastowego wyświetlenia
    try {
      const cached = localStorage.getItem('baseContractTransactions');
      if (cached) {
        const cachedData = JSON.parse(cached);
        // Użyj danych z cache do pierwszego wyświetlenia
        setTransactionsCount(cachedData.totalTransactions);
        console.log('Użyto danych z cache:', cachedData);
      }
    } catch (e) {
      console.error('Błąd odczytu cache:', e);
    }
    
    // Pobierz świeże dane
    const freshData = await getBaseContractTransactions();
    console.log('Pobrano dane o transakcjach:', freshData);
    
    // Zapisz w localStorage
    localStorage.setItem('baseContractTransactions', JSON.stringify(freshData));
    
    // Aktualizuj stan komponentu
    setTransactionsCount(freshData.totalTransactions);
    
    return freshData;
  } catch (error: unknown) {
    console.error('Błąd pobierania danych o transakcjach:', error);
    return null;
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
  const [userCount, setUserCount] = useState(0);
  const [postsCount, setPostsCount] = useState(0);
  const [transactionsCount, setTransactionsCount] = useState(1340);
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [updateTrigger, setUpdateTrigger] = useState<{ [key: string]: boolean }>({
    users: false,
    posts: false,
    comments: false,
    likes: false
  });
  const [isAppleDevice, setIsAppleDevice] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [ethRevenue, setEthRevenue] = useState<number | null>(null);

  // Funkcja do animowania aktualizacji
  const triggerUpdate = (statType: string) => {
    setUpdateTrigger(prev => ({...prev, [statType]: true}));
    setTimeout(() => {
      setUpdateTrigger(prev => ({...prev, [statType]: false}));
    }, 1000);
  };

  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        // Pobierz dane globalne z Firebase
        const stats = await getGlobalStats();
        
        // Symulacja aktualizacji na żywo - triggery animacji
        if (userCount !== 0 && userCount !== stats.userCount) triggerUpdate('users');
        if (postsCount !== 0 && postsCount !== stats.postsCount) triggerUpdate('posts');
        if (commentsCount !== 0 && commentsCount !== stats.commentsCount) triggerUpdate('comments');
        if (likesCount !== 0 && likesCount !== stats.likesCount) triggerUpdate('likes');
        
        setUserCount(stats.userCount);
        setPostsCount(stats.postsCount);
        setLikesCount(stats.likesCount);
        setCommentsCount(stats.commentsCount);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching global stats:', error);
        setIsLoading(false);
      }
    };

    const fetchData = async () => {
      try {
        // Pobierz cenę ETH
        const ethResponse = await fetch('/api/eth-price');
        if (ethResponse.ok) {
        const ethData = await ethResponse.json();
        setEthPrice(Number(ethData.ethereum.usd.toFixed(2)));
        setEthPriceChange(Number(ethData.ethereum.usd_24h_change.toFixed(2)));
        }
        
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
    
    // Funkcja do pobierania stanu ETH dla podanego adresu
    const fetchEthBalance = async (address: string) => {
      try {
        const response = await fetch('https://mainnet.base.org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [address, 'latest'],
            id: 1
          })
        });
        
        const data = await response.json();
        if (data.result) {
          // Konwertuj z wei na ether (1 ETH = 10^18 wei)
          const balanceInEth = parseInt(data.result, 16) / 1e18;
          return balanceInEth;
        }
        return 0;
      } catch (error) {
        console.error(`Błąd pobierania salda ETH dla ${address}:`, error);
        return 0;
      }
    };
    
    // Funkcja do pobierania łącznego stanu ETH z kontraktów i portfela MySphere
    const fetchTotalEthBalance = async () => {
      try {
        const contract1Balance = await fetchEthBalance("0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7");
        const contract2Balance = await fetchEthBalance("0x9c44802843a670732383f62b2f3304f92ec1702b");
        const mysphereBalance = await fetchEthBalance("0x9fB014812E5C22643640A5885866f499b1bbB5e0");
        
        const totalBalance = contract1Balance + contract2Balance + mysphereBalance;
        setEthRevenue(totalBalance);
      } catch (error) {
        console.error("Błąd podczas pobierania łącznego salda ETH:", error);
        setEthRevenue(0.0012); // Wartość domyślna w przypadku błędu
      }
    };
    
    fetchGlobalStats(); // Pobierz dane z Firebase
    fetchData(); // Pobierz pozostałe dane
    
    // Pobierz dane o transakcjach tylko raz przy uruchomieniu strony
    fetchAndStoreContractData(setTransactionsCount);
    
    // Pobierz stan ETH
    fetchTotalEthBalance();
    
    const interval = setInterval(fetchData, 60000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Wykrywanie urządzeń Apple i naprawianie vh
  useEffect(() => {
    // Wykrywanie urządzeń Apple
    const userAgent = navigator.userAgent.toLowerCase();
    const isApple = /iphone|ipad|macintosh|mac os x/.test(userAgent) && !('MSStream' in window);
    setIsAppleDevice(isApple);
    
    // Naprawianie problemu z vh na iOS
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      setViewportHeight(window.innerHeight);
    };
    
    setVh();
    window.addEventListener('resize', setVh);
    
    // Dodanie styli CSS dla urządzeń Apple
    if (isApple) {
      const styleElement = document.createElement('style');
      styleElement.innerHTML = `
        .apple-touch-scroll {
          -webkit-overflow-scrolling: touch;
        }
        .apple-performance {
          will-change: transform;
          transform: translateZ(0);
        }
        .full-height {
          height: calc(var(--vh, 1vh) * 100);
        }
        .reduce-animation {
          animation-duration: 0.5s !important;
          transition-duration: 0.3s !important;
        }
      `;
      document.head.appendChild(styleElement);
    }
    
    return () => {
      window.removeEventListener('resize', setVh);
    };
  }, []);

  return (
    <div className={`min-h-screen bg-[#050B20] text-white ${isAppleDevice ? 'full-height' : ''}`}>
      <div className="absolute top-6 right-6 z-50">
        <Link href="/basechat">
          <button 
            className="relative overflow-hidden backdrop-blur-md bg-[#0052FF]/20 text-white font-bold py-2 px-8 rounded-full transition-all duration-500 flex items-center justify-center group hover:bg-[#0052FF]/30 hover:shadow-[0_0_15px_rgba(0,82,255,0.8)] group"
            onTouchStart={() => {}} // Eliminacja 300ms opóźnienia na urządzeniach mobilnych
          >
            {/* Animowana ramka */}
            <div className="absolute -inset-[1px] rounded-full bg-gradient-to-r from-[#0052FF] via-[#4C8FFF] to-[#0052FF] opacity-70 group-hover:opacity-100 animate-[spin_4s_linear_infinite] z-0"></div>
            {/* Wewnętrzne tło */}
            <div className="absolute inset-[1px] rounded-full bg-black/80 z-0"></div>
            {/* Tekst */}
            <span className="relative z-10">Launch App</span>
            {/* Glow effect */}
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-[#0052FF]/60 to-[#4C8FFF]/60 blur-md opacity-50 group-hover:opacity-80 transition-opacity duration-300 z-0"></div>
            {/* Shimmer animation */}
            <div className="absolute -inset-[100%] w-[300%] h-full bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-[shimmer_2s_infinite] transition-opacity z-0"></div>
          </button>
        </Link>
      </div>
      
      {/* Dodajemy prosty gradient w tle */}
      <div className="fixed inset-0 bg-gradient-to-b from-[#050B20] via-[#071030] to-[#050B20] z-0"></div>

      {/* Main content */}
      <div className={`relative z-10 ${isAppleDevice ? 'apple-touch-scroll' : ''}`}>
        {/* Hero section - usuwamy animacje */}
        <div className="text-center mb-24 relative pt-12">
          <div className="flex items-center justify-center mt-8 mb-4">
            <div className="transform transition-transform duration-300 px-4 md:px-0">
              <Image
                src="/elo2.png"
                alt="SPHERE"
                width={350}
                height={100}
                quality={100}
                priority={true}
                className="object-contain w-[280px] md:w-[350px] h-auto max-w-full"
                style={{ width: 'auto', height: 'auto' }}
              />
            </div>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">
            The onchain <span className="text-[#0052FF]">social Dapp</span>
          </h1>
          <p className="font-['Coinbase_Display'] text-gray-100 text-base md:text-xl text-center mt-2 mb-4 px-4 filter drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">
            Build, grow, and <span className="text-[#0052FF] font-semibold">own</span> your digital sphere
          </p>
          <p className="font-['Share_Tech_Mono'] text-xs md:text-sm text-[#0052FF] text-center mb-4">[BETA 2.9.1]</p>
          <div className="h-0.5 w-32 mx-auto bg-gradient-to-r from-transparent via-[#0052FF] to-transparent mt-6 mb-6"></div>
        </div>

        {/* Main features - usunięto animacje dla lepszej wydajności */}
        <div className="relative px-4 md:px-8 max-w-7xl mx-auto">
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 auto-rows-fr mb-28 w-full"
          >
            {/* BaseChat Card - przeniesiony na początek */}
            <div className="group">
              <Link href="/basechat" className={`block h-full ${isAppleDevice ? 'apple-performance' : ''}`}>
                <div 
                  className="h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-gray-800 hover:border-[#0052FF]/50 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative"
                  onTouchStart={() => {}} // Eliminacja 300ms opóźnienia na urządzeniach mobilnych
                >
                  {/* Hover efekt */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/20 to-[#4C8FFF]/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10">
                    <div className="flex items-center justify-center gap-8 mb-4">
                      <Image
                        src="/elo2.png"
                        alt="SPHERE"
                        width={36}
                        height={36}
                        className="object-contain w-[36px] h-auto transform hover:scale-105 transition-transform duration-300"
                        style={{ width: 'auto', height: 'auto', maxHeight: '36px' }}
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
            </div>

            {/* Identity Card (wcześniej Profile) */}
            <div className="group">
              <Link href="/profile" className={`block h-full ${isAppleDevice ? 'apple-performance' : ''}`}>
                <div 
                  className="h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-gray-800 hover:border-[#0052FF]/50 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative"
                  onTouchStart={() => {}} // Eliminacja 300ms opóźnienia na urządzeniach mobilnych
                >
                  {/* Hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/20 to-[#4C8FFF]/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
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
            </div>

            {/* Buy&Swap Card - Changed to Docs */}
            <div className="group">
              <Link href="/Docs" className={`block h-full ${isAppleDevice ? 'apple-performance' : ''}`}>
                <div 
                  className="h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-gray-800 hover:border-[#0052FF]/50 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative"
                  onTouchStart={() => {}} // Eliminacja 300ms opóźnienia na urządzeniach mobilnych
                >
                  {/* Hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-green-500/10 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">Docs</h2>
                    </div>
                    <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed">
                      Learn everything about MySphere platform features, how it works, and how to get the most out of your social experience.
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Bridge Card - Changed to GenesisNFT */}
            <div className="group">
              <Link href="/nft" className={`block h-full ${isAppleDevice ? 'apple-performance' : ''}`}>
                <div 
                  className="h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-gray-800 hover:border-[#0052FF]/50 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative"
                  onTouchStart={() => {}} // Eliminacja 300ms opóźnienia na urządzeniach mobilnych
                >
                  {/* Hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 to-yellow-500/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">
                        Sphere Genesis
                      </h2>
                    </div>
                    <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed">
                      Get your exclusive Sphere Genesis NFT collection. Early supporters receive special benefits and access to premium features.
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* NFT Card - Changed to $AIS Utilities */}
            <div className="group">
              <Link href="/ais" className={`block h-full ${isAppleDevice ? 'apple-performance' : ''}`}>
                <div 
                  className="h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-gray-800 hover:border-[#0052FF]/50 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative"
                  onTouchStart={() => {}} // Eliminacja 300ms opóźnienia na urządzeniach mobilnych
                >
                  {/* Hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">$AIS Utilities</h2>
                    </div>
                    <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed">
                      Explore $AIS token utilities. DAO governance and staking features coming soon to enhance your MySphere experience.
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Get Started Card - Updated description */}
            <div 
              className={`h-full bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-gray-800 hover:border-[#0052FF]/50 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl p-6 relative ${isAppleDevice ? 'apple-performance' : ''}`}
              onTouchStart={() => {}} // Eliminacja 300ms opóźnienia na urządzeniach mobilnych
            >
              {/* Hover overlay */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-violet-500/20 rounded-xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
              </div>
              
              {/* Content */}
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-[#0052FF]">Get Started</h2>
                </div>
                <p className="text-gray-400 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed mb-4">
                  Click 'Launch App' in the top right corner to access the platform and begin your journey on MySphere.
                </p>
                {!address && (
                  <div className="text-sm rounded-lg p-3 bg-[#0052FF]/10 text-[#0052FF]">
                    Use the wallet button to connect after launching the app
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Section - moved below features */}
        <section className={`max-w-6xl mx-auto px-4 mb-28 ${isAppleDevice ? 'reduce-animation' : ''}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {/* Users - Niebieski */}
            <div className={`bg-gradient-to-br from-black to-blue-950/40 backdrop-blur-md rounded-xl p-6 border ${updateTrigger.users ? 'border-blue-500 shadow-[0_0_20px_rgba(0,82,255,0.8)]' : 'border-blue-900/50'} transition-all duration-500 relative overflow-hidden group hover:border-blue-500 hover:shadow-[0_0_25px_rgba(0,82,255,0.5)]`}>
              {/* Efekt poświaty w tle */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-blue-500/30 rounded-full blur-3xl opacity-70 group-hover:opacity-90 transition-opacity"></div>
              
              {/* Wskaźnik live data */}
              <div className="absolute top-3 right-3 flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-1 shadow-[0_0_5px_rgba(0,82,255,0.7)]"></span>
                <span className="text-xs text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity">live</span>
              </div>
              
              {/* Efekt błysku przy aktualizacji */}
              {updateTrigger.users && (
                <div className="absolute inset-0 bg-blue-500/20 animate-[pulse_1s_ease-in-out]"></div>
              )}
              
              {/* Gradient w tle animowany */}
              <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 animate-[shimmer_3s_infinite] transition-opacity"></div>
              
              <h3 className="text-blue-300 text-sm font-semibold mb-2 relative filter drop-shadow-[0_0_3px_rgba(59,130,246,0.5)]">Active Users</h3>
              {isLoading ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-t-2 border-blue-500 rounded-full animate-spin mr-2"></div>
                  <p className="text-3xl md:text-4xl font-bold text-white">Loading...</p>
                </div>
              ) : (
                <p className={`text-3xl md:text-4xl font-bold ${updateTrigger.users ? 'text-blue-400' : 'text-white'} transition-colors duration-500 filter drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]`}>
                  {userCount.toLocaleString()}
                </p>
              )}
            </div>
            
            {/* Posts - Fioletowy */}
            <div className={`bg-gradient-to-br from-black to-purple-950/40 backdrop-blur-md rounded-xl p-6 border ${updateTrigger.posts ? 'border-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.8)]' : 'border-purple-900/50'} transition-all duration-500 relative overflow-hidden group hover:border-purple-500 hover:shadow-[0_0_25px_rgba(147,51,234,0.5)]`}>
              {/* Efekt poświaty w tle */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-purple-500/30 rounded-full blur-3xl opacity-70 group-hover:opacity-90 transition-opacity"></div>
              
              {/* Wskaźnik live data */}
              <div className="absolute top-3 right-3 flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-pulse mr-1 shadow-[0_0_5px_rgba(147,51,234,0.7)]"></span>
                <span className="text-xs text-purple-300 opacity-0 group-hover:opacity-100 transition-opacity">live</span>
              </div>
              
              {/* Efekt błysku przy aktualizacji */}
              {updateTrigger.posts && (
                <div className="absolute inset-0 bg-purple-500/20 animate-[pulse_1s_ease-in-out]"></div>
              )}
              
              {/* Gradient w tle animowany */}
              <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 animate-[shimmer_3s_infinite] transition-opacity"></div>
              
              <h3 className="text-purple-300 text-sm font-semibold mb-2 relative filter drop-shadow-[0_0_3px_rgba(147,51,234,0.5)]">Total Posts</h3>
              {isLoading ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-t-2 border-purple-500 rounded-full animate-spin mr-2"></div>
                  <p className="text-3xl md:text-4xl font-bold text-white">Loading...</p>
                </div>
              ) : (
                <p className={`text-3xl md:text-4xl font-bold ${updateTrigger.posts ? 'text-purple-400' : 'text-white'} transition-colors duration-500 filter drop-shadow-[0_0_8px_rgba(147,51,234,0.5)]`}>
                  {postsCount.toLocaleString()}
                </p>
              )}
            </div>
            
            {/* Comments - Zielony */}
            <div className={`bg-gradient-to-br from-black to-emerald-950/40 backdrop-blur-md rounded-xl p-6 border ${updateTrigger.comments ? 'border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'border-emerald-900/50'} transition-all duration-500 relative overflow-hidden group hover:border-emerald-500 hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]`}>
              {/* Efekt poświaty w tle */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-emerald-500/30 rounded-full blur-3xl opacity-70 group-hover:opacity-90 transition-opacity"></div>
              
              {/* Wskaźnik live data */}
              <div className="absolute top-3 right-3 flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1 shadow-[0_0_5px_rgba(16,185,129,0.7)]"></span>
                <span className="text-xs text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity">live</span>
              </div>
              
              {/* Efekt błysku przy aktualizacji */}
              {updateTrigger.comments && (
                <div className="absolute inset-0 bg-emerald-500/20 animate-[pulse_1s_ease-in-out]"></div>
              )}
              
              {/* Gradient w tle animowany */}
              <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 animate-[shimmer_3s_infinite] transition-opacity"></div>
              
              <h3 className="text-emerald-300 text-sm font-semibold mb-2 relative filter drop-shadow-[0_0_3px_rgba(16,185,129,0.5)]">Comments</h3>
              {isLoading ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-t-2 border-emerald-500 rounded-full animate-spin mr-2"></div>
                  <p className="text-3xl md:text-4xl font-bold text-white">Loading...</p>
                </div>
              ) : (
                <p className={`text-3xl md:text-4xl font-bold ${updateTrigger.comments ? 'text-emerald-400' : 'text-white'} transition-colors duration-500 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]`}>
                  {commentsCount.toLocaleString()}
                </p>
              )}
            </div>
            
            {/* Likes - Różowy */}
            <div className={`bg-gradient-to-br from-black to-pink-950/40 backdrop-blur-md rounded-xl p-6 border ${updateTrigger.likes ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.8)]' : 'border-pink-900/50'} transition-all duration-500 relative overflow-hidden group hover:border-pink-500 hover:shadow-[0_0_25px_rgba(236,72,153,0.5)]`}>
              {/* Efekt poświaty w tle */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-pink-500/30 rounded-full blur-3xl opacity-70 group-hover:opacity-90 transition-opacity"></div>
              
              {/* Wskaźnik live data */}
              <div className="absolute top-3 right-3 flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-pink-500 animate-pulse mr-1 shadow-[0_0_5px_rgba(236,72,153,0.7)]"></span>
                <span className="text-xs text-pink-300 opacity-0 group-hover:opacity-100 transition-opacity">live</span>
              </div>
              
              {/* Efekt błysku przy aktualizacji */}
              {updateTrigger.likes && (
                <div className="absolute inset-0 bg-pink-500/20 animate-[pulse_1s_ease-in-out]"></div>
              )}
              
              {/* Gradient w tle animowany */}
              <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-pink-500/10 to-transparent opacity-0 group-hover:opacity-100 animate-[shimmer_3s_infinite] transition-opacity"></div>
              
              <h3 className="text-pink-300 text-sm font-semibold mb-2 relative filter drop-shadow-[0_0_3px_rgba(236,72,153,0.5)]">Total Likes</h3>
              {isLoading ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-t-2 border-pink-500 rounded-full animate-spin mr-2"></div>
                  <p className="text-3xl md:text-4xl font-bold text-white">Loading...</p>
                </div>
              ) : (
                <p className={`text-3xl md:text-4xl font-bold ${updateTrigger.likes ? 'text-pink-400' : 'text-white'} transition-colors duration-500 filter drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]`}>
                  {likesCount.toLocaleString()}
                </p>
              )}
            </div>

            {/* Transactions - Active data that was fetched once */}
            <div className="bg-gradient-to-br from-black to-orange-950/40 backdrop-blur-md rounded-xl p-6 border border-orange-900/50 relative overflow-hidden group hover:border-orange-500 hover:shadow-[0_0_25px_rgba(249,115,22,0.5)]">
              {/* Background glow effect */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-orange-500/30 rounded-full blur-3xl opacity-70 group-hover:opacity-90 transition-opacity"></div>
              
              {/* Live indicator dot */}
              <div className="absolute top-3 right-3 flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse mr-1 shadow-[0_0_5px_rgba(249,115,22,0.7)]"></span>
              </div>
              
              {/* Animated background gradient */}
              <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 animate-[shimmer_3s_infinite] transition-opacity"></div>
              
              <h3 className="text-orange-300 text-sm font-semibold mb-2 relative filter drop-shadow-[0_0_3px_rgba(249,115,22,0.5)]">Contract Transactions</h3>
              {isLoading ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-t-2 border-orange-500 rounded-full animate-spin mr-2"></div>
                  <p className="text-3xl md:text-4xl font-bold text-white">Loading...</p>
                </div>
              ) : (
                <div className="relative">
                  <p className="text-3xl md:text-4xl font-bold text-white transition-colors duration-500 filter drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]">
                    {transactionsCount.toLocaleString()}
                  </p>
                  <p className="text-xs text-orange-300/70 mt-2">
                    Transactions on MySphere contracts
                  </p>
                </div>
              )}
            </div>
            
            {/* ETH Revenue - zmienione z zablokowanego na aktywne */}
            <div className="bg-gradient-to-br from-black to-yellow-950/40 backdrop-blur-md rounded-xl p-6 border border-yellow-900/50 relative overflow-hidden group hover:border-yellow-500 hover:shadow-[0_0_25px_rgba(234,179,8,0.5)]">
              {/* Efekt poświaty w tle */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-yellow-500/30 rounded-full blur-3xl opacity-70 group-hover:opacity-90 transition-opacity"></div>
              
              {/* Live indicator dot */}
              <div className="absolute top-3 right-3 flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse mr-1 shadow-[0_0_5px_rgba(234,179,8,0.7)]"></span>
              </div>
              
              {/* Animated background gradient */}
              <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent opacity-0 group-hover:opacity-100 animate-[shimmer_3s_infinite] transition-opacity"></div>
              
              <h3 className="text-yellow-300 text-sm font-semibold mb-2 relative filter drop-shadow-[0_0_3px_rgba(234,179,8,0.5)]">ETH Revenue</h3>
              {isLoading || ethRevenue === null ? (
                <div className="flex items-center">
                  <div className="w-5 h-5 border-t-2 border-yellow-500 rounded-full animate-spin mr-2"></div>
                  <p className="text-3xl md:text-4xl font-bold text-white">Loading...</p>
                </div>
              ) : (
                <div className="relative">
                  <p className="text-3xl md:text-4xl font-bold text-white transition-colors duration-500 filter drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]">
                    {ethRevenue.toFixed(4)} <span className="text-base text-yellow-300">ETH</span>
                  </p>
                  <p className="text-xs text-yellow-300/70 mt-2">
                    Total ETH across contracts & wallet
                  </p>
                </div>
              )}
            </div>

            {/* Smart Contracts - zmieniony z zablokowanego na aktywny */}
            <div className="bg-gradient-to-br from-black to-indigo-950/40 backdrop-blur-md rounded-xl p-6 border border-indigo-900/50 relative overflow-hidden group hover:border-indigo-500 hover:shadow-[0_0_25px_rgba(99,102,241,0.5)]">
              {/* Efekt poświaty w tle */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-indigo-500/30 rounded-full blur-3xl opacity-70 group-hover:opacity-90 transition-opacity"></div>
              
              {/* Live indicator dot */}
              <div className="absolute top-3 right-3 flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse mr-1 shadow-[0_0_5px_rgba(99,102,241,0.7)]"></span>
              </div>
              
              {/* Animated background gradient */}
              <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 animate-[shimmer_3s_infinite] transition-opacity"></div>
              
              <h3 className="text-indigo-300 text-sm font-semibold mb-2 relative filter drop-shadow-[0_0_3px_rgba(99,102,241,0.5)]">Smart Contracts</h3>
              <div className="relative">
                <p className="text-3xl md:text-4xl font-bold text-white transition-colors duration-500 filter drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">
                  2
                </p>
                <p className="text-xs text-indigo-300/70 mt-2">
                  Verified MySphere contracts
                </p>
              </div>
            </div>
            
            {/* MySphere Treasury - Cyjan/Turkusowy (zablokowany z kłódką) */}
            <div className="bg-gradient-to-br from-black to-cyan-950/40 backdrop-blur-md rounded-xl p-6 border border-cyan-900/30 relative overflow-hidden group">
              {/* Efekt poświaty w tle */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-cyan-500/20 rounded-full blur-3xl opacity-50"></div>
              
              {/* Ikona kłódki */}
              <div className="absolute top-3 right-3 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              
              {/* Przezroczystość dla zablokowania */}
              <div className="absolute inset-0 bg-black/40"></div>
              
              <div className="relative z-10">
                <h3 className="text-cyan-300/80 text-sm font-semibold mb-2 relative">MySphere Treasury</h3>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-3xl md:text-4xl font-bold text-white/60">
                    --
                  </p>
                  <span className="bg-cyan-900/20 text-cyan-400/80 text-xs px-2 py-1 rounded">Coming Soon</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Contract addresses section - added below stats section */}
        <section className="max-w-6xl mx-auto px-4 mb-16">
          <h3 className="text-lg font-semibold text-gray-300 mb-4 text-center">
            <span className="text-[#0052FF]">Verified</span> Smart Contracts
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a href="https://basescan.org/address/0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7" target="_blank" rel="noopener noreferrer" 
               className="bg-black/30 backdrop-blur-md rounded-xl p-4 border border-gray-800 hover:border-orange-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] group">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-orange-400 mr-2">
                      <FaCheckCircle className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-medium text-orange-400">OnchainPost</h3>
                    <span className="ml-2 text-xs text-gray-500">({transactionsCount > 0 ? "1,365 txs" : "Loading..."})</span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mt-1 truncate">0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7</p>
                </div>
                <div className="text-gray-500 group-hover:text-orange-400 transition-colors">
                  <FaExternalLinkAlt className="w-3 h-3" />
                </div>
              </div>
            </a>
            
            <a href="https://basescan.org/address/0x9c44802843a670732383f62b2f3304f92ec1702b" target="_blank" rel="noopener noreferrer"
               className="bg-black/30 backdrop-blur-md rounded-xl p-4 border border-gray-800 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(99,102,241,0.3)] group">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-indigo-400 mr-2">
                      <FaCheckCircle className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-medium text-indigo-400">QuotesOnBase</h3>
                    <span className="ml-2 text-xs text-gray-500">(59 txs)</span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mt-1 truncate">0x9c44802843a670732383f62b2f3304f92ec1702b</p>
                </div>
                <div className="text-gray-500 group-hover:text-indigo-400 transition-colors">
                  <FaExternalLinkAlt className="w-3 h-3" />
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* Features Section - The MySphere Stack */}
        <section className="max-w-7xl mx-auto px-4 mb-32">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">
            The <span className="text-[#0052FF]">MySphere</span> Stack
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Feature 1 */}
            <div className="relative bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-[#0052FF]/40 transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,82,255,0.3)] group">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl blur-md"></div>
              </div>
              <div className="relative z-10">
                <h3 className="text-xl md:text-2xl font-bold mb-4 text-white group-hover:text-[#0052FF] transition-colors filter drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">AI-Powered Content Creation</h3>
                <p className="text-gray-300 text-lg filter drop-shadow-[0_0_3px_rgba(255,255,255,0.3)]">
                  Advanced generative AI technology enables users to create high-quality posts and crypto quotes, enhancing creativity and productivity while maintaining the personal touch of human creators.
                </p>
              </div>
            </div>
            
            {/* Feature 2 */}
            <div className="relative bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-[#0052FF]/40 transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,82,255,0.2)] group">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl blur-md"></div>
              </div>
              <div className="relative z-10">
                <h3 className="text-xl md:text-2xl font-bold mb-4 text-white group-hover:text-[#0052FF] transition-colors">Onchain Social Identity</h3>
                <p className="text-gray-400 text-lg">
                  All posts and user interactions are recorded on the Base blockchain, creating permanent, verifiable digital footprints and reputation that travels with users across the Web3 ecosystem.
                </p>
              </div>
            </div>
            
            {/* Feature 3 */}
            <div className="relative bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-[#0052FF]/40 transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,82,255,0.2)] group">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl blur-md"></div>
              </div>
              <div className="relative z-10">
                <h3 className="text-xl md:text-2xl font-bold mb-4 text-white group-hover:text-[#0052FF] transition-colors">Tokenized Social Graph</h3>
                <p className="text-gray-400 text-lg">
                  Social connections and influential content can be tokenized as NFTs, allowing creators to directly monetize their contributions and followers to invest in growing communities.
                </p>
              </div>
            </div>
            
            {/* Feature 4 */}
            <div className="relative bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-[#0052FF]/40 transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,82,255,0.2)] group">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl blur-md"></div>
              </div>
              <div className="relative z-10">
                <h3 className="text-xl md:text-2xl font-bold mb-4 text-white group-hover:text-[#0052FF] transition-colors">Integrated DeFi Ecosystem</h3>
                <p className="text-gray-400 text-lg">
                  Seamless finance features including Bridge, Earn and Morpho Vaults empower users to manage crypto assets without leaving the social environment, bringing together conversation and value in one place.
                </p>
              </div>
            </div>
            
            {/* Feature 5 */}
            <div className="relative bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-[#0052FF]/40 transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,82,255,0.2)] md:col-span-2 group">
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl blur-md"></div>
              </div>
              <div className="relative z-10 md:max-w-3xl md:mx-auto">
                <h3 className="text-xl md:text-2xl font-bold mb-4 text-white group-hover:text-[#0052FF] transition-colors">Multi-layer Reputation System</h3>
                <p className="text-gray-400 text-lg">
                  Comprehensive onchain reputation metrics combine community engagement, content quality, and blockchain activity to create a trustworthy social environment that rewards valuable contributions.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Network Stats */}
        <div className="max-w-4xl mx-auto px-4 md:px-8 mb-32">
          <h2 className="text-xl md:text-3xl font-bold text-center mb-6 text-white">
            <span className="text-[#0052FF]">BASE</span> NETWORK STATUS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-[#0052FF]/50 transition-colors">
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
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-[#0052FF]/50 transition-colors">
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
            <div className="bg-black/30 backdrop-blur-sm rounded-xl p-6 border border-gray-800 hover:border-[#0052FF]/50 transition-colors">
              <h3 className="text-[#0052FF] text-sm font-['Coinbase_Display'] font-medium mb-2">ETH PRICE</h3>
              <p className="text-white text-xl font-['Coinbase_Display']">
                {ethPrice ? (
                  <>
                    ${ethPrice.toLocaleString()}
                    <span className={`ml-2 text-sm ${ethPriceChange && ethPriceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {ethPriceChange ? `${ethPriceChange >= 0 ? '+' : ''}${ethPriceChange.toFixed(2)}%` : ''}
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
          </div>
        </div>
      </div>

      {/* Dodajemy sekcję Join the Community */}
      <section className="relative py-28 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold mb-4 text-white filter drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]">Join the Community</h2>
            <p className="text-xl text-gray-100 max-w-2xl mx-auto filter drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
              Get involved with the SPHERE developer community
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-16">
            {communityLinks.map((link, index) => (
              link.disabled ? (
                <div 
                  key={index}
                  className={`${link.bgClass} rounded-xl p-6 group relative`}
                >
                  <div className="flex items-start space-x-4">
                    <div className="p-3 rounded-lg bg-gray-500/20 text-gray-400">
                      <link.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center">
                        <h3 className="text-xl font-semibold text-gray-400 mb-1">{link.title}</h3>
                        <span className="ml-2 text-gray-500">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </span>
                      </div>
                      <p className="text-gray-500">{link.description}</p>
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-gray-400 text-sm bg-black/60 px-3 py-1 rounded-full">Coming soon</span>
                  </div>
                </div>
              ) : (
                <Link 
                  key={index} 
                  href={link.url}
                  className={`${link.bgClass} rounded-xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,82,255,0.3)] group`}
                >
                  <div className="flex items-start space-x-4">
                    <div className="p-3 rounded-lg bg-blue-500/20 text-blue-500 filter drop-shadow-[0_0_8px_rgba(0,82,255,0.5)]">
                      <link.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-1 group-hover:text-blue-400 filter drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">{link.title}</h3>
                      <p className="text-gray-300">{link.description}</p>
                    </div>
                  </div>
                </Link>
              )
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-white mt-16">
            <div>
              <h3 className="text-xl font-bold mb-4 text-blue-400 filter drop-shadow-[0_0_8px_rgba(0,82,255,0.5)]">Main Features</h3>
              <ul className="space-y-2">
                {navigationLinks.main.map((link, index) => (
                  <li key={index}>
                    <Link href={link.url || "#"} className="text-gray-300 hover:text-white transition-colors hover:drop-shadow-[0_0_5px_rgba(255,255,255,0.5)]">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h3 className="text-xl font-bold mb-4 text-green-400">Finance</h3>
              <ul className="space-y-2">
                {resourceLinks.finance.map((link, index) => (
                  <li key={index}>
                    <Link href={link.url || "#"} className="text-gray-400 hover:text-white transition-colors">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
              
              <h3 className="text-xl font-bold mb-4 mt-8 text-purple-400">NFT</h3>
              <ul className="space-y-2">
                {resourceLinks.nft.map((link, index) => (
                  <li key={index}>
                    <Link href={link.url || "#"} className="text-gray-400 hover:text-white transition-colors">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h3 className="text-xl font-bold mb-4 text-indigo-400">Tools</h3>
              <ul className="space-y-2">
                {resourceLinks.tools.map((link, index) => (
                  <li key={index}>
                    <Link href={link.url || "#"} className="text-gray-400 hover:text-white transition-colors">
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
              
              <h3 className="text-xl font-bold mb-4 mt-8 text-yellow-400">Governance</h3>
              <ul className="space-y-2">
                {resourceLinks.governance.map((link, index) => (
                  <li key={index}>
                    {link.disabled ? (
                      <div className="flex items-center text-gray-500 opacity-60 cursor-not-allowed">
                        {link.title}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                    ) : (
                      <Link href={link.url || "#"} className="text-gray-400 hover:text-white transition-colors">
                        {link.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h3 className="text-xl font-bold mb-4 text-orange-400">Community</h3>
              <ul className="space-y-2">
                {resourceLinks.community.map((link, index) => (
                  <li key={index}>
                    {link.disabled ? (
                      <div className="flex items-center text-gray-500 opacity-60 cursor-not-allowed">
                        {link.title}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                    ) : (
                      <Link href={link.url || "#"} className="text-gray-400 hover:text-white transition-colors">
                        {link.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer moved to bottom */}
      <div className="relative z-10 border-t border-gray-800 py-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
          {/* Sphere logo po lewej */}
          <div className="flex items-center mb-4 md:mb-0">
            <Image
              src="/elo2.png"
              alt="SPHERE"
              width={60}
              height={20}
              className="h-5 w-auto opacity-70 hover:opacity-100 transition-opacity"
              style={{ width: 'auto', height: '20px', maxWidth: '60px' }}
            />
          </div>

          {/* Base logo na środku */}
          <div className="md:absolute md:left-1/2 md:transform md:-translate-x-1/2 mb-4 md:mb-0">
            <Link href="https://base.org" target="_blank" className="opacity-70 hover:opacity-100 transition-opacity">
              <Image 
                src="/brand-kit/base/logo/wordmark/Base_Wordmark_White.png"
                alt="Base Logo"
                width={60}
                height={24}
                className="h-6 w-auto"
              />
            </Link>
          </div>
          
          {/* Copyright i built with po prawej */}
          <div className="text-sm text-gray-500 flex items-center">
            <span>© 2024 mySphere.fun - Built with</span>
            <Link href="https://github.com/coinbase/onchainkit" target="_blank" className="ml-2 inline-flex items-center hover:opacity-90 transition-opacity">
              <OnchainkitSvg className="w-20 h-4 text-[#0052FF]/80 hover:text-[#0052FF] transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
