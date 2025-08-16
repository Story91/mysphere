"use client";

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from '../config/simpleMarketplace';
import { toast } from 'react-hot-toast';

interface PurchaseModalProps {
  listing: any;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PurchaseModal({ listing, onClose, onSuccess }: PurchaseModalProps) {
  const { address } = useAccount();
  const [isProcessing, setIsProcessing] = useState(false);
  const { writeContract, data: txHash } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  
  const metadata = listing?.metadata || {};
  const name = metadata.name || `IP NFT #${listing?.tokenId}`;
  const image = listing?.image || metadata.image || '';
  
  const handlePurchase = async () => {
    if (!listing?.listingId) {
      toast.error('Invalid listing');
      return;
    }
    
    try {
      setIsProcessing(true);
      
      writeContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'buyNFT',
        args: [BigInt(listing.listingId)],
        value: parseEther(listing.price || '0'),
      });
      
      toast.loading('Processing purchase...');
    } catch (error: any) {
      console.error('Purchase error:', error);
      toast.error('Failed to purchase NFT');
      setIsProcessing(false);
    }
  };
  
  // Handle success
  if (isSuccess) {
    toast.dismiss();
    toast.success('Purchase successful! 🎉');
    onSuccess?.();
    onClose();
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold text-white">Confirm Purchase</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
        
        {/* NFT Preview */}
        <div className="mb-6">
          <div className="aspect-square relative bg-gray-800 rounded-lg overflow-hidden mb-4">
            {image ? (
              <img 
                src={image.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                alt={name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-6xl">🖼️</div>
              </div>
            )}
          </div>
          
          <h3 className="text-lg font-semibold text-white mb-2">{name}</h3>
          
          {/* Price Breakdown */}
          <div className="bg-black/30 border border-white/10 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Price</span>
              <span className="text-white font-semibold">{listing?.price || '0'} CAMP</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Platform Fee (2.5%)</span>
              <span className="text-white">{((parseFloat(listing?.price || '0') * 0.025).toFixed(4))} CAMP</span>
            </div>
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="text-gray-400">Total</span>
              <span className="text-xl font-bold text-orange-400">{listing?.price || '0'} CAMP</span>
            </div>
          </div>
        </div>
        
        {/* License Terms */}
        {(listing?.commercialUse || listing?.derivativeWorks) && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-400 mb-2">License Terms</h4>
            <div className="flex gap-2">
              {listing.commercialUse && (
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                  Commercial Use
                </span>
              )}
              {listing.derivativeWorks && (
                <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded">
                  Derivative Works
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Warning */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-6">
          <p className="text-xs text-yellow-400">
            ⚠️ This transaction is final and cannot be reversed. Please ensure you have enough CAMP tokens.
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing || isConfirming}
            className="flex-1 py-3 px-4 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handlePurchase}
            disabled={isProcessing || isConfirming || !address}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing || isConfirming ? 'Processing...' : 'Confirm Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}
