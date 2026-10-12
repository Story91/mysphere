import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Space_Grotesk, Outfit, Baloo_2, Nunito } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import AppShell from './components/AppShell';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from './startpad/config';
import { networkThemeCss, themeBootScript } from './startpad/networkTheme';
import { APP_DESCRIPTION, MINIAPP_BUTTON, SOCIAL_TITLE } from './narrative';

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
//
// imageUrl wskazuje na app/miniapp-image/route.tsx, a NIE na karte OG.
// Powod: embed miniappki wymaga proporcji 3:2, a karta OG ma 1200x630 (1.91:1);
// klient przycinalby ja do kwadratowszego kadru i zjadal lewa krawedz, czyli
// krecoslup i poczatki obu zdan. Wczesniej lezalo tu /SphereWhite.png, przez co
// Base App i klienci Farcastera pokazywali statyczne logo zamiast karty.
// Slash na koncu jest konieczny: projekt ma `trailingSlash: true`, wiec adres
// bez niego dostaje 308 i nie kazdy klient podglądu za nim pojdzie.
const MINIAPP_EMBED = JSON.stringify({
  version: '1',
  imageUrl: `${APP_URL}/miniapp-image/`,
  button: {
    // Limit Farcastera to 32 znaki - pilnuje go komentarz w app/narrative.ts.
    title: MINIAPP_BUTTON,
    action: {
      type: 'launch_miniapp',
      name: 'MySphere',
      url: APP_URL,
      splashImageUrl: `${APP_URL}/SPLASH.gif`,
      splashBackgroundColor: '#FFFFFF',
    },
  },
});

/**
 * Tytul, opis i haslo zyja w app/narrative.ts - jednym pliku dla metadanych,
 * karty strony glownej i embeddu miniappki. Historia poprzednich wersji
 * (teza "money is the timeline", liczby sieci postowania i napiwkow, slowo
 * "every" przy Askach) jest w git log tego pliku przed 2026-10-12.
 */

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
  // `template` doklada marke do tytulow podstron, wiec podstrona pisze u siebie
  // samo "Open asks", a nie "Open asks - MySphere". `default` obowiazuje tam,
  // gdzie nikt tytulu nie ustawil - czyli m.in. na /basechat, ktore jest
  // komponentem klienckim i wlasnych metadanych wyeksportowac nie moze.
  title: {
    default: SOCIAL_TITLE,
    template: '%s · MySphere',
  },
  description: APP_DESCRIPTION,
  manifest: '/manifest.json',
  // Uwaga: to jest layout GLOWNY - kazde pole dziedzicza wszystkie podstrony,
  // ktore go nie nadpisza. Dlatego nie ma tu ani `alternates.canonical`, ani
  // `openGraph.url`: wpisane raz na gorze wskazywalyby strone glowna dla calego
  // serwisu. Podstrona, ktora chce wlasny canonical/og:url, dodaje go u siebie.
  openGraph: {
    type: 'website',
    siteName: 'MySphere',
    title: SOCIAL_TITLE,
    description: APP_DESCRIPTION,
    // BRAK `images` JEST TU CELOWY - nie zapomnieniem.
    // Obrazek podglądu daje plikowa konwencja: app/opengraph-image.tsx.
    // Wpisana tutaj tablica `images` wygralaby z plikiem dla CALEGO serwisu,
    // wiec generowana karta nigdy by sie nie pokazala - a trasy z wlasna karta
    // (/leaderboard, /post, /tip, /u) straciłyby swoje. Poprzednio stalo tu
    // /SphereWhite.png, czyli statyczne logo 15 kB przykrywalo wszystkie cztery.
  },
  twitter: {
    card: 'summary_large_image',
    title: SOCIAL_TITLE,
    description: APP_DESCRIPTION,
    // === DLACZEGO NIE MA TU `images` ANI PLIKU app/twitter-image.tsx ===
    // Kuszace bylo dolozyc app/twitter-image.tsx dla pewnosci, ze `twitter:image`
    // jest wypisane wprost. Napisane, ZMIERZONE W HTML-u i WYCOFANE: plik
    // twitter-image w korzeniu dziedziczy KAZDA podstrona, a cztery trasy
    // z wlasna karta maja tylko `opengraph-image`, nie `twitter-image`.
    // Skutek byl taki, ze /leaderboard oddawalo `twitter:image` wskazujacy na
    // karte strony glownej - ranking wrzucony na X pokazywalby teze produktu
    // zamiast nazwisk i kwot. To samo spotkaloby paragony i profile.
    //
    // Bez tego pliku Next wyprowadza `twitter:image` z `opengraph-image` TEJ
    // SAMEJ trasy, wiec kazda dostaje swoja wlasna karte. Zmierzone:
    //   /            -> twitter:image = /opengraph-image
    //   /leaderboard -> twitter:image = /leaderboard/opengraph-image
    // Usuniecie `images: ['/SphereWhite.png']`, ktore stalo tu wczesniej, jest
    // przy okazji NAPRAWA: statyczne logo przykrywalo dotad wszystkie cztery
    // karty danych w podgladach na X.
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
        {/* ===== MOTYW SIECI STARTPADA =====
            Dwa elementy, oba MUSZA stac przed trescia.

            Styl niesie palety wszystkich sieci, ktore je maja (dzis jedna,
            Robinhood). Jest nieaktywny, dopoki na <html> nie pojawi sie
            `data-net-theme` - poza startpadem nie robi zatem nic.

            Skrypt ustawia ten atrybut PRZED pierwszym malowaniem. Musi byc
            wpisany wprost i synchronicznie: wybor sieci zyje w localStorage,
            wiec serwer renderuje zawsze siec domyslna i kazde inne rozwiazanie
            (efekt, provider, next/script) pokazaloby najpierw biala strone,
            a dopiero potem czarna. Uzasadnienie calosci: startpad/networkTheme.ts. */}
        <style dangerouslySetInnerHTML={{ __html: networkThemeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript(DEFAULT_LAUNCHPAD_CHAIN_ID) }} />

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
