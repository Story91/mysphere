import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import B20Board from './B20Board';
import B20Nav from './B20Nav';
import { getBoard } from '../utils/b20/market';

/**
 * /b20 - RYNEK. Pierwsza rzecz, ktora ktokolwiek widzi.
 *
 * ===========================================================================
 * CO SIE TU ZMIENILO I DLACZEGO
 * ===========================================================================
 * Wczesniej pod tym adresem stala konsola techniczna: kopalnia adresow
 * i budowniczy prywatnego memo. Obie rzeczy dzialaly, obie byly prawdziwe
 * i obie byly ZLA PIERWSZA RZECZA. Czlowiek, ktory nie wie, co to sol ani
 * rola, dostawal na wejsciu ekran o solach i rolach.
 *
 * Teraz pierwsza rzecza jest lista tokenow, ktore realnie powstaja na Base -
 * okolo 500 na dobe, zmierzone. Konsola zeszla na /b20/tools i jest trzecia
 * pozycja w nawigacji, dokladnie tak jak "Create" u clankera.
 *
 * ===========================================================================
 * DLACZEGO SUSPENSE, A NIE ZWYKLY AWAIT
 * ===========================================================================
 * Pelny odczyt lancucha przy zimnej instancji trwa okolo dwoch sekund (19
 * zapytan RPC). Gdyby cala strona czekala, przez te dwie sekundy nie byloby
 * NICZEGO - ani naglowka, ani nawigacji, ani zdania o tym, na co czekamy.
 *
 * Naglowek i nawigacja nie zaleza od sieci, wiec wychodza natychmiast jako
 * gotowy HTML, a lista dolatuje strumieniem. Przy cieplej instancji migawka
 * jest juz w pamieci i lista wychodzi razem z naglowkiem, bez ani jednego
 * zapytania. To jest cala odpowiedz na "co da sie zcache-owac, nie ma prawa
 * czekac na siec".
 */

export const metadata: Metadata = {
  title: 'B20 market — every token created on Base, and which ones actually trade',
  description:
    'A live list of B20 tokens on Base: who made them, when, and whether anyone has ever traded them. A token with no pool has no price — we say so instead of writing $0.00.',
};

// Migawka zyje w pamieci instancji i ma wlasny licznik swiezosci (60 s), wiec
// zamrozenie tej strony przy budowaniu daloby liste tokenow z dnia wdrozenia.
export const dynamic = 'force-dynamic';

const CARD = 'rounded-card border border-soft-line bg-soft-surface shadow-card';

/* -------------------------------------------------------------------------- */
/*  CZEKANIE, KTORE MOWI, NA CO SIE CZEKA                                      */
/* -------------------------------------------------------------------------- */

