"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { createPublicClient, http } from 'viem';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI, DEFAULT_IP_NFT_CONTRACT } from './config/simpleMarketplace';

// Dynamicznie importuj komponenty które używają wagmi hooks
const MarketplaceGrid = dynamic(() => import('./components/MarketplaceGrid'), {
  ssr: false,
  loading: () => <div className="text-center py-12">Loading marketplace...</div>
});

const CreateListingModal = dynamic(() => import('./components/CreateListingModal'), {
  ssr: false
});

import DashboardView from './components/DashboardView';

const ActivityFeed = dynamic(() => import('./components/ActivityFeed'), {
  ssr: false,
  loading: () => <div className="text-center py-12">Loading activity...</div>
});

const CreateAuctionModal = dynamic(() => import('./components/CreateAuctionModal'), {
  ssr: false
});

export default function MarketplacePage() {
  const { address, isConnected } = useAccount();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateAuction, setShowCreateAuction] = useState<any>(null);
  const [prefillTokenId, setPrefillTokenId] = useState<string | null>(null);
  
  // Check for list and auction parameters in URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const listTokenId = urlParams.get('list');
      const auctionId = urlParams.get('auction');
      
      if (listTokenId) {
        setPrefillTokenId(listTokenId);
        setShowCreateModal(true);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      } else if (auctionId) {
        // Switch to explore view to show the specific auction
        setActiveView('explore');
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);
  const [activeView, setActiveView] = useState<'explore' | 'live' | 'my-ip' | 'my-listings' | 'offers' | 'activity' | 'dashboard'>('explore');
  const [stats, setStats] = useState<{ listed: number; creators: number; volumeCamp: number }>({ listed: 0, creators: 0, volumeCamp: 0 });

  useEffect(() => {
    (async () => {
      try {
        const client = createPublicClient({ chain: baseCampChain, transport: http(baseCampChain.rpcUrls.default.http[0]) });
        // Active listings count
        let listed = 0;
        try {
          const listingCount = await client.readContract({ 
            address: MARKETPLACE_ADDRESS as `0x${string}`, 
            abi: MARKETPLACE_ABI, 
            functionName: 'getListingCount' 
          }) as bigint;
          
          // Count active listings
          for (let i = 1n; i <= listingCount; i++) {
            try {
              const listing = await client.readContract({
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: 'listings',
                args: [i],
              }) as any;
              
              if (listing[6]) { // isActive
                listed++;
              }
            } catch {}
          }
        } catch {}

        // Unique holders for main IP contract
        let creators = 0;
        try {
          const IP_MAIN = '0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E';
          // Try Blockscout v2 token endpoint first
          let got = false;
          try {
            const rV2 = await fetch(`https://camp.cloud.blockscout.com/api/v2/tokens/${IP_MAIN}`);
            if (rV2.ok) {
              const j = await rV2.json();
              const total = j?.holders?.toString ? Number(j.holders) : (j?.holders_count || 0);
              if (total && total > 0) { creators = total; got = true; }
            }
          } catch {}
          if (!got) {
            // Try legacy token info
            try {
              const rInfo = await fetch(`https://camp.cloud.blockscout.com/api?module=token&action=tokeninfo&contractaddress=${IP_MAIN}`);
              const jInfo = await rInfo.json();
              const total2 = Number(jInfo?.result?.holders || jInfo?.count || 0);
              if (total2 && total2 > 0) { creators = total2; got = true; }
            } catch {}
          }
          if (!got) {
            // Last resort: scrape holders page
            try {
              const page = await fetch(`https://camp.cloud.blockscout.com/token/${IP_MAIN}`);
              const html = await page.text();
              const m = html.match(/Holders[^\d]*([\d,]+)/i);
              if (m && m[1]) {
                creators = Number(m[1].replace(/,/g, ''));
                got = true;
              }
            } catch {}
          }
          if (!got) creators = 0;
        } catch {}

        // Volume in CAMP to marketplace contract
        let volumeCamp = 0;
        try {
          const BLOCKSCOUT = 'https://camp.cloud.blockscout.com/api';
          const addr = MARKETPLACE_ADDRESS;
          const res = await fetch(`${BLOCKSCOUT}?module=account&action=txlist&address=${addr}`);
          const json = await res.json();
          const list = (json?.result || []) as Array<{ to: string; isError: string; value: string }>;
          volumeCamp = list.filter(t => t.to?.toLowerCase() === addr.toLowerCase() && t.isError === '0').reduce((sum, t) => sum + Number(t.value) / 1e18, 0);
        } catch {}

        setStats({ listed, creators, volumeCamp });
      } catch {
        setStats({ listed: 0, creators: 0, volumeCamp: 0 });
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-black">
      {/* Compact Hero Section - Mobile Responsive */}
      <div className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-600/10 via-purple-600/10 to-blue-600/10 blur-3xl" />
        
        <div className="relative container mx-auto px-4 py-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="relative inline-flex items-center justify-center">
                <span className="relative w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white ring-2 ring-orange-400/50 shadow-lg flex items-center justify-center">
                  <img src="/Camp.png" alt="CAMP" className="w-4 h-4 sm:w-6 sm:h-6" />
                </span>
              </span>
              <h1
                className="text-base sm:text-xl lg:text-2xl font-bold flex items-center gap-2"
                style={{ fontFamily: 'Space Grotesk, ClashDisplay, Inter, ui-sans-serif, system-ui' }}
              >
                <span className="bg-gradient-to-r from-orange-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
                  IP NFT Marketplace
                </span>
              </h1>
              <span className="hidden lg:block text-gray-500 text-sm ml-2">
                Trade and license intellectual property NFTs on Camp Network
              </span>
            </div>
            
            {/* Stats - Mobile Responsive */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-black/50 rounded-lg border border-orange-500/20">
                <span className="text-xs sm:text-sm font-bold text-orange-400">{Number(stats.listed || 0)}</span>
                <span className="text-xs text-gray-500">Listed</span>
              </div>
              <div className="flex sm:hidden md:flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-black/50 rounded-lg border border-purple-500/20">
                <span className="text-xs sm:text-sm font-bold text-purple-400">{Number(stats.creators || 0).toLocaleString()}</span>
                <span className="text-xs text-gray-500">Creators</span>
              </div>
              <div className="flex sm:hidden lg:flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-black/50 rounded-lg border border-blue-500/20">
                <span className="text-xs sm:text-sm font-bold text-blue-400">{stats.volumeCamp.toFixed(2)}</span>
                <span className="text-xs text-gray-500">CAMP</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Navigation - Mobile Responsive */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            {/* Main Navigation - Grid on mobile, flex on desktop */}
            <div className="grid grid-cols-2 sm:flex gap-2">
              <button
                onClick={() => setActiveView('explore')}
                className={`px-3 sm:px-6 py-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                  activeView === 'explore'
                    ? 'bg-orange-500 text-white'
                    : 'bg-black/50 text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                🔍 Explore
              </button>
              <button
                onClick={() => setActiveView('live')}
                className={`px-3 sm:px-6 py-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                  activeView === 'live'
                    ? 'bg-orange-500 text-white'
                    : 'bg-black/50 text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                🟢 IP Live
              </button>
              {isConnected && (
                <button
                  onClick={() => setActiveView('my-ip')}
                  className={`px-3 sm:px-6 py-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                    activeView === 'my-ip'
                      ? 'bg-orange-500 text-white'
                      : 'bg-black/50 text-gray-400 hover:text-white border border-gray-800'
                  }`}
                >
                  🧩 My IP
                </button>
              )}
              <button
                onClick={() => setActiveView('activity')}
                className={`px-3 sm:px-6 py-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                  activeView === 'activity'
                    ? 'bg-orange-500 text-white'
                    : 'bg-black/50 text-gray-400 hover:text-white border border-gray-800'
                }`}
              >
                🕒 Activity
              </button>
            </div>

            {/* Action Buttons - Mobile responsive */}
            <div className="flex flex-col sm:flex-row gap-2">
              {isConnected && (
                <>
                  <button
                    onClick={() => { setPrefillTokenId(null); setShowCreateModal(true); }}
                    className="px-4 sm:px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all text-sm sm:text-base"
                  >
                    + List NFT
                  </button>
                  <button
                    onClick={() => setShowCreateAuction({})}
                    className="px-4 sm:px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-lg hover:from-orange-600 hover:to-amber-600 transition-all text-sm sm:text-base"
                  >
                    🎯 Auction
                  </button>
                  <button
                    onClick={() => setActiveView('dashboard')}
                    className="px-4 sm:px-6 py-2 bg-gradient-to-r from-gray-700 to-gray-800 text-white font-bold rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all text-sm sm:text-base"
                  >
                    📊 Dashboard
                  </button>
                </>
              )}
            </div>
          </div>

        {/* Main Content Area */}
        {activeView === 'explore' && (
          <div className="animate-fadeIn">
            <MarketplaceGrid mode="explore" onOpenListModal={(nft) => { setPrefillTokenId(nft?.tokenId); setShowCreateModal(true); }} />
          </div>
        )}
        {activeView === 'live' && (
          <div className="animate-fadeIn">
            <MarketplaceGrid mode="live" onOpenListModal={(nft) => { setPrefillTokenId(nft?.tokenId); setShowCreateModal(true); }} />
            {/* Stalo tu "IP Live source: 0xF90733b9...", czyli obietnica, ze widok
                czyta zywe dane spod tego adresu. eth_getCode na Camp Network (484)
                zwraca 0x - ani dla kolekcji IP-NFT (0xF90733b9...), ani dla targu
                (0xf528f920...), sprawdzone przez scripts/verifyOnchainInventory.js.
                Pod obydwoma NIE MA kontraktu, wiec zaden odczyt stamtad nie moze sie
                udac i siatka zawsze wyjdzie pusta. Sam adres pod pusta siatka czytalo
                sie jako "zrodlo dziala, po prostu nikt nic nie wystawil" - a to nie
                to samo. Podpis mowi teraz, ze polaczenia nie ma. */}
            <div className="text-center text-xs text-gray-500 mt-2">
              IP Live is not connected: no contract is deployed at the configured
              Camp Network addresses, so nothing can load here.
            </div>
          </div>
        )}
        {activeView === 'activity' && (
          <div className="animate-fadeIn">
            <ActivityFeed />
          </div>
        )}
        {activeView === 'dashboard' && (
          <div className="animate-fadeIn">
            {/* Placeholder until dashboard panel moved inline */}

          </div>
        )}
        {activeView === 'my-ip' && isConnected && (
          <div className="animate-fadeIn">
            <MarketplaceGrid mode="my" onOpenListModal={(nft) => { setPrefillTokenId(nft?.tokenId); setShowCreateModal(true); }} />
          </div>
        )}
        
        {activeView === 'dashboard' && (
          <DashboardView />
        )}
      </div>

      {/* Create Listing Modal */}
      {showCreateModal && (
        <CreateListingModal onClose={() => setShowCreateModal(false)} prefillTokenId={prefillTokenId || undefined} />
      )}
      
      {/* Create Auction Modal */}
      {showCreateAuction && (
        <CreateAuctionModal 
          nftContract={showCreateAuction.nftContract}
          tokenId={showCreateAuction.tokenId}
          onClose={() => setShowCreateAuction(null)}
        />
      )}
    </div>
  );
}


