'use client';

import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Navigation from './Navigation/Navigation';
import { ThemeProvider } from '../context/ThemeContext';
import { Providers } from '../providers';
import SessionPrompt from './auth/SessionPrompt';
import { installMerkleProxy } from '../utils/merkleProxy';

/**
 * Kliencka powloka aplikacji.
 *
 * Powstala po to, zeby `app/layout.tsx` mogl byc komponentem SERWEROWYM.
 * Wczesniej caly root layout mial 'use client' (przez `usePathname`) i owijal
 * wszystko w <ClientOnly>, przez co do czasu pelnej hydracji uzytkownik widzial
 * spinner, a metadane byly generowane po stronie klienta.
 *
 * Tutaj laduje wylacznie to, co naprawde potrzebuje przegladarki:
 *  - providery Reactowe (wagmi / react-query / OnchainKit / motyw),
 *  - installMerkleProxy - UWAGA: to bylo wczesniej wolane w efekcie ClientOnly.
 *    Zdjecie globalnego ClientOnly bez przeniesienia tego zabiloby przekierowanie
 *    zapytan do eth.merkle.io, z ktorego korzystaja lookupy ENS/Basename
 *    komponentow Identity z OnchainKit.
 *
 * Czego tu NIE MA i byc nie powinno: bramki blokujacej render dzieci do czasu
 * hydracji. Poszczegolne komponenty czytajace window/localStorage maja same
 * uzywac <ClientOnly>, zamiast wstrzymywac cala aplikacje.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {

  useEffect(() => {
    installMerkleProxy();
  }, []);

  return (
    <ThemeProvider>
      <Providers>
        <Navigation />
        <main className="w-full">{children}</main>

        {/* Zaproszenie do podpisu SIWE dla portfeli podlaczonych z pominieciem
            ekranu przedlogowania. Bez tego lancuch tozsamosci konczyl sie na
            jednym ekranie, a Firestore widzial wszystkich jako anonimow. */}
        <SessionPrompt />

        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#f9fafb',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '14px',
            },
            success: {
              style: {
                background: '#10b981',
                color: '#ffffff',
              },
            },
            error: {
              style: {
                background: '#ef4444',
                color: '#ffffff',
              },
            },
            loading: {
              style: {
                background: '#3b82f6',
                color: '#ffffff',
              },
            },
          }}
        />
      </Providers>
    </ThemeProvider>
  );
}
