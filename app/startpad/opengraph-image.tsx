import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS, loadOgBg } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'Launch a token in minutes.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image() {
  const bg = await loadOgBg('startpad');
  return new ImageResponse(
    PageShareCard({
      head: 'Launch a token in minutes.',
      footer: 'A bonding-curve launchpad on Base and Robinhood. You keep up to 70% of the fees.',
      bg,
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