function BoardSkeleton() {
  return (
    <div>
      <div className={`${CARD} mb-3 p-4 sm:p-5`} aria-busy="true">
        <p className="text-[13px] leading-[1.55] text-soft-ink-muted">
          Reading the creation events on Base and the pool each token opened. This takes a couple of
          seconds the first time — nothing is cached in your browser and nothing is guessed.
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-soft-sunken">
          <div className="h-full w-1/4 animate-pulse rounded-pill bg-soft-primary/40" />
        </div>
      </div>
      <div className={`${CARD} overflow-hidden`}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-b border-soft-line px-4 py-3.5 last:border-b-0">
            <div className="h-3.5 w-1/3 animate-pulse rounded-pill bg-soft-sunken" />
            <div className="mt-2 h-3 w-1/2 animate-pulse rounded-pill bg-soft-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  AWARIA - NIGDY PUSTA LISTA                                                 */
/* -------------------------------------------------------------------------- */

function BoardUnavailable({ message }: { message: string }) {
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <h2 className="font-soft-display text-[16px] font-bold text-soft-ink">
        We could not read Base just now
      </h2>
      {/* To jest AWARIA, a nie pustka. Pusta lista znaczylaby "dzis nie powstal
          zaden token B20" - zdanie falszywe kazdego dnia od miesiaca. */}
      <p className="mt-1.5 text-[13px] leading-[1.55] text-soft-ink-muted">
        This is a failed read, not an empty market. Around five hundred B20 tokens are created on
        Base every day, so an empty list here would be a lie. Reload and we will try the next node
        in the list.
      </p>
      <p className="mt-2 break-words font-mono text-[11px] leading-[1.5] text-soft-ink-faint">
        {message}
      </p>
      <Link
        href="/b20"
        prefetch={false}
        className="mt-3 inline-flex rounded-pill bg-soft-primary px-4 py-2 font-soft-display text-[12.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
      >
        Try again
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  LISTA - jedyna czesc, ktora czeka na siec                                  */
/* -------------------------------------------------------------------------- */

async function BoardSection() {
  const board = await getBoard();
  if (!board.ok) return <BoardUnavailable message={board.message} />;
  const { stale, ...snapshot } = board;
  return <B20Board initial={snapshot} />;
}

/* -------------------------------------------------------------------------- */

export default function B20MarketPage() {
  return (
    <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[860px]">
        <header className="mb-4">
          <p className="font-soft-display text-[11px] font-bold uppercase tracking-[0.12em] text-soft-ink-faint">
            Base · B20
          </p>
          {/* Naglowek i przycisk w jednym wierszu na szerokim ekranie, jeden pod
              drugim na telefonie. Nawigacja nizej ma "Create" jako pozycje, ale
              pozycja w pasku nie jest zaproszeniem - u clankera to samo dziala
              w dwoch miejscach naraz i dopiero drugie z nich cokolwiek robi. */}
          <div className="mt-1 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h1 className="font-soft-display text-[26px] font-bold leading-[1.2] text-soft-ink sm:text-[32px]">
              Every B20 token on Base
            </h1>
            <Link
              href="/b20/create"
              className="shrink-0 rounded-pill bg-soft-primary px-4 py-2 font-soft-display text-[12.5px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] sm:mt-1"
            >
              Make one
            </Link>
          </div>
          {/* Jedno zdanie o tym, co to jest, dla kogos, kto nie wie. Zargon
              ("sol", "rola", "precompile") nie ma prawa pojawic sie na wejsciu. */}
          <p className="mt-2 max-w-[64ch] text-[13.5px] leading-[1.6] text-soft-ink-muted">
            B20 is Base’s own token standard — built into the network instead of deployed on top of
            it, so making one is cheap and hundreds appear every day. This is all of them from the
            last day, with the one thing every other list hides: whether anybody has ever bought or
            sold the thing.
          </p>
        </header>

        <B20Nav active="market" />

        <Suspense fallback={<BoardSkeleton />}>
          <BoardSection />
        </Suspense>

        <section className={`${CARD} mt-4 p-4 sm:p-5`}>
          <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">
            What this list will not tell you
          </h2>
          <ul className="mt-2 space-y-1.5 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            <li>
              <span className="font-semibold text-soft-ink">How many people hold a token.</span>{' '}
              Counting holders means replaying every transfer of every token. That is far outside
              what this page can read, so the number is absent rather than estimated.
            </li>
            <li>
              <span className="font-semibold text-soft-ink">How deep a pool is.</span> The figure the
              chain returns is liquidity in the current tick, and it reads zero for most freshly
              seeded pools. A number that lies downward is worse than no number.
            </li>
            <li>
              <span className="font-semibold text-soft-ink">A 24-hour price change.</span> Every
              token here is younger than a day, so there is nothing to compare against. We show the
              move since the pool opened instead, and say so.
            </li>
            <li>
              <span className="font-semibold text-soft-ink">Who can mint or freeze a token.</span>{' '}
              The chain answers “does this address hold that role”, never “who holds it”. We can
              check one address at a time, so no badge here can honestly say a token is safe.
            </li>
          </ul>
        </section>

        <p className="mt-4 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          Nothing on this page is a recommendation, and most of what is listed here has never been
          traded by anyone.{' '}
          <Link
            href="/how"
            className="font-semibold text-soft-primary-deep underline underline-offset-2"
          >
            What else you can do here
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
