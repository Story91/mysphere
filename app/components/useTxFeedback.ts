'use client';

/**
 * Wspolne kawalki obu przyciskow transakcji (TransactionButton dla postow,
 * CommentTransactionButton dla komentarzy).
 *
 * Oba mialy przepisane 1:1: dwa efekty z timerem chowajacym komunikat, dwa refy
 * na te timery i funkcje otwierajaca transakcje w eksploratorze. Cztery kopie
 * tego samego kodu, ktore trzeba bylo poprawiac w czterech miejscach - i ktore
 * juz zaczely sie rozjezdzac (rozne komentarze, rozna kolejnosc). Zachowanie
 * jest identyczne: ten sam czas, to samo czyszczenie timera przy odmontowaniu.
 */

import { useEffect, useRef } from 'react';
import { base } from 'wagmi/chains';

/**
 * Wola `onExpire` po `delayMs` od chwili, gdy `active` stalo sie prawda.
 * Timer jest kasowany przy zmianie `active` i przy odmontowaniu, wiec nie ma
 * mowy o ustawianiu stanu w komponencie, ktorego juz nie ma.
 *
 * `onExpire` siedzi w refie celowo: inaczej kazda nowa referencja funkcji
 * (a jest tworzona przy kazdym renderze) restartowalaby odliczanie od zera.
 */
export function useAutoReset(active: boolean, delayMs: number, onExpire: () => void): void {
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => onExpireRef.current(), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
}

/** Basescan dla mainnetu, Sepolia dla wszystkiego innego - tak bylo w obu przyciskach. */
export function openTxInExplorer(chainId: number, txHash: string | null): void {
  if (!txHash) return;
  const baseUrl = chainId === base.id ? 'https://basescan.org/tx/' : 'https://sepolia.basescan.org/tx/';
  window.open(`${baseUrl}${txHash}`, '_blank');
}
