/**
 * POST /api/unlock  - odblokowuje tresc premium posta po weryfikacji platnosci
 * GET  /api/unlock  - sprawdza, czy dany portfel ma juz odblokowany post
 *
 * DLACZEGO PRZEZ SERWER, A NIE PROSTO Z KLIENTA DO FIRESTORE:
 *  1. cene i adres tworcy bierzemy Z DOKUMENTU POSTA, nie z ciala zadania -
 *     klient nie moze sobie ustalic, ze odblokowanie kosztuje 0.000001,
 *  2. transakcje sprawdzamy na lancuchu (verifyBasePayment); cofnieta
 *     transakcja NIE zapisuje odblokowania,
 *  3. ten sam txHash nie odblokuje dwoch roznych postow (straznik replay).
 *
 * OGRANICZENIE, ktore trzeba znac: projekt nie ma firebase-admin, wiec ta
 * trasa pisze do Firestore tym samym klienckim SDK co przegladarka. Reguly
 * bezpieczenstwa dzialaja wiec tak samo dla obu. Punkt 1-3 chronia sciezke
 * aplikacji, ale dopoki reguly pozwalaja klientowi tworzyc dokumenty w
 * `unlocks`, ktos moze je ominac pisząc do Firestore bezposrednio.
 * Domkniecie tego wymaga konta serwisowego (firebase-admin) i reguly
 * `allow write: if false` - patrz komentarz przy regulach w raporcie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import {
  DEFAULT_UNLOCK_TOKEN,
  isValidAddress,
  isValidAmount,
  isValidTxHash,
  normalizeAddress,
  type MonetizationToken,
} from '../../utils/monetization/types';
import {
  getUnlock,
  isUnlockTxAlreadyUsed,
  saveUnlock,
  unlockDocId,
} from '../../utils/monetization/unlocks';
import { verifyBasePayment } from '../../utils/monetization/verifyPayment';
import { getSessionFromCookies } from '../../utils/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Adres z podpisanej sesji, jesli w ogole jest.
 *
 * Sesje z /api/auth/verify nie sa jeszcze wystawiane (UI logowania nie jest
 * podpiete - patrz komentarz w app/api/auth/verify/route.ts), wiec brak sesji
 * nie moze blokowac odblokowywania. Ale JESLI sesja jest, adres z ciala
 * zadania musi sie z nia zgadzac. Gdy logowanie zostanie wpiete, wystarczy
 * zamienic ten warunek na twarde wymaganie sesji.
 */
function getSessionAddress(request: NextRequest): string | null {
  try {
    return getSessionFromCookies(request.cookies)?.address ?? null;
  } catch {
    // Brak AUTH_SESSION_SECRET - konfiguracja sesji, nie sprawa platnosci.
    return null;
  }
}

interface UnlockRequestBody {
  postId?: unknown;
  walletAddress?: unknown;
  txHash?: unknown;
}

export async function POST(request: NextRequest) {
  let body: UnlockRequestBody;
  try {
    body = (await request.json()) as UnlockRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { postId, walletAddress, txHash } = body;

  if (typeof postId !== 'string' || postId.trim() === '') {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 });
  }
  if (!isValidAddress(walletAddress)) {
    return NextResponse.json({ error: 'walletAddress must be a valid EVM address' }, { status: 400 });
  }
  if (!isValidTxHash(txHash)) {
    return NextResponse.json({ error: 'txHash must be a 32-byte hex transaction hash' }, { status: 400 });
  }

  const sessionAddress = getSessionAddress(request);
  if (sessionAddress && normalizeAddress(sessionAddress) !== normalizeAddress(walletAddress)) {
    return NextResponse.json({ error: 'walletAddress does not match the signed-in session' }, { status: 403 });
  }

  // Cena i odbiorca pochodza z posta - to jedyne zrodlo prawdy.
  let postData: Record<string, unknown>;
  try {
    const snapshot = await getDoc(doc(db, 'posts', postId));
    if (!snapshot.exists()) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    postData = snapshot.data() as Record<string, unknown>;
  } catch (error) {
    console.error('[api/unlock] blad odczytu posta:', error);
    return NextResponse.json({ error: 'Failed to read post' }, { status: 500 });
  }

  const premiumContent = postData.premiumContent;
  const unlockPrice = postData.unlockPrice;
  const creatorAddress = postData.author;

  if (typeof premiumContent !== 'string' || premiumContent.trim() === '') {
    return NextResponse.json({ error: 'This post has no premium content' }, { status: 400 });
  }
  if (!isValidAmount(unlockPrice)) {
    return NextResponse.json({ error: 'This post has no valid unlock price' }, { status: 400 });
  }
  if (!isValidAddress(creatorAddress)) {
    return NextResponse.json({ error: 'Post author address is invalid' }, { status: 400 });
  }

  const token: MonetizationToken =
    postData.unlockToken === 'ETH' || postData.unlockToken === 'USDC'
      ? postData.unlockToken
      : DEFAULT_UNLOCK_TOKEN;

  // Autor nie placi za wlasny post.
  if (normalizeAddress(walletAddress) === normalizeAddress(creatorAddress)) {
    return NextResponse.json({ error: 'The author already has access to their own post' }, { status: 400 });
  }

  const docId = unlockDocId(postId, walletAddress);

  // Ten sam txHash nie moze odblokowac dwoch roznych postow.
  if (await isUnlockTxAlreadyUsed(txHash, docId)) {
    return NextResponse.json({ error: 'This transaction was already used for another unlock' }, { status: 409 });
  }

  const verification = await verifyBasePayment({
    txHash,
    expectedTo: creatorAddress,
    expectedAmount: unlockPrice,
    token,
  });

  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 402 });
  }

  try {
    const unlock = await saveUnlock({
      postId,
      walletAddress,
      creatorAddress,
      amount: unlockPrice,
      token,
      txHash,
      verified: verification.level,
    });
    return NextResponse.json({ success: true, unlock, note: verification.note ?? null });
  } catch (error) {
    console.error('[api/unlock] blad zapisu odblokowania:', error);
    return NextResponse.json({ error: 'Payment verified but saving the unlock failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const postId = request.nextUrl.searchParams.get('postId');
  const walletAddress = request.nextUrl.searchParams.get('wallet');

  if (!postId || !isValidAddress(walletAddress)) {
    return NextResponse.json({ error: 'postId and a valid wallet are required' }, { status: 400 });
  }

  const unlock = await getUnlock(postId, walletAddress);
  return NextResponse.json({ unlocked: !!unlock, unlock: unlock ?? null });
}
