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
 * === SKAD BIERZE SIE TRESC ===
 * Nie z feedu. Tresc premium NIE jest juz zapisywana w dokumencie posta -
 * wczesniej byla, a poniewaz feed czyta posty klienckim SDK, kazdy widzial ja
 * w odpowiedzi sieciowej bez placenia. Teraz mieszka w kolekcji, ktorej klient
 * nie czyta wcale, i wydaje ja GET /api/premium po sprawdzeniu podpisanej sesji
 * oraz rekordu w `unlocks`. Ten komponent pobiera ja dopiero wtedy, gdy ma
 * podstawy sadzic, ze uzytkownik ma prawo - a i tak decyduje serwer.
 *
 * ZGODNOSC WSTECZ: posty sprzed tej zmiany maja tresc w polu `premiumContent`.
 * Ich tresc jest juz publiczna i nic tego nie cofnie, ale trasa serwerowa
 * podaje ja tak samo, wiec odblokowanie dziala bez zmian.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import { getExplorerTxLink } from '../../basechat/components/TipNetworkConfig';
import { DEFAULT_UNLOCK_TOKEN, type MonetizationToken } from '../../utils/monetization/types';
import { usePaymentFlow } from './usePaymentFlow';

export interface PremiumGateProps {
  postId: string;
  /** Autor posta - odbiorca platnosci. */
  creatorAddress: string;
  unlockPrice: string;
  unlockToken?: MonetizationToken;
  /** Wynik ZBIORCZEGO sprawdzenia z useFeedUnlocks - bez zapytania per post. */
  isUnlocked?: boolean;
  onUnlocked?: (postId: string) => void;
}

export default function PremiumGate({
  postId,
  creatorAddress,
  unlockPrice,
  unlockToken = DEFAULT_UNLOCK_TOKEN,
  isUnlocked = false,
  onUnlocked,
}: PremiumGateProps) {
  const { address, isConnected } = useAccount();
  const [justUnlocked, setJustUnlocked] = useState(false);

  // Tresc pobierana z serwera - nie ma jej w propsach i nie ma jej w feedzie.
  const [content, setContent] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const isAuthor = !!address && address.toLowerCase() === creatorAddress.toLowerCase();
  const unlocked = isUnlocked || justUnlocked || isAuthor;

  /**
   * "Ani tresci, ani bledu" znaczy dokladnie tyle, co "pobieranie trwa albo
   * zaraz sie zacznie" - wiec szkielet pokazuje sie juz w pierwszej klatce.
   * Osobny stan `isFetchingContent` byl na to za wolny: ustawial go dopiero
   * efekt PO renderze, wiec miedzy odslonieciem a startem pobierania mrugala
   * pusta ramka.
   */
  const isLoadingContent = unlocked && content === null && contentError === null;

  /**
   * Pobranie tresci. Odpalane tylko wtedy, gdy klient ma POWODY sadzic, ze
   * uzytkownik ma prawo - ale to serwer jest tu rozstrzygajacy. 401 znaczy
   * "nie wiem, kim jestes": bez podpisanej sesji nie da sie odroznic
   * placacego od kogos, kto poda cudzy adres.
   *
   * Warunek na `contentError` pilnuje, zeby nieudana proba nie zapetlila sie
   * w kolko; wyzerowanie bledu ("Try again") jest jednoczesnie sygnalem do
   * ponownego pobrania.
   */
  useEffect(() => {
    if (!unlocked || content !== null || contentError !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/premium?postId=${encodeURIComponent(postId)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = (await response.json().catch(() => ({}))) as {
          content?: string;
          error?: string;
          code?: string;
        };

        if (cancelled) return;

        if (!response.ok) {
          setContentError(
            data.code === 'session_required'
              ? 'Sign in with your wallet to read this. Paid content needs a verified signature.'
              : data.error || 'Could not load the premium content.'
          );
          return;
        }

        setContent(typeof data.content === 'string' ? data.content : '');
      } catch {
        if (!cancelled) setContentError('Could not load the premium content.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unlocked, content, contentError, postId]);

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

  // Brak sensownej ceny = post nie jest platny, nic nie rysujemy. O istnieniu
  // czesci premium decyduje juz hasPremiumContent() po stronie feedu.
  if (!unlockPrice || !(parseFloat(unlockPrice) > 0)) {
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
        {isLoadingContent ? (
          <div className="space-y-2" aria-live="polite" aria-label="Loading premium content">
            <div className="h-3 w-11/12 animate-pulse rounded bg-amber-200/60 dark:bg-amber-800/40" />
            <div className="h-3 w-8/12 animate-pulse rounded bg-amber-200/60 dark:bg-amber-800/40" />
          </div>
        ) : contentError ? (
          <div className="flex items-start justify-between gap-3">
            <p role="alert" className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              {contentError}
            </p>
            {/* Wyzerowanie bledu odpala efekt jeszcze raz. Bez tego jedna
                chwilowa awaria sieci zostawiala zaplacona tresc niedostepna
                az do przeladowania strony. */}
            <button
              type="button"
              onClick={() => setContentError(null)}
              className="shrink-0 text-xs underline text-amber-800 dark:text-amber-200"
            >
              Try again
            </button>
          </div>
        ) : content ? (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-black dark:text-white">
            {content}
          </div>
        ) : (
          // Pusta tresc to nie to samo, co blad: post jest oznaczony jako platny,
          // ale nic w nim nie ma. Puste miejsce wygladaloby jak zaciecie.
          <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/80">
            This post has no premium text.
          </p>
        )}

        {/* Informacja WIDOCZNA DLA AUTORA - to jedyna osoba decydujaca o
            zamknieciu tresci, wiec musi wiedziec, czym ta zaslona naprawde jest. */}
        {isAuthor && (
          <p className="mt-3 border-t border-amber-400/30 pt-2 text-[11px] leading-relaxed text-amber-700/90 dark:text-amber-300/80">
            This text is stored outside the feed and served only to readers who paid, so it
            is not visible in the page&apos;s network response. It is still plain text on our
            server, not end-to-end encrypted.
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
        <div role="alert" className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-red-400/50 bg-red-500/10 p-2 text-xs text-red-600 dark:text-red-300">
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
