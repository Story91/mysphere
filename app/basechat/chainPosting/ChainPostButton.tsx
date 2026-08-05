'use client';

/**
 * Jedyna implementacja przycisku "postuj na tym lancuchu".
 * Wszystkie roznice miedzy sieciami siedza w `ChainPostingConfig`.
 */

import { useState, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain, useWalletClient, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { describeWalletError, useAutoReset } from '../../components/useTxFeedback';
import { chainSuffix, notDeployedMessage } from './types';
import type { ChainPostButtonProps, ChainPostingConfig } from './types';

/** Spinner - identyczny we wszystkich sieciach, rozni sie tylko klasa koloru. */
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

interface Props extends ChainPostButtonProps {
  config: ChainPostingConfig;
}

export default function ChainPostButton({
  content,
  onTransactionSuccess,
  disabled = false,
  onPostAdded,
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

  const onChain = chainId === config.chainId;
  const contractAddress = config.getContractAddress(chainId);
  const suffix = chainSuffix(config);

  // Brama UI niezalezna od aktualnej sieci: bez wdrozonego kontraktu postowanie
  // jest calkowicie niedostepne (a nie "przelacz siec i sprobuj").
  const postingLive = config.isLive ? config.isLive() : true;

  const handleTransactionSuccess = useCallback(
    async (txHash: string) => {
      // Zapis hasha, zeby ten sam post nie odpalil sie drugi raz.
      localStorage.setItem(config.txHashStorageKey, txHash);

      onTransactionSuccess(txHash);

      if (onPostAdded) {
        try {
          await onPostAdded();
        } catch (error) {
          console.error(`Error refreshing posts after ${config.networkLabel} transaction:`, error);
        }
      }
    },
    [config.txHashStorageKey, config.networkLabel, onTransactionSuccess, onPostAdded]
  );

  const handleSendTransaction = useCallback(async () => {
    if (!isConnected || !address || disabled || isTransacting) {
      return;
    }

    // Twardy stop: bez wdrozonego kontraktu nie wysylamy niczego na pusty adres.
    if (!postingLive) {
      toast.error(notDeployedMessage(config));
      return;
    }

    // Poza wlasciwa siecia przycisk tylko przelacza siec - nie postuje.
    if (!onChain) {
      try {
        setIsTransacting(true);
        await switchChainAsync({ chainId: config.chainId });
        toast.success(`Switched to ${config.networkLabel}! Now you can post.`);
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
        const info = describeWalletError(switchError, {
          network: config.networkLabel,
          gasSymbol: config.chain.nativeCurrency.symbol,
        });
        // Odmowa w portfelu to nie awaria - nie straszymy czerwonym toastem.
        if (info.isFailure) {
          toast.error(`Please switch to ${config.networkLabel} manually`);
        } else {
          toast(info.message);
        }
      } finally {
        setIsTransacting(false);
      }
      return;
    }

    if (!content.trim()) {
      return;
    }

    if (!contractAddress) {
      toast.error(notDeployedMessage(config));
      return;
    }

    if (!walletClient || !publicClient) {
      toast.error('Wallet not connected properly');
      return;
    }

    // Toast `loading` w react-hot-toast nie znika sam. Wczesniej nikt go nie
    // zdejmowal, wiec "Preparing transaction..." zostawalo na ekranie na stale,
    // obok komunikatu o sukcesie albo bledzie.
    let loadingToastId: string | undefined;

    try {
      setIsTransacting(true);
      loadingToastId = toast.loading(`Preparing transaction${suffix}...`);

      const formattedAddress = contractAddress.startsWith('0x')
        ? (contractAddress as `0x${string}`)
        : (`0x${contractAddress}` as `0x${string}`);

      const { request } = await publicClient.simulateContract({
        address: formattedAddress,
        abi: config.abi,
        functionName: 'createPost',
        args: [content],
        account: address,
        chain: config.chain,
      });

      const txHash = await walletClient.writeContract({
        ...request,
        chain: config.chain,
      });

      toast.success(`Transaction sent${suffix}!`);

      setTransactionHash(txHash);
      await handleTransactionSuccess(txHash);
    } catch (error) {
      console.error(`${config.networkLabel} transaction error:`, error);
      const info = describeWalletError(error, {
        network: config.networkLabel,
        gasSymbol: config.chain.nativeCurrency.symbol,
      });
      if (info.isFailure) {
        toast.error(`Transaction failed: ${info.message}`);
      } else {
        toast(info.message);
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
    suffix,
    config,
    handleTransactionSuccess,
  ]);

  // Timer chowajacy widok sukcesu. Wczesniej byl golym `setTimeout` bez
  // sprzatania - po odmontowaniu przycisku ustawial stan nieistniejacego
  // komponentu. `useAutoReset` kasuje go przy odmontowaniu.
  useAutoReset(isViewingExplorer, 2000, () => {
    setTransactionHash(null);
    setIsViewingExplorer(false);
  });

  const skin = config.post;

  // Widok sukcesu po wyslanej transakcji.
  if (transactionHash) {
    return (
      <button
        type="button"
        className={`px-4 py-2 ${isViewingExplorer ? skin.sentAccent : 'bg-green-500'} ${skin.sentText} rounded-lg hover:bg-green-600 transition-colors`}
        onClick={() => {
          const alreadyViewing = isViewingExplorer;
          setIsViewingExplorer(true);
          window.open(`${config.explorerTxUrl}${transactionHash}`, '_blank');
          // Odswiezenie feedu tylko przy pierwszym kliknieciu - tak bylo wszedzie.
          if (onPostAdded && !alreadyViewing) {
            onPostAdded().catch(error =>
              console.error('Error refreshing posts after viewing explorer:', error)
            );
          }
        }}
      >
        {isViewingExplorer ? 'Transaction Sent!' : config.explorerButtonLabel}
      </button>
    );
  }

  // Kontrakt niewdrozony - przycisk wylaczony z czytelnym komunikatem,
  // zamiast cichej awarii albo transakcji na pusty adres.
  if (!postingLive) {
    const message = notDeployedMessage(config);
    return (
      <button
        type="button"
        disabled
        title={message}
        aria-label={message}
        className="flex items-center justify-center px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg font-medium text-xs sm:text-sm h-[32px] bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300 border border-gray-400 dark:border-gray-500 opacity-70 cursor-not-allowed"
      >
        <span className="leading-tight whitespace-nowrap">Coming soon</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      // Przycisk nie ma tekstu - bez etykiety czytnik ekranu mowil "przycisk".
      aria-label={onChain ? `Post on ${config.networkLabel}` : `Switch to ${config.networkLabel}`}
      className={`flex items-center justify-center px-3 py-0.5 sm:px-4 sm:py-0.5 rounded-lg transition-all duration-300 font-medium text-xs sm:text-sm h-[32px] ${
        onChain ? skin.onChain : skin.offChain
      } ${disabled || isTransacting ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleSendTransaction}
      disabled={disabled || isTransacting}
    >
      {isTransacting ? (
        <>
          <Spinner className={skin.spinner(onChain)} />
          <span className="leading-tight">Processing...</span>
        </>
      ) : (
        <>
          {skin.icon(onChain)}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </>
      )}
    </button>
  );
}
