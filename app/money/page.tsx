import type { Metadata } from 'next';
import Link from 'next/link';
import MoneyContent from './MoneyContent';
import LeaderboardContent from '../leaderboard/LeaderboardContent';

/**
 * /money - JEDNA strona o pieniadzach, dwie zakladki.
 *
 * === DLACZEGO SCALONE ===
 * Skarga brzmiala: za duzo pozycji w nawigacji. "Money" (wlasna ksiega:
 * saldo do odebrania, eskrow, wplywy, wydatki) i "Paid" (publiczna tasma
 * i ranking rozliczonych platnosci) to dwie odpowiedzi na to samo pytanie
 * "gdzie sa pieniadze" - roznia sie tylko tym, CZYJE pieniadze pokazuja.
 * Jeden wpis w belce, przelacznik na stronie.
 *
 * === DLACZEGO KOMPONENT SERWEROWY, SKORO MONEY JEST KLIENCKIE ===
 * Zakladka Paid byla strona serwerowa (dane z Firestore bez portfela,
 * tozsamosci wsadowo) i taka zostaje - przepisanie jej na klienta znaczyloby,
 * ze kazdy odwiedzajacy placi odczyt kolekcji tips ze swojej przegladarki.
 * Serwerowa strona-matka renderuje wiec albo kliencki MoneyContent, albo
 * serwerowy LeaderboardContent; koszt odczytow Paid trzyma w ryzach cache
 * w LeaderboardContent (godzina, jak dawne `revalidate = 3600`).
 *
 * === DLACZEGO ZAKLADKA W QUERY (?tab=paid), NIE W STANIE ===
 * Linki maja dzialac (stare /leaderboard przekierowuje na /money?tab=paid),
 * a przycisk wstecz ma wracac do poprzedniej zakladki. Stan w pamieci
 * komponentu nie przezywa ani jednego, ani drugiego. Przelacznik to dwa
 * <Link>-i - nawigacja kliencka Next podmienia tresc bez przeladowania,
 * a URL zawsze mowi prawde o tym, co widac.
 */

type SearchParams = { tab?: string | string[] };

function isPaidTab(searchParams: SearchParams | undefined): boolean {
  const tab = searchParams?.tab;
  return (Array.isArray(tab) ? tab[0] : tab) === 'paid';
}

const MONEY_DESCRIPTION =
  'Everything money-shaped in one place. Your side: what the escrow contract owes you, what your open Asks are holding, what people paid you, and what you spent. The Paid tab: a public timeline of settled payments between people, every line with a transaction anyone can open and check.';

/**
 * Metadane zalezne od zakladki.
 *
 * tab=paid dostaje dawne metadane /leaderboard (tytul, opis, OG), zeby link
 * wyslany po przekierowaniu opisywal to, co czlowiek zobaczy - publiczna
 * tasme, nie prywatna ksiege. Ta zakladka jest tez jedyna z trescia
 * publiczna, wiec TYLKO ona ma byc indeksowana; domyslny widok bez portfela
 * nie pokazuje niczego i zostaje przy noindex (powod opisany dawniej w
 * app/money/layout.tsx, ktory ta strona zastapila - page.tsx jest teraz
 * serwerowy, wiec layout do samych metadanych nie jest juz potrzebny).
 */
export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  if (isPaidTab(searchParams)) {
    return {
      // Bez marki: dokłada ja `title.template` z layoutu glownego.
      title: 'Paid — money moving',
      description:
        'A public timeline of settled payments between people. Every line carries a transaction anyone can open and check. No points, no activity score.',
      openGraph: {
        title: 'Paid — the only feed where the timeline is money',
        description: 'Settled payments between people, each one verifiable onchain.',
        type: 'website',
      },
      alternates: { canonical: 'https://mysphere.fun/money?tab=paid' },
    };
  }

  return {
    title: 'Your money',
    description: MONEY_DESCRIPTION,
    robots: { index: false, follow: true },
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

export default function MoneyPage({ searchParams }: { searchParams: SearchParams }) {
  const paid = isPaidTab(searchParams);

  return (
    <main className="min-h-screen bg-soft-bg font-soft">
      {/* Przelacznik stoi NAD trescia obu zakladek i w obu ma te sama pozycje
          i szerokosc kolumny - zeby przy przelaczaniu nie skakal. Szerokosc
          640px to kolumna Money; Paid ma wezsza (620px) i zaczyna sie pod nim
          bez wlasnego przesuniecia. */}
      <div className="mx-auto w-full max-w-[640px] px-4 pb-6 pt-10 sm:px-5">
        <nav
          aria-label="Money views"
          className="inline-flex items-center gap-1 rounded-pill border border-soft-line bg-soft-sunken p-1"
        >
          <TabPill href="/money" active={!paid}>
            Money
          </TabPill>
          <TabPill href="/money?tab=paid" active={paid}>
            Paid
          </TabPill>
        </nav>
      </div>

      {paid ? <LeaderboardContent /> : <MoneyContent />}
    </main>
  );
}
