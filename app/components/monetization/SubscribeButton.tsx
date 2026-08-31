'use client';

/**
 * Wsparcie tworcy na wybrany okres.
 *
 * === UCZCIWIE O TYM, CZYM TO JEST ===
 * To NIE jest subskrypcja odnawialna. Onchain nie ma tu cyklicznosci: jedna
 * platnosc z gory kupuje N dni i po tym czasie dostep gasnie. Nic sie nie
 * odnawia samo, nikt nie ma zgody na pobranie kolejnej kwoty. Dlatego w calym
 * UI nie pada slowo "recurring" ani "subscription" - jest "Support for 30 days"
 * i jawna data wygasniecia. Prawdziwa cyklicznosc wymagalaby spend permissions
 * (Base Account) albo subskrypcji x402.
 *
 * Platnosc idzie ta sama sciezka co tip (usePaymentFlow), a rekord zapisuje
 * dopiero POST /api/unlock/subscription po ponownej weryfikacji transakcji na
 * lancuchu. Cofnieta transakcja nie zapisuje niczego.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import { getExplorerTxLink } from '../../basechat/components/TipNetworkConfig';
import {
  SUBSCRIPTION_PERIOD_CHOICES,
  SUBSCRIPTION_PERIOD_DAYS,
  SUBSCRIPTION_TIERS,
  type SubscriptionTierId,
} from '../../utils/monetization/types';
import { getSubscriptionPrice } from '../../utils/monetization/subscriptions';
import { usePaymentFlow } from './usePaymentFlow';

export interface SubscribeButtonProps {
  creatorAddress: string;
  creatorName?: string;
  /** Wynik ZBIORCZEGO sprawdzenia z useFeedSubscriptions - bez zapytania per post. */
  isSupported?: boolean;
  /** Kiedy wygasa aktualne wsparcie (ms), jesli znane. */
  expiresAt?: number | null;
  onSubscribed?: (creatorAddress: string, expiresAt: number) => void;
  className?: string;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function SubscribeButton({
  creatorAddress,
  creatorName,
  isSupported = false,
  expiresAt = null,
  onSubscribed,
  className = '',
}: SubscribeButtonProps) {
  const { address, isConnected } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [tier, setTier] = useState<SubscriptionTierId>('supporter');
  const [periods, setPeriods] = useState<number>(SUBSCRIPTION_PERIOD_CHOICES[0]);
  const [activeUntil, setActiveUntil] = useState<number | null>(expiresAt);

  useEffect(() => { setActiveUntil(expiresAt); }, [expiresAt]);

  const days = SUBSCRIPTION_PERIOD_DAYS * periods;
  const amount = getSubscriptionPrice(tier, periods);
  const displayName = creatorName || `${creatorAddress.slice(0, 6)}...${creatorAddress.slice(-4)}`;

  /**
   * Co uzytkownik faktycznie oplacil - zamrozone w chwili wyslania transakcji.
   *
   * Bez tego zmiana poziomu albo dlugosci wsparcia w trakcie potwierdzania
   * transakcji zmieniala tresc zgloszenia wysylanego PO potwierdzeniu:
   * portfel placil za "Supporter / 30 dni", a serwer dostawal "Patron / 90 dni".
   * Serwer liczy cene sam z (tier, periods) i porownuje ja z kwota na lancuchu,
   * wiec konczylo sie to odrzuceniem 402 - pieniadze wyszly, wsparcie nie
   * zostalo zapisane.
   */
  const paidOrderRef = useRef<{ tier: SubscriptionTierId; periods: number; days: number } | null>(null);

  const recordSubscription = useCallback(
    async (txHash: `0x${string}`) => {
      const order = paidOrderRef.current ?? { tier, periods, days };
      const response = await fetch('/api/unlock/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriberAddress: address,
          creatorAddress,
          tier: order.tier,
          periods: order.periods,
          txHash,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Support could not be recorded');
      }
      const newExpiresAt = data?.subscription?.expiresAt ?? Date.now() + order.days * 24 * 60 * 60 * 1000;
      setActiveUntil(newExpiresAt);
      onSubscribed?.(creatorAddress, newExpiresAt);
      toast.success(`You are supporting ${displayName} until ${formatDate(newExpiresAt)}`);
    },
    [address, creatorAddress, tier, periods, days, displayName, onSubscribed]
  );

  const { phase, error, txHash, isBusy, isOnBase, switchToBase, pay, reset } = usePaymentFlow(recordSubscription);

  /** Zamraza zamowienie i dopiero potem wysyla platnosc. */
  const payForCurrentSelection = useCallback(() => {
    paidOrderRef.current = { tier, periods, days };
    pay({ to: creatorAddress, amount, token: 'USDC' });
  }, [tier, periods, days, pay, creatorAddress, amount]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    reset();
  }, [reset]);

  // Escape zamyka modal. Dotad jedynym wyjsciem byla mysz - klawiatura zostawala
  // uwieziona w oknie, ktore prosi o pieniadze.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closeModal]);

  const isSelf = !!address && address.toLowerCase() === creatorAddress.toLowerCase();
  if (!isConnected || isSelf) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`flex items-center space-x-1 rounded-pill transition-[color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary touch-manipulation ${className}`}
        title={isSupported ? 'You are supporting this creator' : 'Support this creator for a fixed period'}
        // Ponizej progu `md` w przycisku jest samo emoji, ktore czytnik ekranu
        // przeczytalby jako "fioletowe serce".
        aria-label={isSupported ? 'Supporting this creator' : 'Support this creator'}
      >
        <span className="md:hidden text-sm" aria-hidden="true">{isSupported ? '💜' : '🤝'}</span>
        <svg aria-hidden="true" className="hidden md:block w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        {/* Prog `sm:`, nie `md:` - taki sam jak w calym pasku akcji pod postem
            (ACTION_LABEL w PostList.tsx). Inaczej miedzy 576 a 768 px ten
            przycisk jako jedyny pokazywal napis, a sasiednie juz nie.
            Wyrownanie u zrodla zamiast selektora potomnego z zewnatrz. */}
        <span className="hidden sm:inline text-xs">{isSupported ? 'Supporting' : 'Support'}</span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Support ${displayName}`}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overscroll-contain"
          >
            {/* Tlo zamyka klikiem, ale nie jest przystankiem Taba ani wpisem
                w drzewie dostepnosci - te sama akcje ma przycisk zamkniecia
                i klawisz Escape. */}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 bg-soft-ink/50 backdrop-blur-sm"
              onClick={closeModal}
            />

            <div
              className="relative w-full max-w-sm mx-auto bg-soft-surface rounded-card shadow-float border border-soft-line font-soft p-5 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-soft-display text-lg font-semibold text-soft-ink">
                  🤝{' '}
                  {/* Nazwa na plaskim kolorze, nie na gradiencie z bg-clip-text:
                      ta technika potrafi wyrenderowac czarny prostokat na Androidzie. */}
                  <span className="text-soft-primary-deep">
                    Support {displayName}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Close"
                  className="text-soft-ink-muted hover:text-soft-ink bg-soft-sunken rounded-pill p-2 border border-soft-line transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
                >
                  <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {activeUntil && activeUntil > Date.now() && (
                <div className="mb-4 p-3 rounded-card bg-soft-sunken border border-soft-line text-soft-ink text-sm">
                  You already support this creator until <strong>{formatDate(activeUntil)}</strong>. Paying again adds
                  more days on top.
                </div>
              )}

              {/* Poziom wsparcia */}
              <div className="mb-4">
                <label className="block font-soft-display text-sm font-semibold text-soft-ink mb-2">Level</label>
                <div className="space-y-2">
                  {SUBSCRIPTION_TIERS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTier(option.id)}
                      className={`w-full text-left px-3 py-2 rounded-card border transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                        tier === option.id
                          ? 'bg-soft-sunken border-soft-primary shadow-chip'
                          : 'bg-soft-surface border-soft-line hover:border-soft-line-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-soft-ink">{option.label}</span>
                        <span className="font-soft-display text-sm tabular-nums text-soft-ink-muted">
                          ${option.pricePerPeriod} / {SUBSCRIPTION_PERIOD_DAYS} days
                        </span>
                      </div>
                      <div className="text-xs text-soft-ink-soft">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dlugosc wsparcia */}
              <div className="mb-4">
                <label className="block font-soft-display text-sm font-semibold text-soft-ink mb-2">How long</label>
                <div className="flex gap-2">
                  {SUBSCRIPTION_PERIOD_CHOICES.map(choice => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setPeriods(choice)}
                      className={`flex-1 px-2 py-2 font-soft-display text-sm font-semibold tabular-nums rounded-pill border transition-[background-color,border-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                        periods === choice
                          ? 'bg-soft-sunken border-soft-primary text-soft-primary-deep'
                          : 'bg-soft-surface border-soft-line text-soft-ink-muted hover:border-soft-line-strong'
                      }`}
                    >
                      {choice * SUBSCRIPTION_PERIOD_DAYS} days
                    </button>
                  ))}
                </div>
              </div>

              {/* JAWNE postawienie sprawy: to nie jest odnawialna subskrypcja. */}
              <div className="mb-4 p-3 rounded-card bg-soft-sunken border border-soft-line text-xs text-soft-ink-muted space-y-1">
                <div>
                  You pay <strong>{amount} USDC once</strong> and support {displayName} for <strong>{days} days</strong>
                  .
                </div>
                <div>
                  Access ends on <strong>{formatDate(Date.now() + days * 24 * 60 * 60 * 1000)}</strong>. Nothing renews
                  automatically and no one can charge your wallet again - come back and pay if you want to continue.
                </div>
              </div>

              {phase === 'error' && error && (
                <div role="alert" className="mb-3 p-3 rounded-card bg-red-500/10 border border-red-400/50 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {phase === 'success' && (
                <div role="status" className="mb-3 p-3 rounded-card bg-soft-accent-soft border border-soft-accent/60 text-soft-accent-deep text-sm text-center">
                  ✅ Support recorded
                </div>
              )}

              {!isOnBase ? (
                <button
                  type="button"
                  onClick={switchToBase}
                  className="w-full px-6 py-3 text-base font-semibold rounded-pill bg-soft-accent-deep text-white shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:brightness-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
                >
                  Switch to Base
                </button>
              ) : (
                <button
                  type="button"
                  onClick={payForCurrentSelection}
                  disabled={isBusy}
                  className="w-full px-6 py-3 text-base font-semibold rounded-pill bg-soft-primary text-white shadow-chip transition-[background-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:bg-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
                >
                  {phase === 'signing'
                    ? 'Confirm in wallet...'
                    : phase === 'confirming'
                    ? 'Waiting for confirmation...'
                    : phase === 'recording'
                    ? 'Saving...'
                    : `Support for ${days} days - ${amount} USDC`}
                </button>
              )}

              {/* Link takze przy bledzie - patrz komentarz w PremiumGate. */}
              {txHash && (
                <a
                  href={getExplorerTxLink('base', txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block rounded-pill text-center text-xs font-semibold text-soft-primary-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                >
                  View transaction
                </a>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
