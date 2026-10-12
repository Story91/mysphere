import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/feed.md';

export const metadata: Metadata = pageMeta({
  title: 'Feed, posts & tips',
  description: 'How MySphere\'s feed works: posting across nine networks, tipping authors on the eight EVM ones and in SOL under Solana posts, and selling part of a post through a one-time paid unlock, with onchain receipts.',
  image: '/Docs/opengraph-image.png',
});

export default function FeedDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
