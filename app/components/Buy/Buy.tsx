'use client';

import { Buy } from '@coinbase/onchainkit/buy';
import type { Token } from '@coinbase/onchainkit/token';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function BuyComponent() {
  const [tokenPrices, setTokenPrices] = useState<{[key: string]: {price: number, change24h: number}}>({});
  const [hoveredToken, setHoveredToken] = useState<string | null>(null);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  const getTokenImage = (token: Token) => {
    return token.image || `https://api.dicebear.com/7.x/initials/svg?seed=${token.symbol}`;
  };

  const getTokenDescription = (symbol: string) => {
    switch (symbol) {
      case 'AIS':
        return {
          description: "All I See Is Base – no hype, just pure potential. This is where the future begins. Base is the foundation, the game-changer. Get in, stay ahead!",
          features: ["MEMECOIN", "ALL I SEE IS BASE", "BASED"],
          useCase: "AI & Governance",
          paymentMethods: ["Coinbase Account", "Apple Pay", "Debit Card", "ETH", "USDC"],
          contractAddress: "0x26F732eD652A63aE66F365936fdDD2389c051B31"
        };
      case 'USDC':
        return {
          description: "USD Coin (USDC) is a fully-collateralized stablecoin pegged to the US dollar, providing stability and reliability for Base ecosystem transactions.",
          features: ["1:1 USD backing", "Regular audits", "Instant transfers", "Wide acceptance"],
          useCase: "Stablecoin & Payments",
          paymentMethods: ["Coinbase Account", "Apple Pay", "Debit Card", "ETH"]
        };
      case 'cbETH':
        return {
          description: "Coinbase Wrapped Staked ETH (cbETH) represents staked ETH on Base, allowing users to earn staking rewards while maintaining liquidity.",
          features: ["Earn staking rewards", "Liquid staking", "Base ecosystem integration", "Backed by Coinbase"],
          useCase: "Liquid Staking",
          paymentMethods: ["Coinbase Account", "Apple Pay", "Debit Card", "ETH", "USDC"]
        };
      default:
        return {
          description: "",
          features: [],
          useCase: "",
          paymentMethods: []
        };
    }
  };

  const tokens: Token[] = [
    {
      name: 'All I See Is Base',
      address: '0x26F732eD652A63aE66F365936fdDD2389c051B31',
      symbol: 'AIS',
      decimals: 18,
      chainId: 8453,
      image: '/aislogo.png'
    }
  ];

  useEffect(() => {
    const fetchTokenPrices = async () => {
      try {
        // Mapowanie adresów na ID CoinGecko
        const coinGeckoIds = {
          '0x4ed4e862860bed51a9570b96d89af5e1b0efefed': 'degen', // DEGEN
          '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'usd-coin', // USDC
          '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': 'coinbase-wrapped-staked-eth' // cbETH
        };

        // Pobieranie cen i zmian 24h z CoinGecko
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(coinGeckoIds).join(',')}&vs_currencies=usd&include_24hr_change=true`
        );

        if (response.ok) {
          const data = await response.json();
          const prices: {[key: string]: {price: number, change24h: number}} = {};
          
          // Mapowanie odpowiedzi na adresy tokenów
          Object.entries(coinGeckoIds).forEach(([address, geckoId]) => {
            if (data[geckoId]) {
              prices[address.toLowerCase()] = {
                price: data[geckoId].usd,
                change24h: data[geckoId].usd_24h_change || 0
              };
            }
          });
          
          setTokenPrices(prices);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania cen:', error);
      }
    };

    fetchTokenPrices();
    const interval = setInterval(fetchTokenPrices, 30000); // Aktualizacja co 30 sekund
    return () => clearInterval(interval);
  }, []);

  // Funkcja formatująca cenę z odpowiednią liczbą miejsc po przecinku
  const formatPrice = (price: number) => {
    if (price < 0.01) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(2);
  };

  // Funkcja formatująca zmianę procentową
  const formatChange = (change: number) => {
    const formatted = change.toFixed(2);
    const isPositive = change > 0;
    return {
      text: `${isPositive ? '+' : ''}${formatted}%`,
      color: isPositive ? 'text-green-400' : change === 0 ? 'text-gray-400' : 'text-red-400'
    };
  };

  return (
    <div>
      {/* Token Cards Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full"
      >
        {tokens.map((token) => {
          const tokenInfo = getTokenDescription(token.symbol);
          return (
            <motion.div
              key={token.address}
              variants={itemVariants}
              className="group relative w-full"
            >
              {/* Card content */}
              <div className="bg-white/70 backdrop-blur-xl rounded-xl overflow-hidden transition-all duration-300 group-hover:scale-[1.02] p-6 relative flex flex-col border border-blue-100">
                {/* Content */}
                <div className="relative z-10 flex flex-col flex-grow">
                  <div className="flex-grow flex flex-col items-center justify-start text-center space-y-3">
                    {/* Token Image */}
                    <div className="w-24 h-24 relative mb-4">
                      <img
                        src={getTokenImage(token)}
                        alt={token.name}
                        className="w-full h-full object-contain rounded-full"
                      />
                    </div>

                    {/* Token Name and Symbol */}
                    <div className="space-y-2">
                      <h3 className="text-3xl font-bold text-blue-900">{token.name}</h3>
                      <p className="text-blue-600 text-xl">${token.symbol}</p>
                    </div>

                    {/* Token Description */}
                    <div className="text-blue-800 text-lg leading-relaxed mt-4">
                      {tokenInfo.description}
                    </div>

                    {/* Contract Address */}
                    {tokenInfo.contractAddress && (
                      <div className="mt-4 flex items-center justify-center">
                        <div className="flex items-center bg-blue-50 rounded-lg px-3 py-1 border border-blue-200">
                          <code className="text-sm text-blue-800">{tokenInfo.contractAddress}</code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(tokenInfo.contractAddress);
                            }}
                            className="ml-2 text-blue-500 hover:text-blue-600 focus:outline-none"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Features List */}
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      {tokenInfo.features.map((feature, index) => (
                        <span
                          key={index}
                          className="text-sm px-4 py-2 rounded-full bg-blue-50 text-blue-600 border border-blue-200"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Buy Button */}
      <div className="w-full mt-8">
        {tokens.map((token) => (
          <div key={token.address} className="w-full">
            <Buy 
              toToken={token}
              isSponsored
              className="w-full 
                [&_input]:!h-16 
                [&_input]:!text-xl 
                [&_input]:!rounded-xl 
                [&_input]:!border-blue-200
                [&_input]:!bg-white
                [&_input]:!text-blue-900
                [&_input]:!placeholder-blue-400
                [&_input]:!shadow-none
                [&_input]:!pl-6
                [&_input]:hover:!border-blue-400
                [&_input]:focus:!border-blue-500
                [&_input]:focus:!ring-2
                [&_input]:focus:!ring-blue-500/20
                [&_input]:!transition-all
                [&_input]:!duration-300
                [&_button]:!h-16 
                [&_button]:!text-xl 
                [&_button]:!rounded-xl 
                [&_button]:!bg-blue-500 
                [&_button]:!hover:bg-blue-600 
                [&_button]:!text-white 
                [&_button]:!font-bold
                [&_button]:!shadow-lg
                [&_button]:hover:!shadow-blue-500/25
                [&_div]:!bg-transparent
                [&_div]:!border-none
                [&_div]:!shadow-none
                [&_div]:!p-0
                [&_div]:!m-0"
            />
          </div>
        ))}
      </div>
    </div>
  );
} 