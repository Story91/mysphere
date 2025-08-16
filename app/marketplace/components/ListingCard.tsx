"use client";

import { useState } from 'react';
import { useAccount } from 'wagmi';

interface ListingCardProps {
  listing: any;
  onBuy?: () => void;
  onCancel?: () => void;
  onMakeOffer?: () => void;
}

export default function ListingCard({ listing, onBuy, onCancel, onMakeOffer }: ListingCardProps) {
  const { address } = useAccount();
  const [imageError, setImageError] = useState(false);
  
  const isOwner = address && listing.seller?.toLowerCase() === address.toLowerCase();
  const metadata = listing.metadata || {};
  const name = metadata.name || `Listing #${listing.listingId}`;
  const image = listing.image || metadata.image || '';
  
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden hover:border-orange-500/50 transition-all">
      {/* Image */}
      <div className="aspect-square relative bg-gradient-to-br from-gray-900 to-black">
        {image && !imageError ? (
          <img 
            src={image.replace('ipfs://', 'https://ipfs.io/ipfs/')}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-4xl">🖼️</div>
          </div>
        )}
        
        {/* Active Badge */}
        {listing.isActive && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-green-500/90 text-white text-xs rounded-lg font-semibold">
            Active
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-white truncate">{name}</h3>
        
        {/* Price */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Price</span>
          <span className="text-lg font-bold text-orange-400">{listing.price} CAMP</span>
        </div>
        
        {/* Token Info */}
        <div className="text-xs text-gray-500">
          Token #{listing.tokenId} • Listed {new Date(Number(listing.listedAt) * 1000).toLocaleDateString()}
        </div>
        
        {/* License Terms */}
        <div className="flex gap-2 text-xs">
          {listing.commercialUse && (
            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">Commercial</span>
          )}
          {listing.derivativeWorks && (
            <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded">Derivatives</span>
          )}
          {listing.licenseDuration > 0 && (
            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">
              {listing.licenseDuration / 86400} days
            </span>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {isOwner ? (
            <button
              onClick={onCancel}
              className="flex-1 py-2 px-4 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Cancel Listing
            </button>
          ) : (
            <>
              <button
                onClick={onBuy}
                className="flex-1 py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Buy Now
              </button>
              <button
                onClick={onMakeOffer}
                className="flex-1 py-2 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Make Offer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
