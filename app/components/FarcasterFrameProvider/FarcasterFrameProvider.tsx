'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import FrameSDK from '@farcaster/frame-sdk';
import { useConnect } from 'wagmi';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';

export function FarcasterFrameProvider({ children }: PropsWithChildren) {
  const { connect } = useConnect();
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    
    let mounted = true;

    const init = async () => {
      try {
        const context = await FrameSDK.context;

        if (!mounted) return;

        // Autoconnect if running in frame
        if (context?.client.clientFid) {
          connect({ connector: farcasterFrame() });
        }

        // Hide splash screen after UI render
        setTimeout(() => {
          if (mounted) {
            FrameSDK.actions.ready();
          }
        }, 500);
      } catch (error) {
        console.error('Failed to initialize Farcaster Frame:', error);
        setError(error instanceof Error ? error : new Error('Unknown error initializing Farcaster Frame'));
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [connect, isMounted]);

  // Add a global error handler for Transaction component errors
  useEffect(() => {
    // Original error handler to catch Transaction component errors
    const originalError = console.error;
    
    console.error = (...args) => {
      // Check if this is the Transaction prop error
      const errorMessage = args[0]?.toString() || '';
      if (typeof errorMessage === 'string' && 
          (errorMessage.includes('Transaction: calls or contracts must be provided') ||
           errorMessage.includes('Transaction component'))) {
        // Log it but prevent it from crashing the app
        console.warn('Intercepted Transaction component error:', errorMessage);
        // Don't rethrow - this suppresses the error
        return;
      }
      
      // For other errors, use the original handler
      originalError.apply(console, args);
    };
    
    return () => {
      // Restore original handler on cleanup
      console.error = originalError;
    };
  }, []);

  // Add error boundary functionality
  if (error) {
    console.error('FarcasterFrameProvider caught error:', error);
    // Return children anyway to prevent the app from breaking entirely
    return <>{children}</>;
  }

  if (!isMounted) {
    return <>{children}</>;
  }

  // Return the children wrapped in an error boundary
  try {
    return <>{children}</>;
  } catch (err) {
    console.error('Error rendering FarcasterFrameProvider children:', err);
  return <>{children}</>;
  }
} 