import { ImageResponse } from 'next/og';
import { HomeShareCard, OG_CACHE_HEADERS } from './components/og/HomeShareCard';
import { ogFonts } from './components/og/fonts';

/**
 * Karta OG korzenia serwisu.
 *
 * === CO TA TRASA OBSLUGUJE W PRAKTYCE ===
 * `/` jest przekierowaniem 307 na `/basechat` (next.config.js), wiec pod
 * adresem glownym nie ma zadnego page.tsx. Mimo to plik lezy TUTAJ, a nie
 * w app/basechat/: metadane pliku obrazka z korzenia dziedziczy KAZDA
 * podstrona, ktora nie ma wlasnej. Dzieki temu jednym plikiem obsluzone sa
 * naraz /basechat (czyli faktyczna strona glowna), /asks, /re-definition,
 * /Docs i wszystko, co powstanie pozniej. Cztery trasy z wlasna karta
 * (/leaderboard, /post/[id], /tip/[txHash], /u/[address]) nadpisuja to
 * u siebie i pozostaja nietkniete.
 *
 * Rysunek i cale uzasadnienie decyzji siedza w
 * app/components/og/HomeShareCard.tsx - wspolne z /miniapp-image.
 *
 * === TRZY OSOBNE TEKSTY, NIE JEDEN ===
 * To, co czlowiek widzi na X, sklada sie z trzech napisow pisanych w DWOCH
 * plikach i latwo je pomylic:
 *   1. TRESC W OBRAZKU (naglowek + stopka) - HomeShareCard.tsx,
 *   2. `openGraph.title` - czarny pasek POD obrazkiem - app/layout.tsx
 *      (SOCIAL_TITLE),
 *   3. `openGraph.description` - pokazywany przez czesc platform, na X czesto
 *      ucinany - app/layout.tsx (APP_DESCRIPTION).
 * Sa napisane tak, zeby sie nie powtarzac. Zmieniajac jeden, przeczytaj dwa
 * pozostale, bo inaczej karta zaczyna mowic to samo dwa razy i marnuje pasek.
 */

export const runtime = 'nodejs';
/**
 * `alt` musi opisywac OBRAZEK, a nie strone - czyta go czytnik ekranu i
 * crawler, gdy obrazka nie da sie pokazac. Dlatego jest to naglowek karty
 * przepisany co do znaku, a nie tytul serwisu.
 */
export const alt = 'An AI agent paid to ask. It held no gas. It signed once.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * DLACZEGO force-dynamic przy karcie, ktora nie czyta ZADNYCH danych.
 *
 * Ta trasa nie ma parametru, wiec Next probuje ja prerenderowac przy buildzie
 * i trafia w ten sam blad @vercel/og na `fileURLToPath` ("TypeError: Invalid
 * URL"), ktory opisano przy app/leaderboard/opengraph-image.tsx:19-31. Ironia
 * jest pelna: karta calkowicie statyczna jest jedyna, ktora naprawde moglaby
 * byc plikiem w buildzie, a i tak wymaga tego samego obejscia co ranking.
 *
 * Koszt renderowania na zadanie zbija naglowek Cache-Control (tydzien w CDN) -
 * podglad linku pobierany jest raz na wklejenie, a tresc obrazka nie zmienia
 * sie miedzy wdrozeniami.
 */
export const dynamic = 'force-dynamic';

export default async function Image() {
  return new ImageResponse(HomeShareCard(), {
    ...size,
    headers: OG_CACHE_HEADERS,
    fonts: await ogFonts(),
  });
}
