'use client';

import Link from 'next/link';
import { useAccount, useContractRead, useContractReads } from 'wagmi';
import { motion } from 'framer-motion';
import { useState, useEffect, useMemo } from 'react';
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

// Import Camp Network config
import { baseCampChain, BASECAMP_POST_CONTRACT_ABI } from './contracts/BaseCampPostContract';

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
        },
        orbit: {
          '0%': { transform: 'rotate(0deg) translateX(50px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(50px) rotate(-360deg)' }
        },
        flow: {
          '0%': { left: '0%', opacity: '0' },
          '50%': { opacity: '1' },
          '100%': { left: '100%', opacity: '0' }
        },
        twinkle: {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' }
        }
      },
      animation: {
        glow: 'glow 2s ease-in-out infinite',
        orbit: 'orbit 4s linear infinite',
        flow: 'flow 2s ease-in-out infinite',
        twinkle: 'twinkle 3s ease-in-out infinite'
      }
    }
  }
}

// Camp Network contracts addresses
const CAMP_POST_CONTRACT = "0x177Af844a3c7A1749dE97656a5d84b6373Fc350E" as `0x${string}`;
const PORTAL_NFT_CONTRACT = "0x1eD74B27f846C699A90926daD057A7f6FD22C126" as `0x${string}`;

