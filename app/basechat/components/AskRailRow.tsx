'use client';

import Link from 'next/link';
import type { Ask } from '../../utils/asks/types';
import { formatAskMoney, formatCountdown, useNow } from './AskCard';

/**
 * ZWARTY WIERSZ ASKA - wylacznie do prawego raila (FeedAskRail w trybie
 * `layout="column"`).
 *
 * PO CO OSOBNY WIERSZ, SKORO JEST JUZ AskCard.
 * AskCard jest jasna i szeroka: ma naglowek autora, odznake rozstrzygalnosci,
 * siatke czterech komorek i przycisk. W kolumnie 320px na ciemnym tle nie
 * miesci sie ani jedno, ani drugie - biala karta na granacie swiecilaby jak
 * prostokat podswietlony od tylu, a cztery komorki zlozylyby sie w dwie
 * linijki po dwa slowa.
 *
 * TU NIE MA ZADNEJ LOGIKI. Komponent dostaje gotowego `Ask` i gotowa akcje,
 * i rysuje piec pol. O tym, czy Ask da sie jeszcze zajac i czy patrzacy jest
 * jego autorem, decyduje wylacznie FeedAskRail - tam, gdzie decydowal
 * przedtem. Dzieki temu nie ma drugiego miejsca, w ktorym te same warunki
 * moglyby sie rozjechac.
 *
 * ZEGAR JEST TEN SAM co na AskCard (`useNow` + `formatCountdown`, oba
 * importowane stamtad). Ten sam Ask nie ma prawa pokazac dwoch roznych godzin
 * w dwoch miejscach jednego ekranu.
 */
export type AskRailRowProps = {
  ask: Ask;
  /** Otwiera formularz odpowiedzi w railu. Bez niej wiersz jest odnosnikiem. */
  onAnswer?: () => void;
  /** Dokad prowadzi wiersz, gdy odpowiadac sie nie da (autor, komplet miejsc). */
  href?: string;
};

export default function AskRailRow({ ask, onAnswer, href }: AskRailRowProps) {
  /**
   * `running` na sztywno true: rail pokazuje wylacznie Aski, ktore przeszly
   * przez `isAnswerable`, wiec kazdy z nich ma termin w przyszlosci. Gdy
   * termin minie w trakcie patrzenia, zegar dojdzie do 00:00:00 i stanie -
   * dokladnie jak na AskCard.
   */
  const now = useNow(ask.deadline, true);
  /** `null` do zamontowania - serwer i przegladarka nie zgodzilyby sie co do "teraz". */
  const left = now === null ? null : ask.deadline - now;
  const seatsLeft = Math.max(0, ask.seats - ask.acceptedCount);

  const body = (
    <>
      <p className="mb-1.5 font-soft-display text-[13px] font-bold leading-[1.35] text-white">
        {ask.question}
      </p>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-soft text-[11.5px] leading-none">
        <span className="font-bold text-soft-accent">
          {formatAskMoney(ask.perAnswer, ask.token)}
        </span>
        <span className="text-white/55">
          {seatsLeft} {seatsLeft === 1 ? 'slot' : 'slots'}
        </span>
        {left !== null && <span className="text-white/55">{formatCountdown(left)}</span>}
        <span className="text-white/40">{ask.answerCount} sealed</span>
      </div>
    </>
  );

  /**
   * Ten sam podzial co na AskCard: odpowiadajacy zostaje na miejscu, autor
   * i domkniete Aski ida na /asks. Napis "Answer" prowadzacy w odmowe 403
   * bylby gorszy niz jego brak.
   */
  const shell =
    'block w-full rounded-xl px-3 py-2.5 text-left transition-colors [transition-duration:var(--dur-press)] hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-accent';

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
