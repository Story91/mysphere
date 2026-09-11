"use client";

import { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from '../config/simpleMarketplace';

export default function BidModal({ auctionId, minPrice, onClose }: { auctionId: bigint; minPrice: bigint; onClose: () => void }) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const [amount, setAmount] = useState<string>('');

  const onBid = () => {
    if (!address) return;
    try {
      writeContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'bid',
        args: [auctionId],
        value: parseEther(amount || '0'),
      });
      toast.loading('Placing bid...');
    } catch {
      toast.error('Failed to place bid');
    }
  };

  if (isSuccess) {
    toast.dismiss();
    toast.success('Bid placed');
    setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white border border-soft-line rounded-[26px] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-bold text-soft-ink">Place Bid</h2>
          <button onClick={onClose} className="text-soft-ink-muted hover:text-soft-ink">✕</button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="text-gray-400">Minimum: <span className="text-white">{Number(minPrice) / 1e18} CAMP</span></div>
          <input placeholder="Amount (CAMP)" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-white border border-soft-line rounded px-3 py-2 text-soft-ink" />
          <button onClick={onBid} disabled={isPending || isConfirming} className="w-full py-2 bg-soft-primary text-white rounded-lg disabled:opacity-50">
            {isPending || isConfirming ? 'Processing...' : 'Place Bid'}
          </button>
        </div>
      </div>
    </div>
  );
}


