import { ImageResponse } from 'next/og';
import { PageShareCard, PAGE_OG_CACHE_HEADERS } from '../components/og/PageShareCard';
import { ogFonts } from '../components/og/fonts';

/**
 * Karta /how. Zastapila statyczny PNG. Naklejki = moduly opisane na stronie.
 *
 * Tresc stala, bez liczb z bazy - CDN trzyma ja tydzien. force-dynamic z tego
 * samego powodu co app/opengraph-image.tsx (prerender przy buildzie trafia
 * w blad @vercel/og na fileURLToPath).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'How MySphere works, step by step';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <PageShareCard
      path="/how"
      headline={['How', 'MySphere', 'works.']}
      subline="From a wallet to your first launch."
      stickers={[
        { label: 'Post' },
        { label: 'Tip' },
        { label: 'Ask' },
        { label: 'Launch' },
        { label: 'Pair 2x' },
        { label: 'Unlock' },
      ]}
      hero={{ label: 'Start here', sub: 'one page, every module' }}
    />,
    { ...size, headers: PAGE_OG_CACHE_HEADERS, fonts: await ogFonts() }
  );
}
