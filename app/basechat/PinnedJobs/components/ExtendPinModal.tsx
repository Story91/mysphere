'use client';

import React, { useEffect, useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { describeWalletError } from '../../../components/useTxFeedback';
import { PAID_PIN_CONTRACT_CONFIG, PAID_PIN_CONTRACT_ABI, toContractDuration } from '../config/contractConfig';
import { calculateTotalCost, getDurationInMilliseconds } from '../utils/pinPricing';
import { PinDuration } from '../../../utils/firebase';
import { parseEther } from 'viem';
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

  const { writeContractAsync } = useWriteContract();

  const selectedPrice = calculateTotalCost(selectedDuration);

  const handleExtendPin = async () => {
    if (!address) {
      toast.error('Please connect your wallet');
      return;
    }
    if (isExtending) return;

    try {
      setIsExtending(true);

      // writeContractAsync, nie writeContract: wariant synchroniczny zwraca void
      // i nie odrzuca obietnicy, wiec komunikat "transaction sent" pokazywal sie
      // zanim uzytkownik cokolwiek podpisal - takze po odmowie i po bledzie.
      const txHash = await writeContractAsync({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'extendPin',
        // Kontrakt oczekuje uint8, nie nazwy czasu trwania.
        args: [postId, toContractDuration(selectedDuration)],
        value: parseEther(selectedPrice.ethAmount),
        chainId: PAID_PIN_CONTRACT_CONFIG.chainId,
      });

      toast.success('Extension transaction sent! Pin will be extended after confirmation.');

      onExtendSuccess?.(txHash, selectedDuration);
      onClose();
    } catch (error) {
      console.error('Extension error:', error);

      // Poprzednie dopasowanie szukalo `error.message.includes('user rejected')`.
      // viem pisze "User rejected the request." z wielkiej litery, a kod 4001
      // siedzi dopiero w `cause`, wiec ten warunek NIGDY nie byl prawdziwy:
      // odmowa podpisu ladowala w galezi "Extension failed. Please try again."
      // i wygladala jak awaria aplikacji. Tak samo bylo z brakiem srodkow.
      const info = describeWalletError(error, {
        network: 'Base',
        gasSymbol: 'ETH',
      });
      if (info.isFailure) {
        toast.error(info.message || 'Extension failed. Please try again.');
      } else {
        toast(info.message);
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

  // Escape zamyka okno. Dotad wyjsciem byla tylko mysz - klawiatura zostawala
  // uwieziona w oknie proszacym o pieniadze.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-soft-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Extend pin"
        className="bg-soft-surface rounded-card shadow-float max-w-md w-full max-h-95vh overflow-y-auto font-soft"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-soft-line">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-soft-primary rounded-pill flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-soft-display text-xl font-bold text-soft-ink">Extend Pin</h2>
              <p className="text-sm text-soft-ink-muted">Add more time to your pin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close extend pin dialog"
            className="rounded-pill p-1 text-soft-ink-soft transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Current Status */}
        {currentExpiresAt && (
          <div className="p-6 bg-soft-sunken border-b border-soft-line">
            <div className="flex items-center space-x-3 mb-2">
              <Clock className="w-5 h-5 text-soft-primary-deep" />
              <h3 className="font-soft-display font-semibold text-soft-ink">Current Pin Status</h3>
            </div>
            <p className="text-sm text-soft-ink-muted">
              {formatTimeRemaining()}
            </p>
            <p className="text-xs text-soft-ink-soft mt-1">
              Expires: {new Date(currentExpiresAt).toLocaleString()}
            </p>
          </div>
        )}

        {/* Duration Selection */}
        <div className="p-6">
          <h3 className="font-soft-display font-semibold text-soft-ink mb-4">
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
                   className={`relative p-4 rounded-card border-2 transition-[background-color,border-color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                     isSelected
                       ? 'border-soft-primary bg-soft-sunken'
                       : 'border-soft-line hover:border-soft-line-strong'
                   }`}
                 >
                   {option.popular && (
                     <div className="absolute -top-2 -right-2 bg-soft-accent text-soft-ink font-soft-display text-xs px-2 py-1 rounded-pill font-bold">
                       POPULAR
                     </div>
                   )}
                   
                   <div className="text-center">
                     <div className="text-2xl mb-2">{option.icon}</div>
                     <div className="font-soft-display font-semibold text-soft-ink">
                       {option.label}
                     </div>
                     <div className="font-soft-display text-sm tabular-nums text-soft-ink-muted">
                       {price.ethAmount} ETH
                     </div>
                     <div className="font-soft-display text-xs tabular-nums text-soft-ink-soft">
                       ${price.usdAmount}
                     </div>
                   </div>
                 </button>
               );
             })}
          </div>

          {/* New Expiration Preview */}
          {currentExpiresAt && (
            <div className="mt-6 p-4 bg-soft-accent-soft rounded-card">
              <h4 className="font-soft-display font-semibold text-soft-accent-deep mb-2">
                New Expiration Time
              </h4>
              <p className="text-sm text-soft-accent-deep">
                {calculateNewExpirationTime()}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-soft-line">
          <div className="flex flex-col space-y-4">
            {/* Payment Summary */}
            <div className="flex items-center justify-between p-3 bg-soft-sunken rounded-card">
              <span className="font-semibold text-soft-ink">
                Extension Cost:
              </span>
              <div className="text-right">
                <div className="font-soft-display font-bold text-lg tabular-nums text-soft-ink">
                  {selectedPrice.ethAmount} ETH
                </div>
                <div className="font-soft-display text-sm tabular-nums text-soft-ink-muted">
                  ≈ ${selectedPrice.usdAmount}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 font-semibold border border-soft-line text-soft-ink-muted rounded-pill transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-sunken hover:text-soft-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              
              <button
                onClick={handleExtendPin}
                disabled={isExtending || !address}
                className={`flex-1 px-4 py-3 rounded-pill font-semibold transition-[background-color,box-shadow,transform] [transition-duration:var(--dur-press)] ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                  isExtending || !address
                    ? 'bg-soft-sunken text-soft-ink-soft cursor-not-allowed'
                    : 'bg-soft-primary hover:bg-soft-primary-deep text-white shadow-chip hover:shadow-float active:scale-[0.97]'
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