import type { Metadata } from 'next';
import LaunchpadBoard from './LaunchpadBoard';

export const metadata: Metadata = {
  title: 'Startpad',
  description: 'Explore token launches and buy on the bonding curve.',
};

export default function LaunchpadPage() {
  return <LaunchpadBoard />;
}
