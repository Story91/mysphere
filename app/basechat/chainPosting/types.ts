'use client';

/**
 * Jeden opis "co ta siec ma innego" - reszta przyciskow transakcji jest wspolna.
 *
 * Przed tym plikiem kazdy lancuch (Celo, Linea, World, ETH, Robinhood, Camp)
 * mial wlasny TransactionButton* i CommentTransactionButton*. Po znormalizowaniu
 * nazw pliki byly identyczne co do znaku poza kilkunastoma wartosciami: chainId,
 * obiektem chain, ABI, adresem kontraktu, nazwa sieci w toascie, adresem
 * eksploratora i klasami koloru. Dwanascie kopii tej samej sciezki transakcyjnej
 * oznaczalo, ze kazda poprawka bledu musiala byc nanoszona dwanascie razy -
 * i zwykle nie byla (patrz: brak zamykania toasta `loading` czy brak
 * `aria-label` na przycisku bez tekstu).
 */

import type { ReactNode } from 'react';
import type { Abi, Chain } from 'viem';

/** Warstwa czysto wygladowa - osobna dla przycisku postu i przycisku komentarza. */
export interface ChainButtonSkin {
  /** Klasy przycisku, gdy portfel stoi na tej sieci. */
  onChain: string;
  /** Klasy przycisku, gdy portfel stoi gdzie indziej. */
  offChain: string;
  /** Klasa koloru spinnera. Funkcja, bo ETH zmienia go razem z siecia. */
  spinner: (onChain: boolean) => string;
  /** Tlo przycisku "wyslane" w chwili otwierania eksploratora. */
  sentAccent: string;
  /** Klasa koloru tekstu przycisku "wyslane". */
  sentText: string;
  /** Ikona sieci wewnatrz przycisku. Funkcja, bo ETH odwraca kolory logo. */
  icon: (onChain: boolean) => ReactNode;
}

export interface ChainPostingConfig {
  /** Identyfikator sieci, na ktorej ten przycisk postuje. */
  chainId: number;
  /** Obiekt chain z viem - przekazywany do `simulateContract` i `writeContract`. */
  chain: Chain;
  /** ABI kontraktu postow. Ksztalt ABI jest w kazdej sieci taki sam. */
  abi: Abi;
  /** Adres kontraktu dla podanego chainId albo `undefined`, gdy niewdrozony. */
  getContractAddress: (chainId: number) => string | undefined;

  /**
   * Nazwa uzywana w komunikatach o przelaczaniu sieci:
   * "Switched to {networkLabel}!", "Please switch to {networkLabel} manually".
   */
  networkLabel: string;
  /**
   * Krotka nazwa doklejana do komunikatow o transakcji:
   * "Transaction sent on {shortName}!". Pominieta dla Camp - tam komunikaty
   * nigdy nie nosily nazwy sieci i nie ma powodu tego zmieniac.
   */
  shortName?: string;

  /** Klucz localStorage z hashem ostatniej transakcji (ochrona przed dublem). */
  txHashStorageKey: string;
  /** Prefiks adresu transakcji w eksploratorze; pelny URL to `${explorerTxUrl}${hash}`. */
  explorerTxUrl: string;
  /** Napis na przycisku prowadzacym do eksploratora, np. "View on Etherscan". */
  explorerButtonLabel: string;

  /**
   * Gdy podane i zwraca `false`, postowanie jest calkowicie wylaczone -
   * przycisk pokazuje "Coming soon" zamiast wysylac transakcje na pusty adres.
   * Uzywa tego wylacznie Robinhood Chain, gdzie kontrakt nie jest wdrozony.
   */
  isLive?: () => boolean;
  /** Komunikat pokazywany, gdy `isLive()` zwraca `false`. */
  notLiveMessage?: string;

  post: ChainButtonSkin;
  comment: ChainButtonSkin;
}

/** Propsy przycisku postu - takie same we wszystkich szesciu sieciach. */
export interface ChainPostButtonProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onPostAdded?: () => Promise<void>;
}

/** Propsy przycisku komentarza - zgodne z `app/components/CommentTransactionButton`. */
export interface ChainCommentButtonProps {
  content: string;
  onTransactionSuccess: (txHash: string) => void;
  disabled?: boolean;
  autoPost?: boolean;
  onCommentAdded?: () => Promise<void>;
}

/** "on Celo" / "" - Camp nie ma nazwy sieci w komunikatach. */
export function chainSuffix(config: ChainPostingConfig): string {
  return config.shortName ? ` on ${config.shortName}` : '';
}

/** Komunikat o braku wdrozonego kontraktu. */
export function notDeployedMessage(config: ChainPostingConfig): string {
  return config.notLiveMessage || `${config.shortName || config.networkLabel} contract not deployed yet`;
}
