'use client';

/**
 * Wspolna sciezka platnosci dla monetyzacji - dokladnie ten sam wzorzec, co
 * TipButton po migracji z OnchainKit: useSendTransaction -> useWaitForTransactionReceipt
 * -> dopiero po potwierdzeniu zapis.
 *
 * === NAJWAZNIEJSZY SZCZEGOL ===
 * `receipt.status === 'reverted'` jest traktowane jako BLAD. OnchainKit
 * raportowal sukces po samym wejsciu transakcji na lancuch, wiec cofnieta
 * transakcja zapisywala tip, ktory nigdy nie doszedl. Tutaj jedyna sciezka
 * wolajaca `onConfirmed` jest za sprawdzeniem `status === 'success'`.
 *
 * Zapis jest dodatkowo chroniony refem przed podwojnym wywolaniem - efekt
 * reagujacy na potwierdzenie moze sie wykonac ponownie przy re-renderze.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useChainId, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi';
import { encodeFunctionData, parseEther, parseUnits } from 'viem';
import { ERC20_TRANSFER_ABI, TOKENS } from '../../basechat/components/TipNetworkConfig';
import { isUserRejection } from '../../utils/auth/useSiweAuth';
import { MONETIZATION_CHAIN_ID, type MonetizationToken } from '../../utils/monetization/types';

export type PaymentPhase =
  /** nic sie nie dzieje */
  | 'idle'
  /** czekamy na podpis w portfelu */
  | 'signing'
  /** transakcja wyslana, czekamy na potwierdzenie */
  | 'confirming'
  /** potwierdzona i nie cofnieta - trwa zapis po stronie serwera */
  | 'recording'
  | 'success'
  | 'error';

export interface PayParams {
  /** Odbiorca platnosci. */
  to: string;
  amount: string;
  token: MonetizationToken;
}

export interface UsePaymentFlowResult {
  phase: PaymentPhase;
  error: string | null;
  txHash: `0x${string}` | undefined;
  isBusy: boolean;
  isOnBase: boolean;
  switchToBase: () => void;
  pay: (params: PayParams) => void;
  reset: () => void;
}

/**
 * Bledy z portfela sa pisane pod maszyne, nie pod czlowieka: viem doklada do
 * `message` wersje, docs URL i pelne argumenty wywolania, wiec surowy tekst
 * potrafil zajac w UI kilkanascie linii. Bierzemy pierwsza linie, a odmowe
 * podpisu nazywamy po imieniu - to nie jest awaria.
 */
function describeSendError(error: Error): string {
  if (isUserRejection(error)) return 'You rejected the request in your wallet.';
  const firstLine = error.message?.split('\n')[0]?.trim();
  return firstLine && firstLine.length > 0 ? firstLine.slice(0, 160) : 'Transaction failed';
}

/**
 * @param onConfirmed wolane WYLACZNIE po potwierdzonej i niecofnietej
 * transakcji. Rzucenie bledu w srodku przelacza `phase` na 'error' - dzieki
 * temu nieudany zapis nie udaje sukcesu.
 */
