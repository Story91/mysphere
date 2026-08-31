'use client';

import Script from 'next/script';
import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/react"
import { Toaster } from 'react-hot-toast';
import { Providers } from './providers';
import Navigation from './components/Navigation/Navigation';
import { ThemeProvider } from './context/ThemeContext';
import ClientOnly from './components/ClientOnly';
import ContextProvider from '@/context';
import { usePathname } from 'next/navigation';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHomepage = pathname === '/';

  return (
    <html lang="pl">
      <head>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3796065666088205"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        {/* Usunięto skrypt reCAPTCHA - obciążał stronę */}
        {/* <script src="https://www.google.com/recaptcha/enterprise.js?render=6LfNUMkqAAAAAKwvD-9Ow1vtA8aPwZFDSJ2nen47" /> */}
        <title>MySphere.fun</title>
        <meta name="description" content="The onchain social Dapp on Base. Your posts live onchain and stay yours." />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

        {/* Link preview card. Swap the two image URLs to any file in /public/share
            to change what X, Discord, Slack and iMessage show. All are 1200x630. */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="MySphere" />
        <meta property="og:url" content="https://mysphere.fun" />
        <meta property="og:title" content="MySphere - onchain social on Base" />
        <meta property="og:description" content="The onchain social Dapp on Base. Your posts live onchain and stay yours." />
        <meta property="og:image" content="https://mysphere.fun/share/share-no-admin.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Startpad contract surface: owner, pause, upgrade, blacklist and fee switch all listed as none." />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="MySphere - onchain social on Base" />
        <meta name="twitter:description" content="The onchain social Dapp on Base. Your posts live onchain and stay yours." />
        <meta name="twitter:image" content="https://mysphere.fun/share/share-no-admin.png" />
        <meta name="twitter:image:alt" content="Startpad contract surface: owner, pause, upgrade, blacklist and fee switch all listed as none." />
        
        {/* Farcaster Frame - zaktualizowany format z launch_frame */}
        <meta name="fc:frame" content='{
          "version": "next",
          "imageUrl": "https://mysphere.fun/SphereWhite.png",
          "aspectRatio": "3:2",
          "button": {
            "title": "Tip Creators",
            "action": {
              "type": "launch_frame",
              "name": "MySphere",
              "url": "https://mysphere.fun",
              "splashImageUrl": "https://mysphere.fun/SPLASH.gif",
              "splashBackgroundColor": "#FFFFFF"
            }
          }
        }' />
        
        <link rel="stylesheet" href="https://unpkg.com/@coinbase/onchainkit@1.1.2/dist/assets/style.css" />
        <link rel="icon" type="image/x-icon" href="/favicon_io (1)/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon_io (1)/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon_io (1)/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon_io (1)/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0052FF" />
      </head>
      <body className="min-h-screen bg-white">
        <ThemeProvider>
          <ContextProvider>
            <Providers>
              <ClientOnly fallback={
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50">
                  <div className="relative">
                    <div className="absolute -inset-6 rounded-full bg-blue-500/20 animate-pulse"></div>
                    <div className="relative w-32 h-32 animate-spin">
                      <img 
                        src="/favicon_io (1)/apple-touch-icon.png" 
                        alt="Loading" 
                        className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                      />
                    </div>
                  </div>
                </div>
              }>
                {!isHomepage && <Navigation />}
                <main className="w-full">
                  {children}
                </main>
              </ClientOnly>
              
              {/* Toast Notifications */}
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
              
              <Analytics />
              <SpeedInsights />
            </Providers>
          </ContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
