"use client";

import { useState } from 'react';

interface FilterBarProps {
  filters: {
    priceRange: [number, number];
    mediaType: string;
    commercialUse: boolean;
    sortBy: string;
    saleType?: string;
  };
  setFilters: (filters: any) => void;
}

const SALE_TYPES = [
  { id: 'all', label: 'Everything' },
  { id: 'buy', label: 'Buy now' },
  { id: 'auctions', label: 'Auctions' },
  { id: 'access', label: 'Licence' },
];

const MEDIA = [
  { id: 'all', label: 'All media' },
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text' },
];

const PRESETS = [
  { label: 'Under 0.1', min: 0, max: 0.1 },
  { label: '0.1 to 1', min: 0.1, max: 1 },
  { label: '1 to 10', min: 1, max: 10 },
  { label: '10 and up', min: 10, max: Number.POSITIVE_INFINITY },
];

/**
 * Jeden bialy pasek zamiast trzech ciemnych paneli. Rodzaj sprzedazy to
 * segmentowany przelacznik (wybiera sie jeden), medium to chipy, cena i
 * licencja komercyjna sa pod "Price", bo dotycza mniejszosci wyszukiwan.
 * Ksztalt obiektu filters bez zmian - MarketplaceGrid czyta go jak dotad.
 */
export default function FilterBar({ filters, setFilters }: FilterBarProps) {
  const [showPrice, setShowPrice] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  const saleType = filters.saleType ?? 'all';
  const [rangeMin, rangeMax] = filters.priceRange;
  const priceActive = rangeMin > 0 || Number.isFinite(rangeMax);
  const activeCount = (priceActive ? 1 : 0) + (filters.commercialUse ? 1 : 0);

  const applyPrice = (min: number, max: number) => {
    setFilters({ ...filters, priceRange: [min, max] as [number, number] });
  };

  const reset = () => {
    setFilters({
      priceRange: [0, Number.POSITIVE_INFINITY],
      mediaType: 'all',
      commercialUse: false,
      sortBy: 'recent',
      saleType: 'all',
    });
    setMinPrice('');
    setMaxPrice('');
  };

  const chip = (active: boolean) =>
    `rounded-pill px-3.5 py-1.5 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
      active ? 'bg-soft-ink text-white' : 'bg-soft-surface-sunken text-soft-ink-muted hover:text-soft-ink'
    }`;

  return (
    <div className="rounded-[22px] bg-white p-3 shadow-[var(--soft-shadow-card)] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Rodzaj sprzedazy */}
        <div role="radiogroup" aria-label="Sale type" className="inline-flex w-fit gap-1 rounded-pill bg-soft-surface-sunken p-1">
          {SALE_TYPES.map((t) => {
            const active = saleType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFilters({ ...filters, saleType: t.id })}
                className={`rounded-pill px-3.5 py-1.5 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                  active ? 'bg-white text-soft-ink shadow-[var(--soft-shadow-chip)]' : 'text-soft-ink-muted hover:text-soft-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Medium */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 lg:mx-0 lg:px-0">
          {MEDIA.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={filters.mediaType === m.id}
              onClick={() => setFilters({ ...filters, mediaType: m.id })}
              className={`${chip(filters.mediaType === m.id)} whitespace-nowrap`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Sortowanie + cena */}
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="mk-sort">Sort by</label>
          <select
            id="mk-sort"
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
            className="rounded-pill border-0 bg-soft-surface-sunken py-1.5 pl-3.5 pr-8 text-[13px] font-bold text-soft-ink focus:outline-none focus:ring-2 focus:ring-soft-primary"
          >
            <option value="recent">Newest first</option>
            <option value="priceLow">Price: low to high</option>
            <option value="priceHigh">Price: high to low</option>
          </select>
          <button
            type="button"
            aria-expanded={showPrice}
            onClick={() => setShowPrice((v) => !v)}
            className={chip(showPrice || activeCount > 0)}
          >
            Price{activeCount > 0 ? ` · ${activeCount}` : ''}
          </button>
        </div>
      </div>

      {showPrice && (
        <div className="mt-3 flex flex-col gap-3 border-t border-soft-line pt-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-pill bg-soft-surface-sunken px-3 py-1">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Min"
                aria-label="Minimum price in CAMP"
                className="w-16 bg-transparent text-[13px] font-bold text-soft-ink placeholder:text-soft-ink-faint focus:outline-none"
              />
              <span className="text-soft-ink-faint">to</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max"
                aria-label="Maximum price in CAMP"
                className="w-16 bg-transparent text-[13px] font-bold text-soft-ink placeholder:text-soft-ink-faint focus:outline-none"
              />
              <span className="text-[12px] font-bold text-soft-ink-soft">CAMP</span>
            </div>
            <button
              type="button"
              onClick={() => applyPrice(parseFloat(minPrice) || 0, parseFloat(maxPrice) || Number.POSITIVE_INFINITY)}
              className="rounded-pill bg-soft-primary px-4 py-1.5 text-[13px] font-bold text-white transition hover:bg-soft-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary-deep"
            >
              Apply
            </button>
            {PRESETS.map((pr) => {
              const active = rangeMin === pr.min && rangeMax === pr.max;
              return (
                <button
                  key={pr.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setMinPrice(pr.min.toString());
                    setMaxPrice(Number.isFinite(pr.max) ? pr.max.toString() : '');
                    applyPrice(pr.min, pr.max);
                  }}
                  className={chip(active)}
                >
                  {pr.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-soft-ink">
              <input
                type="checkbox"
                checked={filters.commercialUse}
                onChange={(e) => setFilters({ ...filters, commercialUse: e.target.checked })}
                className="h-4 w-4 rounded border-soft-line-strong accent-[#7c6bda]"
              />
              Commercial use allowed
            </label>
            <button
              type="button"
              onClick={reset}
              className="text-[13px] font-bold text-soft-ink-soft underline decoration-dotted underline-offset-4 hover:text-soft-ink"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
