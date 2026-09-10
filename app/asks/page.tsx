import type { Metadata } from 'next';
import Link from 'next/link';
import AsksContent from './AsksContent';
import CuratorsContent from '../curators/CuratorsContent';
import MoneyContent from '../money/MoneyContent';
import LeaderboardContent from '../leaderboard/LeaderboardContent';

/**
 * /asks - JEDNA strona, cztery zakladki: otwarte Aski, wlasna ksiega pieniedzy,
 * publiczna tasma rozliczonych platnosci i rejestr kuratorow.
 *
 * === DLACZEGO SCALONE ===
 * Skarga o zbyt wielu pozycjach w belce zdjela wczesniej "Paid" pod /money,
 * a potem "Curators" pod /asks. Teraz to samo spotkalo caly wpis "Money":
 * zajmowal miejsce w gornej belce, a mowi o dokladnie tej samej rzeczy co Ask.
 * Ask jest miejscem, w ktorym pieniadze sie zaczynaja; Money - jedynym,
 * w ktorym widac, gdzie skonczyly; Paid - tym samym widokiem o cudzych
 * pieniadzach; rejestr kuratorow - miejscem, gdzie sprawdzasz, komu te
 * pieniadze powierzasz. Jeden wpis w belce, przelacznik na stronie.
 *
 * Stare adresy przekierowuja tutaj i ZADEN z nich nie ginie:
 *   /curators           -> /asks?tab=curators
 *   /money              -> /asks?tab=money
 *   /money?tab=paid     -> /asks?tab=paid
 *   /leaderboard        -> /asks?tab=paid
 *
 * === ZAKLADKA W QUERY (?tab=...), NIE W STANIE ===
 * Linki maja dzialac, a przycisk wstecz ma wracac do poprzedniej zakladki.
 * Przelacznik to cztery <Link>-i - Next podmienia tresc bez przeladowania,
 * a URL zawsze mowi prawde o tym, co widac.
 *
 * === DLACZEGO CZTERY PIGULKI, A NIE DWIE ZAGNIEZDZONE ===
 * Money mialo wlasny przelacznik Money/Paid. Wniesienie go tutaj w calosci
 * dalby przelacznik w przelaczniku - dwa rzedy pigulek jeden pod drugim, gdzie
 * drugi rzad pojawia sie i znika. Plaska czworka jest jednym rzedem i kazda
 * pozycja ma wlasny adres.
 *
 * === DLACZEGO CZESC ZAKLADEK JEST SERWEROWA ===
 * AsksContent i MoneyContent sa klienckie (portfel, sesja SIWE, transakcje).
 * CuratorsContent i LeaderboardContent sa serwerowe i maja wlasny cache
 * (unstable_cache) - przepisanie ich na klienta znaczyloby, ze kazdy
 * odwiedzajacy placi odczyt kolekcji ze swojej przegladarki. Serwerowa
 * strona-matka renderuje dokladnie jeden z nich.
 *
 * === <main> ===
 * AsksContent i CuratorsContent nios wlasny <main> z tlem i min-h-screen.
 * MoneyContent i LeaderboardContent nie - ich <main> stal dawniej w
 * app/money/page.tsx, wiec tutaj dokladamy go przy renderze. W DOM ma byc
 * zawsze dokladnie jeden <main>.
 */

type SearchParams = { tab?: string | string[] };

type Tab = 'asks' | 'money' | 'paid' | 'curators';

function currentTab(searchParams: SearchParams | undefined): Tab {
  const raw = searchParams?.tab;
  const tab = Array.isArray(raw) ? raw[0] : raw;
  if (tab === 'money' || tab === 'paid' || tab === 'curators') return tab;
  return 'asks';
}

/**
 * Opis Askow ma POKRYCIE W KODZIE: sealed przez regule Firestore, escrow jako
 * WYBOR autora ("can lock", nie "is locked"), wyplata z hashem obok odpowiedzi.
 * Nie zamieniaj na obietnice bezwarunkowa - patrz historia w usunietym layoucie.
 */
const ASKS_DESCRIPTION =
  'An Ask is a question with a budget, a number of seats and a deadline. Answers stay sealed: nobody can read what anyone else wrote before the author opens them. The author can lock the whole budget in an escrow contract up front, and every payout is recorded onchain next to the answer that earned it.';

