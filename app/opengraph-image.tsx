import { ImageResponse } from 'next/og';
import { HomeShareCard, OG_CACHE_HEADERS } from './components/og/HomeShareCard';

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
 * app/components/og/HomeShareCard.tsx - wspolne z twitter-image i miniapp-image.
 */

export const runtime = 'nodejs';
export const alt = 'A like is worth $0.00. A payment is not.';
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

export default function Image() {
  return new ImageResponse(HomeShareCard(), { ...size, headers: OG_CACHE_HEADERS });
}
