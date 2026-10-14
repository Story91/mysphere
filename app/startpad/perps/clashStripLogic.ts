import { findClashOf, isBullBear, sideWord, type Clash, type ClashSide, type ClashToken } from '../duel';
import { buildClashShareText, buildClashUrl } from '../shareText';

/**
 * Czysta czesc paska areny na stronie tokena (ClashStrip.tsx): kogo pokazac,
 * co trzyma ogladajacy, kiedy mowic "You backed", jakie linki i teksty wychodza.
 * Osobny modul bez Reacta i DOM-u, zeby dalo sie go sprawdzic testem mocha
 * (test/ClashStrip.test.ts) - tsx przez ts-node hardhata sie nie kompiluje.
 */

/** Token, na ktorego stronie jestesmy, plus jego rywal i slowa stron. */
export type StripView = {
  clash: Clash;
  /** Strona tokena z URL-a (nie ogladajacego - ten nie ma "swojej" strony, dopoki nie kupi). */
  side: ClashSide;
  me: ClashToken;
  rival: ClashToken;
  bullBear: boolean;
  /** BULL/BEAR w Bull vs Bear, inaczej baza perpa (ETH, NVDA). */
  words: Record<ClashSide, string>;
};

/**
 * Pasek rysujemy tylko dla pary z OBIEMA stronami. Brak danych (ladowanie, blad,
 * pusta lista), token spoza jakiegokolwiek starcia albo starcie bez rywala daja
 * null - strona wtedy wyglada jak zawsze, bez skoku ukladu i bez ramki z bledem.
 */
export function stripViewOf(clashes: Clash[] | null | undefined, token: string): StripView | null {
  if (!clashes || clashes.length === 0) return null;
  const hit = findClashOf(clashes, token);
  if (!hit) return null;
  const { clash, side } = hit;
  const { a, b } = clash;
  if (!a || !b) return null;
  const bullBear = isBullBear(a.perpSymbol, b.perpSymbol);
  return {
    clash,
    side,
    me: side === 'a' ? a : b,
    rival: side === 'a' ? b : a,
    bullBear,
    words: { a: sideWord(a.perpSymbol, bullBear), b: sideWord(b.perpSymbol, bullBear) },
  };
}

/**
 * Strona, ktora trzyma ogladajacy: wylacznie ta z tej strony URL i tylko gdy ma
 * saldo TEGO tokena. Salda drugiego tokena nie znamy (inny rynek, inna sesja
 * odczytow), wiec nigdy nie mowimy nic o jego drugiej stronie.
 */
export function heldSide(side: ClashSide, balance: bigint | null | undefined): ClashSide | null {
  return typeof balance === 'bigint' && balance > 0n ? side : null;
}

/** Jak dlugo po potwierdzonej transakcji wzrost salda liczy sie jako "backed". */
export const BACKED_ARM_MS = 90_000;

/**
 * Czy wzrost salda to swiezo potwierdzony zakup, a nie odswiezenie.
 *   prev      - saldo z poprzedniego odczytu (null = to pierwszy odczyt: punkt odniesienia);
 *   armedAt   - kiedy TradePanel zawolal onAfterTx (null = nic nie bylo);
 *   now       - zegar, wstrzykniety dla testu.
 * Bez uzbrojenia wzrost salda (przelew od kogos, wejscie z portfela po
 * zalogowaniu, reczne Refresh) nie jest zadna deklaracja strony.
 */
export function backedNow(input: { prev: bigint | null; next: bigint | null | undefined; armedAt: number | null; now: number }): boolean {
  const { prev, next, armedAt, now } = input;
  if (prev === null || typeof next !== 'bigint' || armedAt === null) return false;
  if (now < armedAt || now - armedAt > BACKED_ARM_MS) return false;
  return next > prev;
}

/** Adres drugiej strony. Zwykly link, bo zmiana rynku wymaga pelnego przeladowania (siec czytana raz z ?m=). */
export function rivalHref(rival: Pick<ClashToken, 'address' | 'marketId'>): string {
  return `/startpad/${rival.address.toLowerCase()}?m=${encodeURIComponent(rival.marketId)}`;
}

/** Numer doby UTC - X odswieza podglad linku dopiero przy nowym adresie, wiec ?r= zmienia sie raz dziennie. */
export function roundOfDay(nowMs: number): number {
  return Math.floor(nowMs / 86_400_000);
}

/** Logo strony: Blob (profil), potem obrazek z `metadataURI` (starty sprzed 14.10), inaczej inicjaly. */
export function sideLogo(token: Pick<ClashToken, 'address' | 'image'>, logos: Record<string, string>): string | undefined {
  return logos[token.address.toLowerCase()] ?? token.image ?? undefined;
}

/** Slowo do zdania: tylko litery i cyfry, bo baza perpa i ticker to tresc spoza tego repo. */
function plain(word: string, fallback: string): string {
  return word.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || fallback;
}

/** "$MORE: Bull vs Bear. Pick a side." - ticker i strony przechodza sito z shareText.ts. */
export function fightShareText(view: StripView): string {
  return buildClashShareText({ ticker: view.clash.ticker, sideA: view.words.a, sideB: view.words.b });
}

/** "I'm on Team BULL in $MORE: Bull vs Bear. Pick a side." - bez kwot, zyskow i cen. */
export function cornerShareText(view: StripView): string {
  return `I'm on Team ${plain(view.words[view.side], view.side.toUpperCase())} in ${fightShareText(view)}`;
}

/** Plakat pary (a przed b) z runda dnia w ?r=. */
export function fightShareUrl(view: StripView, nowMs: number): string {
  const [first, second] = view.side === 'a' ? [view.me, view.rival] : [view.rival, view.me];
  return buildClashUrl(first.address, second.address, roundOfDay(nowMs));
}
