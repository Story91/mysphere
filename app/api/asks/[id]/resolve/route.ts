/**
 * POST /api/asks/[id]/resolve - autor zamyka Aska.
 *
 * === CO SIE PRZY TYM DZIEJE ===
 * Rozstrzygniecie robi dwie rzeczy naraz i obie sa nieodwracalne:
 *   1. Ask przestaje byc otwarty - w `resolve rate` autora ladzie po stronie
 *      "rozstrzygnietych", a nie "porzuconych",
 *   2. PIECZEC PADA. GET /api/asks/[id]/answers wydaje od tej chwili tresci
 *      WSZYSTKICH odpowiedzi kazdemu, kto zapyta - tak dziala caly mechanizm
 *      ("sealed until you resolve"), ale odpowiadajacy musza to wiedziec.
 *
 * === DLACZEGO NIE DA SIE ROZSTRZYGNAC, NIE PLACAC ===
 * `resolve rate` jest JEDYNA ochrona odpowiadajacego: to on pracuje przed
 * zaplata. Gdyby autor mogl zamknac Aska z zerem przyjetych odpowiedzi, mialby
 * darmowy sposob na podniesienie sobie tej liczby - zalozyc Aska, zebrac prace,
 * zamknac, powtorzyc. Dlatego przy Asku, na ktory ktos odpowiedzial, wymagamy
 * co najmniej jednego przyjecia (czyli co najmniej jednego przelewu z dowodem
 * na lancuchu, patrz ./accept).
 *
 * Ask, na ktory NIKT nie odpowiedzial, zamyka sie bez tego warunku - nie ma tam
 * kogo skrzywdzic ani komu zaplacic.
 *
 * SWIADOMY KOSZT TEJ ZASADY: autor, ktory dostal same zle odpowiedzi, nie ma jak
 * zamknac Aska "uczciwie na zero" - minie mu termin i wskaznik potraktuje to jak
 * porzucenie. Wybor jest miedzy krzywda dla niego a darmowa furtka dla kazdego,
 * kto chce zbierac prace i nie placic; ta druga psuje liczbe, na ktorej stoi
 * zaufanie do calego mechanizmu.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAsk, resolveAsk } from '../../../../utils/asks/asks';
import { normalizeAddress } from '../../../../utils/monetization/types';
import { sessionAddress } from '../../identity';

// getSessionFromCookies uzywa node:crypto, ktorego nie ma na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const askId = params.id?.trim();
  if (!askId) {
    return NextResponse.json({ error: 'Missing Ask id' }, { status: 400, headers: NO_STORE_PRIVATE });
  }

  // Adres z ciala zadania nie jest tozsamoscia - liczy sie podpisana sesja.
  const viewer = sessionAddress(request);
  if (!viewer) {
    return NextResponse.json(
      { error: 'Sign in with your wallet to resolve an Ask.', code: 'session_required' },
      { status: 401, headers: NO_STORE_PRIVATE }
    );
  }

  let ask;
  try {
    ask = await getAsk(askId);
  } catch (error) {
    console.error('[api/asks/resolve] Odczyt Aska nie powiodl sie:', error);
    return NextResponse.json(
      { error: 'Failed to read Ask', code: 'ask_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  if (!ask) {
    return NextResponse.json({ error: 'Ask not found' }, { status: 404, headers: NO_STORE_PRIVATE });
  }

  if (normalizeAddress(ask.author) !== normalizeAddress(viewer)) {
    return NextResponse.json(
      { error: 'Only the author of this Ask can resolve it.', code: 'not_ask_author' },
      { status: 403, headers: NO_STORE_PRIVATE }
    );
  }

  if (ask.status === 'resolved') {
    return NextResponse.json(
      { error: 'This Ask is already resolved.', code: 'already_resolved' },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  if (ask.answerCount > 0 && ask.acceptedCount === 0) {
    return NextResponse.json(
      {
        error:
          'Accept at least one answer before resolving. Resolving means you paid - closing without paying is not resolving.',
        code: 'nothing_accepted',
        answerCount: ask.answerCount,
      },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  try {
    await resolveAsk(askId);
  } catch (error) {
    console.error('[api/asks/resolve] Zapis rozstrzygniecia nie powiodl sie:', error);
    // Przyjete odpowiedzi sa juz oplacone i zapisane - nie przepadly. Nie udalo
    // sie wylacznie zamkniecie Aska, wiec ponowienie jest bezpieczne.
    return NextResponse.json(
      {
        error: 'Failed to resolve this Ask. Accepted answers and their payouts are already recorded.',
        code: 'resolve_write_failed',
      },
      { status: 500, headers: NO_STORE_PRIVATE }
    );
  }

  return NextResponse.json(
    {
      askId,
      status: 'resolved',
      acceptedCount: ask.acceptedCount,
      answerCount: ask.answerCount,
      seats: ask.seats,
      // Mowimy wprost o skutku, ktorego nie da sie cofnac.
      unsealed: true,
      note: 'Every answer on this Ask is now readable by anyone.',
    },
    { headers: NO_STORE_PRIVATE }
  );
}
