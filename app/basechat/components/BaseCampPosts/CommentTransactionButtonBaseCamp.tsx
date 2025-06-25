'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { BASECAMP_CHAIN_ID, BASECAMP_POST_CONTRACT_ABI, getBaseCampContractAddress, baseCampChain } from '../../../contracts/BaseCampPostContract';

interface CommentTransactionButtonBaseCampProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onCommentAdded?: () => Promise<void>;
}

export default function CommentTransactionButtonBaseCamp({
  content,
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onCommentAdded
}: CommentTransactionButtonBaseCampProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);
  const [requestDenied, setRequestDenied] = useState(false);
  const requestDeniedTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if we're on BaseCamp network
  const isBaseCampNetwork = chainId === BASECAMP_CHAIN_ID;
  
  // Get contract address
  const contractAddress = getBaseCampContractAddress();

  // Auto-hide "Request denied" message after 5 seconds
  useEffect(() => {
    if (requestDenied) {
      if (requestDeniedTimerRef.current) {
        clearTimeout(requestDeniedTimerRef.current);
      }
      
      requestDeniedTimerRef.current = setTimeout(() => {
        setRequestDenied(false);
      }, 5000);
    }
    
    return () => {
      if (requestDeniedTimerRef.current) {
        clearTimeout(requestDeniedTimerRef.current);
      }
    };
  }, [requestDenied]);

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
      toast.loading('Preparing BaseCamp comment...');

      // If not on BaseCamp network, try to switch
      if (!isBaseCampNetwork) {
        try {
          await switchChain({ chainId: BASECAMP_CHAIN_ID });
          toast.success('Switched to BaseCamp network');
        } catch (switchError) {
          console.error('Failed to switch network:', switchError);
          toast.error('Please switch to BaseCamp network manually');
          setIsTransacting(false);
          setRequestDenied(true);
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
        args: [`comment:${content}`], // Prefix with 'comment:' to identify it as a comment
        account: address,
        chain: baseCampChain, // Use the imported baseCampChain object
      });

      // Send transaction using wallet client with explicit chain
      const txHash = await walletClient.writeContract({
        ...request,
        chain: baseCampChain, // Use the imported baseCampChain object
      });
      
      toast.success('Comment transaction sent!');
      console.log('Comment transaction hash:', txHash);
      
      // Set transaction hash and call success handler
      setTransactionHash(txHash);
      
      if (autoPost) {
        toast.success('Automatically saving comment to database...');
        onTransactionSuccess(txHash);
        if (onCommentAdded) {
          await onCommentAdded();
        }
      } else {
        toast.success('Comment transaction confirmed! Click to save your comment.');
        onTransactionSuccess(txHash);
      }
      
    } catch (error) {
      console.error('Comment transaction error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        setRequestDenied(true);
      }
      
      toast.error(`Comment transaction failed: ${errorMessage}`);
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
    onCommentAdded,
    autoPost
  ]);

  const openTransactionInExplorer = useCallback(() => {
    if (transactionHash) {
      setIsViewingExplorer(true);
      window.open(`https://basecamp.cloud.blockscout.com/tx/${transactionHash}`, '_blank');
      
      // Reset after a delay so users can make another comment
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
        className={`px-3 py-2 sm:px-4 sm:py-2 ${isViewingExplorer ? 'bg-orange-400' : 'bg-green-500'} text-white rounded-lg hover:bg-green-600 text-xs sm:text-sm`}
        onClick={() => {
          openTransactionInExplorer();
          // Call onCommentAdded even when clicking the explorer button
          if (onCommentAdded && !isViewingExplorer) {
            onCommentAdded().catch(error => 
              console.error('Error refreshing posts after viewing explorer:', error)
            );
          }
        }}
      >
        <span className="flex items-center justify-center">
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="hidden xs:inline">Saved</span>
          <span className="inline xs:hidden">Saved</span>
        </span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleSendTransaction}
        disabled={disabled || !content.trim() || isTransacting}
        className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-white text-xs sm:text-sm flex items-center transition-colors ${
          isBaseCampNetwork 
            ? 'bg-orange-500 hover:bg-orange-600' 
            : 'bg-yellow-500 hover:bg-yellow-600'
        } ${disabled || isTransacting || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="flex items-center justify-center">
          {isTransacting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="hidden xs:inline">Processing...</span>
              <span className="inline xs:hidden">...</span>
            </>
          ) : (
            <>
              {/* Camp logo - Orange flame symbol in a C shape */}
              <svg 
                className="w-4 h-4 mr-1.5"
                viewBox="0 0 600 600"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M300 0C134.3 0 0 134.3 0 300s134.3 300 300 300 300-134.3 300-300S465.7 0 300 0z" fill="#000"/>
                <path d="M300 100c-110.5 0-200 89.5-200 200s89.5 200 200 200 200-89.5 200-200-89.5-200-200-200z" fill="#fff"/>
                <path d="M330 190c0 0-30 40-10 80 20 40 20 90-20 120 0 0 70-30 70-100 0-70-40-100-40-100z" fill="#FF6B00"/>
                <path d="M270 230c0 0-20 30-10 60 10 30 10 60-30 80 0 0 60-10 60-60 0-50-20-80-20-80z" fill="#FF6B00"/>
              </svg>
              <span className="hidden xs:inline">Comment</span>
              <span className="inline xs:hidden">Comment</span>
            </>
          )}
        </span>
      </button>
      
      <div className={`absolute top-full left-0 right-0 mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs text-center transition-opacity duration-300 ${requestDenied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        Request denied.
      </div>
    </div>
  );
} 