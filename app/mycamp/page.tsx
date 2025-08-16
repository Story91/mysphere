'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  CampModal, 
  useAuth, 
  useAuthState, 
  useSocials,
  useLinkSocials,
  useModal
} from '@campnetwork/origin/react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import Script from 'next/script';
import SpotifyDashboard from './components/SpotifyDashboard'; // 🎵 Import needed even when hidden
import MyIpSection from './components/MyIpSection';
import NftCreator from './components/NftCreator';
import { ToastProvider } from './components/Toast';
// Removed API imports - these should only be used in backend

const CAMP_NFT_CONTRACT = '0x1eD74B27f846C699A90926daD057A7f6FD22C126';

// Static MySphere data
const STATIC_MYSPHERE_DATA = {
  totalUsers: 144087,
  socialMediaConnections: {
    twitter: 54814,
    spotify: 2602,
    tiktok: 3576
  },
  fullyConnectedUsers: 13,
  averageConnectionsPerUser: 0.6,
  lastUpdated: "2025-07-05T01:30:43.937Z",
  growthTrendData: [
    {
      date: "2025-06-29",
      users: 9,
      twitter: 3,
      spotify: 1,
      tiktok: 3
    },
    {
      date: "2025-06-30",
      users: 9,
      twitter: 3,
      spotify: 1,
      tiktok: 3
    },
    {
      date: "2025-07-01",
      users: 1338,
      twitter: 861,
      spotify: 88,
      tiktok: 131
    },
    {
      date: "2025-07-02",
      users: 8010,
      twitter: 4102,
      spotify: 432,
      tiktok: 615
    },
    {
      date: "2025-07-03",
      users: 12623,
      twitter: 6788,
      spotify: 672,
      tiktok: 926
    },
    {
      date: "2025-07-04",
      users: 18689,
      twitter: 9317,
      spotify: 833,
      tiktok: 1137
    },
    {
      date: "2025-07-05",
      users: 144087,
      twitter: 54814,
      spotify: 2602,
      tiktok: 3576
    }
  ]
};

