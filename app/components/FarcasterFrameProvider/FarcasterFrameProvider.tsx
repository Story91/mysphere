'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import sdk from '@farcaster/miniapp-sdk';
import { useConnect } from 'wagmi';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';

export function FarcasterFrameProvider({ children }: PropsWithChildren) {
  const { connect } = useConnect();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
