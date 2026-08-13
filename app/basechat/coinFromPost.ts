/**
 * PODPOWIEDZ TOKENA Z TRESCI POSTA - czysta funkcja, bez sieci i bez DOM-u.
 *
 * ===========================================================================
 * SKAD TA REGULA
 * ===========================================================================
 * Symbol z pierwszego slowa posta to nie jest nowy pomysl - tak dzialal
 * PostCoin i tak brzmi podpis pod polem kompozytora ("First letters of your
 * post become the $ticker"). Ludzie to znaja i nie ma powodu tego zmieniac
 * razem ze zmiana launchpada.
 *
 * NAZWA jest inna. PostCoin skladal ja z szablonu "MySphere Post by 0x1234..."
 * i to bylo do przyjecia tam, gdzie nikt jej nie ogladal. U nas nazwa tokena
 * ladue na karcie pod postem, na tablicy, na stronie tokena i w token liscie
 * czytanej przez portfele - adres autora w tym miejscu nie mowi nic o tokenie.
 * Bierzemy wiec pierwsza linie tresci.
 *
 * To jest PODPOWIEDZ, nie decyzja: oba pola stoja w kreatorze otwarte do
 * poprawienia, a pusty post oddaje puste pola zamiast wymyslonych.
 */

/** Tyle znakow symbolu przyjmuje kreator; dluzsze i tak by sie nie zmiescilo. */
const MAX_SYMBOL = 10;
/** Nazwa ma byc etykieta, nie zdaniem - tyle miesci sie na karcie tokena. */
const MAX_NAME = 48;

export function suggestCoinFromPost(content: string | null | undefined): { symbol: string; name: string } {
  const text = (content ?? '').trim();
  if (text === '') return { symbol: '', name: '' };

  const firstWord = text.split(/\s+/)[0] ?? '';
  const symbol = firstWord.replace(/[^A-Za-z0-9]/g, '').slice(0, MAX_SYMBOL).toUpperCase();

  const firstLine = (text.split('\n')[0] ?? '').trim();
  const name = firstLine.slice(0, MAX_NAME).trim();

  return { symbol, name };
}
