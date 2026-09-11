"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI, DEFAULT_IP_NFT_CONTRACT } from './config/simpleMarketplace';
import { createCampPublicClient } from './config/campClient';

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


// Zdjecie hero. Unsplash License: darmowe uzycie komercyjne, podpis autora
// mile widziany - stad link w rogu sekcji. Parametry auto/w/q daja ~1800px
// WebP z CDN Unsplash, bez pobierania pliku do repo.
const HERO = {
  src: 'https://images.unsplash.com/photo-1698899114691-3e4a5d9be3dc?auto=format&fit=crop&w=1800&q=70',
  credit: { name: 'Francisco Gonzalez', href: 'https://unsplash.com/photos/-jmYFZ9CQ80' },
};

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
        const client = createCampPublicClient();
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
          const IP_MAIN = DEFAULT_IP_NFT_CONTRACT;
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
          // Bez trzeciego fallbacku (scrape HTML /token/...): Blockscout nie daje
          // CORS na strony HTML, wiec to zawsze konczylo sie bledem w konsoli.
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

  const tabs: Array<{ id: typeof activeView; label: string; hint: string }> = [
    { id: 'explore', label: 'Listed', hint: 'For sale or licence' },
    { id: 'live', label: 'Fresh mints', hint: 'Newest IP on Camp' },
    ...(isConnected ? [{ id: 'my-ip' as const, label: 'My IP', hint: 'What you own' }] : []),
    { id: 'activity', label: 'Activity', hint: 'Sales, bids, offers' },
    ...(isConnected ? [{ id: 'dashboard' as const, label: 'Dashboard', hint: 'Your listings and earnings' }] : []),
  ];

  return (
    <div className="min-h-screen bg-soft-bg font-soft text-soft-ink">
      <div className="mx-auto max-w-7xl px-3 pb-24 pt-3 sm:px-6 sm:pt-5">
        {/* Hero: ciemnia fotograficzna - miejsce, gdzie powstaje oryginal.
            Jedno zdjecie, przyciemnione do palety Soft Social, statystyki jako
            muzealne etykiety na bialym. */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative overflow-hidden rounded-[26px] bg-soft-ink shadow-[var(--soft-shadow-float)]"
        >
          <img
            src={HERO.src}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-70 saturate-[0.6]"
            style={{ objectPosition: '50% 40%' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#2e2a44]/95 via-[#2e2a44]/70 to-[#5f4ec2]/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#2e2a44]/90 via-transparent to-transparent" />

          <div className="relative flex min-h-[260px] flex-col justify-between gap-6 p-5 sm:min-h-[320px] sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white/85 ring-1 ring-white/15 backdrop-blur">
                <img src="/Camp.png" alt="" className="h-4 w-4" />
                Camp Network
                <span className="hidden text-white/50 sm:inline">·</span>
                <span className="hidden text-white/60 sm:inline">IP NFT</span>
              </div>
              {/* RainbowKit w stylu strony: pigulka zamiast niebieskiego domyslnego
                  przycisku. To jedyne miejsce na tej trasie, ktore przelacza portfel
                  na Camp (484), wiec po polaczeniu pokazuje siec, nie tylko adres. */}
              <ConnectButton.Custom>
                {({ account, chain, openConnectModal, openChainModal, openAccountModal, mounted }) => {
                  if (!mounted) return <span className="h-9" />;
                  if (!account) {
                    return (
                      <button
                        type="button"
                        onClick={openConnectModal}
                        className="rounded-pill bg-white px-4 py-2 text-[13px] font-bold text-soft-ink shadow-[var(--soft-shadow-chip)] transition hover:bg-soft-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-accent"
                      >
                        Connect for Camp
                      </button>
                    );
                  }
                  const wrong = chain?.unsupported || chain?.id !== 484;
                  return (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={openChainModal}
                        className={`rounded-pill px-3 py-2 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-accent ${
                          wrong ? 'bg-soft-accent text-white hover:bg-soft-accent-deep' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20'
                        }`}
                      >
                        {wrong ? 'Switch to Camp' : 'Camp'}
                      </button>
                      <button
                        type="button"
                        onClick={openAccountModal}
                        className="rounded-pill bg-white px-3 py-2 text-[12px] font-bold text-soft-ink shadow-[var(--soft-shadow-chip)] transition hover:bg-soft-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-accent"
                      >
                        {account.displayName}
                      </button>
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <h1 className="font-soft-display text-[34px] font-extrabold leading-[1.02] text-white sm:text-[48px] lg:text-[56px]">
                  Own the original.<br />
                  <span className="text-soft-accent">Licence the rest.</span>
                </h1>
                <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-white/75 sm:text-[15px]">
                  Music, film, images and text minted as IP NFTs on Camp. Buy a work
                  outright, bid in an auction, or pay for a licence and leave the
                  original where it is.
                </p>
              </div>

              <dl className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
                {[
                  { k: 'Listed now', v: Number(stats.listed || 0).toLocaleString() },
                  { k: 'Creators', v: Number(stats.creators || 0).toLocaleString() },
                  { k: 'Traded', v: `${stats.volumeCamp.toFixed(2)} CAMP` },
                ].map((s) => (
                  <div
                    key={s.k}
                    className="flex min-w-[112px] items-baseline justify-between gap-3 rounded-2xl bg-white px-3.5 py-2 shadow-[var(--soft-shadow-chip)] lg:min-w-[180px]"
                  >
                    <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-soft-ink-soft">{s.k}</dt>
                    <dd className="font-soft-display text-[18px] font-extrabold tabular-nums text-soft-ink">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <a
            href={HERO.credit.href}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-2 right-3 text-[10px] text-white/45 hover:text-white/80"
          >
            Photo: {HERO.credit.name} / Unsplash
          </a>
        </motion.section>

        {/* Zakladki + akcje */}
        <div className="mt-4 flex flex-col gap-3 sm:mt-5 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Marketplace sections" className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <div className="inline-flex gap-1 rounded-pill bg-white p-1 shadow-[var(--soft-shadow-chip)]">
              {tabs.map((t) => {
                const active = activeView === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveView(t.id)}
                    title={t.hint}
                    aria-current={active ? 'page' : undefined}
                    className={`whitespace-nowrap rounded-pill px-4 py-2 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                      active
                        ? 'bg-soft-primary text-white shadow-[var(--soft-shadow-chip)]'
                        : 'text-soft-ink-muted hover:bg-soft-surface-sunken hover:text-soft-ink'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </nav>

          {isConnected && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setPrefillTokenId(null); setShowCreateModal(true); }}
                className="rounded-pill bg-soft-primary px-5 py-2.5 text-[13px] font-bold text-white shadow-[var(--soft-shadow-chip)] transition hover:bg-soft-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary-deep"
              >
                List an IP
              </button>
              <button
                type="button"
                onClick={() => setShowCreateAuction({})}
                className="rounded-pill bg-white px-5 py-2.5 text-[13px] font-bold text-soft-ink ring-1 ring-soft-line transition hover:bg-soft-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
              >
                Start an auction
              </button>
            </div>
          )}
        </div>

        {/* Tresc */}
        <div className="mt-4 sm:mt-5">
          {activeView === 'explore' && (
            <MarketplaceGrid mode="explore" onOpenListModal={(nft) => { setPrefillTokenId(nft?.tokenId); setShowCreateModal(true); }} />
          )}
          {activeView === 'live' && (
            <MarketplaceGrid mode="live" onOpenListModal={(nft) => { setPrefillTokenId(nft?.tokenId); setShowCreateModal(true); }} />
          )}
          {activeView === 'my-ip' && isConnected && (
            <MarketplaceGrid mode="my" onOpenListModal={(nft) => { setPrefillTokenId(nft?.tokenId); setShowCreateModal(true); }} />
          )}
          {activeView === 'activity' && <ActivityFeed />}
          {activeView === 'dashboard' && <DashboardView />}
        </div>
      </div>

      {showCreateModal && (
        <CreateListingModal onClose={() => setShowCreateModal(false)} prefillTokenId={prefillTokenId || undefined} />
      )}
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
