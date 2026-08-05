/**
 * POST /api/premium - autor zapisuje tresc premium i oznacza post jako platny
 * GET  /api/premium?postId=... - czytelnik pobiera tresc, gdy ma do niej prawo
 *
 * PO CO TA TRASA ISTNIEJE. Tresc premium siedziala w dokumencie posta, a feed
 * czyta posty bezposrednio z Firestore klienckim SDK - kazdy, kto zajrzal w
 * odpowiedz sieciowa, widzial platna tresc bez placenia. Paywall byl zaslona w
 * UI, nie zabezpieczeniem.
 *
 * Teraz tresc mieszka w kolekcji `premiumContent`, do ktorej klient nie ma
 * dostepu wcale (`allow read, write: if false`). Wydaje ja wylacznie ta trasa,
 * po sprawdzeniu dwoch rzeczy: KIM jestes (podpisana sesja SIWE) i CZY masz
 * prawo (rekord w `unlocks` albo autorstwo posta).
 *
 * DLACZEGO SESJA JEST TU WYMAGANA, a w /api/unlock nie:
 * /api/unlock weryfikuje platnosc na lancuchu - transakcja sama w sobie jest
 * dowodem. Tutaj dowodu nie ma: bez sesji klient moglby podac adres kogos, kto
 * zaplacil, i dostac cudza tresc. Adres z ciala zadania nie jest tozsamoscia.
 * Kto nie podpisal, nie czyta platnej tresci - i dostaje o tym jasny komunikat.
 */

import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { getSessionFromCookies } from '../../utils/auth/session';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';
import { isValidAddress, isValidAmount, normalizeAddress, DEFAULT_UNLOCK_TOKEN } from '../../utils/monetization/types';
import { getUnlock } from '../../utils/monetization/unlocks';
import {
  isPremiumStoreAvailable,
  readPremiumContent,
  savePremiumContent,
} from '../../utils/monetization/premiumStore';

// getSessionFromCookies uzywa node:crypto, firebase-admin nie dziala na edge
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Gorna granica dlugosci tresci premium - ten sam limit co w kompozytorze. */
const MAX_PREMIUM_LENGTH = 5000;

/**
 * Adres z podpisanej sesji albo null.
 *
 * Blad odczytu (najczesciej brak AUTH_SESSION_SECRET) traktujemy jak brak
 * sesji. Failujemy zamknieto: brak konfiguracji ma oznaczac "nie wiem, kto to",
 * nigdy "wpusc".
 */
function sessionAddress(request: NextRequest): string | null {
  try {
    return getSessionFromCookies(request.cookies)?.address ?? null;
  } catch {
    return null;
  }
}

/** Odczyt dokumentu posta. Zwraca null, gdy posta nie ma. */
async function readPost(postId: string): Promise<Record<string, unknown> | null> {
  const snapshot = await getDoc(doc(db, 'posts', postId));
  return snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : null;
}

const NEEDS_SIGN_IN = {
  error: 'Sign in with your wallet to access premium content.',
  code: 'session_required',
} as const;

/* ------------------------------------------------------------------ */
/* GET - wydanie tresci                                                */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const postId = request.nextUrl.searchParams.get('postId')?.trim();
  if (!postId) {
    return NextResponse.json({ error: 'Missing postId' }, { status: 400 });
  }

  const viewer = sessionAddress(request);
  if (!viewer) {
    return NextResponse.json(NEEDS_SIGN_IN, { status: 401 });
  }

  let post: Record<string, unknown> | null;
  try {
    post = await readPost(postId);
  } catch (error) {
    console.error('[api/premium] blad odczytu posta:', error);
    return NextResponse.json({ error: 'Failed to read post' }, { status: 500 });
  }

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const author = post.author;
  const isAuthor =
    typeof author === 'string' && normalizeAddress(author) === normalizeAddress(viewer);

  if (!isAuthor) {
    // Rekord odblokowania powstaje wylacznie w /api/unlock, po weryfikacji
    // transakcji na lancuchu. To jest jedyne prawo dostepu poza autorstwem.
    let unlocked = false;
    try {
      unlocked = (await getUnlock(postId, viewer)) !== null;
    } catch (error) {
      console.error('[api/premium] blad odczytu odblokowania:', error);
      return NextResponse.json({ error: 'Failed to check access' }, { status: 500 });
    }

    if (!unlocked) {
      return NextResponse.json({ error: 'This post is not unlocked for you' }, { status: 403 });
    }
  }

  const content = await readPremiumContent(postId, post.premiumContent);
  if (content === null) {
    return NextResponse.json({ error: 'This post has no premium content' }, { status: 404 });
  }

  return NextResponse.json({ postId, content });
}

