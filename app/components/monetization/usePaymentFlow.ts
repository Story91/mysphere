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

  const { sendTransaction, data: txHash, error: sendError, reset: resetSend } = useSendTransaction();
  const { data: receipt, isLoading: isWaitingForReceipt } = useWaitForTransactionReceipt({
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

  const isOnBase = chainId === MONETIZATION_CHAIN_ID;

  const switchToBase = useCallback(() => {
    switchChain({ chainId: MONETIZATION_CHAIN_ID });
  }, [switchChain]);

  const reset = useCallback(() => {
    handledTxRef.current = null;
    setError(null);
    setPhase('idle');
    resetSend();
  }, [resetSend]);

  const pay = useCallback(
    (params: PayParams) => {
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
