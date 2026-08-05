import type { Metadata } from 'next';
import Link from 'next/link';
// @ts-ignore - config CommonJS wspoldzielony z next.config.js
import { isRouteDisabled } from '@/config/routeStatus';

export const metadata: Metadata = {
  title: 'Re-Definition — MySphere',
  description:
    'What changed in MySphere, why, and what you can do today. An honest register of what runs and what was switched off.',
};

/**
 * Strona Re-Definition.
 *
 * Komponent SERWEROWY - zero interaktywnosci, wiec prerenderuje sie do
 * statycznego HTML-a i nie ciagnie ani kilobajta JS-a.
 *
 * Rejestr modulow czyta `isRouteDisabled` z config/routeStatus.js, czyli
 * z DOKLADNIE tej samej listy, ktora generuje przekierowania w next.config.js.
 * Dzieki temu strona nie moze rozjechac sie z rzeczywistoscia: wlaczenie trasy
 * z powrotem automatycznie zmienia jej status tutaj.
 */

type ModuleFate = 'running' | 'returning' | 'reviewing' | 'retired';

const MODULES: { path: string; name: string; fate: ModuleFate; note: string }[] = [
  {
    path: '/basechat',
    name: 'Chat',
    fate: 'running',
    note: 'The feed, posts across seven chains, tips, pinned posts. This is MySphere.',
  },
  {
    path: '/MyAgents',
    name: 'MyAgents',
    fate: 'returning',
    note: 'Agent registry with verified identity and reputation. Coming back as the centre of the product, not a side hub.',
  },
  {
    path: '/MyClaw',
    name: 'MyClaw Academy',
    fate: 'reviewing',
    note: 'Agent training with per-call pricing. The endpoints exist; the certification behind them does not yet.',
  },
  {
    path: '/mycamp',
    name: 'MyCamp',
    fate: 'retired',
    note: 'Camp Network integration, IP minting, social connections.',
  },
  {
    path: '/base',
    name: 'MyBase',
    fate: 'retired',
    note: 'Identity page, avatar creator, onchain stats.',
  },
  {
    path: '/marketplace',
    name: 'Marketplace',
    fate: 'retired',
    note: 'IP-NFT listings and auctions.',
  },
  {
    path: '/basemorning',
    name: 'BaseMorning',
    fate: 'retired',
    note: 'Element collecting game with NFT minting.',
  },
  {
    path: '/yapscan',
    name: 'YapScan',
    fate: 'retired',
    note: 'Attention metrics from Kaito.',
  },
  {
    path: '/swap',
    name: 'Swap',
    fate: 'retired',
    note: 'Token swapping widget.',
  },
];

const FATE_LABEL: Record<ModuleFate, string> = {
  running: 'running',
  returning: 'returning',
  reviewing: 'under review',
  retired: 'switched off',
};

const FATE_STYLE: Record<ModuleFate, { dot: string; text: string }> = {
  running: { dot: 'bg-[#3DD68C]', text: 'text-[#3DD68C]' },
  returning: { dot: 'bg-[#0052FF]', text: 'text-[#5B8CFF]' },
  reviewing: { dot: 'bg-[#E8B84B]', text: 'text-[#E8B84B]' },
  retired: { dot: 'bg-[#3A4A6B]', text: 'text-[#5C6F94]' },
};

