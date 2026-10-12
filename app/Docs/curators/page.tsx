import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/curators.md';

export const metadata: Metadata = pageMeta({
  title: 'Curator record',
  description: 'A dated, public record that reads listed Morpho vaults on Base once a day and keeps only fee, curator, and listing changes. It says plainly what it does and does not track.',
  image: '/Docs/opengraph-image',
});

export default function CuratorsDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
