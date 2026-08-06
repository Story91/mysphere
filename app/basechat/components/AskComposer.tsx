'use client';

import { useMemo, useState } from 'react';
import {
  ASK_DURATIONS,
  MAX_SEATS,
  MIN_PER_ANSWER,
  perAnswerFor,
} from '../../utils/asks/types';
import { formatAskMoney } from './AskCard';

/**
 * Kompozytor Aska: pytanie, budzet, liczba miejsc, termin.
 *
 * === NAJWAZNIEJSZA LICZBA NIE JEST WPISYWANA ===
 * Autor wpisuje budzet i miejsca, ale dla odpowiadajacego liczy sie tylko
 * KWOTA ZA JEDNA ODPOWIEDZ - to za nia pracuje. Dlatego jest liczona na zywo
 * przez `perAnswerFor` (dzielenie W DOL do centa, zeby suma wyplat nigdy nie
 * przekroczyla budzetu) i pokazana najwiekszym drukiem w calym formularzu.
 *
 * === WALIDACJA I PULAPKA NaN ===
 * Pola tekstowe daja `NaN` przy pustej albo popsutej wartosci, a `NaN <= 0`
 * to `false` - warunek "kwota nie jest dodatnia" wpuszczalby wtedy smiec
 * dalej, z wlaczonym przyciskiem. Dlatego kazde pole jest najpierw parsowane
 * do `number | null` (`null` = "nie ma poprawnej liczby"), a dopiero potem
 * porownywane. Nigdzie nie porownujemy surowego wyniku `Number()`.
 *
 * === CZEGO TU NIE OBIECUJEMY ===
 * Wyslanie formularza NIE blokuje zadnych srodkow. Escrow nie istnieje (patrz
 * AskFunding w utils/asks/types.ts), wiec kompozytor mowi wprost, ze autor
 * placi z wlasnej kieszeni przy rozstrzygnieciu. Inaczej "Post ask" czytaloby
 * sie jak zaplata, ktora nie nastapila.
 *
 * === GRANICA ===
 * Komponent nie zna ani API, ani portfela. Oddaje gotowy `AskDraft` przez
 * `onSubmit` - to wolajacy decyduje, czy leci to na trase serwerowa, czy
 * gdziekolwiek indziej.
 */

export type AskDraft = {
  question: string;
  budget: number;
  seats: number;
  durationMs: number;
};

export type AskComposerProps = {
  onSubmit: (draft: AskDraft) => Promise<void> | void;
  /** Np. brak podlaczonego portfela. Powod pokazujemy w `disabledReason`. */
  disabled?: boolean;
  disabledReason?: string;
  onCancel?: () => void;
  className?: string;
};

/** `null` znaczy "nie ma tu poprawnej liczby" - inaczej niz `NaN`, ktory klamie w porownaniach. */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const DEFAULT_DURATION = ASK_DURATIONS[1].ms; // 24h - srodek zakresu, nie skrajnosc

