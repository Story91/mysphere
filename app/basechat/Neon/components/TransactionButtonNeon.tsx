'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { 
  NEON_MAINNET_CHAIN_ID,
  NEON_DEVNET_CHAIN_ID,
  neonMainnetChain,
  neonDevnetChain,
  NEON_MAINNET_CONFIG,
  NEON_DEVNET_CONFIG
} from '../config/NeonNetworkConfig';
import { 
  NEON_POST_CONTRACT_ABI, 
  getNeonContractAddress 
} from '../contracts/NeonPostContract';

interface TransactionButtonNeonProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
}

// Sprawdź czy używamy devnet
const USE_DEVNET = process.env.NEXT_PUBLIC_USE_NEON_DEVNET === 'true';
const NEON_CHAIN_ID = USE_DEVNET ? NEON_DEVNET_CHAIN_ID : NEON_MAINNET_CHAIN_ID;
const neonChain = USE_DEVNET ? neonDevnetChain : neonMainnetChain;
const NEON_CONFIG = USE_DEVNET ? NEON_DEVNET_CONFIG : NEON_MAINNET_CONFIG;

export default function TransactionButtonNeon({ 
  content, 
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onPostAdded
}: TransactionButtonNeonProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);

  const isNeonNetwork = chainId === NEON_CHAIN_ID;
  const contractAddress = getNeonContractAddress(chainId);

  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || disabled || isTransacting) {
      return;
    }

    if (!isNeonNetwork) {
      try {
        setIsTransacting(true);
        await switchChain({ chainId: NEON_CHAIN_ID });
        toast.success(`Switched to ${NEON_CONFIG.name}! Now you can post on Solana.`);
        setIsTransacting(false);
        return;
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        toast.error(`Please switch to ${NEON_CONFIG.name} manually`);
        setIsTransacting(false);
        return;
      }
    }

    if (!content.trim()) {
      return;
    }

    if (!contractAddress || contractAddress === '0x0000000000000000000000000000000000000000') {
      toast.error('Neon EVM contract not deployed yet. Deploy using Hardhat first.');
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    try {
      setIsTransacting(true);
      toast.loading('Preparing transaction on Neon EVM (Solana)...');

      const formattedAddress = contractAddress.startsWith('0x') 
        ? contractAddress as `0x${string}` 
        : `0x${contractAddress}` as `0x${string}`;

      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: NEON_POST_CONTRACT_ABI,
        functionName: 'createPost',
        args: [content],
        account: address,
        chain: neonChain,
      });

      const txHash = await walletClient.writeContract({
        ...request,
        chain: neonChain,
      });
      
      toast.dismiss();
      toast.success('Transaction sent on Neon EVM!');
      console.log('Neon EVM transaction hash:', txHash);
      
      setTransactionHash(txHash);
      handleTransactionSuccess(txHash);
      
    } catch (error) {
      console.error('Neon EVM transaction error:', error);
      toast.dismiss();
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
    isNeonNetwork, 
    switchChain,
    contractAddress,
    walletClient,
    publicClient,
    onTransactionSuccess,
    onPostAdded
  ]);

  const handleTransactionSuccess = async (txHash: string) => {
    localStorage.setItem('lastNeonTxHash', txHash);
    
    console.log('Neon EVM transaction successful with hash:', txHash);
    
    onTransactionSuccess(txHash);
    
    if (onPostAdded) {
      try {
        await onPostAdded();
      } catch (error) {
        console.error('Error refreshing posts after Neon transaction:', error);
      }
    }
  };

  const openTransactionInExplorer = useCallback(() => {
    if (transactionHash) {
      setIsViewingExplorer(true);
      window.open(`${NEON_CONFIG.explorerUrl}/tx/${transactionHash}`, '_blank');
      
      setTimeout(() => {
        setTransactionHash(null);
        setIsViewingExplorer(false);
      }, 2000);
    }
  }, [transactionHash]);

  if (transactionHash) {
    return (
      <button 
        className={`px-4 py-2 ${isViewingExplorer ? 'bg-purple-500' : 'bg-green-500'} text-white rounded-lg hover:bg-green-600 transition-colors`}
        onClick={() => {
          openTransactionInExplorer();
          if (onPostAdded && !isViewingExplorer) {
            onPostAdded().catch(error => 
              console.error('Error refreshing posts after viewing explorer:', error)
            );
          }
        }}
      >
        {isViewingExplorer ? 'Transaction Sent!' : 'View on NeonScan'}
      </button>
    );
  }

  return (
    <button
      className={`flex items-center justify-center px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg transition-all duration-300 font-medium text-xs sm:text-sm h-[32px] ${
        isNeonNetwork 
          ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white hover:from-purple-600 hover:to-cyan-600' 
          : 'bg-gray-700 text-white hover:bg-gray-600 border border-gray-600'
      } ${disabled || isTransacting ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleSendTransaction}
      disabled={disabled || isTransacting}
      title={`Post on Neon EVM (Solana's EVM layer)`}
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
          {/* Solana/Neon logo */}
          <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.927 4.003a.6.6 0 0 1 .424.176l3.473 3.473a.6.6 0 0 1 0 .849l-3.473 3.473a.6.6 0 0 1-.849 0l-3.473-3.473a.6.6 0 0 1 0-.849l3.473-3.473a.6.6 0 0 1 .425-.176zM6.073 4.003a.6.6 0 0 1 .424.176l3.473 3.473a.6.6 0 0 1 0 .849L6.497 12.5l3.473 3.473a.6.6 0 0 1 0 .849l-3.473 3.473a.6.6 0 0 1-.849 0l-3.473-3.473a.6.6 0 0 1 0-.849l3.473-3.473-3.473-3.473a.6.6 0 0 1 0-.849l3.473-3.473a.6.6 0 0 1 .425-.176z"/>
          </svg>
          <span className="text-xs font-bold">NEON</span>
          <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </>
      )}
    </button>
  );
}

