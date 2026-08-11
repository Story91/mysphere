import type { Metadata } from 'next';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/startpad.md';

export const metadata: Metadata = {
  title: 'Startpad launchpad',
  description: 'How the Startpad bonding-curve launchpad mints, prices, and graduates B20 tokens — the curve math, the fees, and where it runs today.',
};

export default function StartpadDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
