import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAskForShare, shortAskAuthor } from '../../utils/asks/getAskForShare';
import {
  formatShareMoney,
  shareFundingNote,
  shareSeatsLabel,
  shareStateLine,
  shareTakesAnswers,
} from '../../utils/asks/askPublicView';
import ShareAskActions from './ShareAskActions';
// Czysty modul (bez 'use client') - komponent serwerowy moze go wolac.
// formatAskAmount z AskCard.tsx tu NIE wolno: patrz formatShareMoney.
import { solAskAmount, solRailBadge } from '../../utils/asks/solAskDisplay';
import type { Ask } from '../../utils/asks/types';

/**
 * Kwota na tej stronie: Ask SOL z lamportow (dokladnie to, co zapieczetowal
 * serwer), reszta przez formatShareMoney jak dotad.
 */
function shareAmount(ask: Ask, which: 'budget' | 'perAnswer'): string {
  return solAskAmount(ask, which) ?? formatShareMoney(which === 'budget' ? ask.budget : ask.perAnswer, ask.token);
}

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
    <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[640px]">
        <Link
          href="/asks"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-soft-primary-deep underline underline-offset-2"
        >
          ← All asks
        </Link>

        <article className="rounded-card border border-soft-line bg-soft-surface p-5 shadow-card sm:p-6">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-soft-display text-[11px] font-bold uppercase tracking-[0.12em] text-soft-ink-faint">
              Ask by {shortAskAuthor(ask.author)}
            </p>
            {/* Ta sama odznaka co na karcie w feedzie (AskRailBadge), tylko
                zlozona tutaj - AskCard.tsx jest 'use client'. */}
            {solBadge && (
              <span className="inline-flex items-center gap-1">
                <span className="rounded-full border border-soft-ask/30 bg-soft-ask-soft px-2 py-0.5 text-[10px] font-semibold text-soft-ask-deep">
                  {solBadge.label}
                </span>
                {solBadge.devnet && (
                  <span className="rounded-full border border-soft-line-strong bg-soft-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-soft-ink">
                    devnet
                  </span>
                )}
              </span>
            )}
          </div>

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
                {shareAmount(ask, 'perAnswer')}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
                Budget
              </dt>
              <dd className="font-soft-display text-[19px] font-bold tabular-nums text-soft-accent-deep">
                {shareAmount(ask, 'budget')}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-soft-ink-faint">
                Seats
              </dt>
              {/* "2 of 3" tylko, gdy zajete miejsca znamy (rekordy przyjec albo
                  Ask sprzed pieczeci); inaczej sama liczba miejsc. */}
              <dd className="font-soft-display text-[19px] font-bold tabular-nums text-soft-ink">
                {shareSeatsLabel(share)}
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
                      className="font-semibold text-soft-primary-deep underline underline-offset-2"
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
              Ta strona nie dubluje tamtego panelu - prowadzi do niego. */}
          {open && (
            <Link
              href="/asks"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-soft-primary px-4 py-2.5 font-soft-display text-[13.5px] font-semibold text-white transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2"
            >
              Answer this ask
            </Link>
          )}

          <ShareAskActions askId={ask.id} perAnswer={shareAmount(ask, 'perAnswer')} />
        </article>

        <p className="mt-4 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          Answers stay sealed until the author resolves. Only the number of answers is public, never
          their contents.
        </p>
      </div>
    </div>
  );
}
