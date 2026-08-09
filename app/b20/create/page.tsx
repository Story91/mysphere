import type { Metadata } from 'next';
import Link from 'next/link';
import CreateToken from './CreateToken';
import B20Nav from '../B20Nav';

/**
 * /b20/create - EKRAN TWORZENIA. Druga pozycja w nawigacji sekcji.
 *
 * ===========================================================================
 * DLACZEGO TA STRONA TWORZY NAPRAWDE, MIMO ZE LAUNCHPAD NIE JEST WDROZONY
 * ===========================================================================
 * Nasz launchpad (contracts/launchpad) nie stoi na zadnej sieci - w app/ nie ma
 * ani jednego jego adresu, wiec nie ma czego wolac i nie ma o czym klamac.
 * Tworzenie tokena go jednak NIE POTRZEBUJE: fabryka B20 jest czescia Base
 * i przyjmuje wywolanie wprost z portfela. Sprawdzone odczytem, nie zalozone -
 * `eth_call` z ta sama calldata, ktora sklada app/utils/b20/create.ts, oddaje
 * na mainnecie DOKLADNIE ten adres, ktory strona wylicza lokalnie.
 *
 * Skutek jest taki, ze granica przebiega w innym miejscu, niz zakladal projekt
 * ekranu: prawdziwy jest TOKEN, a nie ma RYNKU wokol niego. Ta strona ma wiec
 * jedno zadanie na wejsciu i jedno na wyjsciu - powiedziec, ze podpis robi
 * rzecz nieodwracalna, i powiedziec, ze nikt tego nie kupi, dopoki ktos nie
 * otworzy puli. Oba zdania stoja na ekranie PRZED podpisem.
 *
 * ===========================================================================
 * DLACZEGO KOMPONENT SERWEROWY I ZERO ODCZYTU SIECI
 * ===========================================================================
 * Naglowek, nawigacja i sekcja "czego tu nie ma" nie zaleza od lancucha ani od
 * portfela, wiec wychodza jako gotowy HTML i nie maja prawa czekac. Wszystko,
 * co zalezy od portfela (adres, kopalnia, symulacja, oplata), zyje w CreateToken
 * i jest kliencka - inaczej niz /b20, ta trasa nie potrzebuje `force-dynamic`,
 * bo nie ma tu ani jednej rzeczy, ktora zdezaktualizowalaby sie w buildzie.
 */

export const metadata: Metadata = {
  title: 'Create a B20 token on Base — two words and one signature',
  description:
    'Make a token on Base straight from your wallet: fixed supply, nobody as admin unless you choose otherwise, and the address worked out before you sign. Nobody can buy it until someone opens a pool, and we say so instead of implying otherwise.',
};

const CARD = 'rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5';

export default function B20CreatePage() {
  return (
    <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[860px]">
        <header className="mb-4">
          <p className="font-soft-display text-[11px] font-bold uppercase tracking-[0.12em] text-soft-ink-faint">
            Base · B20 · Create
          </p>
          <h1 className="mt-1 font-soft-display text-[26px] font-bold leading-[1.2] text-soft-ink sm:text-[32px]">
            Make a token on Base
          </h1>
          {/* Dwa zdania, ktore musza pasc przed formularzem: co to robi
              naprawde i czego nie robi. Zargon ("sol", "precompile") nie ma tu
              prawa byc - jest na /b20/tools, gdzie ktos go szuka. */}
          <p className="mt-2 max-w-[64ch] text-[13.5px] leading-[1.6] text-soft-ink-muted">
            Two words and one signature. Base makes the token itself — the same place every token on
            the market list comes from — so this is not a queue and not a preview. What it does not
            do is give anyone a way to buy it: that part is not built yet, and this page says so
            rather than letting you find out afterwards.
          </p>
        </header>

        <B20Nav active="create" />

        <CreateToken />

        {/* ===== CZEGO TU JESZCZE NIE MA =====
            Osobna sekcja pod ekranem, tym samym wzorem co /b20/tools. Strona,
            ktora nie mowi, gdzie sie konczy, zaczyna obiecywac. */}
        <section className={`${CARD} mt-4`}>
          <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">
            What is not here yet
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            <span className="font-semibold text-soft-ink">A way for anyone to buy it.</span> This
            page makes a token and stops there. The part that opens a pool, takes a first buy and
            gives a token a price is written but is not deployed on any network, so there is no
            button for it here and there will not be one until there is something for it to call.
          </p>
          <p className="mt-2 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            Until somebody opens a pool, the token has no price, no chart and nothing for an indexer
            to pick up. On our own list it shows up as{' '}
            <span className="font-semibold text-soft-ink">no pool</span> — the state most tokens made
            on Base each day never leave.
          </p>
          <p className="mt-2 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            Everything above that line is real. The address is worked out in this tab, the fee is
            measured against Base, and the transaction is run against Base before you are allowed to
            sign it.
          </p>
        </section>

        <p className="mt-4 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          Nothing is sent until you sign it in your wallet.{' '}
          <Link href="/b20" className="font-semibold text-soft-primary-deep underline underline-offset-2">
            Back to the market
          </Link>{' '}
          or{' '}
          <Link
            href="/b20/tools"
            className="font-semibold text-soft-primary-deep underline underline-offset-2"
          >
            mine an address on its own
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
