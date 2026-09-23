'use client';

/**
 * Drugi stack portfeli obok wagmi - dla kwitu posta na Solanie i stron /blink.
 *
 * ===========================================================================
 * DLACZEGO TO NIE STOI W app/providers.tsx
 * ===========================================================================
 * @solana/web3.js razem z wallet-adapterem to ~200 pakietow i kilkaset kilo
 * bundle'a. Aplikacja juz niesie wagmi, viem, rainbowkit, three i mermaid -
 * dorzucenie Solany do globalnego providera obcialoby KAZDA trasa, lacznie z
 * tymi, ktore o Solanie nie wiedza (startpad, perps, marketplace).
 *
 * Dlatego provider jest ladowany dynamicznie dopiero wtedy, gdy jest
 * potrzebny. Od 23.09.2026 w glownej aplikacji montuje go jeden leniwy
 * gospodarz (app/components/solana/SolanaWalletHost + SolanaWalletRuntime),
 * zeby nawigacja, modal portfela i composer Solany mialy JEDEN wspolny stan
 * portfela. Strony /blink/* nadal owijaja sie nim same - to samodzielne strony.
 *
 * ===========================================================================
 * PUSTA TABLICA `wallets` NIE JEST BLEDEM
 * ===========================================================================
 * Phantom, Solflare i Backpack implementuja Wallet Standard, ktory
 * wallet-adapter-react wykrywa sam. Jawne adaptery per portfel sa potrzebne
 * tylko dla portfeli sprzed tego standardu - a te i tak nie dzialaja juz na
 * mobile. Kazdy dodany adapter to kolejne kilobajty za portfel, ktorego nikt
 * nie uzywa.
 *
 * Tablica jest STALA MODULU, a nie literalem `[]` w JSX: WalletProvider trzyma
 * ja w zaleznosciach useMemo, wiec nowa tablica przy kazdym renderze
 * przeliczala liste portfeli i budzila wszystkich konsumentow useWallet().
 */

import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import type { Adapter, WalletError } from '@solana/wallet-adapter-base';
import { SOLANA_RPC_URL } from '../config/solanaChain';

import '@solana/wallet-adapter-react-ui/styles.css';

const NO_LEGACY_ADAPTERS: Adapter[] = [];

export default function SolanaWalletProvider({
  children,
  onError,
}: {
  children: ReactNode;
  /**
   * Bledy portfela (odmowa, brak rozszerzenia). Bez tego wallet-adapter
   * wypisuje je do konsoli, a przy WalletNotReadyError sam otwiera strone
   * portfela w nowej karcie - tak zostaje na stronach /blink.
   */
  onError?: (error: WalletError, adapter?: Adapter) => void;
}) {
  const endpoint = useMemo(() => SOLANA_RPC_URL, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/*
        autoConnect celowo wlaczone: uzytkownik, ktory raz podlaczyl Phantoma,
        po powrocie na zakladke nie klika drugi raz. To zachowanie wagmi ma
        u nas od poczatku (cookieStorage w konfiguracji), wiec dwa stacki
        portfeli zachowuja sie tak samo. Przy okazji autoConnect laczy portfel
        zaraz po select() - na tym stoi kolejka prosb w SolanaWalletRuntime.
      */}
      <WalletProvider wallets={NO_LEGACY_ADAPTERS} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