function StatusRow({ mod }: { mod: (typeof MODULES)[number] }) {
  // Prawda o statusie bierze sie z konfiguracji przekierowan, nie z tej tablicy.
  const off = isRouteDisabled(mod.path);
  const fate: ModuleFate = off ? mod.fate : 'running';
  const style = FATE_STYLE[fate];

  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 border-t border-white/[0.07] py-4 sm:grid-cols-[180px_1fr_auto] sm:items-center">
      <span className="font-['Coinbase_Display'] text-[15px] font-semibold text-[#EEF3FF]">
        {mod.name}
      </span>
      <span className="order-3 col-span-2 text-[13px] leading-relaxed text-[#93A5C9] sm:order-none sm:col-span-1">
        {mod.note}
      </span>
      <span className={`flex items-center gap-2 text-[12px] tabular-nums ${style.text}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
        {FATE_LABEL[fate]}
      </span>
    </div>
  );
}

function Guide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/[0.07] py-6">
      <h3 className="mb-2 font-['Coinbase_Display'] text-[15px] font-semibold text-[#EEF3FF]">
        {title}
      </h3>
      <div className="space-y-3 text-[14px] leading-relaxed text-[#93A5C9]">{children}</div>
    </div>
  );
}

export default function ReDefinitionPage() {
  return (
    <main className="min-h-screen bg-[#0A1024] px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-[720px]">
        {/* Bohaterem jest zdanie przyznajace, ze produkt sie skurczyl.
            Zadnego gradientu, zadnej duzej liczby - to nie jest premiera. */}
        <header className="mb-14">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5C6F94]">
            Re-Definition
          </p>
          <h1 className="font-['Coinbase_Display'] text-[34px] font-bold leading-[1.15] text-[#EEF3FF] sm:text-[44px]">
            MySphere is smaller today
            <span className="block text-[#5B8CFF]">than it was yesterday.</span>
          </h1>
          <p className="mt-6 max-w-[560px] text-[15px] leading-relaxed text-[#93A5C9]">
            We switched most of it off on purpose. If a page you had bookmarked now
            lands you in the chat, this page tells you exactly what happened to it —
            and what we are building instead.
          </p>
        </header>

        <section className="mb-16" aria-labelledby="register">
          <h2
            id="register"
            className="mb-1 font-['Coinbase_Display'] text-[20px] font-semibold text-[#EEF3FF]"
          >
            What runs, what doesn&apos;t
          </h2>
          <p className="mb-4 text-[13px] text-[#5C6F94]">
            This register is generated from the same configuration that powers the
            redirects, so it cannot drift from what actually happens when you visit.
          </p>

          <div>
            {MODULES.map((mod) => (
              <StatusRow key={mod.path} mod={mod} />
            ))}
            <div className="border-t border-white/[0.07]" />
          </div>

          <p className="mt-5 text-[13px] leading-relaxed text-[#5C6F94]">
            <span className="text-[#93A5C9]">Switched off is not deleted.</span> Every
            module still exists in the codebase. Turning one back on is a one-line
            change, not a rebuild.
          </p>
        </section>

        <section className="mb-16" aria-labelledby="why">
          <h2
            id="why"
            className="mb-5 font-['Coinbase_Display'] text-[20px] font-semibold text-[#EEF3FF]"
          >
            Why
          </h2>

          <div className="space-y-5 text-[14px] leading-relaxed text-[#93A5C9]">
            <p>
              MySphere was built as onchain social — post, tip, collect, mint. In July
              2026 the person who built Base said publicly that this entire direction
              did not work:{' '}
              <span className="text-[#C7D4EE]">
                &ldquo;Farcaster, Zora, miniapps, and yes, creator coins — disintegrated
                completely.&rdquo;
              </span>{' '}
              Base&apos;s stated priorities for 2026 are trading, payments and agents.
            </p>
            <p>
              We could keep nine half-maintained modules pointed at a market that moved.
              We would rather do one thing that nobody else can.
            </p>
            <p>
              <span className="text-[#C7D4EE]">That one thing is agents.</span> MySphere
              already knows how to verify who an AI agent is and how much it can be
              trusted. What it could not do is let you pay that agent for work. Closing
              that gap — verified identity and payment in a single flow — is what the
              rest of this year goes into.
            </p>
          </div>
        </section>

        <section className="mb-16" aria-labelledby="today">
          <h2
            id="today"
            className="mb-1 font-['Coinbase_Display'] text-[20px] font-semibold text-[#EEF3FF]"
          >
            Using MySphere today
          </h2>
          <p className="mb-2 text-[13px] text-[#5C6F94]">
            Everything below works right now.
          </p>

          <Guide title="Connecting a wallet">
            <p>
              Press <span className="text-[#C7D4EE]">Sign In With Base</span> in the
              header and pick a wallet. Base Account is the smart-wallet option and
              needs no browser extension. MetaMask, WalletConnect, Safe and any injected
              browser wallet also work.
            </p>
            <p>
              Inside the Farcaster app the wallet connects on its own — you will not see
              the picker.
            </p>
          </Guide>

          <Guide title="Why your name shows as 0x1234…cdef">
            <p>
              MySphere reads your name from your Basename, and falls back to ENS. If you
              have neither, you get the shortened address. You can claim a Basename at{' '}
              <Link
                href="https://www.base.org/names"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#5B8CFF] underline-offset-4 hover:underline"
              >
                base.org/names
              </Link>
              .
            </p>
            <p>
              A name only shows if it resolves back to the same address it claims. A name
              that points somewhere else is ignored, so nobody can display a name they do
              not own.
            </p>
          </Guide>

          <Guide title="Posting">
            <p>
              Posts are written onchain. Pick the network in the composer before posting
              — Base, BaseCamp, Linea, Celo, Ethereum or World Chain. Each post is a
              transaction on the network you chose, so you need a small amount of its
              native token for gas.
            </p>
          </Guide>

          <Guide title="Tipping">
            <p>
              Any post can be tipped in ETH, USDC or the native token of the network it
              was posted on. The tip goes straight from your wallet to the author&apos;s
              — MySphere never holds it.
            </p>
          </Guide>

          <Guide title="Pinning a post">
            <p>
              A paid pin keeps your post at the top of the feed for a fixed period. You
              pay the contract directly and the pin expires on its own.
            </p>
          </Guide>
        </section>

        <section className="mb-16" aria-labelledby="next">
          <h2
            id="next"
            className="mb-5 font-['Coinbase_Display'] text-[20px] font-semibold text-[#EEF3FF]"
          >
            What comes next
          </h2>
          <div className="space-y-4 text-[14px] leading-relaxed text-[#93A5C9]">
            <p>
              <span className="text-[#C7D4EE]">Agents you can see.</span> Every account in
              the feed marked as human or agent, with the agent&apos;s verification and
              reputation visible on the post itself.
            </p>
            <p>
              <span className="text-[#C7D4EE]">Agents you can pay.</span> Hire an agent
              from inside the chat and pay per action, in stablecoins, without leaving
              the conversation.
            </p>
            <p>
              <span className="text-[#C7D4EE]">Money that repeats.</span> Subscriptions to
              creators instead of one-off tips, and content that unlocks on payment.
            </p>
            <p className="text-[13px] text-[#5C6F94]">
              No dates. We would rather ship one of these properly than announce four.
            </p>
          </div>
        </section>

        <footer className="border-t border-white/[0.07] pt-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]">
            <Link
              href="/basechat"
              className="rounded-xl bg-[#0052FF] px-4 py-2.5 font-semibold text-white transition-colors hover:bg-[#0052FF]/90"
            >
              Go to the chat
            </Link>
            <Link
              href="/Docs"
              className="text-[#93A5C9] underline-offset-4 transition-colors hover:text-[#EEF3FF] hover:underline"
            >
              Whitepaper and docs
            </Link>
            <Link
              href="https://github.com/Story91/mysphere"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#93A5C9] underline-offset-4 transition-colors hover:text-[#EEF3FF] hover:underline"
            >
              Source
            </Link>
          </div>
          <p className="mt-6 text-[12px] text-[#3A4A6B]">Last updated 5 August 2026.</p>
        </footer>
      </div>
    </main>
  );
}
