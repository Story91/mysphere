import type { Metadata } from 'next';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/feed.md';

export const metadata: Metadata = {
  title: 'Feed, posts & tips',
  description: 'How MySphere\'s feed works: posting, tipping authors in ETH/USDC across networks, and selling part of a post through a one-time paid unlock — with onchain receipts.',
};

export default function FeedDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
