'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  AskFundingNote,
  AskRailBadge,
  ResolveRateBadge,
  formatAskAmount,
  formatAgo,
  formatCountdown,
  useNow,
  viewOf,
} from '../basechat/components/AskCard';
import { getSlicedAddress } from '../utils/identity/resolver';
import { type Ask, type ResolveRate } from '../utils/asks/types';

/**
 * Wiersz tablicy Askow: jedna linia = jedna oferta pracy.
 *
 * Wiersz zastepuje wielka karte (AskCard) NA /asks. Karta zostaje w feedzie -
 * tam stoi obok postow i ma inna robote. Tutaj lista ma sie dac przeczytac
 * jednym rzutem oka: kwota za odpowiedz po lewej (to jedyna liczba, ktora
 * dotyczy czytajacego), pytanie, a pod nim zywy stan - czas, miejsca, odpowiedzi.
 *
 * Zdania o pieniadzach NIE sa tu przepisane: stoja w `AskFundingNote`
 * (AskCard.tsx), wspolnym z kartą feedu, i pokazuja sie dopiero po rozwinieciu.
 * Na wierszu zostaje tylko znacznik "Escrow", i to wylacznie gdy `funding` to
 * 'escrowed' - te same zasady co na karcie.
 */

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Ile segmentow rysujemy w mierniku miejsc; powyzej - cienki pasek. */
const MAX_SEGMENTS = 10;

function SeatsMeter({ taken, seats }: { taken: number; seats: number }) {
  const filled = Math.max(0, Math.min(taken, seats));
  if (seats > MAX_SEGMENTS) {
    return (
      <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-soft-sunken" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-soft-ask"
          style={{ width: `${(filled / seats) * 100}%` }}
        />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: seats }, (_, index) => (
        <span
          key={index}
          className={`h-1.5 w-3 rounded-[2px] ${index < filled ? 'bg-soft-ask' : 'bg-soft-line-strong/70'}`}
        />
      ))}
    </span>
  );
}

export type AskRowProps = {
  ask: Ask;
  resolveRate?: ResolveRate | null;
  isAuthor?: boolean;
  expanded: boolean;
  onToggle: () => void;
  /** Panel pod wierszem (odpowiedzi, platnosci). Montowany tylko po rozwinieciu. */
  children?: ReactNode;
};

