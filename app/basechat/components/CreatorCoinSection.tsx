'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCreatorCoin, CreatorCoinData, getUserCoinBalances } from '../../utils/creatorCoin';
import TradeCoinModal from './TradeCoinModal';

interface CreatorCoinSectionProps {
  userAddress: string;
  currentUserAddress?: string;
}

export default function CreatorCoinSection({ userAddress, currentUserAddress }: CreatorCoinSectionProps) {
  const [creatorCoin, setCreatorCoin] = useState<CreatorCoinData | null>(null);
  const [userBalance, setUserBalance] = useState<string>('0');
  const [loading, setLoading] = useState(true);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');

  const fetchBalance = useCallback(async () => {
    if (!currentUserAddress || !creatorCoin) return;
    
    try {
      const balances = await getUserCoinBalances(currentUserAddress);
      const balance = balances.find(b => 
        b.coinAddress.toLowerCase() === creatorCoin.address.toLowerCase()
      );
      setUserBalance(balance?.balanceFormatted || '0');
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  }, [currentUserAddress, creatorCoin]);

  useEffect(() => {
    const fetchCreatorCoin = async () => {
      if (!userAddress) return;
      
      setLoading(true);
      try {
        const coin = await getCreatorCoin(userAddress);
        setCreatorCoin(coin);

        // If viewing own profile or logged in, get balance
        if (currentUserAddress && coin) {
          const balances = await getUserCoinBalances(currentUserAddress);
          const balance = balances.find(b => 
            b.coinAddress.toLowerCase() === coin.address.toLowerCase()
          );
          setUserBalance(balance?.balanceFormatted || '0');
        }
      } catch (error) {
        console.error('Error fetching creator coin:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCreatorCoin();
  }, [userAddress, currentUserAddress]);

  const handleOpenTrade = (mode: 'buy' | 'sell') => {
    setTradeMode(mode);
    setShowTradeModal(true);
  };

  const handleTradeSuccess = useCallback(() => {
    // Refresh balance after successful trade
    fetchBalance();
  }, [fetchBalance]);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-purple-50 via-violet-50 to-indigo-50 dark:from-purple-900/20 dark:via-violet-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-700/50 rounded-xl p-4 animate-pulse">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-purple-200 dark:bg-purple-700 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-purple-200 dark:bg-purple-700 rounded w-24" />
            <div className="h-3 bg-purple-200 dark:bg-purple-700 rounded w-16" />
          </div>
        </div>
      </div>
    );
  }

  if (!creatorCoin) {
    return null; // No creator coin found - don't show section
  }

  return (
    <>
      <div className="bg-gradient-to-r from-purple-50 via-violet-50 to-indigo-50 dark:from-purple-900/20 dark:via-violet-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-700/50 rounded-xl p-4 shadow-lg hover:shadow-xl transition-all duration-300">
        {/* Coin Info */}
        <div className="flex items-center space-x-3">
          {creatorCoin.imageUrl ? (
            <img 
              src={creatorCoin.imageUrl} 
              alt={creatorCoin.symbol} 
              className="w-12 h-12 rounded-full object-cover ring-2 ring-purple-300 dark:ring-purple-600"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center ring-2 ring-purple-300 dark:ring-purple-600">
              <span className="text-white font-bold text-lg">{creatorCoin.symbol.charAt(0)}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 dark:text-white truncate">
                {creatorCoin.symbol}
              </span>
              {creatorCoin.priceUSD && (
                <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                  ${parseFloat(creatorCoin.priceUSD).toFixed(6)}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {creatorCoin.name}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-purple-200/50 dark:border-purple-700/30">
          {creatorCoin.marketCap && (
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Market Cap</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                ${Number(creatorCoin.marketCap).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
          {creatorCoin.volume24h && (
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">24h Vol</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                ${Number(creatorCoin.volume24h).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
          {creatorCoin.uniqueHolders !== undefined && (
            <div className="text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Holders</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {creatorCoin.uniqueHolders.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Trade Buttons */}
        {currentUserAddress && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleOpenTrade('buy')}
              className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg"
            >
              Buy
            </button>
            {parseFloat(userBalance) > 0 && (
              <button
                onClick={() => handleOpenTrade('sell')}
                className="flex-1 py-2 px-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-red-500 to-rose-600 text-white hover:from-red-600 hover:to-rose-700 transition-all shadow-md hover:shadow-lg"
              >
                Sell
              </button>
            )}
          </div>
        )}

        {/* User Balance */}
        {currentUserAddress && parseFloat(userBalance) > 0 && (
          <div className="mt-2 text-center">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Your balance: <span className="font-medium text-purple-600 dark:text-purple-400">{parseFloat(userBalance).toFixed(4)} {creatorCoin.symbol}</span>
            </span>
          </div>
        )}
      </div>

      {/* Trade Modal */}
      {showTradeModal && creatorCoin && (
        <TradeCoinModal
          isOpen={showTradeModal}
          onClose={() => setShowTradeModal(false)}
          coin={creatorCoin}
          userBalance={userBalance}
          mode={tradeMode}
          onTradeSuccess={handleTradeSuccess}
        />
      )}
    </>
  );
}

