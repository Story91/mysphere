'use client';

import { useMemo, useState } from 'react';
import {
  ASK_DURATIONS,
  MAX_SEATS,
  MIN_PER_ANSWER,
  perAnswerFor,
  type AskFunding,
} from '../../utils/asks/types';
import { ASK_TEMPLATES_SAFE, type AskTemplate } from '../../utils/asks/templates';
import { attachVaultContext } from '../../utils/asks/vaultContext';
import { MAX_QUESTION_LENGTH } from '../../api/asks/pricing';
import type { VaultFacts, VaultListResult } from '../../utils/morpho/types';
import AskVaultPicker from './AskVaultPicker';
import AskSolanaWallet from './AskSolanaWallet';
import { formatAskMoney } from './AskCard';
import {
  MAX_BUDGET_LAMPORTS,
  MIN_PER_ANSWER_LAMPORTS,
  formatLamports,
  lamportsToSolNumber,
  parseSolToLamports,
  perAnswerLamportsFor,
} from '../../utils/asks/solAmounts';
import { useSolanaAskWallet } from '../../utils/asks/useSolanaAskWallet';
import type { AskRail } from '../../utils/asks/useCreateAsk';

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
 * === DWA WARIANTY FINANSOWANIA, DWA ROZNE ZDANIA ===
 * Kompozytor pyta o jedna rzecz, ktorej wczesniej nie bylo: czy budzet ma sie
 * zablokowac TERAZ (kontrakt AskEscrow), czy autor zaplaci z wlasnego portfela
 * dopiero przy przyjmowaniu. Kazdy wybor ma wlasny opis i oba mowia prawde -
 * bo do wczoraj kazdy Ask byl 'on-resolve' i tekst "nothing is locked" stal tu
 * na stale. Teraz stoi TYLKO nad tym wariantem, ktorego dotyczy.
 *
 * Escrow jest domyslny tam, gdzie kontrakt istnieje: to on jest obietnica
 * z manifestu ("fund it once in USDC"), a odpowiadajacy pracuje przed zaplata,
 * wiec domysl ma chronic jego, nie autora.
 *
 * === SKARBIEC WYBIERANY Z LISTY, A NIE PRZEPISYWANY Z PALCA ===
 * Zaczatki pytaja o skarbiec i do dzis kazdy wklejal adres recznie - adres
 * z literowka wyglada jak adres i daje Aska o czyms, czego nie ma. Gdy wolajacy
 * poda `loadVaults`, formularz pokazuje WYBOR Z LISTY notowanych skarbcow razem
 * z rozbitym oprocentowaniem, a wybrana migawka dokleja sie do tresci pytania
 * (patrz `attachVaultContext`). Bez tego propsa formularz wyglada dokladnie tak,
 * jak dotad - i tak samo dziala, gdy odczyt Morpho padnie.
 *
 * === SZYNA: USDC NA BASE ALBO SOL NA SOLANIE ===
 * "Pay in" pojawia sie tylko tam, gdzie portfel Solany w ogole istnieje
 * (useSolanaWallet().available - NIE w miniappie Farcastera). Ask SOL:
 *   - budzet w SOL, liczony w lamportach (parseSolToLamports) - kwota za
 *     odpowiedz tez, bo 0.005 SOL po zaokragleniu do centa to nie ta kwota,
 *   - tylko "placisz przy przyjeciu": escrow SOL nie istnieje,
 *   - wymaga portfela Solany powiazanego z kontem (ramka AskSolanaWallet),
 *     bo serwer zamraza go w Asku jako platnika.
 * Zmiana szyny czysci budzet: "6" w USDC i "6" w SOL to zupelnie inne kwoty,
 * a formularz od pieniedzy nie moze po cichu przeniesc liczby miedzy nimi.
 *
 * === GRANICA ===
 * Komponent nie zna ani API, ani kontraktu. Oddaje gotowy `AskDraft` przez
 * `onSubmit` - to wolajacy wysyla approve i fund, i to on decyduje, czy escrow
 * jest w ogole dostepny (`escrowAvailable`). Jedyny wyjatek to portfel Solany:
 * jego powiazanie (podpis wiadomosci, zero pieniedzy) jest warunkiem wyslania
 * szkicu SOL, wiec ramka stoi tutaj - inaczej feed i /asks musialyby ja
 * montowac kazde osobno.
 */

