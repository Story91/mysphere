"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Trade, 
  MarketFilters, 
  MarketStats, 
  BaseElement, 
  ElementType, 
  Rarity, 
  Player 
} from "../../../types/contract";
import { 
  ShoppingCart, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Eye, 
  Wallet, 
  Tag, 
  Clock, 
  Zap, 
  Star,
  SortAsc,
  SortDesc,
  X,
  Plus,
  Minus
} from "lucide-react";
import { formatEther, parseEther } from "viem";

interface MarketplacePanelProps {
  player?: Player;
  userElements: BaseElement[];
  isLoading: boolean;
  onCreateTrade: (tokenId: string, price: bigint) => Promise<void>;
  onCancelTrade: (tradeId: number) => Promise<void>;
  onCompleteTrade: (tradeId: number, price: bigint) => Promise<void>;
}

// Mock trades data - in production this would come from the contract
const mockTrades: Trade[] = [
  {
    id: 1,
    seller: "0x1234567890123456789012345678901234567890" as any,
    tokenId: "1",
    price: parseEther("0.1"),
    isActive: true,
    listedAt: Date.now() - 3600000, // 1 hour ago
    element: {
      id: "1",
      elementType: ElementType.REACTOR,
      rarity: Rarity.RARE,
      level: 3,
      power: 450,
      mintedAt: Date.now() - 86400000,
    },
  },
  {
    id: 2,
    seller: "0x0987654321098765432109876543210987654321" as any,
    tokenId: "2",
    price: parseEther("0.05"),
    isActive: true,
    listedAt: Date.now() - 1800000, // 30 min ago
    element: {
      id: "2",
      elementType: ElementType.STORAGE,
      rarity: Rarity.COMMON,
      level: 1,
      power: 120,
      mintedAt: Date.now() - 172800000,
    },
  },
  {
    id: 3,
    seller: "0x1111222233334444555566667777888899990000" as any,
    tokenId: "3",
    price: parseEther("0.25"),
    isActive: true,
    listedAt: Date.now() - 7200000, // 2 hours ago
    element: {
      id: "3",
      elementType: ElementType.DEFENSE_TOWER,
      rarity: Rarity.EPIC,
      level: 5,
      power: 800,
      mintedAt: Date.now() - 259200000,
    },
  },
  {
    id: 4,
    seller: "0x2222333344445555666677778888999900001111" as any,
    tokenId: "4",
    price: parseEther("0.15"),
    isActive: true,
    listedAt: Date.now() - 900000, // 15 min ago
    element: {
      id: "4",
      elementType: ElementType.TECH_LAB,
      rarity: Rarity.UNCOMMON,
      level: 2,
      power: 280,
      mintedAt: Date.now() - 345600000,
    },
  },
  {
    id: 5,
    seller: "0x3333444455556666777788889999000011112222" as any,
    tokenId: "5",
    price: parseEther("0.5"),
    isActive: true,
    listedAt: Date.now() - 5400000, // 1.5 hours ago
    element: {
      id: "5",
      elementType: ElementType.LIVING_MODULE,
      rarity: Rarity.GENESIS,
      level: 1,
      power: 200,
      mintedAt: Date.now() - 432000000,
    },
  },
];

