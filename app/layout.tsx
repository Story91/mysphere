import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Space_Grotesk, Outfit, Baloo_2, Nunito } from 'next/font/google';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import AppShell from './components/AppShell';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from './startpad/config';
import { networkThemeCss, themeBootScript } from './startpad/networkTheme';

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
    // Limit Farcastera to 32 znaki; tu jest 22. Bez wiodacej spacji - klient
    // nie przycina bialych znakow, wiec napis wjezdzalby na przycisku z wcieciem.
    title: 'Ask. Answer. Get paid.',
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
 * === TYTUL I OPIS NIOSA TEZE, NIE KATEGORIE ===
 * Stalo tu: "The onchain social Dapp on Base. Build, grow, and own your digital
 * Sphere." - zdanie prawdziwe i zupelnie puste, bo pasuje do kazdego produktu
 * spolecznosciowego z portfelem. Nie mowilo ani co tu sie robi, ani czym to
 * miejsce rozni sie od pozostalych.
 *
 * Teza MySphere jest jedna: OSIA CZASU SA PIENIADZE, nie tresc. Opis mowi wiec
 * dokladnie to i tylko to, co dziala DZIS: posty, napiwki oraz rynek Askow -
 * budzet, zapieczetowane odpowiedzi, wyplata z hashem. Zadnej liczby
 * uzytkownikow, zadnego czasu przyszlego.
 *
 * Napiwki NIE sa "w ETH i USDC" - tak stalo do 23.09.2026 i bylo prawda tylko
 * na Base. TipNetworkConfig.ts: Celo i Camp tipuja wylacznie CELO i CAMP,
 * World i Linea dokladaja WLD i LINEA, Robinhood USDG, Arc USDC. Stad "ETH,
 * USDC or the chain's own token".
 *
 * === DLACZEGO DWIE ROZNE LICZBY SIECI ===
 * Bo to sa dwie rozne listy i od wejscia Solany juz sie nie pokrywaja.
 *
 * POSTOWANIE - dziewiec, z app/basechat/soft/SoftStoryRail.tsx (SOFT_NETWORKS):
 * Base, Camp, Linea, Celo, Ethereum, World, Robinhood, Arc, Solana. Arc postuje
 * na testnecie, dopoki nie ma NEXT_PUBLIC_ARC_POST_CONTRACT_MAINNET
 * (ArcPostContract.ts) - /how mowi to wprost, ten opis juz nie ma miejsca.
 *
 * NAPIWKI W APLIKACJI - osiem, z `TipNetworkType` w app/utils/firebase.ts:
 * Base, Ethereum, Celo, World, Linea, Camp, Robinhood, Arc. Solany tam NIE MA
 * i nie wolno jej doliczyc. Napiwek w SOL istnieje, ale POZA ta lista: pod
 * postem z Solany ida z linku (/blink/tip/<id>, a platna odpowiedz z
 * /blink/reply/<id>, obie jako Solana Actions), SOL leci prosto na portfel,
 * ktory podpisal post, i nic z tego nie trafia do kolekcji `tips` - ani na
 * Paid, ani do /money. Zapisem jest sama transakcja na Solanie. Dlatego opis
 * mowi o osmiu sieciach napiwkow i nie dopisuje SOL-a: to inna sciezka,
 * inny zapis, a na produkcji dziala tylko z mainnetem Solany (blinksDisabled
 * w app/api/actions/actionHeaders.ts).
 *
 * Do 22.09.2026 stalo tu jedno zdanie o "seven networks" i bylo juz falszywe -
 * Arc doszedl jako osmy i nikt tej notki nie poprawil. Stad rozbicie na dwie
 * liczby: zeby nastepna siec wymuszala pytanie "ktorej listy dotyczy".
 *
 * === DLACZEGO SLOWO "EVERY" PRZENIESLO SIE Z NAPIWKOW NA ASKI ===
 * Stalo tu "every tip settles onchain with a hash anyone can open". To nie jest
 * prawda: firestore.rules (blok tipow) mowi wprost, ze z 189 napiwkow hash ma
 * 18 - reszta pochodzi ze sciezek, ktore go nie zapisuja, i /money pokazuje ten
 * brak jako `withoutProof`. "Every" jest natomiast prawda O ASKACH, bo tam
 * serwer odmawia przyjecia wyplaty bez hasha i sam sprawdza log Transfer na
 * lancuchu (app/api/asks/[id]/accept/route.ts:84). Slowo stoi wiec teraz tam,
 * gdzie da sie go bronic.
 */
const APP_DESCRIPTION =
  "Post across nine networks and tip on eight of them in ETH, USDC or the chain's own token. Open an Ask with a budget, collect sealed answers, and pay the ones you pick - every Ask payout carries a transaction hash anyone can open.";

/**
 * Jeden tytul dla <title>, og:title i twitter:title.
 *
 * DLACZEGO NIE POWTARZA ZDAN Z KARTY. Karta obrazka niesie teraz zdarzenie
 * ("An AI agent paid to ask...") i rynek Askow, a X pokazuje pod obrazkiem
 * dokladnie jeden pasek tekstu - powtorzenie tych samych slow zmarnowaloby go
 * w calosci. Na obrazku nie pada ani "social", ani "feed", ani "Base": to trzy
 * rzeczy, ktore czlowiek musi wiedziec, zeby zrozumiec, na co patrzy, i one
 * wlasnie sa tutaj. Obrazek i pasek skladaja sie na jedno zdanie.
 *
 * Poprzednik brzmial "MySphere - social on Base, scored by settled payments".
 * Wymieniony razem z karta: mowil o mierzeniu pozycji platnosciami, czego nowy
 * obrazek nie zapowiada ani slowem, wiec para przestala sie skladac.
 *
 * DLUGOSC MA ZNACZENIE: X urywa ten pasek w okolicach 70 znakow na pulpicie
 * i wczesniej na telefonie. Ponizej jest 59 - nazwa i teza mieszcza sie przed
 * kazdym mozliwym ucieciem.
 */
const SOCIAL_TITLE = 'MySphere - a social feed on Base where money is the timeline';

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
