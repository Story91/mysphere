"use client";

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, createPublicClient, http } from 'viem';
import { toast } from 'react-hot-toast';
import IPNFTCard from './IPNFTCard';
import FilterBar from './FilterBar';
import PreviewModal from './PreviewModal';
import AccessModal from './AccessModal';
import BidModal from './BidModal';
import OfferModal from './OfferModal';
import AuctionView from './AuctionView';
import { fetchIpNftsFor, fetchRecentIpNfts } from '../../mycamp/api/fetchIpNfts';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from '../config/simpleMarketplace';

export default function MarketplaceGrid({
  mode = 'explore',
  onOpenListModal,
}: {
  mode?: 'explore' | 'my' | 'live';
  onOpenListModal?: (nft: any) => void;
}) {
  const { address } = useAccount();
  const { writeContract, data: offerHash, isPending: isOfferPending, error: offerError } = useWriteContract();
  const { isLoading: isOfferConfirming, isSuccess: isOfferSuccess } = useWaitForTransactionReceipt({ hash: offerHash });
  const [allNFTs, setAllNFTs] = useState<any[]>([]);
  const [filteredNFTs, setFilteredNFTs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio' | 'text'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [preview, setPreview] = useState<any | null>(null);
  const [showListModal, setShowListModal] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState<any>(null);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [accessNFT, setAccessNFT] = useState<any>(null);
  const [offerNFT, setOfferNFT] = useState<any>(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidNFT, setBidNFT] = useState<any>(null);
  
  const [filters, setFilters] = useState({
    priceRange: [0, Number.POSITIVE_INFINITY] as [number, number],
    mediaType: 'all',
    commercialUse: false,
    sortBy: 'recent',
    saleType: 'all' as 'all' | 'buy' | 'auctions' | 'access',
  });

  // Fetch NFTs depending on mode
  useEffect(() => {
    const loadNFTs = async () => {
      setLoading(true);
      
      let nfts: any[] = [];
      
      if (mode === 'my' && address) {
        try {
          const userNFTs = await fetchIpNftsFor(address);
          
          // Check which tokens are already listed on marketplace
          const client = createPublicClient({
            chain: baseCampChain,
            transport: http('https://rpc.basecamp.t.raas.gelato.cloud')
          });
          
          // Get listing count first
          const listingCount = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'getListingCount',
          }) as bigint;

          const listedTokens = new Set<string>();
          const auctionedTokens = new Map<string, any>();
          
          // Manually check each listing (since getActiveListings was removed)
          for (let i = 1n; i <= listingCount; i++) {
            try {
              const listing = await client.readContract({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'listings',
                args: [i],
              }) as any;
              
              // listing[2] is tokenId, listing[1] is nftContract, listing[6] is isActive
              if (listing[6] && listing[1]?.toLowerCase() === '0xf90733b9ecda3b49c250b2c3e3e42c96fc93324e'.toLowerCase()) {
                listedTokens.add(listing[2].toString());
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
              
              // auction[9] is active, auction[1] is nftContract, auction[2] is tokenId, auction[0] is seller
              if (auction[9] && auction[1]?.toLowerCase() === '0xf90733b9ecda3b49c250b2c3e3e42c96fc93324e'.toLowerCase() && auction[0]?.toLowerCase() === address.toLowerCase()) {
                auctionedTokens.set(auction[2].toString(), {
                  auctionId: i.toString(),
                  minPrice: auction[3],
                  reservePrice: auction[4],
                  endTime: auction[5],
                  highestBid: auction[7],
                  seller: auction[0]
                });
              }
            } catch {}
          }
          
          // Mark user's NFTs with correct listing and auction status
          const userNFTsFormatted = userNFTs.map((nft: any) => ({
            ...nft,
            isListed: listedTokens.has(nft.tokenId),
            isAuctioned: auctionedTokens.has(nft.tokenId),
            auctionData: auctionedTokens.get(nft.tokenId),
            price: nft.metadata?.attributes?.find((a: any) => a.trait_type === 'Price (native)')?.value || '0.1',
            seller: address
          }));
          
          nfts = userNFTsFormatted;
        } catch (error) {
          console.error('Failed to fetch user NFTs:', error);
        }
      } else if (mode === 'live') {
        try {
          // Cache 50 ostatnich w sessionStorage, dogrywaj tylko nowe
          const cacheKey = 'ip-live-cache-v1';
          const cached = typeof window !== 'undefined' ? sessionStorage.getItem(cacheKey) : null;
          let baseList: any[] = cached ? JSON.parse(cached) : [];
          const latest = await fetchRecentIpNfts(50);
          if (baseList.length === 0) {
            baseList = latest;
          } else {
            const existing = new Set(baseList.map((i: any) => i.tokenId));
            const newOnes = latest.filter((i: any) => !existing.has(i.tokenId));
            if (newOnes.length) baseList = [...newOnes, ...baseList].slice(0, 50);
          }
          if (typeof window !== 'undefined') sessionStorage.setItem(cacheKey, JSON.stringify(baseList));
          nfts = baseList;
        } catch (error) {
          console.error('Failed to fetch recent IP NFTs:', error);
        }
      } else {
        // Explore: aktywne listingi z marketplace
        try {
          const client = createPublicClient({
            chain: baseCampChain,
            transport: http(baseCampChain.rpcUrls.default.http[0]),
          });
          console.log('🔍 Fetching active listings from marketplace:', MARKETPLACE_ADDRESS);
          
          // Get listing count first
          const listingCount = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'getListingCount',
          }) as bigint;
          
          // Collect active listing IDs manually
          const listingIds: bigint[] = [];
          for (let i = 1n; i <= listingCount && listingIds.length < 50; i++) {
            try {
              const listing = await client.readContract({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'listings',
                args: [i],
              }) as any;
              
              // listing[6] is isActive
              if (listing[6]) {
                listingIds.push(i);
              }
            } catch {}
          }
          console.log('📋 Active listing IDs:', listingIds);

          const ERC721_ABI = [
            {
              name: 'tokenURI',
              type: 'function',
              stateMutability: 'view',
              inputs: [{ name: 'tokenId', type: 'uint256' }],
              outputs: [{ type: 'string' }],
            },
          ] as const;

          const items: any[] = [];
          for (const id of listingIds) {
            console.log(`🔸 Fetching listing ${id}...`);
            const l = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'listings',
              args: [id],
            }) as any;
            console.log(`📄 Listing ${id} data:`, l);
            // Kontrakt zwraca array [seller, nftContract, tokenId, price, royaltyBps, paymentToken, isActive, createdAt, commercialUse, derivativeWorks, licenseDuration]
            const isActive = l[6]; // isActive jest na pozycji 6
            if (!isActive) {
              console.log(`❌ Listing ${id} is not active`);
              continue;
            }
            console.log(`✅ Listing ${id} is active!`);
            let tokenUri = '';
            let metadata: any = null;
            let image = '';
            let mediaUrl = '';
            let mime = '';
            let mediaType: 'image' | 'video' | 'audio' | 'text' | 'unknown' = 'unknown';
            
            // Helper function to convert IPFS URLs
            const ipfsToHttp = (url: string) => url?.startsWith('ipfs://') ? url.replace('ipfs://', 'https://ipfs.io/ipfs/') : url;
            
            try {
              tokenUri = (await client.readContract({
                address: l[1] as `0x${string}`, // nftContract jest na pozycji 1
                abi: ERC721_ABI,
                functionName: 'tokenURI',
                args: [l[2]], // tokenId jest na pozycji 2
              })) as string;
              const metaUrl = ipfsToHttp(tokenUri);
              if (metaUrl) {
                metadata = await fetch(metaUrl, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
                if (metadata?.image) image = ipfsToHttp(metadata.image);
                
                // Proper media type detection like in fetchIpNfts.ts
                const animUrl = metadata?.animation_url || metadata?.animationUrl;
                mediaUrl = (animUrl || image) ? ipfsToHttp(animUrl || image) : '';
                mime = (metadata?.properties?.mimeType || metadata?.mimeType || '').toString();
                const ext = (animUrl || image || '').split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
                const isVideo = mime.toLowerCase().startsWith('video/') || ['mp4','webm','mov','m4v'].includes(ext || '');
                const isAudio = mime.toLowerCase().startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext || '');
                const isText  = mime.toLowerCase().startsWith('text/')  || ['txt','md','rtf','csv','json'].includes(ext || '');
                if (isVideo) mediaType = 'video';
                else if (isAudio) mediaType = 'audio';
                else if (isText) mediaType = 'text';
                else if (image) mediaType = 'image';
                else if (metadata?.text || metadata?.content) mediaType = 'text';
              }
            } catch {}
            // Try to read access terms
            let terms: any = null;
            try {
              terms = await client.readContract({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'getTerms',
                args: [l[2] as bigint],
              });
            } catch {}

            items.push({
              listingId: id.toString(),
              contract: l[1], // nftContract na pozycji 1
              tokenId: l[2].toString(), // tokenId na pozycji 2
              price: (Number(l[3]) / 1e18).toString(), // price na pozycji 3
              seller: l[0], // seller na pozycji 0
              isListed: true,
              saleType: 'buy',
              license: {
                commercialUse: Boolean(l[8]),
                derivativeWorks: Boolean(l[9]),
                durationDays: Number(l[10]) || 0,
              },
              hasAccessTerms: !!terms && Number((terms as any).price || 0) > 0 && Number((terms as any).duration || 0) > 0,
              metadata,
              image,
              mediaUrl,
              mime,
              tokenUri,
              type: mediaType,
            });
          }
          console.log('✅ Final processed listings:', items);
          // Append active auctions
          try {
            const total = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'auctionCount' }) as bigint;
            for (let i = 1n; i <= total; i++) {
              try {
                const a = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'auctions', args: [i] }) as any;
                const active = Boolean((a as any).active ?? a[9]); // Index 9 is 'active'
                if (!active) continue;
                const endTime = Number((a as any).endTime ?? a[5]); // Index 5 is 'endTime'
                
                // Fetch NFT metadata for auction
                let metadata = null;
                let image = '';
                let mediaUrl = '';
                let mime = '';
                let mediaType: 'image' | 'video' | 'audio' | 'text' | 'unknown' = 'unknown';
                
                // Helper function to convert IPFS URLs
                const ipfsToHttp = (url: string) => url?.startsWith('ipfs://') ? url.replace('ipfs://', 'https://ipfs.io/ipfs/') : url;
                
                try {
                  const nftContract = (a as any).nftContract ?? a[1];
                  const tokenId = (a as any).tokenId ?? a[2];
                  const contractAddress = (!nftContract || nftContract === '0x0000000000000000000000000000000000000000') 
                    ? '0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E' // DEFAULT_IP_NFT_CONTRACT
                    : nftContract;
                  
                  const ERC721_ABI = [
                    { name: 'tokenURI', type: 'function', stateMutability: 'view', 
                      inputs: [{ name: 'tokenId', type: 'uint256' }], 
                      outputs: [{ type: 'string' }] }
                  ] as const;
                  
                  const tokenUri = await client.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: ERC721_ABI,
                    functionName: 'tokenURI',
                    args: [BigInt(tokenId)]
                  }) as string;
                  
                  if (tokenUri) {
                    const metaUrl = ipfsToHttp(tokenUri);
                    const metaResponse = await fetch(metaUrl);
                    if (metaResponse.ok) {
                      metadata = await metaResponse.json();
                      image = ipfsToHttp(metadata?.image || '');
                      
                      // Proper media type detection like in fetchIpNfts.ts
                      const animUrl = metadata?.animation_url || metadata?.animationUrl;
                      mediaUrl = (animUrl || image) ? ipfsToHttp(animUrl || image) : '';
                      mime = (metadata?.properties?.mimeType || metadata?.mimeType || '').toString();
                      const ext = (animUrl || image || '').split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
                      const isVideo = mime.toLowerCase().startsWith('video/') || ['mp4','webm','mov','m4v'].includes(ext || '');
                      const isAudio = mime.toLowerCase().startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext || '');
                      const isText  = mime.toLowerCase().startsWith('text/')  || ['txt','md','rtf','csv','json'].includes(ext || '');
                      if (isVideo) mediaType = 'video';
                      else if (isAudio) mediaType = 'audio';
                      else if (isText) mediaType = 'text';
                      else if (image) mediaType = 'image';
                      else if (metadata?.text || metadata?.content) mediaType = 'text';
                    }
                  }
                } catch {}
                
                // Fix price formatting - use formatEther properly
                const minPrice = (a as any).minPrice ?? a[3];
                const highestBid = (a as any).highestBid ?? a[7]; // Index 7 is highestBid, not 6!
                
                items.push({
                  auctionId: i.toString(),
                  contract: (a as any).nftContract ?? a[1],
                  tokenId: ((a as any).tokenId ?? a[2]).toString(),
                  minPrice: String(Number(minPrice) / 1e18),
                  highestBid: String(Number(highestBid) / 1e18),
                  seller: (a as any).seller ?? a[0],
                  endTime,
                  isListed: false,
                  saleType: 'auction',
                  metadata,
                  image,
                  mediaUrl,
                  mime,
                  tokenUri: '',
                  type: mediaType,
                });
              } catch {}
            }
          } catch {}
          nfts = items;
        } catch (err) {
          console.error('❌ Failed to load marketplace listings:', err);
        }
      }
      
      setAllNFTs(nfts);
      setLoading(false);
    };
    
    loadNFTs();
  }, [address, mode]);

  // Listen for marketplace events to refresh data (for 'my' mode)
  useEffect(() => {
    if (mode !== 'my') return;
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'marketplace-listing-created') {
        console.log('🔄 Marketplace listing created - refreshing My IP data in marketplace');
        setTimeout(async () => {
          if (address) {
            setLoading(true);
            try {
              const userNFTs = await fetchIpNftsFor(address);
              
              // Check which tokens are already listed on marketplace
              const client = createPublicClient({
                chain: baseCampChain,
                transport: http('https://rpc.basecamp.t.raas.gelato.cloud')
              });
              
              // Get listing count first
              const listingCount = await client.readContract({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'getListingCount',
              }) as bigint;

              const listedTokens = new Set<string>();
              
              // Manually check each listing
              for (let i = 1n; i <= listingCount; i++) {
                try {
                  const listing = await client.readContract({
                    address: MARKETPLACE_ADDRESS as `0x${string}`,
                    abi: MARKETPLACE_ABI,
                    functionName: 'listings',
                    args: [i],
                  }) as any;
                  
                  if (listing[6] && listing[1]?.toLowerCase() === '0xf90733b9ecda3b49c250b2c3e3e42c96fc93324e'.toLowerCase()) {
                    listedTokens.add(listing[2].toString());
                  }
                } catch {}
              }
              
              const userNFTsFormatted = userNFTs.map((nft: any) => ({
                ...nft,
                isListed: listedTokens.has(nft.tokenId),
                price: nft.metadata?.attributes?.find((a: any) => a.trait_type === 'Price (native)')?.value || '0.1',
                seller: address
              }));
              
              setAllNFTs(userNFTsFormatted);
            } catch (error) {
              console.error('Failed to refresh My IP NFTs:', error);
            } finally {
              setLoading(false);
            }
          }
        }, 2000); // Small delay for blockchain propagation
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [mode, address]);

  // Apply filters
  useEffect(() => {
    let filtered = [...allNFTs];
    
    // Media type filter
    if (filters.mediaType !== 'all') {
      filtered = filtered.filter(nft => nft.type === filters.mediaType);
    }
    
    // Price filter
    filtered = filtered.filter(nft => {
      const price = parseFloat(nft.price || '0');
      return price >= filters.priceRange[0] && price <= filters.priceRange[1];
    });
    
    // Commercial use filter
    if (filters.commercialUse) {
      filtered = filtered.filter(nft => {
        const attrs = nft.metadata?.attributes || [];
        const commercial = attrs.find((a: any) => a.trait_type === 'Commercial Use');
        return commercial?.value === 'Yes' || commercial?.value === true;
      });
    }
    
    // Sale type filter - exclude auctions from regular grid
    if (filters.saleType === 'buy') {
      filtered = filtered.filter(n => n.saleType === 'buy');
    } else if (filters.saleType === 'access') {
      filtered = filtered.filter(n => n.hasAccessTerms === true);
    } else if (filters.saleType === 'all') {
      // Show everything including auctions
      // No filter needed - show all
    }

    // Sorting
    switch (filters.sortBy) {
      case 'priceLow':
        filtered.sort((a, b) => parseFloat(a.price || '0') - parseFloat(b.price || '0'));
        break;
      case 'priceHigh':
        filtered.sort((a, b) => parseFloat(b.price || '0') - parseFloat(a.price || '0'));
        break;
      case 'recent':
      default:
        // Keep original order (mock listings first)
        break;
    }
    
    setFilteredNFTs(filtered);
    setPage(1); // Reset to first page when filters change
  }, [allNFTs, filters]);

  // Responsive page size
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setPageSize(mq.matches ? 8 : 6);
    apply();
    setPage(1);
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  const totalPages = Math.max(1, Math.ceil(filteredNFTs.length / pageSize));
  const pageItems = filteredNFTs.slice((page - 1) * pageSize, page * pageSize);

  const handleList = (nft: any) => {
    setSelectedNFT(nft);
    setShowListModal(true);
    onOpenListModal?.(nft);
  };

  const handleBuy = async (nft: any) => {
    if (!nft?.listingId) {
      toast.error('This NFT is not listed for sale');
      return;
    }
    
    try {
      writeContract({
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: 'buyNFT',
        args: [BigInt(nft.listingId)],
        value: parseEther(nft.price || '0'),
      });
      toast.loading('Processing purchase...');
    } catch (error) {
      console.error('Buy error:', error);
      toast.error('Failed to buy NFT');
    }
  };

  const handleOffer = (nft: any) => {
    if (!nft?.listingId) {
      toast.error('This NFT must be listed for sale to make an offer');
      return;
    }
    setOfferNFT(nft);
    setShowOfferModal(true);
  };

  const handleAccess = (nft: any) => {
    setAccessNFT(nft);
    setShowAccessModal(true);
  };

  const handleBid = (nft: any) => {
    // Switch to auction view instead of opening modal
    setFilters(prev => ({ ...prev, saleType: 'auctions' }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  // Show AuctionView when auctions filter is selected
  if (filters.saleType === 'auctions') {
    return <AuctionView onBack={() => setFilters({ ...filters, saleType: 'all' })} />;
  }

  return (
    <div className="space-y-6">
      
      {/* Filter Bar */}
      <FilterBar filters={filters} setFilters={setFilters} />
      
      {/* Filter pills removed (use only FilterBar) */}
      
      {/* Stats */}
      <div className="flex items-center justify-between px-4">
        <h2 className="text-2xl font-bold text-orange-200">
          IP NFT Marketplace
        </h2>
        <div className="text-sm text-orange-200/70">
          {filteredNFTs.length} items • {filteredNFTs.filter(n => n.isListed).length} listed
        </div>
      </div>
      
      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {pageItems.map((nft) => (
          <IPNFTCard
            key={`${nft.contract}-${nft.tokenId}`}
            nft={nft}
            onPreview={setPreview}
            onList={handleList}
            onBuy={handleBuy}
            onOffer={handleOffer}
            onAccess={handleAccess}
            onBid={handleBid}
            showOfferAlways={mode === 'live'}
            mode={mode}
          />
        ))}
      </div>
      
      {/* Empty State */}
      {filteredNFTs.length === 0 && (
        <div className="text-center py-12">
          <p className="text-orange-200/70">No NFTs found matching your criteria</p>
        </div>
      )}
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          <button 
            disabled={page === 1} 
            onClick={() => setPage(p => Math.max(1, p - 1))} 
            className="px-3 py-1 text-xs rounded-lg border text-white/80 border-white/10 disabled:opacity-40"
          >
            Prev
          </button>
          <div className="text-xs text-white/70">{page} / {totalPages}</div>
          <button 
            disabled={page === totalPages} 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
            className="px-3 py-1 text-xs rounded-lg border text-white/80 border-white/10 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
      
      {/* Preview Modal */}
      {preview && (
        <PreviewModal nft={preview} onClose={() => setPreview(null)} />
      )}

      {/* Access Modal */}
      {showAccessModal && accessNFT && (
        <AccessModal 
          nft={accessNFT} 
          onClose={() => {
            setShowAccessModal(false);
            setAccessNFT(null);
          }} 
        />
      )}

      {/* Offer Modal */}
      {showOfferModal && offerNFT && (
        <OfferModal 
          nft={offerNFT} 
          onClose={() => {
            setShowOfferModal(false);
            setOfferNFT(null);
          }} 
        />
      )}

      {/* Bid Modal (auctions) */}
      {showBidModal && bidNFT && (
        <BidModal
          auctionId={BigInt(bidNFT.auctionId)}
          minPrice={BigInt(parseEther(bidNFT.highestBid && Number(bidNFT.highestBid) > 0 ? bidNFT.highestBid : bidNFT.minPrice || '0'))}
          onClose={() => {
            setShowBidModal(false);
            setBidNFT(null);
          }}
        />
      )}
    </div>
  );
}
