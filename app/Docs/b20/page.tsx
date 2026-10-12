import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/b20.md';

export const metadata: Metadata = pageMeta({
  title: 'B20 tokens',
  description: 'What a B20 token is: Base\'s admin-less, network-native ERC-20 standard with a self-describing address, and how Startpad uses it for the whole curve supply.',
  image: '/Docs/opengraph-image.png',
});

export default function B20DocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
