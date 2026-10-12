import { ImageResponse } from 'next/og';
import { PageShareCard, PAGE_OG_CACHE_HEADERS } from '../components/og/PageShareCard';
import { ogFonts } from '../components/og/fonts';

/**
 * Karta /asks (wszystkie zakladki). Zastapila statyczny PNG. Naklejki z
 * opisu Askow: miejsca, termin, escrow albo wyplata przy rozstrzygnieciu,
 * hash kazdej wyplaty (app/api/asks/[id]/accept/route.ts).
 *
 * Tresc stala, bez liczb z bazy - CDN trzyma ja tydzien. force-dynamic z tego
 * samego powodu co app/opengraph-image.tsx (prerender przy buildzie trafia
 * w blad @vercel/og na fileURLToPath).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Ask with a budget. Answers stay sealed, payouts are onchain.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    <PageShareCard
      path="/asks"
      headline={['Ask with', 'a budget.']}
      subline="Answers stay sealed. Payouts onchain."
      stickers={[
        { label: 'Sealed' },
        { label: 'Seats' },
        { label: 'Deadline' },
        { label: 'Escrow' },
        { label: 'Tx hash' },
        { label: 'Paid out' },
      ]}
      hero={{ label: 'Your question', sub: 'with a budget' }}
    />,
    { ...size, headers: PAGE_OG_CACHE_HEADERS, fonts: await ogFonts() }
  );
}
