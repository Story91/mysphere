"use client";

import { useState, useEffect } from 'react';

import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from '../config/simpleMarketplace';
import { createCampPublicClient } from '../config/campClient';

interface ActivityEvent {
  type: 'listing' | 'sale' | 'offer' | 'cancel' | 'auction' | 'bid' | 'access';
  blockNumber: number;
  timestamp: number;
  txHash: string;
  tokenId: string;
  price: string;
  seller: string;
  buyer?: string;
  listingId?: string;
  auctionId?: string;
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMarketplaceActivity = async () => {
      console.log('🔍 Fetching marketplace activity using contract reads...');
      try {
        const client = createCampPublicClient();

        const activityEvents: ActivityEvent[] = [];

        // 1. Get active listings (recent listings)
        // Get listing count first
        const listingCount = await client.readContract({
          address: MARKETPLACE_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'getListingCount',
        }) as bigint;

        // Collect last 10 active listings
        const activeListings: bigint[] = [];
        for (let i = listingCount; i > 0n && activeListings.length < 10; i--) {
          try {
            const listing = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'listings',
              args: [i],
            }) as any;
            
            if (listing[6]) { // isActive
              activeListings.push(i);
            }
          } catch {}
        }

        console.log('📋 Active listings:', activeListings.length);

        // Get details for each listing
        for (const listingId of activeListings.slice(0, 10)) {
          try {
            const listing = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'listings',
              args: [listingId],
            }) as any;

