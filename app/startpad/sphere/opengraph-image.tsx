import { ImageResponse } from 'next/og';
import { PageShareCard, PAGE_OG_CACHE_HEADERS } from '../../components/og/PageShareCard';
import { ogFonts } from '../../components/og/fonts';

/**
 * Karta /startpad/sphere i jego podstron (about, escrow, rewards, season,
 * vesting). Chipy = podstrony. Zadnych cen, APY ani obietnic odkupu - regula
 * z docs/SPHERE-SOCIAL-PLAN.md sekcja 4.
 *
 * Tresc stala, bez liczb z bazy - CDN trzyma ja tydzien. force-dynamic z tego
 * samego powodu co app/opengraph-image.tsx (prerender przy buildzie trafia
 * w blad @vercel/og na fileURLToPath).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = '$SPHERE on Startpad: the token behind the launchpad';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <PageShareCard
      eyebrow="MYSPHERE · $SPHERE"
      headline="$SPHERE on Startpad."
      subline="The token behind the launchpad."
      chips={['Rewards', 'Season', 'Escrow', 'Vesting']}
      footer="on Base"
    />,
    { ...size, headers: PAGE_OG_CACHE_HEADERS, fonts: await ogFonts() }
  );
}
