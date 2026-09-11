"use client";

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { toast } from 'react-hot-toast';
import BidModal from './BidModal';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI, DEFAULT_IP_NFT_CONTRACT } from '../config/simpleMarketplace';
import { createCampPublicClient } from '../config/campClient';
import { ipfsToHttp } from '@/utils/ipfs';

interface Auction {
  auctionId: number;
  nftContract: string;
  tokenId: bigint;
  minPrice: bigint;
  reservePrice: bigint;
  endTime: bigint;
  highestBid: bigint;
  highestBidder: string;
  bidIncrement: bigint;
  seller: string;
  active: boolean;
  totalBids: number;
  metadata?: any;
  image?: string;
  bidHistory?: Bid[];
}

interface Bid {
  bidder: string;
  amount: bigint;
  timestamp: number;
}

export default function AuctionView({ onBack }: { onBack?: () => void }) {
  const { address } = useAccount();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBidModal, setShowBidModal] = useState<{ auctionId: bigint; minPrice: bigint } | null>(null);
  const [nowTs, setNowTs] = useState<number>(Math.floor(Date.now() / 1000));
  const [filter, setFilter] = useState<'all' | 'ending-soon' | 'most-bids' | 'my-bids' | 'ended'>('all');
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [myBidAuctions, setMyBidAuctions] = useState<Set<number>>(new Set());
  
  const { writeContract: finalizeAuction, data: finalizeHash } = useWriteContract();
  const { isSuccess: finalizeSuccess } = useWaitForTransactionReceipt({ hash: finalizeHash });

  // Live timer
  useEffect(() => {
    const timer = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch auctions
  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const client = createCampPublicClient();

      const count = await client.readContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'auctionCount'
      }) as bigint;

      const auctionList: Auction[] = [];
      const userBids = new Set<number>();
      const ERC721_ABI = [
        { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] }
      ] as const;

      for (let i = 1n; i <= count; i++) {
        try {
          const a = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'auctions',
            args: [i]
          }) as any;

          const active = Boolean(a[9]); // Index 9 is 'active' field
          const endTime = Number(a[5]); // Index 5 is 'endTime' field
          const isEnded = endTime <= Math.floor(Date.now() / 1000);
          
          // Skip inactive auctions, but show ended ones that need finalization
          if (!active && !isEnded) continue;

          // Track if user has bid (check pendingReturns as indicator)
          if (address) {
            try {
              const pendingReturn = await client.readContract({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'pendingReturns',
                args: [address]
              }) as bigint;
              
              // If user is highest bidder or has pending returns, they participated
              if (a[6]?.toLowerCase() === address.toLowerCase() || pendingReturn > 0n) { // Index 6 is highestBidder
                userBids.add(Number(i));
              }
            } catch {}
          }

          // Fetch NFT metadata
          let metadata = null;
          let image = '';
          try {
            // Use DEFAULT_IP_NFT_CONTRACT if nftContract is not set or is zero address
            const nftContractAddress = (a[1] && a[1] !== '0x0000000000000000000000000000000000000000') 
              ? a[1] 
              : DEFAULT_IP_NFT_CONTRACT;
            
            const tokenUri = await client.readContract({
              address: nftContractAddress as `0x${string}`,
              abi: ERC721_ABI,
              functionName: 'tokenURI',
              args: [a[2]]
            }) as string;

            const metaUrl = ipfsToHttp(tokenUri);

            if (metaUrl) {
              metadata = await fetch(metaUrl).then(r => r.ok ? r.json() : null).catch(() => null);
              image = ipfsToHttp(metadata?.image) || '';
            }
          } catch {}

          auctionList.push({
            auctionId: Number(i),
            nftContract: a[1],
            tokenId: a[2],
            minPrice: a[3],
            reservePrice: a[4],
            endTime: a[5],
            highestBidder: a[6],
            highestBid: a[7],
            bidIncrement: a[8],
            seller: a[0],
            active: true,
            totalBids: Number(a[10]),
            metadata,
            image
          });
        } catch {}
      }

      setAuctions(auctionList);
      setMyBidAuctions(userBids);
      
      // Auto-select first auction if none selected
      if (auctionList.length > 0 && !selectedAuction) {
        setSelectedAuction(auctionList[0]);
      }
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuctions();
    const interval = setInterval(fetchAuctions, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (finalizeSuccess) {
      toast.success('Auction finalized! NFT transferred to winner.');
      setTimeout(fetchAuctions, 1000);
    }
  }, [finalizeSuccess]);

  const handleFinalizeAuction = async (auctionId: number) => {
    try {
      const auction = auctions.find(a => a.auctionId === auctionId);
      if (!auction) return;
      
      // Show warning if this might conflict with a listing
      toast.loading('Finalizing auction and transferring NFT...');
      
      finalizeAuction({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'finalizeAuction',
        args: [BigInt(auctionId)]
      });
    } catch (error) {
      console.error('Finalize error:', error);
      toast.error('Failed to finalize. The NFT might still be listed for sale - seller needs to cancel listing first!');
    }
  };

  const formatTimeLeft = (endTime: bigint) => {
    const end = Number(endTime);
    const seconds = Math.max(0, end - nowTs);
    
    if (seconds <= 0) return 'Ended';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  };

  const getFilteredAuctions = () => {
    let filtered = [...auctions];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.metadata?.name?.toLowerCase().includes(query) ||
        a.tokenId.toString().includes(query) ||
        a.auctionId.toString().includes(query)
      );
    }
    
    // Apply category filter
    switch (filter) {
      case 'ending-soon':
        filtered = filtered.filter(a => {
          const timeLeft = Number(a.endTime) - nowTs;
          return timeLeft > 0 && timeLeft < 86400; // Less than 24h
        });
        filtered.sort((a, b) => Number(a.endTime) - Number(b.endTime));
        break;
      case 'most-bids':
        filtered = filtered.filter(a => Number(a.endTime) > nowTs); // Only active
        filtered.sort((a, b) => Number(b.highestBid) - Number(a.highestBid));
        break;
      case 'my-bids':
        filtered = filtered.filter(a => myBidAuctions.has(a.auctionId));
        break;
      case 'ended':
        filtered = filtered.filter(a => Number(a.endTime) <= nowTs && a.highestBid > 0n);
        break;
      case 'all':
      default:
        // Show only active auctions by default
        filtered = filtered.filter(a => Number(a.endTime) > nowTs);
        break;
    }
    
    return filtered;
  };

  const filteredAuctions = getFilteredAuctions();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-t-2 border-b-2 border-soft-primary"></div>
      </div>
    );
  }

  // Calculate stats
  const activeAuctions = auctions.filter(a => Number(a.endTime) > nowTs);
  const floorPrice = activeAuctions.length > 0 
    ? Math.min(...activeAuctions.map(a => Number(formatEther(a.highestBid > 0n ? a.highestBid : a.minPrice))))
    : 0;
  const totalVolume = auctions.reduce((sum, a) => sum + Number(formatEther(a.highestBid || 0n)), 0);

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="bg-soft-surface-sunken border border-soft-line rounded-xl p-4">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-soft-ink-muted">Active Auctions</div>
            <div className="text-xl font-bold text-soft-ink">{activeAuctions.length}</div>
          </div>
          <div>
            <div className="text-soft-ink-muted">Floor Price</div>
            <div className="text-xl font-bold text-soft-accent-deep">{floorPrice.toFixed(3)} CAMP</div>
          </div>
          <div>
            <div className="text-soft-ink-muted">Total Volume</div>
            <div className="text-xl font-bold text-soft-accent-deep">{totalVolume.toFixed(2)} CAMP</div>
          </div>
          <div>
            <div className="text-soft-ink-muted">Ending Soon</div>
            <div className="text-xl font-bold text-[#a32020]">
              {activeAuctions.filter(a => Number(a.endTime) - nowTs < 3600).length}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="h-[calc(100vh-280px)] flex gap-4">
        {/* Left sidebar - Auction list */}
        <div className="w-96 bg-white border border-soft-line rounded-xl overflow-hidden flex flex-col">
        {/* Search and filters */}
        <div className="p-4 border-b border-soft-line space-y-3">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-soft-ink-muted hover:text-soft-ink transition-colors"
                title="Back to Explore"
              >
                <span className="text-xl">←</span>
              </button>
            )}
            <input
              type="text"
              placeholder="Search by name or token ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 bg-soft-surface-sunken border border-soft-line rounded-lg text-soft-ink placeholder:text-soft-ink-faint focus:border-soft-accent focus:outline-none"
            />
          </div>
          
          {/* Filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {[
              { id: 'all', label: 'Active', count: auctions.filter(a => Number(a.endTime) > nowTs).length },
              { id: 'ending-soon', label: 'Ending', count: auctions.filter(a => Number(a.endTime) - nowTs < 86400 && Number(a.endTime) > nowTs).length },
              { id: 'my-bids', label: 'My Bids', count: myBidAuctions.size },
              { id: 'ended', label: 'Ended', count: auctions.filter(a => Number(a.endTime) <= nowTs && a.highestBid > 0n).length }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id as any)}
                className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-all ${
                  filter === tab.id
                    ? 'bg-soft-primary text-white'
                    : 'bg-soft-surface-sunken text-soft-ink-muted hover:text-soft-ink'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        {/* Auction list */}
        <div className="flex-1 overflow-y-auto">
          {filteredAuctions.length === 0 ? (
            <div className="p-8 text-center text-soft-ink-soft">
              {filter === 'my-bids' ? 'You have not bid on any auctions yet' : 'No auctions found'}
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {filteredAuctions.map((auction) => (
                <button
                  key={auction.auctionId}
                  onClick={() => setSelectedAuction(auction)}
                  className={`w-full p-3 rounded-lg border transition-all text-left ${
                    selectedAuction?.auctionId === auction.auctionId
                      ? 'bg-soft-accent-soft border border-soft-accent/40 border-soft-accent'
                      : 'bg-white border-soft-line hover:border-soft-line'
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded bg-white overflow-hidden flex-shrink-0">
                      {auction.image ? (
                        <img src={auction.image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl"></div>
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-soft-ink font-medium text-sm truncate">
                        {auction.metadata?.name || `Token #${auction.tokenId}`}
                      </div>
                      <div className="text-xs text-soft-ink-muted">
                        {auction.highestBid > 0n 
                          ? (
                            <>
                              {formatEther(auction.highestBid)} CAMP
                              {auction.highestBid < auction.reservePrice && (
                                <span className="text-yellow-400 ml-1">(R)</span>
                              )}
                            </>
                          )
                          : `Min: ${formatEther(auction.minPrice)} CAMP`
                        }
                      </div>
                      <div className={`text-xs ${
                        Number(auction.endTime) - nowTs < 3600 
                          ? 'text-red-400 font-bold' 
                          : 'text-soft-ink-soft'
                      }`}>
                        {formatTimeLeft(auction.endTime)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right side - Auction details */}
      <div className="flex-1 bg-white border border-soft-line rounded-xl overflow-hidden">
        {!selectedAuction ? (
          <div className="h-full flex items-center justify-center text-soft-ink-soft">
            Select an auction to view details
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Auction header */}
            <div className="p-6 border-b border-soft-line">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-soft-ink">
                    {selectedAuction.metadata?.name || `Token #${selectedAuction.tokenId}`}
                  </h2>
                  <p className="text-soft-ink-muted mt-1">
                    Auction #{selectedAuction.auctionId} • Seller: {selectedAuction.seller.slice(0, 8)}...{selectedAuction.seller.slice(-6)}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-bold ${
                  Number(selectedAuction.endTime) - nowTs < 3600 
                    ? 'bg-[#a32020] text-white animate-pulse' 
                    : Number(selectedAuction.endTime) - nowTs < 86400
                    ? 'bg-soft-primary text-white'
                    : 'bg-soft-ink/50 text-soft-ink border border-soft-line'
                }`}>
                  {formatTimeLeft(selectedAuction.endTime)}
                </div>
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid lg:grid-cols-2 gap-6">
                {/* NFT Image */}
                <div>
                  <div className="aspect-square rounded-xl overflow-hidden bg-soft-surface-sunken">
                    {selectedAuction.image ? (
                      <img 
                        src={selectedAuction.image} 
                        alt={selectedAuction.metadata?.name || 'NFT'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-8xl">
                        
                      </div>
                    )}
                  </div>
                </div>

                {/* Bid info and history */}
                <div className="space-y-4">
                  {/* Current status */}
                  <div className="bg-soft-surface-sunken border border-soft-line rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-soft-ink-muted text-sm">Current Bid</div>
                        <div className="text-2xl font-bold text-soft-accent-deep">
                          {selectedAuction.highestBid > 0n 
                            ? `${formatEther(selectedAuction.highestBid)} CAMP`
                            : 'No bids yet'
                          }
                        </div>
                      </div>
                      <div>
                        <div className="text-soft-ink-muted text-sm">Next Min Bid</div>
                        <div className="text-2xl font-bold text-soft-ink">
                          {formatEther(
                            selectedAuction.highestBid > 0n 
                              ? selectedAuction.highestBid + selectedAuction.bidIncrement
                              : selectedAuction.minPrice
                          )} CAMP
                        </div>
                      </div>
                    </div>
                    
                    {/* Reserve & Stats */}
                    <div className="mt-3 pt-3 border-t border-soft-line space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-soft-ink-muted">Reserve Price</span>
                        <div className="flex items-center gap-2">
                          <span className="text-soft-ink font-medium">{formatEther(selectedAuction.reservePrice)} CAMP</span>
                          {/* Calculate reserve status locally */}
                          {selectedAuction.highestBid >= selectedAuction.reservePrice ? (
                            <span className="text-xs bg-[#edfff4] border border-[#9de7bb] text-[#0b9a51] px-2 py-0.5 rounded">Met ✓</span>
                          ) : (
                            <span className="text-xs bg-soft-accent-soft border border-soft-accent/40 text-soft-accent-deep px-2 py-0.5 rounded">Not Met</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-soft-ink-muted">Total Bids</span>
                        <span className="text-soft-ink font-medium">{selectedAuction.totalBids}</span>
                      </div>
                      
                      {selectedAuction.bidIncrement > 0n && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-soft-ink-muted">Bid Increment</span>
                          <span className="text-soft-ink">{formatEther(selectedAuction.bidIncrement)} CAMP</span>
                        </div>
                      )}
                    </div>
                    
                    {selectedAuction.highestBidder && selectedAuction.highestBidder !== '0x0000000000000000000000000000000000000000' && (
                      <div className="mt-3 pt-3 border-t border-soft-line">
                        <div className="text-sm text-soft-ink-muted">Current Leader</div>
                        <div className="text-soft-ink font-medium">
                          {selectedAuction.highestBidder.slice(0, 12)}...{selectedAuction.highestBidder.slice(-10)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  {Number(selectedAuction.endTime) <= nowTs ? (
                    <div className="space-y-2">
                      {selectedAuction.highestBid > 0n && (
                        <>
                          {/* Check if reserve price is met */}
                          {selectedAuction.highestBid >= selectedAuction.reservePrice ? (
                            <div className="bg-[#edfff4] border border-[#9de7bb] rounded-lg p-3 text-center">
                              <div className="text-green-400 font-semibold">Auction Won!</div>
                              <div className="text-soft-ink text-sm mt-1">
                                Winner: {selectedAuction.highestBidder.slice(0, 8)}...{selectedAuction.highestBidder.slice(-6)}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-soft-accent-soft border border-soft-accent/40 rounded-lg p-3 text-center">
                              <div className="text-orange-400 font-semibold">Reserve Price Not Met</div>
                              <div className="text-soft-ink text-sm mt-1">
                                Highest bid: {formatEther(selectedAuction.highestBid)} CAMP
                              </div>
                              <div className="text-soft-ink-muted text-xs mt-1">
                                Required: {formatEther(selectedAuction.reservePrice)} CAMP
                              </div>
                            </div>
                          )}
                          
                          {/* Warning if seller needs to act */}
                          {selectedAuction.seller.toLowerCase() === address?.toLowerCase() && (
                            <div className="bg-soft-accent-soft border border-soft-accent/40 rounded-lg p-3">
                              <div className="text-soft-accent-deep font-semibold text-sm">Action required</div>
                              <div className="text-soft-ink-muted text-xs mt-1">
                                If this NFT is also listed for sale, cancel the listing first before finalizing
                              </div>
                            </div>
                          )}
                          
                          {(selectedAuction.seller.toLowerCase() === address?.toLowerCase() || 
                            selectedAuction.highestBidder.toLowerCase() === address?.toLowerCase()) && (
                            <button
                              onClick={() => handleFinalizeAuction(selectedAuction.auctionId)}
                              className={`w-full py-3 text-soft-ink font-bold rounded-lg transition-all text-lg ${
                                selectedAuction.highestBid >= selectedAuction.reservePrice
                                  ? 'bg-soft-primary hover:bg-soft-primary-deep'
                                  : 'bg-soft-primary hover:bg-soft-primary-deep'
                              }`}
                            >
                              {selectedAuction.highestBid >= selectedAuction.reservePrice
                                ? 'Finalize & Transfer NFT'
                                : 'Finalize & Return Funds'
                              }
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        // Calculate minimum bid locally since view function was removed
                        const minBid = selectedAuction.highestBid > 0n 
                          ? selectedAuction.highestBid + selectedAuction.bidIncrement
                          : selectedAuction.minPrice;
                        setShowBidModal({
                          auctionId: BigInt(selectedAuction.auctionId),
                          minPrice: minBid
                        });
                      }}
                      className="w-full py-3 bg-soft-primary text-white font-bold rounded-lg hover:bg-soft-primary-deep transition-all text-lg"
                    >
                      Place Bid
                    </button>
                  )}

                  {/* Auto-extend info */}
                  <div className="bg-soft-info-soft border border-soft-info/30 rounded-lg p-3 text-sm">
                    <div className="flex items-center gap-2 text-soft-info">
                      <span>⏰</span>
                      <span>Bids in last 5 minutes auto-extend auction by 5 min</span>
                    </div>
                  </div>

                  {/* Bid history */}
                  <div className="bg-soft-surface-sunken rounded-xl p-4 border border-soft-line">
                    <h3 className="text-soft-ink font-semibold mb-3">Bid History</h3>
                    {selectedAuction.highestBid > 0n ? (
                      <div className="space-y-2">
                        <div className="bg-soft-accent-soft border border-soft-accent/40 rounded-lg p-3">
                          <div className="flex justify-between items-center">
                            <div className="text-soft-ink">
                              {selectedAuction.highestBidder.slice(0, 8)}...{selectedAuction.highestBidder.slice(-6)}
                            </div>
                            <div className="text-orange-400 font-bold">
                              {formatEther(selectedAuction.highestBid)} CAMP
                            </div>
                          </div>
                          <div className="text-xs text-soft-ink-muted mt-1">Current highest bid</div>
                        </div>
                        <div className="text-center text-soft-ink-soft text-sm py-2">
                          Previous bids are returned automatically when outbid
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-soft-ink-soft py-4">
                        No bids placed yet. Be the first!
                      </div>
                    )}
                  </div>

                  {/* NFT Details */}
                  {selectedAuction.metadata?.description && (
                    <div className="bg-soft-surface-sunken rounded-xl p-4 border border-soft-line">
                      <h3 className="text-soft-ink font-semibold mb-2">Description</h3>
                      <p className="text-soft-ink-muted text-sm">{selectedAuction.metadata.description}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bid Modal */}
      {showBidModal && (
        <BidModal
          auctionId={showBidModal.auctionId}
          minPrice={showBidModal.minPrice}
          onClose={() => {
            setShowBidModal(null);
            setTimeout(fetchAuctions, 1000); // Refresh after bid
          }}
        />
      )}
      </div>
    </div>
  );
}
