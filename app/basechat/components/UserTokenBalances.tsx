'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { getProfileBalances } from '@zoralabs/coins-sdk';
import { TrendingUp, ExternalLink } from 'lucide-react';

interface TokenBalance {
  address: string;
  symbol: string;
  balance: string;
  name: string;
  decimals: number;
  price?: string;
  priceChange24h?: number;
  marketCap?: string;
  volume24h?: string;
  createdAt?: string;
  priceUSD?: string;
  imageUrl?: string;
}

interface TokenPriceData {
  [address: string]: {
    price: string;
    priceChange24h: number;
  };
}

// Interface to match the actual response from getProfileBalances
interface TokenData {
  address: string;
  symbol: string;
  balance: string;
  name: string;
  decimals: number;
}

// Add a more detailed interface for Zora coin data
interface ZoraCoinData {
  id: string;
  name: string;
  description: string;
  address: string;
  symbol: string;
  totalSupply: string;
  totalVolume: string;
  volume24h: string;
  createdAt?: string;
  creatorAddress?: string;
  marketCap?: string;
  priceUSD?: string;
  uniqueHolders: number;
  media?: {
    previewImage?: string;
    medium?: string;
    blurhash?: string;
  };
}

export default function UserTokenBalances() {
  const { address } = useAccount();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenPrices, setTokenPrices] = useState<TokenPriceData>({});
  
  // Zora token contract address
  const ZORA_CONTRACT_ADDRESS = '0x6A1E73F12018D8e5f966ce794aa2921941feB17E';

  // Add caching mechanism
  const useLocalStorageCache = () => {
    // Load cached data on initial mount
    useEffect(() => {
      if (!address) return;
      
      try {
        const cachedData = localStorage.getItem(`token_balances_${address}`);
        if (cachedData) {
          const { data, timestamp } = JSON.parse(cachedData);
          // Only use cached data if it's less than 5 minutes old
          if (Date.now() - timestamp < 5 * 60 * 1000) {
            setBalances(data);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Error loading cached data:', err);
      }
    }, [address]);

    // Save data to cache
    const saveToCache = useCallback((data: TokenBalance[]) => {
      if (!address) return;
      try {
        localStorage.setItem(`token_balances_${address}`, JSON.stringify({
          data,
          timestamp: Date.now()
        }));
      } catch (err) {
        console.error('Error saving to cache:', err);
      }
    }, [address]);

    return { saveToCache };
  };

  const { saveToCache } = useLocalStorageCache();

  const fetchBalances = useCallback(async () => {
    if (!address) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Use the correct parameters according to the SDK
      const result = await getProfileBalances({
        identifier: address,
        count: 50 // Get up to 50 tokens
      });
      
      // Access the data properly based on the actual SDK response structure
      const tokenData = result.data?.profile?.coinBalances?.edges || [];
      
      const formattedBalances = tokenData
        .filter(edge => edge?.node?.coin && edge.node.balance)
        .map(edge => {
          const coin = edge.node.coin as unknown as ZoraCoinData;
          return {
            address: coin.address,
            symbol: coin.symbol || 'UNKNOWN',
            balance: formatUnits(BigInt(edge.node.balance), 18), // Assuming most tokens have 18 decimals
            name: coin.name || 'Unknown Token',
            decimals: 18, // Default to 18 for most ERC20 tokens
            // Add the new fields
            marketCap: coin.marketCap,
            volume24h: coin.volume24h,
            createdAt: coin.createdAt,
            priceUSD: coin.priceUSD,
            imageUrl: coin.media?.previewImage || coin.media?.medium
          };
        });
      
      setBalances(formattedBalances);
      saveToCache(formattedBalances);
    } catch (err) {
      console.error('Error fetching balances:', err);
      setError('Failed to fetch token balances');
    } finally {
      setLoading(false);
    }
  }, [address, saveToCache]);

  const fetchTokenPrices = useCallback(async () => {
    if (balances.length === 0) return;
    
    try {
      // First check if we have Zora token
      const addresses = [ZORA_CONTRACT_ADDRESS];
      
      // Add other token addresses if needed (limit to 5 to avoid rate limiting)
      const otherTokens = balances
        .filter(token => token.address.toLowerCase() !== ZORA_CONTRACT_ADDRESS.toLowerCase())
        .slice(0, 4);
      
      addresses.push(...otherTokens.map(t => t.address));
      
      // Fetch price data for each token
      const priceData: TokenPriceData = {};
      
      for (const tokenAddress of addresses) {
        try {
          const dexResponse = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
          );
          const dexData = await dexResponse.json();
          
          if (dexData.pairs && dexData.pairs.length > 0) {
            const pair = dexData.pairs[0];
            priceData[tokenAddress.toLowerCase()] = {
              price: pair.priceUsd ? `$${parseFloat(pair.priceUsd).toFixed(8)}` : '$0.00',
              priceChange24h: parseFloat(pair.priceChange?.h24 || '0')
            };
          }
        } catch (err) {
          console.error(`Error fetching price for ${tokenAddress}:`, err);
        }
      }
      
      setTokenPrices(priceData);
      
    } catch (err) {
      console.error('Error fetching token prices:', err);
    }
  }, [balances, ZORA_CONTRACT_ADDRESS]);

  useEffect(() => {
    fetchBalances();
    
    // Refresh balances every 5 minutes instead of 30 seconds
    const interval = setInterval(fetchBalances, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  useEffect(() => {
    if (balances.length > 0) {
      fetchTokenPrices();
    }
  }, [balances, fetchTokenPrices]);

  if (loading && balances.length === 0) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
              <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md text-red-500 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      <div className="p-4 border-b dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Your Token Balances</h2>
      </div>
      
      {balances.length === 0 ? (
        <div className="p-4 text-gray-600 dark:text-gray-400">
          No tokens found in your wallet
        </div>
      ) : (
        <div className="divide-y dark:divide-gray-700">
          {balances.map((token, index) => {
            const tokenPriceData = tokenPrices[token.address.toLowerCase()];
            const formattedBalance = parseFloat(token.balance).toFixed(6);
            
            // Highlight Zora token
            const isZoraToken = token.address.toLowerCase() === ZORA_CONTRACT_ADDRESS.toLowerCase();
            
            return (
              <div key={`profile-token-${token.address}-${index}`} className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition ${isZoraToken ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center">
                      {token.imageUrl && (
                        <img 
                          src={token.imageUrl} 
                          alt={token.symbol} 
                          className="w-5 h-5 mr-2 rounded-full" 
                        />
                      )}
                      <span className="font-semibold text-gray-800 dark:text-white">{token.symbol}</span>
                      {isZoraToken && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-100">
                          Zora
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{token.name}</div>
                    
                    {tokenPriceData && (
                      <div className="mt-1 flex items-center">
                        <span className="text-sm font-medium">{tokenPriceData.price}</span>
                        {tokenPriceData.priceChange24h !== 0 && (
                          <span 
                            className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                              tokenPriceData.priceChange24h >= 0 
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {tokenPriceData.priceChange24h > 0 ? '+' : ''}{tokenPriceData.priceChange24h.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    )}
                    
                    {token.marketCap && (
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Market Cap: ${Number(token.marketCap).toLocaleString()}
                      </div>
                    )}
                    
                    {token.volume24h && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        24h Vol: ${Number(token.volume24h).toLocaleString()}
                      </div>
                    )}
                    
                    {token.createdAt && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Created: {new Date(token.createdAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-right">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{formattedBalance}</div>
                    {tokenPriceData && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        ≈ ${(parseFloat(token.balance) * parseFloat(tokenPriceData.price.replace('$', ''))).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-2 text-xs">
                  <a 
                    href={`https://basescan.org/token/${token.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View on Basescan
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 