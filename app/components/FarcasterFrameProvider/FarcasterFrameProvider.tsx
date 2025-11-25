'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import sdk from '@farcaster/miniapp-sdk';
import { useConnect } from 'wagmi';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';
import { useMiniKit } from '@coinbase/onchainkit/minikit';

export function FarcasterFrameProvider({ children }: PropsWithChildren) {
  const { connect } = useConnect();
  const { setFrameReady, isFrameReady } = useMiniKit();
  const [isMounted, setIsMounted] = useState(false);
  const [hasTriedAddMiniApp, setHasTriedAddMiniApp] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Set frame ready when mounted
  useEffect(() => {
    if (!isFrameReady && isMounted) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady, isMounted]);

  // Auto-connect wallet if in mini app
  useEffect(() => {
    if (!isMounted) return;

    const init = async () => {
      try {
        const isInMiniApp = await sdk.isInMiniApp();
        if (!isInMiniApp) {
          return;
        }

        const context = await sdk.context;
        
        // Autoconnect if running in mini app
        if (context?.user?.fid) {
          connect({ connector: farcasterFrame() });
        }
      } catch (error) {
        console.error('Failed to initialize Farcaster Mini App:', error);
      }
    };

    init();
  }, [connect, isMounted]);

  // Auto-prompt addMiniApp after frame is ready
  useEffect(() => {
    const promptAddMiniApp = async () => {
      if (hasTriedAddMiniApp || !isFrameReady) return;

      try {
        const isInMiniApp = await sdk.isInMiniApp();
        if (!isInMiniApp) {
          return;
        }

        setHasTriedAddMiniApp(true);

        try {
          const result = await sdk.actions.addMiniApp();
          console.log('✅ Add Mini App result:', result);

          if (result.notificationDetails) {
            console.log('🔔 Notifications enabled!');
          } else {
            console.log('⚠️ Mini App added but notifications not enabled');
          }
        } catch (error: unknown) {
          const err = error as { name?: string };
          if (err?.name === 'AddMiniApp.InvalidDomainManifest') {
            console.error('❌ Invalid domain manifest - check your .well-known/farcaster.json');
          } else if (err?.name === 'AddMiniApp.RejectedByUser') {
            console.log('User rejected add Mini App prompt');
          } else {
            console.error('❌ Add Mini App failed:', error);
          }
        }
      } catch (error) {
        console.error('Error checking Mini App status:', error);
      }
    };

    if (isFrameReady) {
      const timer = setTimeout(() => {
        promptAddMiniApp();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isFrameReady, hasTriedAddMiniApp]);

  // Global error handler for Transaction component errors
  useEffect(() => {
    const originalError = console.error;

    console.error = (...args) => {
      const errorMessage = args[0]?.toString() || '';
      if (typeof errorMessage === 'string' &&
          (errorMessage.includes('Transaction: calls or contracts must be provided') ||
           errorMessage.includes('Transaction component'))) {
        console.warn('Intercepted Transaction component error:', errorMessage);
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  if (!isMounted) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
