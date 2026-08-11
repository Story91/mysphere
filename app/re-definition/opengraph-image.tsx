import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS, loadOgBg } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'A like is worth $0.00.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image() {
  const bg = await loadOgBg('redefinition');
  return new ImageResponse(
    PageShareCard({
      head: 'A like is worth $0.00.',
      footer: 'A payment is not. Why the timeline runs on money, not applause.',
      bg,
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
