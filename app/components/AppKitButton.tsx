'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'

// Komponent AppKit zostanie załadowany dynamicznie tylko po kliknięciu przycisku
export const AppKitButton = () => {
  const [isClient, setIsClient] = useState(false)
  const [showAppKit, setShowAppKit] = useState(false)
  const { isConnected } = useAccount()

  // Sprawdź, czy jesteśmy na kliencie
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Funkcja do dynamicznego ładowania AppKit
  const handleOpenAppKit = async () => {
    setShowAppKit(true)
    
    // Dynamicznie importuj i inicjalizuj AppKit tylko gdy potrzebne
    try {
      const { createAppKit } = await import('@reown/appkit/react')
      const { wagmiAdapter, projectId, metadata } = await import('@/config/appkit')
      const { base } = await import('@wagmi/core/chains')
      
      const appkit = createAppKit({
        adapters: [wagmiAdapter],
        networks: [base],
        projectId,
        metadata
      })
      
      appkit.open()
      
      // Nasłuchuj na zdarzenie zamknięcia
      const handleClose = () => {
        setShowAppKit(false)
        // Usuń nasłuchiwanie po zamknięciu
        window.removeEventListener('appkit:close', handleClose)
      }
      
      window.addEventListener('appkit:close', handleClose)
    } catch (error) {
      console.error('Error loading AppKit:', error)
      setShowAppKit(false)
    }
  }

  // Renderuj przycisk tylko na kliencie
  if (!isClient) {
    return null
  }

  return (
    <div className="relative group">
      <div className="absolute -inset-1 bg-gradient-to-r from-[#FF4B26] to-[#FF8126] rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-300"></div>
      <button 
        onClick={handleOpenAppKit}
        disabled={showAppKit}
        className={`relative bg-[#FF4B26] rounded-xl p-2.5 text-white shadow-lg shadow-[#FF4B26]/20 transition-all duration-300 ${
          showAppKit ? 'opacity-50' : 'hover:bg-[#FF4B26]/90 hover:scale-105'
        }`}
        aria-label="Connect Wallet"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18.04 13.55C17.62 13.96 17.38 14.55 17.44 15.18C17.53 16.26 18.52 17.05 19.6 17.05H21.5V18.24C21.5 20.31 19.81 22 17.74 22H6.26C4.19 22 2.5 20.31 2.5 18.24V11.51C2.5 9.44001 4.19 7.75 6.26 7.75H17.74C19.81 7.75 21.5 9.44001 21.5 11.51V12.95H19.48C18.92 12.95 18.41 13.17 18.04 13.55Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2.5 12.41V7.84004C2.5 6.65004 3.23 5.59 4.34 5.17L12.28 2.17C13.52 1.7 14.85 2.62003 14.85 3.95003V7.75002" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M22.5588 13.9702V16.0302C22.5588 16.5802 22.1188 17.0302 21.5588 17.0502H19.5988C18.5188 17.0502 17.5288 16.2602 17.4388 15.1802C17.3788 14.5502 17.6188 13.9602 18.0388 13.5502C18.4088 13.1702 18.9188 12.9502 19.4788 12.9502H21.5588C22.1188 12.9702 22.5588 13.4202 22.5588 13.9702Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 12H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {showAppKit && (
          <span className="absolute top-0 right-0 h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </span>
        )}
      </button>
    </div>
  )
} 