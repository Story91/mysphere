'use client';

import React, { useState } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { uploadToIPFS } from './upload';
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions';
import { wagmiConfig } from '../../providers';

interface SimpleMintProps {
  image: File | null;
  ipName?: string;
  ipDescription?: string;
}

// Standard ERC721 ABI for minting
const NFT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "string", name: "uri", type: "string" }
    ],
    name: "mintTo",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" }
    ],
    name: "safeMint",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// Camp Network NFT contract address from example
const NFT_CONTRACT_ADDRESS = "0xf90733b9ecda3b49c250b2c3e3e42c96fc93324e" as const;

export default function SimpleMint({ 
  image, 
  ipName = "My NFT",
  ipDescription = "Created on Camp Network"
}: SimpleMintProps) {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [isMinting, setIsMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleMint = async () => {
    if (!image || !address || !walletClient) {
      console.error("Missing required data for minting");
      setError("Please connect wallet and select an image");
      return;
    }

    setIsMinting(true);
    setError(null);
    setTxHash(null);
    
    try {
      console.log("📤 Uploading to IPFS...");
      const ipfsUrl = await uploadToIPFS(image);
      console.log("✅ IPFS URL:", ipfsUrl);

      // Create metadata
      const metadata = {
        name: ipName,
        description: ipDescription,
        image: ipfsUrl,
        attributes: [
          {
            trait_type: "Type",
            value: image.type || "File",
          },
          {
            trait_type: "File Size",
            value: `${(image.size / (1024 * 1024)).toFixed(2)}MB`,
          },
        ],
      };

      // Upload metadata to IPFS
      const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
      const metadataFile = new File([metadataBlob], 'metadata.json', { type: 'application/json' });
      const metadataUrl = await uploadToIPFS(metadataFile);
      console.log("✅ Metadata URL:", metadataUrl);

      console.log("🔨 Minting NFT...");
      
      // Try to mint using wagmi writeContract
      try {
        const hash = await writeContract(wagmiConfig, {
          abi: NFT_ABI,
          address: NFT_CONTRACT_ADDRESS,
          functionName: 'mintTo',
          args: [address, metadataUrl],
        });
        
        setTxHash(hash);
        console.log("✅ Transaction hash:", hash);
        console.log("🎉 NFT minted successfully!");
      } catch (mintError: any) {
        // If mintTo fails, try safeMint
        console.log("mintTo failed, trying safeMint...");
        const hash = await writeContract(wagmiConfig, {
          abi: NFT_ABI,
          address: NFT_CONTRACT_ADDRESS,
          functionName: 'safeMint',
          args: [address],
        });
        
        setTxHash(hash);
        console.log("✅ Transaction hash:", hash);
        console.log("🎉 NFT minted successfully!");
      }
      
    } catch (error: any) {
      console.error("❌ Minting failed:", error);
      setError(error.message || "Failed to mint NFT");
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Alternative Mint Button */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-orange-800 mb-2">
          Alternative Minting (Direct Contract)
        </h3>
        <p className="text-sm text-orange-600 mb-4">
          If Origin SDK doesn't work, try this direct contract method
        </p>
        
        <button
          onClick={handleMint}
          disabled={!image || !isConnected || isMinting}
          className={`
            w-full px-6 py-3 rounded-lg font-medium transition-all
            ${!image || !isConnected || isMinting
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-orange-600 text-white hover:bg-orange-700 transform hover:scale-105'
            }
          `}
        >
          {isMinting ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Minting...
            </div>
          ) : (
            "Mint with Direct Contract"
          )}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Success Display */}
      {txHash && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-green-800 font-semibold mb-2">Success!</h3>
          <p className="text-green-600 text-sm mb-2">Transaction Hash:</p>
          <p className="text-xs font-mono break-all bg-white p-2 rounded">{txHash}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(txHash)}
              className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
            >
              Copy Hash
            </button>
            <a
                              href={`https://camp.cloud.blockscout.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
            >
              View on Explorer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
