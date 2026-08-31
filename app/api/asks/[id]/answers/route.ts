/**
 * GET /api/asks/[id]/answers - metadane odpowiedzi zawsze, TRESCI warunkowo.
 *
 * === TRZY DROGI DO TRESCI I ANI JEDNEJ WIECEJ ===
 *   1. Ask jest `resolved`      - pieczec pada, bo autor juz wybral
 *   2. pytajacy jest AUTOREM Aska - musi przeczytac, zeby wybrac
 *   3. pytajacy pyta o WLASNA odpowiedz - to jego wlasny tekst
 *
 * Kazda inna kombinacja dostaje `content: null`, czyli "jest, ale
 * zapieczetowana" - nigdy "pusta". Ta roznica jest w typie AskAnswer i musi
 * przetrwac az do JSON-a, bo na niej stoi cala obietnica: "nobody can read what
 * anyone else wrote, so nobody can rewrite it slightly and take a seat with it".
 *
 * === DLACZEGO METADANE SA JAWNE ===
 * Karta Aska ma pokazywac "7 answers sealed until resolve". Jawne jest TO, ZE
 * ktos odpowiedzial i kiedy; niejawne CO napisal. Te metadane i tak czyta feed
 * klienckim SDK z kolekcji `askAnswers` - ta trasa nic nowego nie odslania.
 *
 * === DLACZEGO SESJA NIE JEST BEZWZGLEDNIE WYMAGANA ===
 * Rozstrzygniety Ask jest publiczny z definicji - to jest cel calego mechanizmu.
 * Sesja rozstrzyga wylacznie o drogach 2 i 3, czyli o dostepie do tresci JESZCZE
 * zapieczetowanych. Adres z zapytania nie jest tozsamoscia; liczy sie cookie.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAnswerMeta, getAsk } from '../../../../utils/asks/asks';
import { normalizeAddress } from '../../../../utils/monetization/types';
import { sessionAddress } from '../../identity';
import { readAnswerContents } from '../../answerStore';

// getSessionFromCookies uzywa node:crypto, firebase-admin nie dziala na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Odpowiedz zalezy od TEGO, KTO pyta - ten sam URL daje rozna tresc dla autora
 * Aska i dla postronnego. Bez `private` posrednik moglby podac odpowiedz autora
 * komus innemu, czyli rozpieczetowac wszystko jednym trafieniem w cache.
 */
const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const askId = params.id?.trim();
  if (!askId) {
    return NextResponse.json({ error: 'Missing Ask id' }, { status: 400, headers: NO_STORE_PRIVATE });
  }

  let ask;
  try {
    ask = await getAsk(askId);
  } catch (error) {
    console.error('[api/asks/answers] Odczyt Aska nie powiodl sie:', error);
    return NextResponse.json(
      { error: 'Failed to read Ask', code: 'ask_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  if (!ask) {
    return NextResponse.json({ error: 'Ask not found' }, { status: 404, headers: NO_STORE_PRIVATE });
  }

  let answers;
  try {
    answers = await getAnswerMeta(askId);
  } catch (error) {
    console.error('[api/asks/answers] Odczyt odpowiedzi nie powiodl sie:', error);
    // Pusta lista przy nieudanym odczycie mowilaby autorowi "nikt nie
    // odpowiedzial" - w chwili, gdy nie wiemy tego wcale.
    return NextResponse.json(
      { error: 'Failed to read answers', code: 'answers_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  const viewer = sessionAddress(request);
  const viewerAddress = viewer ? normalizeAddress(viewer) : null;
  const isAskAuthor = viewerAddress !== null && normalizeAddress(ask.author) === viewerAddress;
  const isResolved = ask.status === 'resolved';

  const unsealed = answers.filter(
    (answer) =>
      isResolved || isAskAuthor || (viewerAddress !== null && normalizeAddress(answer.author) === viewerAddress)
  );

  let contents: Map<string, string> | null = new Map();
  if (unsealed.length > 0) {
    contents = await readAnswerContents(unsealed.map((answer) => answer.id));
    if (contents === null) {
      // Magazyn nieskonfigurowany albo odczyt padl. Wydanie listy z samymi
      // `null` wygladaloby jak "odpowiedzi sa puste" - i autor Aska
      // rozstrzygnalby na podstawie nieprawdy.
      return NextResponse.json(
        { error: 'Failed to read sealed answers', code: 'content_unavailable' },
        { status: 503, headers: NO_STORE_PRIVATE }
      );
    }
  }

  const unsealedIds = new Set(unsealed.map((answer) => answer.id));
  const resolvedContents = contents;

  return NextResponse.json(
    {
      askId,
      status: ask.status,
      resolved: isResolved,
      viewerIsAuthor: isAskAuthor,
      count: answers.length,
      answers: answers.map((answer) => {
        const visible = unsealedIds.has(answer.id);
        return {
          id: answer.id,
          askId,
          author: answer.author,
          createdAt: answer.createdAt,
          accepted: answer.accepted,
          payoutTxHash: answer.payoutTxHash,
          // null = zapieczetowana. Nigdy "" - pusty string czytaloby sie jak
          // odpowiedz bez tresci.
          content: visible ? resolvedContents.get(answer.id) ?? null : null,
          sealed: !visible,
        };
      }),
    },
    { headers: NO_STORE_PRIVATE }
  );
}
