'use client';

/**
 * Wykrywanie i laczenie portfela na stronach /blink/*.
 *
 * === DLACZEGO NIE SAM MODAL ===
 * Do 23.09.2026 przycisk wolal setVisible(true), czyli modal wallet-adaptera.
 * W przegladarce wbudowanej w X lista portfeli jest pusta, wiec modal
 * pokazywal pustke i czlowiek uznawal, ze "nie wykrywa Phantoma". Teraz:
 *   - brak portfeli  -> panel pokazuje "Open this page in your wallet"
 *                       (universal linki, patrz walletLinks.ts), bez modala,
 *   - jeden portfel  -> laczymy go od razu, bez wybierania z listy jednej
 *                       pozycji,
 *   - dwa i wiecej   -> modal, bo tu naprawde jest z czego wybierac.
 *
 * `Loadable` liczymy jako dostepny: tak zglasza sie Mobile Wallet Adapter,
 * ktory wallet-adapter sam dodaje w Chrome na Androidzie (poza WebView) - on
 * przelacza do aplikacji portfela zainstalowanej na telefonie.
 *
 * === DLACZEGO CZEKAMY 800 MS ===
 * Portfele z Wallet Standard rejestruja sie zdarzeniem, czesto chwile po
 * starcie strony (rozszerzenie wstrzykuje sie z opoznieniem). Werdykt "brak
 * portfela" od razu po zamontowaniu migalby blokiem "otworz w portfelu"
 * u kogos, kto Phantoma ma.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base';
import { useBlinkWalletError } from './blinkWalletError';

const DISCOVERY_GRACE_MS = 800;

/**
 * Nazwa na przycisku. Mobile Wallet Adapter to nazwa protokolu, nie portfela -
 * "Connect Mobile Wallet Adapter" nic nie mowi komus z Phantomem na Androidzie.
 */
function displayName(name: string | null | undefined): string | null {
  if (!name) return null;
  return name === 'Mobile Wallet Adapter' ? 'your wallet app' : name;
}

export type WalletAvailability = 'checking' | 'none' | 'available';

export function useBlinkWallet() {
  const { wallets, wallet, publicKey, connected, connecting, select, connect, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { error, clear } = useBlinkWalletError();

  const usable = useMemo(
    () => wallets.filter(entry => entry.readyState === WalletReadyState.Installed || entry.readyState === WalletReadyState.Loadable),
    [wallets]
  );

  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGraceOver(true), DISCOVERY_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  const availability: WalletAvailability =
    connected || usable.length > 0 ? 'available' : graceOver ? 'none' : 'checking';

  /** Nazwa portfela na przycisku - tylko gdy wybor jest jednoznaczny. */
  const singleName = usable.length === 1 ? usable[0].adapter.name : null;

  const requestConnect = useCallback(() => {
    clear();
    if (usable.length === 0) return;
    if (usable.length === 1) {
      const target = usable[0].adapter.name;
      if (wallet?.adapter.name === target) {
        // Ten sam portfel juz wybrany, ale niepodlaczony: select() byloby
        // no-opem. Blad i tak przychodzi przez onError providera.
        connect().catch(() => undefined);
      } else {
        // Sam select() wystarcza: WalletProvider z autoConnect laczy portfel,
        // ktory uzytkownik wlasnie wybral. connect() w tym samym ticku
        // trafilby jeszcze w poprzedni adapter (to samo w SolanaWalletRuntime).
        select(target as WalletName);
      }
      return;
    }
    // Wybrany, ale niepodlaczony portfel zerujemy: modal wola tylko select(),
    // a ponowny wybor TEGO SAMEGO portfela bylby no-opem.
    if (wallet && !connected) select(null);
    setVisible(true);
  }, [clear, usable, wallet, connected, connect, select, setVisible]);

  const disconnectWallet = useCallback(() => {
    clear();
    disconnect().catch(() => undefined);
  }, [clear, disconnect]);

  return {
    availability,
    connected: connected && !!publicKey,
    connecting,
    publicKey,
    walletName: displayName(wallet?.adapter.name ?? singleName),
    multipleWallets: usable.length > 1,
    connectError: error,
    clearConnectError: clear,
    requestConnect,
    disconnectWallet,
  };
}
