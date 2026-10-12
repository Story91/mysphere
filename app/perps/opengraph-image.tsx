import { ImageResponse } from 'next/og';
import { PerpsShareCard, PERPS_OG_CACHE_HEADERS } from '../components/og/PerpsShareCard';
import { perpMarkets } from '../api/launchpad/flashFeed';
import { ogFonts } from '../components/og/fonts';
import { DEFAULT_LAUNCHPAD_CHAIN_ID } from '../startpad/config';

/**
 * Karta tablicy rynkow perpow - zywe NAV i zmiana 24h z API Flash.
 * Ten sam plik lezy w app/perps i app/startpad/perps (obie trasy pokazuja
 * PerpMemesBoard); konfiguracja trasy (runtime, dynamic) musi byc literalem
 * w kazdym pliku, wiec nie da sie jej reeksportowac.
 *
 * force-dynamic z tego samego powodu co app/opengraph-image.tsx: trasa bez
 * parametru bylaby prerenderowana przy buildzie i trafia w blad @vercel/og
 * na fileURLToPath. Koszt renderu zbija Cache-Control (10 min w CDN).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Memes on 2x leverage: ETH, Nvidia, Bitcoin and SpaceX perps on MySphere';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const perps = await perpMarkets(DEFAULT_LAUNCHPAD_CHAIN_ID).catch(() => []);
  return new ImageResponse(<PerpsShareCard perps={perps} />, {
    ...size,
    headers: PERPS_OG_CACHE_HEADERS,
    fonts: await ogFonts(),
  });
}
