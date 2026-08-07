'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSlicedAddress } from '../../utils/identity/resolver';
import {
  type Ask,
  type ResolveRate,
  isExpired,
} from '../../utils/asks/types';

/**
 * Karta Aska - ten sam obiekt, ktory manifest na /re-definition rysowal jako
 * statyczny podglad (funkcja AskCard tamze). Roznica jest jedna, ale caly czas
 * najwazniejsza: tam byly wymyslone liczby, tutaj sa dane z bazy.
 *
 * === CO KARTA MOZE OBIECAC ===
 * Rysunek pokazywal WYLACZNIE stan "otwarty". Prawdziwy Ask ma trzy stany i
 * kazdy znaczy dla czytajacego co innego:
 *
 *   open      mozna jeszcze odpowiedziec, odliczanie biegnie
 *   expired   termin minal, autor NIE rozstrzygnal - odpowiedzi wisza
 *   resolved  autor rozstrzygnal, miejsca oplacone
 *
 * Stan "expired" jest tu wazniejszy niz sie wydaje: to jedyne miejsce, w ktorym
 * widac, ze czyjs Ask zebral prace i zamilkl. Bez niego karta pokazywalaby
 * wylacznie sukcesy.
 *
 * === CZEGO KARTA NIE OBIECUJE ===
 * 1. ESCROW NIE JEST DOMYSLNY. Kontrakt AskEscrow istnieje i stoi na mainnecie,
 *    ale `funding` jest wyborem POJEDYNCZEGO Aska. Przy `'on-resolve'` autor
 *    placi dopiero przy rozstrzygnieciu i budzet nie lezy nigdzie zablokowany.
 *    Karta czyta to pole i mowi wprost, ktory to wariant, zamiast pozwolic
 *    czytelnikowi zalozyc, ze pieniadze juz czekaja. Zdania dla obu wariantow
 *    sa nizej (sekcja `funding`) i NIE WOLNO ich zamienic miejscami.
 *    Uzasadnienie przy typie AskFunding w utils/asks/types.ts.
 * 2. TRESCI ODPOWIEDZI NIE MA. Pokazujemy `answerCount` - sama LICZBE.
 *    Zapieczetowanie jest realizowane w warstwie danych (osobna kolekcja poza
 *    zasiegiem klienta), nie zaslona w UI.
 * 3. NICZEGO NIE ZMYSLAMY. Brak `resolveRate` to brak odznaki albo uczciwe
 *    "no resolve record yet" - nigdy zero, bo zero jest zarzutem.
 *
 * === AKCJA ===
 * Przycisk pojawia sie tylko wtedy, gdy wolajacy da `onAnswer` albo `href`.
 * Karta nie wymysla sobie celu linku - martwy przycisk "Answer", ktory nigdzie
 * nie prowadzi, jest gorszy niz jego brak.
 *
 * `isAuthor` zmienia sens tego przycisku, bo dla autora znaczy on co innego:
 * autor NIE MOZE odpowiedziec na wlasnego Aska (POST /api/asks/answers odrzuca
 * to z 403), za to jako jedyny moze otworzyc zapieczetowane odpowiedzi i je
 * przyjac. Napis "Answer" na jego karcie prowadzilby prosto w odmowe.
 *
 * Z tego samego powodu autor ma dzialajacy przycisk takze PO TERMINIE: naplyw
 * odpowiedzi jest wtedy zamkniety, ale zaplacenie z opoznieniem wciaz jest
 * lepsze niz niezaplacenie wcale (patrz POST /api/asks/[id]/accept).
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Widok stanu karty. Osobny od `AskStatus`, bo termin mija bez zapisu w bazie. */
type AskView = 'open' | 'expired' | 'resolved';

function viewOf(ask: Ask, now: number): AskView {
  if (ask.status === 'resolved') return 'resolved';
  if (ask.status === 'expired' || isExpired(ask, now)) return 'expired';
  return 'open';
}

/**
 * Kwota. USDC chodzi 1:1 z dolarem i tak jest zapisana w manifescie ($2.00),
 * ale kazdy inny token dostaje swoja nazwe - kwota nie ma udawac dolarow.
 */
