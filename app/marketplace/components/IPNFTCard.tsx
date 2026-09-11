"use client";

import { DEFAULT_IP_NFT_CONTRACT } from '../config/simpleMarketplace';
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
  mode?: 'explore' | 'my' | 'live';
}

/**
 * Karta jak etykieta w galerii: praca u gory, pod nia bialy podpis - tytul,
 * medium, numer, warunki licencji. Kolor medium jest tylko na jednej kresce
 * pod obrazem, zeby siatka nie krzyczala 40 ramkami naraz.
 */
const MEDIUM: Record<string, { label: string; bar: string }> = {
  image: { label: 'Image', bar: 'bg-soft-accent' },
  audio: { label: 'Audio', bar: 'bg-[#18bd64]' },
  video: { label: 'Video', bar: 'bg-[#e05a6b]' },
  text: { label: 'Text', bar: 'bg-soft-info' },
  unknown: { label: 'Work', bar: 'bg-soft-line-strong' },
};

const btn = {
  primary:
    'flex-1 rounded-pill bg-soft-primary px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-soft-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary-deep',
  secondary:
    'flex-1 rounded-pill bg-soft-surface-sunken px-3 py-1.5 text-[12px] font-bold text-soft-ink transition hover:bg-soft-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary',
  accent:
    'flex-1 rounded-pill bg-soft-accent-soft px-3 py-1.5 text-[12px] font-bold text-soft-accent-deep transition hover:bg-soft-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-accent',
  status: 'flex-1 rounded-pill px-3 py-1.5 text-center text-[12px] font-bold',
};

