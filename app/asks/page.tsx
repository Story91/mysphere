import type { Metadata } from 'next';
import AsksContent from './AsksContent';
import BoardTabs, { type BoardTab } from './BoardTabs';
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

const TABS: BoardTab[] = [
  { id: 'asks', label: 'Asks', href: '/asks' },
  { id: 'money', label: 'Money', href: '/asks?tab=money' },
  { id: 'paid', label: 'Paid', href: '/asks?tab=paid' },
  { id: 'curators', label: 'Curators', href: '/asks?tab=curators' },
];

/**
 * Szerokosc kolumny przelacznika sledzi aktywna zakladke, zeby segmenty staly
 * nad lewa krawedzia tresci, a nie obok niej.
 */
const TAB_COLUMN: Record<Tab, string> = {
  asks: 'max-w-[680px]',
  money: 'max-w-[640px]',
  paid: 'max-w-[620px]',
  curators: 'max-w-[760px]',
};

/**
 * Wrapper `.board` (globals.css) przemalowuje cala strone na kierunek "tablicy
 * zlecen" przez podmiane tokenow - zaden komponent wewnatrz nie zna nowych
 * kolorow. Przelacznik stoi ZAWSZE w tym samym miejscu drzewa (pierwsze dziecko
 * wrappera), zeby wskaznik sie przesuwal zamiast sie odmontowywac.
 */
export default function AsksPage({ searchParams }: { searchParams: SearchParams }) {
  const tab = currentTab(searchParams);

  return (
    <div className="board min-h-screen">
      <div className={`mx-auto w-full px-4 pt-6 sm:px-5 ${TAB_COLUMN[tab]}`}>
        <BoardTabs tabs={TABS} active={tab} label="Asks views" />
      </div>

      {/* Money i Paid nie nios wlasnego <main> - dostaja go tutaj, zeby na
          stronie stal dokladnie jeden <main>. Asks i Curators nios wlasny. */}
      {tab === 'money' || tab === 'paid' ? (
        <main className="font-soft">{tab === 'paid' ? <LeaderboardContent /> : <MoneyContent />}</main>
      ) : tab === 'curators' ? (
        <CuratorsContent />
      ) : (
        <AsksContent />
      )}
    </div>
  );
}
