/**
 * POST /api/asks/[id]/payee { answerId } - odpowiadajacy na Ask SOL zamraza
 * odbiorce swojej odpowiedzi z powiazanego portfela Solany.
 *
 * Potrzebne, gdy ktos odpowiedzial ZANIM powiazal portfel (serwer na to
 * pozwala, ale wyplata jest zablokowana do powiazania). Przy odpowiedzi
 * z juz powiazanym portfelem odbiorca zamraza sie sam (answerStore.saveAnswer).
 *
 * Odbiorca jest niezmienny (tx.create): zmiana portfela dziala tylko na
 * przyszle odpowiedzi - przejete konto EVM nie przekieruje wyplaty za juz
 * napisana odpowiedz.
 *
 * Odpowiedz 200: { askId, answerId, payoutAddress, frozenAtMs, created }.
 * Kody: invalid_id 400, invalid_body 400, session_required 401,
 * store_unavailable 503, ask_not_found 404, seal_invalid 503, wrong_rail 409,
 * answer_not_found 404, not_answer_author 403, ask_resolved 409,
 * solana_wallet_required 409, payee_locked 409 (+ payoutAddress),
 * payee_is_author_wallet 409.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { lowerAddress } from '../../../../utils/asks/askSealCore';
import { AskError, isDocId, openAskStore } from '../../askStore';
import { sessionAddress } from '../../identity';
import { freezeAnswerPayee } from '../../solanaWalletStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

function fail(status: number, code: string, error: string, details?: Record<string, unknown>) {
  return NextResponse.json({ error, code, ...(details ?? {}) }, { status, headers: NO_STORE_PRIVATE });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const askId = params.id;
  if (!isDocId(askId)) return fail(400, 'invalid_id', 'Invalid Ask id.');

  const viewer = lowerAddress(sessionAddress(request));
  if (!viewer) return fail(401, 'session_required', 'Sign in with your wallet to set your payout address.');

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'invalid_body', 'Invalid JSON body');
  }
  const answerId = typeof body.answerId === 'string' ? body.answerId.trim() : '';
  if (!isDocId(answerId)) return fail(400, 'invalid_id', 'Missing or invalid answerId.');

  const store = await openAskStore();
  if (!store) return fail(503, 'store_unavailable', 'Ask storage is not configured on this deployment. Nothing was changed.');

  try {
    const frozen = await freezeAnswerPayee(store, { askId, answerId, viewer, nowMs: Date.now() });
    return NextResponse.json(
      {
        askId,
        answerId,
        payoutAddress: frozen.payee.payee,
        frozenAtMs: frozen.payee.frozenAtMs,
        created: frozen.created,
      },
      { headers: NO_STORE_PRIVATE }
    );
  } catch (error) {
    if (error instanceof AskError) return fail(error.status, error.code, error.message, error.details);
    // Przegrany wyscig tx.create albo awaria Firestore - transakcja atomowa.
    console.error('[api/asks/payee] Zamrozenie odbiorcy nie powiodlo sie:', error);
    return fail(503, 'store_unavailable', 'Could not save your payout address right now. Nothing was changed - retry.');
  }
}