export default function IPNFTCard({
  nft,
  onPreview,
  onList,
  onBuy,
  onOffer,
  onAccess,
  onBid,
  showOfferAlways = false,
  mode = 'explore',
}: IPNFTCardProps) {
  const { address } = useAccount();
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nowTs, setNowTs] = useState<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (nft?.saleType !== 'auction') return;
    const t = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [nft?.saleType]);

  const isOwner = address && nft.seller?.toLowerCase() === address.toLowerCase();
  const isAuctionSeller = nft.saleType === 'auction' && isOwner;
  const metadata = nft.metadata || {};
  const name = metadata.name || `IP NFT #${String(nft.tokenId || '').slice(0, 6)}`;
  const image = nft.image || metadata.image || '';
  const mediaType = (nft.type || 'image').toLowerCase();
  const medium = MEDIUM[mediaType] || MEDIUM.unknown;

  const formatTokenId = (id: string) => {
    if (!id) return '';
    const str = id.toString();
    return str.length > 15 ? `${str.slice(0, 6)}…${str.slice(-4)}` : str;
  };

  const formatTimeLeft = (endTime?: number | string | bigint) => {
    if (!endTime) return '';
    const seconds = Math.max(0, Number(endTime) - nowTs);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
    return `${pad(h)}:${pad(m)}:${pad(s)} left`;
  };

  const attributes = metadata.attributes || [];
  const attr = (t: string) => attributes.find((a: any) => a.trait_type === t)?.value;
  const licenseCommercial = attr('Commercial Use');
  const licenseDerivative = attr('Derivative Works');
  const licenseDuration = attr('License Duration (days)');
  const displayPrice = nft.isListed ? nft.price : attr('Price (native)');
  const fmt = (v: any) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v);
  };

  const priceLabel =
    nft.saleType === 'auction'
      ? Number(nft.highestBid || 0) > 0
        ? { k: 'Top bid', v: `${fmt(nft.highestBid)} CAMP` }
        : { k: 'Starts at', v: `${fmt(nft.minPrice)} CAMP` }
      : displayPrice
      ? { k: nft.isListed ? 'Price' : 'Asked', v: `${fmt(displayPrice)} CAMP` }
      : null;

  const licenseBits = [
    licenseCommercial !== undefined && (String(licenseCommercial).toLowerCase() === 'true' || licenseCommercial === 'Yes' ? 'Commercial' : 'Personal only'),
    licenseDerivative !== undefined && (String(licenseDerivative).toLowerCase() === 'true' || licenseDerivative === 'Yes' ? 'Remix ok' : 'No remix'),
    licenseDuration !== undefined && `${licenseDuration} days`,
  ].filter(Boolean) as string[];

  const explorerHref = `https://camp.cloud.blockscout.com/token/${nft.contract || DEFAULT_IP_NFT_CONTRACT}/instance/${nft.tokenId || nft.id}`;

  return (
    <article
      className="group flex flex-col overflow-hidden rounded-[20px] bg-white shadow-[var(--soft-shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--soft-shadow-float)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      title={name}
    >
      {/* Praca. div z rola przycisku, bo w podpisie jest osobny przycisk kopiowania. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${name}`}
        onClick={() => onPreview?.(nft)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview?.(nft); } }}
        className="relative aspect-square cursor-pointer bg-soft-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-soft-primary"
      >
        {image && !imageError ? (
          <img
            src={image}
            alt={name}
            loading="lazy"
            onError={() => setImageError(true)}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-soft-ink-faint">
            <span className="font-soft-display text-[28px] font-extrabold">{medium.label}</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.1em]">preview unavailable</span>
          </div>
        )}

        {(mediaType === 'audio' || mediaType === 'video' || mediaType === 'text') && image && !imageError && (
          <div className="absolute inset-0 flex items-end justify-start p-2 opacity-0 transition group-hover:opacity-100 motion-reduce:transition-none">
            <span className="rounded-pill bg-soft-ink/85 px-3 py-1 text-[12px] font-bold text-white backdrop-blur">
              {mediaType === 'text' ? 'Read' : 'Play'}
            </span>
          </div>
        )}

        {nft.saleType === 'auction' && (
          <span className="absolute left-2 top-2 rounded-pill bg-soft-ink/85 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white backdrop-blur">
            {formatTimeLeft(nft.endTime)}
          </span>
        )}
        {nft.isAuctioned && nft.saleType !== 'auction' && (
          <span className="absolute left-2 top-2 rounded-pill bg-soft-accent px-2.5 py-1 text-[11px] font-bold text-white">
            In auction
          </span>
        )}
      </div>

      {/* Kreska medium */}
      <div className={`h-1 ${medium.bar}`} aria-hidden />

      {/* Podpis */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="font-soft-display text-[15px] font-extrabold leading-snug text-soft-ink"
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}
          >
            {name}
          </h3>
          <span className="shrink-0 rounded-pill bg-soft-surface-sunken px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-soft-ink-muted">
            {medium.label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-soft-ink-soft">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const full = (nft.tokenId || nft.id || '').toString();
              if (!full) return;
              navigator.clipboard?.writeText(full).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }).catch(() => {});
            }}
            className="font-mono tabular-nums underline decoration-dotted underline-offset-2 hover:text-soft-ink"
            title="Copy token id"
          >
            #{formatTokenId(nft.tokenId || nft.id || '')}
          </button>
          {copied && <span className="font-bold text-[#0b9a51]">Copied</span>}
          <span aria-hidden>·</span>
          <a
            href={explorerHref}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="underline decoration-dotted underline-offset-2 hover:text-soft-ink"
          >
            Explorer
          </a>
        </div>

        {licenseBits.length > 0 && (
          <p className="text-[11px] font-bold text-soft-ink-muted">{licenseBits.join(' · ')}</p>
        )}

        {priceLabel && (
          <div className="mt-auto flex items-baseline justify-between pt-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-soft-ink-soft">{priceLabel.k}</span>
            <span className="font-soft-display text-[16px] font-extrabold tabular-nums text-soft-ink">{priceLabel.v}</span>
          </div>
        )}

        {(onList || onBuy || onOffer || onAccess || typeof onBid === 'function') && (
          <div className="flex gap-1.5">
            {nft.saleType === 'auction' && !isAuctionSeller && typeof onBid === 'function' && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onBid(nft); }} className={btn.primary}>
                Bid
              </button>
            )}
            {isAuctionSeller && (
              <span className={`${btn.status} bg-soft-accent-soft text-soft-accent-deep`}>
                Your auction{Number(nft.highestBid || 0) === 0 ? ' · no bids' : ''}
              </span>
            )}
            {isOwner && nft.isAuctioned && nft.saleType !== 'auction' && (
              <span className={`${btn.status} bg-soft-accent-soft text-soft-accent-deep`}>Your auction</span>
            )}
            {nft.saleType !== 'auction' && !nft.isAuctioned && isOwner && !nft.isListed && onList && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onList(nft); }} className={btn.primary}>
                List
              </button>
            )}
            {isOwner && nft.isListed && !nft.isAuctioned && (
              <span className={`${btn.status} bg-[#edfff4] text-[#0b9a51]`}>Listed</span>
            )}
            {!isOwner && nft.isListed && onBuy && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onBuy(nft); }} className={btn.primary}>
                Buy
              </button>
            )}
            {!isOwner && nft.isListed && onAccess && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onAccess(nft); }} className={btn.accent}>
                Licence
              </button>
            )}
            {(!isOwner || showOfferAlways) && onOffer && nft.saleType !== 'auction' && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onOffer(nft); }} className={btn.secondary}>
                Offer
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
