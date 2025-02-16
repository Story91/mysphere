import '@coinbase/onchainkit/styles.css';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Providers } from './providers';
import Navigation from './components/Navigation/Navigation';
import { ThemeProvider } from './context/ThemeContext';
import dynamic from 'next/dynamic';

// Wrapper dla komponentów klienckich
const ClientWrapper = dynamic(() => import('./ClientWrapper'), { ssr: false });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <head>
        <script src="https://www.google.com/recaptcha/enterprise.js?render=6LfNUMkqAAAAAKwvD-9Ow1vtA8aPwZFDSJ2nen47" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        
        {/* Frame v1 compatibility tags */}
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="https://mysphere.fun/images/frame-v2.png" />
        <meta property="fc:frame:button:1" content="Open MySphere" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content="https://mysphere.fun/basechat" />
        <meta property="fc:frame:aspect_ratio" content="1.91:1" />
        
        {/* Frame v2 tag */}
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

        {/* Frame v2 tag dla root URL */}
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

        {/* Frame v2 tag dla www */}
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
        <ClientWrapper>
          <ThemeProvider>
            <Providers>
              <Navigation />
              <main className="w-full">
                {children}
              </main>
              <Analytics />
              <SpeedInsights />
            </Providers>
          </ThemeProvider>
        </ClientWrapper>
      </body>
    </html>
  );
}
