import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { farcasterFrame } from '@farcaster/frame-wagmi-connector'

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http()
  },
  connectors: [
    injected(),
    coinbaseWallet({
      appName: 'MySphere',
      appLogoUrl: '/android-chrome-192x192.png',
      darkMode: true
    }),
    farcasterFrame(),
    walletConnect({ 
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || '',
      metadata: {
        name: 'MySphere',
        description: 'Social network on Base',
        url: 'https://mysphere.fun',
        icons: ['https://mysphere.fun/android-chrome-192x192.png']
      }
    })
  ]
}) 