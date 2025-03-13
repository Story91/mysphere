import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useVaultData } from '../hooks/useVaultData';

interface VaultStats {
  totalValueLocked: string;
  activeVaults: string;
  sparkHolders: string;
  moonwellHolders: string;
}

const ACTIVE_VAULTS = [
  {
    name: 'Spark USDC Vault',
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
  },
  {
    name: 'Moonwell Flagship USDC',
    address: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca',
  }
];

export default function NetworkDashboard() {
  const { sparkVault, moonwellVault, isLoading } = useVaultData();
  const [stats, setStats] = useState<VaultStats>({
    totalValueLocked: '0',
    activeVaults: '2',
    sparkHolders: '0',
    moonwellHolders: '0'
  });

  useEffect(() => {
    if (sparkVault && moonwellVault) {
      const sparkTVL = 96.097744;
      const moonwellTVL = 30.18;
      
      setStats(prev => ({
        ...prev,
        totalValueLocked: `$${(sparkTVL + moonwellTVL).toFixed(2)}M`,
        sparkHolders: sparkVault.holders.toString(),
        moonwellHolders: moonwellVault.holders.toString()
      }));
    }
  }, [sparkVault, moonwellVault]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-black p-4 sm:p-6 rounded-2xl shadow-lg mb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">Morpho Vaults Overview</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-white">Live</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#0052FF] rounded-full animate-pulse"></div>
                <span className="text-sm text-white">Base Network</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {/* TVL Card */}
          <div className="bg-[#111111] rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-blue-500 bg-opacity-10 rounded-full">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-gray-300">Total Value Locked</span>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-white">
              {isLoading ? 'Loading...' : stats.totalValueLocked}
            </div>
          </div>

          {/* Active Vaults Card */}
          <div className="bg-[#111111] rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-blue-500 bg-opacity-10 rounded-full">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-gray-300">Active Vaults</span>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-white">{stats.activeVaults}</div>
          </div>

          {/* Spark USDC Holders Card */}
          <div className="bg-[#111111] rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-blue-500 bg-opacity-10 rounded-full">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-gray-300">Spark USDC Holders</span>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-white">
              {isLoading ? 'Loading...' : stats.sparkHolders}
            </div>
          </div>

          {/* Moonwell USDC Holders Card */}
          <div className="bg-[#111111] rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-blue-500 bg-opacity-10 rounded-full">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <span className="text-xs sm:text-sm text-gray-300">Moonwell USDC Holders</span>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-white">
              {isLoading ? 'Loading...' : stats.moonwellHolders}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}