/**
 * GET /api/asks/[id]/answers - metadane odpowiedzi zawsze, TRESCI warunkowo.
 *
 * === TRZY DROGI DO TRESCI I ANI JEDNEJ WIECEJ ===
 *   1. Ask jest rozstrzygniety - pieczec pada, bo autor juz wybral
 *   2. pytajacy jest AUTOREM Aska - musi przeczytac, zeby wybrac
 *   3. pytajacy pyta o WLASNA odpowiedz - to jego wlasny tekst
 *
 * Kazda inna kombinacja dostaje `content: null`, czyli "jest, ale
 * zapieczetowana" - nigdy "pusta". Ta roznica jest w typie AskAnswer i musi
 * przetrwac az do JSON-a, bo na niej stoi cala obietnica: "nobody can read what
 * anyone else wrote, so nobody can rewrite it slightly and take a seat with it".
 *
 * === SKAD WIEMY, ZE ASK JEST ROZSTRZYGNIETY (plan, krok 8) ===
 * Do 2026-09-23 wystarczalo `status: 'resolved'` w dokumencie asks/{id} - pole,
 * ktore dzis zapisuje kazda przegladarka. Jedno updateDoc z devtools odslanialo
 * wszystkie zapieczetowane odpowiedzi kazdemu. Teraz decyzje podejmuje
 * app/utils/asks/askPublicView.ts na widoku z magazynu (admin SDK):
 *   - Ask zapieczetowany  - tylko stan 'resolved' z wazna pieczecia,
 *   - Ask sprzed pieczeci - przy wylaczonej fladze jak dotad (do resealu),
 *                           przy wlaczonej - nigdy.
 * Tak samo "przyjeta": przy Asku zapieczetowanym wylacznie z rekordu przyjecia
 * (asks/{id}/acceptances), a nie z flagi `accepted`, ktora da sie przestawic.
 *
 * === DLACZEGO METADANE SA JAWNE ===
 * Karta Aska ma pokazywac "7 answers sealed until resolve". Jawne jest TO, ZE
 * ktos odpowiedzial i kiedy; niejawne CO napisal. Te metadane i tak czyta feed
 * klienckim SDK z kolekcji `askAnswers` - ta trasa nic nowego nie odslania.
 *
 * === ASK SOL (szyna ze STANU, nigdy z lustra) ===
 * Odpowiedz dostaje dodatkowo: rail 'sol-solana', token/network, solanaCluster,
 * perAnswerLamports, a AUTOR takze solanaPayer (portfel, z ktorego musi wyjsc
 * przelew). Kazda odpowiedz: payoutNetwork (z rekordu), payoutAddressBound,
 * payoutAddress (zamrozony odbiorca - tylko dla autora Aska i autora tej
 * odpowiedzi, reszta null) i dla autora payoutMemo (dokladne memo przelewu).
 * Kwote i adres do zaplaty klient bierze STAD. Ask USDC - ksztalt bez zmian.
 *
 * === DLACZEGO SESJA NIE JEST BEZWZGLEDNIE WYMAGANA ===
 * Rozstrzygniety Ask jest publiczny z definicji - to jest cel calego mechanizmu.
 * Sesja rozstrzyga wylacznie o drogach 2 i 3, czyli o dostepie do tresci JESZCZE
 * zapieczetowanych. Adres z zapytania nie jest tozsamoscia; liczy sie cookie.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { planAnswerThread } from '../../../../utils/asks/askPublicView';
import { lowerAddress, railOf } from '../../../../utils/asks/askSealCore';
import { buildAskPayoutMemo } from '../../../../utils/asks/solAmounts';
import { sessionAddress } from '../../identity';
import { readAnswerContents } from '../../answerStore';
import { readPayees, type PayeeSet } from '../../solanaWalletStore';
import {
  AskError,
  isDocId,
  openAskStore,
  readAcceptances,
  readAnswerRows,
  readAskBundle,
  usableView,
  type AcceptanceSet,
  type AnswerRow,
  type AskView,
} from '../../askStore';

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
  const askId = typeof params.id === 'string' ? params.id.trim() : '';
  if (!askId) {
    return NextResponse.json({ error: 'Missing Ask id' }, { status: 400, headers: NO_STORE_PRIVATE });
  }
  // Id trafia do admin doc() - 'X/sealed/state' adresowaloby cudzy stan.
  if (!isDocId(askId)) {
    return NextResponse.json(
      { error: 'Invalid Ask id', code: 'invalid_id' },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
  }

  // Bez magazynu (admin SDK + klucz pieczeci) nie odroznimy prawdziwego
  // rozstrzygniecia od podrobionego - wiec nie odslaniamy niczego.
  const store = await openAskStore();
  if (!store) {
    return NextResponse.json(
      { error: 'Sealed answer storage is not configured on this deployment.', code: 'store_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  let view: AskView;
  try {
    view = usableView(await readAskBundle(store, askId));
  } catch (error) {
    if (error instanceof AskError) {
      // ask_not_found 404, seal_invalid 503 (pieczec stanu niewazna - ALARM
      // jest juz w logu; nic nie odslaniamy i niczego nie nadpisujemy).
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: NO_STORE_PRIVATE }
      );
    }
    console.error('[api/asks/answers] Odczyt Aska nie powiodl sie:', error);
    return NextResponse.json(
      { error: 'Failed to read Ask', code: 'ask_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  let rows: AnswerRow[];
  let acceptances: AcceptanceSet;
  try {
    [rows, acceptances] = await Promise.all([readAnswerRows(store, askId), readAcceptances(store, askId)]);
  } catch (error) {
    console.error('[api/asks/answers] Odczyt odpowiedzi nie powiodl sie:', error);
    // Pusta lista przy nieudanym odczycie mowilaby autorowi "nikt nie
    // odpowiedzial" - w chwili, gdy nie wiemy tego wcale.
    return NextResponse.json(
      { error: 'Failed to read answers', code: 'answers_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  if (acceptances.invalid.length > 0) {
    // Rekord przyjecia z niewazna pieczecia: nie wiemy, ktore odpowiedzi sa
    // naprawde oplacone. "Nieprzyjeta" zaprosiloby autora do drugiej wyplaty.
    return NextResponse.json(
      { error: 'This Ask cannot be verified right now. Nothing was changed.', code: 'seal_invalid' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  const viewer = sessionAddress(request);
  const plan = planAnswerThread({
    askId,
    view,
    rows,
    acceptances: acceptances.valid,
    viewer,
  });

  // Ask SOL - szyna WYLACZNIE ze stanu (view.state istnieje tylko przy wazna
  // pieczeci). Kwote i adres do zaplaty klient bierze STAD, nigdy z lustra.
  const solState = view.trust === 'sealed' && view.state && railOf(view.state) === 'sol-solana' ? view.state : null;
  let payees: PayeeSet | null = null;
  if (solState) {
    try {
      payees = await readPayees(store, askId);
    } catch (error) {
      console.error('[api/asks/answers] Odczyt odbiorcow SOL nie powiodl sie:', error);
      return NextResponse.json(
        { error: 'Failed to read answers', code: 'answers_unavailable' },
        { status: 503, headers: NO_STORE_PRIVATE }
      );
    }
  }
  const viewerLower = lowerAddress(viewer);
  /**
   * Pola SOL odpowiedzi. Adres odbiorcy widzi tylko autor Aska (zeby zaplacic)
   * i autor odpowiedzi (zeby sprawdzic, dokad pojdzie wyplata) - dla reszty
   * null. Niewazna pieczec odbiorcy = brak adresu (ALARM jest w logu).
   */
  const solanaAnswerFields = (answer: (typeof plan.answers)[number]) => {
    if (!solState || !payees) return {};
    const payee = payees.valid.get(answer.id) ?? null;
    const maySeeAddress = plan.viewerIsAuthor || (viewerLower !== null && lowerAddress(answer.author) === viewerLower);
    return {
      // Z rekordu przyjecia (answerPayoutFacts), nie z pola lustra.
      payoutNetwork: answer.payoutNetwork,
      payoutAddressBound: payee !== null,
      payoutAddress: maySeeAddress && payee ? payee.payee : null,
      // isDocId: buildAskPayoutMemo rzuca na id spoza formatu (dokument spoza serwera).
      ...(plan.viewerIsAuthor && isDocId(answer.id) ? { payoutMemo: buildAskPayoutMemo(askId, answer.id) } : {}),
    };
  };

  const visibleIds = plan.answers.filter((answer) => answer.visible).map((answer) => answer.id);
  let contents: Map<string, string> | null = new Map();
  if (visibleIds.length > 0) {
    contents = await readAnswerContents(visibleIds);
    if (contents === null) {
      // Odczyt padl. Wydanie listy z samymi `null` wygladaloby jak "odpowiedzi
      // sa puste" - i autor Aska rozstrzygnalby na podstawie nieprawdy.
      return NextResponse.json(
        { error: 'Failed to read sealed answers', code: 'content_unavailable' },
        { status: 503, headers: NO_STORE_PRIVATE }
      );
    }
  }
  const resolvedContents = contents;

  return NextResponse.json(
    {
      askId,
      status: plan.status,
      resolved: plan.resolved,
      viewerIsAuthor: plan.viewerIsAuthor,
      // 'sealed' | 'legacy' | 'unverified' - skad pochodzi status i przyjecia.
      trust: plan.trust,
      // Tylko Ask SOL (brak klucza = USDC na Base, ksztalt jak dotad):
      // szyna, klaster i stawka w lamportach ze STANU; platnik autora tylko
      // dla autora (to z niego ma wyjsc przelew - portfel musi sie zgadzac).
      ...(solState && solState.solana
        ? {
            rail: 'sol-solana',
            token: 'SOL',
            network: 'solana',
            solanaCluster: solState.solana.cluster,
            perAnswerLamports: solState.solana.perAnswerLamports,
            ...(plan.viewerIsAuthor ? { solanaPayer: solState.solana.payer } : {}),
          }
        : {}),
      count: plan.answers.length,
      answers: plan.answers.map((answer) => ({
        id: answer.id,
        askId,
        author: answer.author,
        createdAt: answer.createdAt,
        accepted: answer.accepted,
        payoutTxHash: answer.payoutTxHash,
        payoutLogIndex: answer.payoutLogIndex,
        // true tylko z rekordu przyjecia zapisanego przez serwer po dowodzie
        // z lancucha; false przy Asku sprzed pieczeci = "tak mowi dokument".
        payoutVerified: answer.payoutVerified,
        // null = zapieczetowana. Nigdy "" - pusty string czytalby sie jak
        // odpowiedz bez tresci.
        content: answer.visible ? resolvedContents.get(answer.id) ?? null : null,
        sealed: !answer.visible,
        ...solanaAnswerFields(answer),
      })),
    },
    { headers: NO_STORE_PRIVATE }
  );
}
