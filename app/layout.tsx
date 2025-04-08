'use client';

import '@coinbase/onchainkit/styles.css';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/react"
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
        {/* Usunięto skrypt reCAPTCHA - obciążał stronę */}
        {/* <script src="https://www.google.com/recaptcha/enterprise.js?render=6LfNUMkqAAAAAKwvD-9Ow1vtA8aPwZFDSJ2nen47" /> */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        
        {/* Frame compatibility tags */}
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="https://mysphere.fun/images/frame-v2.png" />
        <meta property="fc:frame:button:1" content="Open MySphere" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content="https://mysphere.fun/basechat" />
        <meta property="fc:frame:aspect_ratio" content="1.91:1" />
        
        {/* Frame v2 tags */}
        <meta name="fc:frame" content='{
          "version": "next",
          "imageUrl": "https://mysphere.fun/images/frame-v2.png",
          "buttons": [
            {
              "label": "Open MySphere",
              "action": "post",
              "target": "https://mysphere.fun/basechat"
            }
          ],
          "postUrl": "https://mysphere.fun/api/frame"
        }' />
        <meta name="fc:frame:root" content='{
          "version": "next",
          "imageUrl": "https://mysphere.fun/images/frame-v2.png",
          "buttons": [
            {
              "label": "Open MySphere",
              "action": "post",
              "target": "https://mysphere.fun"
            }
          ],
          "postUrl": "https://mysphere.fun/api/frame"
        }' />
        <meta name="fc:frame:www" content='{
          "version": "next",
          "imageUrl": "https://mysphere.fun/images/frame-v2.png",
          "buttons": [
            {
              "label": "Open MySphere",
              "action": "post",
              "target": "https://www.mysphere.fun"
            }
          ],
          "postUrl": "https://mysphere.fun/api/frame"
        }' />
        <link rel="icon" type="image/x-icon" href="/favicon_io (1)/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon_io (1)/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon_io (1)/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon_io (1)/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0052FF" />
      </head>
      <body className="min-h-screen bg-[#0F172A]">
        <ThemeProvider>
          <ContextProvider>
            <Providers>
              <ClientOnly fallback={
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-black to-[#050B20]">
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
              <Analytics />
              <SpeedInsights />
            </Providers>
          </ContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
