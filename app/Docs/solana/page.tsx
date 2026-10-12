import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/solana.md';

export const metadata: Metadata = pageMeta({
  title: 'Solana: bags, tips & replies',
  description:
    'How posting on Solana works on MySphere: the memo receipt, Proof of Bags, tips in SOL and paid replies from a link, how to reply from X, and how to check each one on a Solana explorer.',
  image: '/Docs/opengraph-image.png',
});

export default function SolanaDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
