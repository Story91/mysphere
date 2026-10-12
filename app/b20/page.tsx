import type { Metadata } from 'next';
import { pageMeta } from '../utils/pageMeta';
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

export const metadata: Metadata = pageMeta({
  socialTitle: 'B20 market: every token on Base · MySphere',
  title: 'B20 market: every token created on Base, and which ones actually trade',
  description:
    'A live list of B20 tokens on Base: who made them, when, and whether anyone has ever traded them. A token with no pool has no price, and we say so instead of writing $0.00.',
});

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
          seconds the first time. Nothing is cached in your browser and nothing is guessed.
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
      <div className="mx-auto w-full max-w-[1280px]">
        {/* ===== FRONT DRZWI LAUNCHPADA =====
            Wczesniej byl tu zwykly naglowek z malym przyciskiem "Make one" obok.
            To jest RYNEK, ale przede wszystkim LAUNCHPAD - a launchpad, ktorego
            glowna akcja jest pigulka wielkosci etykiety, nie zaprasza do niczego.
            U clankera i lemona pierwsza rzecza na ekranie jest obietnica i dwa
            duze przyciski; ten uklad dziala i nie ma powodu go wymyslac od nowa.

            Naglowek NIE CZEKA NA SIEC. Zadna liczba tutaj nie pochodzi z odczytu
            lancucha - te sa nizej, w karcie, ktora dolatuje Suspensem. Dzieki
            temu pierwsza klatka jest natychmiastowa nawet przy zimnej instancji,
            gdzie odczyt trwa okolo dwoch sekund. */}
        <header className="mb-4 rounded-card border border-soft-line bg-soft-surface p-5 shadow-card sm:p-7">
          <p className="font-soft-display text-[11px] font-bold uppercase tracking-[0.12em] text-soft-ink-faint">
            Base · B20
          </p>

          <h1 className="mt-1.5 font-soft-display text-[30px] font-bold leading-[1.12] text-soft-ink sm:text-[42px]">
            Launch a token on Base
          </h1>

          {/* Jedno zdanie dla kogos, kto nie wie, co to B20. Zargon ("sol",
              "rola", "precompile") nie ma prawa pojawic sie na wejsciu. */}
          <p className="mt-2.5 max-w-[58ch] text-[14px] leading-[1.6] text-soft-ink-muted sm:text-[15px]">
            B20 is Base’s own token standard, built into the network instead of deployed on top of
            it. That makes one cheap to create and gives it a supply cap the network enforces,
            not a promise in a description.
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              href="/b20/create"
              className="rounded-pill bg-soft-primary px-6 py-3 font-soft-display text-[14px] font-bold text-white shadow-chip transition-transform [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97]"
            >
              Launch your token
            </Link>
            <a
              href="#market"
              className="rounded-pill border border-soft-line bg-soft-surface px-6 py-3 font-soft-display text-[14px] font-bold text-soft-ink-muted transition-transform [transition-duration:var(--dur-press)] ease-out-strong hover:text-soft-ink active:scale-[0.97]"
            >
              Explore tokens
            </a>
          </div>
        </header>

        <B20Nav active="market" />

        <div id="market" className="scroll-mt-4" />

        <Suspense fallback={<BoardSkeleton />}>
          <BoardSection />
        </Suspense>

        {/* Stala tu sekcja "What this list will not tell you" - cztery akapity
            o tym, czego NIE pokazujemy. Wyleciala z trzech powodow.

            Po pierwsze, to jest spowiedz na ekranie uzytkownika, ten sam blad
            co przy /re-definition i przy ekranie tworzenia.

            Po drugie - i to wazniejsze - byla w trzech czwartych NIEPRAWDZIWA.
            Glebokosc puli i zmiana ceny sa w tej samej odpowiedzi GeckoTerminal,
            ktora i tak wolamy; doszly do tabeli. "Kto moze dodrukowac" ma
            odpowiedz definitywna bez pytania o role: gdy sufit rowna sie podazy,
            NIKT nie moze, i to widac na stronie tokena.

            Po trzecie, zostaje jedna rzecz naprawde niedostepna - liczba
            posiadaczy - i ona nie potrzebuje akapitu. Po prostu jej nie ma. */}

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
