/**
 * Kwoty wpisywane recznie - jedno miejsce, w ktorym rozstrzygamy przecinek.
 *
 * ===========================================================================
 * BLAD, KTORY TO NAPRAWIA: WPISANE 0,5 KOSZTOWALO 5
 * ===========================================================================
 * Pola kwot mialy `type="number"`. W polu liczbowym przegladarka ODRZUCA
 * przecinek jako niedozwolony znak - nie zamienia go na kropke, tylko po
 * cichu wyrzuca. Ciag wpisany jako "0,5" zostawal w stanie jako "05", a to
 * parsuje sie do PIECIU.
 *
 *     parseFloat('0,5')                -> 0
 *     Number('0,5')                    -> NaN
 *     parseFloat('0,5'.replace(',',''))-> 5     <-- to sie dzialo naprawde
 *
 * Dziesiec razy za duzo, bez zadnego ostrzezenia, na polu ustalajacym cene.
 * W kraju, w ktorym przecinek JEST separatorem dziesietnym, to nie jest
 * przypadek brzegowy - to domyslny sposob pisania kwot.
 *
 * Zglosil to wlasciciel: wpisal 0,5 i zobaczyl, ze za platna sekcje trzeba
 * zaplacic 5 dolarow.
 *
 * ===========================================================================
 * DLACZEGO `type="text"` PLUS TA FUNKCJA, A NIE `type="number"`
 * ===========================================================================
 * `type="number"` daje strzalki i walidacje, ale filtruje znaki wedlug
 * ustawien przegladarki, na ktore nie mamy wplywu i ktorych nie widac
 * w testach na maszynie z lokalizacja angielska. `inputMode="decimal"` daje
 * na telefonie te sama klawiature numeryczna, a my sami decydujemy, co
 * z przecinkiem - czyli zamieniamy go na kropke, zamiast wyrzucac.
 */

/**
 * Zamienia to, co czlowiek wpisal, na ciag, ktory bezpiecznie sparsuje sie
 * jako kwota. Zwraca ciag, a nie liczbe, bo pole formularza musi pozwolic
 * pisac "0." w trakcie pisania - liczba zjadlaby kropke i kursor.
 *
 * Zasady:
 *   - przecinek staje sie kropka (0,5 -> 0.5),
 *   - znaki inne niz cyfry i separator wypadaja,
 *   - drugi i kazdy kolejny separator wypada (0.5.3 -> 0.53 bylo by klamstwem,
 *     wiec zostaje 0.5),
 *   - wiodace zera przed cyfra znikaja (05 -> 5), ale "0." i "0" zostaja.
 */
export function normalizeAmountInput(raw: string): string {
  const zSeparatorem = raw.replace(/,/g, '.');
  const tylkoDozwolone = zSeparatorem.replace(/[^0-9.]/g, '');

  // Drugi separator UCINA reszte, a nie skleja jej z poprzednia czescia.
  //
  // "0,5,3" moglo by dac "0.53" (usuniecie drugiej kropki) albo "0.5"
  // (ucięcie). Wybieram ucięcie, bo przy kwotach jedyny kierunek bledu, na
  // ktory nas stac, to W DOL. Sklejanie daje liczbe WIEKSZA od tego, co
  // czlowiek zaczal pisac - czyli dokladnie ten rodzaj cichego zawyzenia,
  // przez ktory "0,5" kosztowalo 5.
  const pierwszaKropka = tylkoDozwolone.indexOf('.');
  const bezDrugiejKropki =
    pierwszaKropka === -1
      ? tylkoDozwolone
      : (() => {
          const reszta = tylkoDozwolone.slice(pierwszaKropka + 1);
          const drugaKropka = reszta.indexOf('.');
          return (
            tylkoDozwolone.slice(0, pierwszaKropka + 1) +
            (drugaKropka === -1 ? reszta : reszta.slice(0, drugaKropka))
          );
        })();

  // "007" -> "7", ale "0" i "0.5" zostaja nietkniete.
  return bezDrugiejKropki.replace(/^0+(?=\d)/, '');
}

/**
 * Kwota jako liczba albo `null`, gdy pole nie niesie sensownej wartosci.
 *
 * `null`, a nie zero: zero jest KWOTA, a puste pole nie jest. Wolajacy ma
 * odroznic "nie podal" od "podal zero" - to ta sama zasada, ktora w tym
 * repo rozdziela awarie od pustki.
 */
export function parseAmount(raw: string): number | null {
  const znormalizowany = normalizeAmountInput(raw);
  if (!znormalizowany || znormalizowany === '.') return null;
  const wartosc = Number(znormalizowany);
  return Number.isFinite(wartosc) ? wartosc : null;
}
