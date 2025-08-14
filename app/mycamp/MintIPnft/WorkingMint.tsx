'use client';

import React, { useState } from 'react';
import { useAccount } from 'wagmi';
import { writeContract } from 'wagmi/actions';
import { wagmiConfig } from '../../providers';

interface WorkingMintProps {
  image: File | null;
  ipName?: string;
  ipDescription?: string;
}

// EXACT SAME ABI from working example
const ABI = [
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "string", name: "uri", type: "string" }
    ],
    name: "mintTo",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  }
];

// EXACT SAME upload function from working example
async function uploadFileToIPFS(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  // Use our PINATA JWT env variable
  const PINATA_JWT = process.env.NEXT_PUBLIC_PINATA_JWT || process.env.NEXT_PUBLIC_PINATA_JWT_TOKEN;
  
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }

  const result = await response.json();
  return `ipfs://${result.IpfsHash}/${file.name}`;
}

// EXACT SAME mint function from working example
async function mintNFT(to: `0x${string}`, uri: string) {
  return await writeContract(wagmiConfig, {
    abi: ABI,
    address: '0xf90733b9ecda3b49c250b2c3e3e42c96fc93324e' as `0x${string}`, // Contract from working example
    functionName: 'mintTo',
    args: [to, uri],
  });
}

export default function WorkingMint({ 
  image, 
  ipName = "My NFT",
  ipDescription = "Created on Camp Network"
}: WorkingMintProps) {
  const { address } = useAccount();
  const [minting, setMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  // EXACT SAME handler from working example
  async function handleMint() {
    if (!address || !image) return;

    setMinting(true);
    setTxHash(null);
    try {
      const uri = await uploadFileToIPFS(image);
      const result = await mintNFT(address, uri);
      setTxHash(result);
      alert("Minted successfully!");
    } catch (err) {
      console.error(err);
      alert("Mint failed.");
    } finally {
      setMinting(false);
    }
  }

  return (
    <div className="w-full">
      {/* EXACT SAME button from working example */}
      <button
        disabled={!image || !address || minting}
        onClick={handleMint}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-lg font-medium shadow-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
      >
        {minting ? (
          <div className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Minting...
          </div>
        ) : (
          "Mint NFT"
        )}
      </button>

      {/* Transaction Hash Display */}
      {txHash && (
        <div className="w-full bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <h3 className="text-lg font-medium text-green-800">Minting Successful!</h3>
          </div>
          <p className="text-sm text-green-700 mb-3">Your NFT has been minted successfully. Here's your transaction hash:</p>
          <div className="bg-white border border-green-200 rounded p-3">
            <p className="text-xs font-mono text-green-800 break-all">{txHash}</p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(txHash)}
              className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 transition-colors"
            >
              Copy Hash
            </button>
            <a
              href={`https://basecamp.cloud.blockscout.com/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition-colors"
            >
              View on Blockscout
            </a>
          </div>
        </div>
      )}

      {/* Status messages */}
      {!address && (
        <div className="text-center text-orange-600 bg-orange-50 p-3 rounded-lg mt-4">
          Please connect your wallet to mint an NFT
        </div>
      )}
    </div>
  );
}
