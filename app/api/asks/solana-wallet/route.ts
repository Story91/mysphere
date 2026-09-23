/**
 * /api/asks/solana-wallet - powiazanie portfela Solany z kontem (sesja SIWE).
 *
 * GET  ?solana=<base58>   stan powiazania + challenge do podpisania,
 * GET  (bez parametru)    tylko stan powiazania,
 * POST { solana, challenge, signature | signatureBase64 }
 *                         podpis ed25519 wiadomosci z challenge'u -> zapis.
 *
 * Challenge jest bezstanowy (MAC wiaze konto, portfel, czas i nonce), wiec
 * GET niczego nie zapisuje. Wiadomosc do podpisu serwer i tak odtwarza sam
 * z challenge'u - tekst z przegladarki nigdy nie jest sprawdzany.
 *
 * Tozsamosc = WYLACZNIE sesja. Adres EVM z ciala albo z zapytania nie jest
 * tozsamoscia (inaczej kazdy podpialby swoj portfel pod cudze konto i zbieral
 * jego wyplaty).
 *
 * Kody: session_required 401, store_unavailable 503, invalid_body 400,
 * invalid_address 400, invalid_signature 400, challenge_invalid 400,
 * challenge_expired 400, solana_signature_invalid 400, binding_outdated 409,
 * seal_invalid 503.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { AskError, openAskStore } from '../askStore';
import { sessionAddress } from '../identity';
import { linkSolanaWallet, mintChallenge, parseBindingSignature, readBinding } from '../solanaWalletStore';

// Sesja (node:crypto), ed25519 (node:crypto) i firebase-admin - nie na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_PRIVATE });
}

function fail(error: unknown, context: string) {
  if (error instanceof AskError) return json({ error: error.message, code: error.code, ...(error.details ?? {}) }, error.status);
  console.error(`[api/asks/solana-wallet] ${context}:`, error);
  return json({ error: 'Could not reach wallet storage right now. Nothing was changed.', code: 'store_unavailable' }, 503);
}

/** Powiazanie w odpowiedzi: bez podpisu i nonce - klient ich nie potrzebuje. */
function publicBinding(binding: { evm: string; solana: string; issuedAtMs: number } | null) {
  return binding ? { evm: binding.evm, solana: binding.solana, linkedAtMs: binding.issuedAtMs } : null;
}

export async function GET(request: NextRequest) {
  const session = sessionAddress(request)?.toLowerCase() ?? null;
  if (!session) return json({ error: 'Sign in with your wallet to link a Solana wallet.', code: 'session_required' }, 401);

  const store = await openAskStore();
  if (!store) {
    return json({ error: 'Solana wallets cannot be linked on this deployment right now.', code: 'store_unavailable' }, 503);
  }

  const params = request.nextUrl?.searchParams;
  const solana = params?.get('solana') ?? params?.get('address') ?? null;

  try {
    const binding = await readBinding(store, session);
    if (binding.kind === 'invalid') {
      return json({ error: 'Your linked Solana wallet cannot be verified right now.', code: 'seal_invalid' }, 503);
    }
    const current = publicBinding(binding.kind === 'valid' ? binding.value : null);
    if (solana === null || solana === '') return json({ binding: current });

    // Base58 bez trim-lowercase: wielkosc liter jest czescia adresu.
    const minted = mintChallenge(store, session, solana.trim(), Date.now());
    return json({
      binding: current,
      solana: solana.trim(),
      challenge: minted.challenge,
      message: minted.message,
      nonce: minted.nonce,
      issuedAtMs: minted.issuedAtMs,
      expiresAtMs: minted.expiresAtMs,
    });
  } catch (error) {
    return fail(error, 'Odczyt powiazania / challenge nie powiodl sie');
  }
}

export async function POST(request: NextRequest) {
  const session = sessionAddress(request)?.toLowerCase() ?? null;
  if (!session) return json({ error: 'Sign in with your wallet to link a Solana wallet.', code: 'session_required' }, 401);

  const store = await openAskStore();
  if (!store) {
    return json({ error: 'Solana wallets cannot be linked on this deployment right now.', code: 'store_unavailable' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body', code: 'invalid_body' }, 400);
  }

  try {
    const linked = await linkSolanaWallet(store, {
      evm: session,
      solana: typeof body.solana === 'string' ? body.solana.trim() : body.solana,
      challenge: body.challenge,
      signature: parseBindingSignature(body),
      nowMs: Date.now(),
    });
    return json({ linked: true, created: linked.created, binding: publicBinding(linked.binding) });
  } catch (error) {
    return fail(error, 'Zapis powiazania nie powiodl sie');
  }
}
