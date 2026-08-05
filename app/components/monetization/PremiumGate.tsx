'use client';

/**
 * Zaslona nad premium czescia posta (tip-to-unlock).
 *
 * Zasada: post BEZ pol premium nie renderuje tego komponentu w ogole - stan
 * feedu sprzed monetyzacji wyglada i dziala dokladnie tak samo.
 *
 * Platnosc idzie ta sama sciezka co tip (usePaymentFlow: useSendTransaction ->
 * useWaitForTransactionReceipt), a odblokowanie zapisuje dopiero POST
 * /api/unlock, ktory jeszcze raz sprawdza transakcje na lancuchu. Cofnieta
 * transakcja nie odblokowuje niczego.
 *
 * === CZEGO TO NIE ROBI ===
 * To jest paywall, a nie szyfrowanie. `premiumContent` siedzi w dokumencie
 * posta, a feed czyta posty bezposrednio z Firestore klienckim SDK - kto
 * zajrzy do odpowiedzi sieciowej, zobaczy tresc bez placenia. Zamkniecie tego
 * wymaga przeniesienia `premiumContent` do osobnej kolekcji, ktorej klient nie
 * czyta, i wydawania jej przez trase serwerowa po sprawdzeniu sesji
 * (app/utils/auth/session.ts) i rekordu w `unlocks`. Sesje nie sa jeszcze
 * wystawiane, wiec ten krok czeka na wpiecie logowania.
 */

import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import { getExplorerTxLink } from '../../basechat/components/TipNetworkConfig';
import { DEFAULT_UNLOCK_TOKEN, type MonetizationToken } from '../../utils/monetization/types';
import { usePaymentFlow } from './usePaymentFlow';

export interface PremiumGateProps {
  postId: string;
  /** Autor posta - odbiorca platnosci. */
  creatorAddress: string;
  premiumContent: string;
  unlockPrice: string;
  unlockToken?: MonetizationToken;
  /** Wynik ZBIORCZEGO sprawdzenia z useFeedUnlocks - bez zapytania per post. */
  isUnlocked?: boolean;
  onUnlocked?: (postId: string) => void;
}

export default function PremiumGate({
  postId,
  creatorAddress,
  premiumContent,
  unlockPrice,
  unlockToken = DEFAULT_UNLOCK_TOKEN,
  isUnlocked = false,
  onUnlocked,
}: PremiumGateProps) {
  const { address, isConnected } = useAccount();
  const [justUnlocked, setJustUnlocked] = useState(false);

  const isAuthor = !!address && address.toLowerCase() === creatorAddress.toLowerCase();
  const unlocked = isUnlocked || justUnlocked || isAuthor;

  const recordUnlock = useCallback(
    async (txHash: `0x${string}`) => {
      const response = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, walletAddress: address, txHash }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Unlock could not be recorded');
      }
      setJustUnlocked(true);
      onUnlocked?.(postId);
      toast.success('Premium content unlocked');
    },
    [postId, address, onUnlocked]
  );

  const { phase, error, txHash, isBusy, isOnBase, switchToBase, pay, reset } = usePaymentFlow(recordUnlock);

  // Brak tresci premium albo brak sensownej ceny = post zwykly, nic nie rysujemy.
  if (!premiumContent || !unlockPrice || !(parseFloat(unlockPrice) > 0)) {
    return null;
  }

  const priceLabel = `${unlockPrice} ${unlockToken}`;

  if (unlocked) {
    return (
      <div className="my-3 rounded-xl border border-amber-400/40 bg-amber-50/60 dark:bg-amber-900/10 p-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          <span>🔓</span>
          <span>{isAuthor ? 'Premium content (yours)' : 'Premium content unlocked'}</span>
        </div>
        <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-black dark:text-white">
          {premiumContent}
        </div>

        {/* Ostrzezenie WIDOCZNE DLA AUTORA. To jest jedyna osoba, ktora podejmuje
            decyzje o zamknieciu tresci, wiec musi wiedziec, czym ta zaslona
            naprawde jest. Ukrycie tego w komentarzu w kodzie byloby wprowadzaniem
            w blad kogos, kto liczy na ochrone tresci. */}
        {isAuthor && (
          <p className="mt-3 border-t border-amber-400/30 pt-2 text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/80">
            This hides the text behind a payment, but it does not encrypt it. Anyone
            technical enough to read the page&apos;s network response can see it without
            paying. Do not put anything here you could not afford to have public.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-amber-400/40 bg-gradient-to-b from-amber-50/70 to-white dark:from-amber-900/15 dark:to-gray-900/40 p-4">
      {/* Rozmyty podglad - sygnalizuje, ze cos tam jest, ale nic nie zdradza.
          Tresc premium NIE jest tu renderowana; przychodzi dopiero z serwera
          w dokumencie posta, gdy uzytkownik ma do niej prawo. */}
      <div className="relative mb-3 select-none" aria-hidden="true">
        <div className="blur-sm opacity-60 space-y-2">
          <div className="h-3 w-11/12 rounded bg-gray-300 dark:bg-gray-700" />
          <div className="h-3 w-9/12 rounded bg-gray-300 dark:bg-gray-700" />
          <div className="h-3 w-10/12 rounded bg-gray-300 dark:bg-gray-700" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-medium text-amber-800 dark:text-amber-200">🔒 Premium part of this post</div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            One-time payment of {priceLabel} to the author. No subscription, no token.
          </div>
        </div>

        {!isConnected ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">Connect your wallet to unlock</span>
        ) : !isOnBase ? (
          <button
            type="button"
            onClick={switchToBase}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors"
          >
            Switch to Base
          </button>
        ) : (
          <button
            type="button"
            onClick={() => pay({ to: creatorAddress, amount: unlockPrice, token: unlockToken })}
            disabled={isBusy}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-[#0052FF] text-white transition-colors hover:bg-[#0052FF]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === 'signing'
              ? 'Confirm in wallet...'
              : phase === 'confirming'
              ? 'Waiting for confirmation...'
              : phase === 'recording'
              ? 'Unlocking...'
              : `Unlock for ${priceLabel}`}
          </button>
        )}
      </div>

      {phase === 'error' && error && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-red-400/50 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-300">
          <span>{error}</span>
          <button type="button" onClick={reset} className="underline shrink-0">
            Try again
          </button>
        </div>
      )}

      {txHash && phase !== 'error' && (
        <a
          href={getExplorerTxLink('base', txHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs text-blue-500 hover:underline"
        >
          View transaction
        </a>
      )}
    </div>
  );
}
