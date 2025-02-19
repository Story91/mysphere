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
}

export default function QuotesCategories({ onQuoteSelect }: QuotesCategoriesProps) {
  const { theme } = useTheme();
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
      <div className="flex items-center mb-4">
        <h3 className={`text-lg font-bold font-['Coinbase_Display'] ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
          Sphere Quotes
        </h3>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search quotes..."
          className={`w-full px-4 py-2 ${
            theme === 'light'
              ? 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500'
              : 'bg-black/20 border-[#0052FF]/20 text-white placeholder-gray-400'
          } rounded-xl border`}
        />
        <button
          onClick={handleSearch}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 rounded-lg bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] text-white hover:from-[#0052FF]/90 hover:to-[#4C8FFF]/90 transition-all duration-300"
        >
          Search
        </button>
      </div>

      {/* Category Selector */}
      <div className="space-y-2">
        <label className={`block text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-white'}`}>
          Category
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className={`w-full px-4 py-2 rounded-xl border ${
            theme === 'light'
              ? 'bg-gray-50 border-gray-200 text-gray-900'
              : 'bg-black/20 border-[#0052FF]/20 text-white'
          }`}
        >
          {categories.map((category) => (
            <option 
              key={category} 
              value={category}
              className={theme === 'light' ? 'text-gray-900' : 'text-white'}
            >
              {category} {categoryStats[category] && category !== 'ALL' ? `(${categoryStats[category]})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Generate Quote Button */}
      <button
        onClick={handleGenerateQuote}
        className="w-full px-4 py-3 bg-gradient-to-r from-[#0052FF] to-[#4C8FFF] text-white rounded-xl font-medium hover:from-[#0052FF]/90 hover:to-[#4C8FFF]/90 transition-all duration-300 shadow-lg shadow-[#0052FF]/20 backdrop-blur-xl"
      >
        Generate Random Quote from {selectedCategory}
      </button>
    </div>
  );
} 