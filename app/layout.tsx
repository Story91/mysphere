import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Space_Grotesk, Outfit, Baloo_2, Nunito } from 'next/font/google';
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

/**
 * Kroje kierunku "Soft Social" (projekt wlasciciela, wariant 1b).
 *
 * Baloo 2 niesie naglowki i liczby - ma zaokraglone konce kresek i wysoka
 * x-height, wiec kwota napisana nim czyta sie jak etykieta na produkcie,
 * a nie jak dane w tabeli. Nunito jest tekstem: neutralny, ale nie zimny.
 *
 * Wczytujemy je przez next/font, a nie przez @import z fonts.googleapis.com -
 * next/font hostuje pliki same-origin i wstrzykuje preload, wiec nie ma
 * render-blokujacego zapytania do obcej domeny ani skoku typografii.
 *
 * Stare zmienne (--font-body / --font-heading) ZOSTAJA nietkniete: caly
 * dotychczasowy interfejs stoi na nich i ma dzialac dalej bez zmian.
 * Nowe kroje sa dostepne przez wlasne zmienne i wchodza tam, gdzie kierunek
 * jest juz wdrozony.
 */
const softDisplayFont = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-soft-display',
});

const softBodyFont = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  variable: '--font-soft-body',
});

// Kanoniczny adres produkcyjny. Jedno miejsce, bo uzywaja go i metadane, i
// embed miniappki, i musi sie zgadzac z domena podpisana w
// public/.well-known/farcaster.json (accountAssociation -> domain).
const APP_URL = 'https://mysphere.fun';

// Miniapp embed. `fc:miniapp` to aktualny tag; `fc:frame` zostawiony dla
// wstecznej zgodnosci ze starszymi klientami. W obu `version` musi byc
// stringiem "1" - "next" jest przestarzale i klienci je odrzucaja.
const MINIAPP_EMBED = JSON.stringify({
  version: '1',
  imageUrl: `${APP_URL}/SphereWhite.png`,
  button: {
    title: 'Tip Creators',
    action: {
      type: 'launch_miniapp',
      name: 'MySphere',
      url: APP_URL,
      splashImageUrl: `${APP_URL}/SPLASH.gif`,
      splashBackgroundColor: '#FFFFFF',
    },
  },
});

const APP_DESCRIPTION =
  'The onchain social Dapp on Base. Build, grow, and own your digital Sphere.';

/**
 * Metadane generowane po stronie SERWERA.
 *
 * Wczesniej byly to surowe tagi <title>/<meta> w <head> klienckiego layoutu,
 * czyli trafialy do dokumentu dopiero po hydracji - crawlery i podglady linkow
 * (w tym embed miniappki Farcastera) widzialy pusty dokument.
 */
export const metadata: Metadata = {
  // Bez metadataBase Next liczy adresy Open Graph wzgledem localhost i wypisuje
  // ostrzezenie przy kazdym buildzie ("metadataBase property in metadata export
  // is not set"), a podglady linkow dostaja wtedy wzgledne, nieklikalne URL-e.
  metadataBase: new URL(APP_URL),
  title: 'MySphere.fun',
  description: APP_DESCRIPTION,
  manifest: '/manifest.json',
  // Uwaga: to jest layout GLOWNY - kazde pole dziedzicza wszystkie podstrony,
  // ktore go nie nadpisza. Dlatego nie ma tu ani `alternates.canonical`, ani
  // `openGraph.url`: wpisane raz na gorze wskazywalyby strone glowna dla calego
  // serwisu. Podstrona, ktora chce wlasny canonical/og:url, dodaje go u siebie.
  openGraph: {
    type: 'website',
    siteName: 'MySphere',
    title: 'MySphere - Social on Base',
    description: APP_DESCRIPTION,
    images: [{ url: '/SphereWhite.png', width: 640, height: 360, alt: 'MySphere' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MySphere - Social on Base',
    description: APP_DESCRIPTION,
    images: ['/SphereWhite.png'],
  },
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
    // lang="en": cala tresc interfejsu i metadanych jest po angielsku. Przy
    // lang="pl" czytniki ekranu czytaly angielskie teksty polska fonetyka,
    // a wyszukiwarki dostawaly zly jezyk strony.
    <html
      lang="en"
      className={`${bodyFont.variable} ${headingFont.variable} ${softDisplayFont.variable} ${softBodyFont.variable}`}
    >
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
