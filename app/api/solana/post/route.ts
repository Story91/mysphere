/**
 * POST /api/solana/post - zapis posta z Solany.
 *
 * Posty z innych sieci zapisuje przegladarka (createPost). Post z Solany
 * zapisuje WYLACZNIE ta trasa, bo od jego pola `txHash` zalezy, na czyj
 * portfel ida napiwki i platne odpowiedzi - a kolekcja `posts` jest dzis
 * zapisywalna dla kazdego (szczegoly: app/utils/solana/receiptRegistry.ts).
 *
 * Z zadania bierzemy tresc, media, ID posta i podpis transakcji. Reszte serwer
 * ustala sam:
 *   - autor: z podpisanej sesji SIWE (adres z zadania musi sie z nia zgadzac,
 *     sluzy tylko za pisownie, pod ktora istnieje profil),
 *   - portfel Solany: platnik transakcji, ktorej memo niesie TO ID posta
 *     i TE tresc,
 *   - czas: z bloku; transakcja starsza niz 30 minut nie zalozy posta.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { getAddress, isAddress } from 'viem';
import { getSessionFromCookies } from '../../../utils/auth/session';
import { createSolanaPost } from '../../../utils/solana/receiptRegistry';
import { SOLANA_RPC_URL, isValidPostId } from '../../../basechat/Solana/config/solanaChain';
import { isSolanaSignature } from '../../../basechat/Solana/replies/replyCore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CONTENT = 10_000;
const MAX_URL = 2048;
const MAX_TRACK_JSON = 8_000;

function sessionAddress(request: NextRequest): string | null {
  try {
    return getSessionFromCookies(request.cookies)?.address ?? null;
  } catch {
    return null;
  }
}

/** Link do wgranego pliku albo null. Nic poza https nie trafia do posta. */
function mediaUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_URL) return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Utwor ze Spotify - obiekt JSON rozsadnej wielkosci albo null. */
function musicTrack(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  const json = JSON.stringify(value);
  if (json.length > MAX_TRACK_JSON) return undefined;
  const track = JSON.parse(json) as Record<string, unknown>;
  return typeof track.id === 'string' && typeof track.name === 'string' ? track : undefined;
}

function fail(status: number, error: string, reason: string) {
  return NextResponse.json({ ok: false, reason, error }, { status });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'Invalid request.', 'bad-request');
  }

  const { postId, signature, content, author } = body;
  const image = mediaUrl(body.image);
  const video = mediaUrl(body.video);
  const track = musicTrack(body.musicTrack);

  if (
    !isValidPostId(postId) ||
    !isSolanaSignature(signature) ||
    typeof content !== 'string' ||
    !content.trim() ||
    content.length > MAX_CONTENT ||
    typeof author !== 'string' ||
    !isAddress(author) ||
    image === undefined ||
    video === undefined ||
    track === undefined
  ) {
    return fail(400, 'Invalid post.', 'bad-request');
  }

  const session = sessionAddress(request);
  if (!session) {
    return fail(401, 'Sign in with your wallet to save this post. Your Solana transaction is kept - try again after signing in.', 'no-session');
  }
  if (session.toLowerCase() !== author.toLowerCase()) {
    return fail(403, 'The connected wallet is not the one you signed in with.', 'wrong-author');
  }

  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  try {
    // Klient zapisuje post zaraz po potwierdzeniu - RPC serwera moze jeszcze
    // nie znac transakcji. Kilka krotkich prob zamiast jednej.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500));
      const result = await createSolanaPost(connection, {
        postId,
        signature,
        content,
        author: getAddress(author),
        image,
        video,
        musicTrack: track,
      });
      if (result.ok) {
        return NextResponse.json({ ok: true, postId: result.postId, signer: result.signer, already: result.already });
      }
      switch (result.reason) {
        case 'tx-missing':
          continue;
        case 'unavailable':
          return fail(503, 'Solana posts cannot be saved right now. Your transaction is kept - try again later.', result.reason);
        case 'failed-tx':
          return fail(400, 'This transaction failed on Solana, so there is no post to save.', result.reason);
        case 'stale':
          return fail(400, 'This transaction is too old to publish a new post. Post again.', result.reason);
        case 'conflict':
          return fail(409, 'This post already exists with a different transaction.', result.reason);
        default:
          return fail(400, 'The transaction does not match this post.', result.reason);
      }
    }
    return fail(202, 'Solana has not confirmed the transaction to our server yet. Try again in a moment.', 'tx-missing');
  } catch (error) {
    console.error('[api/solana/post] Zapis posta nie powiodl sie:', error);
    return fail(502, 'Saving the post failed. Your transaction is kept - try again in a moment.', 'error');
  }
}