export function formatAskMoney(amount: number, token = 'USDC'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return token === 'USDC' || token === 'USD'
    ? `$${value.toFixed(2)}`
    : `${value.toFixed(2)} ${token}`;
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Ponizej doby zegar HH:MM:SS jak w manifescie, wyzej "3d 04h" - sekundy nic tam nie znacza. */
function formatCountdown(left: number): string {
  if (left <= 0) return '00:00:00';
  if (left >= DAY) return `${Math.floor(left / DAY)}d ${pad2(Math.floor((left % DAY) / HOUR))}h`;
  return `${pad2(Math.floor(left / HOUR))}:${pad2(Math.floor((left % HOUR) / MINUTE))}:${pad2(
    Math.floor((left % MINUTE) / SECOND)
  )}`;
}

function formatAgo(since: number): string {
  if (!Number.isFinite(since) || since <= 0) return 'just now';
  if (since < MINUTE) return 'just now';
  if (since < HOUR) return `${Math.floor(since / MINUTE)}m ago`;
  if (since < DAY) return `${Math.floor(since / HOUR)}h ago`;
  return `${Math.floor(since / DAY)}d ago`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Zegar karty.
 *
 * Tyka CO SEKUNDE tylko na ostatniej godzinie - wyzej co minute, bo minuta i
 * tak nie zmienia sie czesciej, a 3600 przerysowan na godzine na kazdej karcie
 * w feedzie to koszt bez zadnego zysku dla patrzacego. Kolejny krok nigdy nie
 * przeskakuje terminu (`Math.min(left, ...)`), wiec ostatnia zmiana wypada
 * dokladnie na zerze.
 *
 * Zwraca `null` do momentu zamontowania - serwer i przegladarka nie moglyby sie
 * zgodzic co do "teraz", a zegar w HTML-u z serwera i tak byloby nieaktualny.
 */
function useNow(deadline: number, running: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!running) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const left = deadline - Date.now();
      if (left <= 0) return; // po terminie nie ma juz czego odliczac
      const step = Math.min(left, left <= HOUR ? SECOND : MINUTE);
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, step);
    };

    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [deadline, running]);

  return now;
}

export type AskCardProps = {
  ask: Ask;
  /** Nazwa autora, jesli wolajacy ja rozwiazal. Bez niej pokazujemy skrocony adres. */
  authorName?: string | null;
  /** Wskaznik rozstrzygalnosci autora. `undefined` = nie sprawdzalismy. */
  resolveRate?: ResolveRate | null;
  /** Akcja przycisku. Bez niej (i bez `href`) karta przycisku nie rysuje. */
  onAnswer?: (ask: Ask) => void;
  href?: string;
  /** Czy patrzacy jest autorem tego Aska. Zmienia napis i zakres przycisku. */
  isAuthor?: boolean;
  className?: string;
};

