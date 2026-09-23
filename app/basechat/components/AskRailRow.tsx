'use client';

import Link from 'next/link';
import type { Ask } from '../../utils/asks/types';
import { formatAgo, formatAskAmount, formatCountdown, useNow } from './AskCard';
import { solRailBadge } from '../../utils/asks/solAskDisplay';

/**
 * ZWARTY WIERSZ ASKA - wylacznie do prawego raila (FeedAskRail w trybie
 * `layout="column"`).
 *
 * PO CO OSOBNY WIERSZ, SKORO JEST JUZ AskCard.
 * AskCard jest szeroka: ma naglowek autora, odznake rozstrzygalnosci, siatke
 * trzech komorek, zdanie o finansowaniu i przycisk. W kolumnie 320px trzy
 * komorki skladaja sie w linijki po dwa slowa, a cztery takie karty jedna pod
 * druga spychaja Trends o kilka ekranow w dol. Wiersz stoi na tej samej
 * bialej karcie raila co reszta kolumny i niesie tylko to, co da sie
 * przeczytac jednym rzutem oka.
 *
 * TU NIE MA LOGIKI DOSTEPU. Komponent dostaje gotowego `Ask` i gotowa akcje.
 * O tym, czy Ask da sie jeszcze zajac i czy patrzacy jest jego autorem,
 * decyduje wylacznie FeedAskRail - tam, gdzie decydowal przedtem. Dzieki temu
 * nie ma drugiego miejsca, w ktorym te same warunki moglyby sie rozjechac.
 * Jedyne rozgalezienie tutaj to OPIS: otwarty i rozstrzygniety mowia o sobie
 * co innego (nizej).
 *
 * ZEGAR JEST TEN SAM co na AskCard (`useNow`, `formatCountdown`, `formatAgo`,
 * wszystkie importowane stamtad). Ten sam Ask nie ma prawa pokazac dwoch
 * roznych godzin w dwoch miejscach jednego ekranu.
 */
export type AskRailRowProps = {
  ask: Ask;
  /** Otwiera formularz odpowiedzi w railu. Bez niej wiersz jest odnosnikiem. */
  onAnswer?: () => void;
  /** Dokad prowadzi wiersz, gdy odpowiadac sie nie da (autor, komplet miejsc). */
  href?: string;
};

/** Separator linii meta - ten sam znak w obu wariantach wiersza. */
const DOT = ' · ';

/**
 * Linia meta rozstrzygnietego Aska: "$2.00 per answer · 1 of 3 accepted ·
 * resolved 3h ago".
 *
 * Czysta funkcja i eksportowana, bo to jest ZDANIE O PIENIADZACH i ma test
 * (test/askRailRow.test.ts). Zasady, ktore ten test pilnuje:
 *
 * 1. ZADNEGO "paid". Rozstrzygniety Ask z escrow NIE jest wyplacony:
 *    resolve() na kontrakcie przypisuje salda, tokeny wychodza dopiero przy
 *    claim() po stronie odpowiadajacego (AskCard.tsx, komentarz przy zdaniu
 *    o `funding`). Linia nie zna wariantu finansowania, wiec mowi tylko to,
 *    co jest prawda w obu: stawke, ile miejsc przyjeto i kiedy zamknieto.
 * 2. ZADNEGO zegara, wolnych miejsc ani "sealed". Po rozstrzygnieciu termin
 *    nic nie znaczy (odliczanie stalo na 00:00:00 albo, gorzej, pokazywalo
 *    czas do terminu Aska, ktory juz jest zamkniety), wolnych miejsc nie ma
 *    (naplyw odpowiedzi jest zamkniety), a pieczec PADLA przy resolve - patrz
 *    naglowek app/api/asks/[id]/resolve/route.ts.
 * 3. Bez `resolvedAt` nie zgadujemy godziny - piszemy "closed".
 *
 * `now === null` przed zamontowaniem: wtedy tez "closed", bo "resolved Xh
 * ago" liczone z czasu serwera rozjechaloby sie z przegladarka.
 *
 * Kwota wraca OSOBNO od reszty zdania, bo wiersz rysuje ja w `accent-deep`
 * (jak w otwartym), a reszte w `ink-muted`. Cale zdanie to
 * `${amount} ${detail}`.
 */
export function resolvedRowMeta(
  ask: Ask,
  now: number | null
): { amount: string; detail: string } {
  const when =
    typeof ask.resolvedAt === 'number' && Number.isFinite(ask.resolvedAt) && now !== null
      ? `resolved ${formatAgo(now - ask.resolvedAt)}`
      : 'closed';
  return {
    // Ask SOL z lamportow - "0.005 SOL", nie zaokraglone "0.01 SOL".
    amount: formatAskAmount(ask, 'perAnswer'),
    detail: ['per answer', `${ask.acceptedCount} of ${ask.seats} accepted`, when].join(DOT),
  };
}

