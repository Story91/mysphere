/**
 * POST /api/solana/reply-moderation - usuniecie platnej odpowiedzi z X.
 *
 * Platna odpowiedz (dokument `comments/{podpis}` z `tipLamports`) zapisuje
 * wylacznie serwer, a reguly Firestore nie pozwalaja jej skasowac
 * przegladarce - inaczej kazdy moglby zdjac cudza, oplacona odpowiedz.
 * Przez to admin i autor posta tez nie mieli jak jej usunac: przycisk
 * w feedzie konczyl sie odmowa regul. Ta trasa jest jedyna droga.
 *
 * Cialo: { commentId }. Wszystko inne serwer ustala sam:
 *   - kto pyta: z podpisanej sesji SIWE (httpOnly cookie), nigdy z zadania,
 *   - do jakiego posta nalezy odpowiedz: z pola `postId` dokumentu, ktore
 *     zapisal serwer,
 *   - kto jest autorem posta: z rejestru kwitow (receipt.author), NIE
 *     z `posts.author`, bo dokument posta zapisuje kazda przegladarka.
 *
 * Wolno: adminowi (ADMIN_ADDRESS) albo zarejestrowanemu autorowi posta.
 * Kazdy blad po drodze (sesja, rejestr, Firestore) konczy sie odmowa.
 *
 * Razem z odpowiedzia znikaja odpowiedzi na nia (tak jak w deleteComment
 * i w optymistycznym usunieciu w PostList), a licznik posta schodzi o tyle
 * samo, z clampem do zera. Kopie z tablicy `posts/{id}.comments` pod tym ID
 * albo wiszace pod nim to podrobki (platna odpowiedz nigdy tam nie lezy) -
 * zdejmujemy je bez ruszania licznika, bo licznik ich nigdy nie liczyl.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '../../../utils/auth/session';
import { getAdminDb } from '../../../utils/auth/firebaseAdmin';
import { resolveRegisteredReceipt } from '../../../utils/solana/receiptRegistry';
import { isAdminAddress, isModerationCommentId, isPaidReplyData, mayModeratePaidReply } from '../../../utils/solana/moderation';
import { isValidPostId } from '../../../basechat/Solana/config/solanaChain';

// getSessionFromCookies i rejestr kwitow uzywaja node:crypto.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

type SessionCheck = { address: string } | { missing: true } | { broken: true };

function readSession(request: NextRequest): SessionCheck {
  try {
    const session = getSessionFromCookies(request.cookies);
    return session ? { address: session.address } : { missing: true };
  } catch (error) {
    // Najczestszy powod: brak AUTH_SESSION_SECRET. Blad konfiguracji ma
    // znaczyc "nie wpuszczam", nigdy "wpuszczam".
    console.error('[api/solana/reply-moderation] Nie da sie sprawdzic sesji:', error);
    return { broken: true };
  }
}

/** Wynik transakcji - status HTTP dobiera handler. */
type Outcome =
  | { ok: true }
  | { ok: false; kind: 'missing' | 'not-paid' | 'moved' };

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'Invalid request.');
  }
  const { commentId } = body ?? {};
  if (!isModerationCommentId(commentId)) {
    return fail(400, 'Invalid comment id.');
  }

  const session = readSession(request);
  if ('broken' in session) {
    return fail(503, 'Moderation is unavailable right now. Try again later.');
  }
  if ('missing' in session) {
    return fail(401, 'Sign in with your wallet to remove this paid reply.');
  }

  const db = await getAdminDb();
  if (!db) {
    return fail(503, 'Moderation is unavailable right now. Try again later.');
  }

  const commentRef = db.collection('comments').doc(commentId);

  // --- Kto pyta i czy mu wolno ---------------------------------------------
  // Odczyt przed transakcja, bo do sprawdzenia autora potrzebny jest postId
  // z dokumentu, a rejestr kwitow czyta Firestore sam. W transakcji nizej
  // sprawdzamy jeszcze raz, ze dokument sie w miedzyczasie nie zmienil.
  let postId: string | null;
  try {
    const snap = await commentRef.get();
    if (!snap.exists) return fail(404, 'This reply no longer exists.');
    const data = snap.data() ?? {};
    if (!isPaidReplyData(data)) {
      return fail(400, 'Not a paid reply - delete it normally.');
    }
    postId = typeof data.postId === 'string' && data.postId ? data.postId : null;

    if (!isAdminAddress(session.address)) {
      // Autor posta tylko dla posta z poprawnym ID - inne ID nie trafia do
      // rejestru, a do sciezki dokumentu tym bardziej.
      if (!postId || !isValidPostId(postId)) {
        return fail(403, 'Only the admin or the author of this post can remove this reply.');
      }
      const resolved = await resolveRegisteredReceipt(postId);
      if (!resolved.ok) {
        if (resolved.reason === 'unavailable') {
          return fail(503, 'Moderation is unavailable right now. Try again later.');
        }
        // unregistered / tampered / wrong-cluster / post-missing / not-solana:
        // nie wiemy, kto jest autorem posta - zostaje tylko admin.
        return fail(403, 'Only the admin or the author of this post can remove this reply.');
      }
      if (!resolved.receipt.author.trim()) {
        // Kwit z migracji (post sprzed memo v2) nie zna autora, wiec poza
        // adminem nie ma kogo wpuscic. Osobny komunikat: prawdziwy autor
        // dostalby inaczej "tylko autor moze", czyli odmowe bez sensu.
        return fail(403, "This post's author could not be verified. Ask the admin to remove this reply.");
      }
      if (!mayModeratePaidReply(session.address, resolved.receipt.author)) {
        return fail(403, 'Only the admin or the author of this post can remove this reply.');
      }
    }
  } catch (error) {
    console.error('[api/solana/reply-moderation] Sprawdzenie uprawnien nie powiodlo sie:', error);
    return fail(503, 'Moderation is unavailable right now. Try again later.');
  }

  // --- Usuniecie ------------------------------------------------------------
  const postRef = postId && isValidPostId(postId) ? db.collection('posts').doc(postId) : null;
  const repliesQuery = postId
    ? db.collection('comments').where('postId', '==', postId).where('replyTo', '==', commentId)
    : null;

  let outcome: Outcome;
  try {
    outcome = await db.runTransaction(async (t): Promise<Outcome> => {
      // Wszystkie odczyty przed pierwszym zapisem - wymog transakcji.
      const fresh = await t.get(commentRef);
      const postSnap = postRef ? await t.get(postRef) : null;
      const repliesSnap = repliesQuery ? await t.get(repliesQuery) : null;

      if (!fresh.exists) return { ok: false, kind: 'missing' };
      const freshData = fresh.data() ?? {};
      if (!isPaidReplyData(freshData)) return { ok: false, kind: 'not-paid' };
      // Uprawnienie sprawdzilismy dla TEGO posta. Gdyby dokument wskazywal
      // teraz inny, zgoda nie obejmuje nowego - niech wolajacy sprobuje znowu.
      const freshPostId = typeof freshData.postId === 'string' && freshData.postId ? freshData.postId : null;
      if (freshPostId !== postId) return { ok: false, kind: 'moved' };

      t.delete(commentRef);
      const replyIds = new Set<string>();
      for (const reply of repliesSnap?.docs ?? []) {
        if (reply.id === commentId) continue;
        replyIds.add(reply.id);
        t.delete(reply.ref);
      }

      if (postRef && postSnap?.exists) {
        const post = postSnap.data() ?? {};
        const legacy: unknown[] = Array.isArray(post.comments) ? post.comments : [];
        // Clamp liczony z odczytu, a nie FieldValue.increment: licznik po
        // podwojnym usunieciu albo recznej poprawce nie moze zejsc ponizej zera.
        const current =
          typeof post.commentsCount === 'number' && Number.isFinite(post.commentsCount)
            ? post.commentsCount
            : legacy.length;
        const update: { commentsCount: number; comments?: unknown[] } = {
          commentsCount: Math.max(0, current - (1 + replyIds.size)),
        };
        const cleaned = legacy.filter(entry => {
          if (typeof entry !== 'object' || entry === null) return true;
          const { id, replyTo } = entry as { id?: unknown; replyTo?: unknown };
          return id !== commentId && replyTo !== commentId;
        });
        if (cleaned.length !== legacy.length) update.comments = cleaned;
        t.update(postRef, update);
      }
      return { ok: true };
    });
  } catch (error) {
    console.error('[api/solana/reply-moderation] Usuniecie nie powiodlo sie:', error);
    return fail(503, 'Removing the reply failed. Try again in a moment.');
  }

  if (!outcome.ok) {
    switch (outcome.kind) {
      case 'missing':
        return fail(404, 'This reply no longer exists.');
      case 'not-paid':
        return fail(400, 'Not a paid reply - delete it normally.');
      default:
        return fail(409, 'This reply changed while it was being removed. Try again.');
    }
  }

  console.info(`[api/solana/reply-moderation] ${session.address} usunal platna odpowiedz ${commentId} (post ${postId ?? '-'})`);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
