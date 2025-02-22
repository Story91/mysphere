'use client';

import React from 'react';
import { useState, useEffect } from 'react';
import { Quote, quotesDatabase } from './quotes-data';
import {
  filterQuotesByCategory,
  getRandomQuoteFromCategory,
  searchQuotes,
  getCategoryStats
} from './quotes-utils';
import { useTheme } from '@/app/context/ThemeContext';

interface QuotesCategoriesProps {
  onQuoteSelect: (quote: string, author: string) => void;
  theme: string;
}

export default function QuotesCategories({ onQuoteSelect, theme }: QuotesCategoriesProps) {
  const { theme: themeContext } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});

  // Initialize category stats
  useEffect(() => {
    setCategoryStats(getCategoryStats(quotesDatabase));
  }, []);

  // Handle random quote generation
  const handleGenerateQuote = () => {
    const randomQuote = selectedCategory === 'ALL'
      ? quotesDatabase[Math.floor(Math.random() * quotesDatabase.length)]
      : getRandomQuoteFromCategory(quotesDatabase, selectedCategory);

    if (randomQuote) {
      onQuoteSelect(randomQuote.text, randomQuote.author);
    }
  };

  // Handle search
  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    
    let results = quotesDatabase;
    if (selectedCategory !== 'ALL') {
      results = filterQuotesByCategory(results, selectedCategory);
    }
    
    results = searchQuotes(results, searchQuery);
    if (results.length > 0) {
      const randomIndex = Math.floor(Math.random() * results.length);
      onQuoteSelect(results[randomIndex].text, results[randomIndex].author);
    }
  };

  const categories = [
    'ALL',
    'LOVE',
    'SUCCESS',
    'LIFE',
    'WISDOM',
    'FRIENDSHIP',
    'HAPPINESS',
    'MOTIVATION',
    'HOPE',
    'OTHER'
  ];

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0052FF] to-[#FF00A8] p-[2px]">
        <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-white flex items-center gap-2">
              Search Quotes
              <span className="text-xs text-[#FF00A8]">Guardian</span>
            </label>
          </div>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search quotes..."
              className="w-full rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#0052FF] placeholder-gray-400"
            />
            <button
              onClick={handleSearch}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 rounded-lg bg-[#0052FF] text-white text-sm font-medium hover:bg-[#0052FF]/90 transition-colors"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Category Selector */}
      <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#FF00A8] to-[#00FFD1] p-[2px]">
        <div className="relative rounded-[10px] bg-black/90 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-white flex items-center gap-2">
              Category
              <span className="text-xs text-[#00FFD1]">Master</span>
            </label>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg bg-black/50 border-none text-white p-2 text-sm focus:ring-2 focus:ring-[#00FFD1]"
          >
            {categories.map((category) => (
              <option 
                key={category} 
                value={category}
                className="text-white bg-black"
              >
                {category} {categoryStats[category] && category !== 'ALL' ? `(${categoryStats[category]})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Generate Quote Button */}
      <button
        onClick={handleGenerateQuote}
        className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-[#00FFD1] to-[#0052FF] p-[2px] w-full transition-all duration-300 hover:scale-[1.02]"
      >
        <div className="relative rounded-[10px] bg-black/90 px-4 py-3 transition-all duration-300">
          <div className="flex items-center justify-center gap-2">
            <span className="text-white font-medium">Generate Random Quote from {selectedCategory}</span>
            <span className="text-lg">✨</span>
          </div>
        </div>
      </button>
    </div>
  );
} 