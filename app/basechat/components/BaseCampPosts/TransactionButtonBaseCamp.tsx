'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { BASECAMP_CHAIN_ID, BASECAMP_POST_CONTRACT_ABI, getBaseCampContractAddress, baseCampChain } from '../../../contracts/BaseCampPostContract';
import Image from 'next/image';

interface TransactionButtonBaseCampProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
}

export default function TransactionButtonBaseCamp({ 
  content, 
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onPostAdded
}: TransactionButtonBaseCampProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);

  // Check if we're on BaseCamp network
  const isBaseCampNetwork = chainId === BASECAMP_CHAIN_ID;
  
  // Get contract address
  const contractAddress = getBaseCampContractAddress();

  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || disabled || isTransacting) {
      return;
    }

    // If not on BaseCamp network, only switch network (don't post)
    if (!isBaseCampNetwork) {
      try {
        setIsTransacting(true);
        await switchChain({ chainId: BASECAMP_CHAIN_ID });
        toast.success('Switched to Camp Network! Now you can post.');
        setIsTransacting(false);
        return; // Exit here - just switch, don't post
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        toast.error('Please switch to Camp Network manually');
        setIsTransacting(false);
        return;
      }
    }

    // Only post if we're on BaseCamp network AND have content
    if (!content.trim()) {
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    try {
      setIsTransacting(true);
      toast.loading('Preparing transaction...');

      // Ensure the contract address has the correct format
      const formattedAddress = contractAddress.startsWith('0x') 
        ? contractAddress as `0x${string}` 
        : `0x${contractAddress}` as `0x${string}`;

      // Prepare transaction request using public client for the BaseCamp chain specifically
      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: BASECAMP_POST_CONTRACT_ABI,
        functionName: 'createPost',
        args: [content],
        account: address,
        chain: baseCampChain, // Use the imported baseCampChain object
      });

      // Send transaction using wallet client with explicit chain
      const txHash = await walletClient.writeContract({
        ...request,
        chain: baseCampChain, // Use the imported baseCampChain object
      });
      
      toast.success('Transaction sent!');
      console.log('Transaction hash:', txHash);
      
      // Set transaction hash and call success handler
      setTransactionHash(txHash);
      handleTransactionSuccess(txHash);
      
    } catch (error) {
      console.error('Transaction error:', error);
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
    isBaseCampNetwork, 
    switchChain,
    contractAddress,
    walletClient,
    publicClient,
    onTransactionSuccess,
    onPostAdded
  ]);

  const handleTransactionSuccess = async (txHash: string) => {
    // Save hash in localStorage to prevent duplicate triggers
    localStorage.setItem('lastBaseCampTxHash', txHash);
    
    console.log('Transaction successful with hash:', txHash);
    
    // Fire the callback with txHash
    onTransactionSuccess(txHash);
    
    // Refresh feed
    if (onPostAdded) {
      try {
        await onPostAdded();
      } catch (error) {
        console.error('Error refreshing posts after BaseCamp transaction:', error);
      }
    }
  };

  const openTransactionInExplorer = useCallback(() => {
    if (transactionHash) {
      setIsViewingExplorer(true);
              window.open(`https://camp.cloud.blockscout.com/tx/${transactionHash}`, '_blank');
      
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
        {isViewingExplorer ? 'Transaction Sent!' : 'View on Explorer'}
      </button>
    );
  }

  return (
    <button
      className={`flex items-center justify-center px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg transition-all duration-300 font-medium text-xs sm:text-sm h-[32px] ${
        isBaseCampNetwork 
          ? 'bg-orange-500 text-white border border-black hover:bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.4)]' 
          : 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600'
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
          <span className="leading-tight">Processing...</span>
        </>
      ) : (
        <>
          <div className="bg-white rounded-full p-1 mr-1">
            <Image src="/Camp.png" alt="Camp" width={14} height={14} />
          </div>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </>
      )}
    </button>
  );
} 