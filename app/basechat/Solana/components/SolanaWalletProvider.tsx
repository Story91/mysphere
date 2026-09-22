'use client';

/**
 * Drugi stack portfeli obok wagmi - wylacznie dla kwitu posta na Solanie.
 *
 * ===========================================================================
 * DLACZEGO TO NIE STOI W app/providers.tsx
 * ===========================================================================
 * @solana/web3.js razem z wallet-adapterem to ~200 pakietow i kilkaset kilo
 * bundle'a. Aplikacja juz niesie wagmi, viem, rainbowkit, three i mermaid -
 * dorzucenie Solany do globalnego providera obcialoby KAZDA trasa, lacznie z
 * tymi, ktore o Solanie nie wiedza (startpad, perps, marketplace).
 *
 * Dlatego provider jest lokalny i ladowany dynamicznie dopiero wtedy, gdy
 * uzytkownik wybierze zakladke Solany w basechacie. Kto nigdy tam nie wejdzie,
 * nie pobierze ani bajta tego kodu.
 *
 * ===========================================================================
 * PUSTA TABLICA `wallets` NIE JEST BLEDEM
 * ===========================================================================
 * Phantom, Solflare i Backpack implementuja Wallet Standard, ktory
 * wallet-adapter-react wykrywa sam. Jawne adaptery per portfel sa potrzebne
 * tylko dla portfeli sprzed tego standardu - a te i tak nie dzialaja juz na
 * mobile. Kazdy dodany adapter to kolejne kilobajty za portfel, ktorego nikt
 * nie uzywa.
 */

import { useMemo, type ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SOLANA_RPC_URL } from '../config/solanaChain';

import '@solana/wallet-adapter-react-ui/styles.css';

export default function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => SOLANA_RPC_URL, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      {/*
        autoConnect celowo wlaczone: uzytkownik, ktory raz podlaczyl Phantoma,
        po powrocie na zakladke nie klika drugi raz. To zachowanie wagmi ma
        u nas od poczatku (cookieStorage w konfiguracji), wiec dwa stacki
        portfeli zachowuja sie tak samo.
      */}
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
