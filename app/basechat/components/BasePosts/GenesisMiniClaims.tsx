'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NFTMintCard } from '@coinbase/onchainkit/nft';
import { NFTAssetCost, NFTCollectionTitle, NFTMintButton } from '@coinbase/onchainkit/nft/mint';
import { NFTMedia } from '@coinbase/onchainkit/nft/view';

// Minimal, compact claims for MySphere Genesis (Base)
// Contracts from mysphere.fun/nft page
const GENESIS_CONTRACTS: { address: `0x${string}`; label: string }[] = [
  { address: '0x8edb8B2383f41e14b49414dd32c4A786Ed2e277d', label: 'SPHERE Pioneer' },
  { address: '0x4087EFD20F2A91ADeAa2b7259F61d04d1e5B233E', label: 'SPHERE Guardian' },
  { address: '0x6d55153A6B1d1157f19D403DEd541fbe6De48C5A', label: 'SPHERE Master' },
];

export default function GenesisMiniClaims() {
  const [visible, setVisible] = useState<boolean>(true);

  const handleDismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mt-4"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-black">Claim your Sphere Genesis NFTs</div>
          <button
            onClick={handleDismiss}
            className="text-xs text-gray-500 hover:text-gray-700"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {GENESIS_CONTRACTS.map(({ address, label }) => (
            <div key={address} className="relative group">
              <div className="absolute -inset-[1px] rounded-xl bg-white opacity-50 group-hover:opacity-70 blur-[1px] transition-all" />
              <NFTMintCard 
                contractAddress={address}
                className="relative rounded-xl overflow-hidden border border-gray-200 bg-white"
              >
                {/* Small preview */}
                <div className="grid grid-cols-[72px,1fr] items-center gap-3 p-3">
                  <div className="rounded-lg overflow-hidden border border-[#0052FF]/30">
                    <NFTMedia className="w-[72px] h-[72px] object-cover" />
                  </div>
                  <div className="min-w-0">
                    <NFTCollectionTitle className="text-sm font-semibold text-black truncate" />
                    <div className="mt-0.5 text-[11px] text-gray-600">{label}</div>
                    <div className="mt-1 text-xs text-gray-800">
                      <NFTAssetCost className="!text-xs !text-gray-900" />
                    </div>
                    <div className="mt-1">
                      <NFTMintButton className="!px-3 !py-1.5 !text-xs !rounded-lg !bg-[#0052FF] !text-white" />
                    </div>
                  </div>
                </div>
              </NFTMintCard>
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}


