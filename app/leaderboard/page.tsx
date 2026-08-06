import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getLeaderboard,
  getSettledPayments,
  formatReceived,
  formatAmount,
} from '../utils/tips/getLeaderboard';
import { getName } from '../utils/identity/getName';
import { shortAddress } from '../utils/posts/getPostForShare';

/**
 * Paid - dwie rzeczy na jednym ekranie, celowo obok siebie.
 *
 * 1. OS CZASU ROZLICZONYCH PLATNOSCI. To jest kanal, ktorego nie ma zaden inny
 *    produkt spolecznosciowy: publiczna, przegladalna lista przelewow miedzy
 *    ludzmi, gdzie kazda pozycja niesie hash transakcji i kazdy moze ja
 *    sprawdzic u zrodla. Feed postow ma dzis kazdy. Feed PIENIEDZY miedzy
 *    obcymi ludzmi, z dowodem przy kazdej pozycji, nie ma nikt.
 *
 * 2. RANKING. Suma zamiast strumienia - kto uzbieral najwiecej w oknie.
 *
 * Roznica miedzy nimi jest calym sensem tego podzialu: strumien odpowiada na
 * pytanie "czy tu w ogole cos zyje", ranking na "komu ufac". Pierwsze przyciaga,
 * drugie zatrzymuje.
 *
 * Kierunek wizualny: Soft Social (projekt wlasciciela, wariant 1b).
 * Komponent SERWEROWY, rewalidacja co godzine.
 */

export const runtime = 'nodejs';
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Paid — money moving on MySphere',
  description:
    'A public timeline of settled payments between people. Every line carries a transaction anyone can verify. No points, no activity score.',
  openGraph: {
    title: 'Paid — the only feed where the timeline is money',
    description: 'Settled payments between people, each one verifiable onchain.',
    type: 'website',
  },
  alternates: { canonical: 'https://mysphere.fun/leaderboard' },
};

const MEDALS = ['#F5A73B', '#B9B1D8', '#C98B5A'];

