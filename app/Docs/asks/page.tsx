import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/asks.md';

export const metadata: Metadata = pageMeta({
  title: 'Asks & escrow',
  description: 'How MySphere Asks work: a question with a budget, seats and a deadline, with sealed answers and two funding modes: an owner-less escrow contract on Base or pay-on-resolve from your wallet.',
  image: '/Docs/opengraph-image.png',
});

export default function AsksDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
