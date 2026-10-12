import { ImageResponse } from 'next/og';
import { PageShareCard, PAGE_OG_CACHE_HEADERS } from '../components/og/PageShareCard';
import { ogFonts } from '../components/og/fonts';

/**
 * Karta /Docs i wszystkich podstron dokumentacji (podstrony wskazuja ja
 * przez pageMeta image). Zastapila statyczny PNG. Naklejki = dzialy.
 *
 * Tresc stala, bez liczb z bazy - CDN trzyma ja tydzien. force-dynamic z tego
 * samego powodu co app/opengraph-image.tsx (prerender przy buildzie trafia
 * w blad @vercel/og na fileURLToPath).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'MySphere docs: how each part works and how to verify it';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <PageShareCard
      path="/Docs"
      headline={['Read', 'the math.']}
      subline="How it works and how to verify it."
      stickers={[
        { label: 'Feed' },
        { label: 'Asks' },
        { label: 'Startpad' },
        { label: 'B20' },
        { label: 'Solana' },
        { label: 'Verify' },
      ]}
      hero={{ label: 'Onchain proof', sub: 'which hash, which contract' }}
    />,
    { ...size, headers: PAGE_OG_CACHE_HEADERS, fonts: await ogFonts() }
  );
}
