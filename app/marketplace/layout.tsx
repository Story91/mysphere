'use client';

// RainbowKit jest uzywany wylacznie przez <ConnectButton> na tej trasie.
// Trzymanie providera + jego CSS w root layoucie ladowalo go na kazdej stronie.
import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return <RainbowKitProvider>{children}</RainbowKitProvider>;
}
