import { NextResponse } from 'next/server';
import { BOARD_TTL_MS, getBoard } from '../../../utils/b20/market';

/**
 * Migawka rynku B20 dla przegladarki.
 *
 * ===========================================================================
 * PO CO TA TRASA, SKORO STRONA I TAK RENDERUJE LISTE NA SERWERZE
 * ===========================================================================
 * Zeby lista sama sie odswiezala bez przeladowania i BEZ dotykania lancucha
 * z przegladarki. Pelny odczyt to 19 zapytan RPC. Gdyby robil je klient, kazda
 * otwarta karta mnozylaby ten koszt przez siebie i publiczne RPC odcieloby nas
 * po kilkudziesieciu czytelnikach. Tutaj koszt jest JEDEN dla wszystkich:
 * migawka zyje w pamieci instancji, a przed instancja stoi cache CDN.
 *
 * ===========================================================================
 * AWARIA MA WLASNE WYJSCIE - I TO JEST CALY SENS TEGO PLIKU
 * ===========================================================================
 * Gdy lancuch nie odpowie, ta trasa NIE ODDAJE pustej listy z kodem 200. Pusta
 * lista znaczy "dzis nie powstal zaden token B20" - zdanie falszywe kazdego dnia
 * (zmierzone: ~500 dziennie). Oddajemy 503 z powodem, a strona rysuje wlasny
 * komunikat i przycisk ponowienia zamiast udawac, ze rynek zniknal.
 *
 * Gdy mamy stara migawke, oddajemy JA, a nie blad - z polem `stale`, zeby ekran
 * mogl napisac, ile ma lat. Stara prawda bije swiezy brak odpowiedzi.
 */

// Bez tego Next zamrozilby te trase przy budowaniu i podawal liste tokenow
// z dnia wdrozenia. Swiezoscia steruje wylacznie naglowek Cache-Control nizej.
export const dynamic = 'force-dynamic';

export async function GET() {
  const board = await getBoard();

  if (!board.ok) {
    return NextResponse.json(board, {
      status: 503,
      // Awarii nie wolno wpuscic na CDN. Bez tego jedna nieudana odpowiedz
      // zostalaby przypieta na cale okno i przezylaby powrot lancucha do zycia.
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const maxAge = Math.round(BOARD_TTL_MS / 1000);
  return NextResponse.json(board, {
    status: 200,
    headers: {
      // s-maxage trzyma odpowiedz na brzegu, wiec dziala takze przy zimnym
      // starcie funkcji i przy kilku instancjach naraz - czego pamiec procesu
      // z natury nie potrafi. stale-while-revalidate sprawia, ze gdy odswiezenie
      // sie nie uda, czytelnik dostaje ostatnia dobra liste zamiast bledu.
      'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=300`,
    },
  });
}