/* ------------------------------------------------------------------ */
/* POST - zapis tresci przez autora                                    */
/* ------------------------------------------------------------------ */

interface StoreBody {
  postId?: unknown;
  content?: unknown;
  unlockPrice?: unknown;
  unlockToken?: unknown;
}

export async function POST(request: NextRequest) {
  if (!isPremiumStoreAvailable()) {
    // Bez konta uslugowego nie da sie zapisac tresci poza zasiegiem klienta.
    // Odmawiamy zamiast zapisac ja tam, gdzie kazdy ja przeczyta.
    return NextResponse.json(
      {
        error: 'Premium content storage is not configured on this deployment.',
        code: 'store_unavailable',
      },
      { status: 503 }
    );
  }

  const author = sessionAddress(request);
  if (!author) {
    return NextResponse.json(NEEDS_SIGN_IN, { status: 401 });
  }

  let body: StoreBody;
  try {
    body = (await request.json()) as StoreBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const postId = typeof body.postId === 'string' ? body.postId.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  const unlockPrice = body.unlockPrice;

  if (!postId) {
    return NextResponse.json({ error: 'Missing postId' }, { status: 400 });
  }
  if (!content) {
    return NextResponse.json({ error: 'Missing premium content' }, { status: 400 });
  }
  if (content.length > MAX_PREMIUM_LENGTH) {
    return NextResponse.json(
      { error: `Premium content is limited to ${MAX_PREMIUM_LENGTH} characters` },
      { status: 400 }
    );
  }
  if (!isValidAmount(unlockPrice)) {
    return NextResponse.json({ error: 'Invalid unlock price' }, { status: 400 });
  }

  let post: Record<string, unknown> | null;
  try {
    post = await readPost(postId);
  } catch (error) {
    console.error('[api/premium] blad odczytu posta:', error);
    return NextResponse.json({ error: 'Failed to read post' }, { status: 500 });
  }

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const postAuthor = post.author;
  if (!isValidAddress(postAuthor) || normalizeAddress(postAuthor) !== normalizeAddress(author)) {
    return NextResponse.json({ error: 'Only the author can price this post' }, { status: 403 });
  }

  const stored = await savePremiumContent({ postId, author, content });
  if (!stored) {
    return NextResponse.json({ error: 'Failed to store premium content' }, { status: 500 });
  }

  // Post oznaczamy jako platny DOPIERO po udanym zapisie tresci. Odwrotna
  // kolejnosc dawalaby paywall nad pustka: cena jest, tresci nie ma.
  const unlockToken = body.unlockToken === 'ETH' || body.unlockToken === 'USDC'
    ? body.unlockToken
    : DEFAULT_UNLOCK_TOKEN;

  const adminDb = getAdminDb();
  if (!adminDb) {
    return NextResponse.json({ error: 'Failed to mark post as premium' }, { status: 500 });
  }

  try {
    await adminDb.collection('posts').doc(postId).update({
      hasPremium: true,
      unlockPrice,
      unlockToken,
      // Stare posty trzymaly tresc tutaj. Gdy autor edytuje taki post, pole
      // znika z dokumentu - tresc zyje juz wylacznie w kolekcji poza zasiegiem
      // klienta.
      premiumContent: (await import('firebase-admin/firestore')).FieldValue.delete(),
    });
  } catch (error) {
    console.error('[api/premium] blad oznaczania posta jako platnego:', error);
    return NextResponse.json({ error: 'Failed to mark post as premium' }, { status: 500 });
  }

  return NextResponse.json({ postId, hasPremium: true, unlockPrice, unlockToken });
}
