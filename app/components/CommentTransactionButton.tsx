'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { 
  Transaction,
  TransactionButton as OnchainKitTransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
  TransactionToast,
  TransactionToastIcon,
  TransactionToastLabel,
  TransactionToastAction
} from '@coinbase/onchainkit/transaction';
import { toast } from 'react-hot-toast';
import { getContractAddress2, prepareCreatePostCall2 } from '../contracts/PostContract2';
import { base, baseSepolia } from 'wagmi/chains';

interface CommentTransactionButtonProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
}

export default function CommentTransactionButton({ 
  content, 
  onTransactionSuccess,
  disabled = false,
  autoPost = true
}: CommentTransactionButtonProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [isTransacting, setIsTransacting] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [requestDenied, setRequestDenied] = useState(false);
  const requestDeniedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Pobierz adres kontraktu w zależności od sieci
  const contractAddress = getContractAddress2(chainId);

  // Sprawdź, czy jesteśmy na odpowiedniej sieci
  useEffect(() => {
    if (isConnected) {
      if (chainId !== base.id && chainId !== baseSepolia.id) {
        setNetworkError(`Please switch to Base Mainnet or Base Sepolia. Current network: Chain ID ${chainId}`);
      } else {
        setNetworkError(null);
      }
    }
  }, [chainId, isConnected]);

  // Efekt dla automatycznego ukrywania komunikatu "Request denied"
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

  // Efekt dla automatycznego ukrywania komunikatu o sukcesie
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

  // Obsługa statusu transakcji
  const handleTransactionStatus = useCallback((status: any) => {
    console.log('Comment transaction status:', status);
    
    if (status.statusName === 'success') {
      const txHash = status.statusData?.transactionReceipts?.[0]?.transactionHash;
      
      if (txHash) {
        toast.success('Comment confirmed on blockchain!');
        console.log('✅ Comment transaction confirmed:', status.statusData);
        console.log('✅ Comment transaction hash:', txHash);
        
        setTransactionHash(txHash);
        setTransactionSuccess(true);
        
        if (autoPost) {
          toast.success('Automatically saving comment to database...');
          onTransactionSuccess(txHash);
        } else {
          toast.success('Comment confirmed! Click to save your comment to the database.');
          onTransactionSuccess(txHash);
        }
      }
      
      setIsTransacting(false);
    } else if (status.statusName === 'error') {
      const errorMessage = status.statusData?.message || 'Unknown error';
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        setRequestDenied(true);
      }
      
      toast.error(`Comment transaction error: ${errorMessage}`);
      console.error('Comment transaction error:', status.statusData);
      setIsTransacting(false);
    } else if (status.statusName === 'transactionPending') {
      toast.loading('Comment transaction pending...');
      setIsTransacting(true);
    } else if (status.statusName === 'buildingTransaction') {
      console.log('Building comment transaction...');
    }
  }, [onTransactionSuccess, autoPost]);

  // Przygotowanie wywołania kontraktu
  const getCalls = useCallback(() => {
    if (!contractAddress) {
      return undefined;
    }
    
    // Używamy tej samej funkcji co dla postów, ale z prefiksem "comment:" dla rozróżnienia
    return prepareCreatePostCall2(contractAddress, `comment:${content}`);
  }, [contractAddress, content]);

  // Funkcja do otwierania transakcji w eksploratorze bloków
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
        <Transaction
          chainId={chainId}
          calls={getCalls()}
          onStatus={handleTransactionStatus}
        >
          <OnchainKitTransactionButton 
            text={
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
                    <img 
                      src="/brand-kit/base/logo/symbol/Base_Symbol_White.png" 
                      alt="Base Logo" 
                      className="w-4 h-4 mr-1.5"
                    />
                    <span className="hidden xs:inline">Comment Onchain</span>
                    <span className="inline xs:hidden">Comment</span>
                  </>
                )}
              </span>
            }
            className="px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-[#0052FF] to-[#2D74FF] text-white rounded-lg hover:from-[#0047E1] hover:to-[#2D6AE6] disabled:opacity-50 disabled:cursor-not-allowed border border-[#0052FF]/30 hover:border-[#0052FF]/60 shadow-[0_0_10px_rgba(0,82,255,0.3)] transition-all duration-300 font-medium relative overflow-hidden text-xs sm:text-sm"
            disabled={disabled || !content.trim() || isTransacting || !!networkError}
          />
          <TransactionSponsor />
          <TransactionStatus>
            <TransactionStatusLabel />
            <TransactionStatusAction />
          </TransactionStatus>
          <TransactionToast>
            <TransactionToastIcon />
            <TransactionToastLabel />
            <TransactionToastAction />
          </TransactionToast>
        </Transaction>
      ) : (
        <button
          onClick={openTransactionInExplorer}
          className="px-3 py-2 sm:px-4 sm:py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs sm:text-sm"
        >
          <span className="flex items-center justify-center">
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="hidden xs:inline">Saved onchain</span>
            <span className="inline xs:hidden">Saved</span>
          </span>
        </button>
      )}
      
      {networkError && (
        <div className="mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs">
          <p className="font-medium">Network Error</p>
          <p>{networkError}</p>
          <p className="mt-1">Please switch to Base Mainnet or Base Sepolia in your wallet.</p>
        </div>
      )}
      
      <div className={`absolute top-full left-0 right-0 mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs text-center transition-opacity duration-300 ${requestDenied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        Request denied.
      </div>
    </div>
  );
} 