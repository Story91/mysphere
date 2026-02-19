// @ts-nocheck
'use client';

import { IdentityCard } from '@coinbase/onchainkit/identity';
import { useAccount } from 'wagmi';
import { base } from 'wagmi/chains';
import { useState, useEffect, useRef } from 'react';
import { calculateRanking, UserRank, RANK_DESCRIPTIONS, BADGES, Badge, BadgeInfo } from '../../utils/ranking';
import { InitialAnimation } from '../Animation/InitialAnimation';
import ClaimIdentityCard from './ClaimIdentityCard';

const COINBASE_VERIFIED_ACCOUNT_SCHEMA_ID = '0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9';
const BASESCAN_API_KEY = 'YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN';
const REFRESH_INTERVAL = 30000; // 30 sekund

// Cache configuration - separate cache for each data type
const CACHE_KEY_PREFIX = 'sphereIdentity_';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

// Point system explanation
const POINT_SYSTEM = {
  transactions: {
    base: 10,
    successful: 15, // 10 * 1.5
    highValue: 20, // 10 * 2.0
    description: 'Points for each transaction. Bonus for successful and high-value (>1 ETH) transactions.'
  },
  tokens: {
    points: 50,
    description: 'Points for each unique token held in your wallet.'
  },
  nfts: {
    points: 100,
    description: 'Points for each unique NFT in your collection.'
  },
  contracts: {
    points: 25,
    description: 'Points for interacting with unique smart contracts.'
  }
};

// Rank thresholds with descriptions
const RANK_INFO = [
  {
    rank: UserRank.NEWBIE,
    threshold: 0,
    description: 'Starting your journey on Base',
    color: 'text-gray-600 dark:text-gray-400'
  },
  {
    rank: UserRank.EXPLORER,
    threshold: 4_500,
    description: 'Exploring Base possibilities',
    color: 'text-orange-600 dark:text-orange-400'
  },
  {
    rank: UserRank.TRADER,
    threshold: 22_500,
    description: 'Actively trading on Base',
    color: 'text-yellow-600 dark:text-yellow-400'
  },
  {
    rank: UserRank.INVESTOR,
    threshold: 90_000,
    description: 'Long-term investing in Base',
    color: 'text-green-600 dark:text-green-400'
  },
  {
    rank: UserRank.WHALE,
    threshold: 225_000,
    description: 'Significant player on Base',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    rank: UserRank.LEGEND,
    threshold: 450_000,
    description: 'Creating Base history',
    color: 'text-purple-600 dark:text-purple-400'
  }
];

interface RankingStats {
  totalPoints: number;
  rank: UserRank;
  percentile: number;
  breakdown: {
    transactionPoints: number;
    tokenPoints: number;
    nftPoints: number;
    uniqueContractPoints: number;
  };
  stats: {
    transactions: number;
    tokens: number;
    nfts: number;
    contracts: number;
  };
}

function isRankLowerThanCurrent(rankToCheck: UserRank, currentRank: UserRank): boolean {
  const rankOrder = [
    UserRank.NEWBIE,
    UserRank.EXPLORER,
    UserRank.TRADER,
    UserRank.INVESTOR,
    UserRank.WHALE,
    UserRank.LEGEND
  ];
  
  const rankToCheckIndex = rankOrder.indexOf(rankToCheck);
  const currentRankIndex = rankOrder.indexOf(currentRank);
  
  return rankToCheckIndex < currentRankIndex;
}

function calculateProgressToNextRank(stats: RankingStats): number {
  // Znajdź indeks aktualnej rangi
  const currentRankIndex = RANK_INFO.findIndex(rank => rank.rank === stats.rank);
  
  // Jeśli jesteśmy na najwyższej randze, zwróć 100%
  if (currentRankIndex === RANK_INFO.length - 1) {
    return 100;
  }
  
  // Pobierz próg aktualnej rangi i próg następnej rangi
  const currentThreshold = RANK_INFO[currentRankIndex].threshold;
  const nextThreshold = RANK_INFO[currentRankIndex + 1].threshold;
  
  // Oblicz postęp między aktualną rangą a następną
  return calculateProgressBetweenRanks(stats.totalPoints, currentThreshold, nextThreshold);
}

function calculateProgressBetweenRanks(points: number, lowerThreshold: number, upperThreshold: number): number {
  // Oblicz dokładny procent postępu
  const progress = (points - lowerThreshold) / (upperThreshold - lowerThreshold) * 100;
  
  // Upewnij się, że wartość jest między 0 a 100
  return Math.min(100, Math.max(0, progress));
}

