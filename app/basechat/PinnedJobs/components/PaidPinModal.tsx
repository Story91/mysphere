'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useBalance } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { toast } from 'react-hot-toast';
import { X, Clock, DollarSign, Zap, Crown } from 'lucide-react';
import { getAllDurations, calculateTotalCost, formatTimeLeft, calculateExpirationTime } from '../utils/pinPricing';
import { createPaidPin, canPinPost, PinDuration } from '../../../utils/firebase';

// Smart Contract Integration
import { PAID_PIN_CONTRACT_CONFIG, PAID_PIN_CONTRACT_ABI, ContractPinDuration } from '../config/contractConfig';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

interface PaidPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postContent: string;
  authorAddress: string;
  onPinSuccess?: (txHash: string, duration: PinDuration) => void;
}

export default function PaidPinModal({
  isOpen,
  onClose,
  postId,
  postContent,
  authorAddress,
  onPinSuccess
}: PaidPinModalProps) {
  const { address } = useAccount();
  const { data: balance } = useBalance({ address });
  
  const [selectedDuration, setSelectedDuration] = useState<PinDuration>('HOURS_24');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentEthPrice, setCurrentEthPrice] = useState(2500); // Mock ETH price, można podłączyć do API
  const [txHash, setTxHash] = useState<string | null>(null);
  
  // Smart Contract Integration
  const { writeContract, isPending: isContractPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  });
  
  // Map internal duration to contract enum
  const getContractDuration = (duration: PinDuration): number => {
    const mapping: Record<PinDuration, number> = {
      'HOUR_1': ContractPinDuration.HOUR_1,
      'HOURS_6': ContractPinDuration.HOURS_6, 
      'HOURS_24': ContractPinDuration.HOURS_24,
      'DAYS_7': ContractPinDuration.DAYS_7
    };
    return mapping[duration];
  };
  
  const durations = getAllDurations();
  const selectedPrice = calculateTotalCost(selectedDuration, currentEthPrice);
  const expirationTime = calculateExpirationTime(selectedDuration);
  
  // Sprawdź czy użytkownik ma wystarczająco ETH
  const hasEnoughBalance = balance && parseFloat(balance.formatted) >= parseFloat(selectedPrice.ethAmount);
  
  // Sprawdź czy użytkownik może pinować (tylko swój post)
  const canPin = address && address.toLowerCase() === authorAddress.toLowerCase();

  useEffect(() => {
    // Reset form when modal opens
    if (isOpen) {
      setSelectedDuration('HOURS_24');
      setIsProcessing(false);
      
      // Blokuj scroll na body kiedy modal jest otwarty
      document.body.style.overflow = 'hidden';
    } else {
      // Przywróć scroll gdy modal jest zamknięty
      document.body.style.overflow = 'auto';
    }
    
    // Cleanup przy unmount
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  const handlePayAndPin = async () => {
    if (!address || !canPin || !hasEnoughBalance) return;
    
    try {
      setIsProcessing(true);
      
      // 1. Sprawdź czy post może być przypięty
      const canPostBePinned = await canPinPost(postId);
      if (!canPostBePinned) {
        toast.error('This post is already pinned or cannot be pinned');
        return;
      }
      
      // 2. Smart Contract Integration - PIN POST ON BLOCKCHAIN
      let realTxHash: string;
      
      // Check if contract address is set (not placeholder)
      if (PAID_PIN_CONTRACT_CONFIG.address === "YOUR_CONTRACT_ADDRESS") {
        console.log("🚧 Using mock transaction - contract not deployed yet");
        // Fallback to mock for testing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Mock successful transaction
        const realTxHash = '0xmock_' + Math.random().toString(16).substr(2, 60);
        
        // For mock, we manually call createPaidPin since there's no real contract event
        const success = await createPaidPin(
          postId,
          address,
          selectedDuration,
          realTxHash,
          selectedPrice.ethAmount
        );
        
        if (success) {
          toast.success('Post pinned successfully! (Mock mode)');
          if (onPinSuccess) {
            onPinSuccess(realTxHash, selectedDuration);
          }
        } else {
          toast.error('Failed to save pin data.');
        }
        
        onClose();
      } else {
        console.log("🚀 Using real smart contract:", PAID_PIN_CONTRACT_CONFIG.address);
        
        // Real smart contract transaction
        const result = await writeContract({
          address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
          abi: PAID_PIN_CONTRACT_ABI,
          functionName: 'pinPost',
          args: [postId, getContractDuration(selectedDuration)],
          value: parseEther(selectedPrice.ethAmount)
        });
        
        console.log("📜 Transaction sent, waiting for confirmation...");
        toast.success("Transaction sent! Pin will activate after confirmation.");
        
        // ❌ REMOVED: No longer pin immediately in Firebase
        // ✅ Contract event listener will handle pinning after confirmation
        
        onClose(); // Close modal after sending transaction
      }
    } catch (error) {
      console.error('Error pinning post:', error);
      toast.error('Failed to pin post. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-start sm:items-center justify-center z-[99999] p-2 sm:p-4 pt-4 sm:pt-4"
      onClick={onClose}
      style={{ 
        isolation: 'isolate',
        zIndex: 99999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-[92vw] sm:max-w-md max-h-[92vh] sm:max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          zIndex: 99999,
          position: 'relative'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Pin Your Post
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Get premium visibility
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Post Preview */}
          <div className="p-3 sm:p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">Post to pin:</p>
              <p className="text-sm sm:text-base text-gray-900 dark:text-white line-clamp-2 sm:line-clamp-3">
                {postContent}
              </p>
            </div>
          </div>

          {/* Duration Selection */}
          <div className="p-3 sm:p-6">
                      <h4 className="text-sm sm:text-md font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
              Choose Duration
            </h4>
            
            <div className="space-y-2 sm:space-y-3">
            {durations.map((duration) => {
              const cost = calculateTotalCost(duration.duration, currentEthPrice);
              const isSelected = selectedDuration === duration.duration;
              
              return (
                <div
                  key={duration.duration}
                  className={`relative border-2 rounded-lg sm:rounded-xl p-3 sm:p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedDuration(duration.duration)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        isSelected 
                          ? 'border-yellow-400 bg-yellow-400' 
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {isSelected && (
                          <div className="w-full h-full rounded-full bg-white scale-50"></div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                          {duration.label}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          {duration.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                        {cost.ethAmount} ETH
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        ~${cost.usdAmount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Popular badge dla 24h */}
                  {duration.duration === 'HOURS_24' && (
                    <div className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                      POPULAR
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="mt-6 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Duration:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {durations.find(d => d.duration === selectedDuration)?.label}
              </span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Expires at:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {new Date(expirationTime).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total cost:</span>
              <div className="text-right">
                <span className="font-bold text-gray-900 dark:text-white">
                  {selectedPrice.ethAmount} ETH
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                  (~${selectedPrice.usdAmount.toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          {/* Balance Check */}
          {balance && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Your balance:</span>
              <span className={`font-medium ${
                hasEnoughBalance 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {parseFloat(balance.formatted).toFixed(4)} ETH
              </span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handlePayAndPin}
            disabled={!canPin || !hasEnoughBalance || isProcessing}
            className={`w-full mt-4 sm:mt-6 py-2.5 sm:py-3 px-4 rounded-lg sm:rounded-xl text-sm sm:text-base font-medium transition-all ${
              !canPin || !hasEnoughBalance || isProcessing
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]'
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Processing...</span>
              </div>
            ) : !canPin ? (
              "You can only pin your own posts"
            ) : !hasEnoughBalance ? (
              "Insufficient balance"
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <Zap className="w-4 h-4" />
                <span>Pay {selectedPrice.ethAmount} ETH & Pin</span>
              </div>
            )}
          </button>

          {/* Help text */}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
            Your post will be featured at the top of the feed for the selected duration
          </p>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
} 