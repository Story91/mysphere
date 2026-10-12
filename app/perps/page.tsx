import type { Metadata } from 'next';
import { PERPS_LINE } from '../narrative';
import { pageMeta } from '../utils/pageMeta';
import PerpMemesBoard from '../startpad/perps/PerpMemesBoard';

/**
 * /perps - krotki adres widoku "Perp memes" (memy sparowane z perpami Flash na
 * Base mainnet). Od 2026-10-11 to on stoi pod "Perps" w nawigacji; dawna strona
 * perpow na Arc testnet (/derivatives) zostaje pod swoim adresem, bez linku.
 */
export const metadata: Metadata = pageMeta({
  // Bez "· MySphere" w tytule - dokleja go szablon z layoutu (bylo podwojnie).
  title: 'Perp memes',
  socialTitle: 'Memes on 2x leverage · MySphere Perps',
  description: `Memes paired with ${PERPS_LINE}, on Base. Buy with plain ETH in one transaction.`,
});

export default function PerpsPage() {
  return <PerpMemesBoard />;
}
