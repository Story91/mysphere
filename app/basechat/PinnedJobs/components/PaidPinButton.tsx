'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { Crown, DollarSign } from 'lucide-react';
import { PinDuration } from '../../../utils/firebase';
import PaidPinModal from './PaidPinModal';

interface PaidPinButtonProps {
  postId: string;
  postContent: string;
  authorAddress: string;
  isPinned?: boolean;
  isPaidPin?: boolean;
  className?: string;
  onPinSuccess?: (txHash: string, duration: PinDuration) => void;
}

export default function PaidPinButton({
  postId,
  postContent,
  authorAddress,
  isPinned = false,
  isPaidPin = false,
  className = '',
  onPinSuccess
}: PaidPinButtonProps) {
  const { address } = useAccount();
  const [showPaidPinModal, setShowPaidPinModal] = useState(false);

  // Pokazuj button tylko jeśli:
  // - Post NIE jest już przypięty (admin lub paid)
  // - Użytkownik jest zalogowany
  // - To jest WŁASNY post użytkownika
  const shouldShowButton = 
    !isPinned && 
    address && 
    address.toLowerCase() === authorAddress.toLowerCase();

  if (!shouldShowButton) {
    return null;
  }

  const handlePinClick = () => {
    setShowPaidPinModal(true);
  };

  const handlePinSuccess = (txHash: string, duration: PinDuration) => {
    setShowPaidPinModal(false);
    if (onPinSuccess) {
      onPinSuccess(txHash, duration);
    }
  };

  return (
    <>
      {/* Pin Button */}
      <button
        onClick={handlePinClick}
        className={`flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-all transform hover:scale-105 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white shadow-md hover:shadow-lg ${className}`}
        title="Pin this post to the top"
      >
        <Crown className="w-3 h-3" />
        <span>Pin Post</span>
        <DollarSign className="w-3 h-3" />
      </button>

      {/* Modal */}
      <PaidPinModal
        isOpen={showPaidPinModal}
        onClose={() => setShowPaidPinModal(false)}
        postId={postId}
        postContent={postContent}
        authorAddress={authorAddress}
        onPinSuccess={handlePinSuccess}
      />
    </>
  );
} 