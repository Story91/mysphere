'use client';

import React, { useState } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { PAID_PIN_CONTRACT_CONFIG, PAID_PIN_CONTRACT_ABI } from '../config/contractConfig';
import { getPriceForDuration, calculateTotalCost, getDurationInMilliseconds } from '../utils/pinPricing';
import { PinDuration } from '../../../utils/firebase';
import { parseEther, formatEther } from 'viem';
import { toast } from 'react-hot-toast';
import { Clock, Plus, X } from 'lucide-react';

interface ExtendPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  currentExpiresAt?: number;
  onExtendSuccess?: (txHash: string, additionalDuration: PinDuration) => void;
}

const DURATION_OPTIONS = [
  { duration: 'HOUR_1' as PinDuration, label: '1 Hour', icon: '⏰' },
  { duration: 'HOURS_6' as PinDuration, label: '6 Hours', icon: '🕕' },
  { duration: 'HOURS_24' as PinDuration, label: '24 Hours', icon: '📅', popular: true },
  { duration: 'DAYS_7' as PinDuration, label: '7 Days', icon: '📆' },
];

export default function ExtendPinModal({
  isOpen,
  onClose,
  postId,
  currentExpiresAt,
  onExtendSuccess
}: ExtendPinModalProps) {
  const { address } = useAccount();
  const [selectedDuration, setSelectedDuration] = useState<PinDuration>('HOURS_24');
  const [isExtending, setIsExtending] = useState(false);

  const { writeContract } = useWriteContract();

  // Read user's ETH balance
  const { data: balance } = useReadContract({
    address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
    abi: PAID_PIN_CONTRACT_ABI,
    functionName: 'getBalance',
  });

  const selectedPrice = calculateTotalCost(selectedDuration);

  const handleExtendPin = async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }

    try {
      setIsExtending(true);

             const tx = await writeContract({
         address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
         abi: PAID_PIN_CONTRACT_ABI,
         functionName: 'extendPin',
         args: [postId, selectedDuration],
         value: parseEther(selectedPrice.ethAmount),
       });

       toast.success('Extension transaction sent! Pin will be extended after confirmation.');
       
       if (onExtendSuccess && tx) {
         onExtendSuccess(tx, selectedDuration);
       }

      onClose();
    } catch (error: any) {
      console.error('Extension error:', error);
      
      if (error.message?.includes('user rejected')) {
        toast.error('Transaction cancelled by user');
      } else if (error.message?.includes('insufficient funds')) {
        toast.error('Insufficient funds for extension');
      } else {
        toast.error('Extension failed. Please try again.');
      }
    } finally {
      setIsExtending(false);
    }
  };

  const calculateNewExpirationTime = () => {
    if (!currentExpiresAt) return null;
    
    const additionalMs = getDurationInMilliseconds(selectedDuration);
    const newExpiresAt = currentExpiresAt + additionalMs;
    
    return new Date(newExpiresAt).toLocaleString();
  };

  const formatTimeRemaining = () => {
    if (!currentExpiresAt) return 'Unknown';
    
    const now = Date.now();
    const remaining = currentExpiresAt - now;
    
    if (remaining <= 0) return 'Expired';
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full max-h-95vh overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-green-500 rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Extend Pin</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Add more time to your pin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Current Status */}
        {currentExpiresAt && (
          <div className="p-6 bg-blue-50 dark:bg-blue-900/20 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3 mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-blue-900 dark:text-blue-300">Current Pin Status</h3>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              {formatTimeRemaining()}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
              Expires: {new Date(currentExpiresAt).toLocaleString()}
            </p>
          </div>
        )}

        {/* Duration Selection */}
        <div className="p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
            Select Additional Time
          </h3>
          
                     <div className="grid grid-cols-2 gap-3">
             {DURATION_OPTIONS.map((option) => {
               const price = calculateTotalCost(option.duration);
               const isSelected = selectedDuration === option.duration;
               
               return (
                 <button
                   key={option.duration}
                   onClick={() => setSelectedDuration(option.duration)}
                   className={`relative p-4 rounded-lg border-2 transition-all ${
                     isSelected
                       ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                       : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                   }`}
                 >
                   {option.popular && (
                     <div className="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                       POPULAR
                     </div>
                   )}
                   
                   <div className="text-center">
                     <div className="text-2xl mb-2">{option.icon}</div>
                     <div className="font-semibold text-gray-900 dark:text-white">
                       {option.label}
                     </div>
                     <div className="text-sm text-gray-600 dark:text-gray-400">
                       {price.ethAmount} ETH
                     </div>
                     <div className="text-xs text-gray-500 dark:text-gray-500">
                       ${price.usdAmount}
                     </div>
                   </div>
                 </button>
               );
             })}
          </div>

          {/* New Expiration Preview */}
          {currentExpiresAt && (
            <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <h4 className="font-semibold text-green-900 dark:text-green-300 mb-2">
                New Expiration Time
              </h4>
              <p className="text-sm text-green-700 dark:text-green-400">
                {calculateNewExpirationTime()}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col space-y-4">
            {/* Payment Summary */}
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="font-medium text-gray-900 dark:text-white">
                Extension Cost:
              </span>
              <div className="text-right">
                <div className="font-bold text-lg text-gray-900 dark:text-white">
                  {selectedPrice.ethAmount} ETH
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  ≈ ${selectedPrice.usdAmount}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              
              <button
                onClick={handleExtendPin}
                disabled={isExtending || !address}
                className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                  isExtending || !address
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                }`}
              >
                {isExtending ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Extending...</span>
                  </div>
                ) : (
                  'Extend Pin'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 