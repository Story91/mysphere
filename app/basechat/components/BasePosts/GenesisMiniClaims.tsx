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
        className="mt-4 mb-4"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium text-black">Claim your Sphere Genesis NFTs</div>
          <button
            onClick={handleDismiss}
            className="px-2 py-0.5 text-[11px] font-semibold text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {GENESIS_CONTRACTS.map(({ address, label }) => (
            <NFTMintCard 
              key={address}
              contractAddress={address}
              className="bg-white border border-gray-200 rounded-xl p-2 flex flex-col items-center text-center"
            >
              {/* Name above preview */}
              <NFTCollectionTitle className="text-xs font-semibold text-black mb-1 truncate max-w-[110px]" />
              {/* Square preview only; disable interactions */}
              <div className="rounded-lg overflow-hidden border border-gray-200">
                <NFTMedia square className="w-[84px] h-[84px] object-cover pointer-events-none select-none" />
              </div>
              {/* Price - one centered compact line */}
              <div className="mt-1 w-full flex justify-center">
                <NFTAssetCost className="!text-[9px] !text-gray-900 !whitespace-nowrap !tracking-tighter text-center" />
              </div>
              {/* Small Mint button under */}
              <NFTMintButton className="!mt-1.5 !px-2.5 !py-1 !text-[11px] !rounded-md !bg-[#0052FF] !text-white !w-auto" />
            </NFTMintCard>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}


