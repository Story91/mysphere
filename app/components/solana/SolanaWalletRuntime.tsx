'use client';

/**
 * Srodek gospodarza portfela Solany: wallet-adapter + most do kontekstu.
 *
 * TEN PLIK LADUJE SIE WYLACZNIE PRZEZ import() z SolanaWalletHost. Wszystko,
 * co ciezkie (web3.js, wallet-adapter, CSS modala), wchodzi do aplikacji
 * tedy. Statyczny import tego pliku gdziekolwiek w glownym drzewie cofnalby
 * caly zysk z leniwego ladowania - patrz naglowek SolanaWalletHost.
 *
 * Provider jest TEN SAM co na stronach /blink (SolanaWalletProvider) - jedno
 * zrodlo endpointu i ustawien autoConnect. Rozni sie tylko onError: tutaj
 * bledy laczenia zamieniamy na toasty, zamiast zostawiac je w konsoli.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import type { Adapter, WalletError, WalletName } from '@solana/wallet-adapter-base';
import { toast } from 'react-hot-toast';
import SolanaWalletProvider from '../../basechat/Solana/components/SolanaWalletProvider';
import {
  describeSolanaConnectError,
  isSameWallet,
  pickSolanaWalletFor,
  readStoredSolanaWalletName,
  shortSolanaAddress,
  type DetectedSolanaWallet,
} from './solanaWalletNav';
import type { SolanaRuntimeProps, SolanaSigner } from './solanaWalletTypes';

/**
 * Jak dlugo prosba uzytkownika "trwa". Blad laczenia w tym oknie dostaje
 * toast; blad bez prosby (np. cichy autoConnect po przeladowaniu, gdy strona
 * nie jest juz zaufana) idzie tylko do konsoli - uzytkownik nic nie klikal.
 */
const USER_REQUEST_TTL_MS = 120_000;

/**
 * Rozszerzenie, ktore wstrzykuje sie z opoznieniem, rejestruje sie w Wallet
 * Standard chwile po starcie strony. Tyle czekamy na pare dla portfela EVM,
 * zanim uznamy, ze jej nie ma, i otworzymy wybor portfela.
 */
const DISCOVERY_GRACE_MS = 600;

/** Gorny limit "powrotu" po przeladowaniu - potem przelacznik pokazuje stan faktyczny. */
const RESTORE_TIMEOUT_MS = 4000;

/**
 * Ile czekamy po zamontowaniu, az zapamietany portfel zarejestruje sie w
 * Wallet Standard, zanim uznamy, ze go nie ma. Dluzej niz DISCOVERY_GRACE_MS,
 * bo tu nikt nie kliknal - czekanie niczego nie blokuje, a skok pastylki
 * widac. RESTORE_TIMEOUT_MS i tak ucina calosc.
 */
const RESTORE_DISCOVERY_MS = 1500;

interface UserRequest {
  walletName: string | null;
  at: number;
}

function isUsable(wallet: DetectedSolanaWallet): boolean {
  return wallet.readyState === 'Installed' || wallet.readyState === 'Loadable';
}

function isFresh(request: UserRequest | null): request is UserRequest {
  return !!request && Date.now() - request.at < USER_REQUEST_TTL_MS;
}

/**
 * memo NIE jest tu optymalizacja, tylko bezpiecznikiem przed petla: most
 * przepycha stan do gospodarza, gospodarz sie przerysowuje, a bez memo
 * przerysowalby tez provider - ktory przy kazdym renderze od nowa przelicza
 * liste portfeli i znow budzi most. Propsy od gospodarza maja stala
 * tozsamosc, wiec memo przerywa ten obieg.
 */
export default memo(function SolanaWalletRuntime(props: SolanaRuntimeProps) {
  const requestRef = useRef<UserRequest | null>(null);

  const handleError = useCallback((error: WalletError, adapter?: Adapter) => {
    const request = requestRef.current;
    if (!isFresh(request)) {
      console.warn('Solana wallet:', error);
      return;
    }
    requestRef.current = null;
    const { kind, message } = describeSolanaConnectError(error, adapter?.name ?? request.walletName);
    if (kind === 'cancelled') toast(message);
    else toast.error(message);
  }, []);

  return (
    <SolanaWalletProvider onError={handleError}>
      <SolanaWalletBridge {...props} requestRef={requestRef} />
    </SolanaWalletProvider>
  );
});

