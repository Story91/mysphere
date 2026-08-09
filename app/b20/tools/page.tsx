import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'B20 tools — mine an address, build a private receipt',
  description:
    'Search for a B20 token address that spells something, and turn an invoice into a memo nobody can read but you can prove. Everything runs in your browser.',
};

const CARD = 'rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5';

export default function B20ToolsPage() {
  return (
    <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[760px]">
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

        {/* ===== CO JESZCZE NIE ISTNIEJE =====
            Osobna sekcja, a nie przypis. Strona, ktora nie mowi, gdzie sie
            konczy, zaczyna obiecywac. */}
        <section className={`${CARD} mt-4`}>
          <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">
            What is not here yet
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            Sending a payment with one of these memos is the next step, and it is not wired to
            anything on this page. The payment contract is written and tested but is not deployed on
            any network yet, so there is nothing for a button to call. A dead button that looks alive
            is worse than a missing one.
          </p>
          {/* Bylo tu "use it whenever creation lands" - zdanie prawdziwe do
              chwili, w ktorej ekran tworzenia zaczal wolac fabryke Base wprost.
              Tworzenie dziala DZIS i strona nie ma prawa sugerowac inaczej. */}
          <p className="mt-2 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            Making a token, unlike sending a memo, does work today — Base makes it, not us, so there
            was nothing to deploy first.{' '}
            <Link
              href="/b20/create"
              className="font-semibold text-soft-primary-deep underline underline-offset-2"
            >
              The creation screen
            </Link>{' '}
            mines the same way and signs the transaction at the end. A salt does not expire either:
            it depends only on your wallet, so one you find here works whenever you use it.
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
