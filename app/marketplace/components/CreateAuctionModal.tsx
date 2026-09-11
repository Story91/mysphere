"use client";

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI, DEFAULT_IP_NFT_CONTRACT } from '../config/simpleMarketplace';
import { createCampPublicClient } from '../config/campClient';
import { fetchIpNftsFor } from '@/app/mycamp/api/fetchIpNfts';

export default function CreateAuctionModal({ nftContract: initialNftContract, tokenId: initialTokenId, onClose }: { nftContract?: `0x${string}`; tokenId?: bigint; onClose: () => void }) {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const [selectedNft, setSelectedNft] = useState<{ contract: string; tokenId: string } | null>(
    initialTokenId ? { contract: initialNftContract || DEFAULT_IP_NFT_CONTRACT, tokenId: initialTokenId.toString() } : null
  );
  const [userNfts, setUserNfts] = useState<any[]>([]);
  const [loadingNfts, setLoadingNfts] = useState(true);
  const [selectedNftDetails, setSelectedNftDetails] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [minPrice, setMinPrice] = useState<string>('0.01');
  const [reservePrice, setReservePrice] = useState<string>('');
  const [bidIncrement, setBidIncrement] = useState<string>('0.001');
  const [durationValue, setDurationValue] = useState<string>('1');
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours' | 'days'>('days');

  // Load user's NFTs and check which are already listed
  useEffect(() => {
    const loadNfts = async () => {
      if (!address) return;
      setLoadingNfts(true);
      try {
        const nfts = await fetchIpNftsFor(address);
        
        // Check which NFTs are already listed
        const client = createCampPublicClient();
        
        const listingCount = await client.readContract({
          address: MARKETPLACE_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'getListingCount',
        }) as bigint;
        
        const listedTokenIds = new Set<string>();
        const auctionedTokenIds = new Set<string>();
        
        // Check listings
        for (let i = 1n; i <= listingCount; i++) {
          try {
            const listing = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'listings',
              args: [i],
            }) as any;
            
            if (listing[6] && listing[1]?.toLowerCase() === DEFAULT_IP_NFT_CONTRACT.toLowerCase()) {
              listedTokenIds.add(listing[2].toString());
            }
          } catch {}
        }
        
        // Check auctions
        const auctionCount = await client.readContract({
          address: MARKETPLACE_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'auctionCount',
        }) as bigint;
        
        for (let i = 1n; i <= auctionCount; i++) {
          try {
            const auction = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'auctions',
              args: [i],
            }) as any;
            
            // auction[9] is active, auction[1] is nftContract, auction[2] is tokenId
            if (auction[9] && auction[1]?.toLowerCase() === DEFAULT_IP_NFT_CONTRACT.toLowerCase()) {
              auctionedTokenIds.add(auction[2].toString());
            }
          } catch {}
        }
        
        // Filter out NFTs that are already listed or auctioned
        const availableNfts = nfts.filter(nft => 
          !listedTokenIds.has(nft.tokenId) && !auctionedTokenIds.has(nft.tokenId)
        );
        
        setUserNfts(availableNfts);
      } catch (error) {
        console.error('Failed to load NFTs:', error);
      }
      setLoadingNfts(false);
    };
    loadNfts();
  }, [address]);

  // Load NFT preview when selected
  useEffect(() => {
    const loadPreview = async () => {
      if (!selectedNft) {
        setSelectedNftDetails(null);
        return;
      }
      
      setLoadingPreview(true);
      try {
        // Find the NFT in our list
        const nft = userNfts.find(n => n.tokenId === selectedNft.tokenId);
        if (nft) {
          // If we already have metadata, use it
          setSelectedNftDetails(nft);
        } else {
          // Otherwise fetch metadata
          const client = createCampPublicClient();
          
          // Get tokenURI from the NFT contract
          const ipNftAbi = [
            {
              inputs: [{ name: "tokenId", type: "uint256" }],
              name: "tokenURI",
              outputs: [{ name: "", type: "string" }],
              stateMutability: "view",
              type: "function"
            }
          ];
          
          const uri = await client.readContract({
            address: selectedNft.contract as `0x${string}`,
            abi: ipNftAbi,
            functionName: 'tokenURI',
            args: [BigInt(selectedNft.tokenId)],
          }) as string;
          
          if (uri) {
            const metaUrl = uri.startsWith('http') ? uri : uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
            const response = await fetch(metaUrl);
            const metadata = await response.json();
            
            setSelectedNftDetails({
              tokenId: selectedNft.tokenId,
              metadata,
              image: metadata.image || metadata.animation_url
            });
          }
        }
      } catch (error) {
        console.error('Failed to load NFT preview:', error);
      }
      setLoadingPreview(false);
    };
    
    loadPreview();
  }, [selectedNft, userNfts]);

  const toSeconds = () => {
    const v = Math.max(1, Number(durationValue || 1));
    if (durationUnit === 'minutes') return BigInt(v * 60);
    if (durationUnit === 'hours') return BigInt(v * 3600);
    return BigInt(v * 86400);
  };

  const onCreate = () => {
    if (!address || !selectedNft) {
      toast.error('Please select an NFT');
      return;
    }
    try {
      const durationSec = toSeconds();
      const minPriceWei = parseEther(minPrice || '0');
      const reservePriceWei = parseEther(reservePrice || minPrice || '0');
      const bidIncrementWei = parseEther(bidIncrement || '0');
      
      writeContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'createAuction',
        args: [
          selectedNft.contract as `0x${string}`, 
          BigInt(selectedNft.tokenId), 
          minPriceWei, 
          reservePriceWei,
          durationSec,
          bidIncrementWei
        ],
      });
      toast.loading('Creating auction...');
    } catch {
      toast.error('Failed to create auction');
    }
  };

  if (isSuccess) {
    toast.dismiss();
    toast.success('Auction created');
    setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-white border border-soft-line rounded-[26px] max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-bold text-soft-ink">Create Auction</h2>
          <button onClick={onClose} className="text-soft-ink-muted hover:text-soft-ink">✕</button>
        </div>

        <div className="space-y-4 text-sm">
          {/* NFT Selection */}
          <div>
            <label className="block text-soft-ink-muted mb-1">Select NFT</label>
            {loadingNfts ? (
              <div className="w-full bg-white border border-soft-line rounded px-3 py-8 text-center text-soft-ink-soft">
                Loading your NFTs...
              </div>
            ) : userNfts.length === 0 ? (
              <div className="w-full bg-white border border-soft-line rounded px-3 py-8 text-center">
                <p className="text-gray-500">No available NFTs</p>
                <p className="text-xs text-soft-ink-soft mt-2">
                  All your NFTs are already listed or in auction
                </p>
              </div>
            ) : (
              <select
                value={selectedNft ? `${selectedNft.contract}:${selectedNft.tokenId}` : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    const [contract, tokenId] = e.target.value.split(':');
                    setSelectedNft({ contract, tokenId });
                  } else {
                    setSelectedNft(null);
                  }
                }}
                className="w-full bg-white border border-soft-line rounded px-3 py-2 text-soft-ink"
              >
                <option value="">Choose an NFT...</option>
                {userNfts.map((nft) => (
                  <option key={nft.tokenId} value={`${DEFAULT_IP_NFT_CONTRACT}:${nft.tokenId}`}>
                    {nft.metadata?.name || `Token #${nft.tokenId}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* NFT Preview */}
          {selectedNftDetails && (
            <div className="bg-white border border-soft-line rounded-lg p-3">
              {loadingPreview ? (
                <div className="text-center py-4 text-soft-ink-soft">Loading preview...</div>
              ) : (
                <div className="flex gap-3">
                  {/* Image */}
                  <div className="w-20 h-20 bg-white rounded-lg overflow-hidden flex-shrink-0">
                    {selectedNftDetails.image || selectedNftDetails.metadata?.image ? (
                      <img 
                        src={
                          (selectedNftDetails.image || selectedNftDetails.metadata?.image || '')
                            .replace('ipfs://', 'https://ipfs.io/ipfs/')
                        }
                        alt={selectedNftDetails.metadata?.name || `Token #${selectedNftDetails.tokenId}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-soft-ink-soft">
                        🖼️
                      </div>
                    )}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold truncate">
                      {selectedNftDetails.metadata?.name || `Token #${selectedNftDetails.tokenId}`}
                    </h4>
                    <p className="text-xs text-soft-ink-muted truncate">
                      {selectedNftDetails.metadata?.description || 'No description'}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {selectedNftDetails.metadata?.attributes?.map((attr: any, i: number) => (
                        <span key={i} className="text-xs bg-white px-2 py-0.5 rounded">
                          {attr.trait_type}: {attr.value}
                        </span>
                      )).slice(0, 2)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-soft-ink-muted mb-1">Minimum Price (CAMP)</label>
            <input 
              type="number" 
              step="0.001"
              value={minPrice} 
              onChange={(e) => setMinPrice(e.target.value)} 
              className="w-full bg-white border border-soft-line rounded px-3 py-2 text-soft-ink" 
              placeholder="0.01"
            />
          </div>
          
          <div>
            <label className="block text-soft-ink-muted mb-1">
              Reserve Price (CAMP) 
              <span className="text-xs text-soft-ink-soft ml-1">(optional - min to sell)</span>
            </label>
            <input 
              type="number" 
              step="0.001"
              value={reservePrice} 
              onChange={(e) => setReservePrice(e.target.value)} 
              className="w-full bg-white border border-soft-line rounded px-3 py-2 text-soft-ink" 
              placeholder={minPrice || "Same as minimum"}
            />
          </div>
          
          <div>
            <label className="block text-soft-ink-muted mb-1">
              Bid Increment (CAMP)
              <span className="text-xs text-soft-ink-soft ml-1">(min outbid amount)</span>
            </label>
            <input 
              type="number" 
              step="0.001"
              value={bidIncrement} 
              onChange={(e) => setBidIncrement(e.target.value)} 
              className="w-full bg-white border border-soft-line rounded px-3 py-2 text-soft-ink" 
              placeholder="0.001"
            />
          </div>
          
          <div>
            <label className="block text-soft-ink-muted mb-1">Duration</label>
            <div className="flex gap-2">
              <input type="number" min={1} value={durationValue} onChange={(e) => setDurationValue(e.target.value)} className="w-28 bg-white border border-soft-line rounded px-3 py-2 text-soft-ink" />
              <select value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as any)} className="bg-white border border-soft-line rounded px-3 py-2 text-soft-ink">
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <p className="text-xs text-soft-ink-soft mt-1">⏰ Auto-extends 5 min on last-minute bids</p>
          </div>

          <button onClick={onCreate} disabled={isPending || isConfirming} className="w-full py-2 bg-soft-primary text-white rounded-lg disabled:opacity-50">
            {isPending || isConfirming ? 'Processing...' : 'Create Auction'}
          </button>
        </div>
      </div>
    </div>
  );
}


