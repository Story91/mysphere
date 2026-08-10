import type { Metadata } from 'next';
import LaunchpadTokenDetail from './LaunchpadTokenDetail';

export const metadata: Metadata = {
  title: 'Launch details',
  description: 'Onchain curve, trades and pool details on Base Sepolia.',
};

export default function LaunchpadTokenPage({ params }: { params: { address: string } }) {
  return <LaunchpadTokenDetail address={params.address} />;
}