export default function AskRailRow({ ask, onAnswer, href }: AskRailRowProps) {
  const resolved = ask.status === 'resolved';

  /**
   * Zegar chodzi TYLKO dla otwartego. Rail pokazuje w zakladce "Open"
   * wylacznie Aski po `isAnswerable` (termin w przyszlosci), a w zakladce
   * "Resolved" - Aski juz zamkniete. Dla tych drugich tykanie co minute nie
   * zmienia na ekranie niczego, co zegar mierzy, wiec go nie wlaczamy;
   * `useNow` i tak zwraca jedno "teraz" po zamontowaniu, z ktorego liczy sie
   * "resolved 3h ago". Gdy termin otwartego minie w trakcie patrzenia, zegar
   * dojdzie do 00:00:00 i stanie - dokladnie jak na AskCard.
   */
  const now = useNow(ask.deadline, ask.status === 'open');
  /** `null` do zamontowania - serwer i przegladarka nie zgodzilyby sie co do "teraz". */
  const left = now === null ? null : ask.deadline - now;
  const seatsLeft = Math.max(0, ask.seats - ask.acceptedCount);
  const resolvedMeta = resolved ? resolvedRowMeta(ask, now) : null;
  /**
   * Szyna SOL w wierszu: sam znacznik "SOL" (+ "devnet") w morskim akcencie
   * Aska. Pelna odznaka "SOL · Solana" z karty nie miesci sie w kolumnie 320px
   * obok kwoty i zegara, a kwota i tak juz mowi "SOL".
   */
  const rail = solRailBadge(ask);
  const railTag = rail ? (
    <span className="rounded-full bg-soft-ask-soft px-1.5 py-0.5 text-[10px] font-bold leading-none text-soft-ask-deep">
      {rail.devnet ? 'SOL devnet' : 'SOL'}
    </span>
  ) : null;

  const body = (
    <>
      {/* Trzy linie i koniec. Pelna tresc jest o jedno klikniecie dalej,
          a Ask na siedem linii spychal kwote i zegar tak nisko, ze karta
          przestawala byc jednym rzutem oka. Tytul HTML daje calosc pod
          kursorem, wiec nic nie ginie. */}
      <p
        title={ask.question}
        className="mb-1.5 line-clamp-3 font-soft-display text-[13px] font-bold leading-[1.35] text-soft-ink"
      >
        {ask.question}
      </p>
      {/* Kwota w `accent-deep` trzyma AA wylacznie na bieli (5.2:1). Dlatego
          FeedAskRail stawia kazdy wiersz na `soft-surface`, takze wewnatrz
          zaglebienia z historia, a hover tego wiersza tylko lekko go barwi
          (`soft-sunken` w 60%, okolo 4.7:1) zamiast przejsc na pelne
          zaglebienie (4.36:1). Meta w `ink-muted`, nie `ink-soft` - ten przy
          11.5px ma 3.43:1. */}
      {resolved ? (
        <p className="font-soft text-[11.5px] leading-[1.4] text-soft-ink-muted" suppressHydrationWarning>
          {railTag && <>{railTag} </>}
          <span className="font-bold text-soft-accent-deep">{resolvedMeta?.amount}</span>{' '}
          {resolvedMeta?.detail}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-soft text-[11.5px] leading-none">
          {railTag}
          <span className="font-bold text-soft-accent-deep">{formatAskAmount(ask, 'perAnswer')}</span>
          <span className="text-soft-ink-muted">
            {seatsLeft} {seatsLeft === 1 ? 'slot' : 'slots'}
          </span>
          {left !== null && <span className="text-soft-ink-muted">{formatCountdown(left)}</span>}
          <span className="text-soft-ink-muted">{ask.answerCount} sealed</span>
        </div>
      )}
    </>
  );

  /**
   * Ten sam podzial co na AskCard: odpowiadajacy zostaje na miejscu, autor
   * i domkniete Aski ida na /asks. Napis "Answer" prowadzacy w odmowe 403
   * bylby gorszy niz jego brak.
   */
  const shell =
    'block w-full rounded-xl px-3 py-2.5 text-left transition-colors [transition-duration:var(--dur-press)] hover:bg-soft-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary';

  if (onAnswer) {
    return (
      <button type="button" onClick={onAnswer} className={shell}>
        {body}
      </button>
    );
  }

  return (
    <Link href={href ?? '/asks'} className={shell}>
      {body}
    </Link>
  );
}
