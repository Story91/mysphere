import type { Metadata } from 'next';
import LaunchpadBoard from './LaunchpadBoard';
import NetworkThemeSync from './NetworkThemeSync';

export const metadata: Metadata = {
  title: 'Startpad',
  description: 'Explore token launches and buy on the bonding curve.',
};

export default function LaunchpadPage() {
  return (
    <>
      {/* Zdejmuje motyw sieci przy wyjsciu ze startpada - patrz NetworkThemeSync. */}
      <NetworkThemeSync />
      <LaunchpadBoard />
    </>
  );
}
