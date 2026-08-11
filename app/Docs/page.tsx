import type { Metadata } from 'next';
import Link from 'next/link';
import DocsShell from './_components/DocsShell';
import { DOC_PAGES, docHref } from './nav';

/**
 * /Docs - strona glowna dokumentacji. Zastapila stara ciemna wersje z 2024
 * (bg-black, karty "Coming Soon"); teraz to hub w systemie Soft, z ktorego
 * wchodzi sie na strone kazdego modulu. Whitepaper zostaje jako osobna pozycja.
 */
export const metadata: Metadata = {
  title: 'Docs',
  description:
    'How MySphere works: the feed, Asks and escrow, your money, the curator record, the Startpad launchpad and B20 tokens — in plain terms, with the math and how to verify each part onchain.',
};

export default function DocsOverviewPage() {
  const cards = DOC_PAGES.filter((page) => page.slug !== '');

  return (
    <DocsShell>
      <header className="mb-9">
        <p className="mb-3 font-soft text-[11px] font-bold uppercase tracking-[0.18em] text-soft-ink-faint">
          Documentation
        </p>
        <h1 className="mb-4 font-soft-display text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-soft-ink sm:text-[40px]">
          Everything MySphere does,
          <br className="hidden sm:block" /> and how to check it.
        </h1>
        <p className="max-w-[60ch] text-[15.5px] leading-[1.7] text-soft-ink-muted">
          MySphere is a social feed on Base where the timeline is money. Post and get tipped, ask a
          question with a budget and pay for the answers you pick, launch a token on a bonding
          curve — and open the transaction behind every number. These pages explain each part in
          plain terms, show the flow, give the math where it matters, and point you at the onchain
          proof.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((page) => (
          <Link
            key={page.slug}
            href={docHref(page.slug)}
            className="group rounded-card border border-soft-line bg-soft-surface p-4 shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-bg"
          >
            <h2 className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink group-hover:text-soft-primary-deep">
              {page.title}
            </h2>
            <p className="text-[13px] leading-[1.5] text-soft-ink-muted">{page.blurb}</p>
          </Link>
        ))}

        <a
          href="/mysphere-whitepaper-english.html"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-card border border-soft-line bg-soft-sunken/60 p-4 shadow-card transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:-translate-y-0.5"
        >
          <h2 className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink group-hover:text-soft-primary-deep">
            Whitepaper ↗
          </h2>
          <p className="text-[13px] leading-[1.5] text-soft-ink-muted">
            The long-form vision, tokenomics and roadmap.
          </p>
        </a>
      </div>
    </DocsShell>
  );
}
