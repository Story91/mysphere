import type { Metadata } from 'next';

/**
 * Layout istnieje WYLACZNIE po to, zeby /money mialo wlasne metadane.
 *
 * app/money/page.tsx jest komponentem klienckim (adres portfela zyje w wagmi,
 * saldo escrow trzeba zapytac lancuch), a komponent kliencki nie moze
 * wyeksportowac `metadata`. Ten sam uklad co app/asks/layout.tsx i z tego
 * samego powodu.
 *
 * === DLACZEGO `robots: noindex` ===
 * To jedyna strona w serwisie, ktora nie ma tresci publicznej. Bez podlaczonego
 * portfela nie pokazuje NICZEGO poza zaproszeniem do podlaczenia, wiec
 * indeksowanie jej daje wyszukiwarce pusta strone i obiecuje czlowiekowi
 * z wynikow cos, czego bez portfela nie zobaczy. Reszta serwisu ma byc
 * indeksowana - ta jedna nie.
 *
 * === CO TU MOZNA OBIECAC, A CZEGO NIE ===
 * Opis mowi o czterech liczbach, ktore strona naprawde liczy. NIE MA w nim
 * slowa "portfolio" ani "balance": strona nie zna sald tokenow, nie zna kursow
 * i niczego nie wycenia. Mowi wylacznie o pieniadzach, ktore przeszly przez
 * TEN produkt i maja tu swoj slad.
 */

const MONEY_DESCRIPTION =
  'Everything money-shaped you have done here, in one place: what the escrow contract owes you, what your open Asks are holding, what people paid you, and what you spent. Every settled line carries a transaction hash you can open in a block explorer.';

export const metadata: Metadata = {
  // Bez marki - dokłada ja `title.template` z layoutu glownego.
  title: 'Your money',
  description: MONEY_DESCRIPTION,
  robots: { index: false, follow: true },
};

export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
