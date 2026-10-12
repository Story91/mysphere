import { ImageResponse } from 'next/og';
import { HomeShareCard, OG_CACHE_HEADERS } from '../components/og/HomeShareCard';
import { ogFonts } from '../components/og/fonts';

/**
 * Ta sama karta w proporcji 3:2 - wylacznie dla embeddu miniappki.
 *
 * === PO CO OSOBNA TRASA, SKORO JEST JUZ /opengraph-image ===
 * `fc:miniapp` (i stary `fc:frame`) oczekuja obrazka 3:2; karta OG ma
 * 1200x630, czyli 1.91:1. Wskazanie tamtego pliku w embedzie oznaczaloby, ze
 * Base App i klienci Farcastera przycinaja go do 3:2 - a przy monumentalnym
 * tekscie dosunietym do lewej krawedzi przycinane sa wlasnie krecoslup i
 * poczatki obu zdan, czyli caly argument karty. 1200x800 to natywne 3:2.
 *
 * === CO TO NAPRAWIA ===
 * Do tej pory MINIAPP_EMBED w app/layout.tsx wskazywal na /SphereWhite.png -
 * statyczne logo 640x360. Plikowa karta OG nadpisuje `metadata.openGraph`,
 * ale tamtego stringa NIE dotyka, wiec bez tej trasy polowa dystrybucji
 * (Base App, klienci Farcastera) dalej pokazywalaby stare logo.
 *
 * Route Handler, a nie plik metadanych: to nie jest karta zadnej strony, tylko
 * zasob wskazywany z JSON-a w tagu <meta>. `dynamic` z tego samego powodu, co
 * przy karcie OG - trasa bez parametru wywala @vercel/og przy prerenderze.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZE = { width: 1200, height: 800 };

export async function GET() {
  return new ImageResponse(HomeShareCard(SIZE.height), {
    ...SIZE,
    headers: OG_CACHE_HEADERS,
    fonts: await ogFonts(),
  });
}