export default function AskRow({
  ask,
  resolveRate,
  isAuthor = false,
  expanded,
  onToggle,
  children,
}: AskRowProps) {
  const panelId = useId();
  // Zawartosc zostaje zamontowana na czas zwijania, zeby wysokosc nie
  // zapadala sie pod pustym polem. Montaz startuje od razu przy rozwinieciu.
  const [mounted, setMounted] = useState(expanded);
  useEffect(() => {
    if (expanded) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timer);
  }, [expanded]);
  const now = useNow(ask.deadline, ask.status === 'open');
  const reference = now ?? Date.now();
  const view = viewOf(ask, reference);
  const left = ask.deadline - reference;

  const author = ask.author ? getSlicedAddress(ask.author) : 'unknown address';

  // Stan w jednym slowie. Dla otwartego - zegar (jedyna rzecz, ktora sie rusza).
  const timing =
    view === 'open'
      ? `${formatCountdown(left)} left`
      : view === 'expired'
        ? `Closed ${formatAgo(reference - ask.deadline)}`
        : ask.resolvedAt
          ? `Settled ${formatAgo(reference - ask.resolvedAt)}`
          : 'Settled';

  const answers =
    ask.answerCount === 0
      ? view === 'open'
        ? 'No answers yet'
        : 'No answers'
      : plural(ask.answerCount, 'answer');

  const action = isAuthor
    ? view === 'resolved'
      ? 'Answers'
      : 'Review'
    : view === 'open'
      ? 'Answer'
      : view === 'resolved'
        ? 'Answers'
        : 'Closed';

  // Pasek czasu pod wierszem: ile z okna zostalo. Tylko dla otwartego Aska.
  const span = ask.deadline - ask.createdAt;
  const remaining =
    view === 'open' && now !== null && span > 0 ? Math.max(0, Math.min(1, left / span)) : null;

  const dot =
    view === 'open'
      ? 'bg-soft-ask motion-safe:animate-pulse'
      : view === 'resolved'
        ? 'bg-soft-ask'
        : 'bg-soft-line-strong';

  return (
    <article
      className={`overflow-hidden rounded-card border bg-soft-surface shadow-card transition-[border-color,box-shadow] [transition-duration:var(--dur-dropdown)] ease-out-strong ${
        expanded ? 'border-soft-line-strong shadow-chip' : 'border-soft-line hover:border-soft-line-strong'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="relative block w-full px-4 py-3.5 text-left transition-colors [transition-duration:var(--dur-press)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-soft-primary sm:px-5"
      >
        <span className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2.5 sm:grid-cols-[104px_minmax(0,1fr)_auto]">
          {/* Kwota za odpowiedz: najwiekszy druk, bo tylko ona dotyczy czytajacego. */}
          <span className="col-start-1 row-start-1 flex items-baseline gap-2 sm:block">
            <span className="block break-words font-soft-display text-[21px] font-bold leading-[1.1] tabular-nums text-soft-accent-deep sm:text-[24px]">
              {formatAskAmount(ask, 'perAnswer')}
            </span>
            <span className="block text-[11px] leading-none text-soft-ink-soft sm:mt-0.5">per answer</span>
          </span>

          <span className="col-span-2 row-start-2 block min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
            <span
              className={`break-words font-soft-display text-[15px] font-semibold leading-[1.35] text-soft-ink ${
                // `block` odpada przy przycinaniu: line-clamp ustawia
                // display: -webkit-box, a w arkuszu Tailwinda `block` stoi pozniej.
                expanded ? 'block' : 'line-clamp-2'
              }`}
            >
              {ask.question}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-soft-ink-muted">
              <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums" suppressHydrationWarning>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                {timing}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <SeatsMeter taken={ask.acceptedCount} seats={ask.seats} />
                <span className="tabular-nums">
                  {ask.acceptedCount}/{ask.seats}
                </span>
              </span>
              <span>{answers}</span>
              <AskRailBadge ask={ask} />
              {ask.funding === 'escrowed' && (
                <span className="rounded-md border border-soft-ask/30 bg-soft-ask-soft px-1.5 py-px text-[10.5px] font-semibold text-soft-ask-deep">
                  Escrow
                </span>
              )}
            </span>
          </span>

          <span
            className={`col-start-2 row-start-1 inline-flex shrink-0 items-center gap-1 self-start rounded-pill sm:col-start-3 px-3 py-1.5 font-soft-display text-[12px] font-semibold transition-colors [transition-duration:var(--dur-press)] ${
              action === 'Closed'
                ? 'bg-soft-sunken text-soft-ink-muted'
                : expanded
                  ? 'bg-soft-sunken text-soft-ink'
                  : 'bg-soft-primary text-soft-on-primary'
            }`}
          >
            {action}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform [transition-duration:var(--dur-sheet)] ease-drawer ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </span>
        </span>

        {remaining !== null && (
          <span
            className="absolute inset-x-0 bottom-0 block h-[2px] bg-soft-line/70"
            role="presentation"
          >
            <span
              className="block h-full origin-left bg-soft-ask"
              style={{ width: `${remaining * 100}%` }}
            />
          </span>
        )}
      </button>

      <div id={panelId} className="board-expand" data-open={expanded} role="region" aria-label="Ask details">
        <div>
          {mounted && (
            <div className="border-t border-soft-line px-4 pb-4 pt-3.5 sm:px-5">
              <dl className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-soft-ink-soft">Budget</dt>
                  <dd className="font-soft-display text-[14px] font-semibold tabular-nums text-soft-accent-deep">
                    {formatAskAmount(ask, 'budget')}
                  </dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-soft-ink-soft">By</dt>
                  <dd className="font-semibold text-soft-ink">{author}</dd>
                </div>
                <ResolveRateBadge rate={resolveRate} />
              </dl>
              <AskFundingNote ask={ask} view={view} className="mb-4" />
              {children}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
