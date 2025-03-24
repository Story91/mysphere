'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface TransactionData {
  lastHour: {
    buys: number;
    sells: number;
  };
  last24Hours: {
    buys: number;
    sells: number;
  };
  pairInfo: {
    created: string;
    dex: string;
  };
}

export default function TransactionStats() {
  const [transactionData, setTransactionData] = useState<TransactionData>({
    lastHour: { buys: 0, sells: 0 },
    last24Hours: { buys: 0, sells: 0 },
    pairInfo: { created: '', dex: '' }
  });

  useEffect(() => {
    const fetchTransactionData = async () => {
      try {
        const response = await fetch(
          'https://api.dexscreener.com/latest/dex/tokens/0x26f732ed652a63ae66f365936fddd2389c051b31'
        );
        const data = await response.json();
        
        if (data.pairs && data.pairs[0]) {
          const pair = data.pairs[0];
          
          setTransactionData({
            lastHour: {
              buys: pair.txns?.h1?.buys || 0,
              sells: pair.txns?.h1?.sells || 0
            },
            last24Hours: {
              buys: pair.txns?.h24?.buys || 0,
              sells: pair.txns?.h24?.sells || 0
            },
            pairInfo: {
              created: pair.pairCreatedAt || '',
              dex: pair.dexId || ''
            }
          });
        }
      } catch (error) {
        console.error('Error fetching transaction data:', error);
      }
    };

    fetchTransactionData();
    const interval = setInterval(fetchTransactionData, 30000);
    return () => clearInterval(interval);
  }, []);

  const calculateBuyPercentage = (buys: number, sells: number) => {
    const total = buys + sells;
    return total > 0 ? (buys / total * 100).toFixed(1) : '0.0';
  };

  return (
    <div className="relative bg-[#1a1b1f] rounded-3xl p-8 shadow-2xl border border-blue-500/20">
      <motion.div
        animate={{
          scale: [1, 1.02, 1],
          y: [0, -2, 0]
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="relative"
      >
        <h3 className="text-3xl font-bold text-blue-400 mb-8">
          Transaction Activity
        </h3>
        
        {/* Last Hour Stats */}
        <div className="mb-6">
          <h4 className="text-lg text-blue-300 mb-4">Last Hour</h4>
          <div className="grid grid-cols-2 gap-6 mb-2">
            <div className="bg-[#1E2025] rounded-2xl p-5">
              <p className="text-base text-blue-300 mb-2">Buy Transactions</p>
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-green-400 font-mono">
                {transactionData.lastHour.buys}
              </p>
            </div>
            <div className="bg-[#1E2025] rounded-2xl p-5">
              <p className="text-base text-blue-300 mb-2">Sell Transactions</p>
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-red-400 font-mono">
                {transactionData.lastHour.sells}
              </p>
            </div>
          </div>
          <div className="w-full h-2 bg-[#1E2025] rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-400 transition-all duration-300"
              style={{ 
                width: `${calculateBuyPercentage(
                  transactionData.lastHour.buys,
                  transactionData.lastHour.sells
                )}%` 
              }}
            />
          </div>
          <p className="text-sm text-blue-300 mt-2">
            {calculateBuyPercentage(
              transactionData.lastHour.buys,
              transactionData.lastHour.sells
            )}% Buys
          </p>
        </div>

        {/* Last 24 Hours Stats */}
        <div className="mb-6">
          <h4 className="text-lg text-blue-300 mb-4">Last 24 Hours</h4>
          <div className="grid grid-cols-2 gap-6 mb-2">
            <div className="bg-[#1E2025] rounded-2xl p-5">
              <p className="text-base text-blue-300 mb-2">Buy Transactions</p>
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-green-400 font-mono">
                {transactionData.last24Hours.buys}
              </p>
            </div>
            <div className="bg-[#1E2025] rounded-2xl p-5">
              <p className="text-base text-blue-300 mb-2">Sell Transactions</p>
              <p className="text-lg sm:text-xl lg:text-2xl font-bold text-red-400 font-mono">
                {transactionData.last24Hours.sells}
              </p>
            </div>
          </div>
          <div className="w-full h-2 bg-[#1E2025] rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-400 transition-all duration-300"
              style={{ 
                width: `${calculateBuyPercentage(
                  transactionData.last24Hours.buys,
                  transactionData.last24Hours.sells
                )}%` 
              }}
            />
          </div>
          <p className="text-sm text-blue-300 mt-2">
            {calculateBuyPercentage(
              transactionData.last24Hours.buys,
              transactionData.last24Hours.sells
            )}% Buys
          </p>
        </div>

        {/* Pair Info */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-[#1E2025] rounded-2xl p-5">
            <p className="text-base text-blue-300 mb-2">Pair Created</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-400 font-mono">
              {typeof transactionData.pairInfo.created === 'string' && transactionData.pairInfo.created.includes('T') 
                ? transactionData.pairInfo.created.split('T')[0] 
                : 'Loading...'}
            </p>
          </div>
          <div className="bg-[#1E2025] rounded-2xl p-5">
            <p className="text-base text-blue-300 mb-2">DEX</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-400 font-mono capitalize">
              {transactionData.pairInfo.dex || 'Loading...'}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 