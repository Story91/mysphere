import type { Metadata } from 'next';
import DerivativesBoard from './DerivativesBoard';

export const metadata: Metadata = {
  title: 'Arc Derivatives',
  description: 'vAMM perpetuals: list a price feed with a bond, or trade one with leverage.',
};

export default function DerivativesPage() {
  return <DerivativesBoard />;
}
