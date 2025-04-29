'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { getProfileBalances } from '@zoralabs/coins-sdk';
import { ExternalLink } from 'lucide-react';

interface TokenBalance {
  address: string;
  symbol: string;
  balance: string;
  name: string;
  decimals: number;
  marketCap?: string;
  volume24h?: string;
  createdAt?: string;
  priceUSD?: string;
  imageUrl?: string;
}

interface ZoraCoinData {
  id: string;
  name: string;
  description?: string;
  address: string;
  symbol: string;
  totalSupply: string;
  totalVolume?: string;
  volume24h?: string;
  createdAt?: string;
  creatorAddress?: string;
  marketCap?: string;
  priceUSD?: string;
  uniqueHolders?: number;
  media?: {
    previewImage?: string;
    medium?: string;
    blurhash?: string;
  };
}

interface TokenBalanceForPostProps {
  tokenAddress: string;
  tokenSymbol?: string;
}

export default function TokenBalanceForPost({ tokenAddress, tokenSymbol }: TokenBalanceForPostProps) {
  const { address } = useAccount();
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address || !tokenAddress) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // First try to get balance from localStorage
      const cacheKey = `token_balance_${address.toLowerCase()}_${tokenAddress.toLowerCase()}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      if (cachedData) {
        const { balance: cachedBalance, timestamp } = JSON.parse(cachedData);
        // Use cache if it's less than 5 minutes old
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          setBalance(cachedBalance);
          setLoading(false);
          return;
        }
      }
      
      const result = await getProfileBalances({
        identifier: address,
        count: 50 // Pobierz więcej tokenów i przefiltruj lokalnie
      });
      
      const tokenData = result.data?.profile?.coinBalances?.edges || [];
      
      // Znajdź token o podanym adresie
      const targetToken = tokenData.find(
        edge => edge?.node?.coin?.address?.toLowerCase() === tokenAddress.toLowerCase()
      );
      
      let balanceData: TokenBalance;
      
      if (targetToken?.node?.coin && targetToken?.node?.balance) {
        const coin = targetToken.node.coin as unknown as ZoraCoinData;
        balanceData = {
          address: coin.address,
          symbol: coin.symbol || tokenSymbol || 'UNKNOWN',
          balance: formatUnits(BigInt(targetToken.node.balance), 18),
          name: coin.name || 'Unknown Token',
          decimals: 18,
          marketCap: coin.marketCap,
          volume24h: coin.volume24h,
          createdAt: coin.createdAt,
          priceUSD: coin.priceUSD,
          imageUrl: coin.media?.previewImage || coin.media?.medium
        };
      } else {
        // Jeśli użytkownik nie ma tego tokenu, pokaż zero
        balanceData = {
          address: tokenAddress,
          symbol: tokenSymbol || 'UNKNOWN',
          balance: '0',
          name: 'Post Token',
          decimals: 18
        };
      }
      
      // Save to localStorage with timestamp
      localStorage.setItem(cacheKey, JSON.stringify({
        balance: balanceData,
        timestamp: Date.now()
      }));
      
      setBalance(balanceData);
    } catch (err) {
      console.error('Error fetching token balance:', err);
      setError('Failed to fetch token balance');
    } finally {
      setLoading(false);
    }
  }, [address, tokenAddress, tokenSymbol]);

  useEffect(() => {
    fetchBalance();
    // Remove the interval that refreshes every 15 seconds
  }, [fetchBalance]);

  if (loading) {
    return (
      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg text-sm text-gray-500">
        No balance information available
      </div>
    );
  }

  // Format balance z 6 miejscami po przecinku
  const formattedBalance = parseFloat(balance.balance).toFixed(6);

  return (
    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg" key={`post-token-${tokenAddress}`}>
      <h4 className="text-purple-600 dark:text-purple-400 text-sm font-medium mb-3">Your Token Balance</h4>
      
      <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg text-center">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Balance</div>
        <div className="text-xl font-bold text-gray-800 dark:text-white">{formattedBalance}</div>
        
        {parseFloat(balance.balance) > 0 ? (
          <div className="flex justify-center mt-3">
            <a 
              href={`https://zora.co/profile/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-purple-500 hover:text-purple-700 flex items-center"
            >
              View your tokens
              <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </div>
        ) : (
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
            You don't own any tokens yet
          </div>
        )}
      </div>
    </div>
  );
} 