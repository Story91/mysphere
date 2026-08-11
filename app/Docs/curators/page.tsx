import type { Metadata } from 'next';
import DocsShell from '../_components/DocsShell';
import DocArticle from '../_components/DocArticle';
import content from '../_content/curators.md';

export const metadata: Metadata = {
  title: 'Curator record',
  description: 'A dated, public record that reads listed Morpho vaults on Base once a day and keeps only fee, curator, and listing changes — honest about what it does and doesn\'t track.',
};

export default function CuratorsDocPage() {
  return (
    <DocsShell>
      <DocArticle content={content} />
    </DocsShell>
  );
}
