/**
 * POST /api/asks/create - zalozenie Aska przez czlowieka z sesja SIWE.
 *
 * === PO CO TA TRASA ===
 * Do tej pory przegladarka zapisywala asks/{id} klienckim SDK: autor to byl
 * adres z wagmi (nic go nie dowodzilo), a 'escrowed' wystarczylo podeprzec
 * dowolnym 66-znakowym napisem. Teraz Aska zapisuje WYLACZNIE serwer (admin
 * SDK) razem z zapieczetowanym stanem asks/{id}/sealed/state:
 *   - autor = adres z podpisanej sesji, nigdy z ciala zadania,
 *   - 'escrowed' = log AskFunded z paragonu fund, zgodny ze szkicem co do
 *     jednostki i sekundy (verifyAskFunded), warunki escrow z LANCUCHA.
 *
 * === DWA WARIANTY ===
 *   { funding: 'on-resolve', question, budget, seats, durationMs }
 *       id nadaje serwer (tx.create), termin = teraz + durationMs, 201.
 *   { funding: 'escrowed', askId, fundTxHash, question, budget, seats, deadlineMs }
 *       id wybral klient PRZED fund (keccak(id) jest askId na lancuchu).
 *       201 - zapisany, 200 - ponowienie zapisu, ktory juz sie udal,
 *       409 { retryable: true } fund_not_visible - RPC jeszcze nie widzi paragonu.
 *
 * === PRZEJECIE CUDZEGO ID (dlaczego escrow ma decyzje w transakcji) ===
 * fund() kluczuje depozyt po keccak(msg.sender, askId) i przyjmuje DOWOLNY
 * askId. Kazdy moze wiec sfinansowac cudze, publiczne id ze swojego portfela
 * i przyjsc tu ze swoja sesja - verifyAskFunded to potwierdzi. Dlatego
 * istniejacy stan albo cudzy dokument koncza sie 409 ask_exists
 * (decideEscrowedCreate w app/utils/asks/askCreateCore.ts), nigdy nadpisaniem.
 *
 * Trasa x402 dla agentow zostaje osobno (POST /api/asks) - tam tozsamoscia
 * moze byc tez podpis platnosci, a escrow nie ma (patrz naglowek tamtej trasy).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { publicAsk } from '../../../utils/asks/askCreateCore';
import { AskError, createSealedAsk, openAskStore, type AskStore } from '../askStore';
import {
  commitEscrowedAsk,
  validateAskDraft,
  validateDurationMs,
  validateEscrowFields,
  type AskDraftFields,
} from '../draft';
import { verifyAskFunded } from '../escrowProof';
import { sessionAddress } from '../identity';

// Sesja (node:crypto), firebase-admin i RPC Base - nic z tego nie dziala na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_PRIVATE });
}

/** AskError z magazynu -> odpowiedz; kazdy inny blad -> 500 bez szczegolow. */
function errorResponse(error: unknown, context: string) {
  if (error instanceof AskError) {
    return json({ error: error.message, code: error.code, ...(error.details ?? {}) }, error.status);
  }
  console.error(`[api/asks/create] ${context}:`, error);
  return json({ error: 'Failed to create Ask', code: 'ask_write_failed' }, 500);
}

/**
 * GET /api/asks/create - czy TO wdrozenie zapisze Aska dla tej sesji.
 *
 * Klient pyta ZANIM zablokuje budzet w escrow: 503 store_unavailable po
 * depozycie oznacza pieniadze w kontrakcie bez Aska na tym wdrozeniu (i bez
 * przycisku Recover na /money, ktory czyta dokumenty Askow). Niczego nie
 * zapisuje ani nie czyta z Firestore poza otwarciem klienta.
 */
export async function GET(request: NextRequest) {
  const session = sessionAddress(request)?.toLowerCase() ?? null;
  if (!session) {
    return json({ available: false, error: 'Sign in with your wallet to post an Ask.', code: 'session_required' }, 401);
  }
  const store = await openAskStore();
  if (!store) {
    return json(
      {
        available: false,
        error: 'Asks cannot be created on this deployment right now. Nothing was charged.',
        code: 'store_unavailable',
      },
      503
    );
  }
  return json({ available: true }, 200);
}

