'use client';

import { PropsWithChildren, useEffect } from 'react';
import FrameSDK from '@farcaster/frame-sdk';
import { useConnect } from 'wagmi';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';

export function FarcasterFrameProvider({ children }: PropsWithChildren) {
  const { connect } = useConnect();

  useEffect(() => {
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
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [connect]);

  return <>{children}</>;
} 