/**
 * Most: czyta wallet-adapter i przepycha stan do kontekstu aplikacji, a w
 * druga strone wykonuje prosby z kolejki gospodarza. Nic nie renderuje -
 * modal wyboru portfela rysuje WalletModalProvider.
 */
function SolanaWalletBridge({
  intent,
  onState,
  onIntentSettled,
  requestRef,
}: SolanaRuntimeProps & { requestRef: MutableRefObject<UserRequest | null> }) {
  const { connection } = useConnection();
  const { wallets, wallet, publicKey, connected, connecting, select, connect, disconnect, sendTransaction } =
    useWallet();
  const { setVisible } = useWalletModal();

  const detected = useMemo<DetectedSolanaWallet[]>(
    () =>
      wallets.map((entry) => ({
        name: entry.adapter.name,
        readyState: entry.readyState,
        icon: entry.adapter.icon,
      })),
    [wallets]
  );

  // ----- Powrot po przeladowaniu -------------------------------------------
  // autoConnect startuje w efekcie providera, czyli PO pierwszym renderze tego
  // mostu. Bez tej flagi pierwsza klatka mowilaby "nic nie podlaczone" i
  // przelacznik mignalby siecia EVM, zanim wroci na Solane.
  const [restoreSettled, setRestoreSettled] = useState(false);
  const sawConnectingRef = useRef(false);
  const mountedAtRef = useRef(Date.now());
  // Portfel zapamietany przez wallet-adapter, odczytany RAZ przy montowaniu.
  // `wallet` z useWallet() jest null takze wtedy, gdy zapamietany portfel
  // jeszcze sie nie zarejestrowal w Wallet Standard (rozszerzenie wstrzykuje
  // sie z opoznieniem) - bez tego odczytu konczylismy powrot od razu i
  // pastylka skakala SOL -> Base -> SOL.
  const rememberedRef = useRef<string | null>(null);
  if (rememberedRef.current === null) {
    try {
      rememberedRef.current = readStoredSolanaWalletName(window.localStorage) ?? '';
    } catch {
      rememberedRef.current = '';
    }
  }
  const [discoveryTick, setDiscoveryTick] = useState(0);
  useEffect(() => {
    if (restoreSettled) return;
    if (connected) {
      setRestoreSettled(true);
      return;
    }
    if (connecting) {
      sawConnectingRef.current = true;
      return;
    }
    if (sawConnectingRef.current) {
      setRestoreSettled(true);
      return;
    }
    // Portfel wybrany, autoConnect zaraz ruszy - czekamy na `connecting`.
    if (wallet) return;
    const waited = Date.now() - mountedAtRef.current;
    if (rememberedRef.current && waited < RESTORE_DISCOVERY_MS) {
      const timer = setTimeout(() => setDiscoveryTick((n) => n + 1), RESTORE_DISCOVERY_MS - waited + 20);
      return () => clearTimeout(timer);
    }
    setRestoreSettled(true);
  }, [restoreSettled, connected, connecting, wallet, discoveryTick]);
  useEffect(() => {
    const timer = setTimeout(() => setRestoreSettled(true), RESTORE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  const restoring = !restoreSettled && !connected && (!!wallet || !!rememberedRef.current);

  // ----- Stan do kontekstu --------------------------------------------------
  const signer = useMemo<SolanaSigner | null>(
    () => (connected && publicKey ? { publicKey, connection, sendTransaction } : null),
    [connected, publicKey, connection, sendTransaction]
  );
  const address = publicKey ? publicKey.toBase58() : null;
  const walletName = wallet?.adapter.name ?? null;

  useEffect(() => {
    onState({ connected, connecting, restoring, address, walletName, wallets: detected, signer });
  }, [onState, connected, connecting, restoring, address, walletName, detected, signer]);

  // ----- Potwierdzenie udanego polaczenia ------------------------------------
  // Wlasnie tej informacji brakowalo w zgloszeniu: czlowiek musi zobaczyc, ze
  // podpiela sie SOLANA, a nie strona Ethereum tego samego portfela.
  const wasConnectedRef = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnectedRef.current) {
      if (isFresh(requestRef.current) && address) {
        toast.success(`${walletName ?? 'Wallet'} connected on Solana (${shortSolanaAddress(address)})`);
      }
      requestRef.current = null;
    }
    wasConnectedRef.current = connected;
  }, [connected, address, walletName, requestRef]);

  // ----- Wykonanie prosb z kolejki -----------------------------------------
  const handledIdRef = useRef<number | null>(null);
  const [recheck, setRecheck] = useState(0);

  useEffect(() => {
    if (!intent || handledIdRef.current === intent.id) return;

    const settle = () => {
      handledIdRef.current = intent.id;
      onIntentSettled(intent.id);
    };
    const age = Date.now() - intent.at;
    let cleanup: (() => void) | undefined;
    // Zwraca true, gdy warto jeszcze poczekac na rejestracje portfela.
    const waitForDiscovery = () => {
      if (age >= DISCOVERY_GRACE_MS) return false;
      const timer = setTimeout(() => setRecheck((n) => n + 1), DISCOVERY_GRACE_MS - age + 20);
      cleanup = () => clearTimeout(timer);
      return true;
    };

    const beginConnect = (target: string) => {
      requestRef.current = { walletName: target, at: Date.now() };
      if (wallet?.adapter.name !== target) {
        // Sam select() wystarczy: WalletProvider z autoConnect laczy portfel,
        // ktory uzytkownik wlasnie wybral (hasUserSelectedAWallet), a
        // connect() w tym samym ticku trafilby jeszcze w stary portfel.
        select(target as WalletName);
      } else {
        // Ten sam portfel wybrany wczesniej, ale niepodlaczony (np. po
        // odmowie): select() byloby tu no-opem, wiec laczymy jawnie. Blad i
        // tak przychodzi przez onError, stad puste catch.
        connect().catch(() => undefined);
      }
    };

    const openPickerOrExplain = () => {
      if (!detected.some(isUsable)) {
        toast.error(
          'No Solana wallet found in this browser. Install Phantom, Solflare, Backpack or MetaMask, then reload the page.',
          { duration: 7000 }
        );
        return;
      }
      requestRef.current = { walletName: null, at: Date.now() };
      // Wybrany, ale niepodlaczony portfel zerujemy: modal wola tylko
      // select(), a ponowny wybor TEGO SAMEGO portfela bylby no-opem.
      if (wallet && !connected) select(null);
      setVisible(true);
    };

    switch (intent.kind) {
      case 'disconnect': {
        settle();
        requestRef.current = null;
        disconnect().catch((error) => console.warn('Solana disconnect failed:', error));
        break;
      }
      case 'picker': {
        settle();
        openPickerOrExplain();
        break;
      }
      case 'preferred': {
        if (connected) {
          settle();
          break;
        }
        // Trwa autoConnect po przeladowaniu - czekamy na wynik, zamiast
        // wysylac druga prosbe do tego samego portfela.
        if (connecting) break;
        const match = pickSolanaWalletFor(intent.evmConnectorName, detected);
        if (match) {
          settle();
          beginConnect(match);
          break;
        }
        if (waitForDiscovery()) break;
        settle();
        openPickerOrExplain();
        break;
      }
      case 'wallet': {
        if (connected && wallet && isSameWallet(wallet.adapter.name, intent.walletName)) {
          settle();
          break;
        }
        if (connecting) break;
        const entry =
          detected.find((candidate) => candidate.name === intent.walletName) ??
          detected.find((candidate) => isSameWallet(candidate.name, intent.walletName));
        if (!entry) {
          if (waitForDiscovery()) break;
          settle();
          toast.error(`${intent.walletName} is not available for Solana in this browser.`);
          break;
        }
        settle();
        if (!isUsable(entry)) {
          toast.error(
            describeSolanaConnectError({ name: 'WalletNotReadyError', message: '' }, entry.name).message
          );
          break;
        }
        beginConnect(entry.name);
        break;
      }
    }

    return cleanup;
  }, [
    intent,
    recheck,
    detected,
    connected,
    connecting,
    wallet,
    select,
    connect,
    disconnect,
    setVisible,
    onIntentSettled,
    requestRef,
  ]);

  return null;
}
