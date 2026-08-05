import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Space_Grotesk, Outfit } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import AppShell from './components/AppShell';

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

// Miniapp embed. `fc:miniapp` to aktualny tag; `fc:frame` zostawiony dla
// wstecznej zgodnosci ze starszymi klientami. W obu `version` musi byc
// stringiem "1" - "next" jest przestarzale i klienci je odrzucaja.
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

/**
 * Metadane generowane po stronie SERWERA.
 *
 * Wczesniej byly to surowe tagi <title>/<meta> w <head> klienckiego layoutu,
 * czyli trafialy do dokumentu dopiero po hydracji - crawlery i podglady linkow
 * (w tym embed miniappki Farcastera) widzialy pusty dokument.
 */
export const metadata: Metadata = {
  title: 'MySphere.fun',
  description: 'The onchain social Dapp on Base. Build, grow, and own your digital Sphere.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon_io (1)/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon_io (1)/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon_io (1)/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [{ url: '/favicon_io (1)/apple-touch-icon.png', sizes: '180x180' }],
  },
  other: {
    'fc:miniapp': MINIAPP_EMBED,
    'fc:frame': MINIAPP_EMBED,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0052FF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body className="min-h-screen bg-white">
        <AppShell>{children}</AppShell>

        <Analytics />
        <SpeedInsights />
        <Script
          id="adsbygoogle"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3796065666088205"
          crossOrigin="anonymous"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
