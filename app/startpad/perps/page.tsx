import type { Metadata } from 'next';
import PerpMemesBoard from './PerpMemesBoard';

export const metadata: Metadata = {
  title: 'Perp memes · Startpad',
  description: 'Memes paired with Flash leveraged perps on Base: ETH2xL, NVDA2xL, BTC2xL, SPCX2xL.',
};

export default function PerpMemesPage() {
  return <PerpMemesBoard />;
}