export default function AskCard({
  ask,
  authorName,
  resolveRate,
  onAnswer,
  href,
  isAuthor = false,
  className = '',
}: AskCardProps) {
  const now = useNow(ask.deadline, ask.status === 'open');
  // Przed zamontowaniem liczymy stan z biezacego czasu, ale sam zegar
  // renderujemy dopiero po montazu - patrz `suppressHydrationWarning` nizej.
  const reference = now ?? Date.now();
  const view = viewOf(ask, reference);
  const left = ask.deadline - reference;

  const author = authorName || (ask.author ? getSlicedAddress(ask.author) : 'unknown address');

  const bar = {
    open: {
      wrap: 'border-soft-line/70 bg-soft-accent/[0.06]',
      text: 'text-soft-accent-deep',
      dot: 'bg-soft-accent motion-safe:animate-pulse',
      label: 'Open ask',
    },
    expired: {
      wrap: 'border-soft-line/70 bg-soft-sunken',
      text: 'text-soft-ink-muted',
      dot: 'bg-soft-line-strong',
      label: 'Closed, not resolved',
    },
    resolved: {
      wrap: 'border-soft-line/70 bg-soft-primary/[0.07]',
      text: 'text-soft-primary-deep',
      dot: 'bg-soft-primary',
      label: 'Resolved',
    },
  }[view];

  const timing =
    view === 'open'
      ? `${formatCountdown(left)} left`
      : view === 'expired'
        ? `deadline passed ${formatAgo(reference - ask.deadline)}`
        : ask.resolvedAt
          ? `resolved ${formatAgo(reference - ask.resolvedAt)}`
          : 'paid out';

  const answers =
    ask.answerCount === 0
      ? view === 'open'
        ? 'No answers yet'
        : 'No answers arrived'
      : view === 'resolved'
        ? `${plural(ask.answerCount, 'answer')}, ${ask.acceptedCount} accepted`
        : view === 'expired'
          ? `${plural(ask.answerCount, 'answer')} still sealed, nothing resolved`
          : `${plural(ask.answerCount, 'answer')} sealed until resolve`;

  const actionLabel = isAuthor
    ? view === 'resolved'
      ? 'See answers'
      : 'Review answers'
    : view === 'open'
      ? 'Answer'
      : view === 'resolved'
        ? 'See answers'
        : 'Answering closed';

  /** Po terminie przycisk zostaje zywy TYLKO dla autora - patrz naglowek. */
  const actionDisabled = view === 'expired' && !isAuthor;

  const actionClass =
    'inline-flex shrink-0 items-center justify-center rounded-lg px-3.5 py-1.5 font-soft-display text-[12px] font-semibold transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface';

  return (
    <article
      className={`relative overflow-hidden rounded-card border border-soft-line bg-soft-surface font-soft shadow-card ${className}`}
    >
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-5 ${bar.wrap}`}>
        <span
          className={`flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] ${bar.text}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${bar.dot}`} aria-hidden="true" />
          <span className="truncate">{bar.label}</span>
        </span>
        {/* Zegar rozjezdza sie miedzy serwerem a przegladarka z definicji. */}
        <span
          className={`shrink-0 text-[11px] tabular-nums ${bar.text} opacity-80`}
          suppressHydrationWarning
        >
          {timing}
        </span>
      </div>

      <div className="px-4 py-5 sm:px-5">
        <div className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span
            className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-[#0052FF] to-[#00E28A]"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate font-soft-display text-[13px] font-semibold text-soft-ink">
            {author}
          </span>
          <ResolveRateBadge rate={resolveRate} />
        </div>

        <p className="mb-5 break-words text-[15px] leading-[1.6] text-soft-ink">{ask.question}</p>

        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-pill border border-soft-line/70 bg-soft-line/40">
          <Cell label="Budget" value={formatAskMoney(ask.budget, ask.token)} money />
          <Cell label="Seats" value={`${ask.acceptedCount} of ${ask.seats}`} />
          <Cell label="Per answer" value={formatAskMoney(ask.perAnswer, ask.token)} money />
        </div>

        {/*
          Zdanie o pieniadzach. Musi wynikac z `funding` i z niczego innego.
          Przy 'escrowed' NIE WOLNO napisac "paid out": resolve() na kontrakcie
          przypisuje salda, a tokeny wychodza dopiero przy claim() po stronie
          odpowiadajacego (patrz naglowek contracts/AskEscrow.sol). Przy
          'on-resolve' nie wolno uzyc slowa escrow w ogole - tam nic nie lezy.
        */}
        <p className="mt-3 break-words text-[11.5px] leading-[1.5] text-soft-ink-faint">
          {ask.funding === 'escrowed' ? (
            <>
              {view === 'resolved'
                ? `Awarded from escrow on ${ask.network}. Each accepted answer collects its share from the contract.`
                : `The whole budget is locked in an escrow contract on ${ask.network}, out of the author's reach.`}
              {ask.escrowTxHash && (
                <>
                  {' '}
                  <a
                    href={`https://basescan.org/tx/${ask.escrowTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-soft-primary-deep underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary"
                  >
                    Check the deposit
                  </a>
                </>
              )}
            </>
          ) : (
            `Not held in escrow: the author pays each accepted answer on ${ask.network} when they resolve.`
          )}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-soft-line/70 pt-4">
          <span className="min-w-0 break-words text-[12px] text-soft-ink-faint">{answers}</span>

          {actionDisabled ? (
            // Wylaczony przycisk, a nie brak przycisku: to informacja o stanie,
            // wiec ma zostac widoczna w tym samym miejscu co akcja.
            <button
              type="button"
              disabled
              className={`${actionClass} cursor-not-allowed bg-soft-sunken text-soft-ink-faint`}
            >
              {actionLabel}
            </button>
          ) : href ? (
            <Link href={href} className={`${actionClass} bg-soft-primary text-white`}>
              {actionLabel}
            </Link>
          ) : onAnswer ? (
            <button
              type="button"
              onClick={() => onAnswer(ask)}
              className={`${actionClass} bg-soft-primary text-white`}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Komorka liczbowa. `money` wlacza bursztyn - jedyne miejsce, gdzie on nalezy. */
function Cell({ label, value, money = false }: { label: string; value: string; money?: boolean }) {
  return (
    // min-w-0 + lamanie: przy duzym budzecie komorka ma sie zwezic, a nie
    // rozepchnac karty na telefonie o szerokosci 320px.
    <div className="min-w-0 bg-soft-surface px-2.5 py-3 sm:px-3">
      <div className="mb-1 text-[10px] uppercase leading-[1.2] tracking-[0.1em] text-soft-ink-faint">
        {label}
      </div>
      <div
        className={`break-words font-soft-display text-[15px] font-semibold tabular-nums ${
          money ? 'text-soft-accent-deep' : 'text-soft-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Wskaznik rozstrzygalnosci autora - jedyna ochrona odpowiadajacego, bo to on
 * pracuje przed zaplata (uzasadnienie przy typie ResolveRate).
 *
 * Trzy przypadki i trzy rozne komunikaty: nie sprawdzalismy (nic nie rysujemy),
 * nie ma z czego liczyc (mowimy to wprost), jest historia (liczba).
 */
function ResolveRateBadge({ rate }: { rate?: ResolveRate | null }) {
  if (!rate) return null;

  if (rate.rate === null || rate.settled === 0) {
    return (
      <span className="shrink-0 rounded-full border border-soft-line bg-soft-sunken px-2 py-0.5 text-[10px] font-medium text-soft-ink-faint">
        no resolve record yet
      </span>
    );
  }

  return (
    <span
      className="shrink-0 rounded-full border border-soft-accent/30 bg-soft-accent-soft px-2 py-0.5 text-[10px] font-medium tabular-nums text-soft-accent-deep"
      title={`${rate.resolved} of ${rate.settled} asks past their deadline were resolved`}
    >
      resolved {rate.resolved}/{rate.settled}
    </span>
  );
}
