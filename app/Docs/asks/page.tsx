import type { Metadata } from 'next';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/asks.md';

export const metadata: Metadata = {
  title: 'Asks & escrow',
  description: 'How MySphere Asks work: a question with a budget, seats and a deadline, with sealed answers and two funding modes: an owner-less escrow contract on Base or pay-on-resolve from your wallet.',
};

export default function AsksDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
