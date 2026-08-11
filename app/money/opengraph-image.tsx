import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'Your onchain money.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default function Image() {
  return new ImageResponse(
    PageShareCard({
      head: 'Your onchain money.',
      footer: 'What you can claim, next to the work that earned it. Every payout recorded onchain.',
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
