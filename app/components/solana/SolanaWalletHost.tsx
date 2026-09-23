'use client';

/**
 * Jeden portfel Solany dla calej aplikacji - ladowany dopiero, gdy jest
 * potrzebny.
 *
 * ===========================================================================
 * PO CO
 * ===========================================================================
 * Do 23.09.2026 portfel Solany istnial wylacznie wewnatrz zakladki Solany w
 * basechacie (lokalny WalletProvider w CreatePostSolana). Nawigacja o nim nie
 * wiedziala, wiec:
 *   - "Phantom" w modalu portfela zawsze laczyl strone Ethereum (EIP-6963),
 *   - wybor Solany w przelaczniku sieci tylko przenosil na zakladke i nie
 *     podpinal konta Solany - takze w MetaMasku, ktory ma dzis konto Solany.
 * Ten gospodarz trzyma JEDEN stan portfela Solany, z ktorego czytaja
 * nawigacja, modal portfela i composer Solany.
 *
 * ===========================================================================
 * DLACZEGO LENIWIE
 * ===========================================================================
 * Ten plik stoi w AppShell, czyli w bundlu kazdej trasy - i dlatego nie ma w
 * nim zadnego importu z @solana/*. Caly stos (web3.js, wallet-adapter, CSS
 * modala) siedzi w SolanaWalletRuntime i laduje sie przez import() dopiero:
 *   - gdy uzytkownik wybierze Solane albo portfel Solany,
 *   - gdy zamontuje sie zakladka Solany w basechacie,
 *   - na starcie TYLKO wtedy, gdy portfel Solany byl juz podlaczony
 *     (zapis wallet-adaptera w localStorage) - patrz shouldBootSolanaHost.
 * Kto nigdy nie dotknal Solany, nie pobiera ani bajta tego kodu.
 *
 * ===========================================================================
 * KOLEJKA PROSB
 * ===========================================================================
 * W chwili klikniecia stos zwykle nie jest jeszcze wczytany, a wallet-adapter
 * i tak nie pozwala polaczyc sie synchronicznie (select() i connect() w tym
 * samym ticku konczy sie WalletNotSelectedError). Klikniecie zapisuje wiec
 * prosbe (SolanaIntent), a most wewnatrz providera wykonuje ja, gdy portfele
 * sa juz wykryte.
 */

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useIsFarcasterMiniApp } from '../../hooks/useIsFarcasterMiniApp';
import {
  readNavMode,
  readStoredSolanaWalletName,
  resolveNavSelection,
  restoringBeforeRuntime,
  shouldBootSolanaHost,
  writeNavMode,
  type NavMode,
  type StorageLike,
} from './solanaWalletNav';
import { useDiscoveredSolanaWallets } from './solanaWalletRegistry';
import type {
  SolanaIntent,
  SolanaIntentRequest,
  SolanaRuntimeProps,
  SolanaRuntimeState,
  SolanaWalletApi,
} from './solanaWalletTypes';

const noop = () => undefined;

/**
 * Wartosc poza gospodarzem (albo na serwerze): wszystko wylaczone, akcje nic
 * nie robia. Komponent uzyty poza AppShell nie wywali sie, tylko nie pokaze
 * Solany.
 */
const DISABLED_API: SolanaWalletApi = {
  available: false,
  loaded: false,
  connected: false,
  connecting: false,
  restoring: false,
  address: null,
  walletName: null,
  mode: 'evm',
  navSelection: 'evm',
  discoveredWallets: [],
  signer: null,
  setMode: noop,
  ensureLoaded: noop,
  connectPreferred: noop,
  connectWallet: noop,
  openPicker: noop,
  disconnect: noop,
};

const SolanaWalletContext = createContext<SolanaWalletApi>(DISABLED_API);

export function useSolanaWallet(): SolanaWalletApi {
  return useContext(SolanaWalletContext);
}

/** localStorage albo null - w trybie prywatnym sam dostep potrafi rzucic. */
function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Bariera bledow wokol stosu Solany. Bez niej wyjatek w renderze
 * wallet-adaptera polecialby do gory przez AppShell i polozyl cala aplikacje -
 * a Solana jest tu dodatkiem, nie fundamentem.
 */