            // listing[0] = seller, listing[2] = tokenId, listing[3] = price, listing[7] = createdAt
            if (listing[6]) { // isActive
              activityEvents.push({
                type: 'listing',
                blockNumber: 0,
                timestamp: Number(listing[7] || 0), // createdAt
                txHash: `listing-${listingId}`,
                tokenId: listing[2]?.toString() || 'N/A',
                price: listing[3] ? (Number(listing[3]) / 1e18).toFixed(3) : '0',
                seller: listing[0] || '0x...',
                listingId: listingId.toString()
              });
            }
          } catch (e) {
            console.error('Error fetching listing details:', e);
          }
        }

        // 2. Check recent offers (if any listings have offers)
        for (const listingId of activeListings.slice(0, 5)) {
          try {
            // Get listing details first
            const listingDetails = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'listings',
              args: [listingId],
            }) as any;

            // Check if this listing has offers (offers function might exist)
            const offersData = await client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: 'offers',
              args: [listingId, 0n], // Try first offer for each listing
            }) as any;

            if (offersData && offersData[3] && Number(offersData[3]) > 0) { // price > 0
              activityEvents.push({
                type: 'offer',
                blockNumber: 0,
                timestamp: Number(offersData[2] || 0), // createdAt
                txHash: `offer-${listingId}-0`,
                tokenId: listingDetails[2]?.toString() || 'N/A',
                price: offersData[3] ? (Number(offersData[3]) / 1e18).toFixed(3) : '0',
                seller: offersData[0] || '0x...', // buyer making offer
                listingId: listingId.toString()
              });
            }
          } catch (e) {
            // Offers might not exist for this listing, ignore
          }
        }

        // 3. Get recent sales from Blockscout API
        try {
          const BLOCKSCOUT = 'https://camp.cloud.blockscout.com/api';
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          const res = await fetch(`${BLOCKSCOUT}?module=account&action=txlist&address=${MARKETPLACE_ADDRESS}&sort=desc&page=1&offset=20`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          
          const json = await res.json();
          
          if (json.result && Array.isArray(json.result)) {
            for (const tx of json.result.slice(0, 10)) {
              // Look for buyNFT transactions
              if (tx.functionName?.includes('buyNFT') || tx.methodId === '0xa4e2d634') {
                activityEvents.push({
                  type: 'sale',
                  blockNumber: parseInt(tx.blockNumber || '0'),
                  timestamp: parseInt(tx.timeStamp || '0'),
                  txHash: tx.hash,
                  tokenId: 'N/A', // Could parse from input data
                  price: (Number(tx.value) / 1e18).toFixed(3),
                  seller: tx.to, // marketplace contract
                  buyer: tx.from
                });
              }
              
              // Look for makeOffer transactions  
              if (tx.functionName?.includes('makeOffer') || tx.methodId === '0x') {
                activityEvents.push({
                  type: 'offer',
                  blockNumber: parseInt(tx.blockNumber || '0'),
                  timestamp: parseInt(tx.timeStamp || '0'),
                  txHash: tx.hash,
                  tokenId: 'N/A',
                  price: (Number(tx.value) / 1e18).toFixed(3),
                  seller: tx.from
                });
              }
            }
          }
        } catch (e) {
          console.log('Could not fetch transaction history from Blockscout');
        }

        // 4. Get recent auctions
        try {
          const auctionCount = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'auctionCount',
          }) as bigint;

          // Get last 5 auctions
          for (let i = auctionCount; i > 0n && i > auctionCount - 5n; i--) {
            try {
              const auction = await client.readContract({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'auctions',
                args: [i],
              }) as any;

              if (auction && auction[9]) { // Check if active (index 9)
                activityEvents.push({
                  type: 'auction',
                  blockNumber: 0,
                  timestamp: 0,
                  txHash: `auction-${i}`,
                  tokenId: auction[2]?.toString() || 'N/A',
                  price: auction[3] ? (Number(auction[3]) / 1e18).toFixed(3) : '0', // minPrice
                  seller: auction[0] || '0x...',
                  auctionId: i.toString()
                });

                // If there's a highest bid, add it too
                if (auction[7] && Number(auction[7]) > 0) {
                  activityEvents.push({
                    type: 'bid',
                    blockNumber: 0,
                    timestamp: 0,
                    txHash: `bid-${i}`,
                    tokenId: auction[2]?.toString() || 'N/A',
                    price: (Number(auction[7]) / 1e18).toFixed(3),
                    seller: auction[6] || '0x...', // highestBidder
                    auctionId: i.toString()
                  });
                }
              }
            } catch (e) {
              console.error('Error fetching auction:', e);
            }
          }
        } catch (e) {
          console.log('Could not fetch auctions');
        }

        // 5. Get listing count to show growth
        try {
          const listingCount = await client.readContract({
            address: MARKETPLACE_ADDRESS as `0x${string}`,
            abi: MARKETPLACE_ABI,
            functionName: 'getListingCount',
          }) as bigint;
          
          console.log('📊 Total listings ever created:', Number(listingCount));
        } catch (e) {
          console.log('Could not fetch listing count');
        }

        console.log('✅ Processed contract-based events:', activityEvents);
        
        // Sort by timestamp descending (most recent first) - prawdziwy timestamp!
        activityEvents.sort((a, b) => {
          // Najpierw sortuj po rzeczywistym timestampie (jeśli > 0)
          if (a.timestamp > 0 && b.timestamp > 0) {
            return b.timestamp - a.timestamp;
          }
          // Potem te bez timestampu
          if (a.timestamp === 0 && b.timestamp > 0) return 1;
          if (b.timestamp === 0 && a.timestamp > 0) return -1;
          return 0;
        });

        // Usuń duplikaty (ten sam txHash)
        const uniqueEvents = activityEvents.filter((event, index, arr) => 
          index === arr.findIndex(e => e.txHash === event.txHash)
        );

        console.log('📅 Final sorted events:', uniqueEvents.map(e => ({ 
          type: e.type, 
          timestamp: e.timestamp, 
          time: new Date(e.timestamp * 1000).toLocaleString() 
        })));

        setEvents(uniqueEvents.slice(0, 8));
        
      } catch (error) {
        console.error('❌ Error fetching marketplace activity:', error);
        // Fallback to demo data
        const now = Math.floor(Date.now() / 1000);
        setEvents([
          {
            type: 'listing',
            blockNumber: 0,
            timestamp: now - 1800, // 30 min ago
            txHash: 'demo-1',
            tokenId: '637624',
            price: '1.0',
            seller: '0xF1...fd'
          },
          {
            type: 'listing',
            blockNumber: 0,
            timestamp: now - 7200, // 2 hours ago
            txHash: 'demo-2',
            tokenId: '801777',
            price: '0.001',
            seller: '0xA2...be'
          }
        ]);
      } finally {
        console.log('🏁 ActivityFeed loading complete');
        setLoading(false);
      }
    };

    fetchMarketplaceActivity();
  }, []);

  const formatTimeAgo = (timestamp: number) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'listing': return '🏷️';
      case 'sale': return '💰';
      case 'offer': return '📝';
      case 'cancel': return '❌';
      case 'auction': return '🔨';
      case 'bid': return '💸';
      case 'access': return '🔑';
      default: return '📊';
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'listing': return 'text-orange-400';
      case 'sale': return 'text-green-400';
      case 'offer': return 'text-blue-400';
      case 'cancel': return 'text-red-400';
      case 'auction': return 'text-amber-400';
      case 'bid': return 'text-yellow-400';
      case 'access': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="bg-black/40 border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-orange-500"></div>
          <span className="ml-3 text-white/70">Loading marketplace activity...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Marketplace Activity</h3>
        <span className="text-xs text-white/50">Live Feed</span>
      </div>
      
      {events.length === 0 ? (
        <div className="text-center py-8 text-white/60">
          <div className="text-2xl mb-2">📈</div>
          <div>No recent activity</div>
          <div className="text-xs mt-1">Be the first to trade!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event, index) => (
            <div 
              key={`${event.txHash}-${index}`}
              className="flex items-center justify-between p-3 bg-black/30 rounded-lg border border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="text-lg">{getEventIcon(event.type)}</div>
                <div>
                  <div className={`text-sm font-medium ${getEventColor(event.type)}`}>
                    {event.type === 'listing' && 'NFT Listed'}
                    {event.type === 'sale' && 'NFT Sold'}
                    {event.type === 'offer' && 'Offer Made'}
                    {event.type === 'cancel' && 'Listing Cancelled'}
                  </div>
                  <div className="text-xs text-white/50">
                    by {event.seller.slice(0, 6)}...{event.seller.slice(-4)}
                    {event.buyer && (
                      <> to {event.buyer.slice(0, 6)}...{event.buyer.slice(-4)}</>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-orange-400">
                  {event.price} $CAMP
                </div>
                <div className="text-xs text-white/50">
                  {formatTimeAgo(event.timestamp)}
                </div>
              </div>
            </div>
          ))}
          
          <div className="text-center pt-2">
            <a 
                              href={`https://camp.cloud.blockscout.com/address/${MARKETPLACE_ADDRESS}/transactions`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-orange-400 hover:text-orange-300 underline"
            >
              View all transactions →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