export type AskDraft = {
  question: string;
  /** Przy SOL: liczba SOL tylko do wyswietlania - prawda jest w `budgetLamports`. */
  budget: number;
  seats: number;
  durationMs: number;
  funding: AskFunding;
  rail?: AskRail;
  /** Tylko przy 'sol-solana': budzet w lamportach, dziesietnie. */
  budgetLamports?: string;
};

export type AskComposerProps = {
  onSubmit: (draft: AskDraft) => Promise<void> | void;
  /** Np. brak podlaczonego portfela. Powod pokazujemy w `disabledReason`. */
  disabled?: boolean;
  disabledReason?: string;
  /**
   * Czy na sieci portfela stoi kontrakt escrow. `false` chowa wybor i zostawia
   * sam wariant 'on-resolve' - pokazanie opcji, ktora nie ma jak zadzialac,
   * konczy sie surowym bledem po klikinieciu.
   */
  escrowAvailable?: boolean;
  /** Dlaczego escrow nie jest dostepny. Pokazywane zamiast wyboru. */
  escrowUnavailableReason?: string;
  /** Ile procent zabiera kontrakt od budzetu WRACAJACEGO do autora. */
  escrowFeeBps?: number | null;
  /**
   * Co sie wlasnie dzieje na lancuchu. Escrow to dwa okna portfela pod rzad
   * i kilkanascie sekund ciszy miedzy nimi - bez tej linii drugie okno wyglada
   * jak proba pobrania pieniedzy drugi raz.
   */
  progressNote?: string | null;
  /**
   * Skad brac notowane skarbce. BRAK TEGO PROPSA = bloku wyboru nie ma wcale -
   * kompozytor stoi w dwoch miejscach naraz i zadne z nich nie ma placic za
   * odczyt Morpho, dopoki ktos swiadomie go tam nie wlaczy.
   */
  loadVaults?: () => Promise<VaultListResult>;
  onCancel?: () => void;
  className?: string;
};

/** `null` znaczy "nie ma tu poprawnej liczby" - inaczej niz `NaN`, ktory klamie w porownaniach. */
/**
 * Liczba z pola tekstowego. PRZYJMUJE PRZECINEK.
 *
 * `Number('0,5')` to NaN, wiec budzet wpisany po polsku byl odrzucany
 * komunikatem "Set a budget." - czyli formularz mowil, ze pole jest puste,
 * gdy bylo wypelnione. Odmowa jest tu bezpieczniejsza niz blad ceny w platnej
 * sekcji (tam "0,5" stawalo sie 5), ale czlowiek i tak nie wiedzial, co
 * poprawic.
 */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

const DEFAULT_DURATION = ASK_DURATIONS[1].ms; // 24h - srodek zakresu, nie skrajnosc

