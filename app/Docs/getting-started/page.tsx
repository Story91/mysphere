import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/getting-started.md';

export const metadata: Metadata = pageMeta({
  title: 'Getting started',
  description: 'How to connect a wallet in MySphere, which networks power posting, Asks, Money, and the Startpad launchpad, and which modules are live versus switched off.',
  image: '/Docs/opengraph-image',
});

export default function GettingStartedDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
