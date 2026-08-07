'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { toast } from 'react-hot-toast';
import { getContractAddress2 } from '../contracts/PostContract2';
import { openTxInExplorer, useAutoReset } from './useTxFeedback';

interface CommentTransactionButtonProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onCommentAdded?: () => Promise<void>;
}

export default function CommentTransactionButton({ 
  content, 
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onCommentAdded
}: CommentTransactionButtonProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [requestDenied, setRequestDenied] = useState(false);

  // Get contract address based on current chain
  const contractAddress = getContractAddress2(chainId);

  // Check if we're on the right network
  useEffect(() => {
    if (isConnected) {
      if (chainId !== base.id && chainId !== baseSepolia.id) {
        setNetworkError(`Please switch to Base Mainnet or Base Sepolia. Current network: Chain ID ${chainId}`);
      } else {
        setNetworkError(null);
      }
    }
  }, [chainId, isConnected]);

  // Auto-hide "Request denied" message after 5 seconds
  useAutoReset(requestDenied, 5000, () => setRequestDenied(false));

  // Auto-hide success message after 6 seconds
  useAutoReset(transactionSuccess, 6000, () => {
    setTransactionSuccess(false);
    setTransactionHash(null);
  });

  // Function to handle sending transaction via wagmi
  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || !content.trim() || disabled || isTransacting) {
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    // Toast ladowania trzeba pozniej zdjac PO ID. Wczesniej nikt go nie
    // zamykal, wiec "Preparing comment transaction..." zostawalo na ekranie
    // obok komunikatu o sukcesie albo bledzie.
    let loadingToastId: string | undefined;

    try {
      setIsTransacting(true);
      loadingToastId = toast.loading('Preparing comment transaction...');

      // If on wrong network, try to switch
      if (chainId !== base.id && chainId !== baseSepolia.id) {
        try {
          await switchChain({ chainId: base.id });
          toast.success('Switched to Base network');
        } catch (switchError) {
          console.error('Failed to switch network:', switchError);
          toast.error('Please switch to Base network manually');
          setIsTransacting(false);
          setRequestDenied(true);
          return;
        }
      }

      // Ta sciezka jest osiagalna na Base Sepolia: PostContract2 nie ma tam
      // wdrozenia (patrz TESTNET_CONTRACT_ADDRESS2), wiec komunikat musi
      // powiedziec CO zrobic, a nie tylko ze cos jest undefined.
      if (!contractAddress) {
        throw new Error('PostContract2 is not deployed on this network. Switch to Base mainnet to comment.');
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
        args: [`comment:${content}`],
        account: address,
      });

      // Send transaction using wallet client
      const hash = await walletClient.writeContract(request);
      
      toast.success('Comment transaction sent!');
      console.log('Comment transaction hash:', hash);
        
      // Set transaction hash and call success handler
      setTransactionHash(hash);
        setTransactionSuccess(true);
        
        if (autoPost) {
          toast.success('Automatically saving comment to database...');
        onTransactionSuccess(hash);
          if (onCommentAdded) {
          await onCommentAdded();
          }
        } else {
        toast.success('Comment transaction confirmed! Click to save your comment.');
        onTransactionSuccess(hash);
        }
      
    } catch (error) {
      console.error('Comment transaction error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        setRequestDenied(true);
      }
      
      toast.error(`Comment transaction failed: ${errorMessage}`);
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
    switchChain,
    contractAddress,
    walletClient,
    publicClient,
    onTransactionSuccess,
    onCommentAdded,
    autoPost
  ]);

  return (
    <div className="relative">
      {!transactionSuccess ? (
        <button
          type="button"
          onClick={handleSendTransaction}
          disabled={disabled || !content.trim() || isTransacting || !!networkError}
          className="px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-[#0052FF] to-[#2D74FF] text-white rounded-lg hover:from-[#0047E1] hover:to-[#2D6AE6] disabled:opacity-50 disabled:cursor-not-allowed border border-[#0052FF]/30 hover:border-[#0052FF]/60 shadow-[0_0_10px_rgba(0,82,255,0.3)] transition-all duration-300 font-medium relative overflow-hidden text-xs sm:text-sm"
        >
              <span className="flex items-center justify-center">
                {isTransacting ? (
                  <>
                    <svg aria-hidden="true" className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                      alt=""
                      className="w-4 h-4 mr-1.5"
                    />
                    {/* Ten sam tekst na obu progach - dwa spany nie robily
                        zadnej roznicy poza duplikatem w drzewie dostepnosci. */}
                    <span>Comment</span>
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
            <span>Saved</span>
          </span>
        </button>
      )}

      {/* Zostaje w DOM dla przejscia opacity, wiec poza czasem swojej
          widocznosci musi byc schowany takze przed czytnikiem ekranu. */}
      <div
        role="status"
        aria-hidden={!requestDenied}
        className={`absolute top-full left-0 right-0 mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs text-center transition-opacity duration-300 ${requestDenied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        Request denied.
      </div>

      {/* Network error message as a single line */}
      {networkError && (
        <div className="mt-2 text-center text-red-500 text-xs whitespace-nowrap overflow-hidden text-ellipsis w-full">
          Network Error: Please switch to Base Mainnet
        </div>
      )}
    </div>
  );
} 