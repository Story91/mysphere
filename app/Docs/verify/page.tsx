import type { Metadata } from 'next';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/verify.md';

export const metadata: Metadata = {
  title: 'Verify it onchain',
  description: 'How to verify every MySphere money claim yourself: which block explorer, which hash, which contract, and what is an off-chain reading instead.',
};

export default function VerifyDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
