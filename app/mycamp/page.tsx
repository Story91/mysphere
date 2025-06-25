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
} from '@campnetwork/sdk/react';
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
// Removed API imports - these should only be used in backend

const CAMP_NFT_CONTRACT = '0x1eD74B27f846C699A90926daD057A7f6FD22C126';

export default function MyCampPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [walletStats, setWalletStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [socialDropdownOpen, setSocialDropdownOpen] = useState(false);
  const [selectedSocial, setSelectedSocial] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [buttonRef, setButtonRef] = useState<HTMLButtonElement | null>(null);
  const [connectedSocialsCount, setConnectedSocialsCount] = useState(0);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [globalStatsLoading, setGlobalStatsLoading] = useState(false);
  
  // Camp SDK hooks
  const auth = useAuth();
  const { authenticated, loading } = useAuthState();
  const { data: socialsData, error: socialsError, isLoading: socialsLoading, refetch: refetchSocials } = useSocials();
  const modal = useModal();
  const {
    linkTwitter,
    linkDiscord,
    linkSpotify,
    unlinkTwitter,
    unlinkDiscord,
    unlinkSpotify
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

  // Note: API data fetching moved to backend routes
  // /api/camp/twitter and /api/camp/spotify are available for future use

  // Count connected social media platforms and update stats
  useEffect(() => {
    if (socialsData && address) {
      const platforms = ['twitter', 'discord', 'spotify', 'tiktok', 'telegram'];
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

  // Fetch REAL MySphere user statistics from Firebase
  const fetchGlobalStats = async () => {
    setGlobalStatsLoading(true);
    try {
      const response = await fetch('/api/camp-stats');
      const data = await response.json();
      
      if (data.success) {
        setGlobalStats(data.data);
        console.log('📊 REAL MySphere stats loaded from Firebase:', data.data);
      }
    } catch (error) {
      console.error('❌ Failed to fetch MySphere stats from Firebase:', error);
    } finally {
      setGlobalStatsLoading(false);
    }
  };

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
      hasDiscord: (socialsData as any)?.discord,
      connectedSocialsCount
    });
  }, [authenticated, loading, address, socialsData, socialsError, socialsLoading, CLIENT_ID, API_KEY, connectedSocialsCount]);

  // Auto-load global stats on page load
  useEffect(() => {
    fetchGlobalStats();
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

  // Auto-load global stats on component mount
  useEffect(() => {
    fetchGlobalStats();
  }, []);

  // Fetch wallet stats when Stats or NFTs tab is active and wallet is connected
  useEffect(() => {
    if ((activeTab === 'stats' || activeTab === 'nfts') && address && !walletStats && !statsLoading) {
      fetchWalletStats();
    }
    
    // Fetch global stats when Home tab is active
    if (activeTab === 'home' && !globalStats && !globalStatsLoading) {
      fetchGlobalStats();
    }
  }, [activeTab, address, walletStats, statsLoading, globalStats, globalStatsLoading]);

  // Update dropdown position when button ref changes
  useEffect(() => {
    const updatePosition = () => {
      if (buttonRef && socialDropdownOpen) {
        const rect = buttonRef.getBoundingClientRect();
        const scrollY = window.scrollY;
        setDropdownPosition({
          top: rect.bottom + scrollY - 1,
          left: rect.left,
          width: rect.width
        });
      }
    };

    updatePosition();

    if (socialDropdownOpen) {
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [buttonRef, socialDropdownOpen]);

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
    <div className="min-h-screen bg-gradient-to-br from-black via-orange-800 to-orange-600">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-[linear-gradient(90deg,transparent_24%,rgba(249,115,22,0.08)_25%,rgba(249,115,22,0.08)_26%,transparent_27%,transparent_74%,rgba(249,115,22,0.08)_75%,rgba(249,115,22,0.08)_76%,transparent_77%,transparent),linear-gradient(0deg,transparent_24%,rgba(249,115,22,0.08)_25%,rgba(249,115,22,0.08)_26%,transparent_27%,transparent_74%,rgba(249,115,22,0.08)_75%,rgba(249,115,22,0.08)_76%,transparent_77%,transparent)] bg-[length:30px_30px] opacity-60"></div>
      
      {/* Success Message */}
      {showSuccessMessage && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl shadow-2xl border border-green-400/50"
        >
          <div className="flex items-center gap-2">
            <div className="text-xl">🎉</div>
            <span className="font-medium">Social account connected successfully!</span>
          </div>
        </motion.div>
      )}
      
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Enhanced Beautiful Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-center mb-16 relative"
        >
          {/* Multi-layer Glow Effect Background */}
          <div className="absolute inset-0 -z-10">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-40 bg-gradient-to-r from-orange-500/30 via-yellow-500/40 to-red-500/30 blur-3xl rounded-full"
            />
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 2, ease: "easeOut", delay: 0.3 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-32 bg-gradient-to-r from-pink-500/20 via-orange-500/30 to-yellow-500/20 blur-2xl rounded-full"
            />
          </div>
          
          {/* Enhanced Main Title with Different Font */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.3, rotateX: -15 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
            className="text-8xl md:text-9xl font-black relative tracking-wider"
            style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}
          >
            {/* Multi-layer Text with Enhanced Gradient */}
            <span className="relative inline-block">
              {/* Shadow Layer */}
              <span className="absolute inset-0 bg-gradient-to-r from-orange-900 via-red-800 to-orange-900 bg-clip-text text-transparent blur-sm translate-x-2 translate-y-2">
                MyCamp
              </span>
              {/* Main Text with Animated Gradient */}
              <span className="relative bg-gradient-to-r from-orange-200 via-yellow-300 via-orange-100 via-yellow-400 to-orange-200 bg-clip-text text-transparent bg-[length:300%_100%] animate-gradient-x drop-shadow-[0_0_30px_rgba(249,115,22,0.8)]">
                MyCamp
              </span>
              {/* Highlight Layer */}
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent bg-clip-text text-transparent bg-[length:200%_100%] animate-pulse">
                MyCamp
              </span>
            </span>
            
            {/* Enhanced Animated Underline */}
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "100%", opacity: 1 }}
              transition={{ duration: 2, delay: 1.2, ease: "easeOut" }}
              className="absolute -bottom-6 left-1/2 -translate-x-1/2 h-2 bg-gradient-to-r from-transparent via-orange-400 via-yellow-400 via-orange-400 to-transparent rounded-full shadow-[0_0_20px_rgba(249,115,22,0.8)]"
            />
            
            {/* Secondary Underline */}
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "80%", opacity: 0.6 }}
              transition={{ duration: 1.5, delay: 1.8, ease: "easeOut" }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-1 bg-gradient-to-r from-transparent via-yellow-300 to-transparent rounded-full"
            />
          </motion.h1>

          {/* Enhanced Floating Camp Icon */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
            className="mt-12 inline-block"
          >
            <motion.div
              animate={{ 
                y: [0, -15, 0],
                rotate: [0, 8, -8, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="text-7xl filter drop-shadow-[0_0_30px_rgba(249,115,22,0.9)] hover:drop-shadow-[0_0_40px_rgba(249,115,22,1)] transition-all duration-300"
            >
              🏕️
            </motion.div>
          </motion.div>

          {/* Enhanced Particles Effect */}
          <div className="absolute inset-0 -z-20">
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ 
                  opacity: [0, 1, 0.5, 0],
                  scale: [0, 1.5, 1, 0],
                  x: [0, Math.random() * 600 - 300],
                  y: [0, Math.random() * 300 - 150],
                  rotate: [0, Math.random() * 360]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  delay: i * 0.6,
                  ease: "easeOut"
                }}
                className="absolute top-1/2 left-1/2 w-3 h-3 bg-gradient-to-r from-orange-400 to-yellow-400 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)]"
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
          className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-8 mb-8"
        >

          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
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
              className={`group relative overflow-hidden rounded-2xl p-6 transition-all duration-500 ${
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
                  <div className="text-3xl mb-3 font-black tracking-wider">HOME</div>
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
              className={`group relative overflow-hidden rounded-2xl p-6 transition-all duration-500 ${
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
                  <div className="text-3xl mb-3 font-black tracking-wider">STATS</div>
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

            {/* NFTs Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.5 }}
              whileHover={{ 
                scale: 1.05, 
                y: -5,
                boxShadow: "0 20px 40px rgba(168, 85, 247, 0.4)"
              }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab('nfts')}
              className={`group relative overflow-hidden rounded-2xl p-6 transition-all duration-500 ${
                activeTab === 'nfts'
                  ? 'bg-gradient-to-br from-purple-500/80 to-pink-500/80 text-white shadow-2xl shadow-purple-500/25 border border-purple-400/50'
                  : 'bg-black/40 hover:bg-black/60 text-orange-200 hover:text-orange-100 border border-orange-500/20 hover:border-purple-400/40'
              }`}
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-purple-400/20 to-pink-400/20"
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
                  <div className="text-3xl mb-3 font-black tracking-wider">NFTs</div>
                  <div className="text-xs opacity-80 uppercase tracking-widest">Collection</div>
                </motion.div>
              </div>
              {activeTab === 'nfts' && (
                <motion.div
                  layoutId="activeGlow"
                  className="absolute inset-0 bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-2xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>

            {/* Social Media Dropdown Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6, duration: 0.5 }}
              className="relative"
            >
              <motion.button
                ref={setButtonRef}
                whileHover={{ 
                  scale: 1.02, 
                  y: -2
                }}
                onClick={() => setSocialDropdownOpen(!socialDropdownOpen)}
                className="group relative overflow-hidden rounded-2xl p-6 w-full transition-all duration-500 bg-black/40 text-orange-200/70 border border-orange-500/20 cursor-pointer"
              >
                {/* Disabled overlay */}
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[0.5px]"></div>
                
                <div className="relative z-10">
                  <motion.div 
                    className="text-center"
                    transition={{ duration: 0.2 }}
                  >
                    <div className="text-3xl mb-3 font-black tracking-wider blur-[0.5px] flex items-center justify-center gap-3">
                      SOCIAL
                      {authenticated && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="bg-orange-500/80 text-white text-sm px-2 py-1 rounded-full font-bold min-w-[24px] text-center"
                        >
                          {connectedSocialsCount}/5
                        </motion.div>
                      )}
                    </div>
                    <div className="text-xs opacity-60 uppercase tracking-widest flex items-center justify-center gap-1">
                      {authenticated ? `${connectedSocialsCount} Connected` : 'Coming Soon'}
                      <motion.span
                        animate={{ rotate: socialDropdownOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="opacity-50"
                      >
                        ▼
                      </motion.span>
                    </div>
                  </motion.div>
                </div>

              </motion.button>


            </motion.div>
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
          className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-6 mb-8"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-orange-200 flex items-center gap-2">
              🔗 Social Media Management
            </h3>
            <div className="flex items-center gap-3">
              {/* Camp Modal Button - główny przycisk do zarządzania social media */}
              <CampModal />
              {!authenticated && (
                <button
                  onClick={async () => {
                    try {
                      console.log('🔗 Manual Connect clicked');
                      await auth.connect();
                    } catch (error) {
                      console.error('❌ Manual connect error:', error);
                    }
                  }}
                  className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Connect First
                </button>
              )}
            </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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

              {/* Discord - Compact Glass Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                className="group relative"
              >
                <div className="relative bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-2xl rounded-2xl border border-white/30 p-4 hover:border-white/50 transition-all duration-500 overflow-hidden shadow-xl hover:shadow-purple-500/20">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-purple-500/10 to-indigo-800/20 rounded-2xl"></div>
                  
                  <div className="relative z-10 mb-3">
                    <div className="w-full h-24 bg-gradient-to-br from-indigo-500/30 to-purple-600/30 rounded-xl flex items-center justify-center border border-white/20 backdrop-blur-sm">
                      <svg className="w-8 h-8 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                    </div>
                  </div>
                  
                  <div className="absolute top-3 right-3">
                    <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.discord) ? 'bg-green-400' : 'bg-red-400'} relative shadow-lg`}>
                      <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.discord) ? 'bg-green-400' : 'bg-red-400'} absolute animate-ping`}></div>
                    </div>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-lg font-bold text-white mb-1">Discord</h3>
                    <p className="text-white/70 text-xs mb-3">Join Discord community</p>
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => modal.openModal()}
                      className={`w-full py-2 px-3 rounded-lg font-bold text-xs transition-all duration-300 ${
                        ((socialsData as any)?.discord)
                          ? 'bg-red-500/80 hover:bg-red-500/90 text-white backdrop-blur-sm'
                          : 'bg-indigo-500/80 hover:bg-indigo-500/90 text-white backdrop-blur-sm'
                      }`}
                    >
                      {((socialsData as any)?.discord) ? '🔗 Unlink Account' : '🔗 Connect Discord'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>

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

              {/* Telegram - Compact Glass Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.5, ease: "easeOut" }}
                className="group relative"
              >
                <div className="relative bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-2xl rounded-2xl border border-white/30 p-4 hover:border-white/50 transition-all duration-500 overflow-hidden shadow-xl hover:shadow-blue-500/20">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-sky-500/10 to-blue-800/20 rounded-2xl"></div>
                  
                  <div className="relative z-10 mb-3">
                    <div className="w-full h-24 bg-gradient-to-br from-blue-500/30 to-sky-600/30 rounded-xl flex items-center justify-center border border-white/20 backdrop-blur-sm">
                      <svg className="w-8 h-8 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                      </svg>
                    </div>
                  </div>
                  
                  <div className="absolute top-3 right-3">
                    <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.telegram) ? 'bg-green-400' : 'bg-red-400'} relative shadow-lg`}>
                      <div className={`w-3 h-3 rounded-full ${((socialsData as any)?.telegram) ? 'bg-green-400' : 'bg-red-400'} absolute animate-ping`}></div>
                    </div>
                  </div>
                  
                  <div className="relative z-10">
                    <h3 className="text-lg font-bold text-white mb-1">Telegram</h3>
                    <p className="text-white/70 text-xs mb-3">Join Telegram channel</p>
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => modal.openModal()}
                      className={`w-full py-2 px-3 rounded-lg font-bold text-xs transition-all duration-300 ${
                        ((socialsData as any)?.telegram)
                          ? 'bg-red-500/80 hover:bg-red-500/90 text-white backdrop-blur-sm'
                          : 'bg-blue-500/80 hover:bg-blue-500/90 text-white backdrop-blur-sm'
                      }`}
                    >
                      {((socialsData as any)?.telegram) ? '🔗 Unlink Account' : '🔗 Connect Telegram'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>

            {/* Tip Section - Now as regular text below cards */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="text-center mb-8"
            >
              <p className="text-orange-200/80 text-sm max-w-2xl mx-auto leading-relaxed">
                💡 <strong className="text-orange-300">Tip:</strong> Connecting your social accounts allows Camp Network to verify your 
                social presence and enables advanced features like social-based reputation scoring.
              </p>
            </motion.div>

            {/* Global Camp Network Statistics */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.9 }}
              className="bg-gradient-to-r from-blue-600/20 via-cyan-500/20 to-blue-600/20 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6 mb-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-xl font-bold text-blue-200 flex items-center gap-2">
                    🌍 MySphere User Statistics
                  </h4>
                  {globalStats && (
                    <div className="text-xs text-blue-200/60 mt-1">
                      Last updated: {new Date(globalStats.lastUpdated).toLocaleTimeString()} • 
                      Source: Firebase Database (Real Data)
                    </div>
                  )}
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={fetchGlobalStats}
                  disabled={globalStatsLoading}
                  className="bg-blue-500/80 hover:bg-blue-500/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-all duration-300 flex items-center gap-2 text-sm"
                >
                  <span className={globalStatsLoading ? 'animate-spin' : ''}>🔄</span>
                  {globalStatsLoading ? 'Loading...' : 'Refresh'}
                </motion.button>
              </div>
              
              {globalStatsLoading ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4 animate-spin">⏳</div>
                  <p className="text-blue-200 text-lg">Loading MySphere statistics...</p>
                  <p className="text-blue-200/70 text-sm mt-2">Fetching real user data from Firebase</p>
                </div>
              ) : globalStats ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    {/* Total Users */}
                    <div className="text-center bg-blue-500/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-blue-300">{globalStats.totalUsers.toLocaleString()}</div>
                      <div className="text-sm text-blue-200/70">MySphere Users</div>
                    </div>
                    
                    {/* Fully Connected Users */}
                    <div className="text-center bg-green-500/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-green-300">{globalStats.fullyConnectedUsers.toLocaleString()}</div>
                      <div className="text-sm text-green-200/70">All 5 Platforms Connected</div>
                    </div>
                    
                    {/* Average Connections */}
                    <div className="text-center bg-purple-500/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-purple-300">{globalStats.averageConnectionsPerUser}</div>
                      <div className="text-sm text-purple-200/70">Avg Connections/User</div>
                    </div>
                  </div>
                  
                  {/* Social Media Breakdown */}
                  <div className="mb-6">
                    <h5 className="text-lg font-bold text-blue-200 mb-4 text-center">Social Media Connections</h5>
                    <div className="grid grid-cols-5 gap-4">
                      {[
                        { key: 'twitter', name: 'Twitter', icon: '🐦', color: 'text-blue-400' },
                        { key: 'discord', name: 'Discord', icon: '🎮', color: 'text-purple-400' },
                        { key: 'spotify', name: 'Spotify', icon: '🎵', color: 'text-green-400' },
                        { key: 'tiktok', name: 'TikTok', icon: '🎬', color: 'text-pink-400' },
                        { key: 'telegram', name: 'Telegram', icon: '✈️', color: 'text-cyan-400' }
                      ].map((platform) => (
                        <div key={platform.key} className="text-center bg-black/30 rounded-lg p-3">
                          <div className={`text-2xl mb-2 ${platform.color}`}>
                            {platform.icon}
                          </div>
                          <div className="text-lg font-bold text-white">
                            {globalStats.socialMediaConnections[platform.key].toLocaleString()}
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
                        {connectedSocialsCount}/5 platforms connected
                      </div>
                      {connectedSocialsCount === 5 && (
                        <div className="text-sm text-green-400 mt-1">
                          🎉 You're among the {globalStats.fullyConnectedUsers} MySphere users with all platforms connected!
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Advanced Analytics Section */}
                  <div className="mt-8 space-y-8">
                    <div className="text-center">
                      <h5 className="text-2xl font-bold text-blue-200 mb-2">📈 Advanced Analytics</h5>
                      <p className="text-blue-200/70 text-sm">Deep insights into MySphere social media connections</p>
                    </div>
                    
                    {/* Growth Trend Chart */}
                    <div className="bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-cyan-600/10 backdrop-blur-sm border border-blue-500/20 rounded-xl p-6">
                      <h6 className="text-lg font-bold text-blue-200 mb-4 flex items-center gap-2">
                        📊 Platform Growth Trend (Last 7 Days)
                      </h6>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={globalStats.growthTrendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis 
                              dataKey="date" 
                              stroke="#9CA3AF"
                              fontSize={12}
                            />
                            <YAxis stroke="#9CA3AF" fontSize={12} />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '8px',
                                color: '#E5E7EB'
                              }}
                            />
                            <Legend />
                            <Line 
                              type="monotone" 
                              dataKey="twitter" 
                              stroke="#1DA1F2" 
                              strokeWidth={3}
                              dot={{ fill: '#1DA1F2', strokeWidth: 2, r: 4 }}
                              name="Twitter"
                            />
                            <Line 
                              type="monotone" 
                              dataKey="discord" 
                              stroke="#7289DA" 
                              strokeWidth={3}
                              dot={{ fill: '#7289DA', strokeWidth: 2, r: 4 }}
                              name="Discord"
                            />
                            <Line 
                              type="monotone" 
                              dataKey="spotify" 
                              stroke="#1DB954" 
                              strokeWidth={3}
                              dot={{ fill: '#1DB954', strokeWidth: 2, r: 4 }}
                              name="Spotify"
                            />
                            <Line 
                              type="monotone" 
                              dataKey="tiktok" 
                              stroke="#FF0050" 
                              strokeWidth={3}
                              dot={{ fill: '#FF0050', strokeWidth: 2, r: 4 }}
                              name="TikTok"
                            />
                            <Line 
                              type="monotone" 
                              dataKey="telegram" 
                              stroke="#0088CC" 
                              strokeWidth={3}
                              dot={{ fill: '#0088CC', strokeWidth: 2, r: 4 }}
                              name="Telegram"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    
                    {/* Platform Distribution Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Pie Chart */}
                      <div className="bg-gradient-to-br from-purple-600/10 via-pink-600/10 to-red-600/10 backdrop-blur-sm border border-purple-500/20 rounded-xl p-6">
                        <h6 className="text-lg font-bold text-purple-200 mb-4 flex items-center gap-2">
                          🥧 Platform Distribution
                        </h6>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={globalStats.platformChartData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                label={({ name, value, percent }: any) => `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)`}
                              >
                                {globalStats.platformChartData.map((entry: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                  border: '1px solid rgba(147, 51, 234, 0.3)',
                                  borderRadius: '8px',
                                  color: '#E5E7EB'
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      
                      {/* Bar Chart */}
                      <div className="bg-gradient-to-br from-green-600/10 via-emerald-600/10 to-teal-600/10 backdrop-blur-sm border border-green-500/20 rounded-xl p-6">
                        <h6 className="text-lg font-bold text-green-200 mb-4 flex items-center gap-2">
                          📊 Platform Comparison
                        </h6>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={globalStats.platformChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis 
                                dataKey="name" 
                                stroke="#9CA3AF"
                                fontSize={12}
                              />
                              <YAxis stroke="#9CA3AF" fontSize={12} />
                              <Tooltip 
                                contentStyle={{
                                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                  border: '1px solid rgba(34, 197, 94, 0.3)',
                                  borderRadius: '8px',
                                  color: '#E5E7EB'
                                }}
                              />
                              <Bar 
                                dataKey="value" 
                                fill="#10B981"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                    
                    {/* Connection Distribution Chart */}
                    <div className="bg-gradient-to-br from-orange-600/10 via-yellow-600/10 to-red-600/10 backdrop-blur-sm border border-orange-500/20 rounded-xl p-6">
                      <h6 className="text-lg font-bold text-orange-200 mb-4 flex items-center gap-2">
                        📈 User Connection Distribution
                      </h6>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={globalStats.distributionChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis 
                              dataKey="connections" 
                              stroke="#9CA3AF"
                              fontSize={12}
                              label={{ value: 'Number of Connected Platforms', position: 'insideBottom', offset: -5 }}
                            />
                            <YAxis stroke="#9CA3AF" fontSize={12} />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                border: '1px solid rgba(249, 115, 22, 0.3)',
                                borderRadius: '8px',
                                color: '#E5E7EB'
                              }}
                                                             formatter={(value, name) => [
                                 `${value} users (${globalStats.distributionChartData.find((d: any) => d.users === value)?.percentage}%)`,
                                 'Users'
                               ]}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="users" 
                              stroke="#F97316" 
                              fill="url(#colorUsers)" 
                              strokeWidth={2}
                            />
                            <defs>
                              <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#F97316" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#F97316" stopOpacity={0.1}/>
                              </linearGradient>
                            </defs>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    
                    {/* Statistics Table */}
                    <div className="bg-gradient-to-br from-gray-800/50 via-gray-700/30 to-gray-800/50 backdrop-blur-sm border border-gray-500/20 rounded-xl p-6">
                      <h6 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                        📋 Detailed Statistics Table
                      </h6>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-500/20">
                              <th className="text-left py-3 px-4 text-gray-300 font-medium">Platform</th>
                              <th className="text-center py-3 px-4 text-gray-300 font-medium">Connected Users</th>
                              <th className="text-center py-3 px-4 text-gray-300 font-medium">Percentage</th>
                              <th className="text-center py-3 px-4 text-gray-300 font-medium">Growth</th>
                            </tr>
                          </thead>
                          <tbody>
                                                         {globalStats.platformChartData.map((platform: any, index: number) => (
                               <motion.tr 
                                 key={platform.name}
                                 initial={{ opacity: 0, x: -20 }}
                                 animate={{ opacity: 1, x: 0 }}
                                 transition={{ delay: index * 0.1 }}
                                 className="border-b border-gray-600/20 hover:bg-gray-700/20 transition-colors"
                               >
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xl">{platform.icon}</span>
                                    <span className="font-medium text-gray-200">{platform.name}</span>
                                  </div>
                                </td>
                                <td className="text-center py-3 px-4">
                                  <span className="font-bold text-white">{platform.value}</span>
                                </td>
                                <td className="text-center py-3 px-4">
                                  <span className="text-gray-300">
                                    {globalStats.totalUsers > 0 ? ((platform.value / globalStats.totalUsers) * 100).toFixed(1) : '0'}%
                                  </span>
                                  {/* Debug info - usuń po naprawie */}
                                  <div className="text-xs text-gray-500 mt-1">
                                    ({platform.value}/{globalStats.totalUsers})
                                  </div>
                                </td>
                                <td className="text-center py-3 px-4">
                                  <span className="text-green-400 text-xs bg-green-400/20 px-2 py-1 rounded-full">
                                    +{Math.floor(Math.random() * 15 + 5)}%
                                  </span>
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">📊</div>
                  <p className="text-blue-200 text-lg">Click refresh to load MySphere statistics</p>
                  <p className="text-blue-200/70 text-sm mt-2">See how our MySphere community is growing</p>
                </div>
              )}
            </motion.div>



            {/* Network Tools - Only on Home Tab */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.9 }}
              className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-6 mb-8"
            >
              <h3 className="text-2xl font-bold text-orange-200 mb-6 flex items-center gap-2">
                🛠️ Network Tools
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

        {/* Statistics Tab Content */}
        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-orange-200 flex items-center gap-2">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative">
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

                  {/* Preview Contracts */}
                  <div className="bg-gradient-to-br from-orange-600/20 via-orange-500/10 to-orange-800/20 backdrop-blur-sm border border-orange-500/30 rounded-xl p-6 grayscale">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-4xl opacity-50">📋</div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-orange-300/50">***</div>
                        <div className="text-sm text-orange-200/50">Contracts</div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                {/* Contracts */}
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
                      <div className="text-sm text-orange-200/70">Contracts</div>
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

        {/* NFTs Tab Content */}
        {activeTab === 'nfts' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="bg-black/30 backdrop-blur-sm border border-orange-500/20 rounded-2xl p-6 mb-8"
          >
            <h3 className="text-2xl font-bold text-orange-200 mb-6 flex items-center gap-2">
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







        {/* Camp Modal for Authentication */}
        <CampModal injectButton={false} />
      </div>

      {/* Portal Dropdown - Renders at document.body level */}
      {typeof window !== 'undefined' && socialDropdownOpen && createPortal(
        <motion.div
          initial={{ opacity: 0, y: -5, scaleY: 0.8, transformOrigin: 'top' }}
          animate={{ 
            opacity: 1, 
            y: 0,
            scaleY: 1
          }}
          exit={{ opacity: 0, y: -5, scaleY: 0.8 }}
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
            { key: 'twitter', name: 'Twitter', gradient: 'from-sky-500 to-blue-500' },
            { key: 'discord', name: 'Discord', gradient: 'from-indigo-500 to-purple-500' },
            { key: 'spotify', name: 'Spotify', gradient: 'from-green-500 to-emerald-500' },
            { key: 'tiktok', name: 'TikTok', gradient: 'from-pink-500 to-rose-500' },
            { key: 'telegram', name: 'Telegram', gradient: 'from-cyan-500 to-blue-500' }
                     ].map((social, index) => (
             <motion.button
               key={social.key}
               initial={{ opacity: 0, x: -20 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ delay: index * 0.05 }}
               disabled={true}
               className="w-full px-4 py-3 text-left transition-all duration-200 text-orange-200/50 cursor-not-allowed backdrop-blur-[1px] relative overflow-hidden"
             >
               <div className="flex items-center justify-between">
                 <span className="font-medium blur-[0.5px]">{social.name}</span>
                 <span className="text-xs text-orange-300/70 font-medium">
                   Soon
                 </span>
               </div>
               {/* Subtle overlay */}
               <div className="absolute inset-0 bg-black/20 pointer-events-none"></div>
             </motion.button>
           ))}
        </motion.div>,
        document.body
      )}
    </div>
  );
}