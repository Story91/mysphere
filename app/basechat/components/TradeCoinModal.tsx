'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseEther, formatUnits } from 'viem';
import { createTradeCall, TradeParameters } from '@zoralabs/coins-sdk';
import { toast } from 'react-hot-toast';
import { CreatorCoinData, clearBalanceCache } from '../../utils/creatorCoin';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

// Format large numbers to K/M/B
function formatCompactNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}

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
  
  // Tryb ustala rodzic przy otwarciu i nigdy sie nie zmienia w trakcie zycia
  // modala - to byl useState bez settera, czyli stala udajaca stan.
  const mode = initialMode;
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(0.05);
  const [isLoading, setIsLoading] = useState(false);
  const [estimatedOutput, setEstimatedOutput] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setEstimatedOutput(null);
    }
  }, [isOpen]);

  /** Jedna definicja zlecenia - wczesniej ten sam obiekt byl budowany osobno
   *  do wyceny i osobno do transakcji, z ryzykiem rozjechania sie parametrow. */
  const buildTradeParams = useCallback((amountIn: bigint): TradeParameters => {
    const coinAsset = { type: 'erc20' as const, address: coin.address as `0x${string}` };
    const ethAsset = { type: 'eth' as const };

    return {
      sell: mode === 'buy' ? ethAsset : coinAsset,
      buy: mode === 'buy' ? coinAsset : ethAsset,
      amountIn,
      slippage,
      sender: address as `0x${string}`,
    };
  }, [mode, coin.address, slippage, address]);

  const estimateOutput = useCallback(async (isStale: () => boolean) => {
    if (!amount || parseFloat(amount) <= 0 || !address || !publicClient) {
      setEstimatedOutput(null);
      return;
    }

    setIsEstimating(true);
    try {
      const quote = await createTradeCall(buildTradeParams(parseEther(amount)));
      // Wycena dla poprzedniej kwoty nie moze wygrac z biezaca - inaczej po
      // szybkiej zmianie pola uzytkownik widzial kurs dla innej liczby.
      if (isStale()) return;

      if (quote?.quote?.amountOut) {
        setEstimatedOutput(formatUnits(BigInt(quote.quote.amountOut), 18));
      }
    } catch (error) {
      if (isStale()) return;
      console.error('Error estimating output:', error);
      setEstimatedOutput(null);
    } finally {
      if (!isStale()) setIsEstimating(false);
    }
  }, [amount, address, publicClient, buildTradeParams]);

  useEffect(() => {
    let stale = false;
    const debounce = setTimeout(() => {
      estimateOutput(() => stale);
    }, 500);

    return () => {
      stale = true;
      clearTimeout(debounce);
    };
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
      const quote = await createTradeCall(buildTradeParams(parseEther(amount)));

      if (!quote?.call) {
        throw new Error('Failed to get trade quote');
      }

      const tx = await walletClient.sendTransaction({
        to: quote.call.target as `0x${string}`,
        data: quote.call.data as `0x${string}`,
        value: BigInt(quote.call.value || 0),
        account: address,
      });

      toast.loading('Waiting for confirmation...', { id: toastId });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

      if (receipt.status === 'success') {
        toast.success(
          `Successfully ${mode === 'buy' ? 'bought' : 'sold'} ${coin.symbol}!`, 
          { id: toastId }
        );
        
        clearBalanceCache(address, coin.address);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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

  const slippageOptions = [0.01, 0.03, 0.05, 0.1, 0.15];
  const isBuy = mode === 'buy';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(
        "sm:max-w-[420px] p-0 gap-0 overflow-hidden",
        "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950",
        "border border-slate-800/50 shadow-2xl shadow-black/50"
      )}>
        {/* Animated background glow */}
        <div className={cn(
          "absolute inset-0 opacity-30 blur-3xl pointer-events-none",
          isBuy 
            ? "bg-gradient-to-br from-emerald-500/20 via-transparent to-cyan-500/20" 
            : "bg-gradient-to-br from-rose-500/20 via-transparent to-orange-500/20"
        )} />
        
        {/* Header */}
        <DialogHeader className="relative p-6 pb-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-14 w-14 ring-2 ring-slate-700/50 shadow-lg">
                {coin.imageUrl ? (
                  <AvatarImage src={coin.imageUrl} alt={coin.symbol} className="object-cover" />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-800 text-white font-bold text-lg">
                    {coin.symbol?.slice(0, 2)}
                  </AvatarFallback>
                )}
              </Avatar>
              <div className={cn(
                "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                isBuy ? "bg-emerald-500" : "bg-rose-500"
              )}>
                {isBuy ? '↗' : '↙'}
              </div>
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
                {isBuy ? 'Buy' : 'Sell'} {coin.symbol}
                <Badge variant="outline" className={cn(
                  "text-[10px] px-2 py-0.5 font-medium border-none",
                  isBuy 
                    ? "bg-emerald-500/20 text-emerald-400" 
                    : "bg-rose-500/20 text-rose-400"
                )}>
                  {isBuy ? 'BUYING' : 'SELLING'}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-sm mt-0.5">
                {coin.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="relative px-6 pb-6 space-y-5">
          {/* Amount Input */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-300 flex items-center justify-between">
              <span>{isBuy ? 'Amount in ETH' : `Amount in ${coin.symbol}`}</span>
              {!isBuy && (
                <span className="text-xs text-slate-500">
                  Balance: {formatCompactNumber(parseFloat(userBalance))}
                </span>
              )}
            </label>
            <div className="relative group">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                min="0"
                step="0.001"
                className={cn(
                  "h-14 text-xl font-semibold pr-20 bg-slate-800/50 border-slate-700/50",
                  "text-white placeholder:text-slate-600",
                  "focus:ring-2 focus:border-transparent transition-all",
                  isBuy ? "focus:ring-emerald-500/50" : "focus:ring-rose-500/50"
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {!isBuy && (
                  <button
                    onClick={() => setAmount(userBalance)}
                    className="text-xs font-medium text-slate-400 hover:text-white transition-colors px-2 py-1 rounded bg-slate-700/50 hover:bg-slate-700"
                  >
                    MAX
                  </button>
                )}
                <span className="text-slate-400 font-medium text-sm">
                  {isBuy ? 'ETH' : coin.symbol}
                </span>
              </div>
            </div>
            {/* Show USD equivalent for ETH input */}
            {isBuy && amount && parseFloat(amount) > 0 && (
              <div className="text-xs text-slate-500 text-right">
                ≈ ${(parseFloat(amount) * 3500).toFixed(2)} USD
              </div>
            )}
            
            {/* Quick Amount Buttons */}
            {isBuy ? (
              <div className="flex gap-2">
                {[0.00001, 0.0001, 0.001].map((eth) => {
                  // Estimate USD value: ETH price ~$3500 (approximate)
                  const ethPriceUsd = 3500;
                  const usdValue = eth * ethPriceUsd;
                  return (
                    <button
                      key={eth}
                      onClick={() => setAmount(eth.toString())}
                      className={cn(
                        "flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all flex flex-col items-center gap-0.5",
                        amount === eth.toString()
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                          : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-700/50"
                      )}
                    >
                      <span className="font-semibold">{eth} ETH</span>
                      <span className="text-[10px] opacity-70">≈${usdValue.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex gap-2">
                {[25, 50, 75, 100].map((percent) => {
                  const value = (parseFloat(userBalance) * percent / 100).toString();
                  return (
                    <button
                      key={percent}
                      onClick={() => setAmount(value)}
                      className={cn(
                        "flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all",
                        parseFloat(amount) === parseFloat(value) && parseFloat(value) > 0
                          ? "bg-rose-500 text-white shadow-lg shadow-rose-500/25"
                          : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300 border border-slate-700/50"
                      )}
                    >
                      {percent}%
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Estimated Output */}
          {(estimatedOutput || isEstimating) && (
            <div className={cn(
              "rounded-xl p-4 space-y-3 border",
              isBuy 
                ? "bg-emerald-500/5 border-emerald-500/20" 
                : "bg-rose-500/5 border-rose-500/20"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">You'll receive</span>
                <div className="text-right">
                  {isEstimating ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
                      <span className="text-slate-500">Calculating...</span>
                    </div>
                  ) : (
                    <span className={cn(
                      "text-lg font-bold",
                      isBuy ? "text-emerald-400" : "text-rose-400"
                    )}>
                      ~{formatCompactNumber(parseFloat(estimatedOutput || '0'))} {isBuy ? coin.symbol : 'ETH'}
                    </span>
                  )}
                </div>
              </div>
              
              {isBuy && coin.priceUSD && estimatedOutput && !isEstimating && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
                  <span className="text-xs text-slate-500">≈ USD Value</span>
                  <span className="text-sm font-medium text-slate-300">
                    ${formatCompactNumber(parseFloat(estimatedOutput) * parseFloat(coin.priceUSD))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Slippage */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Slippage Tolerance</label>
            <div className="flex gap-1.5">
              {slippageOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => setSlippage(s)}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-semibold transition-all",
                    slippage === s
                      ? isBuy 
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" 
                        : "bg-rose-500 text-white shadow-lg shadow-rose-500/25"
                      : "bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300"
                  )}
                >
                  {(s * 100).toFixed(0)}%
                </button>
              ))}
            </div>
          </div>

          {/* Coin Stats */}
          {coin.priceUSD && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Price</p>
                <p className="text-sm font-semibold text-white">${parseFloat(coin.priceUSD).toFixed(6)}</p>
              </div>
              {coin.marketCap && (
                <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">MCap</p>
                  <p className="text-sm font-semibold text-white">${formatCompactNumber(Number(coin.marketCap))}</p>
                </div>
              )}
              {coin.volume24h && (
                <div className="bg-slate-800/30 rounded-lg p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">24h Vol</p>
                  <p className="text-sm font-semibold text-white">${formatCompactNumber(Number(coin.volume24h))}</p>
                </div>
              )}
            </div>
          )}

          {/* Action Button */}
          <Button
            onClick={handleTrade}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
            className={cn(
              "w-full h-14 text-base font-bold transition-all",
              isBuy
                ? "bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-lg shadow-emerald-500/25"
                : "bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 shadow-lg shadow-rose-500/25",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            )}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                {isBuy ? (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Buy {coin.symbol}
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                    Sell {coin.symbol}
                  </>
                )}
              </span>
            )}
          </Button>

          {/* Zora Link */}
          <a
            href={`https://zora.co/coin/base:${coin.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span>View on Zora</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
