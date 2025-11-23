'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { toast } from 'react-hot-toast';
import { getContractAddress2 } from '../contracts/PostContract2';

interface TransactionButtonProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
}

export default function TransactionButton({
  content,
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onPostAdded
}: TransactionButtonProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [requestDenied, setRequestDenied] = useState(false);
  const requestDeniedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get contract address based on current chain
  const contractAddress = getContractAddress2(chainId);

  // Check if we're on Base network
  const isBaseNetwork = chainId === base.id || chainId === baseSepolia.id;

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

  // Auto-hide success message after 6 seconds
  useEffect(() => {
    if (transactionSuccess) {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }

      successTimerRef.current = setTimeout(() => {
        setTransactionSuccess(false);
        setTransactionHash(null);
      }, 6000);
    }

    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, [transactionSuccess]);

  // Function to handle sending transaction via wagmi
  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || disabled || isTransacting) {
      return;
    }

    // If not on Base network, only switch network (don't post)
    if (!isBaseNetwork) {
      try {
        setIsTransacting(true);
        await switchChain({ chainId: base.id });
        toast.success('Switched to Base Network! Now you can post.');
        setIsTransacting(false);
        return; // Exit here - just switch, don't post
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        toast.error('Please switch to Base Network manually');
        setIsTransacting(false);
        return;
      }
    }

    // Only post if we're on Base network AND have content
    if (!content.trim()) {
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    try {
      setIsTransacting(true);
      toast.loading('Preparing post transaction...');

      // Check if contract address is available
      if (!contractAddress) {
        throw new Error('Contract address is undefined');
      }

      // Ensure the contract address has the correct format
      const formattedAddress = contractAddress.startsWith('0x')
        ? contractAddress as `0x${string}`
        : `0x${contractAddress}` as `0x${string}`;

      // Prepare a basic contract write for PostContract2
      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        // PostContract2 ABI simplified for the createPost function
        abi: [{
          name: 'createPost',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [{ name: 'content', type: 'string' }],
          outputs: []
        }],
        functionName: 'createPost',
        args: [`post:${content}`],
        account: address,
      });

      // Send transaction using wallet client
      const hash = await walletClient.writeContract(request);

      toast.success('Post transaction sent!');
      console.log('Post transaction hash:', hash);

      // Set transaction hash and call success handler
      setTransactionHash(hash);
        setTransactionSuccess(true);

        if (autoPost) {
          toast.success('Automatically saving post to database...');
        onTransactionSuccess(hash);
          if (onPostAdded) {
          await onPostAdded();
          }
        } else {
        toast.success('Post transaction confirmed! Click to save your post.');
        onTransactionSuccess(hash);
        }

    } catch (error) {
      console.error('Post transaction error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        setRequestDenied(true);
      }

      toast.error(`Post transaction failed: ${errorMessage}`);
    } finally {
      setIsTransacting(false);
    }
  }, [
    isConnected,
    address,
    content,
    disabled,
    isTransacting,
    chainId,
    isBaseNetwork,
    switchChain,
    contractAddress,
    walletClient,
    publicClient,
    onTransactionSuccess,
    onPostAdded,
    autoPost
  ]);

  // Function to open transaction in explorer
  const openTransactionInExplorer = () => {
    if (transactionHash) {
      const baseUrl = chainId === base.id
        ? 'https://basescan.org/tx/'
        : 'https://sepolia.basescan.org/tx/';
      window.open(`${baseUrl}${transactionHash}`, '_blank');
    }
  };

  return (
    <div className="relative">
      {!transactionSuccess ? (
        <button
          onClick={handleSendTransaction}
          disabled={disabled || isTransacting || (isBaseNetwork && !content.trim())}
          className={`px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg transition-all duration-300 font-medium relative overflow-hidden text-xs sm:text-sm h-[32px] flex items-center justify-center ${
            isBaseNetwork 
              ? 'bg-white text-[#0052FF] border border-black hover:bg-gray-50' 
              : 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600'
          } ${disabled || isTransacting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="flex items-center justify-center">
            {isTransacting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#0052FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="hidden xs:inline">Processing...</span>
                <span className="inline xs:hidden">...</span>
              </>
            ) : (
              <>
                <img
                  src="/logotypy/Base_square_blue.png"
                  alt="Base Logo"
                  className="w-4 h-4 mr-1"
                />
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </>
            )}
          </span>
        </button>
      ) : (
        <button
          onClick={openTransactionInExplorer}
          className="px-3 py-2 sm:px-4 sm:py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs sm:text-sm"
        >
          <span className="flex items-center justify-center">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="hidden xs:inline">Saved</span>
            <span className="inline xs:hidden">Saved</span>
          </span>
        </button>
      )}
      
      {/* Komunikat o odrzuceniu żądania */}
      <div className={`absolute top-full left-0 right-0 mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs text-center transition-opacity duration-300 ${requestDenied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        Request denied.
      </div>
      
      {/* Zakomentowana pulsująca animacja tła */}
      {/* <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/20 to-transparent opacity-50 animate-pulse pointer-events-none"></div> */}

    </div>
  );
} 