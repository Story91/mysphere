/**
 * Lekkie wykrywanie portfeli Solany przez Wallet Standard - BEZ stosu Solany.
 *
 * ===========================================================================
 * PO CO, SKORO wallet-adapter WYKRYWA PORTFELE SAM
 * ===========================================================================
 * Bo wallet-adapter to web3.js i kilkaset kilo kodu, a modal portfela oraz
 * przelacznik sieci siedza w glownym bundlu kazdej trasy. Zeby pokazac w
 * modalu "Phantom" i "MetaMask" w sekcji Solany - z prawdziwymi nazwami i
 * ikonami - nie trzeba niczego ladowac: wystarczy protokol rejestracji
 * Wallet Standard, czyli dwa zdarzenia na `window`.
 *
 *   - aplikacja wysyla 'wallet-standard:app-ready' z obiektem { register },
 *     a kazdy juz wczytany portfel odpowiada, wolajac register(wallet),
 *   - portfel wczytany POZNIEJ wysyla 'wallet-standard:register-wallet'
 *     z callbackiem, ktory wolamy z tym samym obiektem.
 *
 * Protokol z zalozenia obsluguje wiele aplikacji naraz, wiec ten rejestr i
 * rejestr wallet-adaptera (gdy stos Solany sie wczyta) dostaja te same
 * portfele niezaleznie od siebie. Laczenie i tak idzie przez wallet-adapter -
 * ten modul tylko CZYTA nazwy i ikony.
 */

import { useEffect, useState } from 'react';

/** Najmniejszy wycinek interfejsu Wallet z @wallet-standard/base, ktorego potrzebujemy. */
interface StandardWalletLike {
  name?: unknown;
  icon?: unknown;
  chains?: unknown;
  features?: unknown;
}

export interface DiscoveredSolanaWallet {
  name: string;
  icon: string | null;
}

let registered: StandardWalletLike[] = [];
let snapshot: DiscoveredSolanaWallet[] = [];
const listeners = new Set<() => void>();
let started = false;

/**
 * Ten sam filtr co `isWalletAdapterCompatibleStandardWallet` w wallet-adapterze:
 * portfel musi umiec sie polaczyc, nadawac zdarzenia i podpisac transakcje
 * Solany. Dzieki temu modal nie pokaze portfela, ktorego wallet-adapter potem
 * nie przyjmie. Lancuchy sprawdzamy dodatkowo, gdy portfel je deklaruje.
 */
function isSolanaWallet(wallet: StandardWalletLike): boolean {
  if (typeof wallet.name !== 'string' || !wallet.name) return false;
  const features = wallet.features;
  if (!features || typeof features !== 'object') return false;
  const has = (feature: string) => feature in (features as Record<string, unknown>);
  if (!has('standard:connect') || !has('standard:events')) return false;
  if (!has('solana:signAndSendTransaction') && !has('solana:signTransaction')) return false;
  if (Array.isArray(wallet.chains) && wallet.chains.length > 0) {
    return wallet.chains.some((chain) => typeof chain === 'string' && chain.startsWith('solana:'));
  }
  return true;
}

function rebuildSnapshot() {
  const seen = new Set<string>();
  const next: DiscoveredSolanaWallet[] = [];
  for (const wallet of registered) {
    if (!isSolanaWallet(wallet)) continue;
    const name = wallet.name as string;
    if (seen.has(name)) continue;
    seen.add(name);
    next.push({ name, icon: typeof wallet.icon === 'string' ? wallet.icon : null });
  }
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function register(...wallets: StandardWalletLike[]): () => void {
  const fresh = wallets.filter((wallet) => wallet && !registered.includes(wallet));
  if (fresh.length > 0) {
    registered = [...registered, ...fresh];
    rebuildSnapshot();
  }
  return () => {
    registered = registered.filter((wallet) => !fresh.includes(wallet));
    rebuildSnapshot();
  };
}

/** Uruchamia nasluch raz na cala sesje strony. Na serwerze nic nie robi. */
export function startSolanaWalletDiscovery(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const api = Object.freeze({
    register,
    get: () => [...registered],
    on: () => () => undefined,
  });
  try {
    window.addEventListener('wallet-standard:register-wallet', (event: Event) => {
      const callback = (event as CustomEvent<unknown>).detail;
      if (typeof callback === 'function') {
        try {
          callback(api);
        } catch (error) {
          console.warn('Solana wallet registration failed:', error);
        }
      }
    });
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch (error) {
    // Stara przegladarka bez CustomEvent albo zablokowane zdarzenia - sekcja
    // Solany pokaze wtedy ogolny wiersz, ktory i tak otwiera wybor portfela.
    console.warn('Solana wallet discovery unavailable:', error);
  }
}

export function getDiscoveredSolanaWallets(): DiscoveredSolanaWallet[] {
  return snapshot;
}

/**
 * Lista wykrytych portfeli Solany, aktualizowana, gdy kolejne rozszerzenie
 * sie zarejestruje. `enabled` = false (miniapp albo wykrywanie w toku) nie
 * dotyka `window` wcale.
 */
const NO_WALLETS: DiscoveredSolanaWallet[] = [];

export function useDiscoveredSolanaWallets(enabled: boolean): DiscoveredSolanaWallet[] {
  const [wallets, setWallets] = useState<DiscoveredSolanaWallet[]>(NO_WALLETS);
  useEffect(() => {
    if (!enabled) return;
    startSolanaWalletDiscovery();
    const update = () => setWallets(getDiscoveredSolanaWallets());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, [enabled]);
  // Stala tablica zamiast `[]`: nowa tozsamosc przy kazdym renderze
  // odpalalaby efekty i memo u kazdego konsumenta.
  return enabled ? wallets : NO_WALLETS;
}
