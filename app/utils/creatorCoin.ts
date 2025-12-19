/**
 * Creator Coin utilities for fetching and trading Zora Creator Coins
 * Based on Zora SDK documentation: https://docs.zora.co/coins/sdk/queries/profile
 */

import { getProfileBalances, getCoin, getProfile, getProfileCoins } from '@zoralabs/coins-sdk';
import { formatUnits } from 'viem';

export interface CreatorCoinData {
  address: string;
  name: string;
  symbol: string;
  totalSupply: string;
  marketCap?: string;
  marketCapDelta24h?: string;
  priceUSD?: string;
  volume24h?: string;
  uniqueHolders?: number;
  createdAt?: string;
  imageUrl?: string;
  description?: string;
  creatorAddress?: string;
}

export interface UserCoinBalance {
  coinAddress: string;
  balance: string;
  balanceFormatted: string;
  valueUsd?: string;
  coin: CreatorCoinData;
}

// Cache for creator coins
const creatorCoinCache: Map<string, { data: CreatorCoinData | null; timestamp: number }> = new Map();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes (shorter for fresher data)

/**
 * Fetch Creator Coin data for a specific user address using getProfile
 * Returns the primary Creator Coin associated with the user (if any)
 * Based on: https://docs.zora.co/coins/sdk/queries/profile
 */
export async function getCreatorCoin(userAddress: string): Promise<CreatorCoinData | null> {
  try {
    const normalizedAddress = userAddress.toLowerCase();
    
    // Check cache first
    const cached = creatorCoinCache.get(normalizedAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    // Method 1: Try getProfile which returns creatorCoin directly
    try {
      const profileResponse = await getProfile({
        identifier: userAddress,
      });

      const profile: any = profileResponse?.data?.profile;
      
      if (profile?.creatorCoin) {
        // Get full coin details
        const coinDetails = await getCoin({ address: profile.creatorCoin.address });
        const coin = coinDetails?.data?.zora20Token || coinDetails?.data?.coin;
        
        const creatorCoin: CreatorCoinData = {
          address: profile.creatorCoin.address,
          name: coin?.name || 'Creator Coin',
          symbol: coin?.symbol || 'COIN',
          totalSupply: coin?.totalSupply || '0',
          marketCap: profile.creatorCoin.marketCap || coin?.marketCap,
          marketCapDelta24h: profile.creatorCoin.marketCapDelta24h,
          priceUSD: coin?.priceUSD,
          volume24h: coin?.volume24h,
          uniqueHolders: coin?.uniqueHolders,
          createdAt: coin?.createdAt,
          imageUrl: coin?.mediaContent?.previewImage?.medium || coin?.media?.medium,
          description: coin?.description,
          creatorAddress: coin?.creatorAddress || userAddress
        };
        
        creatorCoinCache.set(normalizedAddress, { data: creatorCoin, timestamp: Date.now() });
        return creatorCoin;
      }
    } catch (profileError) {
      console.warn('getProfile failed, trying getProfileCoins:', profileError);
    }

    // Method 2: Fallback to getProfileCoins
    try {
      const coinsResponse = await getProfileCoins({
        identifier: userAddress,
        count: 1
      });

      const createdCoins = coinsResponse?.data?.profile?.createdCoins?.edges || [];
      
      if (createdCoins.length > 0) {
        const coin = createdCoins[0]?.node;
        
        const creatorCoin: CreatorCoinData = {
          address: coin.address,
          name: coin.name || 'Creator Coin',
          symbol: coin.symbol || 'COIN',
          totalSupply: coin.totalSupply || '0',
          marketCap: coin.marketCap,
          marketCapDelta24h: coin.marketCapDelta24h,
          volume24h: coin.volume24h,
          uniqueHolders: coin.uniqueHolders,
          createdAt: coin.createdAt,
          imageUrl: coin.mediaContent?.previewImage?.medium,
          description: coin.description,
          creatorAddress: coin.creatorAddress || userAddress
        };
        
        creatorCoinCache.set(normalizedAddress, { data: creatorCoin, timestamp: Date.now() });
        return creatorCoin;
      }
    } catch (coinsError) {
      console.warn('getProfileCoins failed:', coinsError);
    }

    creatorCoinCache.set(normalizedAddress, { data: null, timestamp: Date.now() });
    return null;
  } catch (error) {
    console.error('Error fetching creator coin:', error);
    return null;
  }
}

/**
 * Fetch all coin balances for a user
 * Based on: https://docs.zora.co/coins/sdk/queries/profile#getprofilebalances
 */
export async function getUserCoinBalances(userAddress: string): Promise<UserCoinBalance[]> {
  try {
    const result = await getProfileBalances({
      identifier: userAddress,
      count: 100
    });

    // Handle both possible response structures from Zora API
    const edges = result.data?.profile?.coinBalances?.edges || [];
    
    return edges
      .filter((edge: any) => {
        // Check for coin data in node.coin or node.token structure
        const coinData = edge?.node?.coin || edge?.node?.token;
        return coinData;
      })
      .map((edge: any) => {
        const node = edge.node;
        const coin = node.coin || node.token;
        const valueUsd = node.valueUsd;
        
        // Handle different balance formats
        let balanceFormatted = '0';
        const rawBalance = node.balance || node.amount?.amountRaw || node.amountOwned;
        const decimalBalance = node.amount?.amountDecimal || node.balanceDecimal;
        
        if (decimalBalance !== undefined && decimalBalance !== null) {
          balanceFormatted = decimalBalance.toString();
        } else if (rawBalance) {
          try {
            const rawBalanceStr = rawBalance.toString().replace(/[^0-9]/g, '');
            if (rawBalanceStr && rawBalanceStr !== '0') {
              balanceFormatted = formatUnits(BigInt(rawBalanceStr), 18);
            }
          } catch (e) {
            balanceFormatted = rawBalance.toString();
          }
        }
        
        return {
          coinAddress: coin.address,
          balance: rawBalance?.toString() || '0',
          balanceFormatted: balanceFormatted,
          valueUsd: valueUsd,
          coin: {
            address: coin.address,
            name: coin.name || 'Unknown',
            symbol: coin.symbol || '???',
            totalSupply: coin.totalSupply || '0',
            marketCap: coin.marketCap,
            priceUSD: coin.priceUSD,
            volume24h: coin.volume24h,
            uniqueHolders: coin.uniqueHolders,
            createdAt: coin.createdAt,
            imageUrl: coin.media?.previewImage || coin.media?.medium || coin.mediaContent?.previewImage?.medium,
            description: coin.description,
            creatorAddress: coin.creatorAddress
          }
        };
      });
  } catch (error) {
    console.error('Error fetching user coin balances:', error);
    return [];
  }
}

/**
 * Get coin details by address
 * Based on: https://docs.zora.co/coins/sdk/queries/coin
 */
export async function getCoinDetails(coinAddress: string): Promise<CreatorCoinData | null> {
  try {
    const result = await getCoin({ address: coinAddress.toLowerCase() });
    
    // Handle different response structures
    const coin = result.data?.zora20Token || result.data?.coin;
    
    if (!coin) {
      return null;
    }

    return {
      address: coin.address,
      name: coin.name || 'Unknown',
      symbol: coin.symbol || '???',
      totalSupply: coin.totalSupply || '0',
      marketCap: coin.marketCap,
      marketCapDelta24h: coin.marketCapDelta24h,
      priceUSD: coin.priceUSD,
      volume24h: coin.volume24h,
      uniqueHolders: coin.uniqueHolders,
      createdAt: coin.createdAt,
      imageUrl: coin.media?.previewImage || coin.media?.medium || coin.mediaContent?.previewImage?.medium,
      description: coin.description,
      creatorAddress: coin.creatorAddress
    };
  } catch (error) {
    console.error('Error fetching coin details:', error);
    return null;
  }
}

/**
 * Clear the creator coin cache
 */
export function clearCreatorCoinCache() {
  creatorCoinCache.clear();
}

/**
 * Clear balance cache for a specific token
 */
export function clearBalanceCache(userAddress: string, tokenAddress?: string) {
  if (tokenAddress) {
    const cacheKey = `token_balance_${userAddress.toLowerCase()}_${tokenAddress.toLowerCase()}`;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(cacheKey);
    }
  } else {
    // Clear all balance caches for user
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`token_balance_${userAddress.toLowerCase()}`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }
  }
}

