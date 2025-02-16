import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http()
  },
  connectors: [
    injected(),
    walletConnect({ 
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || '',
      metadata: {
        name: 'BaseBook',
        description: 'Social network on Base',
        url: 'https://basebook.xyz',
        icons: ['https://basebook.xyz/favicon.ico']
      }
    })
  ]
}) 