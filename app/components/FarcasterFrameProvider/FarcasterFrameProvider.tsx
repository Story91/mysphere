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
        // Resolves false within 1s outside a miniapp host — on localhost the old
        // `await FrameSDK.context` hung forever because no host ever answers.
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

        // Auto-prompt addMiniApp if not already added
        if (context && !context.client.added) {
          setTimeout(async () => {
            try {
              const result = await sdk.actions.addFrame();
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
