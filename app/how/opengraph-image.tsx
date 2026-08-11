import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS, loadOgBg } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'How MySphere works.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image() {
  const bg = await loadOgBg('how');
  return new ImageResponse(
    PageShareCard({
      head: 'How MySphere works.',
      footer: 'From connecting a wallet to posting, asking, and launching a token. Step by step.',
      bg,
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
