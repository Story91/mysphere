'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWatchContractEvent, usePublicClient } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../hooks/useSpheresContract';

interface PrizeEventListenerProps {
  userAddress?: string;
  onPrizeDetected: (prize: DetectedPrize) => void;
  onTransactionProcessed?: (txHash: string) => void;
}

export interface DetectedPrize {
  type: string;
  value: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  txHash: string;
  timestamp: number;
  blockNumber: number;
}

// IndexedDB backup system
const DB_NAME = 'UtilityBoxPrizes';
const DB_VERSION = 1;
const STORE_NAME = 'prizes';

class PrizeStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('userAddress', 'userAddress', { unique: false });
          store.createIndex('txHash', 'txHash', { unique: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async savePrize(userAddress: string, prize: DetectedPrize): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      store.add({
        userAddress,
        ...prize,
        savedAt: Date.now()
      });
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getPrizes(userAddress: string): Promise<DetectedPrize[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('userAddress');
      const request = index.getAll(userAddress);
      
      request.onsuccess = () => {
        const prizes = request.result.map((item: any) => ({
          type: item.type,
          value: item.value,
          rarity: item.rarity,
          txHash: item.txHash,
          timestamp: item.timestamp,
          blockNumber: item.blockNumber
        }));
        resolve(prizes);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async clearPrizes(userAddress: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('userAddress');
      const request = index.openCursor(userAddress);
      
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }
}

const prizeStorage = new PrizeStorage();

// Enhanced localStorage with backup
export function useSavedPrizes(userAddress?: string) {
  const [prizes, setPrizes] = useState<DetectedPrize[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const publicClient = usePublicClient();

  // Load prizes from storage and filter out mock data
  const loadPrizes = useCallback(async () => {
    if (!userAddress) return;
    
    try {
      setIsLoading(true);
      
      // Try localStorage first
      const localData = localStorage.getItem(`prizeHistory_${userAddress}`);
      let localPrizes: DetectedPrize[] = [];
      
      if (localData) {
        try {
          localPrizes = JSON.parse(localData);
        } catch (e) {
          console.warn('📦 localStorage data corrupted, clearing');
          localStorage.removeItem(`prizeHistory_${userAddress}`);
        }
      }
      
      // Try IndexedDB backup
      let dbPrizes: DetectedPrize[] = [];
      try {
        dbPrizes = await prizeStorage.getPrizes(userAddress);
      } catch (e) {
        console.warn('💾 IndexedDB error:', e);
      }
      
      // Merge and deduplicate prizes
      const allPrizes = [...localPrizes, ...dbPrizes];
      let uniquePrizes = allPrizes.filter((prize, index, arr) => 
        arr.findIndex(p => p.txHash === prize.txHash) === index
      );
      
      // Filter out mock data (blockNumber: 0) and invalid hashes
      const realPrizes = uniquePrizes.filter(prize => {
        const isReal = prize.blockNumber > 0 && 
                      prize.txHash && 
                      prize.txHash.startsWith('0x') && 
                      prize.txHash.length === 66;
        
        if (!isReal) {
          console.log('🧹 Filtering out mock/invalid prize:', prize);
        }
        
        return isReal;
      });
      
      // Sort by timestamp (newest first)
      realPrizes.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`📊 Loaded prizes: ${uniquePrizes.length} total, ${realPrizes.length} real, ${uniquePrizes.length - realPrizes.length} filtered out`);
      
      setPrizes(realPrizes);
      
      // Update storage if we filtered out mock data
      if (realPrizes.length !== uniquePrizes.length) {
        console.log('🧹 Cleaning up mock data from storage');
        localStorage.setItem(`prizeHistory_${userAddress}`, JSON.stringify(realPrizes));
      }
      
    } catch (error) {
      console.error('❌ Error loading prizes:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  // Save prize to all storage methods (only real blockchain events)
  const savePrize = useCallback(async (prize: DetectedPrize) => {
    if (!userAddress) return;
    
    // Filter out mock data (blockNumber: 0)
    if (prize.blockNumber === 0) {
      console.warn('🚫 Rejected mock prize:', prize);
      return;
    }
    
    // Validate real transaction hash
    if (!prize.txHash || !prize.txHash.startsWith('0x') || prize.txHash.length !== 66) {
      console.warn('🚫 Rejected invalid transaction hash:', prize);
      return;
    }
    
    // Check if already exists
    const exists = prizes.some(p => p.txHash === prize.txHash);
    if (exists) {
      console.log('📝 Prize already exists, skipping:', prize.txHash);
      return;
    }
    
    console.log('✅ Saving real blockchain prize:', prize);
    const newPrizes = [prize, ...prizes];
    setPrizes(newPrizes);
    
    // Save to localStorage
    try {
      localStorage.setItem(`prizeHistory_${userAddress}`, JSON.stringify(newPrizes));
    } catch (e) {
      console.warn('📦 localStorage save failed:', e);
    }
    
    // Save to IndexedDB backup
    try {
      await prizeStorage.savePrize(userAddress, prize);
    } catch (e) {
      console.warn('💾 IndexedDB save failed:', e);
    }
  }, [userAddress, prizes]);

  // Clear all prizes
  const clearPrizes = useCallback(async () => {
    if (!userAddress) return;
    
    setPrizes([]);
    
    // Clear localStorage
    localStorage.removeItem(`prizeHistory_${userAddress}`);
    
    // Clear IndexedDB
    try {
      await prizeStorage.clearPrizes(userAddress);
    } catch (e) {
      console.warn('💾 IndexedDB clear failed:', e);
    }
  }, [userAddress]);

  // Fetch historical events from blockchain
  const fetchHistoricalEvents = useCallback(async (fromBlock: number = 28320790) => {
    if (!userAddress || !publicClient) return;
    
    try {
      setIsLoading(true);
      console.log('🔍 Fetching historical events from block:', fromBlock);
      
      // Fetch all relevant events for the user
      const [
        utilityBoxEvents,
        achievementEvents,
        streakSaverEvents,
        boostEvents,
        nftEvents
      ] = await Promise.all([
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: {
            type: 'event',
            name: 'UtilityBoxOpened',
            inputs: [
              { name: 'user', type: 'address', indexed: true },
              { name: 'prizeType', type: 'string', indexed: false },
              { name: 'value', type: 'uint256', indexed: false }
            ]
          },
          args: { user: userAddress as `0x${string}` },
          fromBlock: BigInt(fromBlock),
          toBlock: 'latest'
        }),
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: {
            type: 'event',
            name: 'AchievementVoucherWon',
            inputs: [
              { name: 'user', type: 'address', indexed: true },
              { name: 'newTotal', type: 'uint256', indexed: false }
            ]
          },
          args: { user: userAddress as `0x${string}` },
          fromBlock: BigInt(fromBlock),
          toBlock: 'latest'
        }),
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: {
            type: 'event',
            name: 'StreakSaverWon',
            inputs: [
              { name: 'user', type: 'address', indexed: true },
              { name: 'newTotal', type: 'uint256', indexed: false }
            ]
          },
          args: { user: userAddress as `0x${string}` },
          fromBlock: BigInt(fromBlock),
          toBlock: 'latest'
        }),
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: {
            type: 'event',
            name: 'BoostActivated',
            inputs: [
              { name: 'user', type: 'address', indexed: true },
              { name: 'boostType', type: 'uint8', indexed: false }
            ]
          },
          args: { user: userAddress as `0x${string}` },
          fromBlock: BigInt(fromBlock),
          toBlock: 'latest'
        }),
        publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: {
            type: 'event',
            name: 'CollectibleMinted',
            inputs: [
              { name: 'recipient', type: 'address', indexed: true },
              { name: 'tokenId', type: 'uint256', indexed: true },
              { name: 'category', type: 'string', indexed: false }
            ]
          },
          args: { recipient: userAddress as `0x${string}` },
          fromBlock: BigInt(fromBlock),
          toBlock: 'latest'
        })
      ]);

      console.log('📊 Historical events found:', {
        utilityBox: utilityBoxEvents.length,
        achievement: achievementEvents.length,
        streakSaver: streakSaverEvents.length,
        boost: boostEvents.length,
        nft: nftEvents.length
      });

      // Process all events into prizes
      const historicalPrizes: DetectedPrize[] = [];

      // Process UtilityBoxOpened events
      for (const event of utilityBoxEvents) {
        const args = event.args as any;
        const prizeType = args.prizeType;
        const value = Number(args.value || 0);
        
        let prize: DetectedPrize;
        if (prizeType === 'Nothing') {
          prize = {
            type: 'Nothing',
            value: 0,
            rarity: 'common',
            txHash: event.transactionHash!,
            timestamp: Date.now(), // We'd need to fetch block timestamp for accuracy
            blockNumber: Number(event.blockNumber)
          };
        } else if (prizeType === 'Respect Points') {
          prize = {
            type: `${value} Respect Points`,
            value,
            rarity: value >= 25 ? 'uncommon' : 'common',
            txHash: event.transactionHash!,
            timestamp: Date.now(),
            blockNumber: Number(event.blockNumber)
          };
        } else {
          continue;
        }
        
        historicalPrizes.push(prize);
      }

      // Process other events...
      for (const event of achievementEvents) {
        historicalPrizes.push({
          type: 'Achievement Voucher',
          value: 1,
          rarity: 'epic',
          txHash: event.transactionHash!,
          timestamp: Date.now(),
          blockNumber: Number(event.blockNumber)
        });
      }

      for (const event of streakSaverEvents) {
        historicalPrizes.push({
          type: 'Streak Saver',
          value: 1,
          rarity: 'rare',
          txHash: event.transactionHash!,
          timestamp: Date.now(),
          blockNumber: Number(event.blockNumber)
        });
      }

      for (const event of boostEvents) {
        historicalPrizes.push({
          type: '1-Day Boost',
          value: 1,
          rarity: 'uncommon',
          txHash: event.transactionHash!,
          timestamp: Date.now(),
          blockNumber: Number(event.blockNumber)
        });
      }

      for (const event of nftEvents) {
        const args = event.args as any;
        if (args.category === 'UtilityBox Champion') {
          historicalPrizes.push({
            type: 'Legendary NFT',
            value: 1,
            rarity: 'legendary',
            txHash: event.transactionHash!,
            timestamp: Date.now(),
            blockNumber: Number(event.blockNumber)
          });
        }
      }

      // Save historical prizes
      for (const prize of historicalPrizes) {
        await savePrize(prize);
      }

      console.log(`✅ Imported ${historicalPrizes.length} historical prizes`);
      
    } catch (error) {
      console.error('❌ Error fetching historical events:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, publicClient, savePrize]);

  // Export data for backup
  const exportData = useCallback(() => {
    const data = {
      userAddress,
      prizes,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utility-box-history-${userAddress?.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [userAddress, prizes]);

  // Import data from backup
  const importData = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.prizes && Array.isArray(data.prizes)) {
          for (const prize of data.prizes) {
            await savePrize(prize);
          }
          console.log(`✅ Imported ${data.prizes.length} prizes`);
        }
      } catch (error) {
        console.error('❌ Import failed:', error);
      }
    };
    reader.readAsText(file);
  }, [savePrize]);

  // Calculate stats
  const getStats = useCallback(() => {
    const totalBoxes = prizes.length;
    const legendaryCount = prizes.filter(p => p.rarity === 'legendary').length;
    const rareCount = prizes.filter(p => p.rarity === 'rare' || p.rarity === 'epic').length;
    const totalValue = prizes
      .filter(p => p.type.includes('Respect Points'))
      .reduce((sum, p) => sum + p.value, 0);

    return {
      totalBoxes,
      legendaryCount,
      rareCount,
      totalValue
    };
  }, [prizes]);

  // Load data on mount
  useEffect(() => {
    loadPrizes();
  }, [loadPrizes]);

  return {
    prizes,
    isLoading,
    getPrizes: () => prizes,
    getStats,
    savePrize,
    clearPrizes,
    fetchHistoricalEvents,
    exportData,
    importData,
    loadPrizes
  };
}

