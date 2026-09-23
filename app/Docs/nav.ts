/**
 * Jedno zrodlo prawdy o stronach dokumentacji: sidebar (DocsSidebar), pasek
 * mobilny (DocsTopNav) i siatka kart na /Docs czytaja te sama liste. Dodanie
 * strony = jeden wpis tutaj + plik tresci w _content + trasa _/<slug>/page.tsx.
 */
export type DocPage = {
  /** '' oznacza stronę główną /Docs. */
  slug: string;
  title: string;
  blurb: string;
  group: 'Start here' | 'Modules' | 'Trust';
};

export const DOC_GROUPS: DocPage['group'][] = ['Start here', 'Modules', 'Trust'];

export const DOC_PAGES: DocPage[] = [
  { slug: '', title: 'Overview', blurb: 'What MySphere is and how the pieces fit together.', group: 'Start here' },
  {
    slug: 'getting-started',
    title: 'Getting started',
    blurb: 'Connect a wallet, pick a network, and do your first onchain action.',
    group: 'Start here',
  },
  {
    slug: 'feed',
    title: 'Feed, posts & tips',
    blurb: 'Post on nine networks, tip the author, and sell part of a post.',
    group: 'Modules',
  },
  {
    slug: 'solana',
    title: 'Solana: bags, tips & replies',
    blurb: 'Posting on Solana, Proof of Bags, and tips and paid replies in SOL from a link.',
    group: 'Modules',
  },
  {
    slug: 'asks',
    title: 'Asks & escrow',
    blurb: 'A question with a budget, sealed answers, and an onchain payout.',
    group: 'Modules',
  },
  {
    slug: 'money',
    title: 'Money & Paid',
    blurb: 'Your own ledger, and the public timeline of settled payments.',
    group: 'Modules',
  },
  {
    slug: 'curators',
    title: 'Curator record',
    blurb: 'A dated log of Morpho vault fee and curator changes on Base.',
    group: 'Modules',
  },
  {
    slug: 'startpad',
    title: 'Startpad launchpad',
    blurb: 'The bonding curve, graduation, fees, and the math behind them.',
    group: 'Modules',
  },
  {
    slug: 'b20',
    title: 'B20 tokens',
    blurb: 'The B20 standard, the token market on /b20, and creating your own.',
    group: 'Modules',
  },
  {
    slug: 'verify',
    title: 'Verify it onchain',
    blurb: 'How to check every claim yourself, with hashes and explorers.',
    group: 'Trust',
  },
];

export const docHref = (slug: string): string => (slug === '' ? '/Docs' : `/Docs/${slug}`);
