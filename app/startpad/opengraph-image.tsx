import { ImageResponse } from 'next/og';
import { PageShareCard, PAGE_OG_CACHE_HEADERS } from '../components/og/PageShareCard';
import { ogFonts } from '../components/og/fonts';

/**
 * Karta /startpad i wszystkiego pod nim, co nie ma wlasnej (tokeny i /perps
 * maja). 70% = maxCreatorShareBps 7000 (LaunchTokenModal.tsx,
 * StartpadFooter.tsx); graduacja do puli Uniswap v4 - opis tokena w
 * app/startpad/[address]/page.tsx.
 *
 * Tresc stala, bez liczb z bazy - CDN trzyma ja tydzien. force-dynamic z tego
 * samego powodu co app/opengraph-image.tsx (prerender przy buildzie trafia
 * w blad @vercel/og na fileURLToPath).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Launch a meme on Base. Keep up to 70% of the curve fee.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <PageShareCard
      path="/startpad"
      headline={['Launch', 'a meme', 'on Base.']}
      subline="Keep up to 70% of the curve fee."
      stickers={[
        { label: 'ETH curve' },
        { label: 'Nvidia 2x' },
        { label: 'Uniswap v4' },
        { label: 'SpaceX 2x' },
        { label: 'B20 token' },
        { label: 'BTC 2x' },
      ]}
      hero={{ label: '$YOUR MEME', sub: 'graduates to a live pool' }}
    />,
    { ...size, headers: PAGE_OG_CACHE_HEADERS, fonts: await ogFonts() }
  );
}
