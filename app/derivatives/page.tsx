import type { Metadata } from 'next';
import DerivativesBoard from './DerivativesBoard';

export const metadata: Metadata = {
  title: 'Arc Derivatives',
  description: 'Perpetualy na vAMM: wystaw feed z kaucja albo handluj z dzwignia.',
};

export default function DerivativesPage() {
  return <DerivativesBoard />;
}
