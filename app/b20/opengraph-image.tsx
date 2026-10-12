import { ImageResponse } from 'next/og';
import { PageShareCard, PAGE_OG_CACHE_HEADERS } from '../components/og/PageShareCard';
import { ogFonts } from '../components/og/fonts';

/**
 * Karta /b20 i podstron (create, tools, [address]).
 *
 * Tresc stala, bez liczb z bazy - CDN trzyma ja tydzien. force-dynamic z tego
 * samego powodu co app/opengraph-image.tsx (prerender przy buildzie trafia
 * w blad @vercel/og na fileURLToPath).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Every B20 token on Base, and which ones actually trade';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <PageShareCard
      eyebrow="MYSPHERE B20"
      headline="Every B20 token on Base."
      subline="Who made it, and whether it trades."
      footer="Create one, mine an address, or just look it up."
    />,
    { ...size, headers: PAGE_OG_CACHE_HEADERS, fonts: await ogFonts() }
  );
}