export default function AskComposer({
  onSubmit,
  disabled = false,
  disabledReason,
  escrowAvailable = false,
  escrowUnavailableReason,
  escrowFeeBps = null,
  progressNote = null,
  loadVaults,
  onCancel,
  className = '',
}: AskComposerProps) {
  const [question, setQuestion] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [seatsText, setSeatsText] = useState('1');
  const [durationMs, setDurationMs] = useState<number>(DEFAULT_DURATION);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * Wybrany skarbiec RAZEM Z LICZBAMI, a nie sam adres. Migawka dokleja sie do
   * tresci dopiero przy wysylce, wiec do tego czasu nie rusza tego, co czlowiek
   * napisal. `null` = Ask nie jest o zadnym skarbcu i to jest normalny stan.
   */
  const [vault, setVault] = useState<VaultFacts | null>(null);
  /**
   * Wybor finansowania. Escrow tam, gdzie w ogole istnieje - patrz naglowek.
   *
   * Zapamietany W STANIE, a nie wyliczany z `escrowAvailable` przy renderze:
   * gdyby portfel przelaczyl siec w trakcie wypelniania formularza, wyliczany
   * wybor przeskoczylby czlowiekowi pod palcami. Zamiast tego nizej pilnujemy,
   * zeby nie dalo sie wyslac escrow tam, gdzie go nie ma.
   */
  const [funding, setFunding] = useState<AskFunding>(escrowAvailable ? 'escrowed' : 'on-resolve');

  /** Wybrana szyna. USDC domyslnie - to jedyna, ktora dziala wszedzie. */
  const [rail, setRail] = useState<AskRail>('usdc-base');
  /**
   * Portfel Solany i jego powiazanie z kontem. Serwera pytamy dopiero, gdy
   * ktos wybierze SOL - kompozytor otwiera sie w feedzie i nie ma placic
   * odczytem za szyne, ktorej nikt nie wybral.
   */
  const solWallet = useSolanaAskWallet({ enabled: rail === 'sol-solana' });
  // Miniapp wykryty po wyborze (albo stos Solany padl) - wracamy na USDC,
  // zamiast wysylac szkic, ktorego nikt tu nie zaplaci.
  const effectiveRail: AskRail = solWallet.available ? rail : 'usdc-base';
  const isSol = effectiveRail === 'sol-solana';

  // Escrow zniknal (zmiana sieci w portfelu) - wybor musi za tym pojsc, bo
  // inaczej przycisk obiecywalby blokade, ktorej nie da sie wykonac. SOL nie
  // ma escrow w ogole.
  const effectiveFunding: AskFunding = escrowAvailable && !isSol ? funding : 'on-resolve';

  const pickRail = (next: AskRail) => {
    if (next === rail) return;
    setRail(next);
    // Patrz naglowek: kwota nie przechodzi miedzy szynami.
    setBudgetText('');
    setFailure(null);
  };

  /**
   * Wstawienie zaczatku. Ustawia CALY szkic naraz - tresc, budzet, miejsca
   * i termin - bo zaczatek, ktory daje samo zdanie, zostawia czlowieka
   * dokladnie z tym pytaniem, na ktore mial odpowiedziec ("ile to kosztuje?").
   *
   * Finansowania NIE dotyka: to jedyne pole, ktore zalezy od stanu portfela
   * i sieci, a nie od tematu pytania. Zaczatek nie ma prawa przestawiac
   * czlowiekowi tego, gdzie leza jego pieniadze.
   *
   * Kasuje tez `failure`: komunikat z poprzedniej proby dotyczyl innej tresci
   * i po podmianie szkicu mowilby o czyms, czego juz nie ma na ekranie.
   */
  const applyTemplate = (template: AskTemplate) => {
    setQuestion(template.question);
    // Budzety zaczatkow sa w USDC. Przy SOL zostawiamy pole puste - "6.00"
    // wpisane w SOL byloby kwota, ktorej nikt nie wybral.
    setBudgetText(isSol ? '' : template.budget.toFixed(2));
    setSeatsText(String(template.seats));
    setDurationMs(template.durationMs);
    setFailure(null);
  };

  const budget = parseNumber(budgetText);
  const seats = parseNumber(seatsText);

  const perAnswer = useMemo(
    () => (budget === null || seats === null ? 0 : perAnswerFor(budget, seats)),
    [budget, seats]
  );

  /** Budzet SOL w lamportach. `null` = pole puste albo nie jest kwota SOL. */
  const budgetLamports = useMemo(() => (isSol ? parseSolToLamports(budgetText) : null), [isSol, budgetText]);
  const perAnswerLamports = useMemo(
    () =>
      budgetLamports === null || seats === null || !Number.isInteger(seats)
        ? 0n
        : perAnswerLamportsFor(budgetLamports, seats),
    [budgetLamports, seats]
  );

  /**
   * Pierwszy niespelniony warunek. Kolejnosc jest kolejnoscia pol - komunikat
   * ma dotyczyc tego, czego czlowiek jeszcze nie zrobil, a nie ostatniego bledu
   * w tablicy.
   */
  const problem = useMemo<string | null>(() => {
    if (question.trim() === '') return 'Write the question first.';
    // Liczymy to, co naprawde pojdzie do serwera (z migawka skarbca) - serwer
    // odrzuca dluzsze, a przy escrow dopiero po zablokowaniu budzetu.
    const sentLength = attachVaultContext(question.trim(), vault).trim().length;
    if (sentLength > MAX_QUESTION_LENGTH) {
      return vault
        ? `With the vault details the question is ${sentLength} characters. Keep it under ${MAX_QUESTION_LENGTH}.`
        : `Keep the question under ${MAX_QUESTION_LENGTH} characters (now ${sentLength}).`;
    }
    if (isSol) {
      if (budgetText.trim() === '') return 'Set a budget in SOL.';
      if (budgetLamports === null) return 'Write the budget as a SOL amount, like 0.05 (up to 9 decimals).';
      if (budgetLamports <= 0n) return 'The budget has to be more than zero.';
      if (budgetLamports > MAX_BUDGET_LAMPORTS) {
        return `The budget is capped at ${formatLamports(MAX_BUDGET_LAMPORTS)} SOL.`;
      }
    } else {
      if (budget === null) return 'Set a budget.';
      if (budget <= 0) return 'The budget has to be more than zero.';
    }
    if (seats === null || !Number.isInteger(seats)) return 'Seats must be a whole number.';
    if (seats < 1) return 'An Ask needs at least one seat.';
    if (seats > MAX_SEATS) return `${MAX_SEATS} seats is the maximum.`;
    if (isSol) {
      if (perAnswerLamports < MIN_PER_ANSWER_LAMPORTS) {
        return `Each answer would be worth ${formatLamports(perAnswerLamports)} SOL, below the ${formatLamports(
          MIN_PER_ANSWER_LAMPORTS
        )} SOL minimum. Raise the budget or cut the seats.`;
      }
      // Platnika serwer bierze z powiazania - bez niego zapis i tak padnie.
      if (!solWallet.binding) {
        return solWallet.bindingPhase === 'loading'
          ? 'Checking your linked Solana wallet…'
          : 'Link a Solana wallet to your account first. It is a free signature.';
      }
      return null;
    }
    if (perAnswer < MIN_PER_ANSWER) {
      return `Each answer would be worth ${formatAskMoney(perAnswer)}, below the ${formatAskMoney(
        MIN_PER_ANSWER
      )} minimum. Raise the budget or cut the seats.`;
    }
    return null;
  }, [
    question,
    vault,
    budget,
    seats,
    perAnswer,
    isSol,
    budgetText,
    budgetLamports,
    perAnswerLamports,
    solWallet.binding,
    solWallet.bindingPhase,
  ]);

  const blocked = disabled || pending || problem !== null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Druga bramka obok `disabled` na przycisku: Enter w polu tekstowym potrafi
    // wyslac formularz z pominieciem przycisku.
    if (blocked || seats === null) return;
    if (isSol ? budgetLamports === null : budget === null) return;

    setPending(true);
    setFailure(null);
    try {
      await onSubmit({
        /**
         * Migawka skarbca wchodzi W TRESC, a nie w osobne pole: pytanie dojezdza
         * wszedzie (karta, odpowiedz, kwit), a nowe pole widzialoby tylko te
         * miejsca, ktore ktos pamietal podpiac. Bez wybranego skarbca to jest
         * dokladnie `question.trim()` i nic wiecej.
         */
        question: attachVaultContext(question.trim(), vault),
        // Przy SOL liczba tylko do wyswietlania - serwer liczy z lamportow.
        budget: isSol && budgetLamports !== null ? lamportsToSolNumber(budgetLamports) : (budget as number),
        seats,
        durationMs,
        funding: effectiveFunding,
        rail: effectiveRail,
        ...(isSol && budgetLamports !== null ? { budgetLamports: budgetLamports.toString() } : {}),
      });
      setQuestion('');
      setBudgetText('');
      setSeatsText('1');
      setDurationMs(DEFAULT_DURATION);
      setVault(null);
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

  /** Oplata jako procent. `null` = nie znamy jej, wiec jej nie nazywamy liczba. */
  const feePercent =
    typeof escrowFeeBps === 'number' && escrowFeeBps > 0 ? `${escrowFeeBps / 100}%` : null;

  const submitLabel = isSol
    ? pending
      ? 'Posting…'
      : 'Post SOL ask'
    : effectiveFunding === 'escrowed'
      ? pending
        ? 'Locking…'
        : budget !== null && budget > 0
          ? `Lock ${formatAskMoney(budget)} and post`
          : 'Lock the budget and post'
      : pending
        ? 'Posting…'
        : 'Post ask';

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-card border border-soft-line bg-soft-surface p-4 font-soft shadow-card sm:p-5 ${className}`}
    >
      {/* Morska kropka to ten sam znak Aska co na pasku stanu AskCard i w
          naglowku raila - kompozytor stoi w feedzie obok kompozytora postu
          na identycznej bialej karcie i tylko po niej widac, ktory to tryb. */}
      <h2 className="mb-1 flex items-center gap-2 font-soft-display text-[17px] font-bold text-soft-ink">
        <span className="h-2 w-2 shrink-0 rounded-full bg-soft-ask" aria-hidden="true" />
        Ask something
      </h2>
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

      {/* ===== ZACZATKI - TYLKO NA PUSTYM FORMULARZU =====
          Znikaja, gdy tylko ktos zacznie pisac. Pigulka podmieniajaca budzet
          i termin pod palcami czlowieka, ktory juz je ustawil, kasowalaby jego
          prace jednym przypadkowym klknieciem - a to jest formularz od
          pieniedzy. Warunek patrzy tez na budzet, bo ktos moze zaczac od kwoty.

          Po co w ogole: puste pole nie mowi, o co WOLNO zapytac ani ile to
          kosztuje. Zaczatek odpowiada na oba naraz, bo niesie tresc RAZEM
          z budzetem, miejscami i terminem. Uzasadnienie doboru tematow stoi
          w app/utils/asks/templates.ts. */}
      {question === '' && budgetText === '' && ASK_TEMPLATES_SAFE.length > 0 && (
        <div className="mt-2">
          <p className="mb-1.5 text-[11px] text-soft-ink-faint">Or start from one of these:</p>
          <div className="flex flex-wrap gap-1.5">
            {ASK_TEMPLATES_SAFE.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={disabled || pending}
                onClick={() => applyTemplate(template)}
                className="rounded-pill border border-soft-line bg-soft-bg px-2.5 py-1 font-soft-display text-[11.5px] font-semibold text-soft-ink-muted transition-[background-color,border-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:border-soft-primary/60 hover:text-soft-primary-deep active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:opacity-50 disabled:active:scale-100"
              >
                {template.chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== SKARBIEC Z LISTY =====
          Stoi POD pytaniem, bo dotyczy tego, o co pytamy, a nie tego, ile za to
          placimy. Cala mechanika (odczyt, awaria, ponowna proba) siedzi w
          `AskVaultPicker` - tutaj zostaje sam wybor. Bez `loadVaults` tego bloku
          nie ma i formularz jest co do piksela taki jak przed ta zmiana. */}
      {loadVaults && (
        <AskVaultPicker
          loadVaults={loadVaults}
          selected={vault}
          onSelect={setVault}
          disabled={disabled || pending}
        />
      )}

      {/* ===== SZYNA =====
          Tylko tam, gdzie portfel Solany w ogole istnieje. W miniappie
          Farcastera wybor znika calkiem - opcja, ktorej nie da sie zaplacic,
          jest gorsza niz jej brak (ta sama zasada co zakladka Solany). */}
      {solWallet.available && (
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink-faint">
            Pay in
          </legend>
          <div className="grid grid-cols-2 gap-1 rounded-pill border border-soft-line bg-soft-sunken p-1" role="radiogroup">
            <RailChoice
              active={!isSol}
              onSelect={() => pickRail('usdc-base')}
              disabled={pending}
              token="USDC"
              network="on Base"
            />
            <RailChoice
              active={isSol}
              onSelect={() => pickRail('sol-solana')}
              disabled={pending}
              token="SOL"
              network="on Solana"
            />
          </div>
        </fieldset>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink-faint">
          {isSol ? 'Budget in SOL' : 'Budget'}
          <input
            value={budgetText}
            onChange={(event) => setBudgetText(event.target.value)}
            inputMode="decimal"
            placeholder={isSol ? '0.05' : '6.00'}
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
          {isSol ? `${formatLamports(perAnswerLamports)} SOL` : formatAskMoney(perAnswer)}
        </span>
      </div>
      {isSol && (
        // Minimum nazwane ZANIM ktos je przekroczy - 0.005 SOL chroni pierwszy
        // przelew na puste konto przed odrzuceniem za rent.
        <p className="mt-1.5 px-1 text-[11px] leading-[1.5] text-soft-ink-faint">
          At least {formatLamports(MIN_PER_ANSWER_LAMPORTS)} SOL per answer, so the first payment to a new
          wallet always lands.
        </p>
      )}

      {/* ================= FINANSOWANIE ================= */}
      {isSol ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {/* Zdanie o pieniadzach dla SOL - to samo, ktore potem mowi karta.
              Nie ma tu wyboru escrow, bo escrow SOL nie istnieje. */}
          <p className="break-words text-[11.5px] leading-[1.5] text-soft-ink-muted">
            Paid on accept in SOL. Nothing is locked. You pay each answer you accept from the Solana
            wallet linked to your account.
          </p>
          <AskSolanaWallet wallet={solWallet} purpose="pay" />
        </div>
      ) : escrowAvailable ? (
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft-ink-faint">
            The money
          </legend>
          <div className="flex flex-col gap-2">
            <FundingChoice
              active={effectiveFunding === 'escrowed'}
              onSelect={() => setFunding('escrowed')}
              title="Lock the budget now"
              // Kazde zdanie tutaj ma pokrycie w AskEscrow.sol. Nie skracaj go
              // do "funded" - to, ze pieniadze wychodza z portfela teraz, i to,
              // ze nie wracaja za darmo, sa dla autora rownie wazne.
              body={`The full budget leaves your wallet when you post and sits in a contract with no owner, no pause and no rescue function. Before the deadline you can only close this Ask by filling every seat; after it, unused seats come back${
                feePercent ? ` minus ${feePercent}` : ' minus a fee'
              }.`}
            />
            <FundingChoice
              active={effectiveFunding === 'on-resolve'}
              onSelect={() => setFunding('on-resolve')}
              title="Pay as you accept"
              body="Nothing moves now. You pay each answer you accept, yourself, from your own wallet. Nothing is held for the people answering; all they have is your resolve record."
            />
          </div>
        </fieldset>
      ) : (
        <p className="mt-4 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          {escrowUnavailableReason ??
            'Escrow is not available here, so this Ask holds nothing up front.'}{' '}
          You pay each answer you accept, yourself, from your own wallet.
        </p>
      )}

      <p className="mt-3 text-[11.5px] leading-[1.5] text-soft-ink-faint">
        {effectiveFunding === 'escrowed'
          ? 'Posting sends two transactions: one to approve the USDC, one to lock it. The Ask is only created after the second one is confirmed.'
          : isSol
            ? 'Posting does not move any SOL.'
            : 'Posting does not move any money.'}{' '}
        Let the deadline pass without resolving and your resolve rate drops on the front of every Ask
        you post afterwards.
      </p>

      {progressNote && (
        <p
          className="mt-3 break-words text-[12px] leading-[1.5] text-soft-primary-deep"
          role="status"
        >
          {progressNote}
        </p>
      )}

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
        {/* Pigulka z `shadow-chip`, jak przycisk na AskCard i w railu, i w tym
            samym `primary-deep`: biel na zwyklym `soft-primary` ma 4.22:1 i przy
            13px nie trzyma AA. `disabled:` stoi w arkuszu Tailwinda 3.4 PO
            `hover:`, wiec wylaczony przycisk pod kursorem zostaje szary. */}
        <button
          type="submit"
          disabled={blocked}
          className="rounded-pill bg-soft-primary-deep px-4 py-2 font-soft-display text-[13px] font-semibold text-white shadow-chip transition-[background-color,transform] duration-150 ease-out hover:bg-soft-primary-deep/90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface disabled:cursor-not-allowed disabled:bg-soft-line-strong disabled:shadow-none"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/**
 * Jeden wybor finansowania.
 *
 * `role="radio"` na przycisku, a nie `<input type="radio">`: opis kazdego
 * wariantu ma dwa zdania i musi byc CZESCIA etykiety, zeby czytnik ekranu
 * przeczytal go razem z nazwa. Cale pole jest klikalne z tego samego powodu -
 * to nie jest wybor rozmiaru, tylko decyzja o tym, kiedy wychodza pieniadze.
 */
function FundingChoice({
  active,
  onSelect,
  title,
  body,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`rounded-lg border p-3 text-left transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary ${
        active ? 'border-soft-primary bg-soft-primary/[0.06]' : 'border-soft-line bg-soft-surface'
      }`}
    >
      <span className="flex items-center gap-2">
        <span
          className={`h-3 w-3 shrink-0 rounded-full border-2 ${
            active ? 'border-soft-primary bg-soft-primary' : 'border-soft-line-strong'
          }`}
          aria-hidden="true"
        />
        <span className="font-soft-display text-[13px] font-semibold text-soft-ink">{title}</span>
      </span>
      <span className="mt-1 block break-words text-[11.5px] leading-[1.5] text-soft-ink-muted">
        {body}
      </span>
    </button>
  );
}

/**
 * Jedna szyna w przelaczniku "Pay in". Segment w pigulce, a nie dwa osobne
 * przyciski: to jest wybor jednego z dwoch, a token i siec czyta sie razem
 * ("SOL on Solana"). Aktywny dostaje biala powierzchnie i morski token -
 * ten sam akcent Aska co pasek stanu karty; bursztyn zostaje dla kwot.
 */
function RailChoice({
  active,
  onSelect,
  disabled,
  token,
  network,
}: {
  active: boolean;
  onSelect: () => void;
  disabled?: boolean;
  token: string;
  network: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      disabled={disabled}
      className={`flex min-w-0 items-baseline justify-center gap-1.5 rounded-pill px-3 py-1.5 font-soft-display text-[12.5px] transition-[background-color,box-shadow,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary disabled:cursor-not-allowed disabled:active:scale-100 ${
        active ? 'bg-soft-surface shadow-chip' : 'hover:bg-soft-surface/60'
      }`}
    >
      <span className={`font-bold ${active ? 'text-soft-ask-deep' : 'text-soft-ink-muted'}`}>{token}</span>
      <span className={`truncate font-medium ${active ? 'text-soft-ink' : 'text-soft-ink-faint'}`}>{network}</span>
    </button>
  );
}
