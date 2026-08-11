import { ImageResponse } from 'next/og';
import { PageShareCard, OG_CACHE_HEADERS } from '../components/og/PageShareCard';

export const runtime = 'nodejs';
export const alt = 'Launch a token in minutes.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// force-dynamic: te same powody co przy pozostalych kartach (blad @vercel/og na
// fileURLToPath przy prerenderze bezparametrowej trasy). Cache zbija naglowek.
export const dynamic = 'force-dynamic';

export default function Image() {
  return new ImageResponse(
    PageShareCard({
      head: 'Launch a token in minutes.',
      footer: 'A bonding-curve launchpad on Base and Robinhood. You keep up to 70% of the fees.',
    }),
    { ...size, headers: OG_CACHE_HEADERS }
  );
}
