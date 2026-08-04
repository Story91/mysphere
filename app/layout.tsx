'use client';

import Script from 'next/script';
import { Space_Grotesk, Outfit } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/react"
import { Toaster } from 'react-hot-toast';
import { Providers } from './providers';
import Navigation from './components/Navigation/Navigation';
import { ThemeProvider } from './context/ThemeContext';
import ClientOnly from './components/ClientOnly';
import { usePathname } from 'next/navigation';

// next/font hostuje fonty same-origin i wstrzykuje preload - zamiast
// render-blokujacego @import z fonts.googleapis.com wewnatrz globals.css.
const bodyFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});

const headingFont = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-heading',
});

const MINIAPP_EMBED = JSON.stringify({
  version: '1',
  imageUrl: 'https://mysphere.fun/SphereWhite.png',
  button: {
    title: 'Tip Creators',
    action: {
      type: 'launch_miniapp',
      name: 'MySphere',
      url: 'https://mysphere.fun',
      splashImageUrl: 'https://mysphere.fun/SPLASH.gif',
      splashBackgroundColor: '#FFFFFF',
    },
  },
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHomepage = pathname === '/';

  return (
    <html lang="pl" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <head>
        {/* Usunięto skrypt reCAPTCHA - obciążał stronę */}
        {/* <script src="https://www.google.com/recaptcha/enterprise.js?render=6LfNUMkqAAAAAKwvD-9Ow1vtA8aPwZFDSJ2nen47" /> */}
        <title>MySphere.fun</title>
        <meta name="description" content="The onchain social Dapp on Base. Build, grow, and own your digital Sphere." />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        
        {/* Miniapp embed. `fc:miniapp` to aktualny tag; `fc:frame` zostawiony
            dla wstecznej zgodnosci ze starszymi klientami. W obu `version` musi
            byc stringiem "1" - "next" jest przestarzale i klienci je odrzucaja. */}
        <meta name="fc:miniapp" content={MINIAPP_EMBED} />
        <meta name="fc:frame" content={MINIAPP_EMBED} />
        
        <link rel="stylesheet" href="/vendor/onchainkit.css" />
        <link rel="icon" type="image/x-icon" href="/favicon_io (1)/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon_io (1)/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon_io (1)/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon_io (1)/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0052FF" />
      </head>
      <body className="min-h-screen bg-white">
        <ThemeProvider>
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
              <Script
                id="adsbygoogle"
                async
                src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3796065666088205"
                crossOrigin="anonymous"
                strategy="lazyOnload"
              />
            </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
