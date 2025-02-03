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
      case 'DEGEN':
        return {
          description: "DEGEN is the governance token of the Base ecosystem. Holders can participate in protocol governance and earn rewards for contributing to the network's growth.",
          features: ["Governance voting rights", "Community rewards", "Protocol fee sharing", "Exclusive access to features"],
          useCase: "Governance & Rewards",
          paymentMethods: ["Coinbase Account", "Apple Pay", "Debit Card", "ETH", "USDC"]
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
      name: 'DEGEN',
      address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
      symbol: 'DEGEN',
      decimals: 18,
      chainId: 8453,
      image: 'https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/3b/bf/3bbf118b5e6dc2f9e7fc607a6e7526647b4ba8f0bea87125f971446d57b296d2-MDNmNjY0MmEtNGFiZi00N2I0LWIwMTItMDUyMzg2ZDZhMWNm'
    },
    {
      name: 'USD Coin',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      symbol: 'USDC',
      decimals: 6,
      chainId: 8453,
      image: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png'
    },
    {
      name: 'Coinbase Wrapped Staked ETH',
      address: '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22',
      symbol: 'cbETH',
      decimals: 18,
      chainId: 8453,
      image: 'https://assets.coingecko.com/coins/images/27008/large/cbeth.png'
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
        className="grid grid-cols-1 md:grid-cols-3 gap-8"
      >
        {tokens.map((token) => {
          const tokenInfo = getTokenDescription(token.symbol);
          return (
            <motion.div
              key={token.address}
              variants={itemVariants}
              className="group relative"
            >
              {/* Tooltip */}
              <div className="tooltip opacity-0 group-hover:opacity-100 transition-all duration-300 absolute -top-16 left-1/2 transform -translate-x-1/2 bg-[#0052FF]/10 text-white text-xs font-['Share_Tech_Mono'] px-4 py-2 rounded-full border border-[#0052FF]/20 backdrop-blur-xl z-50 shadow-lg shadow-[#0052FF]/20 w-auto min-w-[200px] whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <span className="text-[#0052FF]">💳</span>
                  <div className="flex flex-wrap gap-1">
                    {tokenInfo.paymentMethods.map((method, index) => (
                      <span key={index} className="text-[#0052FF]">
                        {index > 0 ? ' • ' : ''}{method}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card glow effect */}
              <div className="absolute -inset-[1px] bg-gradient-to-r from-blue-500/50 via-cyan-500/50 to-blue-500/50 rounded-xl blur-md group-hover:blur-xl transition-all duration-300 opacity-20 group-hover:opacity-30"></div>

              {/* Card content */}
              <div className="h-[400px] bg-black/50 backdrop-blur-xl rounded-xl overflow-hidden border border-blue-500/30 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:shadow-blue-500/20 p-6 relative flex flex-col">
                {/* Background Image */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent">
                  <img
                    src={getTokenImage(token)}
                    alt=""
                    className="w-full h-full object-contain opacity-20 scale-[1.5] blur-lg"
                  />
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-xl blur-xl"></div>
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col flex-grow">
                  <div className="flex-grow flex flex-col items-center justify-start text-center space-y-3">
                    {/* Token Image */}
                    <div className="w-16 h-16 relative mb-2">
                      <img
                        src={getTokenImage(token)}
                        alt={token.name}
                        className="w-full h-full object-contain rounded-full"
                      />
                    </div>

                    {/* Token Name and Symbol */}
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-white">{token.name}</h3>
                      <p className="text-blue-400 text-sm">{token.symbol}</p>
                    </div>

                    {/* Token Description */}
                    <div className="text-gray-400 text-sm leading-relaxed mt-2">
                      {tokenInfo.description}
                    </div>

                    {/* Features List */}
                    <div className="flex flex-wrap justify-center gap-2 mt-2">
                      {tokenInfo.features.map((feature, index) => (
                        <span
                          key={index}
                          className="text-xs px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>

                    {/* Use Cases */}
                    <div className="text-sm text-gray-400 mt-2">
                      {tokenInfo.useCase}
                    </div>

                    {/* Staking Link dla cbETH */}
                    {token.symbol === 'cbETH' && (
                      <a 
                        href="https://www.coinbase.com/pl/earn/staking/coinbase-wrapped-staked-eth"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-[#0052FF] hover:text-blue-400 mt-4 group transition-all duration-300"
                      >
                        <span className="text-sm font-['Share_Tech_Mono'] border-b border-[#0052FF]/0 group-hover:border-[#0052FF] transition-all duration-300">
                          STAKE your cbETH
                        </span>
                        <svg 
                          className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M13 7l5 5m0 0l-5 5m5-5H6" 
                          />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Buy Buttons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
        {tokens.map((token) => (
          <div key={token.address}>
            <Buy 
              toToken={token}
              isSponsored
              className="w-full 
                [&_input]:!h-14 
                [&_input]:!text-lg 
                [&_input]:!rounded-xl 
                [&_input]:!border-gray-200
                [&_input]:!bg-white
                [&_input]:!text-gray-900
                [&_input]:!placeholder-gray-400
                [&_input]:!shadow-sm
                [&_input]:!pl-4
                [&_input]:hover:!border-blue-400
                [&_input]:focus:!border-blue-500
                [&_input]:focus:!ring-2
                [&_input]:focus:!ring-blue-500/20
                [&_input]:!transition-all
                [&_input]:!duration-300
                [&_button]:!h-14 
                [&_button]:!text-lg 
                [&_button]:!rounded-xl 
                [&_button]:!bg-blue-500 
                [&_button]:!hover:bg-blue-600 
                [&_button]:!text-white 
                [&_button]:!font-['Share_Tech_Mono']
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