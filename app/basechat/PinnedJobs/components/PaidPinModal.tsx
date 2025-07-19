'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useBalance } from 'wagmi';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import { X, Clock, DollarSign, Zap, Crown } from 'lucide-react';
import { getAllDurations, calculateTotalCost, formatTimeLeft, calculateExpirationTime } from '../utils/pinPricing';
import { createPaidPin, canPinPost, PinDuration } from '../../../utils/firebase';

// Smart Contract Integration
import { PAID_PIN_CONTRACT_CONFIG, PAID_PIN_CONTRACT_ABI, ContractPinDuration } from '../config/contractConfig';


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
  const [currentEthPrice, setCurrentEthPrice] = useState(2500); // Mock
  
  const { data: hash, writeContract, isPending, error: contractError } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ 
    hash, 
  });

  useEffect(() => {
    if (isConfirming) {
      toast.loading('Processing transaction... Please wait.', { id: hash });
    }
    if (isConfirmed) {
      toast.success('Transaction successful! Your post will be pinned in ~5 minutes.', { id: hash, duration: 6000 });
      // The actual pin creation logic will now be triggered here
      handleFirebasePinning();
    }
    if (contractError) {
      toast.error(contractError.message || 'Transaction failed.', { id: hash });
      setIsProcessing(false);
    }
  }, [isConfirming, isConfirmed, contractError, hash]);
  
  const handleFirebasePinning = async () => {
    if (!hash || !address) return;
    
    const success = await createPaidPin(
      postId,
      address,
      selectedDuration,
      hash,
      selectedPrice.ethAmount
    );

    if (success) {
      toast.success('Post pinned successfully!', { id: hash });
      if (onPinSuccess) {
        onPinSuccess(hash, selectedDuration);
      }
    } else {
      toast.error('Failed to save pin data to Firebase.', { id: hash });
    }
    setIsProcessing(false);
    onClose();
  };

  const handlePayAndPin = async () => {
    if (!address || !canPin || !hasEnoughBalance || isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      const canPostBePinned = await canPinPost(postId);
      if (!canPostBePinned) {
        toast.error('This post is already pinned or cannot be pinned');
        setIsProcessing(false);
        return;
      }
      
      console.log("🚀 Calling smart contract...");
      writeContract({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'pinPost',
        args: [postId, getContractDuration(selectedDuration)],
        value: parseEther(selectedPrice.ethAmount)
      });
      // Logic continues in the useEffect hook watching for transaction status
      
    } catch (error) {
      console.error('Error initiating pin transaction:', error);
      toast.error('Failed to start transaction. Please try again.');
      setIsProcessing(false);
    }
  };
  
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
          <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handlePayAndPin}
            disabled={!canPin || !hasEnoughBalance || isProcessing || isPending || isConfirming}
            className="w-full px-6 py-3.5 text-base font-bold text-white rounded-xl transition-all transform hover:scale-105 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isProcessing || isPending || isConfirming
              ? 'Processing...'
              : `⚡ Pay ${selectedPrice.ethAmount} ETH & Pin`}
          </button>
          </div>

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