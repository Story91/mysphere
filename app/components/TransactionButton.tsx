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
import { getContractAddress, prepareCreatePostCall } from '../contracts/PostContract';
import { getContractAddress2, prepareCreatePostCall2 } from '../contracts/PostContract2';
import { base, baseSepolia } from 'wagmi/chains';

interface TransactionButtonProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
}

export default function TransactionButtonWrapper({ 
  content, 
  onTransactionSuccess,
  disabled = false,
  autoPost = true
}: TransactionButtonProps) {
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
      // Wyczyść poprzedni timer, jeśli istnieje
      if (requestDeniedTimerRef.current) {
        clearTimeout(requestDeniedTimerRef.current);
      }
      
      // Ustaw nowy timer na 5 sekund
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
      // Wyczyść poprzedni timer, jeśli istnieje
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
      
      // Ustaw nowy timer na 6 sekund (zamiast 3)
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
    console.log('Transaction status:', status);
    
    if (status.statusName === 'success') {
      // W przypadku sukcesu, pobierz hash transakcji z danych statusu
      const txHash = status.statusData?.transactionReceipts?.[0]?.transactionHash;
      
      if (txHash) {
        toast.success('Transaction confirmed on blockchain!');
        console.log('✅ Transaction confirmed:', status.statusData);
        console.log('✅ Transaction hash:', txHash);
        
        // Zapisz hash transakcji i ustaw flagę sukcesu
        setTransactionHash(txHash);
        setTransactionSuccess(true);
        
        // Wywołaj callback z hashem transakcji
        if (autoPost) {
          toast.success('Automatically saving post to database...');
          onTransactionSuccess(txHash);
        } else {
          toast.success('Transaction confirmed! Click "Post" to save your post to the database.');
          onTransactionSuccess(txHash);
        }
      }
      
      // Resetuj stan
      setIsTransacting(false);
    } else if (status.statusName === 'error') {
      // Sprawdź, czy błąd dotyczy odrzucenia transakcji przez użytkownika
      const errorMessage = status.statusData?.message || 'Unknown error';
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        setRequestDenied(true);
      }
      
      toast.error(`Transaction error: ${errorMessage}`);
      console.error('Transaction error:', status.statusData);
      setIsTransacting(false);
    } else if (status.statusName === 'transactionPending') {
      toast.loading('Transaction pending...');
      setIsTransacting(true);
    } else if (status.statusName === 'buildingTransaction') {
      console.log('Building transaction...');
    }
  }, [onTransactionSuccess, autoPost]);

  // Przygotowanie wywołania kontraktu
  const getCalls = useCallback(() => {
    if (!contractAddress) {
      return undefined;
    }
    
    // Użyj funkcji z PostContract2.ts do przygotowania danych dla wywołania kontraktu
    return prepareCreatePostCall2(contractAddress, content);
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
                    <span className="hidden xs:inline">Post Onchain</span>
                    <span className="inline xs:hidden">Post</span>
                  </>
                )}
              </span>
            }
            className="px-3 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-[#0052FF] to-[#2D74FF] text-white rounded-lg hover:from-[#0047E1] hover:to-[#2D6AE6] disabled:opacity-50 disabled:cursor-not-allowed border border-[#0052FF]/30 hover:border-[#0052FF]/60 shadow-[0_0_10px_rgba(0,82,255,0.3),0_0_20px_rgba(0,82,255,0.2),0_0_30px_rgba(0,82,255,0.1)] transition-all duration-300 font-medium relative overflow-hidden text-sm"
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
        <div className="flex flex-col">
          <button
            onClick={openTransactionInExplorer}
            className="px-5 py-2.5 bg-gradient-to-r from-[#0052FF] to-[#2D74FF] text-white rounded-lg hover:from-[#0047E1] hover:to-[#2D6AE6] border border-[#0052FF]/30 hover:border-[#0052FF]/60 shadow-[0_0_10px_rgba(0,82,255,0.3),0_0_20px_rgba(0,82,255,0.2),0_0_30px_rgba(0,82,255,0.1)] transition-all duration-300 font-medium relative overflow-hidden"
          >
            <span className="flex items-center justify-center">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View transaction
            </span>
          </button>
          <div className="text-center text-xs text-green-500 mt-1">Successful</div>
        </div>
      )}
      
      {networkError && (
        <div className="mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs">
          <p className="font-medium">Network Error</p>
          <p>{networkError}</p>
          <p className="mt-1">Please switch to Base Mainnet or Base Sepolia in your wallet.</p>
        </div>
      )}
      
      {/* Komunikat o odrzuceniu żądania */}
      <div className={`absolute top-full left-0 right-0 mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs text-center transition-opacity duration-300 ${requestDenied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        Request denied.
      </div>
      
      <div className="absolute inset-0 bg-gradient-to-r from-[#0052FF]/20 to-transparent opacity-50 animate-pulse pointer-events-none"></div>
    </div>
  );
} 