export default function MyCampPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [walletStats, setWalletStats] = useState<any>(null);
  
  // 🎵 Spotify Features Configuration
  // Set to true to enable Spotify functionality in MyCamp
  // When enabled: Shows Spotify tab, allows music analytics, social features
  const SPOTIFY_FEATURES_ENABLED = false;
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [socialDropdownOpen, setSocialDropdownOpen] = useState(false);
  const [selectedSocial, setSelectedSocial] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [buttonRef, setButtonRef] = useState<HTMLButtonElement | null>(null);
  const [connectedSocialsCount, setConnectedSocialsCount] = useState(0);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [globalStatsLoading, setGlobalStatsLoading] = useState(false);
  const [showStats, setShowStats] = useState(false); // ⚠️ Stats only on user request
  const [isMobile, setIsMobile] = useState(false);
  
  // Camp SDK hooks
  const auth = useAuth();
  const { authenticated, loading } = useAuthState();
  const { data: socialsData, error: socialsError, isLoading: socialsLoading, refetch: refetchSocials } = useSocials();
  const modal = useModal();
  const {
    linkTwitter,
    linkSpotify,
    linkTiktok,
    unlinkTwitter,
    unlinkSpotify,
    unlinkTiktok
  } = useLinkSocials();

  // Environment variables
  const CLIENT_ID = process.env.NEXT_PUBLIC_CAMP_CLIENT_ID!;
  const API_KEY = process.env.NEXT_PUBLIC_CAMP_API_KEY!;
  const FAUCET_URL = process.env.NEXT_PUBLIC_CAMP_FAUCET_URL!;
  const EXPLORER_URL = process.env.NEXT_PUBLIC_CAMP_EXPLORER_URL!

  // Handle return from social auth
  useEffect(() => {
    const authSuccess = searchParams.get('auth_success');
    const socialPlatform = searchParams.get('platform');
    
    if (authSuccess === 'true' && socialPlatform) {
      setShowSuccessMessage(true);
      console.log(`🎉 Successfully connected ${socialPlatform}!`);
      
      // Refresh social data
      if (refetchSocials) {
        refetchSocials();
      }
      
      // Clear URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('auth_success');
      url.searchParams.delete('platform');
      router.replace(url.pathname, { scroll: false });
      
      // Hide success message after 5 seconds
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 5000);
    }
  }, [searchParams, router, refetchSocials]);

  // Debug environment variables
  useEffect(() => {
    console.log('🌍 Environment Variables Check:', {
      CLIENT_ID: CLIENT_ID ? '✅ Loaded' : '❌ Missing',
      API_KEY: API_KEY ? '✅ Loaded' : '❌ Missing',
      FAUCET_URL: FAUCET_URL ? '✅ Loaded' : '❌ Missing',
      EXPLORER_URL: EXPLORER_URL ? '✅ Loaded' : '❌ Missing',
      actualValues: {
        CLIENT_ID: CLIENT_ID?.substring(0, 8) + '...',
        API_KEY: API_KEY?.substring(0, 8) + '...',
        FAUCET_URL,
        EXPLORER_URL
      }
    });
  }, []);

  // Detect mobile device
  useEffect(() => {
    const checkIsMobile = () => {
      const isMobileDevice = window.innerWidth <= 768;
      setIsMobile(isMobileDevice);
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Note: API data fetching moved to backend routes
  // /api/camp/twitter and /api/camp/spotify are available for future use

  // Count connected social media platforms and update stats
  useEffect(() => {
    if (socialsData && address) {
      const platforms = ['twitter', 'spotify', 'tiktok'];
      const connectedPlatforms = platforms.filter(platform => 
        (socialsData as any)?.[platform]
      );
      const connectedCount = connectedPlatforms.length;
      
      setConnectedSocialsCount(connectedCount);
      
      // Send stats to API for tracking
      updateUserStats(address, connectedPlatforms);
      
      console.log('📊 Connected Social Media Count:', {
        total: connectedCount,
        platforms: platforms.map(platform => ({
          platform,
          connected: !!(socialsData as any)?.[platform]
        }))
      });
    }
  }, [socialsData, address]);

  // Update user social media statistics in Firebase
  const updateUserStats = async (userAddress: string, connectedPlatforms: string[]) => {
    try {
      const response = await fetch('/api/camp-stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: userAddress,
          connectedPlatforms
        })
      });
      
      const data = await response.json();
      if (data.success) {
        console.log('✅ User stats updated in Firebase:', data.data);
      }
    } catch (error) {
      console.error('❌ Failed to update user stats in Firebase:', error);
    }
  };

  // Cache key for global statistics
  const CACHE_KEY = 'mysphere_global_stats';
  const REFRESH_TRACKING_KEY = 'mysphere_last_refresh';
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Check if cached data is still valid
  const isCacheValid = (timestamp: number) => {
    return Date.now() - timestamp < CACHE_DURATION;
  };

  // Check if user can refresh today (only once per day)
  const canRefreshToday = () => {
    if (typeof window !== 'undefined') {
      const lastRefresh = localStorage.getItem(REFRESH_TRACKING_KEY);
      if (lastRefresh) {
        const lastRefreshDate = new Date(parseInt(lastRefresh));
        const today = new Date();
        // Check if last refresh was today
        return lastRefreshDate.toDateString() !== today.toDateString();
      }
    }
    return true; // Can refresh if no record exists
  };

  // Record that user refreshed today
  const recordRefreshToday = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(REFRESH_TRACKING_KEY, Date.now().toString());
    }
  };

  // Load stats from cache if valid, otherwise fetch from API
  const fetchGlobalStats = async (userRequested = false) => {
    setGlobalStatsLoading(true);
    setShowStats(true); // Show stats section when user requests
    
    try {
      // Check cache first
      if (typeof window !== 'undefined') {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (parsed.timestamp && isCacheValid(parsed.timestamp)) {
            setGlobalStats(parsed.data);
            console.log('📊 MySphere stats loaded from cache:', parsed.data);
            console.log('🗂️ Cache expires:', new Date(parsed.timestamp + CACHE_DURATION).toLocaleString());
            setGlobalStatsLoading(false);
            return;
          } else if (userRequested) {
            // User manually requested, but check if they can refresh today
            if (!canRefreshToday()) {
              console.log('⚠️ User already refreshed today, using cache');
              setGlobalStats(parsed.data);
              setGlobalStatsLoading(false);
              return;
            }
            console.log('🗂️ Cache expired, user can refresh today');
          } else {
            console.log('🗂️ Cache expired, auto-fetching fresh data...');
          }
        }
      }

      // Fetch from API (only if cache is invalid or user can refresh)
      console.log('🌐 Fetching fresh MySphere stats from API...');
      const response = await fetch('/api/camp-stats');
      const data = await response.json();
      
      if (data.success) {
        setGlobalStats(data.data);
        
        // Save to cache
        if (typeof window !== 'undefined') {
          const cacheData = {
            data: data.data,
            timestamp: Date.now()
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
          console.log('💾 MySphere stats saved to cache');
          
          // Record refresh if user requested it
          if (userRequested) {
            recordRefreshToday();
            console.log('✅ Daily refresh recorded');
          }
        }
        
        console.log('📊 Fresh MySphere stats loaded from API:', data.data);
      }
    } catch (error) {
      console.error('❌ Failed to fetch MySphere stats:', error);
      
      // Try to use expired cache as fallback
      if (typeof window !== 'undefined') {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          if (parsed.data) {
            setGlobalStats(parsed.data);
            console.log('⚠️ Using expired cache as fallback');
          }
        }
      }
    } finally {
      setGlobalStatsLoading(false);
    }
  };
  
  // Hide stats and clear data to save memory
  const hideGlobalStats = () => {
    setShowStats(false);
    setGlobalStats(null);
    console.log('📊 MySphere stats hidden');
  };

  // Single function to handle stats loading with daily limit
  const handleLoadStats = () => {
    const cacheInfo = getCacheInfo();
    
    if (cacheInfo.exists && cacheInfo.isValid) {
      // Valid cache exists, load from cache
      fetchGlobalStats(false);
    } else if (cacheInfo.exists && !canRefreshToday()) {
      // Cache expired but user already refreshed today
      fetchGlobalStats(false); // Will use expired cache
    } else {
      // Can refresh (either no cache or user hasn't refreshed today)
      fetchGlobalStats(true);
    }
  };

  // Get cache info
  const getCacheInfo = () => {
    if (typeof window !== 'undefined') {
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        return {
          exists: true,
          timestamp: parsed.timestamp,
          isValid: isCacheValid(parsed.timestamp),
          expiresAt: new Date(parsed.timestamp + CACHE_DURATION),
          age: Math.round((Date.now() - parsed.timestamp) / (1000 * 60 * 60)) // hours
        };
      }
    }
    return { exists: false };
  };

  // Get refresh status for UI
  const getRefreshStatus = () => {
    const canRefresh = canRefreshToday();
    const cacheInfo = getCacheInfo();
    
    if (cacheInfo.exists && cacheInfo.isValid) {
      return {
        canLoad: true,
        buttonText: 'Load Statistics',
        buttonIcon: '📊',
        message: 'Fresh data available from cache'
      };
    } else if (cacheInfo.exists && !canRefresh) {
      const lastRefresh = localStorage.getItem(REFRESH_TRACKING_KEY);
      const nextRefreshTime = lastRefresh ? 
        new Date(parseInt(lastRefresh) + 24 * 60 * 60 * 1000) : 
        new Date();
      
      return {
        canLoad: true,
        buttonText: 'Load Statistics',
        buttonIcon: '⏰',
        message: `Using cached data (next refresh: ${nextRefreshTime.toLocaleTimeString()})`
      };
    } else {
      return {
        canLoad: true,
        buttonText: canRefresh ? 'Load Statistics' : 'Load Statistics',
        buttonIcon: canRefresh ? '🔄' : '📊',
        message: canRefresh ? 'Will refresh from server' : 'Loading from cache'
      };
    }
  };

  // Ensure activeTab is not 'spotify' when Spotify features are disabled
  useEffect(() => {
    if (!SPOTIFY_FEATURES_ENABLED && activeTab === 'spotify') {
      setActiveTab('home');
    }
  }, [activeTab]);

  // Debug social data
  useEffect(() => {
    console.log('🔍 Camp Network Status:', {
      authenticated,
      loading,
      address,
      clientId: CLIENT_ID,
      hasApiKey: !!API_KEY,
      socialsData,
      socialsError,
      socialsLoading,
      hasTwitter: (socialsData as any)?.twitter,
      hasSpotify: (socialsData as any)?.spotify,
      hasTiktok: (socialsData as any)?.tiktok,
      connectedSocialsCount,
      spotifyFeaturesEnabled: SPOTIFY_FEATURES_ENABLED
    });
  }, [authenticated, loading, address, socialsData, socialsError, socialsLoading, CLIENT_ID, API_KEY, connectedSocialsCount]);

  // Auto-load stats from cache on component mount (only if valid)
  useEffect(() => {
    const cacheInfo = getCacheInfo();
    if (cacheInfo.exists && cacheInfo.isValid) {
      console.log('🗂️ Auto-loading fresh stats from cache');
      fetchGlobalStats(false); // This will use cache instantly
    }
  }, []);



  // Fetch wallet statistics
  const fetchWalletStats = async () => {
    if (!address) return;
    
    setStatsLoading(true);
    setStatsError(null);
    
    try {
      console.log('📊 Fetching wallet statistics for:', address);
      
      const response = await fetch(`/api/wallet-stats?address=${address}`);
      const data = await response.json();
      
      if (data.success) {
        setWalletStats(data.data);
        console.log('✅ Wallet stats loaded:', data.data);
      } else {
        setStatsError(data.error || 'Failed to load wallet statistics');
        console.error('❌ Wallet stats error:', data.error);
      }
      
    } catch (error) {
      console.error('❌ Failed to fetch wallet stats:', error);
      setStatsError('Failed to connect to BaseCamp Explorer');
    } finally {
      setStatsLoading(false);
    }
  };

  // Test API connection
  const testApiConnection = async () => {
    if (!address) return;
    
    try {
      console.log('🧪 Testing API connections...');
      
      // Test Twitter API
      const twitterResponse = await fetch(`/api/camp/twitter?address=${address}`);
      const twitterData = await twitterResponse.json();
      console.log('🐦 Twitter API Response:', twitterData);
      
      // Test Spotify API
      const spotifyResponse = await fetch(`/api/camp/spotify?address=${address}`);
      const spotifyData = await spotifyResponse.json();
      console.log('🎵 Spotify API Response:', spotifyData);
      
    } catch (error) {
      console.error('❌ API Test failed:', error);
    }
  };



  useEffect(() => {
    if (authenticated && address) {
      testApiConnection();
    }
  }, [authenticated, address]);

  // Stats are loaded only on user request to improve performance
  // useEffect(() => {
  //   fetchGlobalStats();
  // }, []);

  // Fetch wallet stats when Stats or NFTs tab is active and wallet is connected
  useEffect(() => {
    if ((activeTab === 'stats' || activeTab === 'nfts') && address && !walletStats && !statsLoading) {
      fetchWalletStats();
    }
    
    // Stats are loaded only on user request to improve performance
    // if (activeTab === 'home' && !globalStats && !globalStatsLoading) {
    //   fetchGlobalStats();
    // }
  }, [activeTab, address, walletStats, statsLoading]);

  // Update dropdown position when button ref changes
  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef && socialDropdownOpen && !isMobile) {
        const rect = buttonRef.getBoundingClientRect();
        const scrollY = window.scrollY;
        setDropdownPosition({
          top: rect.bottom + scrollY + 4,
          left: rect.left,
          width: rect.width
        });
      }
    };

    updatePosition();

    if (socialDropdownOpen && !isMobile) {
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [buttonRef, socialDropdownOpen, isMobile]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (socialDropdownOpen && buttonRef && !buttonRef.contains(event.target as Node)) {
        setSocialDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [socialDropdownOpen, buttonRef]);

  return (
    <ToastProvider>
      <div className="min-h-screen overflow-x-hidden relative">
      {/* Camp Mainnet banner removed on request */}
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3796065666088205"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      {/* Background Image */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat" 
        style={{ backgroundImage: 'url(/CampBack.jpg)' }}
      ></div>
      
      {/* Background Overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-black/70 via-orange-800/60 to-orange-600/70"></div>
      
      {/* Background Effects */}
      <div className="fixed inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(249,115,22,0.08)_25%,rgba(249,115,22,0.08)_26%,transparent_27%,transparent_74%,rgba(249,115,22,0.08)_75%,rgba(249,115,22,0.08)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(249,115,22,0.08)_25%,rgba(249,115,22,0.08)_26%,transparent_27%,transparent_74%,rgba(249,115,22,0.08)_75%,rgba(249,115,22,0.08)_76%,transparent_77%,transparent)] bg-[length:30px_30px] opacity-40"></div>
      
             {/* Success Message */}
      {showSuccessMessage && (
        <motion.div
          initial={{ opacity: 0, y: isMobile ? 50 : -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: isMobile ? 50 : -50, scale: 0.9 }}
          className={`fixed z-50 bg-green-500/90 backdrop-blur-sm text-white px-4 sm:px-6 py-3 rounded-xl shadow-2xl border border-green-400/50 max-w-[90vw] ${
            isMobile 
              ? 'bottom-4 left-1/2 -translate-x-1/2' 
              : 'top-4 left-1/2 -translate-x-1/2'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="text-xl">🎉</div>
            <span className="font-medium text-sm sm:text-base">Social account connected successfully!</span>
          </div>
        </motion.div>
      )}
      
      <div className="relative z-10 max-w-6xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {/* MyOrigin button moved under camp icon */}
        {/* Enhanced Beautiful Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`text-center ${isMobile ? 'mb-8' : 'mb-16'} relative`}
        >
          {/* Simple connect panel header */}
          <div className="bg-black/40 border border-white/10 rounded-2xl mx-auto max-w-xl p-4">
            <div className="text-orange-200 text-sm mb-2">Connect to Camp Network</div>
            <div className="flex justify-center">
              <CampModal />
            </div>
          </div>
          
          {/* MyOrigin dedicated row below (kept for spacing consistency) */}

          {/* Enhanced Particles Effect */}
          <div className="absolute inset-0 -z-20">
            {[...Array(isMobile ? 4 : 8)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: [0, 1, 0.5, 0],
                  scale: [0, 1.5, 1, 0],
                  x: [0, Math.random() * (isMobile ? 300 : 600) - (isMobile ? 150 : 300)],
                  y: [0, Math.random() * (isMobile ? 150 : 300) - (isMobile ? 75 : 150)],
                  rotate: [0, Math.random() * 360]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  delay: i * 0.6,
                  ease: "easeOut"
                }}
                className={`absolute top-1/2 left-1/2 ${
                  isMobile ? 'w-2 h-2' : 'w-3 h-3'
                } bg-gradient-to-r from-orange-400 to-yellow-400 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)]`}
              />
            ))}
          </div>
        </motion.div>

        {/* Control Panel - Navigation Tabs */}
        {/* Enhanced Control Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-4 sm:p-6 md:p-8 mb-8"
        >

          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
            {/* Home Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3, duration: 0.5 }}
              whileHover={{ 
                scale: 1.05, 
                y: -5,
                boxShadow: "0 20px 40px rgba(249, 115, 22, 0.4)"
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('home')}
              className={`group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-all duration-500 ${
                activeTab === 'home'
                  ? 'bg-gradient-to-br from-orange-500/80 to-red-500/80 text-white shadow-2xl shadow-orange-500/25 border border-orange-400/50'
                  : 'bg-black/40 hover:bg-black/60 text-orange-200 hover:text-orange-100 border border-orange-500/20 hover:border-orange-400/40'
              }`}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-orange-400/20 to-red-400/20"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <div className="relative z-10">
                <motion.div 
                  className="text-center"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-xl sm:text-2xl md:text-3xl mb-2 sm:mb-3 font-black tracking-wider">HOME</div>
                  <div className="text-xs opacity-80 uppercase tracking-widest">Dashboard</div>
                </motion.div>
              </div>
              {activeTab === 'home' && (
                <motion.div
                  layoutId="activeGlow"
                  className="absolute inset-0 bg-gradient-to-br from-orange-500/30 to-red-500/30 rounded-2xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            {/* My IP Button (replaces Quests) */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.35, duration: 0.5 }}
              whileHover={{ 
                scale: 1.05, 
                y: -5,
                boxShadow: "0 20px 40px rgba(168, 85, 247, 0.35)"
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('nfts')}
              className={`group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-all duration-500 ${
                activeTab === 'nfts'
                  ? 'bg-gradient-to-br from-purple-500/80 to-fuchsia-500/80 text-white shadow-2xl shadow-purple-500/25 border border-purple-400/50'
                  : 'bg-black/40 hover:bg-black/60 text-orange-200 hover:text-orange-100 border border-orange-500/20 hover:border-purple-400/40'
              }`}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-purple-400/20 to-fuchsia-400/20"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <div className="relative z-10">
                <motion.div 
                  className="text-center"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-xl sm:text-2xl md:text-3xl mb-2 sm:mb-3 font-black tracking-wider">MY IP</div>
                  <div className="text-xs opacity-80 uppercase tracking-widest">IpNFTs</div>
                </motion.div>
              </div>
              {activeTab === 'nfts' && (
                <motion.div
                  layoutId="activeGlow"
                  className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-fuchsia-500/30 rounded-2xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            {/* IP Creator Button (subpage within MyCamp) */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.5 }}
              whileHover={{ 
                scale: 1.05, 
                y: -5,
                boxShadow: "0 20px 40px rgba(236, 72, 153, 0.35)"
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('creator')}
              className={`group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-all duration-500 ${
                activeTab === 'creator'
                  ? 'bg-gradient-to-br from-pink-500/80 to-fuchsia-500/80 text-white shadow-2xl shadow-pink-500/25 border border-pink-400/50'
                  : 'bg-black/40 hover:bg-black/60 text-orange-200 hover:text-orange-100 border border-orange-500/20 hover:border-pink-400/40'
              }`}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-pink-400/20 to-fuchsia-400/20"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <div className="relative z-10">
                <motion.div 
                  className="text-center"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-xl sm:text-2xl md:text-3xl mb-2 sm:mb-3 font-black tracking-wider">IP CREATOR</div>
                  <div className="text-xs opacity-80 uppercase tracking-widest">Create</div>
                </motion.div>
              </div>
              {activeTab === 'creator' && (
                <motion.div
                  layoutId="activeGlow"
                  className="absolute inset-0 bg-gradient-to-br from-pink-500/30 to-fuchsia-500/30 rounded-2xl"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            {/* Stats Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.5 }}
              whileHover={{ 
                scale: 1.05, 
                y: -5,
                boxShadow: "0 20px 40px rgba(59, 130, 246, 0.4)"
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('stats')}
              className={`group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-all duration-500 ${
                activeTab === 'stats'
                  ? 'bg-gradient-to-br from-blue-500/80 to-cyan-500/80 text-white shadow-2xl shadow-blue-500/25 border border-blue-400/50'
                  : 'bg-black/40 hover:bg-black/60 text-orange-200 hover:text-orange-100 border border-orange-500/20 hover:border-blue-400/40'
              }`}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-cyan-400/20"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <div className="relative z-10">
                <motion.div 
                  className="text-center"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-xl sm:text-2xl md:text-3xl mb-2 sm:mb-3 font-black tracking-wider">STATS</div>
                  <div className="text-xs opacity-80 uppercase tracking-widest">Analytics</div>
                </motion.div>
              </div>
              {activeTab === 'stats' && (
                <motion.div
                  layoutId="activeGlow"
                  className="absolute inset-0 bg-gradient-to-br from-blue-500/30 to-cyan-500/30 rounded-2xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            {/* NFTs Button - REMOVED */}

            {/* Spotify Button - Hidden if SPOTIFY_FEATURES_ENABLED is false */}
            {SPOTIFY_FEATURES_ENABLED && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.55, duration: 0.5 }}
                whileHover={{ 
                  scale: 1.05, 
                  y: -5,
                  boxShadow: "0 20px 40px rgba(34, 197, 94, 0.4)"
                }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveTab('spotify')}
                className={`group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-all duration-500 ${
                  activeTab === 'spotify'
                    ? 'bg-gradient-to-br from-green-500/80 to-emerald-500/80 text-white shadow-2xl shadow-green-500/25 border border-green-400/50'
                    : 'bg-black/40 hover:bg-black/60 text-orange-200 hover:text-orange-100 border border-orange-500/20 hover:border-green-400/40'
                }`}
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-br from-green-400/20 to-emerald-400/20"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />
                <div className="relative z-10">
                  <motion.div 
                    className="text-center"
                    whileHover={{ scale: 1.1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="text-xl sm:text-2xl md:text-3xl mb-2 sm:mb-3 font-black tracking-wider">MUSIC</div>
                    <div className="text-xs opacity-80 uppercase tracking-widest">Spotify</div>
                  </motion.div>
                </div>
                {activeTab === 'spotify' && (
                  <motion.div
                    layoutId="activeGlow"
                    className="absolute inset-0 bg-gradient-to-br from-green-500/30 to-emerald-500/30 rounded-2xl"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </motion.button>
            )}

            {/* Portal/NFTs Button - for Camp Network NFTs */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6, duration: 0.5 }}
              whileHover={{ 
                scale: 1.05, 
                y: -5,
                boxShadow: "0 20px 40px rgba(255, 165, 0, 0.4)"
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('portal')}
              className={`group relative overflow-hidden rounded-2xl p-4 sm:p-6 transition-all duration-500 ${
                activeTab === 'portal'
                  ? 'bg-gradient-to-br from-orange-500/80 to-amber-500/80 text-white shadow-2xl shadow-orange-500/25 border border-orange-400/50'
                  : 'bg-black/40 hover:bg-black/60 text-orange-200 hover:text-orange-100 border border-orange-500/20 hover:border-orange-400/40'
              }`}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-orange-400/20 to-amber-400/20"
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <div className="relative z-10">
                <motion.div 
                  className="text-center"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="text-xl sm:text-2xl md:text-3xl mb-2 sm:mb-3 font-black tracking-wider">PORTAL</div>
                  <div className="text-xs opacity-80 uppercase tracking-widest">Camp NFTs</div>
                </motion.div>
              </div>
              {activeTab === 'portal' && (
                <motion.div
                  layoutId="activeGlow"
                  className="absolute inset-0 bg-gradient-to-br from-orange-500/30 to-amber-500/30 rounded-2xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            {/* Social Media Dropdown Button - REMOVED */}
          </div>
        </motion.div>

        {/* Content based on active tab */}
        {activeTab === 'home' && (
          <>
            {/* Social Accounts Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-4 sm:p-6 mb-8"
        >
                     <div className="mb-4 sm:mb-6">
             <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-200 flex items-center gap-2">
               🔗 Social Media Management
             </h3>
           </div>
          
          {/* Ultra Modern Social Links */}
          {!authenticated ? (
            <div className="text-center py-12">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500/20 via-red-500/20 to-orange-500/20 blur-xl rounded-full"></div>
                <p className="relative text-orange-200 text-lg">🔐 Connect to Camp Network first</p>
              </div>
            </div>
          ) : socialsLoading ? (
            <div className="text-center py-12">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 blur-xl rounded-full animate-pulse"></div>
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-gradient-to-r from-blue-400 via-purple-400 to-pink-400 border-t-transparent mx-auto mb-4"></div>
                  <p className="text-orange-200 text-lg">⚡ Loading social accounts...</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
              {/* Twitter - Compact Glass Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
                className="group relative"
              >
                <div className="relative bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-2xl rounded-2xl border border-white/30 p-4 hover:border-white/50 transition-all duration-500 overflow-hidden shadow-xl hover:shadow-blue-500/20">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-cyan-500/10 to-blue-800/20 rounded-2xl"></div>
                  
                  {/* Compact Image Area */}
                  <div className="relative z-10 mb-3">
                    <div className="w-full h-24 bg-gradient-to-br from-blue-500/30 to-cyan-600/30 rounded-xl flex items-center justify-center border border-white/20 backdrop-blur-sm">
                      <svg className="w-8 h-8 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                      </svg>
                    </div>
                  </div>
                  
                  {/* Status Light */}
                  <div className="absolute top-3 right-3">
                    <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.twitter) ? 'bg-green-400' : 'bg-red-400'} relative shadow-lg`}>
                      <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.twitter) ? 'bg-green-400' : 'bg-red-400'} absolute animate-ping`}></div>
                    </div>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-lg font-bold text-white mb-1">Twitter</h3>
                    <p className="text-white/70 text-xs mb-3">Connect Twitter to MySphere</p>
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => modal.openModal()}
                      className={`w-full py-2 px-3 rounded-lg font-bold text-xs transition-all duration-300 ${
                        ((socialsData as any)?.twitter)
                          ? 'bg-red-500/80 hover:bg-red-500/90 text-white backdrop-blur-sm'
                          : 'bg-blue-500/80 hover:bg-blue-500/90 text-white backdrop-blur-sm'
                      }`}
                    >
                      {((socialsData as any)?.twitter) ? '🔗 Unlink Account' : '🔗 Connect Twitter'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>

              {/* Discord card removed */}

              {/* Spotify - Compact Glass Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
                className="group relative"
              >
                <div className="relative bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-2xl rounded-2xl border border-white/30 p-4 hover:border-white/50 transition-all duration-500 overflow-hidden shadow-xl hover:shadow-green-500/20">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-600/20 via-emerald-500/10 to-green-800/20 rounded-2xl"></div>
                  
                  <div className="relative z-10 mb-3">
                    <div className="w-full h-24 bg-gradient-to-br from-green-500/30 to-emerald-600/30 rounded-xl flex items-center justify-center border border-white/20 backdrop-blur-sm">
                      <svg className="w-8 h-8 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </div>
                  </div>
                  
                  <div className="absolute top-3 right-3">
                    <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.spotify) ? 'bg-green-400' : 'bg-red-400'} relative shadow-lg`}>
                      <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.spotify) ? 'bg-green-400' : 'bg-red-400'} absolute animate-ping`}></div>
                    </div>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-lg font-bold text-white mb-1">Spotify</h3>
                    <p className="text-white/70 text-xs mb-3">Share music taste</p>
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => modal.openModal()}
                      className={`w-full py-2 px-3 rounded-lg font-bold text-xs transition-all duration-300 ${
                        ((socialsData as any)?.spotify)
                          ? 'bg-red-500/80 hover:bg-red-500/90 text-white backdrop-blur-sm'
                          : 'bg-green-500/80 hover:bg-green-500/90 text-white backdrop-blur-sm'
                      }`}
                    >
                      {((socialsData as any)?.spotify) ? '🔗 Unlink Account' : '🔗 Connect Spotify'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>

              {/* TikTok - Compact Glass Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4, ease: "easeOut" }}
                className="group relative"
              >
                <div className="relative bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-2xl rounded-2xl border border-white/30 p-4 hover:border-white/50 transition-all duration-500 overflow-hidden shadow-xl hover:shadow-pink-500/20">
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-600/20 via-purple-500/10 to-pink-800/20 rounded-2xl"></div>
                  
                  <div className="relative z-10 mb-3">
                    <div className="w-full h-24 bg-gradient-to-br from-pink-500/30 to-purple-600/30 rounded-xl flex items-center justify-center border border-white/20 backdrop-blur-sm">
                      <svg className="w-8 h-8 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19.589 6.686a4.793 4.793 0 01-3.77-4.245V2h-3.445v13.672a2.896 2.896 0 01-5.201 1.743l-.002-.001.002.001a2.895 2.895 0 113.183-4.51v-3.5a6.329 6.329 0 00-5.394 6.257 6.332 6.332 0 0011.008 4.287A6.334 6.334 0 0016.97 15.66V9.991a8.235 8.235 0 004.619 1.414V7.972a4.795 4.795 0 01-2-.695v-.591z"/>
                      </svg>
                    </div>
                  </div>
                  
                  <div className="absolute top-3 right-3">
                    <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.tiktok) ? 'bg-green-400' : 'bg-red-400'} relative shadow-lg`}>
                      <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.tiktok) ? 'bg-green-400' : 'bg-red-400'} absolute animate-ping`}></div>
                    </div>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-lg font-bold text-white mb-1">TikTok</h3>
                    <p className="text-white/70 text-xs mb-3">Share creative videos</p>
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => modal.openModal()}
                      className={`w-full py-2 px-3 rounded-lg font-bold text-xs transition-all duration-300 ${
                        ((socialsData as any)?.tiktok)
                          ? 'bg-red-500/80 hover:bg-red-500/90 text-white backdrop-blur-sm'
                          : 'bg-pink-500/80 hover:bg-pink-500/90 text-white backdrop-blur-sm'
                      }`}
                    >
                      {((socialsData as any)?.tiktok) ? '🔗 Unlink Account' : '🔗 Connect TikTok'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>

              {/* Telegram card removed */}
            </div>
          )}
        </motion.div>

            {/* Tip Section - Now as regular text below cards */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="text-center mb-6 sm:mb-8 px-2"
            >
              <p className="text-orange-200/80 text-xs sm:text-sm max-w-2xl mx-auto leading-relaxed">
                💡 <strong className="text-orange-300">Tip:</strong> Connecting your social accounts allows Camp Network to verify your 
                social presence and enables advanced features like social-based reputation scoring.
              </p>
            </motion.div>

            {/* MySphere IP Connect Statistics - SIMPLIFIED */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.9 }}
              className="bg-gradient-to-r from-blue-600/20 via-cyan-500/20 to-blue-600/20 backdrop-blur-sm border border-blue-500/30 rounded-xl p-4 sm:p-6 mb-8"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-3">
                <div>
                  <h4 className="text-lg sm:text-xl font-bold text-blue-200 flex items-center gap-2">
                    ⚡ Camp Network IP Statistics
                  </h4>
                  {showStats && (
                    <div className="text-xs text-blue-200/60 mt-1">
                      Last updated: {new Date(STATIC_MYSPHERE_DATA.lastUpdated).toLocaleString()} • 
                      Real-time Database
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ 
                      scale: 1.05,
                      boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)"
                    }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowStats(!showStats)}
                    className="group relative bg-black/80 hover:bg-black/90 border border-white/30 hover:border-blue-400/60 text-white px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 text-sm backdrop-blur-sm"
                  >
                    <motion.div
                      animate={showStats ? { scale: [1, 1.2, 1] } : {}}
                      transition={{ duration: 0.3 }}
                      className="relative"
                    >
                      <svg 
                        className="w-4 h-4 text-white group-hover:text-orange-300 transition-colors" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
                        />
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" 
                        />
                      </svg>
                      <div className="absolute inset-0 bg-orange-400/20 rounded-full blur-md group-hover:bg-orange-400/40 transition-all"></div>
                    </motion.div>
                    {showStats ? 'Hide Preview' : 'Preview Data'}
                  </motion.button>
                </div>
              </div>
              
              {!showStats ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-4">🔥</div>
                  <p className="text-blue-200 text-lg font-semibold mb-3">
                    Camp Network IP Analytics Ready
                  </p>
                  <div className="max-w-md mx-auto space-y-2">
                    <div className="bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-400/30 rounded-lg p-3">
                      <p className="text-orange-300 text-sm font-medium">
                        🏕️ <strong>Live Camp Network</strong> user connections
                      </p>
                    </div>
                    <div className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-400/30 rounded-lg p-3">
                      <p className="text-blue-300 text-sm font-medium">
                        📡 <strong>{STATIC_MYSPHERE_DATA.totalUsers.toLocaleString()}+</strong> IP addresses tracked
                      </p>
                    </div>
                    <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30 rounded-lg p-3">
                      <p className="text-green-300 text-sm font-medium">
                        🔗 <strong>Real-time</strong> social media linking
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6">
                    {/* Total Users */}
                    <div className="text-center bg-blue-500/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-300">{STATIC_MYSPHERE_DATA.totalUsers.toLocaleString()}</div>
                      <div className="text-sm text-blue-200/70">MySphere Users</div>
                    </div>
                    
                    {/* Fully Connected Users */}
                    <div className="text-center bg-green-500/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-300">{STATIC_MYSPHERE_DATA.fullyConnectedUsers.toLocaleString()}</div>
                      <div className="text-sm text-green-200/70">All 3 Platforms Connected</div>
                    </div>
                    
                    {/* Average Connections */}
                    <div className="text-center bg-purple-500/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-purple-300">{STATIC_MYSPHERE_DATA.averageConnectionsPerUser}</div>
                      <div className="text-sm text-purple-200/70">Avg Connections/User</div>
                    </div>
                  </div>
                  
                  {/* Social Media Breakdown */}
                  <div className="mb-6">
                    <h5 className="text-lg font-bold text-blue-200 mb-4 text-center">Social Media Connections</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 sm:gap-4">
                      {[
                        { key: 'twitter', name: 'Twitter', icon: '🐦', color: 'text-blue-400' },
                        { key: 'spotify', name: 'Spotify', icon: '🎵', color: 'text-green-400' },
                        { key: 'tiktok', name: 'TikTok', icon: '🎬', color: 'text-pink-400' }
                      ].map((platform) => (
                        <div key={platform.key} className="text-center bg-black/30 rounded-lg p-3">
                          <div className={`text-2xl mb-2 ${platform.color}`}>
                            {platform.icon}
                          </div>
                          <div className="text-lg font-bold text-white">
                            {STATIC_MYSPHERE_DATA.socialMediaConnections[platform.key as keyof typeof STATIC_MYSPHERE_DATA.socialMediaConnections].toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-300">
                            {platform.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Your Position */}
                  {authenticated && (
                    <div className="bg-orange-500/20 rounded-lg p-4 text-center">
                      <div className="text-sm text-orange-200/70 mb-1">Your Status</div>
                      <div className="text-lg font-bold text-orange-200">
                        {connectedSocialsCount}/3 platforms connected
                      </div>
                      {connectedSocialsCount === 3 && (
                        <div className="text-sm text-green-400 mt-1">
                          🎉 You're among the {STATIC_MYSPHERE_DATA.fullyConnectedUsers} MySphere users with all platforms connected!
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Advanced analytics and charts removed */}
                </>
              )}
            </motion.div>



            {/* Network Tools - Only on Home Tab */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.9 }}
              className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-4 sm:p-6 mb-8"
            >
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-200 mb-4 sm:mb-6 flex items-center gap-2">
                🛠️ Network Tools
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <Link
                  href={FAUCET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-black/40 backdrop-blur-sm border border-orange-500/20 rounded-xl p-6 hover:border-orange-500/40 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-4xl">💧</div>
                    <div>
                      <h4 className="text-xl font-bold text-orange-100 group-hover:text-orange-200 transition-colors">Camp Network Faucet</h4>
                      <p className="text-orange-200/70">Get testnet tokens for development</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-orange-300">
                    <span>Visit Faucet</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </Link>

                <Link
                  href={EXPLORER_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-black/40 backdrop-blur-sm border border-orange-500/20 rounded-xl p-6 hover:border-orange-500/40 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-4xl">🔍</div>
                    <div>
                      <h4 className="text-xl font-bold text-orange-100 group-hover:text-orange-200 transition-colors">Camp Network Explorer</h4>
                      <p className="text-orange-200/70">Explore blocks, transactions, and contracts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-orange-300">
                    <span>Open Explorer</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </Link>
              </div>
            </motion.div>
          </>
        )}

        {/* Daily Quests Tab Content */}
        {activeTab === 'quests' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-4 sm:p-6 mb-8"
          >
            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-200 mb-4 sm:mb-6 flex items-center gap-2">
              🎯 Epic Quest System
              <span className="text-sm bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded-full">
                3D Experience
              </span>
            </h3>
            
            <div className="text-center py-8">
              <div className="relative">
                <motion.div
                  animate={{ 
                    rotateY: [0, 360],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ 
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="text-6xl mb-4"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  🚀
                </motion.div>
                
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-pink-500/20 blur-xl rounded-full" />
              </div>
              
              <h4 className="text-2xl font-bold text-white mb-4 bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-400 bg-clip-text text-transparent">
                Revolutionary Quest Experience
              </h4>
              
              <p className="text-orange-200/70 text-sm mt-2 mb-6">
                Embark on an epic 7-day journey through the Camp Network multiverse
              </p>
              
              <motion.div
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
                className="inline-block"
              >
                <Link
                  href="/mycamp/quest"
                  className="group relative bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 hover:from-cyan-400 hover:via-blue-500 hover:to-purple-500 shadow-2xl shadow-cyan-500/25"
                >
                  <span className="relative z-10 flex items-center gap-3">
                    <motion.span
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      🌀
                    </motion.span>
                    Enter Quest Dimension
                    <motion.span
                      animate={{ x: [0, 5, 0] }}
                      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                    >
                      →
                    </motion.span>
                  </span>
                  
                  {/* Button glow effect */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    whileHover={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 bg-gradient-to-r from-white/20 via-white/10 to-white/20 rounded-2xl"
                  />
                </Link>
              </motion.div>
              
              <div className="mt-8 max-w-2xl mx-auto">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-br from-cyan-600/20 via-cyan-500/10 to-cyan-800/20 backdrop-blur-sm border border-cyan-500/30 rounded-xl p-4">
                    <div className="text-3xl mb-2">🎨</div>
                    <h5 className="text-cyan-200 font-bold text-sm mb-1">3D Interactive</h5>
                    <p className="text-cyan-200/70 text-xs">Holographic quest cards with 3D effects</p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-600/20 via-purple-500/10 to-purple-800/20 backdrop-blur-sm border border-purple-500/30 rounded-xl p-4">
                    <div className="text-3xl mb-2">💎</div>
                    <h5 className="text-purple-200 font-bold text-sm mb-1">NFT Rewards</h5>
                    <p className="text-purple-200/70 text-xs">Mint exclusive animated NFTs</p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-pink-600/20 via-pink-500/10 to-pink-800/20 backdrop-blur-sm border border-pink-500/30 rounded-xl p-4">
                    <div className="text-3xl mb-2">🌟</div>
                    <h5 className="text-pink-200 font-bold text-sm mb-1">Epic Journey</h5>
                    <p className="text-pink-200/70 text-xs">7-day adventure with legendary rewards</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Statistics Tab Content */}
        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-4 sm:p-6 mb-8"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-3">
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-200 flex items-center gap-2">
                📊 Wallet Statistics
                <Image 
                  src="/Camp.png" 
                  alt="Camp Network" 
                  width={24} 
                  height={24} 
                  className="ml-2 opacity-80"
                />
              </h3>
              <div className="flex items-center gap-2">
                <div className="text-sm text-orange-200/70">Powered by</div>
                <Link 
                  href="https://basecamp.cloud.blockscout.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  BaseCamp Explorer
                </Link>
              </div>
            </div>

            {!isConnected ? (
              <>
                {/* Preview Cards - Blurred */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8 relative">
                  {/* Blur Overlay */}
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-xl z-10 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-6xl mb-4">🔌</div>
                      <p className="text-orange-200 text-lg font-bold">Connect Wallet to View Stats</p>
                      <p className="text-orange-200/70 text-sm mt-2">Your on-chain activity and achievements</p>
                    </div>
                  </div>

                  {/* Preview Transactions */}
                  <div className="bg-gradient-to-br from-blue-600/20 via-blue-500/10 to-blue-800/20 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6 grayscale">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-4xl opacity-50">🔄</div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-blue-300/50">***</div>
                        <div className="text-sm text-blue-200/50">Transactions</div>
                      </div>
                    </div>
                    <div className="text-center pt-2 border-t border-blue-500/20">
                      <div className="text-sm text-blue-200/50">Points Earned</div>
                      <div className="text-xl font-bold text-blue-200/50">*****</div>
                    </div>
                  </div>

                  {/* Preview Tokens */}
                  <div className="bg-gradient-to-br from-green-600/20 via-green-500/10 to-green-800/20 backdrop-blur-sm border border-green-500/30 rounded-xl p-6 grayscale">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-4xl opacity-50">🪙</div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-green-300/50">***</div>
                        <div className="text-sm text-green-200/50">Tokens</div>
                      </div>
                    </div>
                    <div className="text-center pt-2 border-t border-green-500/20">
                      <div className="text-sm text-green-200/50">Points Earned</div>
                      <div className="text-xl font-bold text-green-200/50">*****</div>
                    </div>
                  </div>

                  {/* Preview NFTs */}
                  <div className="bg-gradient-to-br from-purple-600/20 via-purple-500/10 to-purple-800/20 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6 grayscale">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-4xl opacity-50">🎨</div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-purple-300/50">***</div>
                        <div className="text-sm text-purple-200/50">NFTs</div>
                      </div>
                    </div>
                    <div className="text-center pt-2 border-t border-purple-500/20">
                      <div className="text-sm text-purple-200/50">Points Earned</div>
                      <div className="text-xl font-bold text-purple-200/50">*****</div>
                    </div>
                  </div>

                  {/* Preview Unique Contracts */}
                  <div className="bg-gradient-to-br from-orange-600/20 via-orange-500/10 to-orange-800/20 backdrop-blur-sm border border-orange-500/30 rounded-xl p-6 grayscale">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-4xl opacity-50">📋</div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-orange-300/50">***</div>
                        <div className="text-sm text-orange-200/50">Unique Contracts</div>
                      </div>
                    </div>
                    <div className="text-center pt-2 border-t border-orange-500/20">
                      <div className="text-sm text-orange-200/50">Points Earned</div>
                      <div className="text-xl font-bold text-orange-200/50">*****</div>
                    </div>
                  </div>
                </div>

                {/* Preview Total Points */}
                <div className="bg-gradient-to-r from-orange-600/20 via-yellow-500/20 to-orange-600/20 backdrop-blur-sm border border-orange-500/30 rounded-xl p-6 grayscale relative">
                  <div className="absolute inset-0 bg-black/30 backdrop-blur-sm rounded-xl"></div>
                  <div className="relative text-center">
                    <div className="text-sm text-orange-200/50 mb-2">Total Points Earned</div>
                    <div className="text-4xl font-bold text-orange-200/50 mb-2">******</div>
                    <div className="text-sm text-orange-200/50">
                      Based on your on-chain activity • Connect wallet to view
                    </div>
                  </div>
                                 </div>
               </>
            ) : statsLoading ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4 animate-spin">⏳</div>
                <p className="text-orange-200 text-lg">Loading wallet statistics...</p>
                <p className="text-orange-200/70 text-sm mt-2">Fetching data from BaseCamp Explorer</p>
              </div>
            ) : statsError ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">❌</div>
                <p className="text-orange-200 text-lg">Failed to load statistics</p>
                <p className="text-orange-200/70 text-sm mt-2 mb-4">{statsError}</p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={fetchWalletStats}
                  className="bg-orange-500/80 hover:bg-orange-500/90 text-white px-6 py-2 rounded-lg font-medium transition-all duration-300"
                >
                  🔄 Retry
                </motion.button>
              </div>
            ) : walletStats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* Transactions */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="bg-gradient-to-br from-blue-600/20 via-blue-500/10 to-blue-800/20 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6 hover:border-blue-500/50 transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-4xl">🔄</div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-blue-300">{walletStats.transactions.toLocaleString()}</div>
                      <div className="text-sm text-blue-200/70">Transactions</div>
                    </div>
                  </div>
                  <div className="text-center pt-2 border-t border-blue-500/20">
                    <div className="text-sm text-blue-200/70">Points Earned</div>
                    <div className="text-xl font-bold text-blue-200">{walletStats.transactionsPoints.toLocaleString()}</div>
                  </div>
                </motion.div>

                {/* Tokens */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="bg-gradient-to-br from-green-600/20 via-green-500/10 to-green-800/20 backdrop-blur-sm border border-green-500/30 rounded-xl p-6 hover:border-green-500/50 transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-4xl">🪙</div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-green-300">{walletStats.tokens.toLocaleString()}</div>
                      <div className="text-sm text-green-200/70">Tokens</div>
                    </div>
                  </div>
                  <div className="text-center pt-2 border-t border-green-500/20">
                    <div className="text-sm text-green-200/70">Points Earned</div>
                    <div className="text-xl font-bold text-green-200">{walletStats.tokensPoints.toLocaleString()}</div>
                  </div>
                </motion.div>

                {/* NFTs */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="bg-gradient-to-br from-purple-600/20 via-purple-500/10 to-purple-800/20 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6 hover:border-purple-500/50 transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="text-4xl">🎨</div>
                      {walletStats.hasCampNFT && (
                        <div className="relative">
                          <Image 
                            src="/MSxCAMP.png" 
                            alt="MSxCAMP NFT" 
                            width={32} 
                            height={32} 
                            className="rounded-lg border border-purple-400/50 shadow-lg"
                          />
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border border-white shadow-sm"></div>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-purple-300">{walletStats.nfts.toLocaleString()}</div>
                      <div className="text-sm text-purple-200/70">
                        NFTs {walletStats.hasCampNFT && <span className="text-green-400">• MSxCAMP ✓</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-center pt-2 border-t border-purple-500/20">
                    <div className="text-sm text-purple-200/70">Points Earned</div>
                    <div className="text-xl font-bold text-purple-200">{walletStats.nftsPoints.toLocaleString()}</div>
                  </div>
                  {walletStats.hasCampNFT && walletStats.campNFTDetails && (
                    <div className="mt-3 pt-3 border-t border-purple-500/20">
                      <div className="text-xs text-purple-200/60 text-center">
                        🏆 {walletStats.campNFTDetails.name} Owner
                      </div>
                    </div>
                  )}
                </motion.div>

                                  {/* Unique Contracts */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="bg-gradient-to-br from-orange-600/20 via-orange-500/10 to-orange-800/20 backdrop-blur-sm border border-orange-500/30 rounded-xl p-6 hover:border-orange-500/50 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-4xl">📋</div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-orange-300">{walletStats.contracts.toLocaleString()}</div>
                        <div className="text-sm text-orange-200/70">Unique Contracts</div>
                      </div>
                    </div>
                    <div className="text-center pt-2 border-t border-orange-500/20">
                      <div className="text-sm text-orange-200/70">Points Earned</div>
                      <div className="text-xl font-bold text-orange-200">{walletStats.contractsPoints.toLocaleString()}</div>
                    </div>
                  </motion.div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📊</div>
                <p className="text-orange-200 text-lg">No statistics available</p>
                <p className="text-orange-200/70 text-sm mt-2">Connect your wallet and try again</p>
              </div>
            )}

            {/* Total Points Summary */}
            {walletStats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-8 bg-gradient-to-r from-orange-600/20 via-yellow-500/20 to-orange-600/20 backdrop-blur-sm border border-orange-500/30 rounded-xl p-6"
              >
                <div className="text-center">
                  <div className="text-sm text-orange-200/70 mb-2">Total Points Earned</div>
                  <div className="text-4xl font-bold text-orange-200 mb-2">
                    {(walletStats.transactionsPoints + walletStats.tokensPoints + walletStats.nftsPoints + walletStats.contractsPoints).toLocaleString()}
                  </div>
                  <div className="text-sm text-orange-200/70">
                    Based on your on-chain activity • Refreshed automatically
                  </div>
                </div>
              </motion.div>
            )}

            {/* Refresh Button */}
            {walletStats && (
              <div className="flex justify-center mt-6">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={fetchWalletStats}
                  disabled={statsLoading}
                  className="bg-orange-500/80 hover:bg-orange-500/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2"
                >
                  <span className={statsLoading ? 'animate-spin' : ''}>🔄</span>
                  {statsLoading ? 'Refreshing...' : 'Refresh Stats'}
                </motion.button>
              </div>
            )}


          </motion.div>
        )}

        {/* Camp Network NFTs section removed from MY IP tab */}

        {/* My IP Tab Content */}
        {activeTab === 'nfts' && (
          <>
            
            {/* Existing IP NFTs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="bg-black/30 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-4 sm:p-6 mb-8"
            >
              <div className="flex justify-between items-start mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-purple-200 flex items-center gap-2">
                  🎯 My IP NFTs
                  <span className="text-sm bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full">
                    Origin SDK
                  </span>
                </h3>
                <Link
                  href="/marketplace"
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-2 px-4 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25 flex items-center gap-2"
                >
                  <span>🛒</span>
                  <span>Marketplace</span>
                </Link>
              </div>
              
              {!isConnected ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔌</div>
                  <p className="text-purple-200 text-lg">Connect your wallet to view IP NFTs</p>
                  <p className="text-purple-200/70 text-sm mt-2">Your Origin IpNFTs from BaseCamp test</p>
                </div>
              ) : (
                <MyIpSection />
              )}
            </motion.div>
          </>
        )}

        {/* IP Creator Subpage */}
        {activeTab === 'creator' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-black/30 backdrop-blur-sm border border-pink-500/20 rounded-2xl p-4 sm:p-6 mb-8"
          >
            {/* Title removed as requested */}
            <NftCreator />
          </motion.div>
        )}

        {/* NFTs Tab Content - Now only shows Camp Network NFTs */}
        {activeTab === 'portal' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-4 sm:p-6 mb-8"
          >
            <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-200 mb-4 sm:mb-6 flex items-center gap-2">
              🖼️ Camp Network NFTs
              <Image 
                src="/Camp.png" 
                alt="Camp Network" 
                width={24} 
                height={24} 
                className="ml-2 opacity-80"
              />
            </h3>
            
            {!isConnected ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔌</div>
                <p className="text-orange-200 text-lg">Connect your wallet to view NFTs</p>
                <p className="text-orange-200/70 text-sm mt-2">Check your Camp Network NFT collection</p>
              </div>
            ) : walletStats?.hasCampNFT ? (
              <div className="max-w-md mx-auto">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="bg-gradient-to-br from-purple-600/20 via-purple-500/10 to-purple-800/20 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-6 hover:border-purple-500/50 transition-all duration-300"
                >
                  <div className="text-center mb-4">
                    <div className="relative inline-block">
                      <Image 
                        src="/MSxCAMP.png" 
                        alt="MSxCAMP NFT" 
                        width={120} 
                        height={120} 
                        className="rounded-2xl border border-purple-400/50 shadow-2xl"
                      />
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-400 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                        <span className="text-xs">✓</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <h4 className="text-xl font-bold text-purple-200 mb-2">
                      {walletStats.campNFTDetails?.name || 'MSxCAMP NFT'}
                    </h4>
                    <p className="text-purple-200/70 text-sm mb-4">
                      Exclusive Camp Network Member NFT
                    </p>
                    
                    <div className="bg-purple-500/20 rounded-lg p-3 mb-4">
                      <div className="text-xs text-purple-200/60 mb-1">Contract Address</div>
                      <div className="text-sm font-mono text-purple-200 break-all">
                        {walletStats.campNFTDetails?.contractAddress || CAMP_NFT_CONTRACT}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-center gap-2 text-green-400">
                      <span className="text-lg">🏆</span>
                      <span className="font-medium">Verified Owner</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4 opacity-50">🎨</div>
                <p className="text-orange-200 text-lg">No Camp Network NFTs found</p>
                <p className="text-orange-200/70 text-sm mt-2 mb-4">
                  You don't own the MSxCAMP NFT yet
                </p>
                <div className="bg-orange-500/20 rounded-lg p-4 max-w-md mx-auto">
                  <div className="text-sm text-orange-200/80">
                    <strong>Looking for:</strong><br/>
                    Contract: <span className="font-mono text-xs">{CAMP_NFT_CONTRACT}</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Spotify Tab Content - Hidden if SPOTIFY_FEATURES_ENABLED is false */}
        {SPOTIFY_FEATURES_ENABLED && activeTab === 'spotify' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-black/30 backdrop-blur-sm border border-green-500/20 rounded-2xl p-4 sm:p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-green-300 flex items-center gap-2">
                🎵 Spotify Analytics & Data
                <span className="text-sm bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                  Enhanced with Origin SDK
                </span>
              </h3>
            </div>
            
            <SpotifyDashboard />
          </motion.div>
        )}

        {/* Camp Modal for Authentication */}
        <CampModal injectButton={false} />
      </div>

      {/* Portal Dropdown - Renders at document.body level (Desktop only) */}
      {typeof window !== 'undefined' && socialDropdownOpen && !isMobile && createPortal(
        <motion.div
          initial={{ 
            opacity: 0, 
            y: -5, 
            scaleY: 0.8, 
            transformOrigin: 'top' 
          }}
          animate={{ 
            opacity: 1, 
            y: 0,
            scaleY: 1
          }}
          exit={{ 
            opacity: 0, 
            y: -5, 
            scaleY: 0.8 
          }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="fixed bg-black/90 backdrop-blur-sm border border-green-500/30 rounded-xl overflow-hidden shadow-2xl shadow-green-500/20"
          style={{
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            zIndex: 10000
          }}
        >
          {[
            { key: 'twitter', name: 'Twitter', gradient: 'from-sky-500 to-blue-500', available: true },
            { key: 'spotify', name: 'Spotify', gradient: 'from-green-500 to-emerald-500', available: true },
            { key: 'tiktok', name: 'TikTok', gradient: 'from-pink-500 to-rose-500', available: true }
                     ].map((social, index) => (
             <motion.button
               key={social.key}
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: index * 0.05 }}
               disabled={!social.available}
               className={`w-full px-3 sm:px-4 py-3 text-left transition-all duration-200 relative overflow-hidden ${
                 social.available 
                   ? 'text-orange-200 hover:bg-white/10 cursor-pointer' 
                   : 'text-orange-200/50 cursor-not-allowed backdrop-blur-[1px]'
               }`}
             >
               <div className="flex items-center justify-between">
                 <span className={`font-medium text-sm sm:text-base ${social.available ? '' : 'blur-[0.5px]'}`}>
                   {social.name}
                 </span>
                 <span className="text-xs text-orange-300/70 font-medium">
                   {social.available ? 'Available' : 'Disabled'}
                 </span>
               </div>
               {/* Subtle overlay for disabled items */}
               {!social.available && <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>}
             </motion.button>
           ))}
        </motion.div>,
        document.body
      )}
    </div>
    </ToastProvider>
  );
}