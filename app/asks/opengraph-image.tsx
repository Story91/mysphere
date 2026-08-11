import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'Ask with a budget.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default function Image() {
  return new ImageResponse(
    PageShareCard({
      head: 'Ask with a budget.',
      footer: 'Questions with seats and a deadline. Answers stay sealed. Every payout is onchain.',
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
