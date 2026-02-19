"use client";

import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { createPublicClient, http, parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import { MARKETPLACE_ADDRESS, MARKETPLACE_ABI } from '../config/simpleMarketplace';

interface PreviewModalProps {
  nft: any;
  onClose: () => void;
}

export default function PreviewModal({ nft: item, onClose }: PreviewModalProps) {
  if (!item) return null;
  
  // Use same structure as MyCamp - mediaUrl is separate from image
  const { type, metadata } = item;
  const mediaType = (type || item.type || 'image').toLowerCase();
  const mediaUrl = item.mediaUrl || item.image || metadata?.image || '';
  const mime = item.mime || metadata?.mimeType || `${mediaType}/png`;
  
  const [text, setText] = useState<string>('');
  const [loadingText, setLoadingText] = useState<boolean>(false);
  const [emptyText, setEmptyText] = useState<boolean>(false);
  
  // Load text content if type is text
  useEffect(() => {
    if (mediaType !== 'text' || !mediaUrl) return;
    let aborted = false;
    setLoadingText(true);
    setEmptyText(false);
    setText('');
    
    (async () => {
      try {
        // Don't add ipfs gateway if already has http
        const url = mediaUrl.startsWith('http') ? mediaUrl : mediaUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
        const res = await fetch(url, { cache: 'no-store' });
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
  }, [mediaType, mediaUrl]);
  
  // Access purchase (optional)
  const [terms, setTerms] = useState<{ price: bigint; duration: bigint; paymentToken: string } | null>(null);
  const [creator, setCreator] = useState<string | null>(null);
  const [periods, setPeriods] = useState<number>(1);
  const { writeContract, data: txHash } = useWriteContract();
  const { isSuccess: buyOk } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    (async () => {
      try {
        if (!item?.tokenId) return;
        const client = createPublicClient({ transport: http('https://rpc.basecamp.t.raas.gelato.cloud') });
        const t = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'getTerms', args: [BigInt(item.tokenId)] }) as any;
        if (t && (t.price ?? 0n) > 0n && (t.duration ?? 0n) > 0n) {
          setTerms({ price: t.price as bigint, duration: t.duration as bigint, paymentToken: t.paymentToken as string });
        }
        try {
          const c = await client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'tokenCreators', args: [BigInt(item.tokenId)] }) as `0x${string}`;
          setCreator(c);
        } catch {}
      } catch {}
    })();
  }, [item?.tokenId]);

  useEffect(() => { if (buyOk) { toast.dismiss(); toast.success('Access purchased'); } }, [buyOk]);

  const handleBuyAccess = () => {
    if (!terms || !item?.tokenId) return;
    if (terms.paymentToken !== '0x0000000000000000000000000000000000000000') {
      toast.error('ERC20 payments not supported in this modal yet');
      return;
    }
    writeContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: 'buyAccess', args: [BigInt(item.tokenId), BigInt(Math.max(1, periods))], value: (terms.price || 0n) * BigInt(Math.max(1, periods)) });
    toast.loading('Buying access...');
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/10 rounded-lg max-w-2xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-3 border-b border-white/10 flex items-center justify-between">
          <div className="text-sm font-medium truncate pr-3">{metadata?.name || 'Preview'}</div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-sm">Close</button>
        </div>
        
        {/* Content */}
        <div className="p-3">
          {/* Audio Player */}
          {mediaType === 'audio' && mediaUrl && (
            <audio controls className="w-full">
              <source src={mediaUrl.startsWith('http') ? mediaUrl : mediaUrl.replace('ipfs://', 'https://ipfs.io/ipfs/')} type={mime || 'audio/mpeg'} />
            </audio>
          )}
          
          {/* Video Player */}
          {mediaType === 'video' && mediaUrl && (
            <video controls className="w-full max-h-[60vh]">
              <source src={mediaUrl.startsWith('http') ? mediaUrl : mediaUrl.replace('ipfs://', 'https://ipfs.io/ipfs/')} type={mime || 'video/mp4'} />
            </video>
          )}
          
          {/* Text Viewer */}
          {mediaType === 'text' && (
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
          
          {/* Image Viewer */}
          {mediaType === 'image' && item.image && (
            <img 
              src={item.image.startsWith('http') ? item.image : item.image.replace('ipfs://', 'https://ipfs.io/ipfs/')} 
              alt={metadata?.name || 'Image'} 
              className="w-full"
            />
          )}
          
          {/* No media URL message */}
          {!mediaUrl && mediaType !== 'image' && (
            <div className="text-sm text-white/70">No mediaUrl found. Open on Explorer.</div>
          )}
        </div>
        
        {/* Info bar */}
        <div className="px-3 pb-3 text-xs text-white/60 flex items-center gap-3 flex-wrap">
          <span>Type: {mediaType}</span>
          {mime && <span>MIME: {mime}</span>}
          <a 
            className="underline hover:text-white" 
            target="_blank" 
            rel="noreferrer" 
                            href={`https://camp.cloud.blockscout.com/token/${item.contract || '0xF90733b9eCDa3b49C250B2C3E3E42c96fC93324E'}/instance/${item.tokenId || item.id}`}
          >
            Explorer
          </a>
          {mediaUrl && (
            <a 
              className="underline hover:text-white" 
              target="_blank" 
              rel="noreferrer" 
              href={mediaUrl.startsWith('http') ? mediaUrl : mediaUrl.replace('ipfs://', 'https://ipfs.io/ipfs/')}
            >
              Open media
            </a>
          )}
          {terms ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-orange-400 font-bold">{Number(terms.price) / 1e18} CAMP / {Number(terms.duration) / 86400}d</span>
              {creator && <span className="text-white/60">by {creator.slice(0,6)}...{creator.slice(-4)}</span>}
              <input type="number" min={1} value={periods} onChange={(e) => setPeriods(Math.max(1, Number(e.target.value || '1')))} className="w-14 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-white" />
              <button onClick={handleBuyAccess} className="px-3 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded border border-orange-500/40">Buy Access</button>
            </div>
          ) : (
            <div className="ml-auto text-white/50">No temporary access available</div>
          )}
        </div>
      </div>
    </div>
  );
}