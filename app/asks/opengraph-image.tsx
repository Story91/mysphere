import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS, loadOgBg } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'Ask with a budget.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image() {
  const bg = await loadOgBg('asks');
  return new ImageResponse(
    PageShareCard({
      head: 'Ask with a budget.',
      footer: 'Questions with seats and a deadline. Answers stay sealed. Every payout is onchain.',
      bg,
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
