import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MySphere Quotes',
  description: 'Create and mint your own quotes as NFTs on Base',
  openGraph: {
    title: 'MySphere Quotes',
    description: 'Create and mint your own quotes as NFTs on Base',
    images: ['/og-image.png'],
  },
  other: {
    'fc:frame': 'vNext',
    'fc:frame:image': 'https://basebook.vercel.app/og-image.png',
    'fc:frame:button:1': 'Mint Quote',
    'fc:frame:button:2': 'View Collection',
    'fc:frame:post_url': 'https://basebook.vercel.app/api/frame',
  },
};

export default function QuotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-screen flex-col items-center justify-between">
      {children}
    </section>
  );
} 