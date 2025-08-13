"use client";

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { fetchIpNftsFor } from '../api/fetchIpNfts';

export default function MyIpSection() {
  const { address } = useAccount();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchIpNftsFor(address)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) return null;

  return (
    <div className="mt-6">
      <h4 className="text-base sm:text-lg font-semibold text-orange-200">My IP NFTs</h4>
      {loading && <div className="opacity-70 text-sm mt-2">Loading…</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-3">
        {items.map((nft) => (
          <a
            key={`${nft.contract}-${nft.tokenId}`}
            href={`https://basecamp.cloud.blockscout.com/token/${nft.contract}?a=${nft.tokenId}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg overflow-hidden bg-black/20 border border-white/10 hover:border-white/20 transition"
            title={nft?.metadata?.name || `IpNFT #${nft.tokenId}`}
          >
            <div className="aspect-square relative">
              {nft.image ? (
                <img
                  src={nft.image}
                  alt={nft?.metadata?.name || 'IpNFT'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget.style.filter = 'blur(16px)');
                    (e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect width=%22200%22 height=%22200%22 fill=%22%23111%22/></svg>');
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-900" style={{ filter: 'blur(10px)' }} />
              )}
            </div>
            <div className="p-2 text-sm">
              <div className="truncate">{nft?.metadata?.name || 'IpNFT'}</div>
              <div className="text-xs opacity-70">ID: {nft.tokenId}</div>
            </div>
          </a>
        ))}
      </div>
      {!loading && items.length === 0 && (
        <div className="opacity-70 text-sm mt-3">Brak IpNFT na BaseCamp test.</div>
      )}
    </div>
  );
}


