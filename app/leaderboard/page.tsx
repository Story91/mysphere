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
 * PAID - publiczna os czasu rozliczonych platnosci.
 *
 * === DLACZEGO TA STRONA WYGLADA JAK PARAGON ===
 * Kazdy produkt spolecznosciowy ma feed tego, co ludzie POWIEDZIELI. Zaden nie
 * ma feedu tego, co ludzie sobie ZAPLACILI. Skoro to jedyna rzecz tutaj, ktorej
 * nie ma nigdzie indziej, nie moze wygladac jak kolejna lista w kartach.
 *
 * Formy szukalem we WLASNYM swiecie tematu - i tym przedmiotem jest rolka
 * paragonowa: ciagly pas papieru, ktory przyrasta od gory, z perforacja po
 * bokach i oderwana krawedzia. Paragon to jedyny obiekt codzienny, ktorego cala
 * funkcja polega na tym, ze potwierdza przeplyw pieniedzy i da sie go komus
 * pokazac. Dokladnie to robi ta strona.
 *
 * Kwoty ida monospace'em i sa wyrownane do prawej, jak na kazdym paragonie -
 * dzieki temu rzad wielkosci widac bez czytania cyfr.
 *
 * === DWIE SEKCJE, DWA PYTANIA ===
 * Tasma odpowiada na "czy tu w ogole cos zyje". Ranking na "komu ufac".
 * Pierwsze przyciaga, drugie zatrzymuje.
 *
 * Komponent SERWEROWY, rewalidacja co godzine.
 */

export const runtime = 'nodejs';
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Paid — money moving on MySphere',
  description:
    'A public timeline of settled payments between people. Every line carries a transaction anyone can open and check. No points, no activity score.',
  openGraph: {
    title: 'Paid — the only feed where the timeline is money',
    description: 'Settled payments between people, each one verifiable onchain.',
    type: 'website',
  },
  alternates: { canonical: 'https://mysphere.fun/leaderboard' },
};

const MEDALS = ['#F5A73B', '#B9B1D8', '#C98B5A'];

const EXPLORERS: Record<string, string> = {
  base: 'https://basescan.org/tx/',
  linea: 'https://lineascan.build/tx/',
  celo: 'https://celoscan.io/tx/',
  ethereum: 'https://etherscan.io/tx/',
  worldchain: 'https://worldscan.org/tx/',
  robinhood: 'https://robinhoodchain.blockscout.com/tx/',
  basecamp: 'https://camp.cloud.blockscout.com/tx/',
};

