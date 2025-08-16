"use client";

import { useState } from 'react';
import { MEDIA_TYPES } from '../config/simpleMarketplace';

interface FilterBarProps {
  filters: {
    priceRange: [number, number];
    mediaType: string;
    commercialUse: boolean;
    sortBy: string;
  };
  setFilters: (filters: any) => void;
}

export default function FilterBar({ filters, setFilters }: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minPrice, setMinPrice] = useState('0');
  const [maxPrice, setMaxPrice] = useState('');
  // saleType control comes from parent via filters.saleType

  const handlePriceFilter = () => {
    const min = parseFloat(minPrice) || 0;
    const max = parseFloat(maxPrice) || Number.POSITIVE_INFINITY;
    setFilters({
      ...filters,
      priceRange: [min, max] as [number, number]
    });
  };

  return (
    <div className="bg-gradient-to-br from-black/60 via-purple-900/10 to-black/60 border border-purple-500/20 rounded-2xl p-6 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-xl">⚡</span>
          </div>
          <h3 className="text-xl font-bold text-white">Filters</h3>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="px-4 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-orange-400 rounded-lg hover:from-purple-500/30 hover:to-pink-500/30 transition-all text-sm font-medium"
        >
          {showAdvanced ? '✨ Hide' : '✨ Show'} Advanced
        </button>
      </div>

      {/* Main Grid Layout for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column - Sale Type */}
        <div className="bg-black/30 rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Sale Type</h4>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'all', label: '🌟 ALL', color: 'from-purple-500 to-pink-500' },
              { id: 'buy', label: '💰 BUY NOW', color: 'from-green-500 to-emerald-500' },
              { id: 'auctions', label: '🎯 AUCTIONS', color: 'from-orange-500 to-red-500' },
              { id: 'access', label: '🔑 ACCESS', color: 'from-blue-500 to-cyan-500' }
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => setFilters({ ...filters, saleType: type.id })}
                className={`relative px-4 py-3 rounded-xl text-sm font-bold transition-all transform hover:scale-105 ${
                  (filters as any).saleType === type.id
                    ? `bg-gradient-to-r ${type.color} text-white shadow-lg`
                    : 'bg-black/40 text-gray-400 hover:bg-black/60 border border-white/10'
                }`}
              >
                {(filters as any).saleType === type.id && (
                  <div className="absolute inset-0 bg-white/20 rounded-xl animate-pulse"></div>
                )}
                <span className="relative z-10">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column - Media Type */}
        <div className="bg-black/30 rounded-xl p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse"></div>
            <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Media Type</h4>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'all', label: '✨ ALL', color: 'from-purple-600 to-indigo-600' },
              { id: 'image', label: '🖼️ IMAGE', color: 'from-amber-500 to-orange-500' },
              { id: 'video', label: '🎬 VIDEO', color: 'from-red-500 to-pink-500' },
              { id: 'audio', label: '🎵 AUDIO', color: 'from-green-500 to-teal-500' },
              { id: 'text', label: '📝 TEXT', color: 'from-blue-500 to-indigo-500' }
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => setFilters({ ...filters, mediaType: type.id })}
                className={`relative px-3 py-2.5 rounded-xl text-xs font-bold transition-all transform hover:scale-105 ${
                  filters.mediaType === type.id
                    ? `bg-gradient-to-r ${type.color} text-white shadow-lg`
                    : 'bg-black/40 text-gray-400 hover:bg-black/60 border border-white/10'
                }`}
              >
                {filters.mediaType === type.id && (
                  <div className="absolute inset-0 bg-white/20 rounded-xl animate-pulse"></div>
                )}
                <span className="relative z-10">{type.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Section - Sort & Options */}
      <div className="mt-6 bg-black/30 rounded-xl p-4 border border-white/5">
        <div className="flex flex-wrap items-center gap-4">
          {/* Sort By */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Sort By</label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
              className="w-full px-4 py-2.5 bg-black/50 border border-purple-500/20 rounded-lg text-white text-sm focus:border-orange-500 focus:outline-none transition-all"
            >
              <option value="recent">📅 Most Recent</option>
              <option value="priceLow">📈 Price: Low to High</option>
              <option value="priceHigh">📉 Price: High to Low</option>
            </select>
          </div>

          {/* Commercial Use Toggle */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1 block">Options</label>
            <label className="flex items-center gap-3 px-4 py-2.5 bg-black/50 border border-purple-500/20 rounded-lg text-sm text-white cursor-pointer hover:border-purple-500/40 transition-all">
              <input
                type="checkbox"
                checked={filters.commercialUse}
                onChange={(e) => setFilters({ ...filters, commercialUse: e.target.checked })}
                className="w-5 h-5 rounded accent-orange-500"
              />
              <span className="flex items-center gap-2">
                <span>💼</span>
                <span>Commercial Use Only</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="mt-6 space-y-4 animate-fadeIn">
          <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-xl p-4 border border-purple-500/10">
            {/* Price Range */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Price Range</h4>
                <span className="text-xs text-gray-500">(CAMP)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="number"
                    step="0.01"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    placeholder="Min Price"
                    className="w-full px-4 py-3 bg-black/50 border border-green-500/20 rounded-lg text-white placeholder-gray-500 focus:border-green-500/40 focus:outline-none transition-all"
                  />
                </div>
                <div className="flex items-center justify-center">
                  <div className="w-8 h-[2px] bg-gradient-to-r from-green-500 to-emerald-500"></div>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    step="0.01"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    placeholder="Max Price"
                    className="w-full px-4 py-3 bg-black/50 border border-green-500/20 rounded-lg text-white placeholder-gray-500 focus:border-green-500/40 focus:outline-none transition-all"
                  />
                </div>
                <button
                  onClick={handlePriceFilter}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-600 transition-all transform hover:scale-105 shadow-lg shadow-green-500/25"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Quick Price Presets */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-gray-400">Quick select:</span>
              {[
                { label: 'Under 0.1', min: 0, max: 0.1 },
                { label: '0.1 - 1', min: 0.1, max: 1 },
                { label: '1 - 10', min: 1, max: 10 },
                { label: '10+', min: 10, max: 999999 }
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setMinPrice(preset.min.toString());
                    setMaxPrice(preset.max.toString());
                    handlePriceFilter();
                  }}
                  className="px-3 py-1 bg-black/40 text-gray-400 text-xs rounded-lg hover:bg-black/60 hover:text-white transition-all border border-white/10"
                >
                  {preset.label} CAMP
                </button>
              ))}
            </div>
          </div>

          {/* Clear All Button */}
          <button
            onClick={() => {
              setFilters({
                priceRange: [0, Number.POSITIVE_INFINITY],
                mediaType: 'all',
                commercialUse: false,
                sortBy: 'recent',
                saleType: 'all'
              });
              setMinPrice('0');
              setMaxPrice('');
            }}
            className="w-full py-3 bg-gradient-to-r from-gray-800 to-gray-900 text-white font-bold rounded-lg hover:from-gray-700 hover:to-gray-800 transition-all border border-white/10 flex items-center justify-center gap-2"
          >
            <span>🔄</span>
            <span>Reset All Filters</span>
          </button>
        </div>
      )}
    </div>
  );
}
