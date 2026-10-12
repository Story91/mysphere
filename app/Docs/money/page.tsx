import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/money.md';

export const metadata: Metadata = pageMeta({
  title: 'Money & Paid',
  description: 'How MySphere\'s Money tab reconstructs what your wallet earned, spent, and has waiting from your address, and how the public Paid tab shows settled payments onchain.',
  image: '/Docs/opengraph-image.png',
});

export default function MoneyDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
