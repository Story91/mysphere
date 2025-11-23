'use client';

import { useState, useCallback } from 'react';
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

interface TransactionButtonWorldChainProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
}

export default function TransactionButtonWorldChain({ 
  content, 
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onPostAdded
}: TransactionButtonWorldChainProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);

  const isWorldChainNetwork = chainId === WORLD_CHAIN_ID;
  const contractAddress = getWorldChainContractAddress(chainId);

  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || disabled || isTransacting) {
      return;
    }

    if (!isWorldChainNetwork) {
      try {
        setIsTransacting(true);
        await switchChain({ chainId: WORLD_CHAIN_ID });
        toast.success('Switched to World Chain! Now you can post.');
        setIsTransacting(false);
        return;
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        toast.error('Please switch to World Chain manually');
        setIsTransacting(false);
        return;
      }
    }

    if (!content.trim()) {
      return;
    }

    if (!contractAddress) {
      toast.error('World Chain contract not deployed yet');
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    try {
      setIsTransacting(true);
      toast.loading('Preparing transaction on World Chain...');

      const formattedAddress = contractAddress.startsWith('0x') 
        ? contractAddress as `0x${string}` 
        : `0x${contractAddress}` as `0x${string}`;

      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: WORLD_CHAIN_POST_CONTRACT_ABI,
        functionName: 'createPost',
        args: [content],
        account: address,
        chain: worldChain,
      });

      const txHash = await walletClient.writeContract({
        ...request,
        chain: worldChain,
      });
      
      toast.success('Transaction sent on World Chain!');
      console.log('World Chain transaction hash:', txHash);
      
      setTransactionHash(txHash);
      handleTransactionSuccess(txHash);
      
    } catch (error) {
      console.error('World Chain transaction error:', error);
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
    isWorldChainNetwork, 
    switchChain,
    contractAddress,
    walletClient,
    publicClient,
    onTransactionSuccess,
    onPostAdded
  ]);

  const handleTransactionSuccess = async (txHash: string) => {
    localStorage.setItem('lastWorldChainTxHash', txHash);
    
    console.log('World Chain transaction successful with hash:', txHash);
    
    onTransactionSuccess(txHash);
    
    if (onPostAdded) {
      try {
        await onPostAdded();
      } catch (error) {
        console.error('Error refreshing posts after World Chain transaction:', error);
      }
    }
  };

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
        className={`px-4 py-2 ${isViewingExplorer ? 'bg-blue-500' : 'bg-green-500'} text-white rounded-lg hover:bg-green-600 transition-colors`}
        onClick={() => {
          openTransactionInExplorer();
          if (onPostAdded && !isViewingExplorer) {
            onPostAdded().catch(error => 
              console.error('Error refreshing posts after viewing explorer:', error)
            );
          }
        }}
      >
        {isViewingExplorer ? 'Transaction Sent!' : 'View on Worldscan'}
      </button>
    );
  }

  return (
    <button
      className={`flex items-center justify-center px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg transition-all duration-300 font-medium text-xs sm:text-sm h-[32px] ${
        isWorldChainNetwork 
          ? 'bg-white text-black border border-black hover:bg-gray-50' 
          : 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600'
      } ${disabled || isTransacting ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleSendTransaction}
      disabled={disabled || isTransacting}
    >
      {isTransacting ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="leading-tight">Processing...</span>
        </>
      ) : (
        <>
          <img 
            src="/logotypy/logo-symbol.svg"
            alt="World Chain"
            className="w-4 h-4 mr-1"
          />
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </>
      )}
    </button>
  );
}

