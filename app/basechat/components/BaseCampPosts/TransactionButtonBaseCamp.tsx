'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { BASECAMP_CHAIN_ID, BASECAMP_POST_CONTRACT_ABI, getBaseCampContractAddress, baseCampChain } from '../../../contracts/BaseCampPostContract';

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
    if (!isConnected || !address || !content.trim() || disabled || isTransacting) {
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    try {
      setIsTransacting(true);
      toast.loading('Preparing transaction...');

      // If not on BaseCamp network, try to switch
      if (!isBaseCampNetwork) {
        try {
          await switchChain({ chainId: BASECAMP_CHAIN_ID });
          toast.success('Switched to Camp Network network');
        } catch (switchError) {
          console.error('Failed to switch network:', switchError);
          toast.error('Please switch to Camp Network network manually');
          setIsTransacting(false);
          return;
        }
      }

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
      window.open(`https://basecamp.cloud.blockscout.com/tx/${transactionHash}`, '_blank');
      
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
      className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
        isBaseCampNetwork 
          ? 'bg-orange-500 text-white hover:bg-orange-600' 
          : 'bg-yellow-500 text-white hover:bg-yellow-600'
      } ${disabled || isTransacting ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleSendTransaction}
      disabled={disabled || isTransacting || !content.trim()}
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
          {/* Camp logo - Orange flame symbol in a C shape */}
          <svg 
            className="w-5 h-5 mr-1.5"
            viewBox="0 0 600 600"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M300 0C134.3 0 0 134.3 0 300s134.3 300 300 300 300-134.3 300-300S465.7 0 300 0z" fill="#000"/>
            <path d="M300 100c-110.5 0-200 89.5-200 200s89.5 200 200 200 200-89.5 200-200-89.5-200-200-200z" fill="#fff"/>
            <path d="M330 190c0 0-30 40-10 80 20 40 20 90-20 120 0 0 70-30 70-100 0-70-40-100-40-100z" fill="#FF6B00"/>
            <path d="M270 230c0 0-20 30-10 60 10 30 10 60-30 80 0 0 60-10 60-60 0-50-20-80-20-80z" fill="#FF6B00"/>
          </svg>
          {isBaseCampNetwork ? 'Post to Camp Network' : 'Switch to Camp Network & Post'}
        </>
      )}
    </button>
  );
} 