import React, { useState, useEffect } from 'react';
import { useAuth } from "@campnetwork/origin/react";
import type { Address } from "viem/accounts";
import { uploadToIPFS } from './upload';
import { useWalletClient, useAccount } from 'wagmi';
import { createPublicClient, http } from 'viem';
import { baseCampChain } from '../../contracts/BaseCampPostContract';

interface MintButtonProps {
  image: File | null;  // Can be any file type, not just image
  address: string | undefined;
  ipName?: string;
  ipDescription?: string;
}

type LicenseTerms = {
  price: bigint;
  duration: number;
  royaltyBps: number;
  paymentToken: Address;
};

export default function MintButton({ 
  image, 
  address, 
  ipName = "My IP NFT",
  ipDescription = "Uploaded via Origin SDK"
}: MintButtonProps) {
  const auth = useAuth();
  const { origin } = auth;
  const [isRegistering, setIsRegistering] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const { data: walletClient } = useWalletClient();
  const { isConnected } = useAccount();

  // Set up provider when wallet client is available - only once
  useEffect(() => {
    if (!walletClient || !auth || !origin) return;
    
    // Check if provider is already set to avoid infinite loop
    if ((auth as any).provider) {
      console.log("Provider already set, skipping setup");
      return;
    }
    
    console.log("Setting up walletClient for Origin SDK");
    try {
      // Try to set the wallet client as provider
      if (typeof (auth as any).setProvider === 'function') {
        (auth as any).setProvider({ 
          provider: walletClient, 
          info: { name: 'WagmiWalletClient' } 
        });
        console.log("Provider set successfully");
      }
      
      // Also try setting viem client directly on origin
      if (typeof origin.setViemClient === 'function') {
        origin.setViemClient(walletClient);
        console.log("Viem client set on origin");
      }
    } catch (error) {
      console.error("Error setting provider:", error);
    }
  }, [walletClient?.account?.address]); // Only re-run when wallet account changes, not on every render

  const handleRegisterIP = async () => {
    if (!image || !address || !origin) {
      console.error("Missing required data for registration");
      return;
    }

    // Check if wallet is connected
    if (!auth.walletAddress) {
      console.error("Wallet not connected. Please connect your wallet first.");
      return;
    }
    console.log("Wallet connected:", auth.walletAddress);
    console.log("Auth state:", {
      hasAuth: !!auth,
      hasOrigin: !!origin,
      hasJwt: !!(auth as any).jwt,
      provider: (auth as any).provider,
      walletAddress: auth.walletAddress,
      hasWalletClient: !!walletClient,
      isConnected
    });

    // Check if Origin is properly initialized
    if (!origin) {
      console.error("Origin SDK not initialized. Please try reconnecting your wallet.");
      return;
    }

    setIsRegistering(true);
    
    try {
      // Ensure provider is set for Origin SDK
      if (!walletClient && typeof window !== 'undefined' && (window as any).ethereum) {
        console.log("No walletClient, trying window.ethereum...");
        (auth as any).setProvider?.({ 
          provider: (window as any).ethereum, 
          info: { name: 'Injected' } 
        });
      } else if (walletClient && !(auth as any).provider) {
        console.log("Setting walletClient as provider for Origin SDK...");
        (auth as any).setProvider?.({ 
          provider: walletClient, 
          info: { name: 'WagmiWalletClient' } 
        });
      }

      // Try to connect if no JWT
      if (!(auth as any).jwt) {
        console.log("No JWT found, attempting to connect...");
        try {
          await (auth as any).connect?.();
        } catch (connectError) {
          console.error("Failed to connect:", connectError);
        }
      }

      let ipfsUrl = "";
      try {
        ipfsUrl = await uploadToIPFS(image);
      } catch (error) {
        return; 
      }

      console.log("Fetching file from IPFS:", ipfsUrl);
      const response = await fetch(ipfsUrl);
      const blob = await response.blob();
      const file = new File([blob], image.name, { type: image.type });

      // Check file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 10) {
        console.error(`File too large for registration. Size=${fileSizeMB.toFixed(2)}MB, max=10MB`);
        return;
      }

      // Define license terms - simplified to avoid BigInt serialization issues
      const license = {
        price: 0, // Using number instead of BigInt
        duration: 0, // No duration limit
        royaltyBps: 0,
        paymentToken: "0x0000000000000000000000000000000000000000" as Address,
      } as any;

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
            value: `${fileSizeMB.toFixed(2)}MB`,
          },
        ],
      };

      console.log("Starting IP registration...", {
        fileSize: fileSizeMB.toFixed(2) + "MB",
        walletAddress: address,
        hasOrigin: !!origin,
        fileName: file.name,
        fileType: file.type,
        hasJwt: !!(auth as any).jwt,
        provider: (auth as any).provider,
        hasWalletClient: !!walletClient
      });

      // Check viem client
      if (origin && typeof origin.setViemClient === 'function') {
        const viemClient = walletClient || (auth as any).viem || (auth as any).viemClient;
        if (viemClient) {
          console.log("Setting viem client for Origin SDK", viemClient);
          origin.setViemClient(viemClient);
        } else {
          // Create a public client as fallback
          console.log("Creating public client for Origin SDK");
          const publicClient = createPublicClient({
            chain: baseCampChain,
            transport: http('https://rpc.basecamp.t.raas.gelato.cloud')
          });
          origin.setViemClient(publicClient);
        }
      }

      // Register IP using Origin SDK
      console.log("Calling origin.mintFile with:", { file, metadata, license });
      const result = await origin.mintFile(file, metadata, license);
      setSuccess(result);
 
      console.log("IP registration successful! Your NFT is now live.");
      console.log("IP registration successful! Your NFT is now live.");

      
    } catch (error) {
      console.error("IP registration failed:", error);
      
      // Provide specific error messages
      let errorMessage = "IP registration failed. Please try again later.";
      let errorDescription = error instanceof Error ? error.message : "An error occurred";
      
      if (errorDescription.includes("signature") || errorDescription.includes("Failed to get signature")) {
        errorMessage = "Transaction signature failed.";
        errorDescription = "Please check your wallet connection and approve the transaction when prompted.";
      } else if (errorDescription.includes("network")) {
        errorMessage = "Network error. Please check your connection.";
        errorDescription = "Make sure you're connected to the correct network.";
      } else if (errorDescription.includes("gas")) {
        errorMessage = "Insufficient gas fees.";
        errorDescription = "Please ensure you have enough gas for the transaction.";
      } else if (errorDescription.includes("user rejected") || errorDescription.includes("User rejected")) {
        errorMessage = "Transaction was rejected.";
        errorDescription = "You declined the transaction. Please try again and approve when prompted.";
      }
      
      console.error(errorMessage, errorDescription);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="w-full">
      <button
        disabled={!image || !address || isRegistering || !ipName?.trim()}
        onClick={handleRegisterIP}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-lg font-medium shadow-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
      >
        {isRegistering ? (
          <div className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {isRegistering ? "Registering IP..." : "Minting..."}
          </div>
        ) : (
          "Register IP"
        )}
      </button>
      
      {/* Transaction Hash Display */}
      {success && (
        <div className="w-full bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-800 font-medium">IP registration successful! Your NFT is now live.</span>
          </div>
        </div>
      )}
    </div>
  );
} 