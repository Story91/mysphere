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

import { useCallback, useEffect, useState } from 'react';
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

  const recordSubscription = useCallback(
    async (txHash: `0x${string}`) => {
      const response = await fetch('/api/unlock/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriberAddress: address,
          creatorAddress,
          tier,
          periods,
          txHash,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Support could not be recorded');
      }
      const newExpiresAt = data?.subscription?.expiresAt ?? Date.now() + days * 24 * 60 * 60 * 1000;
      setActiveUntil(newExpiresAt);
      onSubscribed?.(creatorAddress, newExpiresAt);
      toast.success(`You are supporting ${displayName} until ${formatDate(newExpiresAt)}`);
    },
    [address, creatorAddress, tier, periods, days, displayName, onSubscribed]
  );

  const { phase, error, txHash, isBusy, isOnBase, switchToBase, pay, reset } = usePaymentFlow(recordSubscription);

  const isSelf = !!address && address.toLowerCase() === creatorAddress.toLowerCase();
  if (!isConnected || isSelf) return null;

  const closeModal = () => {
    setIsOpen(false);
    reset();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`flex items-center space-x-1 hover:text-purple-500 active:text-purple-600 transition-colors touch-manipulation ${className}`}
        title={isSupported ? 'You are supporting this creator' : 'Support this creator for a fixed period'}
      >
        <span className="md:hidden text-sm">{isSupported ? '💜' : '🤝'}</span>
        <svg className="hidden md:block w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        <span className="hidden md:inline text-xs">{isSupported ? 'Supporting' : 'Support'}</span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overscroll-contain">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />

            <div
              className="relative w-full max-w-sm mx-auto bg-gradient-to-br from-gray-900 via-black to-purple-900 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-5 max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-light text-white">
                  🤝{' '}
                  <span className="bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
                    Support {displayName}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-purple-300 hover:text-purple-100 transition-colors bg-white/10 rounded-full p-2 border border-purple-400/30"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {activeUntil && activeUntil > Date.now() && (
                <div className="mb-4 p-3 rounded-xl bg-purple-500/20 border border-purple-400/50 text-purple-100 text-sm">
                  You already support this creator until <strong>{formatDate(activeUntil)}</strong>. Paying again adds
                  more days on top.
                </div>
              )}

              {/* Poziom wsparcia */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-purple-200 mb-2">Level</label>
                <div className="space-y-2">
                  {SUBSCRIPTION_TIERS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTier(option.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                        tier === option.id
                          ? 'bg-purple-500/30 border-purple-400/60 shadow-[0_0_15px_rgba(168,85,247,0.35)]'
                          : 'bg-white/10 border-white/20 hover:bg-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-purple-100">{option.label}</span>
                        <span className="text-sm text-purple-200">
                          ${option.pricePerPeriod} / {SUBSCRIPTION_PERIOD_DAYS} days
                        </span>
                      </div>
                      <div className="text-xs text-purple-300/70">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dlugosc wsparcia */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-purple-200 mb-2">How long</label>
                <div className="flex gap-2">
                  {SUBSCRIPTION_PERIOD_CHOICES.map(choice => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setPeriods(choice)}
                      className={`flex-1 px-2 py-2 text-sm rounded-xl border transition-all text-purple-100 ${
                        periods === choice
                          ? 'bg-purple-500/30 border-purple-400/60'
                          : 'bg-white/10 border-purple-400/30 hover:bg-purple-500/20'
                      }`}
                    >
                      {choice * SUBSCRIPTION_PERIOD_DAYS} days
                    </button>
                  ))}
                </div>
              </div>

              {/* JAWNE postawienie sprawy: to nie jest odnawialna subskrypcja. */}
              <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/15 text-xs text-purple-200/90 space-y-1">
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
                <div className="mb-3 p-3 rounded-xl bg-red-500/15 border border-red-400/50 text-red-200 text-sm">
                  {error}
                </div>
              )}

              {phase === 'success' && (
                <div className="mb-3 p-3 rounded-xl bg-green-500/20 border border-green-400/50 text-green-200 text-sm text-center">
                  ✅ Support recorded
                </div>
              )}

              {!isOnBase ? (
                <button
                  type="button"
                  onClick={switchToBase}
                  className="w-full px-6 py-3 text-base font-medium rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors"
                >
                  Switch to Base
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => pay({ to: creatorAddress, amount, token: 'USDC' })}
                  disabled={isBusy}
                  className="w-full px-6 py-3 text-base font-medium rounded-xl bg-[#0052FF] text-white transition-colors hover:bg-[#0052FF]/90 disabled:cursor-not-allowed disabled:opacity-50"
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

              {txHash && phase !== 'error' && (
                <a
                  href={getExplorerTxLink('base', txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 block text-center text-xs text-blue-300 hover:underline"
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
