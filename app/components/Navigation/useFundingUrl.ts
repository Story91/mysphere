'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

/**
 * Zwraca gotowy URL Coinbase Onramp dla podlaczonego adresu albo `undefined`.
 *
 * `undefined` oznacza "nie wiemy / nie skonfigurowane" - wtedy przekazujemy
 * sterowanie z powrotem do OnchainKit, ktory dla Coinbase Smart Walleta i tak
 * zbuduje wlasny link do keys.coinbase.com. Dzieki temu wlaczenie Onrampu
 * poprawia sytuacje EOA, a niczego nie psuje smart walletom.
 */
export function useFundingUrl(): string | undefined {
  const { address, isConnected } = useAccount();
  const [fundingUrl, setFundingUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isConnected || !address) {
      setFundingUrl(undefined);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/onramp/session-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, blockchain: 'base' }),
        });

        if (!response.ok) {
          // 501 = brak kluczy CDP, 502 = Coinbase odmowil. W obu wypadkach
          // zostawiamy decyzje OnchainKitowi zamiast pokazywac zepsuty link.
          if (!cancelled) setFundingUrl(undefined);
          return;
        }

        const { token } = await response.json();
        if (cancelled || !token) return;

        const url = new URL('https://pay.coinbase.com/buy/select-asset');
        url.searchParams.set('sessionToken', token);
        url.searchParams.set('defaultNetwork', 'base');
        setFundingUrl(url.toString());
      } catch (error) {
        console.error('Nie udalo sie pobrac URL Onrampu:', error);
        if (!cancelled) setFundingUrl(undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  return fundingUrl;
}
