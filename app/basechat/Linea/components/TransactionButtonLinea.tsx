'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { 
  LINEA_CHAIN_ID, 
  lineaChain 
} from '../config/LineaNetworkConfig';
import { 
  LINEA_POST_CONTRACT_ABI, 
  getLineaContractAddress 
} from '../contracts/LineaPostContract';

interface TransactionButtonLineaProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
}

export default function TransactionButtonLinea({ 
  content, 
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onPostAdded
}: TransactionButtonLineaProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);

  // Check if we're on Linea network
  const isLineaNetwork = chainId === LINEA_CHAIN_ID;
  
  // Get contract address
  const contractAddress = getLineaContractAddress(chainId);

  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || disabled || isTransacting) {
      return;
    }

    // If not on Linea network, only switch network (don't post)
    if (!isLineaNetwork) {
      try {
        setIsTransacting(true);
        await switchChain({ chainId: LINEA_CHAIN_ID });
        toast.success('Switched to Linea Network! Now you can post.');
        setIsTransacting(false);
        return; // Exit here - just switch, don't post
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        toast.error('Please switch to Linea Network manually');
        setIsTransacting(false);
        return;
      }
    }

    // Only post if we're on Linea network AND have content
    if (!content.trim()) {
      return;
    }

    if (!contractAddress) {
      toast.error('Linea contract not deployed yet');
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    try {
      setIsTransacting(true);
      toast.loading('Preparing transaction on Linea...');

      // Ensure the contract address has the correct format
      const formattedAddress = contractAddress.startsWith('0x') 
        ? contractAddress as `0x${string}` 
        : `0x${contractAddress}` as `0x${string}`;

      // Prepare transaction request using public client for the Linea chain specifically
      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: LINEA_POST_CONTRACT_ABI,
        functionName: 'createPost',
        args: [content],
        account: address,
        chain: lineaChain, // Use the imported lineaChain object
      });

      // Send transaction using wallet client with explicit chain
      const txHash = await walletClient.writeContract({
        ...request,
        chain: lineaChain, // Use the imported lineaChain object
      });
      
      toast.success('Transaction sent on Linea!');
      console.log('Linea transaction hash:', txHash);
      
      // Set transaction hash and call success handler
      setTransactionHash(txHash);
      handleTransactionSuccess(txHash);
      
    } catch (error) {
      console.error('Linea transaction error:', error);
      toast.error('Transaction failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsTransacting(false);
    }
  }, [
    isConnected, 
    address, 
    content, 
    disabled, 
    isTransacting, 
    isLineaNetwork, 
    switchChain,
    contractAddress,
    walletClient,
    publicClient,
    onTransactionSuccess,
    onPostAdded
  ]);

  const handleTransactionSuccess = async (txHash: string) => {
    // Save hash in localStorage to prevent duplicate triggers
    localStorage.setItem('lastLineaTxHash', txHash);
    
    console.log('Linea transaction successful with hash:', txHash);
    
    // Fire the callback with txHash
    onTransactionSuccess(txHash);
    
    // Refresh feed
    if (onPostAdded) {
      try {
        await onPostAdded();
      } catch (error) {
        console.error('Error refreshing posts after Linea transaction:', error);
      }
    }
  };

  const openTransactionInExplorer = useCallback(() => {
    if (transactionHash) {
      setIsViewingExplorer(true);
      window.open(`https://lineascan.build/tx/${transactionHash}`, '_blank');
      
      // Reset after a delay so users can make another post
      setTimeout(() => {
        setTransactionHash(null);
        setIsViewingExplorer(false);
      }, 2000);
    }
  }, [transactionHash]);

  // If transaction is completed and we have a hash, show the success view
  if (transactionHash) {
    return (
      <button 
        className={`px-4 py-2 ${isViewingExplorer ? 'bg-blue-500' : 'bg-green-500'} text-white rounded-lg hover:bg-green-600 transition-colors`}
        onClick={() => {
          openTransactionInExplorer();
          // Call onPostAdded even when clicking the explorer button
          if (onPostAdded && !isViewingExplorer) {
            onPostAdded().catch(error => 
              console.error('Error refreshing posts after viewing explorer:', error)
            );
          }
        }}
      >
        {isViewingExplorer ? 'Transaction Sent!' : 'View on Lineascan'}
      </button>
    );
  }

  return (
    <button
      className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
        isLineaNetwork 
          ? 'bg-black text-white hover:bg-gray-800' 
          : 'bg-gray-700 text-white hover:bg-gray-600'
      } ${disabled || isTransacting ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleSendTransaction}
      disabled={disabled || isTransacting}
    >
      {isTransacting ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Processing...</span>
        </>
      ) : (
        <>
          {/* Linea logo */}
          <img 
            src="/Logomark Blue BG.svg" 
            alt="Linea" 
            className="w-5 h-5 mr-1.5"
          />
          {isLineaNetwork ? 'Post to Linea Network' : 'Switch To Linea'}
        </>
      )}
    </button>
  );
}