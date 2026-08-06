'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useBalance, useSwitchChain } from 'wagmi';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { toast } from 'react-hot-toast';
import { X, Crown } from 'lucide-react';
import { describeWalletError } from '../../../components/useTxFeedback';
import { getAllDurations, calculateTotalCost, calculateExpirationTime } from '../utils/pinPricing';
import { createPaidPin, canPinPost, PinDuration } from '../../../utils/firebase';
// Base Pay imports
import { pay, getPaymentStatus } from '@base-org/account';
import { BasePayButton } from '@base-org/account-ui/react';

// Smart Contract Integration
import { PAID_PIN_CONTRACT_CONFIG, PAID_PIN_CONTRACT_ABI, toContractDuration } from '../config/contractConfig';

/**
 * ODBIORCA PIENIEDZY za przypiete posty (Base Pay). To NIE jest brama
 * uprawnien i celowo NIE jest tym samym co ADMIN_ADDRESS.
 *
 * Do 6 sierpnia 2026 obie wartosci byly identyczne. Uprawnienia admina
 * przeniesiono wtedy na 0xD4885A...030e, a ten adres zostal - bo "kto moze
 * moderowac" i "na jakie konto wplywaja platnosci" to dwie osobne decyzje
 * i wlasciciel podjal tylko pierwsza.
 *
 * NIE ZMIENIAJ tego "dla spojnosci" z ADMIN_ADDRESS. Zmiana tej stalej
 * przekierowuje prawdziwe pieniadze na inny portfel i wymaga osobnej decyzji.
 */
const MYSPHERE_ADDRESS = '0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd';

// Pin jest kupowany i rozliczany wylacznie na Base Mainnet.
const PIN_CHAIN_ID = PAID_PIN_CONTRACT_CONFIG.chainId;

// Base Pay potrafi wisiec w 'pending'. Bez limitu odpytywalismy w nieskonczonosc.
const BASE_PAY_POLL_INTERVAL_MS = 2000;
const BASE_PAY_POLL_TIMEOUT_MS = 5 * 60 * 1000;

/** Co uzytkownik faktycznie kupil - zamrozone w chwili platnosci. */
interface PinOrder {
  duration: PinDuration;
  amount: string;
}


interface PaidPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postContent: string;
  authorAddress: string;
  onPinSuccess?: (txHash: string, duration: PinDuration) => void;
}

