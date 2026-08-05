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

/* ------------------------------------------------------------------ *
 * Tlumaczenie bledow portfela na komunikaty, ktore mowia CO ZROBIC.
 *
 * Powod: na produkcji uzytkownik dostal w toascie surowy tekst z viem
 * "The contract function createPost reverted with the following reason:
 *  nonce too high: address 0x... tx: 2 state: 1". To nie jest blad
 * aplikacji ani kontraktu - to rozjechany licznik transakcji w MetaMasku.
 * Z takiego komunikatu nikt nie wyczyta, ze ma wejsc w ustawienia portfela.
 *
 * Zasada: tlumaczymy WYLACZNIE to, co umiemy rozpoznac. Nieznany blad
 * leci dalej w oryginalnej tresci - niczego nie chowamy.
 * ------------------------------------------------------------------ */

export type WalletErrorKind =
  /** uzytkownik sam odrzucil podpis - to nie jest awaria */
  | 'rejected'
  /** rozjechany licznik nonce w portfelu */
  | 'nonce'
  /** brak natywnego tokena na gaz w tej sieci */
  | 'insufficient-funds'
  /** portfel nie zna tej sieci (EIP-1193 4902) */
  | 'unknown-chain'
  /** nie rozpoznaliśmy - pokazujemy tresc oryginalna */
  | 'unknown';

export interface WalletErrorInfo {
  kind: WalletErrorKind;
  /** Gotowy tekst do pokazania uzytkownikowi. */
  message: string;
  /** Czy to realna awaria. `false` dla odmowy uzytkownika - nie straszymy czerwonym. */
  isFailure: boolean;
  /** Oryginalna tresc bledu, gdyby wolajacy chcial ja dodatkowo zalogowac. */
  rawMessage: string;
}

export interface WalletErrorContext {
  /** Nazwa sieci wstawiana w komunikat, np. "Celo" albo "Robinhood Chain". */
  network?: string;
  /** Symbol tokena na gaz w tej sieci, np. "ETH" albo "CELO". */
  gasSymbol?: string;
}

/**
 * Blad z portfela nie jest plaski - viem i EIP-1193 pakuja przyczyne w `cause`,
 * a numeryczny `code` (4001, 4902) siedzi zwykle dopiero w srodku. Schodzimy
 * wiec po lancuchu i zbieramy wszystko, co da sie dopasowac.
 */
function collectErrorFacts(error: unknown): { text: string; codes: number[] } {
  const parts: string[] = [];
  const codes: number[] = [];
  let current: unknown = error;

  // Limit obrotow zabezpiecza przed cyklem w `cause`.
  for (let depth = 0; current && depth < 8; depth += 1) {
    if (typeof current === 'string') {
      parts.push(current);
      break;
    }
    if (typeof current !== 'object') break;

    const node = current as Record<string, unknown>;
    for (const key of ['shortMessage', 'details', 'message', 'reason'] as const) {
      const value = node[key];
      if (typeof value === 'string') parts.push(value);
    }
    const code = node.code;
    if (typeof code === 'number') codes.push(code);
    // MetaMask potrafi podac kod jako string ("4001").
    if (typeof code === 'string' && /^-?\d+$/.test(code)) codes.push(Number(code));

    current = node.cause;
  }

  return { text: parts.join(' \n ').toLowerCase(), codes };
}

/** Surowa tresc bledu - to, co dotychczas trafialo prosto do toasta. */
function rawMessageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

/**
 * Rozpoznaje znane bledy portfela i zamienia je na instrukcje.
 * Nierozpoznane wracaja w oryginale (`kind: 'unknown'`).
 */
export function describeWalletError(error: unknown, context: WalletErrorContext = {}): WalletErrorInfo {
  const raw = rawMessageOf(error);
  const { text, codes } = collectErrorFacts(error);
  const network = context.network || 'this network';
  const gasSymbol = context.gasSymbol || 'ETH';

  // 4001 = uzytkownik odrzucil zadanie. Nie jest to awaria aplikacji.
  if (codes.includes(4001) || /user rejected|user denied|rejected the request|request rejected|user cancell?ed/.test(text)) {
    return {
      kind: 'rejected',
      message: 'Transaction cancelled in your wallet.',
      isFailure: false,
      rawMessage: raw,
    };
  }

  // 4902 = portfel nie zna tego lancucha.
  if (codes.includes(4902) || /unrecognized chain id|chain id .* not( been)? added|wallet_addethereumchain/.test(text)) {
    return {
      kind: 'unknown-chain',
      message: `${network} is not added to your wallet yet. Add the network in your wallet, then try again.`,
      isFailure: true,
      rawMessage: raw,
    };
  }

  // Rozjazd licznika transakcji - najczestszy powod "dziwnego" reverta.
  if (/nonce too (high|low)|invalid nonce|nonce has already been used|nonce is too/.test(text)) {
    return {
      kind: 'nonce',
      message:
        `Your wallet's transaction counter for ${network} is out of sync — this is a wallet issue, not the post. ` +
        'In MetaMask open Settings → Advanced → "Clear activity tab data" for this network, then try again.',
      isFailure: true,
      rawMessage: raw,
    };
  }

  // Brak srodkow na gaz - i to zawsze W TEJ konkretnej sieci.
  if (/insufficient funds|gas required exceeds|exceeds the balance/.test(text)) {
    return {
      kind: 'insufficient-funds',
      message: `Not enough ${gasSymbol} on ${network} to pay for gas. Top up the wallet on that network and try again.`,
      isFailure: true,
      rawMessage: raw,
    };
  }

  return { kind: 'unknown', message: raw, isFailure: true, rawMessage: raw };
}
