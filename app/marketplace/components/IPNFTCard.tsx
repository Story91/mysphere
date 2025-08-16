"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface IPNFTCardProps {
  nft: any;
  onPreview?: (nft: any) => void;
  onList?: (nft: any) => void;
  onBuy?: (nft: any) => void;
  onOffer?: (nft: any) => void;
  onAccess?: (nft: any) => void;
  onBid?: (nft: any) => void;
  showOfferAlways?: boolean;
}

export default function IPNFTCard({ 
  nft, 
  onPreview, 
  onList, 
  onBuy, 
  onOffer,
  onAccess,
  onBid,
  showOfferAlways = false 
}: IPNFTCardProps) {
  const { address } = useAccount();
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nowTs, setNowTs] = useState<number>(Math.floor(Date.now() / 1000));
  
  // live timer for auctions
  useEffect(() => {
    if (nft?.saleType !== 'auction') return;
    const t = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [nft?.saleType]);
  
  // For auctions, check if user is the auction seller
  // For regular NFTs, check if user is the NFT seller/owner
  const isOwner = address && nft.seller?.toLowerCase() === address.toLowerCase();
  const isAuctionSeller = nft.saleType === 'auction' && isOwner;
  const metadata = nft.metadata || {};
  const name = metadata.name || `IP NFT #${nft.tokenId}`;
  const image = nft.image || metadata.image || '';
  
  // Get media type
  const mediaType = (nft.type || 'image').toLowerCase();
  
  // Format token ID display - show first and last parts
  const formatTokenId = (id: string) => {
    if (!id) return '';
    const str = id.toString();
    if (str.length > 15) return `${str.slice(0, 6)}...${str.slice(-4)}`;
    return str;
  };
  
  // Get frame gradient classes based on media type (like in MyCamp)
  const frameClasses = (type: string) => {
    switch(type) {
      case 'image':
        return 'bg-gradient-to-br from-orange-500 via-amber-400 to-orange-600';
      case 'audio':
        return 'bg-gradient-to-br from-emerald-500 via-green-500 to-lime-400';
      case 'video':
        return 'bg-gradient-to-br from-rose-600 via-red-500 to-orange-500';
      case 'text':
        return 'bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500';
      default:
        return 'bg-gradient-to-br from-slate-500 to-slate-300';
    }
  };

  const formatTimeLeft = (endTime?: number | string | bigint) => {
    if (!endTime) return '';
    const end = Number(endTime);
    const seconds = Math.max(0, end - nowTs);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 24) return `${Math.floor(h/24)}d ${h%24}h`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  // Get attributes
  const attributes = metadata.attributes || [];
  const licenseCommercial = attributes.find((a: any) => a.trait_type === 'Commercial Use')?.value;
  const licenseDerivative = attributes.find((a: any) => a.trait_type === 'Derivative Works')?.value;
  const licenseDuration = attributes.find((a: any) => a.trait_type === 'License Duration (days)')?.value;
  // In marketplace, use listing price primarily, fallback to native price for non-listed items
  const displayPrice = nft.isListed ? nft.price : attributes.find((a: any) => a.trait_type === 'Price (native)')?.value;
  
  return (
    <div 
      className={`rounded-xl p-[2px] ${frameClasses(mediaType)} transition hover:scale-[1.02]`}
      title={name}
    >
      <button 
        type="button" 
        onClick={() => onPreview?.(nft)} 
        className="w-full text-left"
      >
        {/* Inner card with solid white background like MyCamp */}
        <div className={`rounded-[12px] overflow-hidden bg-white/90 border ${
          nft.saleType === 'auction' ? 'border-amber-500/50 ring-2 ring-amber-400/20' : 'border-black/10'
        }`}>
          {/* Image container */}
          <div className="aspect-square relative group">
            {image && !imageError ? (
              <img 
                src={image.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                alt={name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  setImageError(true);
                  (e.currentTarget.style.filter = 'blur(16px)');
                  (e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect width=%22200%22 height=%22200%22 fill=%22%23111%22/></svg>');
                }}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" style={{ filter: 'blur(10px)' }} />
            )}
            
            {/* Price/auction badge (top left) */}
            {nft.saleType === 'auction' ? (
              <div className="absolute top-2 left-2 text-[11px] px-2.5 py-0.5 rounded bg-black text-amber-300 font-bold border border-amber-500/40 shadow-md">
                {Number(nft.highestBid || 0) > 0 
                  ? `${parseFloat(nft.highestBid).toFixed(1)} $CAMP` 
                  : `${parseFloat(nft.minPrice).toFixed(1)} $CAMP`}
              </div>
            ) : displayPrice && (
              <div className="absolute top-2 left-2 text-[11px] px-2.5 py-0.5 rounded bg-black text-orange-400 font-bold border border-orange-500/40 shadow-md">
                {displayPrice} $CAMP
              </div>
            )}
            
            {/* Media/Auction time badge */}
            <div className="absolute bottom-2 right-2 flex gap-2">
              {nft.saleType === 'auction' && (
                <div className="text-[10px] px-2 py-0.5 rounded bg-black/80 text-white border border-white/20">
                  {formatTimeLeft(nft.endTime)}
                </div>
              )}
              <div className="text-[10px] px-2 py-0.5 rounded bg-white/80 text-black border border-black/20 uppercase">
                {mediaType}
              </div>
            </div>



            {/* Auction badge (top left) */}
            {nft.isAuctioned && (
              <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded bg-red-500 text-white border border-red-600 font-bold">
                🔥 AUCTION
              </div>
            )}
            
            {/* Listed badge (top left, below auction if present) */}
            {nft.isListed && (
              <div className={`absolute ${nft.isAuctioned ? 'top-8 left-2' : 'top-2 left-2'} text-[10px] px-2 py-0.5 rounded bg-orange-500 text-white border border-orange-600 font-bold`}>
                🏷️ LISTED
              </div>
            )}

            {/* Contract badge (top right) - only if different from default */}
            {nft.contract && nft.contract.toLowerCase() !== '0xf90733b9ecda3b49c250b2c3e3e42c96fc93324e'.toLowerCase() && (
              <div className="absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded bg-purple-500/80 text-white border border-purple-400/40">
                {nft.contract.slice(0, 4)}...{nft.contract.slice(-2)}
              </div>
            )}
            
            {/* Play/Read overlay for media files */}
            {(mediaType === 'audio' || mediaType === 'video' || mediaType === 'text') && (
              <div className={`absolute inset-0 flex items-center justify-center ${image ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} transition-opacity bg-black/40`}>
                <div className="flex items-center gap-2 text-white text-sm font-medium px-3 py-2 rounded-full bg-black/60 border border-white/10">
                  <span className="text-lg">
                    {mediaType === 'audio' ? '🎵' : mediaType === 'video' ? '🎥' : '📖'}
                  </span>
                  <span>{mediaType === 'text' ? 'Read' : 'Play'}</span>
                  <span className="text-xs">▶</span>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Info section below image */}
        <div className="p-2">
          <div 
            className={`text-black font-bold leading-tight ${
              name.length > 34 ? 'text-sm' : 
              name.length > 22 ? 'text-base' : 
              'text-lg'
            }`} 
            style={{ 
              fontFamily: 'ClashDisplay, ui-sans-serif, system-ui',
              wordBreak: 'break-word',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}
          >
            {name}
          </div>
          <div className="text-xs text-black/70 mt-1">
            ID:
            <button
              onClick={(e) => {
                e.stopPropagation();
                const full = (nft.tokenId || nft.id || '').toString();
                if (!full) return;
                navigator.clipboard?.writeText(full).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1000);
                }).catch(() => {});
              }}
              className="ml-1 underline decoration-dotted hover:text-black"
              title="Copy token id"
              type="button"
            >
              {formatTokenId(nft.tokenId || nft.id || '')}
            </button>
            {copied && <span className="ml-1 text-green-600">Copied</span>}
          </div>

          {/* License info pills (descriptive) */}
          {(licenseCommercial !== undefined || licenseDerivative !== undefined || licenseDuration !== undefined) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {licenseCommercial !== undefined && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-black/10 border border-black/20 text-black/80">
                  Commercial: {String(licenseCommercial)}
                </span>
              )}
              {licenseDerivative !== undefined && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-black/10 border border-black/20 text-black/80">
                  Derivatives: {String(licenseDerivative)}
                </span>
              )}
              {licenseDuration !== undefined && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-black/10 border border-black/20 text-black/80">
                  License: {licenseDuration}d
                </span>
              )}
            </div>
          )}
        </div>
      </button>
      
      {/* Explorer link */}
      <a
        href={`https://basecamp.cloud.blockscout.com/token/${nft.contract || '0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E'}/instance/${nft.tokenId || nft.id}`}
        target="_blank"
        rel="noreferrer"
        className="block text-[10px] text-black/70 hover:text-black underline px-2 pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        View on Explorer
      </a>
      
      
      {/* Action buttons for marketplace */}
      {(onList || onBuy || onOffer || onAccess || (typeof onBid === 'function')) && (
        <div className="px-2 pb-2 flex gap-1">
          {/* Auction buttons - only show Bid for non-sellers */}
          {nft.saleType === 'auction' && (
            <>
              {!isAuctionSeller && typeof onBid === 'function' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onBid(nft); }}
                  className="flex-1 py-1 px-2 bg-amber-600 text-white text-[10px] font-semibold rounded border border-amber-700 hover:bg-amber-700 transition-colors"
                >
                  Bid
                </button>
              )}
              {isAuctionSeller && (
                <div className="flex-1 flex flex-col gap-1">
                  <div className="py-1 px-2 bg-amber-500/20 text-amber-400 text-[10px] font-semibold rounded border border-amber-500/40 text-center">
                    🔨 Your Auction
                  </div>
                  {Number(nft.highestBid || 0) > 0 && (
                    <div className="py-1 px-2 bg-green-500/20 text-green-400 text-[10px] font-semibold rounded border border-green-500/40 text-center">
                      Current Bid: {parseFloat(nft.highestBid).toFixed(1)} $CAMP
                    </div>
                  )}
                  {Number(nft.highestBid || 0) === 0 && (
                    <div className="py-1 px-2 bg-gray-500/20 text-gray-400 text-[10px] font-semibold rounded border border-gray-500/40 text-center">
                      No bids yet • Min: {parseFloat(nft.minPrice).toFixed(1)} $CAMP
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          
          {/* Auction status for owned NFTs */}
          {isOwner && nft.isAuctioned && (
            <div className="flex-1 py-1 px-2 bg-red-500/20 text-red-100 text-[10px] font-semibold rounded border border-red-500/40 text-center">
              🔥 Your Auction
            </div>
          )}
          
          {/* Regular listing buttons - only show if not an auction */}
          {nft.saleType !== 'auction' && !nft.isAuctioned && isOwner && !nft.isListed && onList && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onList(nft);
              }}
              className="flex-1 py-1 px-2 bg-orange-500 text-white text-[10px] font-semibold rounded border border-orange-600 hover:bg-orange-600 transition-colors"
            >
              List
            </button>
          )}
          
          {isOwner && nft.isListed && !nft.isAuctioned && (
            <div className="flex-1 py-1 px-2 bg-green-500/20 text-green-400 text-[10px] font-semibold rounded border border-green-500/40 text-center">
              🏷️ Listed
            </div>
          )}
          
          {!isOwner && nft.isListed && onBuy && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBuy(nft);
              }}
              className="flex-1 py-1 px-2 bg-green-500 text-white text-[10px] font-semibold rounded border border-green-600 hover:bg-green-600 transition-colors"
            >
              Buy
            </button>
          )}

          {!isOwner && nft.isListed && onAccess && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAccess(nft);
              }}
              className="flex-1 py-1 px-2 bg-amber-500 text-white text-[10px] font-semibold rounded border border-amber-600 hover:bg-amber-600 transition-colors"
            >
              Access
            </button>
          )}
          
          {(!isOwner || showOfferAlways) && onOffer && nft.saleType !== 'auction' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOffer(nft);
              }}
              className="flex-1 py-1 px-2 bg-blue-500 text-white text-[10px] font-semibold rounded border border-blue-600 hover:bg-blue-600 transition-colors"
            >
              Offer
            </button>
          )}
        </div>
      )}
    </div>
  );
}