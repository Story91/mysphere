import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAskForShare, shortAskAuthor } from '../../utils/asks/getAskForShare';
import { formatAskMoney } from '../../basechat/components/AskCard';
import ShareAskActions from './ShareAskActions';

/**
 * Udostepnialna strona jednego Aska.
 *
 * ===========================================================================
 * PO CO ISTNIEJE
 * ===========================================================================
 * Ask byl jedynym wlasnym obiektem tego produktu bez wlasnego adresu. Post ma
 * /post/[id], napiwek /tip/[txHash], czlowiek /u/[address]. Aska mozna bylo
 * najwyzej opisac slowami i kazac szukac na /asks.
 *
 * A Ask jest OFERTA PRACY Z TERMINEM: jego wartosc polega na tym, ze dotrze do
 * kogos, kto potrafi odpowiedziec, zanim zegar dojdzie do zera. Bez adresu nie
 * mial jak dotrzec nigdzie poza wlasny feed.
 *
 * ===========================================================================
 * SERWEROWA, I TO JEST CALY SENS
 * ===========================================================================
 * Ta strona istnieje glownie po to, zeby dobrze wygladac PO WKLEJENIU - a
 * crawler nie uruchamia JavaScriptu. Tresc renderuje sie wiec na serwerze,
 * a klienckie jest wylacznie to, co wymaga przegladarki: schowek i natywny
 * arkusz udostepniania (ShareAskActions).
 *
 * ===========================================================================
 * CZEGO TU NIE MA
 * ===========================================================================
 * ODPOWIEDZI. Ani tresci, ani formularza. Tresc odpowiedzi jest zapieczetowana
 * do rozstrzygniecia - pokazujemy sama LICZBE, tak samo jak karta w feedzie.
 * Pisanie odpowiedzi, otwieranie zapieczetowanych i rozstrzyganie mieszkaja na
 * /asks, bo wymagaja portfela i podpisu; ta strona prowadzi tam przyciskiem,
 * zamiast dublowac tamten panel.
 */

export const revalidate = 60;

type Props = { params: { id: string } };

/** Jedno zdanie o stanie - to samo slownictwo co na karcie w feedzie. */
function stateLine(status: string, deadline: number, seatsLeft: number): string {
  if (status === 'resolved') return 'Settled — the budget has been paid out.';
  if (status === 'expired') return 'Closed without a payout.';
  if (deadline <= Date.now()) return 'Past its deadline, waiting on the author.';
  return seatsLeft > 0 ? `${seatsLeft} of the seats are still open.` : 'Every seat is taken.';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ask = await getAskForShare(params.id);
  if (!ask) return { title: 'Ask not found' };

  /**
   * Tytul niesie KWOTE ZA ODPOWIEDZ, a nie budzet.
   *
   * Dla czytajacego liczy sie to, ile dostanie za swoja prace - budzet jest
   * liczba autora. Ta sama zasada rzadzi karta w feedzie, gdzie `per answer`
   * jest najwiekszym drukiem w formularzu.
   */
  const money = formatAskMoney(ask.perAnswer, ask.token);
  const question = ask.question.length > 90 ? `${ask.question.slice(0, 87)}…` : ask.question;

  return {
    title: `${money} for an answer — ${question}`,
    description: `A question with a budget on MySphere. ${formatAskMoney(
      ask.budget,
      ask.token
    )} across ${ask.seats} ${ask.seats === 1 ? 'seat' : 'seats'}. Answers stay sealed until the author resolves.`,
    openGraph: {
      title: `${money} for an answer`,
      description: question,
      type: 'article',
    },
  };
}

export default async function AskPage({ params }: Props) {
  const ask = await getAskForShare(params.id);
  if (!ask) notFound();

  const seatsLeft = Math.max(0, ask.seats - ask.acceptedCount);
  const open = ask.status === 'open' && ask.deadline > Date.now() && seatsLeft > 0;

  return (
    <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[640px]">
        <Link
          href="/asks"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-soft-primary-deep underline underline-offset-2"
        >
          ← All asks
        </Link>

        <article className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card sm:p-6">
          <p className="mb-1 font-soft-display text-[11px] font-bold uppercase tracking-[0.12em] text-soft-ink-faint">
            Ask by {shortAskAuthor(ask.author)}
          </p>

          <h1 className="font-soft-display text-[20px] font-bold leading-[1.3] text-soft-ink sm:text-[24px]">
            {ask.question}
          </h1>

          {/* Kwota za odpowiedz jest tu najwiekszym drukiem - to jedyna liczba,
              ktora dotyczy czytajacego. Bursztyn WYLACZNIE na niej i na
              budzecie, bo to kwoty; liczby miejsc i odpowiedzi nie sa. */}
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-soft-line pt-4 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
                Per answer
              </dt>
              <dd className="font-soft-display text-[19px] font-bold tabular-nums text-soft-accent-deep">
                {formatAskMoney(ask.perAnswer, ask.token)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
                Budget
              </dt>
              <dd className="font-soft-display text-[19px] font-bold tabular-nums text-soft-accent-deep">
                {formatAskMoney(ask.budget, ask.token)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
                Seats
              </dt>
              <dd className="font-soft-display text-[19px] font-bold tabular-nums text-soft-ink">
                {ask.acceptedCount} of {ask.seats}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
                Answers in
              </dt>
              <dd className="font-soft-display text-[19px] font-bold tabular-nums text-soft-ink">
                {ask.answerCount}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-[13px] leading-[1.55] text-soft-ink-muted">
            {stateLine(ask.status, ask.deadline, seatsLeft)}{' '}
            {ask.funding === 'escrowed' ? (
              <>
                The budget is locked in an escrow contract on Base, out of the author&apos;s reach.
                {ask.escrowTxHash ? (
                  <>
                    {' '}
                    <a
                      href={`https://basescan.org/tx/${ask.escrowTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-soft-primary-deep underline underline-offset-2"
                    >
                      Check the deposit
                    </a>
                    .
                  </>
                ) : null}
              </>
            ) : (
              <>Nothing is locked: the author pays out of their own wallet on resolve.</>
            )}
          </p>

          {/* Odpowiadanie wymaga portfela i podpisu, wiec mieszka na /asks.
              Ta strona nie dubluje tamtego panelu - prowadzi do niego. */}
          {open && (
            <Link
              href="/asks"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-soft-primary px-4 py-2.5 font-soft-display text-[13.5px] font-semibold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
            >
              Answer this ask
            </Link>
          )}

          <ShareAskActions askId={ask.id} perAnswer={formatAskMoney(ask.perAnswer, ask.token)} />
        </article>

        <p className="mt-4 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          Answers stay sealed until the author resolves. Only the number of answers is public — never
          their contents.
        </p>
      </div>
    </div>
  );
}