const MarketplacePanel: React.FC<MarketplacePanelProps> = ({
  player,
  userElements,
  isLoading,
  onCreateTrade,
  onCancelTrade,
  onCompleteTrade,
}) => {
  const [trades, setTrades] = useState<Trade[]>(mockTrades);
  const [filters, setFilters] = useState<MarketFilters>({
    sortBy: 'newest',
    sortOrder: 'desc',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [showCreateListing, setShowCreateListing] = useState(false);
  const [newListingPrice, setNewListingPrice] = useState("");
  const [selectedElement, setSelectedElement] = useState<BaseElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Calculate market stats
  const marketStats = useMemo((): MarketStats => {
    const activeTrades = trades.filter(t => t.isActive);
    const prices = activeTrades.map(t => t.price);
    
    return {
      totalTrades: activeTrades.length,
      totalVolume: prices.reduce((sum, price) => sum + price, 0n),
      averagePrice: prices.length > 0 ? prices.reduce((sum, price) => sum + price, 0n) / BigInt(prices.length) : 0n,
      floorPrice: prices.length > 0 ? prices.reduce((min, price) => price < min ? price : min, prices[0]) : 0n,
      mostExpensive: prices.length > 0 ? prices.reduce((max, price) => price > max ? price : max, prices[0]) : 0n,
    };
  }, [trades]);

  // Filter and sort trades
  const filteredTrades = useMemo(() => {
    let filtered = trades.filter(trade => {
      if (!trade.isActive) return false;
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!trade.element.elementType.toLowerCase().includes(query) &&
            !trade.element.rarity.toLowerCase().includes(query) &&
            !trade.element.id.includes(query)) {
          return false;
        }
      }
      
      // Element type filter
      if (filters.elementType && trade.element.elementType !== filters.elementType) {
        return false;
      }
      
      // Rarity filter
      if (filters.rarity && trade.element.rarity !== filters.rarity) {
        return false;
      }
      
      // Level filters
      if (filters.minLevel && trade.element.level < filters.minLevel) {
        return false;
      }
      if (filters.maxLevel && trade.element.level > filters.maxLevel) {
        return false;
      }
      
      // Price filters
      if (filters.minPrice) {
        try {
          const minPrice = parseEther(filters.minPrice);
          if (trade.price < minPrice) return false;
        } catch (e) {
          // Invalid price format
        }
      }
      if (filters.maxPrice) {
        try {
          const maxPrice = parseEther(filters.maxPrice);
          if (trade.price > maxPrice) return false;
        } catch (e) {
          // Invalid price format
        }
      }
      
      // Power filters
      if (filters.minPower && trade.element.power < filters.minPower) {
        return false;
      }
      if (filters.maxPower && trade.element.power > filters.maxPower) {
        return false;
      }
      
      return true;
    });
    
    // Sort trades
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'price':
          comparison = a.price < b.price ? -1 : a.price > b.price ? 1 : 0;
          break;
        case 'power':
          comparison = a.element.power - b.element.power;
          break;
        case 'level':
          comparison = a.element.level - b.element.level;
          break;
        case 'newest':
          comparison = b.listedAt - a.listedAt;
          break;
        case 'oldest':
          comparison = a.listedAt - b.listedAt;
          break;
        default:
          comparison = 0;
      }
      
      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });
    
    return filtered;
  }, [trades, filters, searchQuery]);

  const handleCreateListing = async () => {
    if (!selectedElement || !newListingPrice) return;
    
    try {
      const price = parseEther(newListingPrice);
      await onCreateTrade(selectedElement.id, price);
      
      setShowCreateListing(false);
      setSelectedElement(null);
      setNewListingPrice("");
    } catch (error) {
      console.error("Failed to create listing:", error);
    }
  };

  const handleBuyElement = async (trade: Trade) => {
    try {
      await onCompleteTrade(trade.id, trade.price);
      setSelectedTrade(null);
    } catch (error) {
      console.error("Failed to buy element:", error);
    }
  };

  const getRarityColor = (rarity: Rarity) => {
    switch (rarity) {
      case Rarity.COMMON: return "text-gray-400 border-gray-500";
      case Rarity.UNCOMMON: return "text-green-400 border-green-500";
      case Rarity.RARE: return "text-blue-400 border-blue-500";
      case Rarity.EPIC: return "text-purple-400 border-purple-500";
      case Rarity.GENESIS: return "text-amber-400 border-amber-500";
      default: return "text-gray-400 border-gray-500";
    }
  };

  const getElementIcon = (elementType: ElementType) => {
    switch (elementType) {
      case ElementType.REACTOR: return "⚛️";
      case ElementType.STORAGE: return "📦";
      case ElementType.DEFENSE_TOWER: return "🛡️";
      case ElementType.TECH_LAB: return "🔬";
      case ElementType.LIVING_MODULE: return "🌱";
      default: return "❓";
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-bold text-cyan-400 mb-2">🛒 Element Marketplace</h2>
          <p className="text-gray-300">Trade elements with other commanders</p>
        </div>
        <button
          onClick={() => setShowCreateListing(true)}
          className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-semibold transition-all flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          List Element
        </button>
      </div>

      {/* Market Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-gradient-to-r from-blue-900/30 to-blue-800/30 border border-blue-600/50 rounded-lg p-4">
          <div className="text-sm text-blue-300">Total Listings</div>
          <div className="text-2xl font-bold text-white">{marketStats.totalTrades}</div>
        </div>
        <div className="bg-gradient-to-r from-green-900/30 to-green-800/30 border border-green-600/50 rounded-lg p-4">
          <div className="text-sm text-green-300">Floor Price</div>
          <div className="text-2xl font-bold text-white">{formatEther(marketStats.floorPrice)} ETH</div>
        </div>
        <div className="bg-gradient-to-r from-purple-900/30 to-purple-800/30 border border-purple-600/50 rounded-lg p-4">
          <div className="text-sm text-purple-300">Average Price</div>
          <div className="text-2xl font-bold text-white">{formatEther(marketStats.averagePrice)} ETH</div>
        </div>
        <div className="bg-gradient-to-r from-orange-900/30 to-orange-800/30 border border-orange-600/50 rounded-lg p-4">
          <div className="text-sm text-orange-300">Highest Price</div>
          <div className="text-2xl font-bold text-white">{formatEther(marketStats.mostExpensive)} ETH</div>
        </div>
        <div className="bg-gradient-to-r from-cyan-900/30 to-cyan-800/30 border border-cyan-600/50 rounded-lg p-4">
          <div className="text-sm text-cyan-300">Total Volume</div>
          <div className="text-2xl font-bold text-white">{formatEther(marketStats.totalVolume)} ETH</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search elements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
          />
        </div>
        
        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2 ${
            showFilters 
              ? 'bg-cyan-600 text-white' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          <Filter className="w-5 h-5" />
          Filters
        </button>
        
        {/* Sort */}
        <div className="flex items-center gap-2">
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
            className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="price">Price</option>
            <option value="power">Power</option>
            <option value="level">Level</option>
          </select>
          
          <button
            onClick={() => setFilters(prev => ({ 
              ...prev, 
              sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' 
            }))}
            className="p-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-all"
          >
            {filters.sortOrder === 'asc' ? <SortAsc className="w-5 h-5" /> : <SortDesc className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-gray-800/50 border border-gray-600 rounded-lg p-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Element Type */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Element Type</label>
              <select
                value={filters.elementType || ''}
                onChange={(e) => setFilters(prev => ({ 
                  ...prev, 
                  elementType: e.target.value as ElementType || undefined 
                }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="">All Types</option>
                <option value={ElementType.REACTOR}>Reactor</option>
                <option value={ElementType.STORAGE}>Storage</option>
                <option value={ElementType.DEFENSE_TOWER}>Defense Tower</option>
                <option value={ElementType.TECH_LAB}>Tech Lab</option>
                <option value={ElementType.LIVING_MODULE}>Living Module</option>
              </select>
            </div>

            {/* Rarity */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Rarity</label>
              <select
                value={filters.rarity || ''}
                onChange={(e) => setFilters(prev => ({ 
                  ...prev, 
                  rarity: e.target.value as Rarity || undefined 
                }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="">All Rarities</option>
                <option value={Rarity.COMMON}>Common</option>
                <option value={Rarity.UNCOMMON}>Uncommon</option>
                <option value={Rarity.RARE}>Rare</option>
                <option value={Rarity.EPIC}>Epic</option>
                <option value={Rarity.GENESIS}>Genesis</option>
              </select>
            </div>

            {/* Level Range */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Level Range</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.minLevel || ''}
                  onChange={(e) => setFilters(prev => ({ 
                    ...prev, 
                    minLevel: e.target.value ? parseInt(e.target.value) : undefined 
                  }))}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.maxLevel || ''}
                  onChange={(e) => setFilters(prev => ({ 
                    ...prev, 
                    maxLevel: e.target.value ? parseInt(e.target.value) : undefined 
                  }))}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Price Range */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Price Range (ETH)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Min"
                  value={filters.minPrice || ''}
                  onChange={(e) => setFilters(prev => ({ 
                    ...prev, 
                    minPrice: e.target.value || undefined 
                  }))}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Max"
                  value={filters.maxPrice || ''}
                  onChange={(e) => setFilters(prev => ({ 
                    ...prev, 
                    maxPrice: e.target.value || undefined 
                  }))}
                  className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="flex justify-end">
            <button
              onClick={() => setFilters({ sortBy: 'newest', sortOrder: 'desc' })}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-all"
            >
              Clear Filters
            </button>
          </div>
        </motion.div>
      )}

      {/* Trades Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredTrades.map((trade) => (
          <motion.div
            key={trade.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
              relative bg-gradient-to-br from-gray-800 to-gray-900 border-2 rounded-xl p-4 hover:scale-105 transition-all duration-300 cursor-pointer
              ${getRarityColor(trade.element.rarity)}
            `}
            onClick={() => setSelectedTrade(trade)}
          >
            {/* Element Icon */}
            <div className="text-4xl mb-3 text-center">
              {getElementIcon(trade.element.elementType)}
            </div>

            {/* Element Info */}
            <div className="text-center mb-4">
              <h3 className="text-lg font-bold text-white mb-1">
                {trade.element.elementType.replace('_', ' ')}
              </h3>
              <div className={`text-sm font-semibold ${getRarityColor(trade.element.rarity).split(' ')[0]}`}>
                {trade.element.rarity}
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Level:</span>
                <span className="text-white font-semibold">{trade.element.level}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Power:</span>
                <span className="text-yellow-400 font-semibold">{trade.element.power}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Listed:</span>
                <span className="text-gray-300">{formatTimeAgo(trade.listedAt)}</span>
              </div>
            </div>

            {/* Price */}
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400 mb-2">
                {formatEther(trade.price)} ETH
              </div>
              <div className="text-xs text-gray-400">
                ~${(parseFloat(formatEther(trade.price)) * 2000).toFixed(2)} USD
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTrade(trade);
                }}
                className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1"
              >
                <Eye className="w-4 h-4" />
                View
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleBuyElement(trade);
                }}
                className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1"
              >
                <ShoppingCart className="w-4 h-4" />
                Buy
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Empty State */}
      {filteredTrades.length === 0 && (
        <div className="text-center py-20">
          <ShoppingCart className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-400 mb-2">No Elements Found</h3>
          <p className="text-gray-500">Try adjusting your filters or search query</p>
        </div>
      )}

      {/* Trade Detail Modal */}
      <AnimatePresence>
        {selectedTrade && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedTrade(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-600"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">Element Details</h3>
                <button
                  onClick={() => setSelectedTrade(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="text-center mb-6">
                <div className="text-6xl mb-4">
                  {getElementIcon(selectedTrade.element.elementType)}
                </div>
                <h4 className="text-2xl font-bold text-white mb-2">
                  {selectedTrade.element.elementType.replace('_', ' ')}
                </h4>
                <div className={`text-lg font-semibold ${getRarityColor(selectedTrade.element.rarity).split(' ')[0]}`}>
                  {selectedTrade.element.rarity}
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-400">Level:</span>
                  <span className="text-white font-semibold">{selectedTrade.element.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Power:</span>
                  <span className="text-yellow-400 font-semibold">{selectedTrade.element.power}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Element ID:</span>
                  <span className="text-white font-mono">#{selectedTrade.element.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Listed:</span>
                  <span className="text-gray-300">{formatTimeAgo(selectedTrade.listedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Seller:</span>
                  <span className="text-blue-400 font-mono text-sm">
                    {selectedTrade.seller.slice(0, 6)}...{selectedTrade.seller.slice(-4)}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-600 pt-4">
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold text-green-400 mb-1">
                    {formatEther(selectedTrade.price)} ETH
                  </div>
                  <div className="text-sm text-gray-400">
                    ~${(parseFloat(formatEther(selectedTrade.price)) * 2000).toFixed(2)} USD
                  </div>
                  <div className="text-xs text-red-400 mt-1">
                    + 2.5% marketplace fee
                  </div>
                </div>

                <button
                  onClick={() => handleBuyElement(selectedTrade)}
                  className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Buy Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Listing Modal */}
      <AnimatePresence>
        {showCreateListing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateListing(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-600"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold text-white">List Element</h3>
                <button
                  onClick={() => setShowCreateListing(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Element Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Select Element</label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {userElements.map((element) => (
                      <button
                        key={element.id}
                        onClick={() => setSelectedElement(element)}
                        className={`
                          p-3 rounded-lg border-2 transition-all text-left
                          ${selectedElement?.id === element.id
                            ? 'border-cyan-400 bg-cyan-900/20'
                            : 'border-gray-600 hover:border-gray-500'
                          }
                        `}
                      >
                        <div className="text-2xl mb-1">{getElementIcon(element.elementType)}</div>
                        <div className="text-sm text-white font-semibold">
                          {element.elementType.replace('_', ' ')}
                        </div>
                        <div className={`text-xs ${getRarityColor(element.rarity).split(' ')[0]}`}>
                          {element.rarity} • Lv.{element.level}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Price (ETH)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.1"
                    value={newListingPrice}
                    onChange={(e) => setNewListingPrice(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  />
                  {newListingPrice && (
                    <div className="text-sm text-gray-400 mt-1">
                      ~${(parseFloat(newListingPrice) * 2000).toFixed(2)} USD
                    </div>
                  )}
                </div>

                {/* Fee Information */}
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <div className="text-sm text-gray-300 mb-2">Transaction Summary:</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Listing Price:</span>
                      <span className="text-white">{newListingPrice || '0'} ETH</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Marketplace Fee (2.5%):</span>
                      <span className="text-red-400">
                        {newListingPrice ? (parseFloat(newListingPrice) * 0.025).toFixed(4) : '0'} ETH
                      </span>
                    </div>
                    <div className="border-t border-gray-600 pt-1 mt-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-gray-300">You'll receive:</span>
                        <span className="text-green-400">
                          {newListingPrice ? (parseFloat(newListingPrice) * 0.975).toFixed(4) : '0'} ETH
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowCreateListing(false)}
                    className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateListing}
                    disabled={!selectedElement || !newListingPrice}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    List Element
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MarketplacePanel; 