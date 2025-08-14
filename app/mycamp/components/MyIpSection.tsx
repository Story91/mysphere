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
  const [pageSize, setPageSize] = useState(6); // 6 on mobile, 8 on desktop
  const [preview, setPreview] = useState<any | null>(null);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchIpNftsFor(address)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [address]);

  // Responsive page size: 6 on mobile, 8 on desktop (lg and up)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)'); // Tailwind lg breakpoint
    const apply = () => setPageSize(mq.matches ? 8 : 6);
    apply();
    // Reset to first page when page size changes to avoid empty views
    setPage(1);
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  if (!address) return null;

  const filtered = items.filter((i) => filter === 'all' ? true : i.type === filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const frameClasses = (type: string) => {
    switch (type) {
      case 'image':
        // Orange
        return 'bg-gradient-to-br from-orange-500 via-amber-400 to-orange-600';
      case 'audio':
        // Green
        return 'bg-gradient-to-br from-emerald-500 via-green-500 to-lime-400';
      case 'video':
        // Red
        return 'bg-gradient-to-br from-rose-600 via-red-500 to-orange-500';
      case 'text':
        // Blue
        return 'bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500';
      default:
        return 'bg-gradient-to-br from-slate-500 to-slate-300';
    }
  };

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
          <div key={`${nft.contract}-${nft.tokenId}`} title={nft?.metadata?.name || `IpNFT #${nft.tokenId}`}
            className={`rounded-xl p-[2px] ${frameClasses(nft.type)} transition`}
          >
            <button type="button" onClick={() => setPreview(nft)} className="w-full text-left">
              <div className="rounded-[12px] overflow-hidden bg-white/90 border border-black/10">
                <div className="aspect-square relative group">
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
                  {/* Price badge (native) */}
                  {(() => {
                    const attrs = (nft?.metadata?.attributes || []) as Array<{trait_type?: string; value?: string}>;
                    const native = attrs.find(a => a.trait_type === 'Price (native)')?.value;
                    if (!native) return null;
                    return (
                      <div className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded bg-black/70 text-white border border-white/10">
                        {native} $CAMP
                      </div>
                    );
                  })()}
                  <div className="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded bg-white/80 text-black border border-black/20 uppercase">{nft.type}</div>
                {(nft.type === 'audio' || nft.type === 'video' || nft.type === 'text') && (
                  <div className={`absolute inset-0 flex items-center justify-center ${nft.image ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'} transition-opacity bg-black/40`}>
                    <div className="flex items-center gap-2 text-white text-sm font-medium px-3 py-2 rounded-full bg-black/60 border border-white/10">
                      <span className="text-lg">
                        {nft.type === 'audio' ? '🎵' : nft.type === 'video' ? '🎥' : '📖'}
                      </span>
                      <span>{nft.type === 'text' ? 'Read' : 'Play'}</span>
                      <span className="text-xs">▶</span>
                    </div>
                  </div>
                )}
                </div>
              </div>
              <div className="p-2 text-sm">
                <div className="truncate text-black font-semibold" style={{ fontFamily: 'ClashDisplay, ui-sans-serif, system-ui' }}>
                  {nft?.metadata?.name?.length > 20 
                    ? `${nft?.metadata?.name.slice(0, 17)}...` 
                    : (nft?.metadata?.name || 'IpNFT')}
                </div>
                <div className="text-xs text-black/70">
                  ID: {nft.tokenId.length > 15 
                    ? `${nft.tokenId.slice(0, 6)}...${nft.tokenId.slice(-4)}` 
                    : nft.tokenId}
                </div>
              </div>
            </button>
            <a
              href={`https://basecamp.cloud.blockscout.com/token/${nft.contract}/instance/${nft.tokenId}`}
              target="_blank"
              rel="noreferrer"
              className="block text-[10px] text-black/70 hover:text-black underline px-2 pb-2"
            >View on Explorer</a>
          </div>
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

      {/* Preview Modal */}
      <PreviewModal item={preview} onClose={() => setPreview(null)} />
    </div>
  );
}


// Local state and preview modal implementation
function usePreviewState() {
  const [preview, setPreview] = useState<any | null>(null);
  return { preview, setPreview } as const;
}

function PreviewModal({ item, onClose }: { item: any | null; onClose: () => void }) {
  if (!item) return null;
  const { type, mediaUrl, mime, metadata } = item || {};
  const [text, setText] = useState<string>('');
  const [loadingText, setLoadingText] = useState<boolean>(false);
  const [emptyText, setEmptyText] = useState<boolean>(false);
  useEffect(() => {
    if (type !== 'text' || !mediaUrl) return;
    let aborted = false;
    setLoadingText(true);
    setEmptyText(false);
    (async () => {
      try {
        const res = await fetch(mediaUrl, { cache: 'no-store' });
        const txt = await res.text();
        if (!aborted) {
          setText(txt);
          setEmptyText(txt.trim().length === 0);
        }
      } catch {
        if (!aborted) setText('Failed to load text');
      }
    })()
      .finally(() => { if (!aborted) setLoadingText(false); });
    return () => { aborted = true; };
  }, [type, mediaUrl]);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/10 rounded-lg max-w-2xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-3 border-b border-white/10 flex items-center justify-between">
          <div className="text-sm font-medium truncate pr-3">{metadata?.name || 'Preview'}</div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-sm">Close</button>
        </div>
        <div className="p-3">
          {type === 'audio' && mediaUrl && (
            <audio controls className="w-full">
              <source src={mediaUrl} type={mime || 'audio/mpeg'} />
            </audio>
          )}
          {type === 'video' && mediaUrl && (
            <video controls className="w-full max-h-[60vh]">
              <source src={mediaUrl} type={mime || 'video/mp4'} />
            </video>
          )}
          {type === 'text' && (
            <div className="w-full h-[60vh] bg-zinc-950 border border-white/5 rounded p-3 overflow-auto">
              {loadingText ? (
                <div className="text-white/70 text-sm flex items-center">
                  Loading
                  <span className="inline-flex ml-1">
                    <span className="animate-pulse">.</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>.</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>.</span>
                  </span>
                </div>
              ) : emptyText ? (
                <div className="text-white/60 text-sm">Empty file</div>
              ) : (
                <pre className="whitespace-pre-wrap break-words text-white/90 text-sm">{text}</pre>
              )}
            </div>
          )}
          {type === 'image' && item.image && (
            <img src={item.image} alt={metadata?.name || 'Image'} className="w-full" />
          )}
          {!mediaUrl && type !== 'image' && (
            <div className="text-sm text-white/70">No mediaUrl found. Open on Explorer.</div>
          )}
        </div>
        <div className="px-3 pb-3 text-xs text-white/60 flex items-center gap-3">
          <span>Type: {type}</span>
          {mime && <span>MIME: {mime}</span>}
          <a className="underline hover:text-white" target="_blank" rel="noreferrer" href={`https://basecamp.cloud.blockscout.com/token/${item.contract}/instance/${item.tokenId}`}>Explorer</a>
          {mediaUrl && <a className="underline hover:text-white" target="_blank" rel="noreferrer" href={mediaUrl}>Open media</a>}
        </div>
      </div>
    </div>
  );
}
