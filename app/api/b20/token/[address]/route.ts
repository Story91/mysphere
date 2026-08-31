import { NextResponse } from 'next/server';
import { getTokenDetail } from '../../../../utils/b20/token';

/**
 * Jeden token B20 dla przegladarki.
 *
 * ===========================================================================
 * PO CO OSOBNA TRASA, SKORO JEST /api/b20/board
 * ===========================================================================
 * Tamta oddaje CALA liste z okna dwudziestu czterech godzin - kilkadziesiat
 * kilobajtow, zeby narysowac jedna karte pod postem. A post z linkiem do tokena
 * moze byc starszy niz doba, wiec tokena moze w tamtej liscie w ogole nie byc.
 *
 * `getTokenDetail` czyta token WPROST, bez okna, wiec dziala dla kazdego adresu.
 *
 * ===========================================================================
 * CO Z TEGO WYCINAMY
 * ===========================================================================
 * SWIECE. Karta pod postem pokazuje cene i przycisk kupna, a nie wykres -
 * 168 punktow na kazda karte w feedzie to kilkadziesiat kilobajtow na post,
 * ktorych nikt nie oglada. Kto chce wykresu, klika w token.
 */

export const runtime = 'nodejs';
// Odpowiedz zalezy od stanu lancucha, wiec nie wolno jej zamrozic przy budowaniu.
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { address: string } }
) {
  const result = await getTokenDetail(params.address);

  if (!result.ok) {
    // 404 dla zlego adresu, 502 dla nieudanego odczytu - to sa DWIE ROZNE
    // rzeczy i klient musi je rozroznic, zeby nie napisac "nie ma takiego
    // tokena" tam, gdzie po prostu nie odpowiedziala siec.
    const status = result.reason === 'unreadable' ? 502 : 404;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }

  const { candles, ...token } = result.token;

  return NextResponse.json(
    { ok: true, token },
    {
      // Minuta u klienta, godzina na krawedzi przy odswiezaniu w tle. Cena
      // tokena sprzed doby nie zmienia sie na tyle, zeby placic za nia
      // odczytem przy kazdym przewinieciu feedu.
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=3600' },
    }
  );
}
