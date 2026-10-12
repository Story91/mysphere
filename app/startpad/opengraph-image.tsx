import { ImageResponse } from 'next/og';
import { PageShareCard, PAGE_OG_CACHE_HEADERS } from '../components/og/PageShareCard';
import { ogFonts } from '../components/og/fonts';
import { PERP_CHIPS } from '../narrative';

/**
 * Karta /startpad i wszystkiego pod nim, co nie ma wlasnej (tokeny i /perps
 * maja). Zastapila statyczny PNG "Launch a B20 token" z vanity adresami. 70%
 * = maxCreatorShareBps 7000 (LaunchTokenModal.tsx, StartpadFooter.tsx).
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
      eyebrow="MYSPHERE STARTPAD"
      headline="Launch a meme on Base."
      subline="Keep up to 70% of the curve fee."
      chips={PERP_CHIPS}
      footer="2x perps"
    />,
    { ...size, headers: PAGE_OG_CACHE_HEADERS, fonts: await ogFonts() }
  );
}