export default function PrizeEventListener({ 
  userAddress, 
  onPrizeDetected, 
  onTransactionProcessed 
}: PrizeEventListenerProps) {
  const processedTxs = useRef(new Set<string>());

  // Debug effect
  useEffect(() => {
    console.log('🎧 PrizeEventListener mounted');
    console.log('📋 Configuration:', {
      CONTRACT_ADDRESS,
      userAddress,
      hasOnPrizeDetected: !!onPrizeDetected,
      hasOnTransactionProcessed: !!onTransactionProcessed
    });

    return () => {
      console.log('🎧 PrizeEventListener unmounted');
    };
  }, [userAddress, onPrizeDetected, onTransactionProcessed]);

  // Helper function to process prize
  const processPrize = (prize: DetectedPrize) => {
    if (processedTxs.current.has(prize.txHash)) return;
    
    // Validate transaction hash format
    if (!prize.txHash || !prize.txHash.startsWith('0x') || prize.txHash.length !== 66) {
      console.warn('⚠️ Invalid transaction hash format:', prize.txHash, 'Length:', prize.txHash?.length);
    }
    
    console.log('🎁 Prize detected:', {
      ...prize,
      txHashLength: prize.txHash?.length,
      txHashValid: prize.txHash?.startsWith('0x') && prize.txHash?.length === 66
    });
    
    onPrizeDetected(prize);
    processedTxs.current.add(prize.txHash);
    onTransactionProcessed?.(prize.txHash);
  };

  // Watch for UtilityBoxOpened events (Nothing + Respect Points)
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    eventName: 'UtilityBoxOpened',
    args: userAddress ? { user: userAddress } : undefined,
    onLogs: (logs: any[]) => {
      console.log('🎯 UtilityBoxOpened event detected:', logs);
      
      for (const log of logs) {
        const txHash = log.transactionHash;
        if (!txHash) continue;

        const prizeType = log.args?.prizeType as string;
        const value = Number(log.args?.value || 0);

        let prize: DetectedPrize;

        if (prizeType === 'Nothing') {
          prize = {
            type: 'Nothing',
            value: 0,
            rarity: 'common',
            txHash,
            timestamp: Date.now(),
            blockNumber: Number(log.blockNumber)
          };
        } else if (prizeType === 'Respect Points') {
          prize = {
            type: `${value} Respect Points`,
            value,
            rarity: value >= 25 ? 'uncommon' : 'common',
            txHash,
            timestamp: Date.now(),
            blockNumber: Number(log.blockNumber)
          };
        } else {
          continue; // Skip unknown prize types
        }

        processPrize(prize);
      }
    }
  });

  // Watch for AchievementVoucherWon events
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    eventName: 'AchievementVoucherWon',
    args: userAddress ? { user: userAddress } : undefined,
    onLogs: (logs: any[]) => {
      console.log('🎯 AchievementVoucherWon event detected:', logs);
      
      for (const log of logs) {
        const txHash = log.transactionHash;
        if (!txHash) continue;
        
        const prize: DetectedPrize = {
          type: 'Achievement Voucher',
          value: 1,
          rarity: 'epic',
          txHash,
          timestamp: Date.now(),
          blockNumber: Number(log.blockNumber)
        };
        
        processPrize(prize);
      }
    }
  });

  // Watch for StreakSaverWon events
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    eventName: 'StreakSaverWon',
    args: userAddress ? { user: userAddress } : undefined,
    onLogs: (logs: any[]) => {
      console.log('🎯 StreakSaverWon event detected:', logs);
      
      for (const log of logs) {
        const txHash = log.transactionHash;
        if (!txHash) continue;
        
        const prize: DetectedPrize = {
          type: 'Streak Saver',
          value: 1,
          rarity: 'rare',
          txHash,
          timestamp: Date.now(),
          blockNumber: Number(log.blockNumber)
        };
        
        processPrize(prize);
      }
    }
  });

  // Watch for BoostActivated events
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    eventName: 'BoostActivated',
    args: userAddress ? { user: userAddress } : undefined,
    onLogs: (logs: any[]) => {
      console.log('🎯 BoostActivated event detected:', logs);
      
      for (const log of logs) {
        const txHash = log.transactionHash;
        if (!txHash) continue;
        
        // Since we can't determine boost duration from event, we assume it's a boost
        const prize: DetectedPrize = {
          type: '1-Day Boost',
          value: 1,
          rarity: 'uncommon',
          txHash,
          timestamp: Date.now(),
          blockNumber: Number(log.blockNumber)
        };
        
        processPrize(prize);
      }
    }
  });

  // Watch for CollectibleMinted events (NFT)
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    eventName: 'CollectibleMinted',
    args: userAddress ? { recipient: userAddress } : undefined,
    onLogs: (logs: any[]) => {
      console.log('🎯 CollectibleMinted event detected:', logs);
      
      for (const log of logs) {
        // Check if this is a UtilityBox NFT
        const category = log.args?.category as string;
        if (category !== 'UtilityBox Champion') continue;
        
        const txHash = log.transactionHash;
        if (!txHash) continue;
        
        const prize: DetectedPrize = {
          type: 'Legendary NFT',
          value: 1,
          rarity: 'legendary',
          txHash,
          timestamp: Date.now(),
          blockNumber: Number(log.blockNumber)
        };
        
        processPrize(prize);
      }
    }
  });

  // Effect to clean up old processed transactions (keep only last 100)
  useEffect(() => {
    const cleanup = () => {
      if (processedTxs.current.size > 100) {
        const txArray = Array.from(processedTxs.current);
        processedTxs.current = new Set(txArray.slice(-50)); // Keep last 50
      }
    };

    const interval = setInterval(cleanup, 60000); // Cleanup every minute
    return () => clearInterval(interval);
  }, []);

  return null; // This is just a listener component
} 