// PORTAL NFT ABI (simplified - only for reading totalClaimed)
const PORTAL_NFT_ABI = [
  {
    "inputs": [],
    "name": "totalClaimed",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Base Network contracts addresses
const BASE_POST_CONTRACT = "0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7" as `0x${string}`;
const BASE_QUOTES_CONTRACT = "0x9c44802843a670732383f62b2f3304f92ec1702b" as `0x${string}`;

// Base Network NFT contracts addresses
const BASE_NFT_PIONEER = "0x8edb8B2383f41e14b49414dd32c4A786Ed2e277d" as `0x${string}`;
const BASE_NFT_GUARDIAN = "0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E" as `0x${string}`;
const BASE_NFT_MASTER = "0x6d55153A6B1d1157f19D403DEd541fbe6De48C5A" as `0x${string}`;

// Base contracts ABI (simplified - for reading post/quote counts)
const BASE_CONTRACT_ABI = [
  {
    "inputs": [],
    "name": "postCount",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalPosts",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "quoteCount",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Funkcja do pobierania danych o transakcjach dla określonych kontraktów na sieci Base
async function getBaseContractTransactions() {
  console.log(`🚀 getBaseContractTransactions() wywołana o ${new Date().toLocaleTimeString()}`);
  
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
      
      // Pobierz rzeczywistą liczbę transakcji z BaseScan API
      const txCountResponse = await fetch(
        `https://api.basescan.org/api?module=account&action=txlist&address=${contractAddress}&startblock=0&endblock=99999999&sort=asc&apikey=${process.env.NEXT_PUBLIC_BASESCAN_API_KEY || 'YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN'}`
      );
      
      let totalTransactions = 0;
      const txData = await txCountResponse.json();
      
      // Debug: loguj odpowiedź API
      console.log(`🔍 BaseScan API response for ${contractAddress}:`, {
        status: txData.status,
        message: txData.message,
        resultLength: Array.isArray(txData.result) ? txData.result.length : 'not array',
        result: Array.isArray(txData.result) ? 'array' : txData.result
      });
      
      if (txData.status === '1' && Array.isArray(txData.result)) {
        totalTransactions = txData.result.length;
        console.log(`✅ Pobrano ${totalTransactions} transakcji dla ${contractAddress}`);
      } else {
        // Fallback do wcześniej znanych wartości w przypadku błędu API
        if (contractAddress === "0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7") {
          totalTransactions = 1365;
        } else if (contractAddress === "0x9c44802843a670732383f62b2f3304f92ec1702b") {
          totalTransactions = 59;
        }
        console.log(`❌ Błąd API BaseScan, użyto fallback dla ${contractAddress}: ${totalTransactions}`);
        console.log(`Błąd API: ${txData.message || 'Unknown error'}`);
      }
      
      // Sprawdź czy to kontrakt
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
      // W przypadku błędu, używamy fallbackowych wartości
      let fallbackTx = 0;
      if (contractAddress === "0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7") {
        fallbackTx = 1365;
      } else if (contractAddress === "0x9c44802843a670732383f62b2f3304f92ec1702b") {
        fallbackTx = 59;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Błąd pobierania danych dla ${contractAddress}:`, error);
      console.log(`Użyto fallbackowej liczby transakcji: ${fallbackTx}`);
      
      return { 
        address: contractAddress, 
        transactions: fallbackTx, 
        error: errorMessage 
      };
    }
  }
  
  // Pobierz dane dla kontraktów z delay (BaseScan ma limit 2/sec)
  const contractsData = [];
  for (let i = 0; i < contractAddresses.length; i++) {
    console.log(`🔄 Zapytanie ${i + 1}/${contractAddresses.length} do BaseScan: ${contractAddresses[i]}`);
    
    if (i > 0) {
      console.log(`⏳ Czekam 1000ms przed następnym zapytaniem...`);
      // Czekaj 1000ms między zapytaniami (bezpieczniej dla rate limit)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const data = await fetchContractData(contractAddresses[i]);
    contractsData.push(data);
    
    console.log(`✅ Zapytanie ${i + 1} zakończone, transactions: ${data.transactions}`);
  }
  
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
  const [transactionsCount] = useState(1340); // Fallback tylko

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

  // LIVE DATA z Camp Network blockchain
  const { data: campPostsData } = useContractRead({
    address: CAMP_POST_CONTRACT,
    abi: BASECAMP_POST_CONTRACT_ABI,
    functionName: 'totalPosts',
    chainId: baseCampChain.id,
  });

  const { data: portalClaimedData } = useContractRead({
    address: PORTAL_NFT_CONTRACT,
    abi: PORTAL_NFT_ABI,
    functionName: 'totalClaimed',
    chainId: baseCampChain.id,
  });

  // LIVE DATA z Base Network blockchain
  const { data: basePostsData } = useContractRead({
    address: BASE_POST_CONTRACT,
    abi: BASE_CONTRACT_ABI,
    functionName: 'totalPosts',
    chainId: 8453, // Base mainnet
  });

  const { data: baseQuotesData } = useContractRead({
    address: BASE_QUOTES_CONTRACT,
    abi: BASE_CONTRACT_ABI,
    functionName: 'totalSupply',
    chainId: 8453, // Base mainnet
  });

  // LIVE DATA z Base Network NFT blockchain
  const { data: basePioneerData } = useContractRead({
    address: BASE_NFT_PIONEER,
    abi: BASE_CONTRACT_ABI,
    functionName: 'totalSupply',
    chainId: 8453, // Base mainnet
  });

  const { data: baseGuardianData } = useContractRead({
    address: BASE_NFT_GUARDIAN,
    abi: BASE_CONTRACT_ABI,
    functionName: 'totalSupply',
    chainId: 8453, // Base mainnet
  });

  const { data: baseMasterData } = useContractRead({
    address: BASE_NFT_MASTER,
    abi: BASE_CONTRACT_ABI,
    functionName: 'totalSupply',
    chainId: 8453, // Base mainnet
  });

  // Oblicz łączną liczbę transakcji Camp Network na żywo
  const campTransactionsCount = useMemo(() => {
    const postTransactions = campPostsData ? Number(campPostsData) : 0;
    const nftTransactions = portalClaimedData ? Number(portalClaimedData) : 0;
    return postTransactions + nftTransactions;
  }, [campPostsData, portalClaimedData]);

  // Oblicz łączną liczbę transakcji Base Network na żywo
  const baseTransactionsCount = useMemo(() => {
    const posts = basePostsData ? Number(basePostsData) : 0;
    const quotes = baseQuotesData ? Number(baseQuotesData) : 0;
    const pioneer = basePioneerData ? Number(basePioneerData) : 0;
    const guardian = baseGuardianData ? Number(baseGuardianData) : 0;
    const master = baseMasterData ? Number(baseMasterData) : 0;
    return posts + quotes + pioneer + guardian + master;
  }, [basePostsData, baseQuotesData, basePioneerData, baseGuardianData, baseMasterData]);

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

    // Funkcja do jednorazowego pobrania i zapisania danych Base
    const fetchAndStoreContractData = async () => {
      try {
        // Cache już nie jest używany - dane pochodzą z wagmi hooks
        
        // Pobierz świeże dane (już nie używane - dane z wagmi hooks)
        const freshData = await getBaseContractTransactions();
        console.log('Pobrano dane o transakcjach:', freshData);
        
        // Zapisz w localStorage (pozostawione dla celów cache'owania)
        localStorage.setItem('baseContractTransactions', JSON.stringify(freshData));
        
        return freshData;
      } catch (error: unknown) {
        console.error('Błąd pobierania danych o transakcjach:', error);
        return null;
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
    fetchAndStoreContractData();
     
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
    <>
      <style jsx global>{`
        @keyframes orbit {
          0% { transform: rotate(0deg) translateX(50px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(50px) rotate(-360deg); }
        }
        @keyframes orbit-large {
          0% { transform: rotate(0deg) translateX(75px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(75px) rotate(-360deg); }
        }
        @keyframes orbit-small {
          0% { transform: rotate(0deg) translateX(50px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(50px) rotate(-360deg); }
        }
        @keyframes progress-fill {
          0% { width: 0%; }
          100% { width: var(--target-width); }
        }
        @keyframes progress-blue {
          0% { width: 0%; }
          100% { width: var(--target-width); }
        }
        @keyframes progress-orange {
          0% { width: 0%; min-width: 0px; }
          100% { width: var(--target-width); min-width: var(--min-width); }
        }
        @keyframes flow {
          0% { left: 0%; opacity: 0; }
          50% { opacity: 1; }
          100% { left: 100%; opacity: 0; }
        }
        @keyframes flow-right {
          0% { left: 0%; opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1); }
          100% { left: 100%; opacity: 0; transform: scale(0.5); }
        }
        @keyframes flow-left {
          0% { left: 100%; opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1); }
          100% { left: 0%; opacity: 0; transform: scale(0.5); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes grid-move {
          0% { transform: translateX(0) translateY(0); }
          100% { transform: translateX(50px) translateY(50px); }
        }
        @keyframes beam-flow-left {
          0% { left: 0%; opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1); }
          100% { left: 100%; opacity: 0; transform: scale(0.5); }
        }
        @keyframes beam-flow-right {
          0% { left: 0%; opacity: 0; transform: scale(0.5); }
          50% { opacity: 1; transform: scale(1); }
          100% { left: 100%; opacity: 0; transform: scale(0.5); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.4; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.8; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 15px rgba(59, 130, 246, 0.6); }
          50% { box-shadow: 0 0 25px rgba(59, 130, 246, 1); }
        }
        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
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
      
      {/* Pomarańczowo-czarno-niebieski gradient w tle */}
      <div className="fixed inset-0 bg-gradient-to-br from-orange-500/40 via-gray-900 to-blue-800/50 z-0"></div>

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

            {/* Camp Network Integration Card - FEATURED */}
            <div className="group">
              <Link href="/mycamp" className={`block h-full ${isAppleDevice ? 'apple-performance' : ''}`}>
                <div 
                  className="h-full bg-gradient-to-br from-orange-400/30 via-orange-500/25 to-orange-600/30 backdrop-blur-xl rounded-xl overflow-hidden border-2 border-orange-400/60 hover:border-orange-300/80 transition-all duration-500 group-hover:scale-[1.05] group-hover:shadow-2xl shadow-[0_0_25px_rgba(249,115,22,0.4)] p-6 relative"
                  onTouchStart={() => {}} // Eliminacja 300ms opóźnienia na urządzeniach mobilnych
                >
                  {/* Animated border glow */}
                  <div className="absolute -inset-[2px] rounded-xl bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 opacity-60 group-hover:opacity-100 animate-[spin_3s_linear_infinite] transition-opacity duration-500"></div>
                  <div className="absolute inset-[2px] rounded-xl bg-gradient-to-br from-orange-400/30 via-orange-500/25 to-orange-600/30 backdrop-blur-xl"></div>
                  
                  {/* Enhanced hover overlay */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    <div className="absolute inset-0 bg-gradient-to-r from-orange-400/40 to-orange-600/40 rounded-xl blur-xl transition-all duration-500"></div>
                  </div>
                  
                  {/* Enhanced NEW badge */}
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-orange-500/30 border-2 border-orange-400/50 shadow-[0_0_15px_rgba(249,115,22,0.6)]">
                      <span className="w-3 h-3 rounded-full bg-orange-400 animate-pulse mr-2 shadow-[0_0_8px_rgba(249,115,22,0.8)]"></span>
                      <span className="text-orange-100 text-sm font-bold">HOT</span>
                    </span>
                  </div>
                  
                  {/* Content */}
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-2xl font-['Share_Tech_Mono'] grid-title group-hover:text-orange-200 text-orange-100 filter drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]">Camp Network</h2>
                    </div>
                    <p className="text-orange-50/90 text-base md:text-lg font-['Coinbase_Display'] leading-relaxed filter drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">
                      Explore the new Camp Network integration! Connect your social accounts, manage your onchain identity, and access exclusive features.
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
                    {baseTransactionsCount > 0 ? baseTransactionsCount.toLocaleString() : transactionsCount.toLocaleString()}
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
                  7
                </p>
                <p className="text-xs text-indigo-300/70 mt-2">
                  Verified MySphere contracts
                </p>
              </div>
            </div>
            
            {/* Camp Network Transactions - Nowa statystyka */}
            <div className="bg-gradient-to-br from-black to-orange-950/40 backdrop-blur-md rounded-xl p-6 border border-orange-900/50 relative overflow-hidden group hover:border-orange-500 hover:shadow-[0_0_25px_rgba(249,115,22,0.5)]">
              {/* Background glow effect */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-orange-500/30 rounded-full blur-3xl opacity-70 group-hover:opacity-90 transition-opacity"></div>
              
              {/* Simple live indicator */}
              <div className="absolute top-3 right-3 flex items-center">
                <span className="inline-flex items-center px-2 py-1 rounded-full bg-orange-500/20 border border-orange-400/30">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse mr-1"></span>
                  <span className="text-orange-300 text-xs font-bold">LIVE</span>
                </span>
              </div>
              
              {/* Animated background gradient */}
              <div className="absolute -inset-[100%] bg-gradient-to-r from-transparent via-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 animate-[shimmer_3s_infinite] transition-opacity"></div>
              
              <h3 className="text-orange-300 text-sm font-semibold mb-2 relative filter drop-shadow-[0_0_3px_rgba(249,115,22,0.5)]">Camp Network</h3>
              <div className="relative">
                <p className="text-3xl md:text-4xl font-bold text-white transition-colors duration-500 filter drop-shadow-[0_0_8px_rgba(249,115,22,0.5)]">
                  {campTransactionsCount.toLocaleString()}
                </p>
                <p className="text-xs text-orange-300/70 mt-2">
                  Transactions on Camp Network
                </p>
              </div>
            </div>


          </div>
        </section>

        {/* Contract addresses section - added below stats section */}
        <section className="max-w-6xl mx-auto px-4 mb-16">
          <h3 className="text-lg font-semibold text-gray-300 mb-4 text-center">
            <span className="text-[#0052FF]">Verified</span> Smart Contracts
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <a href="https://basescan.org/address/0x6e1811a5401dfc30e8f3e2dd9de0bbe156f97ac7" target="_blank" rel="noopener noreferrer" 
               className="bg-black/30 backdrop-blur-md rounded-xl p-4 border border-gray-800 hover:border-orange-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] group">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-orange-400 mr-2">
                      <FaCheckCircle className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-medium text-orange-400">OnchainPost</h3>
                    <span className="ml-2 text-xs text-gray-500">({basePostsData ? Number(basePostsData) : 0} posts)</span>
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
                    <span className="ml-2 text-xs text-gray-500">({baseQuotesData ? Number(baseQuotesData) : 0} quotes)</span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mt-1 truncate">0x9c44802843a670732383f62b2f3304f92ec1702b</p>
                </div>
                <div className="text-gray-500 group-hover:text-indigo-400 transition-colors">
                  <FaExternalLinkAlt className="w-3 h-3" />
                </div>
              </div>
            </a>

            {/* SPHERE Pioneer NFT */}
            <a href="https://basescan.org/address/0x8edb8B2383f41e14b49414dd32c4A786Ed2e277d" target="_blank" rel="noopener noreferrer"
               className="bg-black/30 backdrop-blur-md rounded-xl p-4 border border-gray-800 hover:border-purple-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(147,51,234,0.3)] group">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-purple-400 mr-2">
                      <FaCheckCircle className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-medium text-purple-400">SPHERE Pioneer</h3>
                    <span className="ml-2 text-xs text-gray-500">({basePioneerData ? Number(basePioneerData) : 0} minted)</span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mt-1 truncate">0x8edb8B2383f41e14b49414dd32c4A786Ed2e277d</p>
                </div>
                <div className="text-gray-500 group-hover:text-purple-400 transition-colors">
                  <FaExternalLinkAlt className="w-3 h-3" />
                </div>
              </div>
            </a>

            {/* SPHERE Guardian NFT */}
            <a href="https://basescan.org/address/0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E" target="_blank" rel="noopener noreferrer"
               className="bg-black/30 backdrop-blur-md rounded-xl p-4 border border-gray-800 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] group">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-cyan-400 mr-2">
                      <FaCheckCircle className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-medium text-cyan-400">SPHERE Guardian</h3>
                    <span className="ml-2 text-xs text-gray-500">({baseGuardianData ? Number(baseGuardianData) : 0} minted)</span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mt-1 truncate">0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E</p>
                </div>
                <div className="text-gray-500 group-hover:text-cyan-400 transition-colors">
                  <FaExternalLinkAlt className="w-3 h-3" />
                </div>
              </div>
            </a>

            {/* SPHERE Master NFT */}
            <a href="https://basescan.org/address/0x6d55153A6B1d1157f19D403DEd541fbe6De48C5A" target="_blank" rel="noopener noreferrer"
               className="bg-black/30 backdrop-blur-md rounded-xl p-4 border border-gray-800 hover:border-yellow-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(234,179,8,0.3)] group">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-yellow-400 mr-2">
                      <FaCheckCircle className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-medium text-yellow-400">SPHERE Master</h3>
                    <span className="ml-2 text-xs text-gray-500">({baseMasterData ? Number(baseMasterData) : 0} minted)</span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mt-1 truncate">0x6d55153A6B1d1157f19D403DEd541fbe6De48C5A</p>
                </div>
                <div className="text-gray-500 group-hover:text-yellow-400 transition-colors">
                  <FaExternalLinkAlt className="w-3 h-3" />
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* Camp Network contracts section */}
        <section className="max-w-6xl mx-auto px-4 mb-16">
          <h3 className="text-lg font-semibold text-gray-300 mb-4 text-center">
            <span className="text-orange-400">Camp Network</span> Smart Contracts
            <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full bg-orange-500/20 border border-orange-400/30">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse mr-1"></span>
              <span className="text-orange-300 text-xs font-bold">NEW INTEGRATION</span>
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a href="https://basecamp.cloud.blockscout.com/address/0x177Af844a3c7A1749dE97656a5d84b6373Fc350E" target="_blank" rel="noopener noreferrer" 
               className="bg-gradient-to-br from-orange-500/10 via-blue-500/10 to-orange-600/10 backdrop-blur-md rounded-xl p-4 border border-orange-800/50 hover:border-orange-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(249,115,22,0.3)] group">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-orange-400 mr-2">
                      <FaCheckCircle className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-medium text-orange-400">Camp Network Post</h3>
                    <span className="ml-2 text-xs text-gray-500">
                      ({campPostsData ? Number(campPostsData) : 0} posts)
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mt-1 truncate">0x177Af844a3c7A1749dE97656a5d84b6373Fc350E</p>
                </div>
                <div className="text-gray-500 group-hover:text-orange-400 transition-colors">
                  <FaExternalLinkAlt className="w-3 h-3" />
                </div>
              </div>
            </a>
            
            <a href="https://basecamp.cloud.blockscout.com/token/0x1eD74B27f846C699A90926daD057A7f6FD22C126" target="_blank" rel="noopener noreferrer"
               className="bg-gradient-to-br from-orange-500/10 via-blue-500/10 to-orange-600/10 backdrop-blur-md rounded-xl p-4 border border-orange-800/50 hover:border-blue-500/50 transition-all duration-300 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] group">
              <div className="flex items-center">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="text-blue-400 mr-2">
                      <FaCheckCircle className="w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-medium text-blue-400">PORTAL MSxCAMP</h3>
                    <span className="ml-2 text-xs text-gray-500">
                      ({portalClaimedData ? Number(portalClaimedData) : 0} claimed)
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm font-mono mt-1 truncate">0x1eD74B27f846C699A90926daD057A7f6FD22C126</p>
                </div>
                <div className="text-gray-500 group-hover:text-blue-400 transition-colors">
                  <FaExternalLinkAlt className="w-3 h-3" />
                </div>
              </div>
            </a>
          </div>
        </section>

                {/* Interactive Network Map - Modern Version */}
        <section className="max-w-7xl mx-auto px-4 mb-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              Network <span className="bg-gradient-to-r from-[#0052FF] to-orange-500 bg-clip-text text-transparent">Activity</span> Map
            </h2>
            <p className="text-gray-300 text-lg max-w-2xl mx-auto">
              Real-time visualization of blockchain activity across Base and Camp Network ecosystems
            </p>
          </div>
          
          <div className="relative h-[350px] md:h-[500px] bg-gradient-to-br from-black/40 via-gray-900/20 to-black/60 backdrop-blur-xl rounded-3xl border border-gray-700/50 overflow-hidden shadow-2xl">
            {/* Animated Background Grid */}
            <div className="absolute inset-0 opacity-10">
              <div className="h-full w-full" style={{
                backgroundImage: `
                  linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
                `,
                backgroundSize: '50px 50px',
                animation: 'grid-move 20s linear infinite'
              }}></div>
            </div>

            {/* Base Network Node */}
            <div className="absolute left-[20%] top-1/2 transform -translate-x-1/2 -translate-y-1/2 group">
              <div className="relative">
                {/* Outer Glow Ring */}
                <div className="absolute -inset-8 rounded-full bg-gradient-to-r from-[#0052FF]/20 to-[#4C8FFF]/20 blur-xl animate-pulse"></div>
                
                {/* Main Node */}
                <div className="relative w-20 h-20 md:w-30 md:h-30 bg-gradient-to-br from-[#0052FF] via-[#1E4DD8] to-[#4C8FFF] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(0,82,255,0.8)] transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_60px_rgba(0,82,255,1)] border-2 border-white/20">
                  <Image
                    src="/brand-kit/base/logo/in-product/Base_Network_Logo.png"
                    alt="Base Network"
                    width={48}
                    height={48}
                    className="object-contain w-8 h-8 md:w-12 md:h-12 filter drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                  />
                </div>

                {/* Network Stats Card */}
                <div className="absolute -bottom-16 md:-bottom-20 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-blue-500/30 to-blue-600/30 backdrop-blur-lg rounded-xl px-2 py-2 md:px-4 md:py-3 border border-blue-400/40 shadow-lg min-w-[100px] md:min-w-[140px]">
                    <p className="text-blue-200 text-xs font-bold uppercase tracking-wider mb-1">Base Network</p>
                    <p className="text-white text-lg md:text-xl font-black">{transactionsCount.toLocaleString()}</p>
                    <p className="text-blue-300 text-xs">Transactions</p>
                  </div>
                </div>
              </div>
            </div>

            {/* MySphere Central Hub */}
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 group">
              <div className="relative">
                {/* Animated Ring */}
                <div className="absolute -inset-6 rounded-full border-2 border-gradient-to-r from-purple-500/50 to-indigo-500/50 animate-spin-slow"></div>
                <div className="absolute -inset-4 rounded-full border border-purple-400/30 animate-ping"></div>
                
                {/* Central Node */}
                <div className="relative w-14 h-14 md:w-20 md:h-20 bg-gradient-to-br from-purple-500/40 via-indigo-500/40 to-purple-600/40 backdrop-blur-lg rounded-full flex items-center justify-center border border-purple-400/50 shadow-[0_0_30px_rgba(139,69,233,0.6)] transition-all duration-500 group-hover:scale-110">
                  <Image
                    src="/elo2.png"
                    alt="MySphere"
                    width={36}
                    height={36}
                    className="object-contain w-6 h-6 md:w-9 md:h-9 filter drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
                  />
                </div>
              </div>
            </div>

            {/* Camp Network Node */}
            <div className="absolute right-[20%] top-1/2 transform translate-x-1/2 -translate-y-1/2 group">
              <div className="relative">
                {/* Outer Glow Ring */}
                <div className="absolute -inset-8 rounded-full bg-gradient-to-r from-orange-500/20 to-orange-600/20 blur-xl animate-pulse"></div>
                
                {/* Main Node */}
                <div className="relative w-20 h-20 md:w-30 md:h-30 bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(249,115,22,0.8)] transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_60px_rgba(249,115,22,1)] border-2 border-white/20">
                  <Image
                    src="/Camp.png"
                    alt="Camp Network"
                    width={48}
                    height={48}
                    className="object-contain w-8 h-8 md:w-12 md:h-12 filter drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                  />
                </div>

                {/* Network Stats Card */}
                <div className="absolute -bottom-16 md:-bottom-20 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-orange-500/30 to-orange-600/30 backdrop-blur-lg rounded-xl px-2 py-2 md:px-4 md:py-3 border border-orange-400/40 shadow-lg min-w-[100px] md:min-w-[140px]">
                    <p className="text-orange-200 text-xs font-bold uppercase tracking-wider mb-1">Camp Network</p>
                    <p className="text-white text-lg md:text-xl font-black">{campTransactionsCount.toLocaleString()}</p>
                    <p className="text-orange-300 text-xs">Transactions</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Lines and Data Flow */}
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
              {/* Left line: Base to MySphere */}
              <div className="absolute w-32 md:w-48 h-0.5 bg-gradient-to-r from-[#0052FF]/60 to-purple-500/40 rounded-full transform -translate-x-full -translate-y-1/2">
                {/* Blue particles flowing from Base to MySphere */}
                {[...Array(2)].map((_, i) => (
                  <div
                    key={`blue-to-sphere-${i}`}
                    className="absolute w-2 h-2 md:w-3 md:h-3 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.9)]"
                    style={{
                      top: '-4px',
                      animation: `flow-right 3s ease-in-out infinite`,
                      animationDelay: `${i * 1.5}s`
                    }}
                  />
                ))}
              </div>
              
              {/* Right line: Camp to MySphere */}
              <div className="absolute w-32 md:w-48 h-0.5 bg-gradient-to-r from-orange-500/60 to-purple-500/40 rounded-full transform translate-y-1/2">
                {/* Orange particles flowing from Camp to MySphere */}
                {[...Array(2)].map((_, i) => (
                  <div
                    key={`orange-to-sphere-${i}`}
                    className="absolute w-2 h-2 md:w-3 md:h-3 bg-orange-400 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.9)]"
                    style={{
                      top: '-4px',
                      animation: `flow-left 3s ease-in-out infinite`,
                      animationDelay: `${i * 1.5}s`
                    }}
                  />
                ))}
              </div>
            </div>

            {/* MySphere Data Processing Animation */}
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
              {/* Processing particles around MySphere */}
              {[...Array(6)].map((_, i) => (
                <div
                  key={`sphere-particle-${i}`}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    background: i % 2 === 0 ? '#3B82F6' : '#F97316',
                    boxShadow: i % 2 === 0 ? '0 0 8px rgba(59,130,246,0.8)' : '0 0 8px rgba(249,115,22,0.8)',
                    animation: `orbit-small 4s linear infinite`,
                    animationDelay: `${i * 0.7}s`,
                    transformOrigin: '50px 50px'
                  }}
                />
              ))}
            </div>

            {/* Coming Soon Networks */}
            {/* Ethereum - Coming Soon */}
            <div className="absolute top-4 left-4 md:top-12 md:left-12">
              <div className="relative w-12 h-12 md:w-20 md:h-20">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-gray-500/20 to-gray-400/20 blur-sm animate-pulse"></div>
                <div className="relative bg-gray-900/60 backdrop-blur-sm rounded-full p-2 md:p-3 border border-gray-600/30 transition-all duration-300 hover:scale-105">
                  <div className="w-8 h-8 md:w-14 md:h-14 bg-gray-500/50 rounded-full flex items-center justify-center blur-[1px]">
                    <span className="text-gray-300 text-xs md:text-lg font-mono font-bold">ETH</span>
                  </div>
                </div>
                <div className="absolute -bottom-6 md:-bottom-8 left-1/2 transform -translate-x-1/2">
                  <span className="text-xs text-gray-500 whitespace-nowrap bg-gray-900/80 px-2 py-1 md:px-3 md:py-1 rounded-full border border-gray-600/30">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Optimism - Coming Soon */}
            <div className="absolute bottom-4 right-4 md:bottom-12 md:right-12">
              <div className="relative w-12 h-12 md:w-20 md:h-20">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-500/20 to-red-400/20 blur-sm animate-pulse"></div>
                <div className="relative bg-gray-900/60 backdrop-blur-sm rounded-full p-2 md:p-3 border border-red-600/30 transition-all duration-300 hover:scale-105">
                  <div className="w-8 h-8 md:w-14 md:h-14 bg-red-500/50 rounded-full flex items-center justify-center blur-[1px]">
                    <span className="text-red-300 text-xs md:text-lg font-mono font-bold">OP</span>
                  </div>
                </div>
                <div className="absolute -bottom-6 md:-bottom-8 left-1/2 transform -translate-x-1/2">
                  <span className="text-xs text-gray-500 whitespace-nowrap bg-gray-900/80 px-2 py-1 md:px-3 md:py-1 rounded-full border border-red-600/30">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Arbitrum - Coming Soon */}
            <div className="absolute top-4 right-4 md:top-12 md:right-12">
              <div className="relative w-12 h-12 md:w-20 md:h-20">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400/20 to-blue-300/20 blur-sm animate-pulse"></div>
                <div className="relative bg-gray-900/60 backdrop-blur-sm rounded-full p-2 md:p-3 border border-blue-600/30 transition-all duration-300 hover:scale-105">
                  <div className="w-8 h-8 md:w-14 md:h-14 bg-blue-500/50 rounded-full flex items-center justify-center blur-[1px]">
                    <span className="text-blue-300 text-xs md:text-lg font-mono font-bold">ARB</span>
                  </div>
                </div>
                <div className="absolute -bottom-6 md:-bottom-8 left-1/2 transform -translate-x-1/2">
                  <span className="text-xs text-gray-500 whitespace-nowrap bg-gray-900/80 px-2 py-1 md:px-3 md:py-1 rounded-full border border-blue-600/30">
                    Coming Soon
                  </span>
                </div>
              </div>
            </div>

            {/* Floating Background Particles */}
            {[...Array(20)].map((_, i) => (
              <div
                key={`floating-${i}`}
                className="absolute w-2 h-2 bg-gradient-to-r from-white/40 to-blue-200/40 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
                  animationDelay: `${Math.random() * 5}s`
                }}
              />
            ))}
          </div>

          {/* Transaction Comparison Visualization */}
          <div className="mt-16 mb-12">
            <h3 className="text-2xl font-bold text-center text-white mb-8">
              Network Transaction <span className="text-purple-400">Comparison</span>
            </h3>
            
            <div className="max-w-4xl mx-auto bg-gradient-to-br from-black/40 via-gray-900/20 to-black/60 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Base Network Bar */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-300 font-semibold">Base Network</span>
                    <span className="text-white font-bold">{transactionsCount.toLocaleString()}</span>
                  </div>
                  <div className="relative h-6 bg-gray-800/50 rounded-full overflow-hidden">
                    <div 
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full shadow-[0_0_15px_rgba(59,130,246,0.6)] animate-[progress-blue_2s_ease-out_forwards]"
                      style={{ 
                        '--target-width': `${Math.min((transactionsCount / (transactionsCount + campTransactionsCount)) * 100, 100)}%`
                      } as React.CSSProperties}
                    ></div>
                  </div>
                  <div className="text-blue-200 text-sm">
                    {((transactionsCount / (transactionsCount + campTransactionsCount)) * 100).toFixed(1)}% of total activity
                  </div>
                </div>

                {/* Camp Network Bar */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-orange-300 font-semibold">Camp Network</span>
                    <span className="text-white font-bold">{campTransactionsCount.toLocaleString()}</span>
                  </div>
                  <div className="relative h-6 bg-gray-800/50 rounded-full overflow-hidden">
                    <div 
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-full shadow-[0_0_15px_rgba(249,115,22,0.6)] animate-[progress-orange_2s_ease-out_0.5s_forwards]"
                      style={{ 
                        '--target-width': `${Math.max((campTransactionsCount / (transactionsCount + campTransactionsCount)) * 100, 5)}%`,
                        '--min-width': '20px'
                      } as React.CSSProperties}
                    ></div>
                  </div>
                  <div className="text-orange-200 text-sm">
                    {((campTransactionsCount / (transactionsCount + campTransactionsCount)) * 100).toFixed(1)}% of total activity
                  </div>
                </div>

              </div>

              {/* Total Summary */}
              <div className="mt-8 pt-6 border-t border-gray-700/50 text-center">
                <div className="inline-flex items-center space-x-4 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 backdrop-blur-md rounded-xl px-6 py-3 border border-purple-400/30">
                  <span className="text-purple-300 font-semibold">Total Cross-Chain Activity:</span>
                  <span className="text-white text-xl font-bold">{(transactionsCount + campTransactionsCount).toLocaleString()}</span>
                  <span className="text-purple-200 text-sm">transactions</span>
                </div>
              </div>
            </div>
          </div>

          {/* Enhanced Legend */}
          <div className="flex flex-wrap justify-center gap-8 mt-12">
            <div className="flex items-center space-x-3 bg-gradient-to-r from-blue-500/10 to-blue-600/10 backdrop-blur-md rounded-xl px-4 py-3 border border-blue-400/20">
              <div className="w-6 h-6 bg-gradient-to-r from-blue-400 to-blue-600 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.6)] animate-pulse"></div>
              <span className="text-blue-300 font-medium">Base Network Activity</span>
            </div>
            <div className="flex items-center space-x-3 bg-gradient-to-r from-orange-500/10 to-orange-600/10 backdrop-blur-md rounded-xl px-4 py-3 border border-orange-400/20">
              <div className="w-6 h-6 bg-gradient-to-r from-orange-400 to-orange-600 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.6)] animate-pulse"></div>
              <span className="text-orange-300 font-medium">Camp Network Activity</span>
            </div>
            <div className="flex items-center space-x-3 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 backdrop-blur-md rounded-xl px-4 py-3 border border-purple-400/20">
              <div className="w-6 h-6 bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full shadow-[0_0_10px_rgba(139,69,233,0.6)] animate-pulse"></div>
              <span className="text-purple-300 font-medium">MySphere Integration</span>
            </div>
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
    </>
  );
}
