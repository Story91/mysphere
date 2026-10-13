import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAskForShare, shortAskAuthor } from '../../utils/asks/getAskForShare';
import {
  shareFundingNote,
  shareSeatsLabel,
  shareStateLine,
  shareTakesAnswers,
} from '../../utils/asks/askPublicView';
import ShareAskActions from './ShareAskActions';
// Czysty modul (bez 'use client') - komponent serwerowy moze go wolac.
import { solRailBadge } from '../../utils/asks/solAskDisplay';
import { shareAmount } from '../../utils/asks/shareAmount';

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
 *
 * ===========================================================================
 * TYLKO SPRAWDZONE ZDANIA O PIENIADZACH (plan, krok 12)
 * ===========================================================================
 * Status i escrow pochodza z widoku magazynu (getAskForShare), a zdania
 * sklada app/utils/asks/askPublicView.ts: "Settled" tylko ze stanu
 * zapieczetowanego, "locked in an escrow contract" i link do depozytu tylko
 * z warunkow escrow w pieczeci. Bez pieczeci albo bez magazynu strona mowi
 * neutralnie i nie zaprasza do odpowiedzi, ktorej trasa i tak by nie przyjela.
 */

export const revalidate = 60;

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const share = await getAskForShare(params.id);
  if (!share) return { title: 'Ask not found' };
  const { ask } = share;

  /**
   * Tytul niesie KWOTE ZA ODPOWIEDZ, a nie budzet.
   *
   * Dla czytajacego liczy sie to, ile dostanie za swoja prace - budzet jest
   * liczba autora. Ta sama zasada rzadzi karta w feedzie, gdzie `per answer`
   * jest najwiekszym drukiem w formularzu.
   */
  const money = shareAmount(ask, 'perAnswer');
  const question = ask.question.length > 90 ? `${ask.question.slice(0, 87)}…` : ask.question;

  return {
    title: `${money} for an answer: ${question}`,
    description: `A question with a budget on MySphere. ${shareAmount(ask, 'budget')} across ${ask.seats} ${ask.seats === 1 ? 'seat' : 'seats'}. Answers stay sealed until the author resolves.`,
    openGraph: {
      title: `${money} for an answer`,
      description: question,
      type: 'article',
    },
  };
}

export default async function AskPage({ params }: Props) {
  const share = await getAskForShare(params.id);
  if (!share) notFound();

  const { ask } = share;
  const now = Date.now();
  const open = shareTakesAnswers(share, now);
  const funding = shareFundingNote(share);
  /** Szyna SOL - ze stanu (publicAsk bierze token/network z pieczeci), nie z lustra. */
  const solBadge = solRailBadge(ask);

  return (
    <div className="board min-h-screen px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[600px]">
        <Link
          href="/asks"
          className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-soft-ink-muted transition-colors [transition-duration:var(--dur-press)] hover:text-soft-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
        >
          ← All asks
        </Link>

        <article className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card sm:p-6">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[12.5px] font-semibold text-soft-ink-muted">
              Ask by {shortAskAuthor(ask.author)}
            </p>
            {/* Ta sama odznaka co na wierszu i karcie w feedzie (AskRailBadge),
                tylko zlozona tutaj - AskCard.tsx jest 'use client'. */}
            {solBadge && (
              <span className="inline-flex items-center gap-1">
                <span className="rounded-md border border-soft-ask/30 bg-soft-ask-soft px-1.5 py-px text-[10.5px] font-semibold text-soft-ask-deep">
                  {solBadge.label}
                </span>
                {solBadge.devnet && (
                  <span className="rounded-md border border-soft-line-strong bg-soft-sunken px-1.5 py-px text-[10.5px] font-semibold text-soft-ink">
                    devnet
                  </span>
                )}
              </span>
            )}
          </div>

          <h1 className="font-soft-display text-[22px] font-bold leading-[1.3] text-soft-ink sm:text-[26px]">
            {ask.question}
          </h1>

          {/* Kwota za odpowiedz jest tu najwiekszym drukiem - to jedyna liczba,
              ktora dotyczy czytajacego. Bursztyn WYLACZNIE na kwotach (stawka
              i budzet); miejsca i odpowiedzi to zwykly atrament. */}
          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-soft-line pt-4">
            <div>
              <p className="font-soft-display text-[34px] font-bold leading-none tabular-nums text-soft-accent-deep">
                {shareAmount(ask, 'perAnswer')}
              </p>
              <p className="mt-1 text-[12px] text-soft-ink-soft">per answer</p>
            </div>
            <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px] text-soft-ink-muted">
              <div className="flex items-baseline gap-1.5">
                <dt>Budget</dt>
                <dd className="font-soft-display text-[15px] font-semibold tabular-nums text-soft-accent-deep">
                  {shareAmount(ask, 'budget')}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt>Seats</dt>
                {/* "2 of 3" tylko, gdy zajete miejsca znamy (rekordy przyjec albo
                    Ask sprzed pieczeci); inaczej sama liczba miejsc. */}
                <dd className="font-soft-display text-[15px] font-semibold tabular-nums text-soft-ink">
                  {shareSeatsLabel(share)}
                </dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt>Answers</dt>
                <dd className="font-soft-display text-[15px] font-semibold tabular-nums text-soft-ink">
                  {ask.answerCount}
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-4 text-[13px] leading-[1.55] text-soft-ink-muted">
            {shareStateLine(share, now)}{' '}
            {funding.kind === 'escrow' ? (
              <>
                The budget is locked in an escrow contract on Base, out of the author&apos;s reach.
                {funding.href ? (
                  <>
                    {' '}
                    <a
                      href={funding.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-soft-ink underline underline-offset-2"
                    >
                      {funding.linkLabel}
                    </a>
                    .
                  </>
                ) : null}
              </>
            ) : funding.kind === 'escrow-unverified' ? (
              // Dokument mowi 'escrowed', ale pieczeci nie ma - hash z dokumentu
              // mogla wpisac przegladarka, wiec go nie linkujemy.
              <>The author says the budget is locked in escrow on Base. That deposit has not been verified yet.</>
            ) : solBadge ? (
              <>
                Paid on accept in SOL. Nothing is locked: the author pays each accepted answer from
                their Solana wallet{solBadge.devnet ? ' on devnet' : ''}.
              </>
            ) : (
              <>Nothing is locked: the author pays out of their own wallet on resolve.</>
            )}
          </p>

          {/* Odpowiadanie wymaga portfela i podpisu, wiec mieszka na /asks.
              Ta strona nie dubluje tamtego panelu - prowadzi do niego. Jedna
              wypelniona akcja; udostepnianie stoi obok jako obwodka. */}
          <ShareAskActions askId={ask.id} perAnswer={shareAmount(ask, 'perAnswer')}>
            {open && (
              <Link
                href="/asks"
                className="inline-flex items-center justify-center rounded-pill bg-soft-primary px-4 py-2 font-soft-display text-[13px] font-semibold text-soft-on-primary transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
              >
                Answer this ask
              </Link>
            )}
          </ShareAskActions>
        </article>

        <p className="mt-4 px-1 text-[12px] leading-[1.5] text-soft-ink-soft">
          Answers stay sealed until the author resolves. Only the number of answers is public.
        </p>
      </div>
    </div>
  );
}
