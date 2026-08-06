/**
 * POST /api/asks/answers - zlozenie odpowiedzi na Aska.
 *
 * === CO TU JEST NAJWAZNIEJSZE ===
 * Tresc odpowiedzi NIE WRACA w zadnej odpowiedzi tej trasy i nie trafia do
 * zadnej kolekcji, ktora czyta przegladarka. Idzie do `askAnswerContent` przez
 * firebase-admin - patrz ./answerStore. Klient dostaje tylko potwierdzenie, ze
 * odpowiedz istnieje. To jest cala obietnica manifestu: "sealed until you
 * resolve: nobody can read what anyone else wrote, so nobody can rewrite it
 * slightly and take a seat with it".
 *
 * === DLACZEGO TA TRASA JEST DARMOWA ===
 * Placi sie za ZADANIE pytania, nie za odpowiedz na nie. Manifest sprzedaje
 * "human judgment to machines" - kazac odpowiadajacemu zaplacic za mozliwosc
 * pracy przed zaplata byloby drugim obciazeniem strony, ktora i tak niesie
 * calosc ryzyka (app/utils/asks/types.ts opisuje ten rozklad wprost).
 *
 * === DLACZEGO WYMAGA SESJI, A /api/asks NIE MUSI ===
 * POST /api/asks moze sie przedstawic podpisana autoryzacja platnosci - ona
 * jest dowodem posiadania klucza. Tutaj platnosci nie ma, wiec jedynym dowodem
 * jest podpisana sesja SIWE. Adres z ciala zadania nie jest tozsamoscia; bez
 * tego kazdy pisalby odpowiedzi cudzym nazwiskiem i zbieral cudze wyplaty.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAsk, hasAnswered } from '../../../utils/asks/asks';
import { isExpired } from '../../../utils/asks/types';
import { normalizeAddress } from '../../../utils/monetization/types';
import { sessionAddress } from '../identity';
import { isAnswerStoreAvailable, saveAnswer } from '../answerStore';
import { MAX_ANSWER_LENGTH } from '../pricing';

// getSessionFromCookies uzywa node:crypto, firebase-admin nie dziala na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

interface AnswerBody {
  askId?: unknown;
  content?: unknown;
}

export async function POST(request: NextRequest) {
  if (!(await isAnswerStoreAvailable())) {
    // Bez konta uslugowego nie da sie zapisac tresci poza zasiegiem klienta.
    // Odmawiamy zamiast zapisac ja tam, gdzie kazdy ja przeczyta - ta sama
    // decyzja co w POST /api/premium.
    return NextResponse.json(
      {
        error: 'Sealed answer storage is not configured on this deployment.',
        code: 'store_unavailable',
      },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  const author = sessionAddress(request);
  if (!author) {
    return NextResponse.json(
      {
        error: 'Sign in with your wallet to answer an Ask.',
        code: 'session_required',
      },
      { status: 401, headers: NO_STORE_PRIVATE }
    );
  }

  let body: AnswerBody;
  try {
    body = (await request.json()) as AnswerBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
  }

  const askId = typeof body.askId === 'string' ? body.askId.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (!askId) {
    return NextResponse.json({ error: 'Missing askId' }, { status: 400, headers: NO_STORE_PRIVATE });
  }
  if (!content) {
    return NextResponse.json(
      { error: 'Missing answer content' },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
  }
  if (content.length > MAX_ANSWER_LENGTH) {
    return NextResponse.json(
      { error: `Answer is limited to ${MAX_ANSWER_LENGTH} characters` },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
  }

  let ask;
  try {
    ask = await getAsk(askId);
  } catch (error) {
    console.error('[api/asks/answers] Odczyt Aska nie powiodl sie:', error);
    // Nieudany odczyt to NIE jest "nie ma takiego Aska". 404 bylby
    // oswiadczeniem o nieistnieniu zasobu wydanym w chwili niewiedzy.
    return NextResponse.json(
      { error: 'Failed to read Ask', code: 'ask_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  if (!ask) {
    return NextResponse.json({ error: 'Ask not found' }, { status: 404, headers: NO_STORE_PRIVATE });
  }

  if (ask.status !== 'open' || isExpired(ask)) {
    return NextResponse.json(
      { error: 'This Ask is no longer taking answers', code: 'ask_closed', status: ask.status },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  if (normalizeAddress(ask.author) === normalizeAddress(author)) {
    return NextResponse.json(
      { error: 'You cannot answer your own Ask', code: 'own_ask' },
      { status: 403, headers: NO_STORE_PRIVATE }
    );
  }

  // Jedna odpowiedz na osobe i na Aska. Bez tego jeden adres zajalby wszystkie
  // miejsca i budzet rozszedlby sie do jednej kieszeni.
  let already: boolean;
  try {
    already = await hasAnswered(askId, normalizeAddress(author));
  } catch (error) {
    console.error('[api/asks/answers] Sprawdzenie dotychczasowej odpowiedzi nie powiodlo sie:', error);
    // Nie umiemy sprawdzic, wiec nie zapisujemy. Failujemy zamknieto:
    // przepuszczenie tutaj oznaczaloby duplikaty przy kazdej awarii odczytu.
    return NextResponse.json(
      { error: 'Failed to check existing answers', code: 'answers_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  if (already) {
    return NextResponse.json(
      { error: 'You already answered this Ask', code: 'already_answered' },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  const stored = await saveAnswer({ askId, author, content });
  if (!stored) {
    return NextResponse.json(
      { error: 'Failed to store answer', code: 'answer_write_failed' },
      { status: 500, headers: NO_STORE_PRIVATE }
    );
  }

  return NextResponse.json(
    {
      id: stored.id,
      askId: stored.askId,
      author: stored.author,
      createdAt: stored.createdAt,
      accepted: false,
      // Jawnie: tresc jest zapisana i celowo nie wraca. `null` znaczy
      // "zapieczetowana", nie "pusta" - tak samo jak w typie AskAnswer.
      content: null,
      sealed: true,
      sealedUntil: 'The author resolves this Ask, or you ask for your own answer.',
    },
    { status: 201, headers: NO_STORE_PRIVATE }
  );
}
