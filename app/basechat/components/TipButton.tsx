'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useChainId, useBalance } from 'wagmi';
import { 
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel
} from '@coinbase/onchainkit/transaction';
import { parseEther, parseUnits, formatEther, formatUnits, encodeFunctionData } from 'viem';
import { toast } from 'react-hot-toast';
import { base } from 'wagmi/chains';
import { saveTip } from '../../utils/firebase';

// USDC contract address on Base
const USDC_ADDRESS = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA';

// ERC20 Transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

interface TipButtonProps {
  recipientAddress: string;
  postId: string;
  className?: string;
}

export default function TipButton({ recipientAddress, postId, className = '' }: TipButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState('0.001');
  const [selectedToken, setSelectedToken] = useState<'ETH' | 'USDC'>('ETH');
  const [isTransacting, setIsTransacting] = useState(false);
  
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  
  // Get user balances
  const { data: ethBalance } = useBalance({
    address: address,
    chainId: base.id
  });
  
  const { data: usdcBalance } = useBalance({
    address: address,
    token: USDC_ADDRESS as `0x${string}`,
    chainId: base.id
  });

  // Check if user is trying to tip themselves
  const isSelfTip = address?.toLowerCase() === recipientAddress.toLowerCase();

  // Check if on correct network
  const isCorrectNetwork = chainId === base.id;

  const handleTransactionStatus = useCallback(async (status: any) => {
    if (status.statusName === 'success') {
      try {
        // Save tip to Firebase
        const txHash = status.statusData?.transactionHash || '';
        await saveTip({
          senderAddress: address!,
          recipientAddress,
          amount: tipAmount,
          token: selectedToken,
          postId,
          txHash,
          network: 'base'
        });
        
        toast.success(`Tip sent successfully! 🎉 Transaction: ${txHash.slice(0, 10)}...`, { duration: 3000 });
        
        // Show transaction link
        if (txHash) {
          setTimeout(() => {
            toast.success(
              <div className="flex flex-col gap-1">
                <span>View transaction:</span>
                <a 
                  href={`https://basescan.org/tx/${txHash}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-700 underline text-xs"
                >
                  {txHash.slice(0, 20)}...
                </a>
              </div>,
              { duration: 10000 }
            );
          }, 2000);
        }
      } catch (error) {
        console.error('Error saving tip:', error);
        toast.error('Tip sent but failed to save to database');
      }
      
      setIsTransacting(false);
      setIsOpen(false);
      setTipAmount('0.001');
    } else if (status.statusName === 'error') {
      const errorMessage = status.statusData?.message || 'Transaction failed';
      toast.error(`Tip failed: ${errorMessage}`);
      setIsTransacting(false);
    } else if (status.statusName === 'transactionPending') {
      toast.loading('Sending tip...');
      setIsTransacting(true);
    }
  }, [address, recipientAddress, tipAmount, selectedToken, postId]);

  const getCalls = useCallback(() => {
    if (!isConnected || !address || !recipientAddress || !tipAmount) {
      return [];
    }

    const amount = parseFloat(tipAmount);
    if (amount <= 0) {
      return [];
    }

    if (selectedToken === 'ETH') {
      // Simple ETH transfer
      return [{
        to: recipientAddress as `0x${string}`,
        value: parseEther(tipAmount)
      }];
    } else {
      // USDC transfer (ERC20)
      const usdcAmount = parseUnits(tipAmount, 6); // USDC has 6 decimals
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, usdcAmount]
      });
      
      return [{
        to: USDC_ADDRESS as `0x${string}`,
        data
      }];
    }
  }, [address, recipientAddress, tipAmount, selectedToken, isConnected]);

  const formatBalance = (balance: any, symbol: string) => {
    if (!balance) return '0';
    const decimals = symbol === 'USDC' ? 6 : 18;
    return parseFloat(formatUnits(balance.value, decimals)).toFixed(decimals === 6 ? 2 : 6);
  };

  const hasInsufficientBalance = () => {
    const amount = parseFloat(tipAmount);
    if (selectedToken === 'ETH') {
      return !ethBalance || parseFloat(formatEther(ethBalance.value)) < amount;
    } else {
      return !usdcBalance || parseFloat(formatUnits(usdcBalance.value, 6)) < amount;
    }
  };

  if (!isConnected) {
    return null;
  }

  if (isSelfTip) {
    return null; // Don't show tip button for own posts
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-1 hover:text-green-500 transition-colors ${className}`}
        disabled={isTransacting}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
        <span className="text-xs">Tip</span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          {/* Backdrop overlay */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-md"
            onClick={() => setIsOpen(false)}
          ></div>
          
          {/* Modal positioned in center */}
          <div className="relative w-80 max-w-[90vw] bg-gradient-to-br from-gray-900 via-black to-blue-900 backdrop-blur-xl rounded-2xl shadow-2xl border border-blue-500/30 p-6 overflow-hidden">
            {/* Neonowa poświata */}
            <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/30 rounded-full filter blur-2xl animate-pulse"></div>
            <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-cyan-400/20 rounded-full filter blur-xl"></div>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent"></div>
            
            {/* Efekt szkła */}
            <div className="absolute inset-0 bg-white/5 backdrop-blur-sm rounded-2xl"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-light text-white">
                  💰 <span className="bg-gradient-to-r from-blue-400 to-cyan-400 text-transparent bg-clip-text">Tip Creator</span>
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-blue-300 hover:text-blue-100 transition-colors bg-white/10 backdrop-blur-sm rounded-full p-1 border border-blue-400/30"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {!isCorrectNetwork && (
                <div className="mb-4 p-3 bg-red-500/20 backdrop-blur-sm border border-red-400/50 rounded-xl text-red-300 text-xs">
                  Please switch to Base Mainnet
                </div>
              )}

              {/* Token Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Token
                </label>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setSelectedToken('ETH')}
                    className={`flex-1 px-4 py-3 text-sm rounded-xl border backdrop-blur-sm transition-all duration-300 ${
                      selectedToken === 'ETH'
                        ? 'bg-blue-500/30 border-blue-400/60 text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.4)] transform scale-105'
                        : 'bg-white/10 border-white/20 text-blue-200 hover:bg-white/20 hover:border-blue-400/40'
                    }`}
                  >
                    ETH
                  </button>
                  <button
                    onClick={() => setSelectedToken('USDC')}
                    className={`flex-1 px-4 py-3 text-sm rounded-xl border backdrop-blur-sm transition-all duration-300 ${
                      selectedToken === 'USDC'
                        ? 'bg-blue-500/30 border-blue-400/60 text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.4)] transform scale-105'
                        : 'bg-white/10 border-white/20 text-blue-200 hover:bg-white/20 hover:border-blue-400/40'
                    }`}
                  >
                    USDC
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Amount
                </label>
                <input
                  type="number"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  min="0"
                  step={selectedToken === 'ETH' ? '0.001' : '0.01'}
                  className="w-full px-4 py-3 text-sm border bg-white/10 backdrop-blur-sm border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400/60 placeholder-blue-300/50"
                  placeholder={selectedToken === 'ETH' ? '0.001' : '1.00'}
                />
              </div>

              {/* Balance Display */}
              <div className="mb-4 text-sm text-blue-300">
                Your balance: {formatBalance(selectedToken === 'ETH' ? ethBalance : usdcBalance, selectedToken)} {selectedToken}
              </div>

              {/* Quick Amount Buttons */}
              <div className="mb-6">
                <div className="flex space-x-2">
                  {selectedToken === 'ETH' ? (
                    <>
                      <button
                        onClick={() => setTipAmount('0.001')}
                        className="flex-1 px-3 py-2 text-sm bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all duration-300"
                      >
                        0.001
                      </button>
                      <button
                        onClick={() => setTipAmount('0.01')}
                        className="flex-1 px-3 py-2 text-sm bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all duration-300"
                      >
                        0.01
                      </button>
                      <button
                        onClick={() => setTipAmount('0.1')}
                        className="flex-1 px-3 py-2 text-sm bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all duration-300"
                      >
                        0.1
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setTipAmount('1')}
                        className="flex-1 px-3 py-2 text-sm bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all duration-300"
                      >
                        $1
                      </button>
                      <button
                        onClick={() => setTipAmount('5')}
                        className="flex-1 px-3 py-2 text-sm bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all duration-300"
                      >
                        $5
                      </button>
                      <button
                        onClick={() => setTipAmount('10')}
                        className="flex-1 px-3 py-2 text-sm bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all duration-300"
                      >
                        $10
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Transaction Button */}
              <Transaction
                chainId={base.id}
                calls={getCalls()}
                onStatus={handleTransactionStatus}
              >
                <TransactionButton
                  text={
                    hasInsufficientBalance()
                      ? `Insufficient ${selectedToken}`
                      : isTransacting
                      ? 'Sending...'
                      : `Tip ${tipAmount} ${selectedToken}`
                  }
                  disabled={
                    !isCorrectNetwork ||
                    hasInsufficientBalance() ||
                    parseFloat(tipAmount) <= 0 ||
                    isTransacting
                  }
                  className="w-full"
                />
              </Transaction>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
} 