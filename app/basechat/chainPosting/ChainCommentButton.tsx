'use client';

/**
 * Jedyna implementacja przycisku "skomentuj na tym lancuchu".
 * Wszystkie roznice miedzy sieciami siedza w `ChainPostingConfig`.
 */

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { describeWalletError, useAutoReset } from '../../components/useTxFeedback';
import { notDeployedMessage } from './types';
import type { ChainCommentButtonProps, ChainPostingConfig } from './types';

function Spinner({ className }: { className: string }) {
  return (
    <svg
      className={`animate-spin -ml-1 mr-2 h-4 w-4 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

interface Props extends ChainCommentButtonProps {
  config: ChainPostingConfig;
}

export default function ChainCommentButton({
  content,
  onTransactionSuccess,
  disabled = false,
  autoPost = true,
  onCommentAdded,
  config,
}: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const [isTransacting, setIsTransacting] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [isViewingExplorer, setIsViewingExplorer] = useState(false);
  const [deniedMessage, setDeniedMessage] = useState<string | null>(null);

  const onChain = chainId === config.chainId;
  const contractAddress = config.getContractAddress(chainId);
  const postingLive = config.isLive ? config.isLive() : true;

  // Komunikat "Request denied." chowal sie wczesniej recznym setTimeout na refie,
  // przepisanym w kazdej sieci osobno. To ten sam wspolny hook co w Base.
  useAutoReset(deniedMessage !== null, 5000, () => setDeniedMessage(null));

  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || !content.trim() || disabled || isTransacting) {
      return;
    }

    // Twardy stop przed jakimkolwiek kontaktem z siecia.
    if (!postingLive) {
      toast.error(notDeployedMessage(config));
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    // Bez tego `loading` zostawal na ekranie na stale - react-hot-toast nie
    // zdejmuje go sam.
    let loadingToastId: string | undefined;

    try {
      setIsTransacting(true);
      loadingToastId = toast.loading(`Preparing ${config.shortName || config.networkLabel} comment...`);

      if (!onChain) {
        try {
          await switchChainAsync({ chainId: config.chainId });
          toast.success(`Switched to ${config.networkLabel}`);
        } catch (switchError) {
          console.error('Failed to switch network:', switchError);
          // Odmowa przelaczenia sieci w portfelu to decyzja uzytkownika, nie
          // awaria - przycisk postu (ChainPostButton) rozroznial to od dawna,
          // ten pokazywal czerwony toast takze wtedy.
          const switchInfo = describeWalletError(switchError, {
            network: config.networkLabel,
            gasSymbol: config.chain.nativeCurrency.symbol,
          });
          if (switchInfo.isFailure) {
            toast.error(`Please switch to ${config.networkLabel} manually`);
          } else {
            toast(switchInfo.message);
          }
          setDeniedMessage(switchInfo.isFailure ? 'Request denied.' : switchInfo.message);
          return;
        }
      }

      if (!contractAddress) {
        toast.error(notDeployedMessage(config));
        return;
      }

      const formattedAddress = contractAddress.startsWith('0x')
        ? (contractAddress as `0x${string}`)
        : (`0x${contractAddress}` as `0x${string}`);

      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: config.abi,
        functionName: 'createPost',
        // Prefiks 'comment:' odroznia komentarz od zwyklego postu.
        args: [`comment:${content}`],
        account: address,
        chain: config.chain,
      });

      const txHash = await walletClient.writeContract({
        ...request,
        chain: config.chain,
      });

      toast.success('Comment transaction sent!');

      setTransactionHash(txHash);

      if (autoPost) {
        toast.success('Automatically saving comment to database...');
        onTransactionSuccess(txHash);
        if (onCommentAdded) {
          await onCommentAdded();
        }
      } else {
        // "confirmed" bylo nieprawda: mamy dopiero hash z portfela, nikt nie
        // czekal na paragon. Transakcja moze sie jeszcze cofnac.
        toast.success('Comment transaction sent! Click to save your comment.');
        onTransactionSuccess(txHash);
      }
    } catch (error) {
      console.error('Comment transaction error:', error);
      const info = describeWalletError(error, {
        network: config.networkLabel,
        gasSymbol: config.chain.nativeCurrency.symbol,
      });

      if (info.kind === 'rejected') {
        // Odmowa w portfelu to nie awaria - pokazujemy dymek, nie czerwony toast.
        setDeniedMessage(info.message);
        toast(info.message);
      } else {
        setDeniedMessage(null);
        toast.error(`Comment transaction failed: ${info.message}`);
      }
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
    onChain,
    postingLive,
    switchChainAsync,
    contractAddress,
    walletClient,
    publicClient,
    onTransactionSuccess,
    onCommentAdded,
    autoPost,
    config,
  ]);

  // Timer chowajacy widok sukcesu, ze sprzataniem przy odmontowaniu.
  useAutoReset(isViewingExplorer, 2000, () => {
    setTransactionHash(null);
    setIsViewingExplorer(false);
  });

  const skin = config.comment;

  if (transactionHash) {
    return (
      <button
        type="button"
        className={`px-3 py-2 sm:px-4 sm:py-2 ${isViewingExplorer ? skin.sentAccent : 'bg-green-500'} ${skin.sentText} rounded-lg hover:bg-green-600 text-xs sm:text-sm`}
        onClick={() => {
          const alreadyViewing = isViewingExplorer;
          setIsViewingExplorer(true);
          window.open(`${config.explorerTxUrl}${transactionHash}`, '_blank');
          if (onCommentAdded && !alreadyViewing) {
            onCommentAdded().catch(error =>
              console.error('Error refreshing posts after viewing explorer:', error)
            );
          }
        }}
      >
        <span className="flex items-center justify-center">
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>Saved</span>
        </span>
      </button>
    );
  }

  // Kontrakt niewdrozony - przycisk wylaczony z czytelnym komunikatem.
  if (!postingLive) {
    const message = notDeployedMessage(config);
    return (
      <button
        type="button"
        disabled
        title={message}
        aria-label={message}
        className="px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 opacity-70 cursor-not-allowed"
      >
        <span className="whitespace-nowrap">Coming soon</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleSendTransaction}
        disabled={disabled || !content.trim() || isTransacting}
        className={`px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center transition-colors ${
          onChain ? skin.onChain : skin.offChain
        } ${disabled || isTransacting || !content.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="flex items-center justify-center">
          {isTransacting ? (
            <>
              <Spinner className={skin.spinner(onChain)} />
              <span className="hidden xs:inline">Processing...</span>
              <span className="inline xs:hidden">...</span>
            </>
          ) : (
            <>
              {skin.icon(onChain)}
              <span>Comment</span>
            </>
          )}
        </span>
      </button>

      {/* Dymek pod przyciskiem - `role="status"`, zeby czytnik ekranu ogłosił zmiane. */}
      <div
        role="status"
        className={`absolute top-full left-0 right-0 mt-2 p-2 bg-red-100 text-red-700 rounded-lg text-xs text-center transition-opacity duration-300 ${
          deniedMessage ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {deniedMessage || 'Request denied.'}
      </div>
    </div>
  );
}
