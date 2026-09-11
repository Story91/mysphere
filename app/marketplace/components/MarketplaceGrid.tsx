"use client";

import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import IPNFTCard from './IPNFTCard';
import FilterBar from './FilterBar';
import PreviewModal from './PreviewModal';
import AccessModal from './AccessModal';
import BidModal from './BidModal';
import OfferModal from './OfferModal';
import AuctionView from './AuctionView';
import { fetchIpNftsFor, fetchRecentIpNfts } from '../../mycamp/api/fetchIpNfts';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from '../config/simpleMarketplace';
import { createCampPublicClient } from '../config/campClient';

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
  const [totalListingsCount, setTotalListingsCount] = useState(0);
  const [cachedListings, setCachedListings] = useState<Map<string, any>>(new Map());
  const [activeListingIds, setActiveListingIds] = useState<bigint[]>([]);
  const [prefetchedPages, setPrefetchedPages] = useState<Map<number, any[]>>(new Map());
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

  // Cache helpers for explore mode
  const getCacheKey = () => `marketplace-listings-cache-v2`;
  const getListingCache = (): { listings: Map<string, any>; activeIds: bigint[]; activeAuctionIds: bigint[]; timestamp: number } => {
    if (typeof window === 'undefined') return { listings: new Map<string, any>(), activeIds: [], activeAuctionIds: [], timestamp: 0 };
    try {
      const cached = sessionStorage.getItem(getCacheKey());
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          listings: new Map<string, any>(parsed.listings || []),
          activeIds: (parsed.activeIds || []).map((id: string) => BigInt(id)),
          activeAuctionIds: (parsed.activeAuctionIds || []).map((id: string) => BigInt(id)),
          timestamp: parsed.timestamp || 0
        };
      }
    } catch {}
    return { listings: new Map<string, any>(), activeIds: [], activeAuctionIds: [], timestamp: 0 };
  };

  const saveListingCache = (listings: Map<string, any>, activeIds: bigint[], activeAuctionIds: bigint[] = []) => {
    if (typeof window === 'undefined') return;
    try {
      const cacheData = {
        listings: Array.from(listings.entries()),
        activeIds: activeIds.map(id => id.toString()),
        activeAuctionIds: activeAuctionIds.map(id => id.toString()),
        timestamp: Date.now()
      };
      sessionStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
    } catch {}
  };

  // Rate limiting for prefetch
  const [lastPrefetchTime, setLastPrefetchTime] = useState(0);
  const PREFETCH_COOLDOWN = 5000; // 5 seconds between prefetch operations

  // Prefetch function for background loading
  const prefetchPage = async (pageToFetch: number) => {
    const now = Date.now();
    
    if (
      mode !== 'explore' || 
      prefetchedPages.has(pageToFetch) || 
      !activeListingIds.length ||
      (now - lastPrefetchTime) < PREFETCH_COOLDOWN
    ) {
      console.log(`⏸️ Skipping prefetch for page ${pageToFetch} (cooldown or already cached)`);
      return;
    }

    setLastPrefetchTime(now);
    console.log(`🔮 Prefetching page ${pageToFetch} in background...`);

    try {
      const client = createCampPublicClient();

      const cache = getListingCache();
      let allActiveAuctionIds: bigint[] = cache.activeAuctionIds || [];
      let allActiveListingIds: bigint[] = cache.activeIds || activeListingIds;
      let listingsCache = new Map<string, any>(cache.listings);

      // Calculate items for the page (use same logic as normal loading)
      const startIndex = (pageToFetch - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const allItems = [...allActiveListingIds, ...allActiveAuctionIds];
      const pageItemIds = allItems.slice(startIndex, endIndex);
      
      const pageListingIds = pageItemIds.filter(id => allActiveListingIds.includes(id));
      const pageAuctionIds = pageItemIds.filter(id => allActiveAuctionIds.includes(id));

      const items: any[] = [];

      // Process listings for this page (limit concurrent fetches)
      const maxConcurrentFetches = 3; // Limit to 3 concurrent RPC calls
      let fetchCount = 0;
      
      for (const id of pageListingIds) {
        const cacheKey = `listing-${id}`;
        
        if (listingsCache.has(cacheKey)) {
          items.push(listingsCache.get(cacheKey));
          continue;
        }

        // Skip if we've reached the limit for this prefetch batch
        if (fetchCount >= maxConcurrentFetches) {
          console.log(`⏸️ Prefetch limit reached (${maxConcurrentFetches}), stopping early`);
          break;
        }

        fetchCount++;
        
        // If not in cache, fetch it
        try {
          const l = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'listings',
            args: [id],
          }) as any;

          const isActive = l[6];
          if (!isActive) continue;

          let tokenUri = '';
          let metadata: any = null;
          let image = '';
          let mediaUrl = '';
          let mime = '';
          let mediaType: 'image' | 'video' | 'audio' | 'text' | 'unknown' = 'unknown';
          
          const ipfsToHttp = (url: string) => url?.startsWith('ipfs://') ? url.replace('ipfs://', 'https://ipfs.io/ipfs/') : url;
          
          try {
            const ERC721_ABI = [{ name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'string' }] }] as const;
            
            tokenUri = (await client.readContract({
              address: l[1] as `0x${string}`,
              abi: ERC721_ABI,
              functionName: 'tokenURI',
              args: [l[2]],
            })) as string;
            
            const metaUrl = ipfsToHttp(tokenUri);
            if (metaUrl) {
              metadata = await fetch(metaUrl, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
              if (metadata?.image) image = ipfsToHttp(metadata.image);
              
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

          let terms: any = null;
          try {
            terms = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'getTerms',
              args: [l[2] as bigint],
            });
          } catch {}

          const listingItem = {
            listingId: id.toString(),
            contract: l[1],
            tokenId: l[2].toString(),
            price: (Number(l[3]) / 1e18).toString(),
            seller: l[0],
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
          };
          
          listingsCache.set(cacheKey, listingItem);
          items.push(listingItem);
        } catch {}
      }

      // Process auctions for this page (simplified)
      for (const auctionId of pageAuctionIds) {
        const auctionCacheKey = `auction-${auctionId}`;
        
        if (listingsCache.has(auctionCacheKey)) {
          items.push(listingsCache.get(auctionCacheKey));
        }
        // Note: For prefetch, we only use cached auctions to avoid too many RPC calls
      }

      // Save prefetched page and update cache
      setPrefetchedPages(prev => new Map(prev.set(pageToFetch, items)));
      setCachedListings(listingsCache);
      saveListingCache(listingsCache, allActiveListingIds, allActiveAuctionIds);
      
      console.log(`✅ Prefetched page ${pageToFetch}: ${items.length} items`);
    } catch (error) {
      console.error(`❌ Failed to prefetch page ${pageToFetch}:`, error);
    }
  };

  // Fetch NFTs depending on mode
  useEffect(() => {
    const loadNFTs = async () => {
      setLoading(true);
      
      let nfts: any[] = [];
      
      if (mode === 'my' && address) {
        try {
          const userNFTs = await fetchIpNftsFor(address);
          
          // Check which tokens are already listed on marketplace
          const client = createCampPublicClient();
          
          // Get listing count first
          const listingCount = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'getListingCount',
          }) as bigint;

          const listedTokens = new Set<string>();
          const auctionedTokens = new Map<string, any>();
          
          // Manually check each listing (since getActiveListings was removed)
          const listedTokenPrices = new Map<string, string>();
          for (let i = 1n; i <= listingCount; i++) {
            try {
              const listing = await client.readContract({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'listings',
                args: [i],
              }) as any;
              
              // listing[2] is tokenId, listing[1] is nftContract, listing[6] is isActive, listing[3] is price
              if (listing[6] && listing[1]?.toLowerCase() === '0xf90733b9ecda3b49c250b2c3e3e42c96fc93324e'.toLowerCase()) {
                const tokenId = listing[2].toString();
                const price = (Number(listing[3]) / 1e18).toString(); // Convert from wei to CAMP
                listedTokens.add(tokenId);
                listedTokenPrices.set(tokenId, price);
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
          const userNFTsFormatted = userNFTs.map((nft: any) => {
            const isListed = listedTokens.has(nft.tokenId);
            const isAuctioned = auctionedTokens.has(nft.tokenId);
            const marketplacePrice = listedTokenPrices.get(nft.tokenId);
            const nativePrice = nft.metadata?.attributes?.find((a: any) => a.trait_type === 'Price (native)')?.value || '0.1';
            
            return {
              ...nft,
              isListed,
              isAuctioned,
              auctionData: auctionedTokens.get(nft.tokenId),
              price: isListed ? marketplacePrice : nativePrice, // Use marketplace price if listed, otherwise native price
              seller: address
            };
          });
          
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
        // Explore: aktywne listingi z marketplace z cache i paginacją
        
        // Check if we have prefetched this page
        if (prefetchedPages.has(page)) {
          console.log(`🚀 Using prefetched page ${page}`);
          nfts = prefetchedPages.get(page) || [];
          // Don't return here - let it continue to setAllNFTs below
        } else {
        
        try {
          const client = createCampPublicClient();
          console.log('🔍 Fetching active listings from marketplace:', MARKETPLACE_ADDRESS);
          
          // Sprawdź cache
          const cache = getListingCache();
          const CACHE_DURATION = 15 * 60 * 1000; // 15 minut
          const isCacheValid = cache.timestamp && (Date.now() - cache.timestamp) < CACHE_DURATION;
          
          let allActiveIds: bigint[] = [];
          let allActiveAuctionIds: bigint[] = [];
          let listingsCache = new Map<string, any>(cache.listings);
          
          if (isCacheValid && cache.activeIds.length > 0) {
            console.log('📋 Using cached active listing IDs:', cache.activeIds.length, 'auctions:', cache.activeAuctionIds?.length || 0);
            allActiveIds = cache.activeIds;
            allActiveAuctionIds = cache.activeAuctionIds || [];
            setActiveListingIds(allActiveIds);
            setTotalListingsCount(allActiveIds.length + allActiveAuctionIds.length);
          } else {
            console.log('🔄 Cache expired or empty, scanning for active listings...');
            // Get total listing count first
            const listingCount = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'getListingCount',
            }) as bigint;
            
            // Scan wszystkie listingi aby znaleźć aktywne
            for (let i = 1n; i <= listingCount; i++) {
              try {
                const listing = await client.readContract({
                  address: MARKETPLACE_ADDRESS as `0x${string}`,
                  abi: MARKETPLACE_ABI,
                  functionName: 'listings',
                  args: [i],
                }) as any;
                
                // listing[6] is isActive
                if (listing[6]) {
                  allActiveIds.push(i);
                }
              } catch {}
            }
            
            // Skanuj także aukcje
            try {
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
                  
                  if (Boolean(auction[9])) { // auction[9] is active
                    allActiveAuctionIds.push(i);
                  }
                } catch {}
              }
            } catch {}
            
            setActiveListingIds(allActiveIds);
            setTotalListingsCount(allActiveIds.length + allActiveAuctionIds.length);
            console.log(`📋 Found ${allActiveIds.length} active listings, ${allActiveAuctionIds.length} active auctions`);
          }
          
          // Pobierz elementy dla aktualnej strony (listingi + aukcje)
          const startIndex = (page - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const allItems = [...allActiveIds, ...allActiveAuctionIds];
          const pageItemIds = allItems.slice(startIndex, endIndex);
          
          // Rozdiel na listingi i aukcje
          const pageListingIds = pageItemIds.filter(id => allActiveIds.includes(id));
          const pageAuctionIds = pageItemIds.filter(id => allActiveAuctionIds.includes(id));
          
          console.log(`📋 Page ${page}: showing ${pageListingIds.length} listings + ${pageAuctionIds.length} auctions (${pageItemIds.length} total)`);
          
          setCachedListings(listingsCache);

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
          for (const id of pageListingIds) {
            const cacheKey = `listing-${id}`;
            
            // Sprawdź czy mamy listing w cache
            if (listingsCache.has(cacheKey)) {
              console.log(`💾 Using cached listing ${id}`);
              items.push(listingsCache.get(cacheKey));
              continue;
            }
            
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

            const listingItem = {
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
            };
            
            // Cache this listing
            listingsCache.set(cacheKey, listingItem);
            items.push(listingItem);
          }
          
          console.log('✅ Final processed listings:', items);
          
          // Process auctions for this page
          for (const auctionId of pageAuctionIds) {
            const auctionCacheKey = `auction-${auctionId}`;
            
            // Sprawdź czy mamy aukcję w cache
            if (listingsCache.has(auctionCacheKey)) {
              console.log(`💾 Using cached auction ${auctionId}`);
              items.push(listingsCache.get(auctionCacheKey));
              continue;
            }
            
            console.log(`🔸 Fetching auction ${auctionId}...`);
            try {
              const a = await client.readContract({ 
                address: MARKETPLACE_ADDRESS as `0x${string}`, 
                abi: MARKETPLACE_ABI, 
                functionName: 'auctions', 
                args: [auctionId] 
              }) as any;
              
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
              
              const auctionItem = {
                auctionId: auctionId.toString(),
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
              };
              
              // Cache this auction
              listingsCache.set(auctionCacheKey, auctionItem);
              items.push(auctionItem);
            } catch (error) {
              console.error(`Failed to fetch auction ${auctionId}:`, error);
            }
          }
          
          // Save updated cache
          setCachedListings(listingsCache);
          saveListingCache(listingsCache, allActiveIds, allActiveAuctionIds);
          
          nfts = items;
        } catch (err) {
          console.error('❌ Failed to load marketplace listings:', err);
        }
        } // End of else block for non-prefetched pages
      }
      
      setAllNFTs(nfts);
      setLoading(false);
    };
    
    loadNFTs();
  }, [address, mode, page]); // Dodane page do dependencies aby przeładowywało przy zmianie strony

  // Reset page to 1 when mode changes (separate useEffect)
  useEffect(() => {
    setPage(1);
  }, [mode]);

  // Invalidate cache when marketplace listing is created
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'marketplace-listing-created' && mode === 'explore') {
        console.log('🔄 Marketplace listing created - invalidating cache');
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem(getCacheKey());
        }
        setPage(1); // Reset to first page and reload
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [mode]);

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
              const client = createCampPublicClient();
              
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
    // Note: Not resetting page here to allow pagination in explore mode
  }, [allNFTs, filters]);

  // Reset page only when filters change (not when allNFTs change)
  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Prefetch next page when current page loads (only for explore mode) - THROTTLED
  useEffect(() => {
    if (mode !== 'explore' || loading || activeListingIds.length === 0) {
      return;
    }

    const totalPages = Math.ceil((totalListingsCount || activeListingIds.length) / pageSize);
    
    // Only prefetch once per page change, with throttling
    const timeoutId = setTimeout(() => {
      const nextPage = page + 1;
      
      // Prefetch only next page to avoid RPC overload
      if (nextPage <= totalPages && !prefetchedPages.has(nextPage)) {
        console.log(`🔮 Triggering prefetch for page ${nextPage}`);
        prefetchPage(nextPage);
      }
    }, 2000); // Increased delay to avoid rate limiting

    return () => clearTimeout(timeoutId);
  }, [mode, page]); // Minimal dependencies to avoid loops

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

  // Dla explore mode używamy totalListingsCount, dla innych mode'ów normalną paginację
  const totalPages = mode === 'explore' 
    ? Math.max(1, Math.ceil(totalListingsCount / pageSize))
    : Math.max(1, Math.ceil(filteredNFTs.length / pageSize));
  const pageItems = mode === 'explore' 
    ? filteredNFTs // W explore mode już mamy odpowiednie NFT z RPC
    : filteredNFTs.slice((page - 1) * pageSize, page * pageSize);

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
          {mode === 'explore' ? totalListingsCount : filteredNFTs.length} items • {filteredNFTs.filter(n => n.isListed).length} listed
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
