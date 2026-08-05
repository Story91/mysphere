'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_CONFIG,
  robinhoodChain
} from '../config/RobinhoodNetworkConfig';
import {
  ROBINHOOD_POST_CONTRACT_ABI,
  getRobinhoodContractAddress,
  isRobinhoodPostContractDeployed
} from '../contracts/RobinhoodPostContract';

// Komunikat pokazywany dopoki kontrakt postow nie jest wdrozony na Robinhood Chain
export const ROBINHOOD_POSTING_DISABLED_MESSAGE =
  'Posting on Robinhood Chain is not live yet';

interface TransactionButtonRobinhoodProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
}

export default function TransactionButtonRobinhood({
  content,
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onPostAdded
}: TransactionButtonRobinhoodProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);

  // Czy jestesmy na sieci Robinhood
  const isRobinhoodNetwork = chainId === ROBINHOOD_CHAIN_ID;

  // Adres kontraktu - undefined dopoki kontrakt nie jest wdrozony
  const contractAddress = getRobinhoodContractAddress(chainId);

  // Brama UI niezalezna od aktualnej sieci: dopoki nie ma adresu kontraktu,
  // postowanie jest calkowicie niedostepne (a nie "przelacz siec i sprobuj").
  const postingLive = isRobinhoodPostContractDeployed();

  const handleTransactionSuccess = useCallback(async (txHash: string) => {
    // Zapis hasha w localStorage, zeby nie odpalic tego samego postu dwa razy
    localStorage.setItem('lastRobinhoodTxHash', txHash);

    console.log('Robinhood transaction successful with hash:', txHash);

    onTransactionSuccess(txHash);

    if (onPostAdded) {
      try {
        await onPostAdded();
      } catch (error) {
        console.error('Error refreshing posts after Robinhood transaction:', error);
      }
    }
  }, [onTransactionSuccess, onPostAdded]);

  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || disabled || isTransacting) {
      return;
    }

    // Twardy stop: bez wdrozonego kontraktu nie ruszamy dalej i nie wysylamy
    // niczego na pusty adres.
    if (!postingLive) {
      toast.error(ROBINHOOD_POSTING_DISABLED_MESSAGE);
      return;
    }

    // Jesli nie jestesmy na Robinhood Chain - tylko przelacz siec, nie postuj
    if (!isRobinhoodNetwork) {
      try {
        setIsTransacting(true);
        await switchChain({ chainId: ROBINHOOD_CHAIN_ID });
        toast.success('Switched to Robinhood Chain! Now you can post.');
        setIsTransacting(false);
        return;
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        toast.error('Please switch to Robinhood Chain manually');
        setIsTransacting(false);
        return;
      }
    }

    if (!content.trim()) {
      return;
    }

    // Druga bramka - contractAddress jest wyliczony dla aktualnego chainId
    if (!contractAddress) {
      toast.error(ROBINHOOD_POSTING_DISABLED_MESSAGE);
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    try {
      setIsTransacting(true);
      toast.loading('Preparing transaction on Robinhood Chain...');

      const formattedAddress = contractAddress.startsWith('0x')
        ? contractAddress as `0x${string}`
        : `0x${contractAddress}` as `0x${string}`;

      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: ROBINHOOD_POST_CONTRACT_ABI,
        functionName: 'createPost',
        args: [content],
        account: address,
        chain: robinhoodChain,
      });

      const txHash = await walletClient.writeContract({
        ...request,
        chain: robinhoodChain,
      });

      toast.success('Transaction sent on Robinhood Chain!');
      console.log('Robinhood transaction hash:', txHash);

      setTransactionHash(txHash);
      handleTransactionSuccess(txHash);

    } catch (error) {
      console.error('Robinhood transaction error:', error);
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
    isRobinhoodNetwork,
    postingLive,
    switchChain,
    contractAddress,
    walletClient,
    publicClient,
    handleTransactionSuccess
  ]);

  const openTransactionInExplorer = useCallback(() => {
    if (transactionHash) {
      setIsViewingExplorer(true);
      window.open(`${ROBINHOOD_CONFIG.explorerUrl}/tx/${transactionHash}`, '_blank');

      setTimeout(() => {
        setTransactionHash(null);
        setIsViewingExplorer(false);
      }, 2000);
    }
  }, [transactionHash]);

  // Widok sukcesu po wyslanej transakcji
  if (transactionHash) {
    return (
      <button
        className={`px-4 py-2 ${isViewingExplorer ? 'bg-[#00C805]' : 'bg-green-500'} text-white rounded-lg hover:bg-green-600 transition-colors`}
        onClick={() => {
          openTransactionInExplorer();
          if (onPostAdded && !isViewingExplorer) {
            onPostAdded().catch(error =>
              console.error('Error refreshing posts after viewing explorer:', error)
            );
          }
        }}
      >
        {isViewingExplorer ? 'Transaction Sent!' : 'View on Blockscout'}
      </button>
    );
  }

  // Kontrakt niewdrozony - przycisk wylaczony z czytelnym komunikatem,
  // zamiast cichej awarii albo transakcji na pusty adres.
  if (!postingLive) {
    return (
      <button
        type="button"
        disabled
        title={ROBINHOOD_POSTING_DISABLED_MESSAGE}
        aria-label={ROBINHOOD_POSTING_DISABLED_MESSAGE}
        className="flex items-center justify-center px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg font-medium text-xs sm:text-sm h-[32px] bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 border border-gray-400 dark:border-gray-500 opacity-70 cursor-not-allowed"
      >
        <span className="leading-tight whitespace-nowrap">Coming soon</span>
      </button>
    );
  }

  return (
    <button
      className={`flex items-center justify-center px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg transition-all duration-300 font-medium text-xs sm:text-sm h-[32px] ${
        isRobinhoodNetwork
          ? 'bg-[#00C805] text-black hover:bg-[#00b104] border border-black'
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
            src="/logotypy/robinhood.svg"
            alt="Robinhood Chain"
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
