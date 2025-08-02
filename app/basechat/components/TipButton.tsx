'use client';

import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useChainId, useBalance, useSwitchChain } from 'wagmi';
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
// Base Pay imports
import { pay, getPaymentStatus } from '@base-org/account';
import { BasePayButton } from '@base-org/account-ui/react';

// USDC contract address on Base Mainnet (official) - Updated Jan 2024
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
console.log('💰 Using USDC address:', USDC_ADDRESS);

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
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  
  // Mobile debugging - DISABLED
  // useEffect(() => {
  //   console.log('📱 Mobile Debug - Wallet state:', {
  //     isConnected,
  //     address,
  //     chainId,
  //     isCorrectNetwork: chainId === base.id
  //   });
  // }, [isConnected, address, chainId]);
  
  // Prevent body scroll when modal is open (mobile fix)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen]);
  
  // Get user balances
  const { data: ethBalance, error: ethBalanceError, isLoading: ethLoading } = useBalance({
    address: address,
    chainId: base.id
  });
  
  const { data: usdcBalance, error: usdcBalanceError, isLoading: usdcLoading } = useBalance({
    address: address,
    token: USDC_ADDRESS as `0x${string}`,
    chainId: base.id
  });
  
  // Mobile debugging for balances - DISABLED
  // useEffect(() => {
  //   console.log('📱 Balance Debug - Full state:', {
  //     address,
  //     chainId,
  //     baseId: base.id,
  //     usdcAddress: USDC_ADDRESS,
  //     ethBalance: ethBalance ? formatEther(ethBalance.value) : 'null',
  //     usdcBalance: usdcBalance ? formatUnits(usdcBalance.value, 6) : 'null',
  //     ethBalanceError: ethBalanceError?.message || 'none',
  //     usdcBalanceError: usdcBalanceError?.message || 'none',
  //     ethLoading,
  //     usdcLoading,
  //     isCorrectNetwork: chainId === base.id
  //   });
  // }, [address, chainId, ethBalance, usdcBalance, ethBalanceError, usdcBalanceError, ethLoading, usdcLoading]);

  // Check if user is trying to tip themselves
  const isSelfTip = address?.toLowerCase() === recipientAddress.toLowerCase();

  // Check if on correct network
  const isCorrectNetwork = chainId === base.id;

  // Function to ensure we're on Base network before transaction
  const ensureBaseNetwork = useCallback(async () => {
    if (chainId !== base.id) {
      try {
        console.log('🔄 Switching to Base network...');
        await switchChain({ chainId: base.id });
        console.log('✅ Switched to Base network');
        return true;
      } catch (error) {
        console.error('❌ Failed to switch to Base network:', error);
        toast.error('Please switch to Base network manually');
        return false;
      }
    }
    return true;
  }, [chainId, switchChain]);

  const handleTransactionStatus = useCallback(async (status: any) => {
    // console.log('🔄 Transaction status:', status); // Debug log
    
    if (status.statusName === 'success') {
      try {
        toast.dismiss(); // Clear loading toasts
        
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
      
      // Show success state
      setTransactionSuccess(true);
      
      // Wait 2 seconds before closing modal and resetting
      setTimeout(() => {
        setIsTransacting(false);
        setTransactionSuccess(false);
        setIsOpen(false);
        setTipAmount('0.001');
      }, 2000);
    } else if (status.statusName === 'error') {
      toast.dismiss(); // Clear loading toasts
      const errorMessage = status.statusData?.message || 'Transaction failed';
      console.error('❌ Transaction error:', errorMessage, status); // Debug log
      toast.error(`Tip failed: ${errorMessage}`);
      setIsTransacting(false);
    } else if (status.statusName === 'transactionPending') {
      toast.dismiss(); // Clear previous toasts
      toast.loading('Sending tip...', { duration: 0 }); // Keep loading until success/error
      setIsTransacting(true);
    } else if (status.statusName === 'transactionLegacy') {
      toast.dismiss(); // Clear previous toasts
      toast.loading('Processing transaction...', { duration: 0 });
      setIsTransacting(true);
    }
    
    console.log('🔄 Transaction status complete:', {
      statusName: status.statusName,
      isTransacting,
      transactionSuccess,
      isOpen
    });
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
      const call = {
        to: recipientAddress as `0x${string}`,
        value: parseEther(tipAmount)
      };
      return [call];
    } else {
      // USDC transfer (ERC20)
      const usdcAmount = parseUnits(tipAmount, 6); // USDC has 6 decimals
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, usdcAmount]
      });
      
      const call = {
        to: USDC_ADDRESS as `0x${string}`,
        data
      };
      return [call];
    }
  }, [address, recipientAddress, tipAmount, selectedToken, isConnected, chainId]);

  const formatBalance = (balance: any, symbol: string, isLoading?: boolean) => {
    if (isLoading) return 'Loading...';
    if (!balance) return '0.00';
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
        onClick={() => {
          // console.log('📱 Mobile Debug - Tip button clicked');
          setIsOpen(!isOpen);
          setTransactionSuccess(false); // Reset success state
        }}
        className={`flex items-center space-x-1 hover:text-green-500 active:text-green-600 transition-colors touch-manipulation ${className}`}
        disabled={isTransacting}
        title="Send tip"
      >
        {/* 💲 Mobile: tylko emotka dolara, Desktop: ikona + tekst */}
        <span className="md:hidden text-sm">💲</span>
        <svg className="hidden md:block w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
        <span className="hidden md:inline text-xs">Tip</span>
      </button>

      {isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overscroll-contain">
          {/* Backdrop overlay */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            onTouchEnd={(e) => {
              // Only close if the touch ended on the backdrop itself
              if (e.target === e.currentTarget) {
                setIsOpen(false);
              }
            }}
          ></div>
          
          {/* Modal positioned in center - Mobile optimized */}
          <div 
            className="relative w-full max-w-sm mx-auto bg-gradient-to-br from-gray-900 via-black to-blue-900 backdrop-blur-xl rounded-2xl shadow-2xl border border-blue-500/30 p-6 overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
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
                  className="text-blue-300 hover:text-blue-100 active:text-blue-200 transition-colors bg-white/10 backdrop-blur-sm rounded-full p-2 border border-blue-400/30 touch-manipulation"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {!isCorrectNetwork && (
                <div className="mb-4 p-4 bg-red-500/20 backdrop-blur-sm border border-red-400/50 rounded-xl text-red-300 text-sm">
                  <div className="font-medium mb-1">❌ Wrong Network</div>
                  <div>Please switch to Base Mainnet</div>
                  <div className="text-xs mt-1 opacity-80">
                    Current: {chainId} | Required: {base.id}
                  </div>
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
                    className={`flex-1 px-4 py-4 text-base rounded-xl border backdrop-blur-sm transition-all duration-300 touch-manipulation ${
                      selectedToken === 'ETH'
                        ? 'bg-blue-500/30 border-blue-400/60 text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.4)] transform scale-105'
                        : 'bg-white/10 border-white/20 text-blue-200 hover:bg-white/20 hover:border-blue-400/40 active:bg-white/30'
                    }`}
                  >
                    ETH
                  </button>
                  <button
                    onClick={() => setSelectedToken('USDC')}
                    className={`flex-1 px-4 py-4 text-base rounded-xl border backdrop-blur-sm transition-all duration-300 touch-manipulation ${
                      selectedToken === 'USDC'
                        ? 'bg-blue-500/30 border-blue-400/60 text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.4)] transform scale-105'
                        : 'bg-white/10 border-white/20 text-blue-200 hover:bg-white/20 hover:border-blue-400/40 active:bg-white/30'
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
                  className="w-full px-4 py-4 text-base border bg-white/10 backdrop-blur-sm border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400/60 placeholder-blue-300/50 touch-manipulation"
                  placeholder={selectedToken === 'ETH' ? '0.001' : '1.00'}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </div>

                            {/* Balance Display */}
              <div className="mb-4 text-sm text-blue-300">
                <div className="flex items-center justify-between">
                  <span>
                    Your balance: {formatBalance(
                      selectedToken === 'ETH' ? ethBalance : usdcBalance, 
                      selectedToken,
                      selectedToken === 'ETH' ? ethLoading : usdcLoading
                    )} {selectedToken}
                  </span>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh</span>
                  </button>
                </div>
                {(selectedToken === 'ETH' ? ethBalanceError : usdcBalanceError) && (
                  <div className="text-red-300 text-xs mt-1">
                    Error: {(selectedToken === 'ETH' ? ethBalanceError : usdcBalanceError)?.message}
                    {selectedToken === 'USDC' && (
                      <div className="mt-1 text-xs opacity-80">
                        Try refreshing or switching networks
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Amount Buttons */}
              <div className="mb-6">
                <div className="flex space-x-2">
                  {selectedToken === 'ETH' ? (
                    <>
                      <button
                        onClick={() => setTipAmount('0.001')}
                        className="flex-1 px-3 py-3 text-base bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:bg-blue-500/30 transition-all duration-300 touch-manipulation"
                      >
                        0.001
                      </button>
                      <button
                        onClick={() => setTipAmount('0.01')}
                        className="flex-1 px-3 py-3 text-base bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:bg-blue-500/30 transition-all duration-300 touch-manipulation"
                      >
                        0.01
                      </button>
                      <button
                        onClick={() => setTipAmount('0.1')}
                        className="flex-1 px-3 py-3 text-base bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:bg-blue-500/30 transition-all duration-300 touch-manipulation"
                      >
                        0.1
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setTipAmount('1')}
                        className="flex-1 px-3 py-3 text-base bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:bg-blue-500/30 transition-all duration-300 touch-manipulation"
                      >
                        $1
                      </button>
                      <button
                        onClick={() => setTipAmount('5')}
                        className="flex-1 px-3 py-3 text-base bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:bg-blue-500/30 transition-all duration-300 touch-manipulation"
                      >
                        $5
                      </button>
                      <button
                        onClick={() => setTipAmount('10')}
                        className="flex-1 px-3 py-3 text-base bg-white/10 backdrop-blur-sm border border-blue-400/30 rounded-xl text-blue-200 hover:bg-blue-500/20 hover:border-blue-400/60 hover:text-blue-100 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] active:bg-blue-500/30 transition-all duration-300 touch-manipulation"
                      >
                        $10
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Transaction Button */}
              <div className="mt-6">
                {isTransacting && !transactionSuccess && (
                  <div className="mb-4 p-3 bg-yellow-500/20 backdrop-blur-sm border border-yellow-400/50 rounded-xl text-yellow-300 text-sm text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-300 border-t-transparent"></div>
                      <div className="text-center">
                        <div>Processing transaction...</div>
                        <div className="text-xs opacity-80 mt-1">Modal will stay open until complete</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {transactionSuccess && (
                  <div className="mb-4 p-3 bg-green-500/20 backdrop-blur-sm border border-green-400/50 rounded-xl text-green-300 text-sm text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div className="text-center">
                        <div>Tip sent successfully! 🎉</div>
                        <div className="text-xs opacity-80 mt-1">Closing in 2 seconds...</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Traditional wallet payments */}
                {!isCorrectNetwork ? (
                  <button
                    onClick={async () => {
                      const switched = await ensureBaseNetwork();
                      if (switched) {
                        toast.success('Switched to Base network! Now you can send tips.');
                      }
                    }}
                    className="w-full px-6 py-4 text-base font-medium rounded-xl touch-manipulation mb-3 bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Switch to Base Network
                  </button>
                ) : (
                  <Transaction
                    chainId={base.id}
                    calls={getCalls()}
                    onStatus={handleTransactionStatus}
                    onError={(error) => {
                      console.error('Transaction error:', error);
                      toast.dismiss();
                      toast.error(`Transaction failed: ${error.message || 'Unknown error'}`);
                      setIsTransacting(false);
                      setTransactionSuccess(false);
                    }}
                  >
                    <TransactionButton
                      text={
                        hasInsufficientBalance()
                          ? `Insufficient ${selectedToken}`
                          : isTransacting
                          ? 'Processing...'
                          : `Tip ${tipAmount} ${selectedToken}`
                      }
                      disabled={
                        hasInsufficientBalance() ||
                        parseFloat(tipAmount) <= 0 ||
                        isTransacting
                      }
                      className="w-full px-6 py-4 text-base font-medium rounded-xl touch-manipulation mb-3"
                    />
                  </Transaction>
                )}
                
                {/* Base Pay Button - tylko dla USDC */}
                {selectedToken === 'USDC' && (
                  <div className="text-center">
                    <div className="text-xs text-blue-300 mb-2">Or pay with Base Pay:</div>
                    <BasePayButton
                      colorScheme="dark"
                      onClick={async () => {
                        try {
                          // Ensure we're on Base network first
                          const switched = await ensureBaseNetwork();
                          if (!switched) {
                            return;
                          }
                          
                          setIsTransacting(true);
                          
                          const paymentResult = await pay({
                            amount: tipAmount,
                            to: recipientAddress,
                            testnet: false
                          });
                          
                          // Bezpieczne wydobycie ID z różnych możliwych struktur PaymentResult
                          const id = (paymentResult as any)?.id || 
                                    (paymentResult as any)?.paymentId || 
                                    (paymentResult as any)?.transactionId || 
                                    paymentResult;
                          
                          // Poll for transaction status
                          const pollStatus = async () => {
                            try {
                              const { status } = await getPaymentStatus({ 
                                id,
                                testnet: false
                              });
                              
                              if (status === 'completed') {
                                // Zapisz do Firebase jako USDC tip (Base Pay używa USDC)
                                await saveTip({
                                  senderAddress: address!,
                                  recipientAddress,
                                  amount: tipAmount,
                                  token: 'USDC', // Base Pay używa USDC
                                  postId,
                                  txHash: id, // Base Pay transaction ID
                                  network: 'base'
                                });
                                
                                toast.success('Tip sent via Base Pay! 🎉');
                                setTransactionSuccess(true);
                                setIsTransacting(false);
                                
                                setTimeout(() => {
                                  setIsOpen(false);
                                  setTransactionSuccess(false);
                                }, 2000);
                              } else if (status === 'failed') {
                                throw new Error('Payment failed');
                              } else {
                                setTimeout(pollStatus, 2000);
                              }
                            } catch (error) {
                              console.error('Error checking payment status:', error);
                              toast.error('Failed to verify payment status');
                              setIsTransacting(false);
                            }
                          };
                          
                          setTimeout(pollStatus, 1000);
                          
                        } catch (error) {
                          console.error('Base Pay error:', error);
                          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                          toast.error(`Base Pay failed: ${errorMessage}`);
                          setIsTransacting(false);
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
} 