/**
 * Force refresh balance for a user (bypasses cache)
 */
export async function forceRefreshBalance(userAddress: string, tokenAddress: string): Promise<string> {
  try {
    // Clear cache first
    clearBalanceCache(userAddress, tokenAddress);
    
    // Fetch fresh balance
    const result = await getProfileBalances({
      identifier: userAddress,
      count: 100
    });

    const edges = result.data?.profile?.coinBalances?.edges || [];
    
    for (const edge of edges) {
      const node = edge?.node;
      const coin = node?.coin || node?.token;
      
      if (coin?.address?.toLowerCase() === tokenAddress.toLowerCase()) {
        // Handle different balance formats
        let formattedBalance = '0';
        const rawBalance = node?.balance || node?.amount?.amountRaw || node?.amountOwned;
        const decimalBalance = node?.amount?.amountDecimal || node?.balanceDecimal;
        
        if (decimalBalance !== undefined && decimalBalance !== null) {
          formattedBalance = decimalBalance.toString();
        } else if (rawBalance) {
          try {
            const rawBalanceStr = rawBalance.toString().replace(/[^0-9]/g, '');
            if (rawBalanceStr && rawBalanceStr !== '0') {
              formattedBalance = formatUnits(BigInt(rawBalanceStr), 18);
            }
          } catch (e) {
            formattedBalance = rawBalance.toString();
          }
        }
        
        // Update cache
        if (typeof localStorage !== 'undefined') {
          const cacheKey = `token_balance_${userAddress.toLowerCase()}_${tokenAddress.toLowerCase()}`;
          localStorage.setItem(cacheKey, JSON.stringify({
            balance: formattedBalance,
            timestamp: Date.now()
          }));
        }
        
        return formattedBalance;
      }
    }
    
    return '0';
  } catch (error) {
    console.error('Error force refreshing balance:', error);
    return '0';
  }
}

