import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'How MySphere works.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default function Image() {
  return new ImageResponse(
    PageShareCard({
      head: 'How MySphere works.',
      footer: 'From connecting a wallet to posting, asking, and launching a token. Step by step.',
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
