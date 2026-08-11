import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS, loadOgBg } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'The MySphere docs.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image() {
  const bg = await loadOgBg('docs');
  return new ImageResponse(
    PageShareCard({
      head: 'Everything, and how to check it.',
      footer: 'The feed, Asks, Money, the curator record and the Startpad launchpad, in plain terms.',
      bg,
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
