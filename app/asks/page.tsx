import type { Metadata } from 'next';
import Link from 'next/link';
import AsksContent from './AsksContent';
import CuratorsContent from '../curators/CuratorsContent';

/**
 * /asks - JEDNA strona, dwie zakladki: otwarte Aski i publiczny rejestr kuratorow.
 *
 * === DLACZEGO SCALONE (kalka z /money) ===
 * Skarga o zbyt wielu pozycjach w belce zdjela wczesniej "Paid" pod /money.
 * "Curators" to ten sam rodzaj rzeczy w drugiej polowie: publiczny, sprawdzalny
 * zapis o cudzych pieniadzach na Base. Ask jest miejscem, gdzie pytasz i placisz;
 * rejestr kuratorow - miejscem, gdzie sprawdzasz, komu i na jakich warunkach te
 * pieniadze powierzasz. Jeden wpis w belce, przelacznik na stronie. Stare
 * /curators przekierowuje tutaj (redirect w app/curators/page.tsx).
 *
 * === ZAKLADKA W QUERY (?tab=curators), NIE W STANIE ===
 * Ten sam powod co na /money: linki maja dzialac, a przycisk wstecz ma wracac do
 * poprzedniej zakladki. Przelacznik to dwa <Link>-i - Next podmienia tresc bez
 * przeladowania, a URL zawsze mowi prawde o tym, co widac.
 *
 * === DLACZEGO ASKI SA KLIENCKIE, A KURATORZY SERWEROWI ===
 * AsksContent jest kliencki (portfel, sesja SIWE, transakcje). CuratorsContent
 * jest serwerowy i ma wlasny cache (unstable_cache, 5 min) - dokladnie tak jak
 * LeaderboardContent na /money. Serwerowa strona-matka renderuje jeden ALBO drugi.
 */

type SearchParams = { tab?: string | string[] };

function isCuratorsTab(searchParams: SearchParams | undefined): boolean {
  const tab = searchParams?.tab;
  return (Array.isArray(tab) ? tab[0] : tab) === 'curators';
}

/**
 * Metadane zalezne od zakladki - i JEDYNE zrodlo metadanych /asks.
 *
 * Dawniej opis /asks siedzial w app/asks/layout.tsx, bo strona byla kliencka
 * ('use client') i klient nie eksportuje `metadata`. Teraz strona-matka jest
 * SERWEROWA (czyta searchParams), wiec metadane wracaja tutaj przez
 * generateMetadata, a tamten layout zostal usuniety jako zbedny - inaczej dwa
 * zrodla metadanych rozjezdzalyby sie na zakladce Kuratorow (og/twitter
 * "Open asks" na stronie o prowizjach).
 *
 * Opis Askow ma POKRYCIE W KODZIE: sealed przez regule Firestore, escrow jako
 * WYBOR autora ("can lock", nie "is locked"), wyplata z hashem obok odpowiedzi.
 * Nie zamieniaj na obietnice bezwarunkowa - patrz historia w usunietym layoucie.
 */
const ASKS_DESCRIPTION =
  'An Ask is a question with a budget, a number of seats and a deadline. Answers stay sealed: nobody can read what anyone else wrote before the author opens them. The author can lock the whole budget in an escrow contract up front, and every payout is recorded onchain next to the answer that earned it.';

const CURATORS_DESCRIPTION =
  'A dated record of what curators changed in listed Morpho vaults on Base: fee changes, curator changes, and vaults entering or leaving the listed set.';

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  if (isCuratorsTab(searchParams)) {
    return {
      title: 'Curator record',
      description: CURATORS_DESCRIPTION,
      openGraph: {
        type: 'article',
        title: 'Someone can raise the fee on your vault without telling you',
        description:
          'A dated, public record of curator actions in listed Morpho vaults on Base. Fees, curators, listings. No opinions, no forecasts, no wallets.',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'The curator record on MySphere',
        description: CURATORS_DESCRIPTION,
      },
      alternates: { canonical: 'https://mysphere.fun/asks?tab=curators' },
    };
  }

  return {
    title: 'Open asks',
    description: ASKS_DESCRIPTION,
    openGraph: { type: 'website', title: 'Open asks on MySphere', description: ASKS_DESCRIPTION },
    twitter: { card: 'summary_large_image', title: 'Open asks on MySphere', description: ASKS_DESCRIPTION },
  };
}

/** Jedna pigulka przelacznika. Aktywna wyglada jak aktywny wpis w belce. */
function TabPill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center justify-center rounded-pill px-5 py-2 font-soft-display text-[13.5px] font-bold transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-sunken ${
        active ? 'bg-soft-primary text-white shadow-chip' : 'text-soft-ink-muted hover:bg-soft-surface'
      }`}
    >
      {children}
    </Link>
  );
}

export default function AsksPage({ searchParams }: { searchParams: SearchParams }) {
  const curators = isCuratorsTab(searchParams);

  return (
    <>
      {/* Przelacznik stoi NAD trescia obu zakladek. Kazda zakladka niesie WLASNY
          <main> z tlem i min-h-screen (AsksContent / CuratorsContent), wiec
          w DOM jest zawsze dokladnie jeden <main>; ten pasek to <nav> nad nim.
          Szerokosc kolumny sledzi aktywna zakladke (Aski 640, Kuratorzy 760),
          zeby pigulki staly nad lewa krawedzia tresci, a nie obok niej. */}
      <div className="bg-soft-bg pt-8">
        <div className={`mx-auto w-full px-4 sm:px-5 ${curators ? 'max-w-[760px]' : 'max-w-[640px]'}`}>
          <nav
            aria-label="Asks views"
            className="inline-flex items-center gap-1 rounded-pill border border-soft-line bg-soft-sunken p-1"
          >
            <TabPill href="/asks" active={!curators}>
              Asks
            </TabPill>
            <TabPill href="/asks?tab=curators" active={curators}>
              Curators
            </TabPill>
          </nav>
        </div>
      </div>

      {curators ? <CuratorsContent /> : <AsksContent />}
    </>
  );
}
