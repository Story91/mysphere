'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEther, formatEther, formatUnits } from 'viem';
import { tradeCoin, createTradeCall, TradeParameters } from '@zoralabs/coins-sdk';
import { toast } from 'react-hot-toast';
import { CreatorCoinData, clearBalanceCache } from '../../utils/creatorCoin';

interface TradeCoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  coin: CreatorCoinData;
  userBalance?: string;
  mode?: 'buy' | 'sell';
  onTradeSuccess?: () => void;
}

export default function TradeCoinModal({ 
  isOpen, 
  onClose, 
  coin, 
  userBalance = '0',
  mode: initialMode = 'buy',
  onTradeSuccess
}: TradeCoinModalProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  
  const [mode] = useState<'buy' | 'sell'>(initialMode);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.05); // 5% default
  const [isLoading, setIsLoading] = useState(false);
  const [estimatedOutput, setEstimatedOutput] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setEstimatedOutput(null);
    }
  }, [isOpen]);

  // Estimate output when amount changes
  const estimateOutput = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0 || !address || !publicClient) {
      setEstimatedOutput(null);
      return;
    }

    setIsEstimating(true);
    try {
      const amountIn = mode === 'buy' 
        ? parseEther(amount) 
        : parseEther(amount);

      const tradeParams: TradeParameters = {
        sell: mode === 'buy' 
          ? { type: 'eth' as const }
          : { type: 'erc20' as const, address: coin.address as `0x${string}` },
        buy: mode === 'buy'
          ? { type: 'erc20' as const, address: coin.address as `0x${string}` }
          : { type: 'eth' as const },
        amountIn,
        slippage,
        sender: address as `0x${string}`,
      };

      const quote = await createTradeCall(tradeParams);
      
      if (quote?.quote?.amountOut) {
        const formatted = formatUnits(BigInt(quote.quote.amountOut), 18);
        setEstimatedOutput(formatted);
      }
    } catch (error) {
      console.error('Error estimating output:', error);
      setEstimatedOutput(null);
    } finally {
      setIsEstimating(false);
    }
  }, [amount, mode, coin.address, address, publicClient, slippage]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      estimateOutput();
    }, 500);
    return () => clearTimeout(debounce);
  }, [estimateOutput]);

  const handleTrade = async () => {
    if (!address || !walletClient || !publicClient || !amount) {
      toast.error('Please connect wallet and enter amount');
      return;
    }

    const amountNum = parseFloat(amount);
    if (amountNum <= 0) {
      toast.error('Amount must be greater than 0');
      return;
    }

    if (mode === 'sell' && parseFloat(userBalance) < amountNum) {
      toast.error('Insufficient balance');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading(`${mode === 'buy' ? 'Buying' : 'Selling'} ${coin.symbol}...`);

    try {
      const amountIn = parseEther(amount);

      const tradeParams: TradeParameters = {
        sell: mode === 'buy' 
          ? { type: 'eth' as const }
          : { type: 'erc20' as const, address: coin.address as `0x${string}` },
        buy: mode === 'buy'
          ? { type: 'erc20' as const, address: coin.address as `0x${string}` }
          : { type: 'eth' as const },
        amountIn,
        slippage,
        sender: address as `0x${string}`,
      };

      // Use createTradeCall instead of tradeCoin for better compatibility
      const quote = await createTradeCall(tradeParams);
      
      if (!quote?.call) {
        throw new Error('Failed to get trade quote');
      }

      // Execute the transaction
      const tx = await walletClient.sendTransaction({
        to: quote.call.target as `0x${string}`,
        data: quote.call.data as `0x${string}`,
        value: BigInt(quote.call.value || 0),
        account: address,
      });

      toast.loading('Waiting for confirmation...', { id: toastId });

      // Wait for transaction
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

      if (receipt.status === 'success') {
        toast.success(
          `Successfully ${mode === 'buy' ? 'bought' : 'sold'} ${coin.symbol}!`, 
          { id: toastId }
        );
        
        // Clear all balance caches for user to force refresh
        clearBalanceCache(address, coin.address);
        
        // Small delay to allow blockchain state to propagate
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Call onTradeSuccess callback to refresh balances
        if (onTradeSuccess) {
          onTradeSuccess();
        }
        
        onClose();
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error: any) {
      console.error('Trade error:', error);
      
      let errorMessage = 'Trade failed';
      if (error.message?.includes('user rejected')) {
        errorMessage = 'Transaction cancelled';
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH balance';
      } else if (error.message?.includes('slippage')) {
        errorMessage = 'Price changed too much. Try higher slippage.';
      }
      
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const slippageOptions = [0.01, 0.03, 0.05, 0.1, 0.15];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            {coin.imageUrl && (
              <img 
                src={coin.imageUrl} 
                alt={coin.symbol} 
                className="w-10 h-10 rounded-full object-cover"
              />
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {mode === 'buy' ? 'Buy' : 'Sell'} {coin.symbol}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {coin.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>


        {/* Amount Input */}
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {mode === 'buy' ? 'ETH Amount' : `${coin.symbol} Amount`}
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                min="0"
                step="0.001"
                className="w-full px-4 py-3 pr-16 text-lg font-medium bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                {mode === 'buy' ? 'ETH' : coin.symbol}
              </span>
            </div>
            {mode === 'sell' && (
              <div className="flex items-center justify-between mt-2 text-sm">
                <span className="text-gray-500">Balance: {parseFloat(userBalance).toFixed(4)} {coin.symbol}</span>
                <button
                  onClick={() => setAmount(userBalance)}
                  className="text-blue-500 hover:text-blue-600 font-medium"
                >
                  Max
                </button>
              </div>
            )}
          </div>

          {/* Estimated Output */}
          {estimatedOutput && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {mode === 'buy' ? `You'll receive` : `You'll receive`}
                </span>
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {isEstimating ? (
                    <span className="animate-pulse">...</span>
                  ) : (
                    `~${parseFloat(estimatedOutput).toFixed(6)} ${mode === 'buy' ? coin.symbol : 'ETH'}`
                  )}
                </span>
              </div>
              {mode === 'buy' && coin.priceUSD && estimatedOutput && !isEstimating && (
                <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-500">≈ $USD</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    ${(parseFloat(estimatedOutput) * parseFloat(coin.priceUSD)).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Slippage Settings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Slippage Tolerance
            </label>
            <div className="flex gap-2">
              {slippageOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => setSlippage(s)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    slippage === s
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {(s * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>

          {/* Coin Info */}
          {coin.priceUSD && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Price</span>
                <span className="font-medium text-gray-900 dark:text-white">${parseFloat(coin.priceUSD).toFixed(8)}</span>
              </div>
              {coin.marketCap && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Market Cap</span>
                  <span className="font-medium text-gray-900 dark:text-white">${Number(coin.marketCap).toLocaleString()}</span>
                </div>
              )}
              {coin.volume24h && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">24h Volume</span>
                  <span className="font-medium text-gray-900 dark:text-white">${Number(coin.volume24h).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleTrade}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
            className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === 'buy'
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-500/25'
                : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/25'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </span>
            ) : (
              `${mode === 'buy' ? 'Buy' : 'Sell'} ${coin.symbol}`
            )}
          </button>
          
          {/* Zora Link */}
          <a
            href={`https://zora.co/coin/base:${coin.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 mt-3 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <span>View on Zora</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

