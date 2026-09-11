"use client";

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from '../config/simpleMarketplace';

interface OfferModalProps {
  nft: any;
  onClose: () => void;
}

export default function OfferModal({ nft, onClose }: OfferModalProps) {
  const { address } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash: txHash });
  
  const [offerAmount, setOfferAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const listingPrice = parseFloat(nft.price || '0');
  const offerValue = parseFloat(offerAmount || '0');
  const percentOfListing = listingPrice > 0 ? ((offerValue / listingPrice) * 100).toFixed(1) : '0';

  const handleMakeOffer = async () => {
    if (!address || !offerAmount || offerValue <= 0) {
      toast.error('Enter a valid offer amount');
      return;
    }
    
    try {
      setLoading(true);
      writeContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'makeOffer',
        args: [
          BigInt(nft.listingId),
          parseEther(offerAmount),
          0n, // payment token (native) - using 0n for native ETH
        ],
        value: parseEther(offerAmount),
      });
      toast.loading('Making offer...');
    } catch (error: any) {
      toast.error('Failed to make offer');
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    toast.dismiss();
    toast.success('Offer made successfully!');
    setTimeout(onClose, 2000);
  }

  if (isError) {
    toast.dismiss();
    toast.error('Offer failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="bg-white border border-soft-line rounded-[26px] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-bold text-soft-ink">Make Offer</h2>
          <button onClick={onClose} className="text-soft-ink-muted hover:text-soft-ink transition-colors">✕</button>
        </div>

        <div className="space-y-4">
          {/* NFT Preview */}
          <div className="flex items-center gap-3 p-3 bg-white rounded-lg">
            {nft.image && (
              <img src={nft.image} alt={nft.metadata?.name} className="w-12 h-12 rounded object-cover" />
            )}
            <div>
              <div className="text-white font-medium">{nft.metadata?.name || `#${nft.tokenId}`}</div>
              <div 
                className="text-xs text-soft-ink-muted cursor-pointer hover:text-soft-accent-deep" 
                onClick={() => {
                  navigator.clipboard.writeText(nft.tokenId);
                  toast.success('Token ID copied!');
                }}
                title="Click to copy"
              >
                #{nft.tokenId.length > 15 ? `${nft.tokenId.slice(0, 6)}...${nft.tokenId.slice(-4)}` : nft.tokenId}
              </div>
            </div>
          </div>

          {/* Current Listing Price */}
          <div className="bg-white border border-soft-line rounded-lg p-4">
            <h3 className="text-sm font-semibold text-soft-ink mb-2">Current Price</h3>
            <div className="text-lg font-bold text-soft-accent-deep">{nft.price} $CAMP</div>
          </div>

          {/* Offer Amount */}
          <div>
            <label className="text-sm text-soft-ink-muted block mb-2">Your Offer (CAMP)</label>
            <input
              type="number"
              step="0.01"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-soft-surface-sunken border border-soft-line rounded-lg px-3 py-2 text-soft-ink focus:border-soft-accent focus:outline-none"
            />
            {offerValue > 0 && listingPrice > 0 && (
              <div className="text-xs mt-1">
                <span className={`${offerValue >= listingPrice ? 'text-green-400' : offerValue >= listingPrice * 0.8 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {percentOfListing}% of listing price
                </span>
              </div>
            )}
          </div>

          {/* Offer Summary */}
          {offerValue > 0 && (
            <div className="bg-soft-info-soft border border-soft-info/30 rounded-lg p-3">
              <div className="text-sm text-soft-ink-muted">Your Offer</div>
              <div className="text-lg font-bold text-soft-info">{offerValue.toFixed(2)} $CAMP</div>
              <div className="text-xs text-soft-ink-muted mt-1">
                Funds will be held in escrow until accepted or you cancel
              </div>
            </div>
          )}

          {/* Make Offer Button */}
          <button
            onClick={handleMakeOffer}
            disabled={loading || isPending || isConfirming || !address || !offerAmount || offerValue <= 0}
            className="w-full py-3 px-4 bg-soft-primary text-white font-bold rounded-lg hover:bg-soft-primary-deep transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading || isPending || isConfirming ? 'Processing...' : `Make Offer (${offerValue.toFixed(2)} $CAMP)`}
          </button>

          <div className="text-xs text-soft-ink-soft text-center">
            Note: Offers can be cancelled anytime before acceptance
          </div>
        </div>
      </div>
    </div>
  );
}
