import { PropsWithChildren, useEffect } from 'react';
import FrameSDK from '@farcaster/frame-sdk';
import { farcasterFrame } from '@farcaster/frame-wagmi-connector';
import { connect } from 'wagmi/actions';
import { wagmiConfig } from '../Web3Provider/wagmiConfig';

export function FarcasterFrameProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    const init = async () => {
      const context = await FrameSDK.context;

      // Autoconnect jeśli uruchomione w ramce
      if (context?.client.clientFid) {
        connect(wagmiConfig, { connector: farcasterFrame() });
      }

      // Ukryj splash screen po wyrenderowaniu UI
      setTimeout(() => {
        FrameSDK.actions.ready();
      }, 500);
    };
    init();
  }, []);

  return <>{children}</>;
} 