class SolanaRuntimeBoundary extends Component<
  { onCrash: (error: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onCrash(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

type RuntimeComponent = ComponentType<SolanaRuntimeProps>;

export function SolanaWalletHost({ children }: { children: ReactNode }) {
  const isMiniApp = useIsFarcasterMiniApp();
  // Solana tylko w zwyklej przegladarce: w miniappie Farcastera portfel jest
  // wstrzykiwany przez hosta i jest wylacznie EVM (patrz useIsFarcasterMiniApp).
  const available = isMiniApp === false;
  const pathname = usePathname();
  const discoveredWallets = useDiscoveredSolanaWallets(available);

  const [mode, setModeState] = useState<NavMode>('evm');
  const [storedWalletName, setStoredWalletName] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [Runtime, setRuntime] = useState<RuntimeComponent | null>(null);
  const [runtimeState, setRuntimeState] = useState<SolanaRuntimeState | null>(null);
  const [intent, setIntent] = useState<SolanaIntent | null>(null);

  const nextIntentId = useRef(0);
  // Refy, zeby akcje w kontekscie mialy stala tozsamosc - inaczej kazda zmiana
  // stanu portfela przebudowywalaby handlery w nawigacji i modalu.
  const isMiniAppRef = useRef(isMiniApp);
  isMiniAppRef.current = isMiniApp;
  const connectedRef = useRef(false);
  connectedRef.current = !!runtimeState?.connected;
  // Po awarii ladowania albo wyjatku w stosie start bez klikniecia jest
  // wylaczony do konca sesji. Inaczej zapis portfela w localStorage wznawialby
  // ladowanie w kolko, z toastem przy kazdym obrocie petli.
  const autoBootBlockedRef = useRef(false);

  // Odczyt pamieci dopiero po stronie klienta: na serwerze localStorage nie
  // istnieje, a rozny pierwszy render klienta i serwera to blad hydracji.
  useEffect(() => {
    const storage = browserStorage();
    setModeState(readNavMode(storage));
    setStoredWalletName(readStoredSolanaWalletName(storage));
  }, []);

  // Start bez klikniecia tylko dla kogos, kto juz mial podlaczona Solane.
  useEffect(() => {
    if (requested || autoBootBlockedRef.current) return;
    if (shouldBootSolanaHost({ available: isMiniApp === false, storedWalletName, pathname })) {
      setRequested(true);
    }
  }, [isMiniApp, storedWalletName, pathname, requested]);

  // W miniappie prosby o Solane nie maja czego wykonac - odrzucamy je, zamiast
  // trzymac w kolejce do konca sesji.
  useEffect(() => {
    if (isMiniApp === true) setIntent(null);
  }, [isMiniApp]);

  // Wlasciwe ladowanie stosu. import() zamiast next/dynamic, bo tu potrzebna
  // jest jawna obsluga bledu sieci: nieudany chunk ma dac komunikat i pozwolic
  // sprobowac ponownie, a nie zostawic przycisk, ktory nic nie robi.
  useEffect(() => {
    if (!requested || !available || Runtime) return;
    let cancelled = false;
    import('./SolanaWalletRuntime')
      .then((mod) => {
        if (!cancelled) setRuntime(() => mod.default);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load Solana wallet support:', error);
        toast.error('Could not load Solana wallet support. Check your connection and try again.');
        autoBootBlockedRef.current = true;
        setRequested(false);
        setIntent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [requested, available, Runtime]);

  const applyMode = useCallback((next: NavMode) => {
    setModeState(next);
    writeNavMode(browserStorage(), next);
  }, []);

  const queue = useCallback(
    (request: SolanaIntentRequest) => {
      nextIntentId.current += 1;
      setIntent({ ...request, id: nextIntentId.current, at: Date.now() } as SolanaIntent);
      setRequested(true);
    },
    []
  );

  const ensureLoaded = useCallback(() => {
    if (isMiniAppRef.current === true) return;
    setRequested(true);
  }, []);

  const connectPreferred = useCallback(
    (evmConnectorName?: string | null) => {
      if (isMiniAppRef.current === true) return;
      // Tryb od razu: wybor Solany to decyzja uzytkownika, a przelacznik i tak
      // pokaze Solane dopiero, gdy konto faktycznie sie podepnie.
      applyMode('solana');
      if (connectedRef.current) return;
      queue({ kind: 'preferred', evmConnectorName: evmConnectorName ?? null });
    },
    [applyMode, queue]
  );

  const connectWallet = useCallback(
    (walletName: string) => {
      if (isMiniAppRef.current === true) return;
      applyMode('solana');
      queue({ kind: 'wallet', walletName });
    },
    [applyMode, queue]
  );

  const openPicker = useCallback(() => {
    if (isMiniAppRef.current === true) return;
    applyMode('solana');
    queue({ kind: 'picker' });
  }, [applyMode, queue]);

  const disconnect = useCallback(() => {
    applyMode('evm');
    // Bez wczytanego stosu nie ma czego rozlaczac - nie ladujemy go tylko po to.
    if (!connectedRef.current) return;
    queue({ kind: 'disconnect' });
  }, [applyMode, queue]);

  const handleState = useCallback((state: SolanaRuntimeState) => {
    // Ten sam stan pole w pole nie przerysowuje calej aplikacji (kontekst
    // siedzi w AppShell, wiec kazdy nowy obiekt budzi kazdego konsumenta).
    setRuntimeState((previous) => {
      if (
        previous &&
        previous.connected === state.connected &&
        previous.connecting === state.connecting &&
        previous.restoring === state.restoring &&
        previous.address === state.address &&
        previous.walletName === state.walletName &&
        previous.wallets === state.wallets &&
        previous.signer === state.signer
      ) {
        return previous;
      }
      return state;
    });
  }, []);

  const handleSettled = useCallback((id: number) => {
    setIntent((current) => (current && current.id === id ? null : current));
  }, []);

  const handleCrash = useCallback((error: unknown) => {
    console.error('Solana wallet support crashed:', error);
    toast.error('Solana wallet support stopped working. Reload the page to try again.');
    autoBootBlockedRef.current = true;
    setRuntimeState(null);
    setIntent(null);
    setRequested(false);
    // Nowy klucz bariery: nastepna proba zaczyna od czystego stanu.
    setAttempt((n) => n + 1);
  }, []);

  const loaded = !!Runtime && !!runtimeState;
  const connected = !!runtimeState?.connected;
  const pendingConnect = !!intent && (intent.kind === 'preferred' || intent.kind === 'wallet');
  const connecting = !!runtimeState?.connecting || (pendingConnect && !connected);
  // Zanim stos wstanie po przeladowaniu, "wracamy" na podstawie zapisu
  // wallet-adaptera - inaczej przelacznik mignalby siecia EVM. Warunek NIE
  // czeka na `available` (asynchroniczne wykrywanie miniappa) ani na
  // `requested` (kolejny efekt), bo to wlasnie te dwa kroki dawaly migniecie.
  // Ref blokady czytany w renderze jest tu w porzadku: awaria ladowania i tak
  // przerysowuje gospodarza przez setRequested(false).
  const restoring = runtimeState
    ? runtimeState.restoring
    : restoringBeforeRuntime({
        isMiniApp,
        mode,
        storedWalletName,
        pathname,
        bootBlocked: autoBootBlockedRef.current,
      });

  const value = useMemo<SolanaWalletApi>(
    () => ({
      available,
      loaded,
      connected,
      connecting,
      restoring,
      address: runtimeState?.address ?? null,
      walletName: runtimeState?.walletName ?? null,
      mode,
      navSelection: resolveNavSelection({ mode, solanaConnected: connected, solanaRestoring: restoring }),
      discoveredWallets,
      signer: runtimeState?.signer ?? null,
      setMode: applyMode,
      ensureLoaded,
      connectPreferred,
      connectWallet,
      openPicker,
      disconnect,
    }),
    [
      available,
      loaded,
      connected,
      connecting,
      restoring,
      runtimeState,
      mode,
      discoveredWallets,
      applyMode,
      ensureLoaded,
      connectPreferred,
      connectWallet,
      openPicker,
      disconnect,
    ]
  );

  return (
    <SolanaWalletContext.Provider value={value}>
      {children}
      {available && requested && Runtime && (
        <SolanaRuntimeBoundary key={attempt} onCrash={handleCrash}>
          <Runtime intent={intent} onState={handleState} onIntentSettled={handleSettled} />
        </SolanaRuntimeBoundary>
      )}
    </SolanaWalletContext.Provider>
  );
}
