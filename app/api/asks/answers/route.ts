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
import { sessionAddress } from '../identity';
import { saveAnswer, type SaveAnswerRefusal } from '../answerStore';
import { isDocId, openAskStore } from '../askStore';
import { MAX_ANSWER_LENGTH } from '../pricing';

// getSessionFromCookies uzywa node:crypto, firebase-admin nie dziala na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

interface AnswerBody {
  askId?: unknown;
  content?: unknown;
}

/**
 * Odmowy z transakcji zapisu (saveAnswer) -> zdanie dla czlowieka. Status
 * przychodzi z magazynu; tu jest tylko tresc.
 */
const REFUSAL_MESSAGES: Record<SaveAnswerRefusal, string> = {
  invalid_id: 'Invalid Ask id',
  invalid_author: 'Your session does not carry a valid wallet address.',
  ask_not_found: 'Ask not found',
  seal_invalid: 'This Ask cannot be verified right now, so it is not taking answers. Nothing was saved.',
  ask_unverified: 'This Ask has not been verified yet, so it is not taking answers.',
  ask_closed: 'This Ask is no longer taking answers',
  own_ask: 'You cannot answer your own Ask',
  already_answered: 'You already answered this Ask',
  answer_write_failed: 'Failed to store answer',
};

export async function POST(request: NextRequest) {
  // Magazyn Askow (admin SDK + klucz pieczeci). Bez niego nie zapiszemy tresci
  // poza zasiegiem klienta ani nie sprawdzimy stanu Aska w transakcji.
  const store = await openAskStore();
  if (!store) {
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
  // Id trafia do admin doc() - 'X/sealed/state' adresowaloby cudzy stan.
  if (!isDocId(askId)) {
    return NextResponse.json(
      { error: 'Invalid Ask id', code: 'invalid_id' },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
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

  // WSZYSTKIE kontrole Aska sa w transakcji zapisu (saveAnswer, plan krok 8):
  //   ask_not_found 404, seal_invalid 503 (pieczec stanu niewazna),
  //   ask_unverified 409 (flaga wlaczona, Ask bez pieczeci - Aska, ktorego
  //   serwer nigdy nie zalozyl, nie zbiera odpowiedzi), ask_closed 409 (status
  //   i termin ZE STANU, gdy Ask jest zapieczetowany), own_ask 403,
  //   already_answered 409 (straznik asks/{id}/answerers/{adres} + stara
  //   odpowiedz tego adresu).
  // Dawne kontrole przed transakcja czytaly dokument klienckim SDK - status,
  // ktory przegladarka ustawia dowolnie, zamykal Aska na odpowiedzi jednym
  // updateDoc. Drugi odczyt poza transakcja niczego by tu nie dodal.
  const saved = await saveAnswer(store, { askId, author, content });
  if (!saved.ok) {
    return NextResponse.json(
      {
        error: REFUSAL_MESSAGES[saved.code],
        code: saved.code,
        ...(saved.askStatus ? { status: saved.askStatus } : {}),
      },
      { status: saved.status, headers: NO_STORE_PRIVATE }
    );
  }
  const stored = saved.answer;

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
