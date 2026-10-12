import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/verify.md';

export const metadata: Metadata = pageMeta({
  title: 'Verify it onchain',
  description: 'How to verify every MySphere money claim yourself: which block explorer, which hash, which contract, and what is an off-chain reading instead.',
  image: '/Docs/opengraph-image.png',
});

export default function VerifyDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
