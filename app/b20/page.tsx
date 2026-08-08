import type { Metadata } from 'next';
import Link from 'next/link';
import B20Console from './B20Console';

/**
 * Strona B20.
 *
 * ===========================================================================
 * PO CO ISTNIEJE
 * ===========================================================================
 * B20 to wlasny standard tokenow Base, wbudowany w oprogramowanie sieci
 * zamiast stac jako zwykly kontrakt (upgrade Beryl, czerwiec 2026). Daje
 * rzeczy, ktorych ERC-20 nie ma: role, listy dopuszczen, sufit podazy, podpisy
 * zamiast osobnej transakcji zgody - i MEMO, czyli 32 bajty doklejone do
 * przelewu.
 *
 * BaseHub, czyli najpelniejszy zbior materialow o Base, nie ma o B20 ANI
 * JEDNEJ wzmianki. To nie jest luka w ich pracy, tylko wiek standardu - i
 * dokladnie dlatego warto tu byc wczesnie.
 *
 * ===========================================================================
 * DWIE RZECZY, KTORE TA STRONA ROBI
 * ===========================================================================
 * 1. KOPALNIA ADRESOW. Fabryka B20 nadaje adresy deterministycznie: adres
 *    wynika z adresu zakladajacego i z soli, ktora ten wybiera. Da sie wiec
 *    szukac soli dajacej adres konczacy sie slowem. Cale liczenie idzie
 *    w przegladarce, bez ani jednego zapytania do sieci.
 *
 *    Nazywamy to "mine an address", a NIE "mine tokens", i ta roznica jest
 *    tu najwazniejszym zdaniem: nie powstaje zadna moneta, nic nie jest
 *    zabezpieczane, nikt nie dostaje nagrody. Szukamy ladnego napisu.
 *
 * 2. PRYWATNY RACHUNEK. Kto wpisze numer faktury do memo otwartym tekstem,
 *    oddaje konkurencji informacje handlowa za darmo. Kto wpisze tam skrot
 *    z czterech pol, nie mowi nikomu nic - a i tak moze pozniej udowodnic,
 *    czego dotyczyla platnosc. Skrot liczy sie tak samo tutaj i w kontrakcie
 *    MemoPay (contracts/MemoPay.sol), a test pilnuje, zeby sie nie rozjechaly.
 *
 * ===========================================================================
 * CZEGO TU JESZCZE NIE MA
 * ===========================================================================
 * Wdrozenia tokena jednym klikiem i wysylki platnosci przez MemoPay. Kontrakt
 * jest napisany i przetestowany (39 testow), ale NIE JEST wdrozony na zadnej
 * sieci - a strona nie ma prawa oferowac przycisku, ktory nie ma dokad wolac.
 * Strona mowi to wprost zamiast pokazywac martwy przycisk.
 */

export const metadata: Metadata = {
  title: 'B20 console — mine an address, build a private receipt',
  description:
    'B20 is Base’s own token standard, built into the network itself. Search for a token address that spells something, and turn an invoice into a memo nobody can read but you can prove.',
};

const CARD = 'rounded-card border border-soft-line bg-soft-surface p-4 shadow-card sm:p-5';

export default function B20Page() {
  return (
    <div className="min-h-screen bg-soft-bg px-4 pb-24 pt-6 font-soft sm:pt-10">
      <div className="mx-auto w-full max-w-[760px]">
        <header className="mb-5">
          <p className="font-soft-display text-[11px] font-bold uppercase tracking-[0.12em] text-soft-ink-faint">
            Base · B20
          </p>
          <h1 className="mt-1 font-soft-display text-[26px] font-bold leading-[1.2] text-soft-ink sm:text-[32px]">
            Tokens that live in the network, not on top of it
          </h1>
          <p className="mt-2 max-w-[62ch] text-[13.5px] leading-[1.6] text-soft-ink-muted">
            B20 is Base’s own token standard. Instead of being a contract someone deployed, it is
            built into the software every Base node runs — which makes transfers cheaper, and gives
            every token roles, allowlists, supply caps and a 32-byte memo without writing any of it
            yourself.
          </p>
        </header>

        <B20Console />

        {/* ===== CO JESZCZE NIE ISTNIEJE =====
            Osobna sekcja, a nie przypis. Strona, ktora nie mowi, gdzie sie
            konczy, zaczyna obiecywac. */}
        <section className={`${CARD} mt-4`}>
          <h2 className="font-soft-display text-[15px] font-bold text-soft-ink">
            What is not here yet
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            Creating the token and sending a payment are the next two steps, and neither is wired to
            anything on this page. The payment contract is written and tested but is not deployed on
            any network yet, so there is nothing for a button to call. A dead button that looks alive
            is worse than a missing one.
          </p>
          <p className="mt-2 text-[12.5px] leading-[1.55] text-soft-ink-muted">
            The address you mine here stays valid the whole time: it depends only on your wallet and
            your salt, so you can find one today and use it whenever creation lands.
          </p>
        </section>

        <p className="mt-4 px-1 text-[11.5px] leading-[1.5] text-soft-ink-faint">
          Everything on this page runs in your browser. Nothing is sent anywhere, and no transaction
          is made.{' '}
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
