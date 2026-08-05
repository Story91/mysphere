import type { Metadata } from 'next';
import Link from 'next/link';
import { getLeaderboard, formatReceived } from '../utils/tips/getLeaderboard';
import { getName } from '../utils/identity/getName';
import { shortAddress } from '../utils/posts/getPostForShare';

/**
 * Ranking zarobkow z ostatnich 7 dni.
 *
 * PO CO. Ludzie udostepniaja rankingi, w ktorych sami sa. Roznica wobec zwyklej
 * tablicy wynikow: kazda pozycja to suma ROZLICZONYCH platnosci, nie punktow za
 * aktywnosc. Punkty da sie nabic, przelewow nie - i to jest jedyny powod, dla
 * ktorego ta tabela cokolwiek znaczy.
 *
 * Komponent SERWEROWY, rewalidacja co godzine. Ranking nie musi byc swiezy co do
 * sekundy, a bez cache kazde wejscie kosztowaloby odczyt tysiaca dokumentow plus
 * dwadziescia rozwiazan Basename.
 */

export const runtime = 'nodejs';
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Who got paid this week — MySphere',
  description:
    'Every number here is a settled payment, not a score. Seven days of tips on MySphere, by recipient.',
  openGraph: {
    title: 'Who got paid this week on MySphere',
    description: 'Settled payments only. No points, no activity score.',
    type: 'website',
  },
  alternates: { canonical: 'https://mysphere.fun/leaderboard' },
};

const MEDALS = ['#F5C24C', '#C7D0E0', '#C98B5A'];

export default async function LeaderboardPage() {
  const board = await getLeaderboard(20);

  // Basename'y rozwiazujemy rownolegle - dwadziescia sekwencyjnych zapytan do
  // resolvera trwaloby kilka sekund przy kazdej rewalidacji.
  const names = await Promise.all(
    board.entries.map((entry) =>
      getName({ address: entry.address as `0x${string}` })
        .catch(() => null)
        .then((name) => name || shortAddress(entry.address))
    )
  );

  const totalLine = formatReceived(board.totalReceived, 3);

  return (
    <main className="min-h-screen bg-[#0A1024] px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-[680px]">
        <header className="mb-12">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5C6F94]">
            {/* Etykieta MUSI isc za danymi. Gdy w tygodniu nie bylo zadnego
                tipa, getLeaderboard oddaje cala historie i zeruje windowDays -
                napis "last 7 days" nad wynikiem sprzed roku bylby klamstwem. */}
            {board.windowDays === null ? 'All time' : `Last ${board.windowDays} days`}
          </p>
          <h1 className="mb-4 font-['Coinbase_Display'] text-[34px] font-bold leading-[1.1] tracking-[-0.03em] text-[#EEF3FF] sm:text-[44px]">
            Who got paid
          </h1>
          <p className="max-w-[46ch] text-[15px] leading-[1.65] text-[#9EB0D2]">
            Every number below is a settled payment, not a score. There is no way onto this
            list that does not involve money actually moving.
          </p>

          {board.totalTips > 0 && (
            <div className="mt-7 inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-[#00E28A]/20 bg-[#00E28A]/[0.05] px-4 py-3">
              <span className="font-['Coinbase_Display'] text-[18px] font-semibold tabular-nums text-[#00E28A]">
                {totalLine}
              </span>
              <span className="text-[13px] text-[#00E28A]/70">
                across {board.totalTips} {board.totalTips === 1 ? 'tip' : 'tips'}
              </span>
            </div>
          )}
        </header>

        {board.entries.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
            <p className="mb-2 font-['Coinbase_Display'] text-[16px] font-semibold text-[#EEF3FF]">
              Nobody has been paid yet
            </p>
            <p className="mx-auto max-w-[34ch] text-[14px] leading-relaxed text-[#8FA2C6]">
              The list fills itself as tips land. Be the first name on it.
            </p>
            <Link
              href="/basechat"
              className="mt-6 inline-block rounded-xl bg-[#0052FF] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[#0044D6]"
            >
              Open the feed
            </Link>
          </div>
        ) : (
          <div>
            {board.entries.map((entry, index) => (
              <Link
                key={entry.address}
                href={`/u/${entry.address}`}
                className="flex items-center gap-4 border-t border-white/[0.07] py-4 transition hover:bg-white/[0.02]"
              >
                <span
                  className="w-7 shrink-0 text-right font-['Coinbase_Display'] text-[15px] font-bold tabular-nums"
                  style={{ color: MEDALS[index] ?? '#3A4A6B' }}
                >
                  {index + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-['Coinbase_Display'] text-[15px] font-semibold text-[#EEF3FF]">
                    {names[index]}
                  </span>
                  <span className="text-[12px] text-[#5C6F94]">
                    {entry.tipCount} {entry.tipCount === 1 ? 'tip' : 'tips'} from{' '}
                    {entry.supporterCount}{' '}
                    {entry.supporterCount === 1 ? 'person' : 'people'}
                  </span>
                </span>

                <span className="shrink-0 text-right font-['Coinbase_Display'] text-[15px] font-semibold tabular-nums text-[#00E28A]">
                  {formatReceived(entry.received)}
                </span>
              </Link>
            ))}
            <div className="border-t border-white/[0.07]" />
          </div>
        )}

        <p className="mt-8 text-[12px] leading-relaxed text-[#5C6F94]">
          Amounts are summed within each token. ETH is not added to USDC — that would be a
          number nobody could check. Rank goes by the largest single-token total.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/basechat"
            className="rounded-xl bg-[#0052FF] px-5 py-3 text-[14px] font-semibold text-white transition hover:bg-[#0044D6]"
          >
            Open the feed
          </Link>
          <Link
            href="/re-definition"
            className="rounded-xl border border-white/[0.12] px-5 py-3 text-[14px] font-semibold text-[#DDE6FA] transition hover:border-white/25 hover:bg-white/[0.04]"
          >
            Why money, not likes
          </Link>
        </div>
      </div>
    </main>
  );
}
