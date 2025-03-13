'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import NetworkDashboard from './NetworkDashboard';
import { Earn, EarnDeposit, EarnWithdraw } from '@coinbase/onchainkit/earn';
import Image from 'next/image';

const ACTIVE_VAULTS = [
  {
    name: 'Spark USDC Vault',
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' as `0x${string}`,
    icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg',
  },
  {
    name: 'Moonwell Flagship USDC',
    address: '0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca' as `0x${string}`,
    icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg',
  }
];

interface VaultCardProps {
  name: string;
  address: `0x${string}`;
  icon: string;
}

function VaultCard({ name, address, icon }: VaultCardProps) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-black rounded-2xl p-4 sm:p-6 shadow-lg w-full"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full p-2">
            <Image
              src={icon}
              alt={name}
              fill
              className="rounded-full object-contain p-1"
              onError={(e) => {
                e.currentTarget.src = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg';
              }}
            />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white">{name}</h3>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setMode('deposit')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
              mode === 'deposit'
                ? 'bg-[#0052FF] text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Deposit
          </button>
          <button
            onClick={() => setMode('withdraw')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors ${
              mode === 'withdraw'
                ? 'bg-[#0052FF] text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Withdraw
          </button>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-4">
        <div className="[&>div]:!w-full [&>div>div]:!w-full [&>div>div>div]:!w-full [&_input]:!w-full [&_button]:!w-full">
          <Earn vaultAddress={address}>
            {mode === 'deposit' ? (
              <EarnDeposit />
            ) : (
              <EarnWithdraw />
            )}
          </Earn>
        </div>
      </div>
    </motion.div>
  );
}

export default function VaultDashboard() {
  return (
    <div className="w-full font-coinbase relative min-h-screen pb-16">
      {/* Main background wallpaper */}
      <div className="fixed inset-0 w-full h-full">
        <img 
          src="/Morpho Brand Kit/Wallpapers/Desktop/Morpho-wallpaper-desktop-4.png" 
          alt="Morpho background" 
          className="w-full h-full object-cover"
          style={{ mixBlendMode: 'normal' }}
        />
        <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px]"></div>
      </div>

      {/* Content wrapper */}
      <div className="relative z-10">
        {/* Header with Morpho branding */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="/Morpho Brand Kit/Logos/Morpho Logos/SVG/Morpho-logo-horizontal-lightmode.svg" 
              alt="Morpho Logo" 
              className="h-10 ml-4"
            />
          </div>
        </div>

        <NetworkDashboard />
        
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {ACTIVE_VAULTS.map((vault) => (
              <VaultCard
                key={vault.address}
                name={vault.name}
                address={vault.address}
                icon={vault.icon}
              />
            ))}
          </div>
        </div>

        {/* Powered by Morpho footer */}
        <div className="fixed bottom-8 left-0 right-0 z-50">
          <div className="container mx-auto px-4 flex justify-center">
            <a 
              href="https://app.morpho.org/base/earn" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="bg-black/80 backdrop-blur-sm rounded-2xl p-3 hover:bg-black/90 transition-all cursor-pointer shadow-xl"
            >
              <img
                src="/Morpho Brand Kit/Logos/Morpho Badges Logos/SVG/PoweredbyMorpho-3-darkmode.svg"
                alt="Powered by Morpho"
                className="h-8"
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
} 