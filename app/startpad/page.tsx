import type { Metadata } from 'next';
import LaunchpadBoard from './LaunchpadBoard';

export const metadata: Metadata = {
  title: 'Startpad',
  description: 'Explore token launches and buy on the Base Sepolia curve.',
};

export default function LaunchpadPage() {
  return <LaunchpadBoard />;
}
