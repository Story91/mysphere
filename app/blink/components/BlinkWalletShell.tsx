'use client';

/**
 * Portfel Solany dla stron /blink/* razem z bledami laczenia.
 *
 * Laduje sie WYLACZNIE przez dynamic() z BlinkReplyClient / BlinkTipClient,
 * tak jak wczesniej sam SolanaWalletProvider - statyczny import tego pliku ze
 * strony serwerowej wciagnalby caly stos Solany do kazdego wejscia.
 *
 * Po co wlasny onError: przy jednym zainstalowanym portfelu laczymy go przez
 * select() (patrz useBlinkWallet), a wtedy blad polaczenia (odmowa, zablokowany
 * portfel) przychodzi WYLACZNIE przez onError providera. Bez tego trafial do
 * konsoli, a czlowiek widzial przycisk, ktory "nic nie robi".
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { Adapter, WalletError } from '@solana/wallet-adapter-base';
import SolanaWalletProvider from '../../basechat/Solana/components/SolanaWalletProvider';
import { describeSolanaConnectError } from '../../components/solana/solanaWalletNav';
import { BlinkWalletErrorContext, type BlinkWalletError } from './blinkWalletError';

export default function BlinkWalletShell({ children }: { children: ReactNode }) {
  const [error, setError] = useState<BlinkWalletError | null>(null);

  const handleError = useCallback((walletError: WalletError, adapter?: Adapter) => {
    const { kind, message } = describeSolanaConnectError(walletError, adapter?.name);
    setError({ kind, message, at: Date.now() });
  }, []);

  const clear = useCallback(() => setError(null), []);
  const value = useMemo(() => ({ error, clear }), [error, clear]);

  return (
    <SolanaWalletProvider onError={handleError}>
      <BlinkWalletErrorContext.Provider value={value}>{children}</BlinkWalletErrorContext.Provider>
    </SolanaWalletProvider>
  );
}
