import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/asks.md';

export const metadata: Metadata = pageMeta({
  title: 'Asks & escrow',
  description: 'How MySphere Asks work: a question with a budget, seats and a deadline, with sealed answers and three ways to fund: an owner-less escrow contract on Base, pay-on-resolve from your wallet, or SOL on Solana.',
  image: '/Docs/opengraph-image',
});

export default function AsksDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
