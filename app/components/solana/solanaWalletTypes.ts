/**
 * Typy wspolne dla gospodarza portfela Solany (glowny bundle) i jego leniwie
 * ladowanego srodka (SolanaWalletRuntime).
 *
 * WYLACZNIE `import type`: TypeScript wycina je przy kompilacji, wiec ten plik
 * nie wciaga do glownego bundla ani bajta z @solana/*. Zwykly import w tym
 * miejscu przenioslby web3.js na kazda trase aplikacji.
 */

import type { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { SendTransactionOptions } from '@solana/wallet-adapter-base';
import type { DetectedSolanaWallet, NavMode } from './solanaWalletNav';
import type { DiscoveredSolanaWallet } from './solanaWalletRegistry';

/** To, czego composer potrzebuje do podpisania i wyslania transakcji. */
export interface SolanaSigner {
  publicKey: PublicKey;
  connection: Connection;
  sendTransaction: (
    transaction: Transaction | VersionedTransaction,
    connection: Connection,
    options?: SendTransactionOptions
  ) => Promise<string>;
  /**
   * Podpis wiadomosci (ed25519) - uzywany przy powiazaniu portfela Solany
   * z kontem do Askow SOL (app/utils/asks/useSolanaAskWallet.ts). Opcjonalny,
   * bo wallet-adapter oddaje undefined, gdy portfel tego nie umie - wtedy
   * interfejs mowi to wprost, zamiast wywracac sie na wywolaniu.
   */
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Prosba z interfejsu do stosu Solany. Kolejkowana, bo w chwili klikniecia
 * stos moze jeszcze nie byc wczytany - wykona ja most po zaladowaniu.
 */
export type SolanaIntent =
  | { id: number; at: number; kind: 'preferred'; evmConnectorName: string | null }
  | { id: number; at: number; kind: 'wallet'; walletName: string }
  | { id: number; at: number; kind: 'picker' }
  | { id: number; at: number; kind: 'disconnect' };

/**
 * Prosba bez numeru i czasu - te nadaje kolejka. Omit rozpisany na kazdy
 * wariant unii osobno: zwykly Omit na unii zostawia tylko pola wspolne i
 * gubi `walletName` / `evmConnectorName`.
 */
export type SolanaIntentRequest = SolanaIntent extends infer Variant
  ? Variant extends SolanaIntent
    ? Omit<Variant, 'id' | 'at'>
    : never
  : never;

/** Stan wallet-adaptera przepychany przez most do kontekstu aplikacji. */
export interface SolanaRuntimeState {
  connected: boolean;
  connecting: boolean;
  /** Po przeladowaniu: zapamietany portfel wlasnie probuje wrocic (autoConnect). */
  restoring: boolean;
  address: string | null;
  walletName: string | null;
  wallets: DetectedSolanaWallet[];
  signer: SolanaSigner | null;
}

export interface SolanaRuntimeProps {
  intent: SolanaIntent | null;
  onState: (state: SolanaRuntimeState) => void;
  onIntentSettled: (id: number) => void;
}

/** Publiczne API hooka useSolanaWallet(). */
export interface SolanaWalletApi {
  /** false w miniappie Farcastera i dopoki wykrywanie miniappa trwa. */
  available: boolean;
  /** Stos Solany (wallet-adapter + web3.js) jest wczytany i zamontowany. */
  loaded: boolean;
  connected: boolean;
  connecting: boolean;
  restoring: boolean;
  /** Adres base58 podlaczonego konta albo null. */
  address: string | null;
  walletName: string | null;
  /** Tryb wybrany przez uzytkownika (zapamietany w localStorage). */
  mode: NavMode;
  /** Co faktycznie pokazuje przelacznik sieci - patrz resolveNavSelection. */
  navSelection: NavMode;
  /** Portfele Solany wykryte BEZ ladowania stosu (Wallet Standard). */
  discoveredWallets: DiscoveredSolanaWallet[];
  /** Gotowy do podpisu portfel albo null, gdy nic nie jest podlaczone. */
  signer: SolanaSigner | null;
  setMode: (mode: NavMode) => void;
  ensureLoaded: () => void;
  /** Podlacz konto Solany tego samego portfela co strona EVM; bez pary - wybor portfela. */
  connectPreferred: (evmConnectorName?: string | null) => void;
  connectWallet: (walletName: string) => void;
  openPicker: () => void;
  disconnect: () => void;
}