export default function AskComposer({
  onSubmit,
  disabled = false,
  disabledReason,
  onCancel,
  className = '',
}: AskComposerProps) {
  const [question, setQuestion] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [seatsText, setSeatsText] = useState('1');
  const [durationMs, setDurationMs] = useState<number>(DEFAULT_DURATION);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const budget = parseNumber(budgetText);
  const seats = parseNumber(seatsText);

  const perAnswer = useMemo(
    () => (budget === null || seats === null ? 0 : perAnswerFor(budget, seats)),
    [budget, seats]
  );

  /**
   * Pierwszy niespelniony warunek. Kolejnosc jest kolejnoscia pol - komunikat
   * ma dotyczyc tego, czego czlowiek jeszcze nie zrobil, a nie ostatniego bledu
   * w tablicy.
   */
  const problem = useMemo<string | null>(() => {
    if (question.trim() === '') return 'Write the question first.';
    if (budget === null) return 'Set a budget.';
    if (budget <= 0) return 'The budget has to be more than zero.';
    if (seats === null || !Number.isInteger(seats)) return 'Seats must be a whole number.';
    if (seats < 1) return 'An Ask needs at least one seat.';
    if (seats > MAX_SEATS) return `${MAX_SEATS} seats is the maximum.`;
    if (perAnswer < MIN_PER_ANSWER) {
      return `Each answer would be worth ${formatAskMoney(perAnswer)} — below the ${formatAskMoney(
        MIN_PER_ANSWER
      )} minimum. Raise the budget or cut the seats.`;
    }
    return null;
  }, [question, budget, seats, perAnswer]);

  const blocked = disabled || pending || problem !== null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Druga bramka obok `disabled` na przycisku: Enter w polu tekstowym potrafi
    // wyslac formularz z pominieciem przycisku.
    if (blocked || budget === null || seats === null) return;

    setPending(true);
    setFailure(null);
    try {
      await onSubmit({ question: question.trim(), budget, seats, durationMs });
      setQuestion('');
      setBudgetText('');
      setSeatsText('1');
      setDurationMs(DEFAULT_DURATION);
    } catch (error) {
      setFailure(
        error instanceof Error && error.message
          ? error.message
          : 'The Ask was not created. Nothing was charged.'
      );
    } finally {
      setPending(false);
    }
  }

  const fieldClass =
    'w-full rounded-lg border border-soft-line bg-soft-surface px-3 py-2 font-soft text-[14px] text-soft-ink placeholder:text-soft-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary';

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-card border border-soft-line bg-soft-surface p-4 font-soft shadow-card sm:p-5 ${className}`}
    >
      <h2 className="mb-1 font-soft-display text-[17px] font-bold text-soft-ink">Ask something</h2>
      <p className="mb-4 text-[12px] leading-[1.5] text-soft-ink-faint">
        A question with a budget, seats and a deadline. Answers stay sealed until you resolve.
      </p>

      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink-faint">
        Question
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          placeholder="What do you need judged?"
          className={`mt-1.5 block resize-y ${fieldClass} font-normal normal-case tracking-normal`}
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink-faint">
          Budget
          <input
            value={budgetText}
            onChange={(event) => setBudgetText(event.target.value)}
            inputMode="decimal"
            placeholder="6.00"
            className={`mt-1.5 block ${fieldClass} font-normal normal-case tracking-normal tabular-nums`}
          />
        </label>

        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink-faint">
          Seats
          <input
            value={seatsText}
            onChange={(event) => setSeatsText(event.target.value)}
            inputMode="numeric"
            placeholder="3"
            className={`mt-1.5 block ${fieldClass} font-normal normal-case tracking-normal tabular-nums`}
          />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink-faint">
          Deadline
        </legend>
        <div className="flex flex-wrap gap-2">
          {ASK_DURATIONS.map((duration) => {
            const active = duration.ms === durationMs;
            return (
              <button
                key={duration.ms}
                type="button"
                onClick={() => setDurationMs(duration.ms)}
                aria-pressed={active}
                className={`rounded-pill border px-3 py-1.5 text-[12px] font-semibold transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
                  active
                    ? 'border-soft-primary bg-soft-primary text-white'
                    : 'border-soft-line bg-soft-surface text-soft-ink-muted'
                }`}
              >
                {duration.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Liczba, dla ktorej ktos w ogole usiadzie do odpowiedzi. */}
      <div className="mt-4 flex items-baseline justify-between gap-3 rounded-lg bg-soft-sunken px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-[0.12em] text-soft-ink-faint">
          Per answer
        </span>
        <span className="font-soft-display text-[20px] font-bold tabular-nums text-soft-accent-deep">
          {formatAskMoney(perAnswer)}
        </span>
      </div>

      <p className="mt-3 text-[11.5px] leading-[1.5] text-soft-ink-faint">
        Posting does not move any money. Nothing is locked in escrow — you pay each answer you
        accept, yourself, when you resolve. Let the deadline pass without resolving and your resolve
        rate drops on the front of every Ask you post afterwards.
      </p>

      {(problem || failure || (disabled && disabledReason)) && (
        <p
          className="mt-3 break-words text-[12px] leading-[1.5] text-soft-accent-deep"
          role="status"
        >
          {failure ?? (disabled && disabledReason ? disabledReason : problem)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3.5 py-2 font-soft-display text-[13px] font-semibold text-soft-ink-muted transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={blocked}
          className="rounded-lg bg-soft-primary px-4 py-2 font-soft-display text-[13px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface disabled:cursor-not-allowed disabled:bg-soft-line-strong"
        >
          {pending ? 'Posting…' : 'Post ask'}
        </button>
      </div>
    </form>
  );
}