export default function PaidPinModal({
  isOpen,
  onClose,
  postId,
  postContent,
  authorAddress,
  onPinSuccess
}: PaidPinModalProps) {
  const { address, chain } = useAccount();
  const { data: balance } = useBalance({ address });
  const { switchChainAsync } = useSwitchChain();

  const [selectedDuration, setSelectedDuration] = useState<PinDuration>('HOURS_24');
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: hash, writeContractAsync } = useWriteContract();

  // Paragon czytamy zawsze z Base - inaczej po recznej zmianie sieci w portfelu
  // czekalibysmy na potwierdzenie na lancuchu, na ktorym transakcji nie ma.
  //
  // UWAGA: `isSuccess` z tego hooka znaczy "udalo sie POBRAC paragon", a nie
  // "transakcja sie powiodla". Cofnieta transakcja tez ma paragon, tylko ze
  // `status: 'reverted'` - i wlasnie dlatego pin byl zapisywany po transakcji,
  // ktora nic nie zaplacila. O sukcesie decyduje `receipt.status`.
  const {
    data: receipt,
    isLoading: isConfirming,
    isError: isReceiptError,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash,
    chainId: PIN_CHAIN_ID,
  });

  // Zamowienie zamrozone w chwili wyslania platnosci. Bez tego zmiana wyboru
  // w trakcie potwierdzania zapisywala do Firestore inny czas niz oplacony.
  const paidOrderRef = useRef<PinOrder | null>(null);
  // Jedna transakcja = jeden zapis pinu, nawet gdy hook przeliczy paragon ponownie.
  const recordedHashRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (hash && isConfirming) {
      toast.loading('Processing transaction... Please wait.', { id: hash });
    }
  }, [hash, isConfirming]);

  useEffect(() => {
    if (!hash || !receipt) return;
    if (recordedHashRef.current === hash) return;
    recordedHashRef.current = hash;

    if (receipt.status !== 'success') {
      // Transakcja weszla na lancuch i sie cofnela - nic nie zostalo zaplacone,
      // wiec nic nie zapisujemy.
      paidOrderRef.current = null;
      toast.error(
        `Transaction reverted on-chain - the post was not pinned and nothing was charged. Transaction: ${hash}`,
        { id: hash, duration: 10000 }
      );
      setIsProcessing(false);
      return;
    }

    toast.success('Transaction successful! Your post will be pinned in ~5 minutes.', { id: hash, duration: 6000 });
    void recordPaidPin(hash, paidOrderRef.current);
    // recordPaidPin czyta wylacznie zamrozone zamowienie i propsy, wiec nie
    // potrzebuje byc zaleznoscia efektu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, receipt]);

  /**
   * Paragonu nie da sie pobrac (padl RPC, uzytkownik stracil siec). Bez tego
   * `isProcessing` zostawalo prawda na zawsze, a przycisk pokazywal
   * "Processing..." do przeladowania strony - mimo ze transakcja mogla sie
   * juz dawno potwierdzic.
   */
  useEffect(() => {
    if (!hash || !isReceiptError) return;
    if (recordedHashRef.current === hash) return;
    recordedHashRef.current = hash;

    console.error('Failed to read pin transaction receipt:', receiptError);
    toast.error(
      `We lost track of your transaction before it was confirmed. Check it in the explorer and keep the hash: ${hash}`,
      { id: hash, duration: 10000 }
    );
    setIsProcessing(false);
  }, [hash, isReceiptError, receiptError]);

  /** Zapis pinu po potwierdzonej platnosci. Uzywa zamrozonego zamowienia. */
  const recordPaidPin = async (txHash: string, order: PinOrder | null) => {
    if (!address || !order) {
      // Pieniadze juz poszly - uzytkownik musi dostac dowod, a nie ciszę.
      toast.error(
        `Payment confirmed but the pin could not be saved. Keep this transaction: ${txHash}`,
        { id: txHash, duration: 10000 }
      );
      setIsProcessing(false);
      return;
    }

    const success = await createPaidPin(
      postId,
      address,
      order.duration,
      txHash,
      order.amount,
      PIN_CHAIN_ID
    );

    if (success) {
      toast.success('Post pinned successfully!', { id: txHash });
      onPinSuccess?.(txHash, order.duration);
      setIsProcessing(false);
      onClose();
      return;
    }

    toast.error(
      `Payment confirmed but saving the pin failed. Keep this transaction: ${txHash}`,
      { id: txHash, duration: 10000 }
    );
    setIsProcessing(false);
  };

  // Function to ensure we're on Base network before transaction
  const ensureBaseNetwork = async (): Promise<boolean> => {
    if (chain?.id === PIN_CHAIN_ID) return true;

    try {
      // switchChainAsync, nie switchChain: wariant synchroniczny nie odrzuca
      // obietnicy, wiec odmowa w portfelu przechodzila jako sukces i platnosc
      // szla na zla siec.
      await switchChainAsync({ chainId: PIN_CHAIN_ID });
      return true;
    } catch (error) {
      console.error('Failed to switch to Base network:', error);
      toast.error('Please switch to Base network manually');
      return false;
    }
  };

  const handlePayAndPin = async () => {
    if (!address || !canPin || !hasEnoughBalance || isProcessing) return;

    setIsProcessing(true);

    try {
      // Ensure we're on Base network first
      const switched = await ensureBaseNetwork();
      if (!switched) {
        setIsProcessing(false);
        return;
      }

      const canPostBePinned = await canPinPost(postId);
      if (!canPostBePinned) {
        toast.error('This post is already pinned or cannot be pinned');
        setIsProcessing(false);
        return;
      }

      const order: PinOrder = { duration: selectedDuration, amount: selectedPrice.ethAmount };
      paidOrderRef.current = order;
      recordedHashRef.current = null;

      await writeContractAsync({
        address: PAID_PIN_CONTRACT_CONFIG.address as `0x${string}`,
        abi: PAID_PIN_CONTRACT_ABI,
        functionName: 'pinPost',
        args: [postId, toContractDuration(order.duration)],
        value: parseEther(order.amount),
        // Wymus lancuch takze na poziomie wagmi - portfel mogl przelaczyc siec
        // miedzy sprawdzeniem a podpisem.
        chainId: PIN_CHAIN_ID,
      });
      // Dalszy ciag w efekcie obserwujacym potwierdzenie transakcji.

    } catch (error) {
      paidOrderRef.current = null;
      console.error('Error initiating pin transaction:', error);
      // Surowy `error.message` z viem to kilkanascie linii z docs URL i pelnymi
      // argumentami wywolania. Odmowa podpisu nie jest awaria - nie pokazujemy
      // jej na czerwono.
      const info = describeWalletError(error, { network: 'Base', gasSymbol: 'ETH' });
      if (info.isFailure) {
        toast.error(info.message || 'Failed to start transaction. Please try again.');
      } else {
        toast(info.message);
      }
      setIsProcessing(false);
    }
  };

  /** Odpytuje Base Pay o status platnosci do skutku albo do limitu czasu. */
  const waitForBasePayment = async (paymentId: string): Promise<void> => {
    const deadline = Date.now() + BASE_PAY_POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise<void>(resolve => {
        pollTimerRef.current = setTimeout(resolve, BASE_PAY_POLL_INTERVAL_MS);
      });
      if (!isMountedRef.current) return;

      // `status` czytamy w try (blad sieci nie moze przerwac pilnowania
      // oplaconej platnosci), ale decyzje podejmujemy JUZ POZA nim. Wczesniej
      // `throw new Error('Payment failed')` stalo w srodku try i wpadalo we
      // wlasny catch: odrzucona platnosc byla odpytywana dalej przez pelne
      // piec minut i konczyla sie komunikatem "confirmation timed out",
      // czyli nie ta przyczyna.
      let status: string | undefined;
      try {
        ({ status } = await getPaymentStatus({ id: paymentId, testnet: false }));
      } catch (error) {
        console.error('Error checking payment status:', error);
      }

      if (!isMountedRef.current) return;
      if (status === 'completed') return;
      if (status === 'failed') throw new Error('Payment was rejected by Base Pay');
    }

    throw new Error('Payment confirmation timed out');
  };

  const handleBasePayAndPin = async () => {
    if (!address || !canPin || isProcessing) return;

    setIsProcessing(true);

    try {
      const switched = await ensureBaseNetwork();
      if (!switched) {
        setIsProcessing(false);
        return;
      }

      const canPostBePinned = await canPinPost(postId);
      if (!canPostBePinned) {
        toast.error('This post is already pinned or cannot be pinned');
        setIsProcessing(false);
        return;
      }

      const order: PinOrder = { duration: selectedDuration, amount: selectedPrice.usdcAmount.toString() };

      const paymentResult = await pay({
        amount: order.amount,
        to: MYSPHERE_ADDRESS,
        testnet: false
      });

      // Bezpieczne wydobycie ID z różnych możliwych struktur PaymentResult
      const paymentId = String(
        (paymentResult as any)?.id ||
        (paymentResult as any)?.paymentId ||
        (paymentResult as any)?.transactionId ||
        paymentResult
      );

      await waitForBasePayment(paymentId);
      if (!isMountedRef.current) return;

      const success = await createPaidPin(postId, address, order.duration, paymentId, order.amount, PIN_CHAIN_ID);
      if (!isMountedRef.current) return;

      if (success) {
        toast.success(`Post pinned for $${selectedPrice.usdcAmount.toFixed(2)} USDC via Base Pay! 🎉`);
        onPinSuccess?.(paymentId, order.duration);
        setIsProcessing(false);
        onClose();
        return;
      }

      toast.error(`Payment confirmed but saving the pin failed. Keep this payment id: ${paymentId}`, { duration: 10000 });
      setIsProcessing(false);
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error('Base Pay error:', error);
      toast.error(`Base Pay failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
    }
  };

  const durations = getAllDurations();
  const selectedPrice = calculateTotalCost(selectedDuration);
  const expirationTime = calculateExpirationTime(selectedDuration);

  const isCorrectNetwork = chain?.id === PIN_CHAIN_ID;
  const hasEnoughBalance = balance && parseFloat(balance.formatted) >= parseFloat(selectedPrice.ethAmount);
  const canPin = address && address.toLowerCase() === authorAddress.toLowerCase();
  
  const getButtonState = () => {
    if (!isCorrectNetwork) return { text: 'Wrong Network', disabled: true };
    if (isProcessing) return { text: 'Processing...', disabled: true };
    if (!canPin) return { text: 'Not Your Post', disabled: true };
    if (!hasEnoughBalance) return { text: 'Insufficient Balance', disabled: true };
    return { text: 'Pay & Pin', disabled: false };
  };
  
  const buttonState = getButtonState();

  useEffect(() => {
    // Reset form when modal opens
    if (isOpen) {
      setSelectedDuration('HOURS_24');
      setIsProcessing(false);
      
      // Blokuj scroll na body kiedy modal jest otwarty
      document.body.style.overflow = 'hidden';
    } else {
      // Przywróć scroll gdy modal jest zamknięty
      document.body.style.overflow = 'auto';
    }
    
    // Cleanup przy unmount
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  // Escape zamyka okno. Dotad jedynym wyjsciem bylo klikniecie myszka w tlo albo
  // w krzyzyk - klawiatura zostawala uwieziona w oknie proszacym o pieniadze.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-soft-ink/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-[99999] p-2 sm:p-4 pt-4 sm:pt-4"
      onClick={onClose}
      style={{ 
        isolation: 'isolate',
        zIndex: 99999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pin your post"
        className="bg-soft-surface rounded-card shadow-float font-soft w-full max-w-[92vw] sm:max-w-md max-h-[92vh] sm:max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          zIndex: 99999,
          position: 'relative'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-soft-line">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-soft-accent rounded-pill flex items-center justify-center">
              <Crown className="w-5 h-5 text-soft-ink" />
            </div>
            <div>
              <h3 className="font-soft-display text-lg font-bold text-soft-ink">
                Pin Your Post
              </h3>
              <p className="text-sm text-soft-ink-muted">
                Get premium visibility
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close pin dialog"
            className="rounded-pill p-1 text-soft-ink-soft transition-[color,transform] duration-[--dur-press] ease-out-strong hover:text-soft-ink active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Post Preview */}
          <div className="p-3 sm:p-6 border-b border-soft-line">
            <div className="bg-soft-sunken rounded-card p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-soft-ink-muted mb-2">Post to pin:</p>
              <p className="text-sm sm:text-base text-soft-ink line-clamp-2 sm:line-clamp-3">
                {postContent}
              </p>
            </div>
          </div>



          {/* Duration Selection */}
          <div className="p-3 sm:p-6">
                      <h4 className="font-soft-display text-sm sm:text-md font-semibold text-soft-ink mb-3 sm:mb-4">
              Choose Duration
            </h4>
            
            <div className="space-y-2 sm:space-y-3" role="radiogroup" aria-label="Pin duration">
            {durations.map((duration) => {
              const cost = calculateTotalCost(duration.duration);
              const isSelected = selectedDuration === duration.duration;

              return (
                <button
                  key={duration.duration}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  // Wybor jest zamrazany przy platnosci, ale blokada w trakcie
                  // przetwarzania oszczedza uzytkownikowi mylacego widoku.
                  disabled={isProcessing}
                  className={`relative w-full text-left border-2 rounded-card p-3 sm:p-4 cursor-pointer transition-[background-color,border-color,transform] duration-[--dur-press] ease-out-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 ${
                    isSelected
                      ? 'border-soft-accent bg-soft-accent-soft'
                      : 'border-soft-line hover:border-soft-line-strong'
                  }`}
                  onClick={() => setSelectedDuration(duration.duration)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        isSelected
                          ? 'border-soft-accent-deep bg-soft-accent-deep'
                          : 'border-soft-line-strong'
                      }`}>
                        {isSelected && (
                          <div className="w-full h-full rounded-full bg-white scale-50"></div>
                        )}
                      </div>
                      <div>
                        <p className="font-soft-display text-sm sm:text-base font-semibold text-soft-ink">
                          {duration.label}
                        </p>
                        <p className="text-xs sm:text-sm text-soft-ink-muted">
                          {duration.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-soft-display text-sm sm:text-base font-bold tabular-nums text-soft-ink">
                        {cost.ethAmount} ETH
                      </p>
                      <p className="font-soft-display text-xs sm:text-sm tabular-nums text-soft-ink-muted">
                        ~${cost.usdAmount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  {/* Popular badge dla 24h */}
                  {duration.duration === 'HOURS_24' && (
                    <div className="absolute -top-2 -right-2 bg-soft-primary text-white font-soft-display text-xs font-bold px-2.5 py-1 rounded-pill">
                      POPULAR
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Summary */}
          <div className="mt-6 bg-soft-sunken rounded-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-soft-ink-muted">Duration:</span>
              <span className="font-soft-display font-semibold text-soft-ink">
                {durations.find(d => d.duration === selectedDuration)?.label}
              </span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-soft-ink-muted">Expires at:</span>
              <span className="font-soft-display font-semibold tabular-nums text-soft-ink">
                {new Date(expirationTime).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-soft-ink-muted">Total cost:</span>
              <div className="text-right">
                <span className="font-soft-display font-bold tabular-nums text-soft-ink">
                  {selectedPrice.ethAmount} ETH
                </span>
                <span className="font-soft-display text-sm tabular-nums text-soft-ink-muted ml-2">
                  (~${selectedPrice.usdAmount.toFixed(2)})
                </span>
              </div>
            </div>
          </div>

          {/* Balance Check */}
          {balance && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-soft-ink-muted">Your balance:</span>
              <span className={`font-soft-display font-semibold tabular-nums ${
                hasEnoughBalance
                  ? 'text-soft-ink'
                  : 'text-red-700'
              }`}>
                {parseFloat(balance.formatted).toFixed(4)} ETH
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="p-4 sm:p-6 bg-soft-sunken border-t border-soft-line">
          {/* ETH Payment Button */}
          <button
            onClick={handlePayAndPin}
            disabled={buttonState.disabled}
            className={`w-full py-3 mt-4 font-soft-display font-bold rounded-pill transition-[background-color,box-shadow,transform] duration-[--dur-press] ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2
              ${buttonState.disabled
                ? 'bg-soft-line text-soft-ink-soft cursor-not-allowed'
                : 'bg-soft-accent text-soft-ink shadow-chip hover:shadow-float active:scale-[0.97]'}`
            }
          >
            {buttonState.text}
          </button>

          {/* Base Pay Button - 50% cheaper alternative */}
          <div className="mt-4">
            <div className="text-center mb-2">
              <span className="text-xs text-soft-ink-muted">Or pay with Base Pay </span>
              <span className="text-xs text-soft-accent-deep font-semibold">(50% cheaper - ${selectedPrice.usdcAmount.toFixed(2)} USDC!)</span>
            </div>
            {/* BasePayButton nie przyjmuje `disabled`, wiec blokujemy wrapperem
                i strazą w handlerze - inaczej drugie kliknieciu placilo drugi raz. */}
            <div className={isProcessing || !canPin ? 'pointer-events-none opacity-50' : ''}>
              <BasePayButton
                colorScheme="light"
                onClick={handleBasePayAndPin}
              />
            </div>
          </div>

          <p className="text-center text-soft-ink-soft mt-4 text-xs">
            Pinning is only available on Base Mainnet.
          </p>

          {!isCorrectNetwork && (
            <p className="text-center text-red-700 mt-2 text-sm">
              Please switch to Base Mainnet to pin posts.
            </p>
          )}
          </div>

          {/* Help text */}
          <p className="text-xs text-soft-ink-soft text-center mt-3">
            Your post will be featured at the top of the feed for the selected duration
          </p>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
} 