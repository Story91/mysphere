'use client'

import { useAppKit, createAppKit } from '@reown/appkit/react'
import { wagmiAdapter, projectId, metadata } from '@/config/appkit'
import { base } from '@wagmi/core/chains'
import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

export const AppKitButton = () => {
  const [isInitialized, setIsInitialized] = useState(false)
  const { isConnected } = useAccount()

  useEffect(() => {
    const appkit = createAppKit({
      adapters: [wagmiAdapter],
      networks: [base],
      projectId,
      metadata
    })
    setIsInitialized(true)

    // Cleanup function to handle component unmount
    return () => {
      appkit.close()
    }
  }, [])

  if (!isInitialized) {
    return null
  }

  const { open } = useAppKit()

  return (
    <div className="relative group">
      <div className="absolute -inset-1 bg-gradient-to-r from-[#FF4B26] to-[#FF8126] rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-300"></div>
      <button 
        onClick={() => open()}
        className="relative bg-[#FF4B26] hover:bg-[#FF4B26]/90 rounded-xl p-2.5 text-white shadow-lg shadow-[#FF4B26]/20 transition-all duration-300 hover:scale-105"
        aria-label="Connect Wallet"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.04 13.55C17.62 13.96 17.38 14.55 17.44 15.18C17.53 16.26 18.52 17.05 19.6 17.05H21.5V18.24C21.5 20.31 19.81 22 17.74 22H6.26C4.19 22 2.5 20.31 2.5 18.24V11.51C2.5 9.44001 4.19 7.75 6.26 7.75H17.74C19.81 7.75 21.5 9.44001 21.5 11.51V12.95H19.48C18.92 12.95 18.41 13.17 18.04 13.55Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2.5 12.41V7.84004C2.5 6.65004 3.23 5.59 4.34 5.17L12.28 2.17C13.52 1.7 14.85 2.62003 14.85 3.95003V7.75002" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22.5588 13.9702V16.0302C22.5588 16.5802 22.1188 17.0302 21.5588 17.0502H19.5988C18.5188 17.0502 17.5288 16.2602 17.4388 15.1802C17.3788 14.5502 17.6188 13.9602 18.0388 13.5502C18.4088 13.1702 18.9188 12.9502 19.4788 12.9502H21.5588C22.1188 12.9702 22.5588 13.4202 22.5588 13.9702Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
} 