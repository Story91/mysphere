import { createConfig, http } from '@wagmi/core'
import { base } from '@wagmi/core/chains'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

if (!process.env.NEXT_PUBLIC_REOWN_PROJECT_ID) {
  throw new Error('Missing NEXT_PUBLIC_REOWN_PROJECT_ID')
}

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http()
  }
})

export const wagmiAdapter = new WagmiAdapter({
  networks: [base],
  projectId,
})

export const metadata = {
  name: 'MySphere',
  description: 'Social platform for Base network',
  url: 'https://mysphere.fun',
  icons: ['https://mysphere.fun/android-chrome-192x192.png']
} 