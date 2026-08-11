import type { Metadata } from 'next';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/money.md';

export const metadata: Metadata = {
  title: 'Money & Paid',
  description: 'How MySphere\'s Money tab reconstructs what your wallet earned, spent, and has waiting from your address, and how the public Paid tab shows settled payments onchain.',
};

export default function MoneyDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
