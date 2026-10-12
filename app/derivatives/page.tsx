import type { Metadata } from 'next';
import { pageMeta } from '../utils/pageMeta';
import DerivativesBoard from './DerivativesBoard';

export const metadata: Metadata = pageMeta({
  title: 'Arc Derivatives',
  description: 'vAMM perpetuals: list a price feed with a bond, or trade one with leverage.',
  image: '/opengraph-image',
});

export default function DerivativesPage() {
  return <DerivativesBoard />;
}
