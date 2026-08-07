'use client';

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { toast } from 'react-hot-toast';
import { getContractAddress2 } from '../contracts/PostContract2';
import { openTxInExplorer, useAutoReset } from './useTxFeedback';

interface TransactionButtonProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
  /**
   * Warunek wstepny sprawdzany PRZED wyslaniem transakcji. `false` zatrzymuje
   * publikacje, zanim cokolwiek powstanie.
   *
   * PO CO: platna czesc posta wymaga podpisanej sesji, a dowiadywalismy sie
   * o jej braku dopiero PO utworzeniu posta - autor zostawal z wpisem, ktory
   * wygladal na platny wylacznie jemu. Wolajacy sam pokazuje komunikat, wiec
   * tutaj tylko cicho przerywamy.
   */
  beforeTransaction?: () => Promise<boolean>;
}

export default function TransactionButton({
  content,
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onPostAdded,
  beforeTransaction
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

  // Get contract address based on current chain
  const contractAddress = getContractAddress2(chainId);

  // Check if we're on Base network
  const isBaseNetwork = chainId === base.id || chainId === baseSepolia.id;

  // Auto-hide "Request denied" message after 5 seconds
  useAutoReset(requestDenied, 5000, () => setRequestDenied(false));

  // Auto-hide success message after 6 seconds
  useAutoReset(transactionSuccess, 6000, () => {
    setTransactionSuccess(false);
    setTransactionHash(null);
  });

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

    // Warunki wstepne PRZED transakcja - patrz beforeTransaction w propsach.
    // Blad traktujemy jak odmowe: skoro nie wiemy, czy warunek jest spelniony,
    // nie wysylamy nieodwracalnej transakcji.
    if (beforeTransaction) {
      let allowed = false;
      try {
        allowed = await beforeTransaction();
      } catch (preflightError) {
        console.error('[TransactionButton] warunek wstepny publikacji nie przeszedl:', preflightError);
      }
      if (!allowed) return;
    }

    // Toast ladowania trzeba pozniej zdjac PO ID. Wczesniej nikt go nie
    // zamykal, wiec "Preparing post transaction..." zostawalo na ekranie obok
    // komunikatu o sukcesie albo bledzie.
    let loadingToastId: string | undefined;

    try {
      setIsTransacting(true);
      loadingToastId = toast.loading('Preparing post transaction...');

      // Ta sciezka jest osiagalna na Base Sepolia: PostContract2 nie ma tam
      // wdrozenia (patrz TESTNET_CONTRACT_ADDRESS2), wiec komunikat musi
      // powiedziec CO zrobic, a nie tylko ze cos jest undefined.
      if (!contractAddress) {
        throw new Error('PostContract2 is not deployed on this network. Switch to Base mainnet to post.');
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
      if (loadingToastId) toast.dismiss(loadingToastId);
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
    autoPost,
    beforeTransaction
  ]);

  return (
    <div className="relative">
      {!transactionSuccess ? (
        <button
          type="button"
          // Przycisk ma w srodku wylacznie logo i plusa - bez etykiety nie ma
          // zadnej nazwy dostepnej.
          aria-label={isTransacting ? 'Posting onchain' : 'Post onchain'}
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
                <svg aria-hidden="true" className="animate-spin -ml-1 mr-2 h-4 w-4 text-[#0052FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                  alt=""
                  className="w-4 h-4 mr-1"
                />
                <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </>
            )}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openTxInExplorer(chainId, transactionHash)}
          className="px-3 py-2 sm:px-4 sm:py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-xs sm:text-sm"
        >
          <span className="flex items-center justify-center">
            <svg aria-hidden="true" className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {/* Ten sam tekst na obu progach - dwa spany z `hidden xs:inline` /
                `inline xs:hidden` nie robily zadnej roznicy poza duplikatem
                w drzewie dostepnosci. */}
            <span>Saved</span>
          </span>
        </button>
      )}

      {/* Komunikat o odrzuceniu żądania. Zostaje w DOM dla przejscia opacity,
          wiec poza czasem swojej widocznosci musi byc schowany takze przed
          czytnikiem ekranu - inaczej "Request denied." czytalo sie zawsze. */}
      <div
        role="status"
        aria-hidden={!requestDenied}
        className={`absolute top-full left-0 right-0 mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs text-center transition-opacity duration-300 ${requestDenied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        Request denied.
      </div>
    </div>
  );
} 