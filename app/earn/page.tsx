'use client';

import { useState, useEffect } from 'react';
import { Earn, EarnDeposit, EarnWithdraw, EarnDetails } from '@coinbase/onchainkit/earn';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useSearchParams } from 'next/navigation';
import VaultDashboard from '../components/VaultDashboard';

// Lista dostępnych vaultów Morpho (przykładowe dane - zaaktualizuj adresami rzeczywistych vaultów)
interface Vault {
  id: number;
  name: string;
  description: string;
  address: `0x${string}`;
  apy: string;
  icon: string;
  token: string;
  isAvailable: boolean;
}

const VAULTS: Vault[] = [
  {
    id: 1,
    name: 'Spark USDC Vault',
    description: 'USDC vault using Spark protocol.',
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
    apy: '5.43',
    icon: '/icons/usdc.svg',
    token: 'USDC',
    isAvailable: true
  },
  {
    id: 2,
    name: 'Moonwell Flagship USDC',
    description: 'USDC vault using Moonwell protocol.',
    address: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca',
    apy: '5.31',
    icon: '/icons/usdc.svg',
    token: 'USDC',
    isAvailable: true
  },
  {
    id: 3,
    name: 'Moonwell Flagship ETH',
    description: 'ETH vault using Moonwell protocol. Integration in progress.',
    address: '0x6B8f6A08a6B2B7Ea1Bc6349bF793eBf1C61de39B',
    apy: '2.86',
    icon: '/icons/eth.svg',
    token: 'ETH',
    isAvailable: false
  },
  {
    id: 4,
    name: 'Seamless USDC Vault',
    description: 'USDC vault using Seamless protocol. Integration in progress.',
    address: '0x9D6493248e575D96f31B51Bd5B7A9347F01c1322',
    apy: '7.37',
    icon: '/icons/usdc.svg',
    token: 'USDC',
    isAvailable: false
  },
  {
    id: 5,
    name: 'Seamless ETH Vault',
    description: 'ETH vault using Seamless protocol. Integration in progress.',
    address: '0x3dB732C40bF3E0069f3eAb48e3eD4800846514d5',
    apy: '5.61',
    icon: '/icons/eth.svg',
    token: 'ETH',
    isAvailable: false
  },
  {
    id: 6,
    name: 'Gauntlet ETH Vault',
    description: 'ETH vault using Gauntlet protocol. Integration in progress.',
    address: '0x1058AFe73ee393Af93A795774CB616eA96F70108',
    apy: '3.62',
    icon: '/icons/eth.svg',
    token: 'ETH',
    isAvailable: false
  }
];

export default function EarnPage() {
  const searchParams = useSearchParams();
  const vaultParam = searchParams.get('vault');
  
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const { isConnected } = useAccount();

  // Ustaw wybrany vault na podstawie parametru URL
  useEffect(() => {
    if (vaultParam) {
      const vault = VAULTS.find(v => v.address === vaultParam);
      if (vault) {
        setSelectedVault(vault);
      }
    } else {
      setSelectedVault(null);
    }
  }, [vaultParam]);

  return (
    <div className="min-h-screen bg-[#f9fafb] relative overflow-hidden font-coinbase">
      {/* Blue orbs background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] right-[5%] w-[400px] h-[400px] rounded-full bg-gradient-to-r from-[#0052FF] to-[#00A3FF] opacity-10 blur-3xl"></div>
        <div className="absolute bottom-[20%] left-[10%] w-[600px] h-[600px] rounded-full bg-gradient-to-r from-[#0052FF] to-[#5e17eb] opacity-10 blur-3xl"></div>
        <div className="absolute top-[40%] left-[30%] w-[300px] h-[300px] rounded-full bg-[#0052FF] opacity-5 blur-3xl"></div>
      </div>
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,82,255,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(0,82,255,0.04)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
      
      <div className="container mx-auto px-4 py-6 sm:py-12 relative z-10">
        <div className="max-w-6xl mx-auto">
          {/* Usunięty nagłówek strony */}

          {selectedVault ? (
            // Widok pojedynczego vaulta
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
              {/* Sekcja z informacjami o vaulcie */}
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="bg-white p-4 sm:p-6 rounded-2xl shadow-lg border border-gray-100"
              >
                <div className="flex items-center gap-2 sm:gap-3 mb-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-[#f0f5ff] rounded-full">
                    <img 
                      src={selectedVault.icon} 
                      alt={selectedVault.token} 
                      className="w-6 h-6 sm:w-8 sm:h-8"
                      onError={(e) => {
                        e.currentTarget.src = "https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=029";
                      }}
                    />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">{selectedVault.name}</h2>
                    <p className="text-xs sm:text-sm text-gray-500">APY: <span className="text-green-600 font-bold">{selectedVault.apy}%</span></p>
                  </div>
                </div>

                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">{selectedVault.description}</p>
                
                <div className="space-y-3 sm:space-y-4">
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-xl">
                    <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Token</h3>
                    <p className="text-sm sm:text-base text-gray-900 font-bold">{selectedVault.token}</p>
                  </div>
                  
                  <div className="bg-gray-50 p-3 sm:p-4 rounded-xl">
                    <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Contract Address</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm text-gray-900 font-mono truncate">{selectedVault.address}</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedVault.address);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                <a 
                  href="/earn" 
                  className="mt-4 sm:mt-6 inline-flex items-center text-[#0052FF] text-sm hover:underline"
                >
                  <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none">
                    <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Back to Dashboard
                </a>
              </motion.div>

              {/* Sekcja z interfejsem vault */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl shadow-lg border border-gray-100 overflow-hidden"
              >
                {/* Tabs */}
                <div className="flex mb-4 sm:mb-6 bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => setActiveTab('deposit')}
                    className={`flex-1 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all duration-300 ${
                      activeTab === 'deposit' 
                        ? 'bg-[#0052FF] text-white' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Deposit
                  </button>
                  <button
                    onClick={() => setActiveTab('withdraw')}
                    className={`flex-1 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all duration-300 ${
                      activeTab === 'withdraw' 
                        ? 'bg-[#0052FF] text-white' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Withdraw
                  </button>
                </div>

                {/* Vault Interface */}
                <div className="bg-gray-50 p-3 sm:p-6 rounded-xl">
                  {isConnected ? (
                    <div className="w-full max-w-full">
                      <div className="[&>div]:!w-full [&>div>div]:!w-full [&>div>div>div]:!w-full [&_input]:!w-full [&_button]:!w-full [&_input]:!text-[#0052FF]">
                        <Earn vaultAddress={selectedVault.address}>
                          {activeTab === 'deposit' ? (
                            <EarnDeposit />
                          ) : (
                            <EarnWithdraw />
                          )}
                        </Earn>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 sm:py-8">
                      <p className="text-gray-600 text-sm sm:text-base mb-4">Connect your wallet to start earning with Morpho vaults</p>
                      <div className="inline-block">
                        {/* Wallet Connect Button będzie automatycznie dodany z OnchainKit Provider */}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          ) : (
            // Dashboard View - widok wszystkich vaultów
            <VaultDashboard />
          )}
        </div>
      </div>
    </div>
  );
} 