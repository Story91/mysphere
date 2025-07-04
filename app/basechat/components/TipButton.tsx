'use client';

import { useState, useCallback, useEffect } from 'react';
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
        
        toast.success(`Tip sent successfully! 🎉 Transaction: ${txHash.slice(0, 10)}...`);
        
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

      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setIsOpen(false)}
          ></div>
          
          {/* Modal positioned in center */}
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 max-w-[90vw] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 z-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                💰 Tip Creator
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {!isCorrectNetwork && (
              <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-xs">
                Please switch to Base Mainnet
              </div>
            )}

            {/* Token Selection */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Token
              </label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setSelectedToken('ETH')}
                  className={`flex-1 px-3 py-2 text-xs rounded-md border ${
                    selectedToken === 'ETH'
                      ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300'
                      : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  ETH
                </button>
                <button
                  onClick={() => setSelectedToken('USDC')}
                  className={`flex-1 px-3 py-2 text-xs rounded-md border ${
                    selectedToken === 'USDC'
                      ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-600 dark:text-blue-300'
                      : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
                  }`}
                >
                  USDC
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount
              </label>
              <input
                type="number"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                min="0"
                step={selectedToken === 'ETH' ? '0.001' : '0.01'}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={selectedToken === 'ETH' ? '0.001' : '1.00'}
              />
            </div>

            {/* Balance Display */}
            <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Your balance: {formatBalance(selectedToken === 'ETH' ? ethBalance : usdcBalance, selectedToken)} {selectedToken}
            </div>

            {/* Quick Amount Buttons */}
            <div className="mb-4">
              <div className="flex space-x-2">
                {selectedToken === 'ETH' ? (
                  <>
                    <button
                      onClick={() => setTipAmount('0.001')}
                      className="flex-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      0.001
                    </button>
                    <button
                      onClick={() => setTipAmount('0.01')}
                      className="flex-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      0.01
                    </button>
                    <button
                      onClick={() => setTipAmount('0.1')}
                      className="flex-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      0.1
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setTipAmount('1')}
                      className="flex-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      $1
                    </button>
                    <button
                      onClick={() => setTipAmount('5')}
                      className="flex-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      $5
                    </button>
                    <button
                      onClick={() => setTipAmount('10')}
                      className="flex-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
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
        </>
      )}
    </>
  );
} 