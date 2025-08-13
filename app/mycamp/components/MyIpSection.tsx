"use client";

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { fetchIpNftsFor } from '../api/fetchIpNfts';

export default function MyIpSection() {
  const { address } = useAccount();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'audio' | 'text'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchIpNftsFor(address)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) return null;

  const filtered = items.filter((i) => filter === 'all' ? true : i.type === filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="mt-6">
      <h4 className="text-base sm:text-lg font-semibold text-orange-200">My IP NFTs</h4>
      {loading && <div className="opacity-70 text-sm mt-2">Loading…</div>}
      <div className="flex items-center gap-2 mt-2">
        {(['all','image','video','audio','text'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setFilter(t); setPage(1); }}
            className={`px-3 py-1 text-xs rounded-lg border ${filter===t ? 'bg-white/10 text-white border-white/30' : 'text-white/70 border-white/10 hover:border-white/20'}`}
          >{t.toUpperCase()}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-3">
        {pageItems.map((nft) => (
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
              <div className="text-xs opacity-70">ID: {nft.tokenId} • {nft.type}</div>
            </div>
          </a>
        ))}
      </div>
      {!loading && filtered.length === 0 && (
        <div className="opacity-70 text-sm mt-3">Brak IpNFT na BaseCamp test.</div>
      )}
      {filtered.length > pageSize && (
        <div className="flex items-center gap-2 mt-3">
          <button disabled={page===1} onClick={() => setPage(p => Math.max(1, p-1))} className="px-3 py-1 text-xs rounded-lg border text-white/80 border-white/10 disabled:opacity-40">Prev</button>
          <div className="text-xs text-white/70">{page} / {totalPages}</div>
          <button disabled={page===totalPages} onClick={() => setPage(p => Math.min(totalPages, p+1))} className="px-3 py-1 text-xs rounded-lg border text-white/80 border-white/10 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}


