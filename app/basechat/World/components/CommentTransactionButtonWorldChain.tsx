'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { 
  WORLD_CHAIN_ID, 
  worldChain 
} from '../config/WorldChainNetworkConfig';
import { 
  WORLD_CHAIN_POST_CONTRACT_ABI, 
  getWorldChainContractAddress 
} from '../contracts/WorldChainPostContract';

interface CommentTransactionButtonWorldChainProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onCommentAdded?: () => Promise<void>;
}

export default function CommentTransactionButtonWorldChain({
  content,
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onCommentAdded
}: CommentTransactionButtonWorldChainProps) {
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

  const isWorldChainNetwork = chainId === WORLD_CHAIN_ID;
  const contractAddress = getWorldChainContractAddress(chainId);

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
      toast.loading('Preparing World Chain comment...');

      if (!isWorldChainNetwork) {
        try {
          await switchChain({ chainId: WORLD_CHAIN_ID });
          toast.success('Switched to World Chain network');
        } catch (switchError) {
          console.error('Failed to switch network:', switchError);
          toast.error('Please switch to World Chain network manually');
          setIsTransacting(false);
          setRequestDenied(true);
          return;
        }
      }

      if (!contractAddress) {
        toast.error('World Chain contract not deployed yet');
        setIsTransacting(false);
        return;
      }

      const formattedAddress = contractAddress.startsWith('0x') 
        ? contractAddress as `0x${string}` 
        : `0x${contractAddress}` as `0x${string}`;

      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: WORLD_CHAIN_POST_CONTRACT_ABI,
        functionName: 'createPost',
        args: [`comment:${content}`],
        account: address,
        chain: worldChain,
      });

      const txHash = await walletClient.writeContract({
        ...request,
        chain: worldChain,
      });
      
      toast.success('Comment transaction sent!');
      console.log('Comment transaction hash:', txHash);
      
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
    isWorldChainNetwork, 
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
      window.open(`https://worldscan.org/tx/${transactionHash}`, '_blank');
      
      setTimeout(() => {
        setTransactionHash(null);
        setIsViewingExplorer(false);
      }, 2000);
    }
  }, [transactionHash]);

  if (transactionHash) {
    return (
      <button 
        className={`px-3 py-2 sm:px-4 sm:py-2 ${isViewingExplorer ? 'bg-gray-400' : 'bg-green-500'} text-white rounded-lg hover:bg-green-600 text-xs sm:text-sm`}
        onClick={() => {
          openTransactionInExplorer();
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
        className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center transition-colors ${
          isWorldChainNetwork 
            ? 'bg-white text-black hover:bg-gray-50 border border-black' 
            : 'bg-gray-700 text-white hover:bg-gray-600'
        } ${disabled || isTransacting || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="flex items-center justify-center">
          {isTransacting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="hidden xs:inline">Processing...</span>
              <span className="inline xs:hidden">...</span>
            </>
          ) : (
            <>
              <img 
                src="/logotypy/logo-symbol.svg"
                alt="World Chain"
                className="w-4 h-4 mr-1.5"
              />
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

