import type { Metadata } from 'next';
import { isAddress, type Address } from 'viem';
import { notFound } from 'next/navigation';
import MarketDetail from './MarketDetail';

export const metadata: Metadata = {
  title: 'Rynek - Arc Derivatives',
  description: 'Otworz long albo short na vAMM.',
};

export default function MarketPage({ params }: { params: { market: string } }) {
  // Adres z URL-a idzie prosto do `readContract`, wiec sprawdzamy go TUTAJ.
  // Bez tego bledny adres wywalalby render, a nie dawal 404.
  if (!isAddress(params.market)) notFound();
  return <MarketDetail market={params.market as Address} />;
}
