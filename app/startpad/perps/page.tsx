import type { Metadata } from 'next';
import { PERPS_LINE } from '../../narrative';
import { pageMeta } from '../../utils/pageMeta';
import PerpMemesBoard from './PerpMemesBoard';

export const metadata: Metadata = pageMeta({
  // Bez "· MySphere" w tytule - dokleja go szablon z layoutu (bylo podwojnie).
  title: 'Perp memes',
  socialTitle: 'Memes on 2x leverage · MySphere Perps',
  description: `Memes paired with ${PERPS_LINE}, on Base. Buy with plain ETH in one transaction.`,
});

export default function PerpMemesPage() {
  return <PerpMemesBoard />;
}