export async function POST(request: NextRequest) {
  // Sesja PRZED wszystkim innym: bez niej nie wiemy, czyj to Ask, a adres
  // z ciala zadania nie jest tozsamoscia.
  const session = sessionAddress(request)?.toLowerCase() ?? null;
  if (!session) {
    return json({ error: 'Sign in with your wallet to post an Ask.', code: 'session_required' }, 401);
  }

  // Bez admin SDK i klucza pieczeci nie zapiszemy Aska tak, zeby dalo sie mu
  // ufac - odmowa zamiast zapisu bez pieczeci.
  const store = await openAskStore();
  if (!store) {
    return json(
      { error: 'Asks cannot be created on this deployment right now. Nothing was saved.', code: 'store_unavailable' },
      503
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body', code: 'invalid_body' }, 400);
  }

  const draft = validateAskDraft(body);
  if (!draft.ok) return json(draft.refusal.body, draft.refusal.status);

  if (body.funding === 'escrowed') return createEscrowed(store, session, body, draft.value);
  if (body.funding !== undefined && body.funding !== 'on-resolve') {
    return json({ error: "funding must be 'on-resolve' or 'escrowed'", code: 'invalid_funding' }, 400);
  }
  return createOnResolve(store, session, body, draft.value);
}

/* ------------------------------------------------------------------ */
/*  ON-RESOLVE: id i termin nadaje serwer                              */
/* ------------------------------------------------------------------ */

async function createOnResolve(
  store: AskStore,
  session: string,
  body: Record<string, unknown>,
  draft: AskDraftFields
) {
  const duration = validateDurationMs(body.durationMs);
  if (!duration.ok) return json(duration.refusal.body, duration.refusal.status);

  try {
    const created = await createSealedAsk(store, {
      author: session,
      origin: 'session',
      question: draft.question,
      budget: draft.budget,
      seats: draft.seats,
      // Termin z zegara SERWERA - klient podaje tylko czas trwania z listy.
      deadline: Date.now() + duration.value,
    });
    return json({ ask: publicAsk(created.ask), created: true }, 201);
  } catch (error) {
    return errorResponse(error, 'Zapis Aska on-resolve nie powiodl sie');
  }
}

/* ------------------------------------------------------------------ */
/*  ESCROWED: dowod z lancucha + decyzja o id w transakcji             */
/* ------------------------------------------------------------------ */

async function createEscrowed(
  store: AskStore,
  session: string,
  body: Record<string, unknown>,
  draft: AskDraftFields
) {
  const fields = validateEscrowFields(body);
  if (!fields.ok) return json(fields.refusal.body, fields.refusal.status);
  const { askId, fundTxHash, deadlineMs } = fields.value;

  // RPC POZA transakcja. Autor = sesja: depozyt z innego portfela ma inny
  // klucz i tu nie przejdzie. Warunki escrow bierzemy z logu, nie ze szkicu.
  const funded = await verifyAskFunded({
    author: session,
    askId,
    fundTxHash,
    budget: draft.budget,
    seats: draft.seats,
    deadlineMs,
  });
  if (!funded.ok) {
    const status = funded.code === 'escrow_unavailable' ? 503 : 409;
    return json(
      {
        error: funded.error,
        code: funded.code,
        retryable: funded.retryable,
        ...(funded.mismatches ? { mismatches: funded.mismatches } : {}),
      },
      status
    );
  }

  // Termin z LANCUCHA (sekundy -> ms). Szkic zgadza sie z nim co do sekundy,
  // ale gdyby aplikacja liczyla od ms szkicu, przez ulamek sekundy uznawalaby
  // za "przed terminem" chwile, ktora kontrakt uznaje juz za po terminie.
  const deadline = Number(funded.event.deadline) * 1000;

  try {
    const result = await commitEscrowedAsk(store, { askId, session, draft, escrow: funded.escrow, deadline });
    return json({ ask: publicAsk(result.ask), created: result.created }, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof AskError && error.code === 'ask_exists') {
      // Slad do analizy: fund pod cudzym id to wzorzec proby przejecia.
      console.warn(
        `[api/asks/create] Odmowa ask_exists: sesja ${session} probowala zajac Aska ${askId} (fund ${fundTxHash}).`
      );
    }
    return errorResponse(error, `Zapis Aska z escrow ${askId} nie powiodl sie (fund ${fundTxHash})`);
  }
}
