'use client';

import { PropsWithChildren, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useConnect } from 'wagmi';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';

// Module-scope guard: init must run exactly once per page load, surviving
// StrictMode double-mounts and any duplicate provider mounts in the tree.
let initStarted = false;

export function FarcasterFrameProvider({ children }: PropsWithChildren) {
  const { connect, connectors } = useConnect();

  useEffect(() => {
    if (initStarted) return;
    initStarted = true;

    const init = async () => {
      try {
        // TU ROZDZIELAJA SIE DWA KLIENTY - to jest cala obsluga dual-mode.
        //
        // Farcaster (Warpcast) nadal implementuje spec miniapp i aktywnie go
        // rozwija, wiec isInMiniApp() zwraca tam true i lecimy sciezka ponizej:
        // autoconnect konektorem 'farcaster', ready() gaszacy splash, addMiniApp.
        //
        // Base App od 9 kwietnia 2026 traktuje wszystkie aplikacje jak zwykle
        // strony www i NIE odpowiada na wywolania SDK Farcastera - ani ready(),
        // ani signIn, ani composeCast. isInMiniApp() zwroci tam false, wiec
        // wychodzimy tutaj, a aplikacja renderuje sie normalnie i laczy portfel
        // przez konektory injected() / baseAccount() z app/providers.tsx.
        //
        // Timeout 1s jest krytyczny: poprzednia wersja robila `await sdk.context`
        // bez niego i na localhoscie wisiala w nieskonczonosc, bo nikt nie
        // odpowiadal. Ten sam mechanizm chroni dzis przed zawieszeniem w Base App.
        const inMiniApp = await sdk.isInMiniApp();
        if (!inMiniApp) return;

        const context = await sdk.context;

        // Autoconnect with the connector registered in wagmiConfig (id 'farcaster'),
        // not a fresh instance that wagmi doesn't know about
        if (context?.client.clientFid) {
          const farcasterConnector =
            connectors.find((c) => c.id === 'farcaster') ?? farcasterMiniApp();
          connect({ connector: farcasterConnector });
        }

        // Hide the host splash screen once the UI is up
        setTimeout(() => {
          sdk.actions.ready();
        }, 500);

        // Auto-prompt addMiniApp if not already added.
        // `addFrame` to legacy alias tej samej metody - uzywamy aktualnej nazwy.
        if (context && !context.client.added) {
          setTimeout(async () => {
            try {
              const result = await sdk.actions.addMiniApp();
              console.log('✅ Mini app added successfully');
              if (result?.notificationDetails) {
                console.log('🔔 Notifications enabled:', result.notificationDetails);
              }
            } catch (addError) {
              console.log('ℹ️ Add mini app declined or failed:', addError);
            }
          }, 1500);
        }
      } catch (error) {
        console.error('Failed to initialize Farcaster miniapp:', error);
      }
    };

    init();
  }, [connect, connectors]);

  return <>{children}</>;
}
