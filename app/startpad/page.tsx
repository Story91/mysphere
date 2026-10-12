import type { Metadata } from 'next';
import { pageMeta } from '../utils/pageMeta';
import { PERPS_LINE } from '../narrative';
import LaunchpadBoard from './LaunchpadBoard';
import NetworkThemeSync from './NetworkThemeSync';

export const metadata: Metadata = pageMeta({
  title: 'Startpad',
  socialTitle: 'MySphere Startpad - launch a meme on Base',
  description:
    `Launch a B20 meme on a bonding curve on Base and keep up to 70% of the curve fee. Pair it with plain ETH or with one of the ${PERPS_LINE}.`,
});

export default function LaunchpadPage() {
  return (
    <>
      {/* Zdejmuje motyw sieci przy wyjsciu ze startpada - patrz NetworkThemeSync. */}
      <NetworkThemeSync />
      <LaunchpadBoard />
    </>
  );
}
