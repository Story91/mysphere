"use client";

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, createPublicClient, http } from 'viem';
import { toast } from 'react-hot-toast';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from '../config/simpleMarketplace';

interface AccessModalProps {
  nft: any;
  onClose: () => void;
}

export default function AccessModal({ nft, onClose }: AccessModalProps) {
  const { address } = useAccount();
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({ hash: txHash });
  
  const [periods, setPeriods] = useState('1');
  const [loading, setLoading] = useState(false);
  const [terms, setTerms] = useState<any>(null);
  const [loadingTerms, setLoadingTerms] = useState(true);

  // Fetch real access terms from contract
  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const client = createPublicClient({
          chain: {
            id: 325000,
            name: 'BaseCamp Testnet',
            nativeCurrency: { name: 'Camp', symbol: 'CAMP', decimals: 18 },
            rpcUrls: {
              default: { http: ['https://rpc.basecamp.t.raas.gelato.cloud'] },
              public: { http: ['https://rpc.basecamp.t.raas.gelato.cloud'] }
            }
          },
          transport: http('https://rpc.basecamp.t.raas.gelato.cloud')
        });
        
        const termsData = await client.readContract({
          address: MARKETPLACE_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'getTerms',
          args: [BigInt(nft.tokenId)],
        }) as any;
        
        console.log('Access terms for token', nft.tokenId, ':', termsData);
        setTerms(termsData);
      } catch (error) {
        console.error('Failed to fetch access terms:', error);
        // Fallback to default terms if no access terms set
        setTerms({
          price: 0n,
          duration: 0n,
          royaltyBps: 0n,
          paymentToken: '0x0000000000000000000000000000000000000000'
        });
      } finally {
        setLoadingTerms(false);
      }
    };
    
    fetchTerms();
  }, [nft.tokenId]);

  if (loadingTerms) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
            <span className="ml-3 text-white">Loading access terms...</span>
          </div>
        </div>
      </div>
    );
  }

  // Check if access is available
  const hasAccess = terms && Number(terms.price) > 0 && Number(terms.duration) > 0;
  
  if (!hasAccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
        <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl font-bold text-white">Temporary Access</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
          </div>
          <div className="text-center py-8">
            <div className="text-gray-400 mb-4">⚠️</div>
            <div className="text-white font-medium mb-2">No Access Available</div>
            <div className="text-sm text-gray-400">This NFT doesn't have temporary access enabled by the owner.</div>
          </div>
        </div>
      </div>
    );
  }

  const accessPrice = (Number(terms.price) / 1e18).toString(); // per period
  const accessDuration = Math.floor(Number(terms.duration) / (24 * 60 * 60)).toString(); // days per period
  
  const totalPrice = parseFloat(accessPrice) * parseInt(periods || '1');

  const handleBuyAccess = async () => {
    if (!address || !periods) return;
    
    try {
      setLoading(true);
      writeContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'buyAccessOwner',
        args: [BigInt(nft.tokenId), BigInt(periods)],
        value: parseEther(totalPrice.toString()),
      });
      toast.loading('Buying access...');
    } catch (error: any) {
      toast.error('Failed to buy access');
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    toast.dismiss();
    toast.success('Access purchased successfully!');
    
    // Save purchased token ID to localStorage
    const purchasedTokens = JSON.parse(localStorage.getItem('purchasedAccessTokens') || '[]');
    if (!purchasedTokens.includes(nft.tokenId)) {
      purchasedTokens.push(nft.tokenId);
      localStorage.setItem('purchasedAccessTokens', JSON.stringify(purchasedTokens));
      console.log('💾 Saved purchased token to localStorage:', nft.tokenId);
    }
    
    setTimeout(onClose, 2000);
  }

  if (isError) {
    toast.dismiss();
    toast.error('Access purchase failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-bold text-white">Buy Temporary Access</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        <div className="space-y-4">
          {/* NFT Preview */}
          <div className="flex items-center gap-3 p-3 bg-black/40 rounded-lg">
            {nft.image && (
              <img src={nft.image} alt={nft.metadata?.name} className="w-12 h-12 rounded object-cover" />
            )}
            <div>
              <div className="text-white font-medium">{nft.metadata?.name || `#${nft.tokenId}`}</div>
              <div 
                className="text-xs text-gray-400 cursor-pointer hover:text-orange-400" 
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

          {/* Access Details */}
          <div className="bg-black/40 border border-gray-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Access Terms</h3>
            <div className="text-sm text-gray-300 space-y-1">
              <div>Price: <span className="text-orange-400">{accessPrice} $CAMP</span> per period</div>
              <div>Duration: <span className="text-blue-400">{accessDuration} days</span> per period</div>
            </div>
          </div>

          {/* Periods Input */}
          <div>
            <label className="text-sm text-gray-400 block mb-2">Number of Periods</label>
            <input
              type="number"
              min="1"
              max="12"
              value={periods}
              onChange={(e) => setPeriods(e.target.value)}
              className="w-full bg-black/50 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:outline-none"
            />
            <div className="text-xs text-gray-500 mt-1">
              Total: {parseInt(periods || '1') * parseInt(accessDuration)} days
            </div>
          </div>

          {/* Total Price */}
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
            <div className="text-sm text-gray-300">Total Price</div>
            <div className="text-lg font-bold text-orange-400">{totalPrice.toFixed(2)} $CAMP</div>
          </div>

          {/* Buy Button */}
          <button
            onClick={handleBuyAccess}
            disabled={loading || isPending || isConfirming || !address}
            className="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading || isPending || isConfirming ? 'Processing...' : `Buy Access (${totalPrice.toFixed(2)} $CAMP)`}
          </button>
        </div>
      </div>
    </div>
  );
}