export function usePaymentFlow(onConfirmed: (txHash: `0x${string}`) => Promise<void>): UsePaymentFlowResult {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [phase, setPhase] = useState<PaymentPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  // Straznik przed podwojnym zapisem tej samej transakcji.
  const handledTxRef = useRef<string | null>(null);

  /**
   * Faza widziana natychmiast, bez czekania na render.
   *
   * `disabled={isBusy}` na przycisku dziala dopiero po przerysowaniu, a `pay`
   * mozna wywolac takze poza klikiem. Ref jest jedynym straznikiem, ktory
   * zdazy: druga proba zaplaty nie ma prawa wyslac drugiej transakcji.
   */
  const phaseRef = useRef<PaymentPhase>('idle');
  phaseRef.current = phase;

  const { sendTransaction, data: txHash, error: sendError, reset: resetSend } = useSendTransaction();
  const {
    data: receipt,
    isLoading: isWaitingForReceipt,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  });

  useEffect(() => {
    if (txHash && isWaitingForReceipt) setPhase('confirming');
  }, [txHash, isWaitingForReceipt]);

  useEffect(() => {
    if (!receipt) return;
    if (handledTxRef.current === receipt.transactionHash) return;
    handledTxRef.current = receipt.transactionHash;

    if (receipt.status !== 'success') {
      // Transakcja weszla na lancuch, ale sie cofnela - to NIE jest sukces
      // i nic nie zostaje zapisane.
      setError('Transaction reverted on-chain. Nothing was charged or unlocked.');
      setPhase('error');
      resetSend();
      return;
    }

    setPhase('recording');
    const confirmedHash = receipt.transactionHash;
    void (async () => {
      try {
        await onConfirmedRef.current(confirmedHash);
        setPhase('success');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Payment went through but could not be recorded');
        setPhase('error');
      } finally {
        resetSend();
      }
    })();
  }, [receipt, resetSend]);

  useEffect(() => {
    if (!sendError) return;
    setError(describeSendError(sendError));
    setPhase('error');
    resetSend();
  }, [sendError, resetSend]);

  /**
   * Paragonu nie da sie pobrac - padl RPC, uzytkownik stracil siec, minal limit
   * czasu hooka. Bez tej sciezki `phase` zostawalo na 'confirming' NA ZAWSZE:
   * przycisk byl zablokowany napisem "Waiting for confirmation..." az do
   * przeladowania strony, mimo ze aplikacja juz niczego nie sprawdzala.
   *
   * Transakcja mogla przy tym przejsc, wiec komunikat nie moze twierdzic, ze
   * platnosc sie nie udala - musi wskazac hash i eksplorator.
   */
  useEffect(() => {
    if (!receiptError || !txHash) return;
    if (handledTxRef.current === txHash) return;
    handledTxRef.current = txHash;

    setError(
      'We lost track of the transaction before it was confirmed. It may still go through - ' +
        'check it in the explorer before paying again.'
    );
    setPhase('error');
  }, [receiptError, txHash]);

  const isOnBase = chainId === MONETIZATION_CHAIN_ID;

  const switchToBase = useCallback(() => {
    switchChain({ chainId: MONETIZATION_CHAIN_ID });
  }, [switchChain]);

  const reset = useCallback(() => {
    handledTxRef.current = null;
    phaseRef.current = 'idle';
    setError(null);
    setPhase('idle');
    resetSend();
  }, [resetSend]);

  const pay = useCallback(
    (params: PayParams) => {
      // Platnosc juz trwa - drugie wywolanie nie moze wyslac drugiej transakcji.
      const busyNow =
        phaseRef.current === 'signing' ||
        phaseRef.current === 'confirming' ||
        phaseRef.current === 'recording';
      if (busyNow) return;

      if (!address) {
        setError('Connect your wallet first');
        setPhase('error');
        return;
      }
      if (!isOnBase) {
        setError('Switch to Base to pay');
        setPhase('error');
        return;
      }

      const tokenConfig = TOKENS[params.token];
      handledTxRef.current = null;
      setError(null);
      // Ref ustawiamy RECZNIE i od razu: `setPhase` zadziala dopiero przy
      // kolejnym renderze, a drugie klikniecie moze przyjsc wczesniej.
      phaseRef.current = 'signing';
      setPhase('signing');

      try {
        if (tokenConfig.isNative) {
          sendTransaction({
            to: params.to as `0x${string}`,
            value: parseEther(params.amount),
          });
        } else {
          const data = encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: 'transfer',
            args: [params.to as `0x${string}`, parseUnits(params.amount, tokenConfig.decimals)],
          });
          sendTransaction({
            to: tokenConfig.contractAddress as `0x${string}`,
            data,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not build the transaction');
        setPhase('error');
      }
    },
    [address, isOnBase, sendTransaction]
  );

  return {
    phase,
    error,
    txHash,
    isBusy: phase === 'signing' || phase === 'confirming' || phase === 'recording',
    isOnBase,
    switchToBase,
    pay,
    reset,
  };
}
