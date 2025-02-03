'use client';

import { useEffect, useState } from 'react';
import { COINGECKO_API_KEY } from '../../config/coingecko';
import { motion } from 'framer-motion';

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  sparkline_in_7d: {
    price: number[];
  };
}

export default function CoinGeckoMultiWidget() {
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const initialDisplayCount = 15;

  const formatNumber = (num: number | null) => {
    if (num === null) return 'N/A';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  useEffect(() => {
    const fetchCoins = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=true',
          {
            headers: {
              'x-cg-demo-api-key': COINGECKO_API_KEY
            }
          }
        );

        if (!response.ok) {
          throw new Error('Nie udało się pobrać danych o kryptowalutach');
        }

        const data = await response.json();
        setCoins(data);
      } catch (err) {
        console.error('Błąd podczas pobierania danych:', err);
        setError('Nie udało się załadować danych o kryptowalutach');
      } finally {
        setLoading(false);
      }
    };

    fetchCoins();
    const interval = setInterval(fetchCoins, 60000);
    return () => clearInterval(interval);
  }, []);

  const filteredCoins = coins.filter(coin =>
    coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    coin.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayedCoins = isExpanded ? filteredCoins : filteredCoins.slice(0, initialDisplayCount);

  const headerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.2
      }
    }
  };

  const titleVariants = {
    hidden: { 
      opacity: 0,
      y: 20,
      scale: 0.95
    },
    visible: { 
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 200,
        damping: 20,
        duration: 0.8
      }
    }
  };

  const subtitleVariants = {
    hidden: { 
      opacity: 0,
      y: 20
    },
    visible: { 
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 150,
        damping: 15,
        delay: 0.2
      }
    }
  };

  const gradientVariants = {
    hidden: { 
      opacity: 0,
      scale: 1.1
    },
    visible: { 
      opacity: 1,
      scale: 1,
      transition: {
        duration: 1.2,
        ease: "easeOut"
      }
    }
  };

  const sparkVariants = {
    hidden: { opacity: 0, scale: 0 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 20
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Top 100 Cryptocurrency List</h2>
          <p className="text-gray-600">Real-time prices and market statistics for the most popular cryptocurrencies</p>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
          <div className="animate-pulse space-y-4">
            {[...Array(15)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-8 h-8 bg-gray-200 rounded-full" />
                  <div>
                    <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
                    <div className="h-3 w-16 bg-gray-200 rounded" />
                  </div>
                </div>
                <div className="text-right">
                  <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-16 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Top 100 Cryptocurrency List</h2>
          <p className="text-gray-600">Real-time prices and market statistics for the most popular cryptocurrencies</p>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="bg-white rounded-xl shadow-lg p-6 border border-gray-100"
    >
      <div className="text-center mb-10">
        <div className="flex items-center justify-center space-x-3 mb-3">
          <span className="text-3xl">📈</span>
          <h2 className="text-5xl font-extrabold bg-gradient-to-r from-blue-600 via-violet-600 to-blue-600 bg-clip-text text-transparent">
            Top 100 Crypto
          </h2>
          <span className="text-3xl">💎</span>
        </div>
        <p className="text-gray-600 text-lg mt-2">
          Real-time prices and market statistics for the most popular cryptocurrencies
        </p>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-900 placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-[200px] transition-all"
          />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left pb-4 font-medium text-gray-500">#</th>
              <th className="text-left pb-4 font-medium text-gray-500">Name</th>
              <th className="text-right pb-4 font-medium text-gray-500">Price</th>
              <th className="text-right pb-4 font-medium text-gray-500">24h %</th>
              <th className="text-right pb-4 font-medium text-gray-500">Market Cap</th>
              <th className="text-right pb-4 font-medium text-gray-500">Volume (24h)</th>
              <th className="text-right pb-4 font-medium text-gray-500 w-[200px]">Last 7 days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayedCoins.map((coin, index) => (
              <tr key={coin.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-4">
                  <span className="text-gray-600 text-sm">{index + 1}</span>
                </td>
                <td className="py-4">
                  <div className="flex items-center space-x-3">
                    <img 
                      src={coin.image} 
                      alt={coin.name} 
                      className="w-8 h-8 rounded-full"
                      onError={(e) => {
                        e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${coin.symbol}`;
                      }}
                    />
                    <div>
                      <div className="font-medium text-gray-900">{coin.name}</div>
                      <div className="text-sm text-gray-500">{coin.symbol.toUpperCase()}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right py-4">
                  <div className="font-medium text-gray-900">
                    ${coin.current_price.toLocaleString()}
                  </div>
                </td>
                <td className="text-right py-4">
                  <div className={`text-sm font-medium ${
                    coin.price_change_percentage_24h >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {coin.price_change_percentage_24h?.toFixed(1)}%
                  </div>
                </td>
                <td className="text-right py-4">
                  <div className="text-sm text-gray-900">{formatNumber(coin.market_cap)}</div>
                </td>
                <td className="text-right py-4">
                  <div className="text-sm text-gray-900">{formatNumber(coin.total_volume)}</div>
                </td>
                <td className="text-right py-4">
                  {coin.sparkline_in_7d?.price && (
                    <div className="w-[180px] h-[60px] ml-auto">
                      <svg viewBox="0 0 180 60" className="w-full h-full" preserveAspectRatio="none">
                        <path
                          d={`M ${coin.sparkline_in_7d.price.map((price, i) => 
                            `${(i / (coin.sparkline_in_7d.price.length - 1)) * 180},${
                              60 - ((price - Math.min(...coin.sparkline_in_7d.price)) / 
                              (Math.max(...coin.sparkline_in_7d.price) - Math.min(...coin.sparkline_in_7d.price))) * 60
                            }`
                          ).join(' L ')}`}
                          fill="none"
                          stroke={coin.price_change_percentage_24h >= 0 ? '#16a34a' : '#dc2626'}
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredCoins.length > initialDisplayCount && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mt-6 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </motion.div>
  );
} 