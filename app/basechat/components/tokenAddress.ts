/**
 * Adres tokena w tresci posta - czysta funkcja, bez Reacta i bez sieci.
 *
 * ===========================================================================
 * DLACZEGO KAZDY ADRES, A NIE TYLKO VANITY B20
 * ===========================================================================
 * Stalo tu `/0xb2000000000000000000[0-9a-fA-F]{20}/`, czyli wylacznie adresy
 * wykopane przez precompile Base. To wygodne (taki ciag nie zdarza sie
 * przypadkiem), ale odcinalo tokeny startpada z sieci bez B20 - na Robinhoodzie
 * launchpad robi zwykle ERC-20 i te nie dostawaly karty NIGDY.
 *
 * Teraz lapiemy kazdy adres, a o tym, czy karta ma sie pokazac i skad wziac
 * dane, rozstrzyga pytanie do startpada. Wykrycie adresu to nie jest
 * twierdzenie, ze token istnieje - to jest powod, zeby zapytac.
 *
 * ===========================================================================
 * GRANICE SLOWA
 * ===========================================================================
 * `(?![0-9a-fA-F])` na koncu pilnuje, zeby hasz transakcji (64 znaki) nie
 * zostal wziety za adres po obcieciu do czterdziestu - inaczej kazdy post z
 * linkiem do transakcji probowalby rysowac karte nieistniejacego tokena.
 */
const ADDRESS_RE = /(?<![0-9a-fA-F])0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;

/** Pierwszy adres z tresci, malymi literami. `null`, gdy go nie ma. */
export function findTokenAddress(content: string | null | undefined): string | null {
  if (!content) return null;
  const match = content.match(ADDRESS_RE);
  return match ? match[0].toLowerCase() : null;
}