/** Krotki, ludzki zapis wieku wpisu. Bez bibliotek - to jeden format. */
function timeAgo(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const EXPLORERS: Record<string, string> = {
  base: 'https://basescan.org/tx/',
  linea: 'https://lineascan.build/tx/',
  celo: 'https://celoscan.io/tx/',
  ethereum: 'https://etherscan.io/tx/',
  worldchain: 'https://worldscan.org/tx/',
  robinhood: 'https://robinhoodchain.blockscout.com/tx/',
  basecamp: 'https://camp.cloud.blockscout.com/tx/',
};

export default async function PaidPage() {
  const [board, payments] = await Promise.all([getLeaderboard(20), getSettledPayments(24)]);

  // Nazwy rozwiazujemy raz, dla wszystkich adresow z obu sekcji naraz -
  // ten sam adres pojawia sie zwykle i w rankingu, i w strumieniu.
  const addresses = Array.from(
    new Set([
      ...board.entries.map((e) => e.address),
      ...payments.flatMap((p) => [p.from, p.to]),
    ].filter(Boolean).map((a) => a.toLowerCase()))
  );

  const nameEntries = await Promise.all(
    addresses.map(async (address) => {
      const name = await getName({ address: address as `0x${string}` }).catch(() => null);
      return [address, name || shortAddress(address)] as const;
    })
  );
  const names = new Map(nameEntries);
  const nameOf = (address: string) => names.get(address?.toLowerCase()) ?? shortAddress(address);

  const totalLine = formatReceived(board.totalReceived, 3);

  return (
    <main className="min-h-screen bg-soft-bg px-4 py-10 font-soft sm:px-6">
      <div className="mx-auto max-w-[640px]">
        <header className="mb-8">
          <p className="mb-3 font-soft text-[11px] font-bold uppercase tracking-[0.16em] text-soft-primary-deep">
            {board.windowDays === null ? 'All time' : `Last ${board.windowDays} days`}
          </p>
          <h1 className="mb-3 font-soft-display text-[34px] font-bold leading-[1.1] text-soft-ink sm:text-[42px]">
            Money moving
          </h1>
          <p className="max-w-[46ch] font-soft text-[14.5px] leading-[1.6] text-soft-ink-muted">
            Every line below is a settled payment between two people, with a transaction anyone can
            open and check. There are no points here and no way onto this page that does not involve
            money actually moving.
          </p>

          {board.totalTips > 0 && (
            <div className="mt-6 inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card bg-soft-surface px-4 py-3 shadow-card">
              <span className="font-soft-display text-[20px] font-bold tabular-nums text-soft-accent-deep">
                {totalLine}
              </span>
              <span className="font-soft text-[13px] text-soft-ink-soft">
                across {board.totalTips} {board.totalTips === 1 ? 'payment' : 'payments'}
              </span>
            </div>
          )}
        </header>

        {/* ---------------- OS CZASU ---------------- */}
        <section className="mb-10">
          <h2 className="mb-3 font-soft-display text-[16px] font-bold text-soft-ink">
            As it lands
          </h2>

          {payments.length === 0 ? (
            <p className="rounded-card bg-soft-surface p-6 text-center font-soft text-[13.5px] text-soft-ink-soft shadow-card">
              Nothing has settled yet. The first payment starts this list.
            </p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {payments.map((payment) => (
                <li
                  key={payment.txHash}
                  className="flex items-center gap-3 rounded-card bg-soft-surface p-3.5 shadow-card"
                >
                  {/* Kwota jest pierwsza i najmocniejsza - to jedyny powod,
                      dla ktorego ktokolwiek patrzy na te liste. */}
                  <span className="flex-none rounded-pill bg-soft-accent-soft px-3 py-1.5 font-soft-display text-[14px] font-bold tabular-nums text-soft-accent-deep">
                    {formatAmount(payment.amount)} {payment.token}
                  </span>

                  <span className="min-w-0 flex-1 font-soft text-[13px] leading-tight">
                    <Link
                      href={`/u/${payment.from}`}
                      className="font-semibold text-soft-ink hover:text-soft-primary-deep"
                    >
                      {nameOf(payment.from)}
                    </Link>
                    <span className="mx-1.5 text-soft-ink-faint" aria-label="paid">
                      →
                    </span>
                    <Link
                      href={`/u/${payment.to}`}
                      className="font-semibold text-soft-ink hover:text-soft-primary-deep"
                    >
                      {nameOf(payment.to)}
                    </Link>
                    <span className="block text-[11.5px] text-soft-ink-faint">
                      {timeAgo(payment.timestamp)}
                    </span>
                  </span>

                  <a
                    href={`${EXPLORERS[payment.network] ?? EXPLORERS.base}${payment.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open this transaction in the explorer"
                    title="Verify onchain"
                    className="flex-none rounded-pill p-2 text-soft-line-strong transition-colors duration-[--dur-press] hover:text-soft-primary focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-3 font-soft text-[11.5px] leading-relaxed text-soft-ink-faint">
            Nothing here is self-reported. Open any transaction and check it against the chain.
          </p>
        </section>

        {/* ---------------- RANKING ---------------- */}
        <section>
          <h2 className="mb-3 font-soft-display text-[16px] font-bold text-soft-ink">
            Who got paid most
          </h2>

          {board.entries.length === 0 ? (
            <div className="rounded-card bg-soft-surface p-8 text-center shadow-card">
              <p className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink">
                Nobody has been paid yet
              </p>
              <p className="mx-auto max-w-[34ch] font-soft text-[13px] text-soft-ink-soft">
                The list fills itself as payments land. Be the first name on it.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {board.entries.map((entry, index) => (
                <li key={entry.address}>
                  <Link
                    href={`/u/${entry.address}`}
                    className="flex items-center gap-3 rounded-card bg-soft-surface p-3.5 shadow-card transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.99]"
                  >
                    <span
                      className="w-6 flex-none text-right font-soft-display text-[15px] font-bold tabular-nums"
                      style={{ color: MEDALS[index] ?? 'var(--soft-line-strong)' }}
                    >
                      {index + 1}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-soft-display text-[14.5px] font-bold text-soft-ink">
                        {nameOf(entry.address)}
                      </span>
                      <span className="font-soft text-[11.5px] text-soft-ink-faint">
                        {entry.tipCount} {entry.tipCount === 1 ? 'payment' : 'payments'} from{' '}
                        {entry.supporterCount} {entry.supporterCount === 1 ? 'person' : 'people'}
                      </span>
                    </span>

                    <span className="flex-none font-soft-display text-[14px] font-bold tabular-nums text-soft-accent-deep">
                      {formatReceived(entry.received)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-4 font-soft text-[11.5px] leading-relaxed text-soft-ink-faint">
            Amounts are summed within each token. ETH is not added to USDC — that would be a number
            nobody could check. Rank goes by the largest single-token total.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-2.5">
          <Link
            href="/basechat"
            className="rounded-pill bg-soft-primary px-5 py-3 font-soft text-[14px] font-bold text-white shadow-[0_4px_12px_rgba(124,107,218,0.3)] transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97]"
          >
            Open the feed
          </Link>
          <Link
            href="/re-definition"
            className="rounded-pill bg-soft-surface px-5 py-3 font-soft text-[14px] font-semibold text-soft-ink-muted shadow-card transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97]"
          >
            Why money, not likes
          </Link>
        </div>
      </div>
    </main>
  );
}
