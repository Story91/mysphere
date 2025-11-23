'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { 
  ETHEREUM_CHAIN_ID, 
  ethereumChain 
} from '../config/EthereumNetworkConfig';
import { 
  ETHEREUM_POST_CONTRACT_ABI, 
  getEthereumContractAddress 
} from '../contracts/EthereumPostContract';

interface TransactionButtonEthereumProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
}

export default function TransactionButtonEthereum({ 
  content, 
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onPostAdded
}: TransactionButtonEthereumProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);

  const isEthereumNetwork = chainId === ETHEREUM_CHAIN_ID;
  const contractAddress = getEthereumContractAddress(chainId);

  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || disabled || isTransacting) {
      return;
    }

    if (!isEthereumNetwork) {
      if (!content.trim()) {
        toast.error('Please write some content first');
        return;
      }
      
      try {
        setIsTransacting(true);
        toast.loading('Switching to Ethereum Network...');
        await switchChain({ chainId: ETHEREUM_CHAIN_ID });
        toast.success('Switched to Ethereum Network! Now you can post.');
        setIsTransacting(false);
        return;
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        toast.error('Please switch to Ethereum Network manually');
        setIsTransacting(false);
        return;
      }
    }

    if (!content.trim()) {
      return;
    }

    if (!contractAddress) {
      toast.error('Ethereum contract not deployed yet');
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    try {
      setIsTransacting(true);
      toast.loading('Preparing transaction on Ethereum...');

      const formattedAddress = contractAddress.startsWith('0x') 
        ? contractAddress as `0x${string}` 
        : `0x${contractAddress}` as `0x${string}`;

      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: ETHEREUM_POST_CONTRACT_ABI,
        functionName: 'createPost',
        args: [content],
        account: address,
        chain: ethereumChain,
      });

      const txHash = await walletClient.writeContract({
        ...request,
        chain: ethereumChain,
      });
      
      toast.success('Transaction sent on Ethereum!');
      console.log('Ethereum transaction hash:', txHash);
      
      setTransactionHash(txHash);
      handleTransactionSuccess(txHash);
      
    } catch (error) {
      console.error('Ethereum transaction error:', error);
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
    isEthereumNetwork, 
    switchChain,
    contractAddress,
    walletClient,
    publicClient,
    onTransactionSuccess,
    onPostAdded
  ]);

  const handleTransactionSuccess = async (txHash: string) => {
    localStorage.setItem('lastEthereumTxHash', txHash);
    
    console.log('Ethereum transaction successful with hash:', txHash);
    
    onTransactionSuccess(txHash);
    
    if (onPostAdded) {
      try {
        await onPostAdded();
      } catch (error) {
        console.error('Error refreshing posts after Ethereum transaction:', error);
      }
    }
  };

  const openTransactionInExplorer = useCallback(() => {
    if (transactionHash) {
      setIsViewingExplorer(true);
      window.open(`https://etherscan.io/tx/${transactionHash}`, '_blank');
      
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
        {isViewingExplorer ? 'Transaction Sent!' : 'View on Etherscan'}
      </button>
    );
  }

  return (
    <button
      className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
        isEthereumNetwork 
          ? 'bg-blue-500 text-white hover:bg-blue-600' 
          : 'bg-gray-700 text-white hover:bg-gray-600'
      } ${disabled || isTransacting ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleSendTransaction}
      disabled={disabled || isTransacting || (!isEthereumNetwork && !content.trim())}
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
          <img 
            src="/ethlogo.png"
            alt="Ethereum"
            className="w-5 h-5 mr-1.5"
          />
          {isEthereumNetwork ? 'Post to Ethereum Network' : 'Switch To Ethereum'}
        </>
      )}
    </button>
  );
}