const CURATORS_DESCRIPTION =
  'A dated record of what curators changed in listed Morpho vaults on Base: fee changes, curator changes, and vaults entering or leaving the listed set.';

const MONEY_DESCRIPTION =
  'Everything money-shaped in one place. Your side: what the escrow contract owes you, what your open Asks are holding, what people paid you, and what you spent. The Paid tab: a public timeline of settled payments between people, every line with a transaction anyone can open and check.';

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
 * Zakladki money i paid przynosza tu metadane z dawnego app/money/page.tsx
 * w calosci: `tab=paid` dostaje jeszcze starsze metadane /leaderboard, zeby
 * link wyslany po dwoch przekierowaniach opisywal to, co czlowiek zobaczy -
 * publiczna tasme, nie prywatna ksiege. Paid jest tez jedyna z tych dwoch
 * zakladek z trescia publiczna, wiec TYLKO ona ma byc indeksowana; widok
 * money bez portfela nie pokazuje niczego i zostaje przy noindex.
 */
export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const tab = currentTab(searchParams);

  if (tab === 'curators') {
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

  if (tab === 'paid') {
    return {
      // Bez marki: dokłada ja `title.template` z layoutu glownego.
      title: 'Paid: money moving',
      description:
        'A public timeline of settled payments between people. Every line carries a transaction anyone can open and check. No points, no activity score.',
      openGraph: {
        title: 'Paid: the only feed where the timeline is money',
        description: 'Settled payments between people, each one verifiable onchain.',
        type: 'website',
      },
      alternates: { canonical: 'https://mysphere.fun/asks?tab=paid' },
    };
  }

  if (tab === 'money') {
    return {
      title: 'Your money',
      description: MONEY_DESCRIPTION,
      robots: { index: false, follow: true },
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

/**
 * Szerokosc kolumny przelacznika sledzi aktywna zakladke, zeby pigulki staly
 * nad lewa krawedzia tresci, a nie obok niej.
 */
const TAB_COLUMN: Record<Tab, string> = {
  asks: 'max-w-[640px]',
  money: 'max-w-[640px]',
  paid: 'max-w-[620px]',
  curators: 'max-w-[760px]',
};

export default function AsksPage({ searchParams }: { searchParams: SearchParams }) {
  const tab = currentTab(searchParams);

  const switcher = (
    <nav
      aria-label="Asks views"
      /* flex-wrap, bo cztery pigulki przy 320px nie mieszcza sie w jednym
         rzedzie - maja sie zlamac, a nie wyjechac poza ekran. */
      className="inline-flex flex-wrap items-center gap-1 rounded-card border border-soft-line bg-soft-sunken p-1 sm:rounded-pill"
    >
      <TabPill href="/asks" active={tab === 'asks'}>
        Asks
      </TabPill>
      <TabPill href="/asks?tab=money" active={tab === 'money'}>
        Money
      </TabPill>
      <TabPill href="/asks?tab=paid" active={tab === 'paid'}>
        Paid
      </TabPill>
      <TabPill href="/asks?tab=curators" active={tab === 'curators'}>
        Curators
      </TabPill>
    </nav>
  );

  // Money i Paid nie nios wlasnego <main> - dostaja go tutaj, razem
  // z przelacznikiem w srodku, zeby na stronie stal dokladnie jeden <main>.
  if (tab === 'money' || tab === 'paid') {
    return (
      <main className="min-h-screen bg-soft-bg font-soft">
        <div className={`mx-auto w-full px-4 pb-6 pt-10 sm:px-5 ${TAB_COLUMN[tab]}`}>{switcher}</div>
        {tab === 'paid' ? <LeaderboardContent /> : <MoneyContent />}
      </main>
    );
  }

  return (
    <>
      {/* Przelacznik stoi NAD trescia zakladki, ktora niesie WLASNY <main>
          z tlem i min-h-screen (AsksContent / CuratorsContent); ten pasek to
          <nav> nad nim. */}
      <div className="bg-soft-bg pt-8">
        <div className={`mx-auto w-full px-4 sm:px-5 ${TAB_COLUMN[tab]}`}>{switcher}</div>
      </div>

      {tab === 'curators' ? <CuratorsContent /> : <AsksContent />}
    </>
  );
}
