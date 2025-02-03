'use client';

import { useState, useEffect } from 'react';

interface NetworkStats {
  dailyTransactions: number;
  totalTransactions: number;
  activeAddresses: number;
  totalAddresses: number;
  totalValueLocked: number;
  gasPrice: number;
}

export default function NetworkStats() {
  const [stats, setStats] = useState<NetworkStats>({
    dailyTransactions: 0,
    totalTransactions: 0,
    activeAddresses: 0,
    totalAddresses: 0,
    totalValueLocked: 0,
    gasPrice: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Pobierz dane z BaseScan API dla podstawowych statystyk
        const [txCountResponse, gasResponse] = await Promise.all([
          fetch(`https://api.basescan.org/api?module=stats&action=txcount&apikey=YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN`),
          fetch(`https://api.basescan.org/api?module=proxy&action=eth_gasPrice&apikey=YB9ZQ71MVDJU3CQQXFJ6GQ4Y17MPKEQCBN`)
        ]);

        const [txCountData, gasData] = await Promise.all([
          txCountResponse.json(),
          gasResponse.json()
        ]);

        // Pobierz TVL z DefiLlama API
        const tvlResponse = await fetch('https://api.llama.fi/v2/chain/base');
        const tvlData = await tvlResponse.json();

        setStats({
          dailyTransactions: Math.floor(Math.random() * 1000000) + 500000, // Przykładowe dane
          totalTransactions: txCountData.result,
          activeAddresses: Math.floor(Math.random() * 100000) + 50000, // Przykładowe dane
          totalAddresses: Math.floor(Math.random() * 1000000) + 500000, // Przykładowe dane
          totalValueLocked: tvlData.tvl || 0,
          gasPrice: parseInt(gasData.result, 16) / 1e9 // Konwersja z wei na gwei
        });
      } catch (error) {
        console.error('Błąd podczas pobierania statystyk sieci:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Odświeżaj co minutę
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(0);
  };

  const formatUSD = (num: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold mb-6 text-blue-900 dark:text-blue-100">
        Base Network Stats
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Daily Transactions
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {isLoading ? '...' : formatNumber(stats.dailyTransactions)}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Total Transactions
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {isLoading ? '...' : formatNumber(stats.totalTransactions)}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Active Addresses
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {isLoading ? '...' : formatNumber(stats.activeAddresses)}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Total Addresses
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {isLoading ? '...' : formatNumber(stats.totalAddresses)}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Total Value Locked
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {isLoading ? '...' : formatUSD(stats.totalValueLocked)}
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Gas (Gwei)
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {isLoading ? '...' : stats.gasPrice.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
        Data refreshed every minute
      </div>
    </div>
  );
} 