/** Krotki, ludzki zapis wieku wpisu. Bez bibliotek - to jeden format. */
function timeAgo(ms: number): string {
  if (!ms) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function PaidPage() {
  const [board, tape] = await Promise.all([getLeaderboard(20), getSettledPayments(24)]);
  const { payments, failed: tapeFailed } = tape;

  const addresses = Array.from(
    new Set(
      [...board.entries.map((e) => e.address), ...payments.flatMap((p) => [p.from, p.to])]
        .filter(Boolean)
        .map((a) => a.toLowerCase())
    )
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
      <div className="mx-auto max-w-[620px]">
        <header className="mb-8">
          <p className="mb-3 font-soft text-[11px] font-bold uppercase tracking-[0.16em] text-soft-primary-deep">
            {board.windowDays === null ? 'All time' : `Last ${board.windowDays} days`}
          </p>
          <h1 className="mb-3 font-soft-display text-[36px] font-bold leading-[1.05] text-soft-ink sm:text-[46px]">
            Money moving
          </h1>
          <p className="max-w-[44ch] font-soft text-[14.5px] leading-[1.6] text-soft-ink-muted">
            Every line below is a payment that actually settled between two people. Open any of them
            and check it against the chain. There is no way onto this page that does not involve
            money moving.
          </p>
        </header>

        {/* ===== TASMA ===== */}
        <section className="mb-12">
          {payments.length === 0 ? (
            /* Awaria odczytu i pusta tasma wygladaly wczesniej identycznie.
               Na stronie, ktora obiecuje sprawdzalne liczby, zapewnienie
               "nic jeszcze nie wplynelo" wypowiedziane po nieudanym odczycie
               jest po prostu nieprawda - wiec mowimy, co sie naprawde stalo. */
            <div className="rounded-card bg-soft-surface p-8 text-center shadow-card">
              <p className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink">
                {tapeFailed ? 'The tape could not be loaded' : 'Nothing has settled yet'}
              </p>
              <p className="font-soft text-[13px] text-soft-ink-soft">
                {tapeFailed
                  ? 'Payments are still onchain — this page just could not read them. Try again in a moment.'
                  : 'The first payment starts this tape.'}
              </p>
            </div>
          ) : (
            <div className="shadow-card">
              <div className="receipt-tear-top" aria-hidden="true" />

              <div className="receipt-tape px-5 pb-2 pt-1">
                {/* Naglowek paragonu. Sumy stoja na gorze, bo to pierwsza rzecz,
                    ktora czyta sie na kazdym paragonie. */}
                <div className="border-b border-dashed border-soft-line py-4 text-center">
                  <p className="font-soft text-[10.5px] font-bold uppercase tracking-[0.22em] text-soft-ink-faint">
                    Settled onchain
                  </p>
                  <p className="mt-2 font-mono text-[22px] font-bold tabular-nums text-soft-accent-deep">
                    {totalLine || '—'}
                  </p>
                  <p className="mt-1 font-soft text-[12px] text-soft-ink-soft">
                    {board.totalTips} {board.totalTips === 1 ? 'payment' : 'payments'}
                  </p>
                </div>

                <ol>
                  {payments.map((payment, index) => (
                    <li
                      key={payment.txHash}
                      className={`receipt-row relative border-b border-dashed border-soft-line/70 py-3 last:border-b-0 ${
                        index === 0 ? 'receipt-fresh' : ''
                      }`}
                      style={{ animationDelay: `${Math.min(index * 45, 540)}ms` }}
                    >
                      <div className="flex items-baseline justify-between gap-3">
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
                        </span>

                        {/* Monospace i wyrownanie do prawej - jak na kazdym
                            paragonie. Rzad wielkosci widac bez czytania cyfr. */}
                        <span className="shrink-0 font-mono text-[14px] font-bold tabular-nums text-soft-accent-deep">
                          {formatAmount(payment.amount)} {payment.token}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="font-soft text-[11px] text-soft-ink-faint">
                          {timeAgo(payment.timestamp)} · {payment.network}
                        </span>
                        <a
                          href={`${EXPLORERS[payment.network] ?? EXPLORERS.base}${payment.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Verify onchain"
                          className="font-mono text-[10.5px] text-soft-ink-faint underline decoration-dotted underline-offset-2 transition-colors duration-[--dur-press] hover:text-soft-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                        >
                          {payment.txHash.slice(0, 10)}…
                        </a>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="receipt-tear-bottom" aria-hidden="true" />
            </div>
          )}

          <p className="mt-3 px-1 font-soft text-[11.5px] leading-relaxed text-soft-ink-faint">
            Nothing here is self-reported. Every hash opens the transaction in a block explorer.
          </p>
        </section>

        {/* ===== RANKING ===== */}
        <section>
          <h2 className="mb-1 font-soft-display text-[20px] font-bold text-soft-ink">
            Who got paid most
          </h2>
          <p className="mb-4 font-soft text-[13px] text-soft-ink-soft">
            The tape says whether anything is happening. This says who to trust.
          </p>

          {board.entries.length === 0 ? (
            <div className="rounded-card bg-soft-surface p-8 text-center shadow-card">
              <p className="mb-1 font-soft-display text-[15px] font-bold text-soft-ink">
                {board.failed ? 'The ranking could not be loaded' : 'Nobody has been paid yet'}
              </p>
              <p className="mx-auto max-w-[34ch] font-soft text-[13px] text-soft-ink-soft">
                {board.failed
                  ? 'This is a read error on our side, not an empty ledger.'
                  : 'Be the first name here.'}
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
                      className="flex h-7 w-7 flex-none items-center justify-center rounded-full font-soft-display text-[12px] font-bold text-white"
                      style={{ background: MEDALS[index] ?? 'var(--soft-line-strong)' }}
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

                    <span className="flex-none font-mono text-[13.5px] font-bold tabular-nums text-soft-accent-deep">
                      {formatReceived(entry.received)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}

          <p className="mt-4 font-soft text-[11.5px] leading-relaxed text-soft-ink-faint">
            Amounts are summed within each token. ETH is not added to USDC — that would be a number
            nobody could check.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-2.5">
          <Link
            href="/basechat"
            className="rounded-pill bg-soft-primary px-5 py-3 font-soft text-[14px] font-bold text-white shadow-chip transition-transform duration-[--dur-press] ease-out-strong active:scale-[0.97]"
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
