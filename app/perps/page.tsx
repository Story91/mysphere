import type { Metadata } from 'next';
import PerpMemesBoard from '../startpad/perps/PerpMemesBoard';

/**
 * /perps - krotki adres widoku "Perp memes" (memy sparowane z perpami Flash na
 * Base mainnet). Od 2026-10-11 to on stoi pod "Perps" w nawigacji; dawna strona
 * perpow na Arc testnet (/derivatives) zostaje pod swoim adresem, bez linku.
 */
export const metadata: Metadata = {
  title: 'Perps · MySphere',
  description: 'Memes paired with Flash leveraged perps on Base: ETH2xL, NVDA2xL, BTC2xL, SPCX2xL.',
};

export default function PerpsPage() {
  return <PerpMemesBoard />;
}
