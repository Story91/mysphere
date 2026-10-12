import type { Metadata } from 'next';
import { pageMeta } from '../../utils/pageMeta';
import Link from 'next/link';
import B20Console from './B20Console';
import B20Nav from '../B20Nav';

/**
 * /b20/tools - konsola techniczna. TRZECIA pozycja w nawigacji, nigdy pierwsza.
 *
 * ===========================================================================
 * DLACZEGO TO PRZESTALO BYC STRONA GLOWNA SEKCJI
 * ===========================================================================
 * Ta konsola stala pod /b20 i byla pierwsza rzecza, ktora widzial ktokolwiek
 * wchodzacy na sekcje B20. Obie jej czesci sa prawdziwe i obie dzialaja, ale
 * obie zakladaja, ze czlowiek juz wie, co to sol i po co komu memo. Kto nie
 * wie, odbijal sie od ekranu o solach.
 *
 * Rynek (/b20) odpowiada na pytanie "co sie tu dzieje". Ta strona odpowiada na
 * "jak sobie z tym poradzic" i to jest pytanie DRUGIE, wiec dostaje drugie
 * miejsce. Kod jest nietkniety - zmienil sie wylacznie adres i kolejnosc.
 *
 * Kopalnia adresow zyje takze w ekranie tworzenia (/b20/create), gdzie ma
 * praktyczny sens. Tutaj zostaje w postaci surowej: dla dowolnego adresu
 * zakladajacego i dowolnego wariantu, bez zadania o token.
 */

export const metadata: Metadata = pageMeta({
  title: 'B20 tools: mine an address, build a private receipt',
  description:
    'Search for a B20 token address that spells something, and turn an invoice into a memo nobody can read but you can prove. Everything runs in your browser.',
  image: '/b20/opengraph-image',
});

const CARD = 'rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5';

export default function B20ToolsPage() {
  return (
    <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[920px]">
        <header className="mb-4">
          <p className="font-soft-display text-[11px] font-bold uppercase tracking-[0.12em] text-soft-ink-faint">
            Base · B20 · Tools
          </p>
          <h1 className="mt-1 font-soft-display text-[26px] font-bold leading-[1.2] text-soft-ink sm:text-[32px]">
            Two things you can do without spending anything
          </h1>
          <p className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.6] text-soft-ink-muted">
            Search for a token address that ends in a word you chose, and turn a private invoice
            into a 32-byte memo that proves what a payment was for without telling anyone what it
            was for. Both run entirely in this tab.
          </p>
        </header>

        <B20Nav active="tools" />

        <B20Console />

        {/* Sekcja "What is not here yet" zostala stad usunieta razem z bliznaczka
            na ekranie tworzenia. Tlumaczyla, ze kontrakt platnosci jest napisany,
            ale niewdrozony - czyli nasz stan wdrozenia na ekranie uzytkownika.

            Zasada zostaje bez zmian: nie klamiemy. Nie ma tu przycisku, ktory
            udaje, ze wysle platnosc. Ale brakujaca funkcja po prostu NIE MA
            przycisku - nie dostaje akapitu o tym, dlaczego go nie ma. */}
        <section className={`${CARD} mt-4`}>
          <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">
            Making a token works today
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            Base makes the token, not us, so there was nothing to deploy first.{' '}
            <Link
              href="/b20/create"
              className="font-semibold text-soft-primary-deep underline underline-offset-2"
            >
              The creation screen
            </Link>{' '}
            works the address out in your browser and runs the transaction against Base before you
            are allowed to sign it.
          </p>
        </section>

        <p className="mt-4 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          Everything on this page runs in your browser. Nothing is sent anywhere, and no transaction
          is made.{' '}
          <Link
            href="/b20"
            className="font-semibold text-soft-primary-deep underline underline-offset-2"
          >
            Back to the market
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