export default function IdentityComponent() {
  const { address } = useAccount();
  const [stats, setStats] = useState<RankingStats>({
    totalPoints: 0,
    rank: UserRank.NEWBIE,
    percentile: 0,
    breakdown: {
      transactionPoints: 0,
      tokenPoints: 0,
      nftPoints: 0,
      uniqueContractPoints: 0
    },
    stats: {
      transactions: 0,
      tokens: 0,
      nfts: 0,
      contracts: 0
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPointSystem, setShowPointSystem] = useState(false);
  const [showRankSystem, setShowRankSystem] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationData, setAnimationData] = useState<RankingStats | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetchingManually, setIsFetchingManually] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Progressive loading states with live counts
  const [loadingProgress, setLoadingProgress] = useState({
    transactions: false,
    tokens: false,
    nfts: false,
    contracts: false
  });

  const [liveDataCounts, setLiveDataCounts] = useState({
    transactions: 0,
    tokens: 0,
    nfts: 0,
    contracts: 0
  });

  const [dataStatus, setDataStatus] = useState({
    transactions: { loaded: false, error: null as string | null, timestamp: null as number | null },
    tokens: { loaded: false, error: null as string | null, timestamp: null as number | null },
    nfts: { loaded: false, error: null as string | null, timestamp: null as number | null },
    contracts: { loaded: false, error: null as string | null, timestamp: null as number | null }
  });

  // Track active timeouts to prevent background fetching
  const activeTimeouts = useRef<Set<NodeJS.Timeout>>(new Set());
  const isComponentMounted = useRef(true);
  const globalStopFlag = useRef(false);
  const hasInitialized = useRef(false);

  // Clear all active timeouts when component unmounts or data is complete
  useEffect(() => {
    isComponentMounted.current = true;
    globalStopFlag.current = false;
    
    return () => {
      console.log('🔄 COMPONENT UNMOUNTING - STOPPING ALL OPERATIONS');
      isComponentMounted.current = false;
      globalStopFlag.current = true;
      activeTimeouts.current.forEach(timeout => clearTimeout(timeout));
      activeTimeouts.current.clear();
    };
  }, []);

  // Clear timeouts when all data is loaded
  useEffect(() => {
    const allLoaded = Object.values(dataStatus).every(status => status.loaded);
    if (allLoaded && isComponentMounted.current) {
      console.log('🛑 ALL DATA LOADED - CLEARING ALL ACTIVE TIMEOUTS');
      console.log('📊 Final data status:', dataStatus);
      console.log('⏰ Active timeouts count:', activeTimeouts.current.size);
      globalStopFlag.current = true; // Stop all operations
      activeTimeouts.current.forEach(timeout => clearTimeout(timeout));
      activeTimeouts.current.clear();
    }
  }, [dataStatus]);

  // Debug log when dataStatus changes
  useEffect(() => {
    console.log('📊 Data Status Changed:', {
      transactions: dataStatus.transactions?.loaded ? '✅' : '❌',
      tokens: dataStatus.tokens?.loaded ? '✅' : '❌', 
      nfts: dataStatus.nfts?.loaded ? '✅' : '❌',
      contracts: dataStatus.contracts?.loaded ? '✅' : '❌',
      allLoaded: Object.values(dataStatus).every(status => status.loaded)
    });
  }, [dataStatus]);

  // Grupowanie odznak według kategorii
  const groupedBadges = {
    transactions: BADGES.filter(badge => badge.name.toString().startsWith('Transaction')),
    tokens: BADGES.filter(badge => badge.name.toString().startsWith('Token')),
    nfts: BADGES.filter(badge => badge.name.toString().startsWith('NFT')),
    contracts: BADGES.filter(badge => badge.name.toString().startsWith('Contract'))
  };

  // Dodajemy useEffect do obsługi montowania komponentu
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Cache functions for individual data types
  const getCacheKey = (address: string, dataType: string) => `${CACHE_KEY_PREFIX}${address}_${dataType}`;

  const loadFromCache = (address: string): RankingStats | null => {
    try {
      console.log('🔄 Checking cache for instant data loading...');
      setIsFetchingManually(true); // Show loading state immediately
      
      const now = Date.now();
      const cachedResults: {
        transactions: any[] | null,
        tokens: any[] | null,
        nfts: any[] | null,
        contracts: any[] | null
      } = {
        transactions: null,
        tokens: null,
        nfts: null,
        contracts: null
      };
      
      let hasAnyData = false;
      let latestTimestamp = 0;
      
      // Load each data type separately, but preserve already loaded status
      ['transactions', 'tokens', 'nfts', 'contracts'].forEach(dataType => {
        // Show loading indicator for cache check
        setLoadingProgress(prev => ({ ...prev, [dataType]: true }));
        
        // If already loaded, don't check cache - use existing data
        if (dataStatus[dataType as keyof typeof dataStatus]?.loaded) {
          console.log(`📋 ${dataType} already loaded, skipping cache check`);
          const cached = localStorage.getItem(getCacheKey(address, dataType));
          if (cached) {
            try {
              const { data } = JSON.parse(cached);
              cachedResults[dataType as keyof typeof cachedResults] = data;
              hasAnyData = true;
            } catch (e) {
              console.warn(`Failed to parse cached ${dataType}`);
            }
          }
          setLoadingProgress(prev => ({ ...prev, [dataType]: false }));
          return;
        }
        
        const cached = localStorage.getItem(getCacheKey(address, dataType));
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached);
            if (now - timestamp < CACHE_TTL) {
              cachedResults[dataType as keyof typeof cachedResults] = data;
              hasAnyData = true;
              latestTimestamp = Math.max(latestTimestamp, timestamp);
              
              // Update data status immediately with visual feedback
              setDataStatus(prev => ({
                ...prev,
                [dataType]: { loaded: true, error: null, timestamp }
              }));
              
              console.log(`📋 Loaded ${dataType} from cache: ${data?.length || 0} items`);
            } else {
              console.log(`🕰️ Cache expired for ${dataType}, will need to refresh`);
              // Only set as not loaded if it wasn't already loaded
              if (!dataStatus[dataType as keyof typeof dataStatus]?.loaded) {
                setDataStatus(prev => ({
                  ...prev,
                  [dataType]: { loaded: false, error: null, timestamp: null }
                }));
              }
            }
          } catch (e) {
            console.warn(`Failed to parse cache for ${dataType}`);
            // Only set error if it wasn't already loaded
            if (!dataStatus[dataType as keyof typeof dataStatus]?.loaded) {
              setDataStatus(prev => ({
                ...prev,
                [dataType]: { loaded: false, error: 'Cache parse error', timestamp: null }
              }));
            }
          }
        } else {
          console.log(`📋 No cache found for ${dataType}`);
          // Only set as not loaded if it wasn't already loaded
          if (!dataStatus[dataType as keyof typeof dataStatus]?.loaded) {
            setDataStatus(prev => ({
              ...prev,
              [dataType]: { loaded: false, error: null, timestamp: null }
            }));
          }
        }
        
        // Clear loading indicator after cache check
        setTimeout(() => {
          setLoadingProgress(prev => ({ ...prev, [dataType]: false }));
        }, 200); // Short delay to show the loading state
      });
      
      // Clear main loading state
      setTimeout(() => {
        setIsFetchingManually(false);
      }, 500);
      
      if (hasAnyData) {
        setLastFetchTime(latestTimestamp);
        
        // Reconstruct stats from cached data
        const stats = {
          stats: {
            transactions: cachedResults.transactions?.length || 0,
            tokens: cachedResults.tokens?.length || 0,
            nfts: cachedResults.nfts?.length || 0,
            contracts: cachedResults.contracts ? new Set(cachedResults.contracts.map((tx: any) => tx.to)).size : 0
          },
          totalPoints: 0,
          rank: 'NEWBIE' as any,
          percentile: 0,
          breakdown: {
            transactionPoints: 0,
            tokenPoints: 0,
            nftPoints: 0,
            uniqueContractPoints: 0
          }
        };
        
        // Recalculate points
        const rankingStats = calculateRanking(
          cachedResults.transactions || [],
          cachedResults.tokens || [],
          cachedResults.nfts || []
        );
        
        console.log(`✅ Successfully loaded cached data - ${Object.values(cachedResults).filter(d => d !== null).length}/4 categories`);
        return rankingStats;
      }
      
      console.log('📋 No valid cached data found');
      return null;
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
      setIsFetchingManually(false);
      return null;
    }
  };

  const saveToCache = (address: string, dataType: string, data: any) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      
      // Check if we have space - if not, clear old cache first
      const testKey = `test_${Date.now()}`;
      try {
        localStorage.setItem(testKey, JSON.stringify(cacheData));
        localStorage.removeItem(testKey);
      } catch (quotaError) {
        console.warn(`💾 Cache quota exceeded, clearing old cache for ${dataType}`);
        // Clear old cache entries for this address
        ['transactions', 'tokens', 'nfts', 'contracts'].forEach(type => {
          try {
            localStorage.removeItem(getCacheKey(address, type));
          } catch (e) {
            // Ignore errors
          }
        });
      }
      
      localStorage.setItem(getCacheKey(address, dataType), JSON.stringify(cacheData));
      
      // Update data status
      setDataStatus(prev => ({
        ...prev,
        [dataType]: { loaded: true, error: null, timestamp: cacheData.timestamp }
      }));
      
    } catch (error) {
      console.warn(`Failed to save ${dataType} to cache:`, error);
      // Don't fail the whole process if cache fails
    }
  };

  // Advanced parallel fetch with automatic retry logic
  const fetchDataWithRetry = async (dataType: string, maxRetries = 3): Promise<any[] | null> => {
    if (!address || globalStopFlag.current || !isComponentMounted.current) {
      console.log(`🛑 ${dataType}: Stopped before starting`);
      return null;
    }
    
    let retryCount = 0;
    let url = '';
    let label = '';
    
    switch (dataType) {
      case 'transactions':
        url = `https://api.basescan.org/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${BASESCAN_API_KEY}`;
        label = '📡 Transactions';
        break;
      case 'tokens':
        url = `https://api.basescan.org/api?module=account&action=tokentx&address=${address}&apikey=${BASESCAN_API_KEY}`;
        label = '🪙 Tokens';
        break;
      case 'nfts':
        url = `https://api.basescan.org/api?module=account&action=tokennfttx&address=${address}&apikey=${BASESCAN_API_KEY}`;
        label = '🎨 NFTs';
        break;
      default:
        return null;
    }

    while (retryCount <= maxRetries) {
      // Check if stopped before each attempt
      if (globalStopFlag.current || !isComponentMounted.current) {
        console.log(`🛑 ${label}: Stopped during retry ${retryCount}`);
        return null;
      }
      
      try {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000); // Exponential backoff: 1s, 2s, 4s, 8s max
        
        if (retryCount > 0) {
          console.log(`🔄 ${label}: Retry ${retryCount}/${maxRetries} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Check if stopped during delay
          if (globalStopFlag.current || !isComponentMounted.current) {
            console.log(`🛑 ${label}: Stopped during retry delay`);
            return null;
          }
        } else {
          console.log(`🚀 ${label}: Starting fetch`);
        }

        setLoadingProgress(prev => ({ ...prev, [dataType]: true }));
        
        const response = await fetch(url, { 
          signal: AbortSignal.timeout(25000) // 25 second timeout
        });
        
        // Check if stopped after request
        if (globalStopFlag.current || !isComponentMounted.current) {
          console.log(`🛑 ${label}: Stopped after request`);
          setLoadingProgress(prev => ({ ...prev, [dataType]: false }));
          return null;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.status === '1' && data.result) {
          // Update live count immediately
          setLiveDataCounts(prev => ({ 
            ...prev, 
            [dataType]: data.result.length 
          }));
          
          saveToCache(address, dataType, data.result);
          setDataStatus(prev => ({
            ...prev,
            [dataType]: { loaded: true, error: null, timestamp: Date.now() }
          }));
          console.log(`✅ ${label}: ${data.result.length} items loaded`);
          return data.result;
        } else if (data.message === 'No transactions found' || data.message === 'No token transfers found' || data.message === 'No NFT transfers found') {
          // Empty result is valid
          setLiveDataCounts(prev => ({ 
            ...prev, 
            [dataType]: 0 
          }));
          
          saveToCache(address, dataType, []);
          setDataStatus(prev => ({
            ...prev,
            [dataType]: { loaded: true, error: null, timestamp: Date.now() }
          }));
          console.log(`✅ ${label}: No items found (valid)`);
          return [];
        } else {
          throw new Error(data.message || 'API returned error');
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ ${label}: Attempt ${retryCount + 1} failed:`, errorMessage);
        
        // Check if stopped during error handling
        if (globalStopFlag.current || !isComponentMounted.current) {
          console.log(`🛑 ${label}: Stopped during error handling`);
          setLoadingProgress(prev => ({ ...prev, [dataType]: false }));
          return null;
        }
        
        // Set error status immediately for UI feedback
        setDataStatus(prev => ({
          ...prev,
          [dataType]: { 
            loaded: false, 
            error: `Attempt ${retryCount + 1}/${maxRetries + 1}: ${errorMessage}`, 
            timestamp: null 
          }
        }));
        
        retryCount++;
        
        if (retryCount > maxRetries) {
          setDataStatus(prev => ({
            ...prev,
            [dataType]: { 
              loaded: false, 
              error: `Failed after ${maxRetries + 1} attempts: ${errorMessage}`, 
              timestamp: null 
            }
          }));
          return null;
        }
      } finally {
        setLoadingProgress(prev => ({ ...prev, [dataType]: false }));
      }
    }
    
    return null;
  };

  // Smart parallel fetch with automatic retry
  const fetchDataProgressively = async (retryTypes: string[] = ['transactions', 'tokens', 'nfts', 'contracts']) => {
    if (!address || isFetchingManually || !isComponentMounted.current || globalStopFlag.current) {
      console.log('⏸️ Skipping fetch - no address, already fetching, unmounted, or stopped');
      return;
    }
    
    // CRITICAL: Double-check if all data is actually loaded
    const currentStatus = {
      transactions: dataStatus.transactions?.loaded || false,
      tokens: dataStatus.tokens?.loaded || false,
      nfts: dataStatus.nfts?.loaded || false,
      contracts: dataStatus.contracts?.loaded || false
    };
    
    const allLoaded = Object.values(currentStatus).every(loaded => loaded);
    if (allLoaded) {
      console.log('✅ ALL DATA ALREADY LOADED - STOPPING ALL FETCH ATTEMPTS');
      console.log('📊 Current status:', currentStatus);
      globalStopFlag.current = true;
      return;
    }
    
    // Check if stopped during execution
    if (globalStopFlag.current || !isComponentMounted.current) {
      console.log('🛑 Operation stopped during execution');
      return;
    }
    
    // Check if all requested types are already loaded
    const alreadyLoaded = retryTypes.filter(type => currentStatus[type as keyof typeof currentStatus]);
    const needsRefresh = retryTypes.filter(type => !currentStatus[type as keyof typeof currentStatus]);
    
    if (needsRefresh.length === 0) {
      console.log('✅ All requested data types already loaded, skipping fetch');
      console.log('📊 Requested:', retryTypes, 'Already loaded:', alreadyLoaded);
      return;
    }
    
    console.log('🔄 FETCH DECISION:');
    console.log('  - Requested types:', retryTypes);
    console.log('  - Already loaded:', alreadyLoaded);
    console.log('  - Needs refresh:', needsRefresh);
    console.log('  - Current status:', currentStatus);
    
    setIsFetchingManually(true);
    setFetchError(null);
    
    console.log(`🔄 Starting smart parallel data fetch for: (${needsRefresh.length}) [${needsRefresh.join(', ')}]`);
    if (alreadyLoaded.length > 0) {
      console.log(`📋 Already loaded: [${alreadyLoaded.join(', ')}]`);
    }
    
    const results: {
      transactions: any[] | null,
      tokens: any[] | null,
      nfts: any[] | null,
      contracts: any[] | null
    } = {
      transactions: null,
      tokens: null,
      nfts: null,
      contracts: null
    };
    
    // Load existing cache data first for all types
    ['transactions', 'tokens', 'nfts', 'contracts'].forEach(dataType => {
      if (dataStatus[dataType as keyof typeof dataStatus]?.loaded) {
        const cached = localStorage.getItem(getCacheKey(address, dataType));
        if (cached) {
          try {
            const { data } = JSON.parse(cached);
            results[dataType as keyof typeof results] = data;
            console.log(`📋 Using cached ${dataType}: ${data?.length || 0} items`);
          } catch (e) {
            console.warn(`Failed to load cached ${dataType}`);
          }
        }
      }
    });

    // Check if stopped before API calls
    if (globalStopFlag.current || !isComponentMounted.current) {
      console.log('🛑 Operation stopped before API calls');
      setIsFetchingManually(false);
      return;
    }

    // Filter API types only (not contracts) that actually need fetching
    const apiTypes = needsRefresh.filter(type => type !== 'contracts');
    
    if (apiTypes.length === 0 && needsRefresh.includes('contracts')) {
      // Only contracts needs refresh, but it depends on transactions
      if (results.transactions) {
        const uniqueContracts = new Set(results.transactions.map((tx: any) => tx.to)).size;
        results.contracts = results.transactions;
        saveToCache(address, 'contracts', results.transactions);
        console.log(`✅ 🏗️ Contracts: ${uniqueContracts} unique contracts derived from cached transactions`);
      }
    } else if (apiTypes.length > 0) {
      // Start parallel API calls with staggered timing to avoid rate limits
      const promises = apiTypes.map(async (dataType, index) => {
        // Check if stopped before each API call
        if (globalStopFlag.current || !isComponentMounted.current) {
          console.log(`🛑 Stopping ${dataType} fetch - component stopped`);
          return { dataType, result: null };
        }
        
        // Stagger start times by 500ms to avoid overwhelming the API
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, index * 500));
        }
        
        // Check again after delay
        if (globalStopFlag.current || !isComponentMounted.current) {
          console.log(`🛑 Stopping ${dataType} fetch after delay - component stopped`);
          return { dataType, result: null };
        }
        
        return { dataType, result: await fetchDataWithRetry(dataType) };
      });

      // Wait for all API calls to complete (or fail)
      const apiResults = await Promise.allSettled(promises);
      
      // Check if stopped after API calls
      if (globalStopFlag.current || !isComponentMounted.current) {
        console.log('🛑 Operation stopped after API calls');
        setIsFetchingManually(false);
        return;
      }
      
      // Process API results
      apiResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { dataType, result: data } = result.value;
          results[dataType as keyof typeof results] = data;
        }
      });

      // Handle contracts (derived from transactions)
      if (needsRefresh.includes('contracts')) {
        if (results.transactions) {
          const uniqueContracts = new Set(results.transactions.map((tx: any) => tx.to)).size;
          results.contracts = results.transactions;
          saveToCache(address, 'contracts', results.transactions);
          console.log(`✅ 🏗️ Contracts: ${uniqueContracts} unique contracts derived`);
        } else {
          console.warn(`⚠️ Cannot derive contracts without transaction data`);
        }
      }
    }
    
    // Final check before completing
    if (globalStopFlag.current || !isComponentMounted.current) {
      console.log('🛑 Operation stopped before completion');
      setIsFetchingManually(false);
      return;
    }
    
    // Calculate final ranking with all available data
    try {
      const rankingStats = calculateRanking(
        results.transactions || [],
        results.tokens || [],
        results.nfts || []
      );

      setStats(rankingStats);
      setLastFetchTime(Date.now());
      
      const successCount = Object.values(results).filter(data => data !== null).length;
      console.log(`✅ Smart fetch completed: ${successCount}/4 categories loaded`);
      
      // IMPORTANT: Stop all auto-retry if we have all data
      const finalStatus = {
        transactions: dataStatus.transactions?.loaded || results.transactions !== null,
        tokens: dataStatus.tokens?.loaded || results.tokens !== null,
        nfts: dataStatus.nfts?.loaded || results.nfts !== null,
        contracts: dataStatus.contracts?.loaded || results.contracts !== null
      };
      
      const finalAllLoaded = Object.values(finalStatus).every(loaded => loaded);
      if (finalAllLoaded) {
        console.log('🎉 ALL DATA NOW LOADED - NO MORE AUTO-RETRY');
        globalStopFlag.current = true;
        setIsFetchingManually(false);
        return;
      }
      
      // Check if there are still missing types, but DON'T auto-retry if we just fetched them
      const stillMissing = getMissingDataTypes();
      if (stillMissing.length > 0 && stillMissing.length < 4 && !globalStopFlag.current && isComponentMounted.current) {
        // Only auto-retry if the missing types are different from what we just tried
        const newMissingTypes = stillMissing.filter(type => !needsRefresh.includes(type));
        if (newMissingTypes.length > 0) {
          console.log(`🔄 Auto-retrying newly failed types in 5 seconds:`, newMissingTypes);
          
          const timeoutId = setTimeout(() => {
            // Remove this timeout from active set
            activeTimeouts.current.delete(timeoutId);
            
            // Triple check before retrying
            if (globalStopFlag.current || !isComponentMounted.current) {
              console.log('🛑 CANCELLING AUTO-RETRY - Component stopped or unmounted');
              return;
            }
            
            const recheckStatus = {
              transactions: dataStatus.transactions?.loaded || false,
              tokens: dataStatus.tokens?.loaded || false,
              nfts: dataStatus.nfts?.loaded || false,
              contracts: dataStatus.contracts?.loaded || false
            };
            const recheckAllLoaded = Object.values(recheckStatus).every(loaded => loaded);
            
            if (recheckAllLoaded) {
              console.log('🛑 CANCELLING AUTO-RETRY - All data is now loaded');
              globalStopFlag.current = true;
              return;
            }
            
            if (!isFetchingManually) { // Don't retry if user manually triggered another fetch
              fetchDataProgressively(newMissingTypes);
            }
          }, 5000);
          
          // Track this timeout
          activeTimeouts.current.add(timeoutId);
        } else {
          console.log(`⏸️ Not auto-retrying - just attempted these types:`, needsRefresh);
        }
      }
      
    } catch (error) {
      console.error('❌ Error calculating ranking:', error);
      setFetchError('Failed to calculate ranking from fetched data');
    } finally {
      setIsFetchingManually(false);
    }
  };

  // Get missing data types
  const getMissingDataTypes = () => {
    return Object.entries(dataStatus)
      .filter(([_, status]) => !status.loaded)
      .map(([dataType, _]) => dataType);
  };

  // Manual fetch function - now calls progressive fetch
  const fetchDataManually = async (showLoading = true) => {
    // Clear any pending timeouts first
    activeTimeouts.current.forEach(timeout => clearTimeout(timeout));
    activeTimeouts.current.clear();
    
    // Reset global stop flag for manual refresh
    globalStopFlag.current = false;
    
    const missingTypes = getMissingDataTypes();
    if (missingTypes.length === 0) {
      console.log('🔄 Manual refresh requested - refreshing all data');
      
      // ONLY reset status if user explicitly wants to refresh all data
      const userConfirmed = window.confirm('All data is already loaded. Do you want to force refresh all data?');
      if (!userConfirmed) {
        console.log('❌ User cancelled manual refresh');
        return;
      }
      
      // Clear current status to force refresh
      setDataStatus({
        transactions: { loaded: false, error: null, timestamp: null },
        tokens: { loaded: false, error: null, timestamp: null },
        nfts: { loaded: false, error: null, timestamp: null },
        contracts: { loaded: false, error: null, timestamp: null }
      });
      
      // Wait a bit for state to update
      const timeoutId = setTimeout(() => {
        activeTimeouts.current.delete(timeoutId);
        if (!globalStopFlag.current && isComponentMounted.current) {
          fetchDataProgressively(['transactions', 'tokens', 'nfts', 'contracts']);
        }
      }, 100);
      activeTimeouts.current.add(timeoutId);
    } else {
      console.log('🔄 Manual refresh requested - fetching missing types:', missingTypes);
      // Only fetch missing data
      await fetchDataProgressively(missingTypes);
    }
  };

  useEffect(() => {
    async function initializeData() {
      if (!address || !isMounted || hasInitialized.current) {
        console.log('⏸️ Skipping initialization - no address, not mounted, or already initialized');
        return;
      }
      
      hasInitialized.current = true;
      console.log('🚀 Initializing Sphere Identity data...');
      
      // Try to load from cache first
      const cachedData = loadFromCache(address);
      if (cachedData) {
        console.log('📋 Loaded Sphere Identity from cache');
        setStats(cachedData);
        return;
      }
      
      // No cache - show manual refresh button
      console.log('💡 No cached data - ready for manual refresh');
    }

    initializeData();
  }, [address, isMounted]); // Remove dataStatus from dependencies to prevent loops

  // Reset initialization flag when address changes
  useEffect(() => {
    hasInitialized.current = false;
    globalStopFlag.current = false;
  }, [address]);

  useEffect(() => {
    if (!isMounted) return;
    
    const hasSeenAnimation = localStorage.getItem(`sphere-animation-${address}`);
    if (hasSeenAnimation) {
      setShowAnimation(false);
    }
  }, [address, isMounted]);

  // Function to color the rank
  const getRankColor = (rank: UserRank) => {
    switch (rank) {
      case UserRank.LEGEND:
        return 'text-purple-600 dark:text-purple-400';
      case UserRank.WHALE:
        return 'text-blue-600 dark:text-blue-400';
      case UserRank.INVESTOR:
        return 'text-green-600 dark:text-green-400';
      case UserRank.TRADER:
        return 'text-yellow-600 dark:text-yellow-400';
      case UserRank.EXPLORER:
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Calculate earned badges
  const earnedBadges = BADGES.filter(badge => badge.condition(stats));

  // Handle NFT claiming
  const handleClaim = async () => {
    if (!address || isClaiming) return;
    
    setIsClaiming(true);
    try {
      // TODO: Implement NFT claiming logic based on BaseFulLM docs
      console.log('Claiming Sphere Identity NFT for:', address);
      
      // Simulate claiming process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Here you would integrate with your NFT contract
      // Example: await claimSphereIdentityNFT(address, stats);
      
      alert('Sphere Identity NFT claimed successfully!');
    } catch (error) {
      console.error('Error claiming NFT:', error);
      alert('Failed to claim NFT. Please try again.');
    } finally {
      setIsClaiming(false);
    }
  };

  // Jeśli komponent nie jest zamontowany, zwracamy pusty div
  if (!isMounted) {
    return <div></div>;
  }

  return (
    <>
      {showAnimation && animationData ? (
        <InitialAnimation
          stats={animationData}
          earnedBadges={BADGES.filter(badge => badge.condition(animationData))}
          address={address || ''}
          onComplete={() => {
            setShowAnimation(false);
            setAnimationData(null);
          }}
        />
      ) : (
        <div className="w-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl shadow-2xl p-2 sm:p-6 border border-gray-700/50 backdrop-blur-xl relative overflow-hidden">
          {/* Efekt świetlny w tle */}
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-gradient-to-r from-blue-500/10 to-purple-600/10 rounded-full filter blur-3xl"></div>
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-500/10 rounded-full filter blur-3xl"></div>
          
          {/* Struktura siatki */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(6,24,44,0.05)_0.5px,transparent_0.5px),linear-gradient(90deg,rgba(6,24,44,0.05)_0.5px,transparent_0.5px)] bg-[size:20px_20px] opacity-30"></div>
          
          <div className="flex items-center justify-between gap-2 mb-4 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00A3FF] flex items-center justify-center shadow-lg shadow-[#0052FF]/20">
              <img 
                src="/favicon_io (1)/apple-touch-icon.png" 
                alt="Sphere Logo" 
                className="w-6 h-6"
              />
              </div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Sphere Identity</h2>
            </div>
          </div>
          
          {!address ? (
            <div className="text-center py-10 backdrop-blur-sm bg-black/20 rounded-xl border border-gray-800">
              <div className="text-gray-400 mb-4">
                Connect wallet to view your profile
              </div>
              <div className="w-24 h-24 bg-gradient-to-br from-gray-800 to-gray-700 rounded-full mx-auto mb-4 animate-pulse"></div>
              <div className="h-4 w-32 bg-gradient-to-r from-gray-700 to-gray-800 rounded mx-auto mb-2 animate-pulse"></div>
              <div className="h-3 w-48 bg-gradient-to-r from-gray-800 to-gray-700 rounded mx-auto animate-pulse"></div>
            </div>
          ) : (
            <div className="space-y-6 relative z-10">
              {/* Panel nawigacyjny */}
              <div className="flex flex-wrap gap-2 p-1 bg-gray-800/50 backdrop-blur-md rounded-lg border border-gray-700/50 mb-6">
                <button 
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'overview' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Overview
                </button>
                <button 
                  onClick={() => setActiveTab('badges')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'badges' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Badges
                </button>
                <button 
                  onClick={() => setActiveTab('stats')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'stats' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Statistics
                </button>
                <button 
                  onClick={() => setActiveTab('ranks')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'ranks' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Ranks
                </button>
                <button 
                  onClick={() => setActiveTab('details')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'details' 
                      ? 'bg-gradient-to-r from-[#0052FF] to-[#00A3FF] text-white shadow-lg' 
                      : 'text-gray-300 hover:bg-gray-700/70'
                  }`}
                >
                  Details
                </button>
                <button 
                  onClick={() => setActiveTab('claim')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all relative ${
                    activeTab === 'claim' 
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25' 
                      : 'text-gray-300 hover:bg-purple-700/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/20'
                  }`}
                >
                  <span className="relative z-10">Claim Identity</span>
                  {activeTab !== 'claim' && (
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 rounded-lg animate-pulse"></div>
                  )}
                </button>
              </div>

              {/* Manual Refresh Section */}
              <div className="bg-gradient-to-r from-gray-800/50 to-gray-900/50 backdrop-blur-md rounded-xl p-4 border border-gray-700/50 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-white font-medium mb-1">Blockchain Data Status</h3>
                    <div className="flex items-center gap-4 text-sm">
                      {lastFetchTime ? (
                        <span className="text-green-400">
                          ✅ Last updated: {new Date(lastFetchTime).toLocaleTimeString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">
                          📋 No data cached - click Refresh to load
                        </span>
                      )}
                      <span className="text-blue-400">
                        💾 Smart parallel fetch with auto-retry
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchDataManually()}
                      disabled={isFetchingManually}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        isFetchingManually
                          ? 'bg-gray-600 cursor-not-allowed opacity-50'
                          : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 shadow-lg hover:shadow-blue-500/25'
                      } text-white flex items-center gap-2`}
                    >
                      {isFetchingManually ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Loading...</span>
                        </>
                      ) : (
                        <>
                          🔄 <span>Refresh Stats</span>
                        </>
                      )}
                    </button>
                    
                    {/* Retry Missing Data Button */}
                    {(() => {
                      const missingTypes = getMissingDataTypes();
                      return missingTypes.length > 0 && missingTypes.length < 4 ? (
                        <button
                          onClick={() => fetchDataProgressively(missingTypes)}
                          disabled={isFetchingManually}
                          className={`px-3 py-2 rounded-lg font-medium transition-all ${
                            isFetchingManually
                              ? 'bg-gray-600 cursor-not-allowed opacity-50'
                              : 'bg-orange-600 hover:bg-orange-700 hover:scale-105'
                          } text-white text-sm`}
                        >
                          ⚡ Retry Missing ({missingTypes.length})
                        </button>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* Enhanced Data Status Indicators with Progress */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  {Object.entries(dataStatus).map(([dataType, status]) => {
                    // Real-time status calculation
                    const isCurrentlyLoading = loadingProgress[dataType as keyof typeof loadingProgress];
                    const hasData = status.loaded;
                    const hasError = status.error && !hasData;
                    const isPending = !hasData && !hasError && !isCurrentlyLoading;
                    
                    // Calculate data count for display
                    let dataCount = 0;
                    if (hasData && dataType === 'transactions') dataCount = stats.stats.transactions;
                    if (hasData && dataType === 'tokens') dataCount = stats.stats.tokens;
                    if (hasData && dataType === 'nfts') dataCount = stats.stats.nfts;
                    if (hasData && dataType === 'contracts') dataCount = stats.stats.contracts;
                    
                    return (
                      <div 
                        key={dataType}
                        className={`p-3 rounded-lg border transition-all duration-300 ${
                          isCurrentlyLoading
                            ? 'bg-blue-500/20 border-blue-500/50 shadow-lg shadow-blue-500/20 scale-[1.02]'
                            : hasData 
                              ? 'bg-green-500/20 border-green-500/50 shadow-lg shadow-green-500/10'
                              : hasError
                                ? 'bg-red-500/20 border-red-500/50 shadow-lg shadow-red-500/10'
                                : 'bg-gray-500/20 border-gray-500/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {isCurrentlyLoading ? (
                              <div className="relative">
                                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-400 border-t-transparent"></div>
                                <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-pulse"></div>
                              </div>
                            ) : hasData ? (
                              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center animate-pulse">
                                <span className="text-white text-xs font-bold">✓</span>
                              </div>
                            ) : hasError ? (
                              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
                                <span className="text-white text-xs font-bold">✗</span>
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-500 flex items-center justify-center">
                                <span className="text-white text-xs">⏳</span>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium capitalize text-sm ${
                                  isCurrentlyLoading
                                    ? 'text-blue-300'
                                    : hasData 
                                      ? 'text-green-300'
                                      : hasError
                                        ? 'text-red-300'
                                        : 'text-gray-300'
                                }`}>
                                  {dataType}
                                </span>
                                {isCurrentlyLoading && (
                                  <div className="px-2 py-1 rounded-full bg-blue-500/30 text-blue-200 text-xs font-medium animate-pulse">
                                    Loading...
                                  </div>
                                )}
                                {hasData && (
                                  <div className="px-2 py-1 rounded-full bg-green-500/30 text-green-200 text-xs font-medium">
                                    {dataCount.toLocaleString()} items
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {hasError && (
                              <p className="text-red-400 text-xs mt-1 truncate" title={status.error || undefined}>
                                {status.error}
                              </p>
                            )}
                            
                            {hasData && status.timestamp && (
                              <p className="text-gray-400 text-xs mt-1">
                                ✅ Loaded at {new Date(status.timestamp).toLocaleTimeString()}
                              </p>
                            )}
                            
                            {isCurrentlyLoading && (
                              <p className="text-blue-400 text-xs mt-1 animate-pulse">
                                🔄 Fetching from API...
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {/* Enhanced progress bar for loading states */}
                        {isCurrentlyLoading && (
                          <div className="mt-3 w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500 rounded-full animate-pulse"></div>
                          </div>
                        )}
                        
                        {/* Success indicator */}
                        {hasData && (
                          <div className="mt-2 w-full h-1 bg-green-500/30 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Enhanced Overall Status Summary */}
                <div className="mt-4 p-4 bg-black/30 rounded-lg border border-gray-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full transition-all duration-300 ${
                        isFetchingManually ? 'bg-blue-500 animate-pulse scale-110' :
                        Object.values(dataStatus).every(s => s.loaded) ? 'bg-green-500 animate-pulse' :
                        Object.values(dataStatus).some(s => s.error) ? 'bg-red-500 animate-pulse' :
                        'bg-gray-500'
                      }`}></div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-200">
                          {isFetchingManually ? '🔄 Fetching blockchain data...' :
                           Object.values(dataStatus).every(s => s.loaded) ? '✅ All data successfully loaded' :
                           Object.values(dataStatus).some(s => s.error) ? '⚠️ Some data failed to load' :
                           '⏸️ Ready to fetch data'}
                        </span>
                        {isFetchingManually && (
                          <span className="text-xs text-blue-400 animate-pulse">
                            Smart parallel fetch with auto-retry active
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-sm font-medium text-gray-300">
                        {Object.values(dataStatus).filter(s => s.loaded).length}/4 complete
                      </div>
                      <div className="text-xs text-gray-400">
                        {((Object.values(dataStatus).filter(s => s.loaded).length / 4) * 100).toFixed(0)}% done
                      </div>
                    </div>
                  </div>
                  
                  {/* Overall progress bar */}
                  <div className="mt-3 w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        Object.values(dataStatus).every(s => s.loaded) 
                          ? 'bg-gradient-to-r from-green-500 to-emerald-400' 
                          : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                      }`}
                      style={{ 
                        width: `${(Object.values(dataStatus).filter(s => s.loaded).length / 4) * 100}%` 
                      }}
                    ></div>
                  </div>
                  
                  {/* Real-time stats when data is loaded */}
                  {Object.values(dataStatus).every(s => s.loaded) && (
                    <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                      <span>📊 {stats.totalPoints.toLocaleString()} total points</span>
                      <span>🏆 Rank: {stats.rank}</span>
                      <span>⏱️ Last update: {lastFetchTime ? new Date(lastFetchTime).toLocaleTimeString() : 'Never'}</span>
                    </div>
                  )}
                </div>

                {fetchError && (
                  <div className="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <div className="text-red-400 text-sm font-medium">System Error:</div>
                    <div className="text-red-300 text-sm">{fetchError}</div>
                  </div>
                )}
              </div>

              {/* Główna sekcja karty */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Karta tożsamości zawsze widoczna */}
                <div className="w-full bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all shadow-lg">
                  <IdentityCard
                    address={address}
                    chain={base}
                  />
                  
                  {/* Rank display */}
                  <div className="mt-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 backdrop-blur-lg p-4 rounded-xl border border-blue-900/20">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-gray-400 text-xs uppercase tracking-wider">Your rank</h4>
                        <h3 className={`text-xl font-bold ${getRankColor(stats.rank)}`}>{stats.rank}</h3>
                      </div>
                      <div className="text-right">
                        <h4 className="text-gray-400 text-xs uppercase tracking-wider">Points</h4>
                        <h3 className="text-lg font-medium text-blue-400">{stats.totalPoints.toLocaleString()}</h3>
                      </div>
                    </div>

                    <div className="mt-2 w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                        style={{ 
                          width: `${calculateProgressToNextRank(stats)}%`,
                          transition: 'width 1s ease-in-out'
                        }}
                      ></div>
                    </div>
                    <p className="mt-1 text-xs text-gray-400 text-right">{calculateProgressToNextRank(stats).toFixed(1)}% progress to next rank</p>
                  </div>
                </div>
                
                {/* Treść zmieniająca się w zależności od zakładki */}
                <div className="w-full">
                  {/* Kontener z ustaloną minimalną wysokością */}
                  <div className="relative min-h-[450px]">
                    {/* Przegląd */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'overview' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg">
                        <h3 className="text-lg font-medium text-white mb-4">Your Progress</h3>
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Transactions</span>
                              <span className="text-white">{stats.stats.transactions}</span>
                            </div>
                            <div className="mt-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" style={{ 
                                width: `${Math.min(100, stats.stats.transactions / 50 * 100)}%` 
                              }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Tokens</span>
                              <span className="text-white">{stats.stats.tokens}</span>
                            </div>
                            <div className="mt-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-green-500 to-teal-500 rounded-full" style={{ width: `${Math.min(100, stats.stats.tokens / 10 * 100)}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">NFTs</span>
                              <span className="text-white">{stats.stats.nfts}</span>
                            </div>
                            <div className="mt-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-pink-500 to-red-500 rounded-full" style={{ width: `${Math.min(100, stats.stats.nfts / 5 * 100)}%` }}></div>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">Contracts</span>
                              <span className="text-white">{stats.stats.contracts}</span>
                            </div>
                            <div className="mt-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${Math.min(100, stats.stats.contracts / 10 * 100)}%` }}></div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-4">
                          <h4 className="text-gray-300 text-sm font-medium mb-2">Recent Badges</h4>
                          <div className="flex flex-wrap gap-2">
                            {earnedBadges.slice(0, 3).map((badge, index) => (
                              <div 
                                key={index}
                                className="bg-gradient-to-r from-gray-800 to-gray-900 p-2 rounded-lg border border-gray-700 flex items-center gap-2 group hover:border-blue-500/50 transition-all"
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-r ${
                                  badge.glowIntensity >= 5 ? 'from-blue-500 to-purple-500' :
                                  badge.glowIntensity >= 3 ? 'from-cyan-500 to-blue-500' :
                                  'from-teal-500 to-cyan-500'
                                }`}>
                                  <span className="text-white text-xs">{badge.glowIntensity}</span>
                                </div>
                                <div>
                                  <p className="text-xs text-white font-medium">{badge.name.toString()}</p>
                                  <p className="text-xs text-gray-400">{badge.title}</p>
                                </div>
                              </div>
                            ))}
                            {earnedBadges.length > 3 && (
                              <button 
                                onClick={() => setActiveTab('badges')}
                                className="px-3 py-2 rounded-lg text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all"
                              >
                                +{earnedBadges.length - 3} more
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Odznaki */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'badges' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg overflow-y-auto">
                        <h3 className="text-lg font-medium text-white mb-4">Your Badges</h3>
                        <div className="space-y-6">
                          {Object.entries(groupedBadges).map(([category, badges]) => (
                            <div key={category} className="space-y-2">
                              <h4 className="text-gray-300 text-sm font-medium capitalize">
                                {category === 'transactions' ? 'Transactions' : 
                                category === 'tokens' ? 'Tokens' : 
                                category === 'nfts' ? 'NFTs' : 'Contracts'}
                              </h4>
                              <div className="grid grid-cols-2 gap-2">
                                {badges.map((badge, index) => {
                                  const earned = badge.condition(stats);
                                  return (
                                    <div 
                                      key={index}
                                      className={`p-3 rounded-lg border ${
                                        earned 
                                          ? 'bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-blue-500/30' 
                                          : 'bg-gray-900/30 border-gray-800/30 opacity-50'
                                      } flex items-center gap-3 group transition-all`}
                                    >
                                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                        earned ? `bg-gradient-to-r ${
                                          badge.glowIntensity >= 5 ? 'from-blue-500 to-purple-500' :
                                          badge.glowIntensity >= 3 ? 'from-cyan-500 to-blue-500' :
                                          'from-teal-500 to-cyan-500'
                                        }` : 'bg-gray-800'
                                      }`}>
                                        <span className="text-white text-sm font-bold">{badge.glowIntensity}</span>
                                      </div>
                                      <div>
                                        <p className={`text-sm ${earned ? 'text-white' : 'text-gray-500'} font-medium`}>{badge.title}</p>
                                        <p className="text-xs text-gray-400">{badge.description}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {/* Statystyki */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'stats' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg overflow-y-auto">
                        <h3 className="text-lg font-medium text-white mb-4">Detailed Statistics</h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                              <p className="text-gray-400 text-xs">Transactions</p>
                              <p className="text-xl font-bold text-white">{stats.stats.transactions}</p>
                              <p className="text-xs text-blue-400">{stats.breakdown.transactionPoints.toLocaleString()} points</p>
                            </div>
                            <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                              <p className="text-gray-400 text-xs">Unique Tokens</p>
                              <p className="text-xl font-bold text-white">{stats.stats.tokens}</p>
                              <p className="text-xs text-blue-400">{stats.breakdown.tokenPoints.toLocaleString()} points</p>
                            </div>
                            <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                              <p className="text-gray-400 text-xs">NFT Collection</p>
                              <p className="text-xl font-bold text-white">{stats.stats.nfts}</p>
                              <p className="text-xs text-blue-400">{stats.breakdown.nftPoints.toLocaleString()} points</p>
                            </div>
                            <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                              <p className="text-gray-400 text-xs">Unique Contracts</p>
                              <p className="text-xl font-bold text-white">{stats.stats.contracts}</p>
                              <p className="text-xs text-blue-400">{stats.breakdown.uniqueContractPoints.toLocaleString()} points</p>
                            </div>
                          </div>
                          
                          <div className="p-4 bg-gradient-to-br from-blue-900/20 to-blue-900/10 rounded-lg border border-blue-900/20">
                            <div className="flex justify-between">
                              <p className="text-gray-300">Total points:</p>
                              <p className="text-xl font-bold text-white">{stats.totalPoints.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Ranks */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'ranks' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg overflow-y-auto">
                        <h3 className="text-lg font-medium text-white mb-4">Rank System</h3>
                        
                        <div className="space-y-3">
                          {RANK_INFO.map((rankInfo, index) => (
                            <div 
                              key={rankInfo.rank}
                              className={`p-3 rounded-lg border transition-all ${
                                stats.rank === rankInfo.rank 
                                  ? 'bg-gradient-to-br from-blue-900/30 to-purple-900/20 border-blue-500/30 shadow-lg' 
                                  : 'bg-gray-900/30 border-gray-800/30'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                    rankInfo.rank === UserRank.NEWBIE ? 'bg-gray-600' :
                                    rankInfo.rank === UserRank.EXPLORER ? 'bg-orange-600' :
                                    rankInfo.rank === UserRank.TRADER ? 'bg-yellow-600' :
                                    rankInfo.rank === UserRank.INVESTOR ? 'bg-green-600' :
                                    rankInfo.rank === UserRank.WHALE ? 'bg-blue-600' :
                                    'bg-purple-600'
                                  }`}>
                                    <span className="text-white text-sm font-bold">{index + 1}</span>
                                  </div>
                                  <div>
                                    <h4 className={`text-lg font-bold ${rankInfo.color}`}>{rankInfo.rank}</h4>
                                    <p className="text-gray-400 text-sm">{rankInfo.description}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-gray-300 text-sm">Required points</p>
                                  <p className="text-white font-bold">{rankInfo.threshold.toLocaleString()}</p>
                                </div>
                                {stats.rank === rankInfo.rank && (
                                  <div className="absolute top-2 right-2">
                                    <div className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full">Current</div>
                                  </div>
                                )}
                              </div>
                              
                              {index < RANK_INFO.length - 1 && (
                                <div className="mt-3 pt-2 border-t border-gray-800">
                                  <div className="flex justify-between text-xs text-gray-500">
                                    <span>Your progress</span>
                                    <span>
                                      {stats.rank === rankInfo.rank ? (
                                        <span className="text-blue-400">
                                          {stats.totalPoints.toLocaleString()} / {RANK_INFO[index + 1].threshold.toLocaleString()}
                                        </span>
                                      ) : isRankLowerThanCurrent(rankInfo.rank, stats.rank) ? (
                                        <span className="text-green-400">Completed</span>
                                      ) : (
                                        <span>Not reached yet</span>
                                      )}
                                    </span>
                                  </div>
                                  
                                  {stats.rank === rankInfo.rank && (
                                    <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full ${
                                          rankInfo.rank === UserRank.NEWBIE ? 'bg-gradient-to-r from-gray-500 to-gray-600' :
                                          rankInfo.rank === UserRank.EXPLORER ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                                          rankInfo.rank === UserRank.TRADER ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                                          rankInfo.rank === UserRank.INVESTOR ? 'bg-gradient-to-r from-green-500 to-green-600' :
                                          rankInfo.rank === UserRank.WHALE ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                                          'bg-gradient-to-r from-purple-500 to-purple-600'
                                        }`}
                                        style={{ 
                                          width: `${calculateProgressBetweenRanks(stats.totalPoints, rankInfo.threshold, RANK_INFO[index + 1].threshold)}%` 
                                        }}
                                      ></div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        
                        <div className="mt-6 p-4 bg-gradient-to-br from-blue-900/20 to-purple-900/10 rounded-lg border border-blue-900/20">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-full">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div>
                              <h4 className="text-white font-medium">How ranks work</h4>
                              <p className="text-gray-400 text-sm mt-1">
                                Your rank is determined by the total points you've earned through transactions, tokens, NFTs, and contract interactions. 
                                Higher ranks require more points and unlock exclusive features and recognition within the Sphere ecosystem.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Details */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'details' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="bg-black/30 backdrop-blur-lg rounded-xl p-4 border border-gray-700/50 hover:border-blue-500/50 transition-all h-full shadow-lg overflow-y-auto">
                        <h3 className="text-lg font-medium text-white mb-4">Point System</h3>
                        
                        <div className="space-y-4">
                          <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                            <h4 className="text-blue-400 font-medium">Transactions</h4>
                            <p className="text-gray-300 text-sm mt-1">{POINT_SYSTEM.transactions.description}</p>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                              <div className="p-2 bg-black/20 rounded-lg">
                                <p className="text-gray-400">Basic</p>
                                <p className="text-white font-medium">{POINT_SYSTEM.transactions.base} points</p>
                              </div>
                              <div className="p-2 bg-black/20 rounded-lg">
                                <p className="text-gray-400">Successful</p>
                                <p className="text-white font-medium">{POINT_SYSTEM.transactions.successful} points</p>
                              </div>
                              <div className="p-2 bg-black/20 rounded-lg">
                                <p className="text-gray-400">High Value</p>
                                <p className="text-white font-medium">{POINT_SYSTEM.transactions.highValue} points</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                            <h4 className="text-green-400 font-medium">Tokens</h4>
                            <p className="text-gray-300 text-sm mt-1">{POINT_SYSTEM.tokens.description}</p>
                            <div className="mt-2 text-xs p-2 bg-black/20 rounded-lg inline-block">
                              <p className="text-gray-400">Per token</p>
                              <p className="text-white font-medium">{POINT_SYSTEM.tokens.points} points</p>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                            <h4 className="text-pink-400 font-medium">NFTs</h4>
                            <p className="text-gray-300 text-sm mt-1">{POINT_SYSTEM.nfts.description}</p>
                            <div className="mt-2 text-xs p-2 bg-black/20 rounded-lg inline-block">
                              <p className="text-gray-400">Per NFT</p>
                              <p className="text-white font-medium">{POINT_SYSTEM.nfts.points} points</p>
                            </div>
                          </div>
                          
                          <div className="p-3 bg-gradient-to-br from-gray-800/50 to-gray-900/80 rounded-lg border border-gray-700/50">
                            <h4 className="text-amber-400 font-medium">Contracts</h4>
                            <p className="text-gray-300 text-sm mt-1">{POINT_SYSTEM.contracts.description}</p>
                            <div className="mt-2 text-xs p-2 bg-black/20 rounded-lg inline-block">
                              <p className="text-gray-400">Per contract</p>
                              <p className="text-white font-medium">{POINT_SYSTEM.contracts.points} points</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Claim Identity */}
                    <div className={`absolute top-0 left-0 w-full h-full transition-opacity duration-300 ${activeTab === 'claim' ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                      <div className="flex justify-center items-center h-full p-4">
                        <ClaimIdentityCard
                          address={address}
                          stats={stats}
                          earnedBadges={earnedBadges}
                          onClaim={handleClaim}
                          isClaiming={isClaiming}
                          enableTilt={true}
                          className="w-full max-w-sm mx-auto"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* BaseScan Link */}
              <div className="text-center">
                <a
                  href={`https://basescan.org/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                >
                  View details on BaseScan →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
} 