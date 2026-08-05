/**
 * POST /api/unlock/subscription - zapisuje wsparcie tworcy po weryfikacji platnosci
 * GET  /api/unlock/subscription - sprawdza aktywne wsparcie (subscriber + creator)
 *
 * To NIE jest subskrypcja odnawialna. Jedna platnosc z gory kupuje N dni
 * dostepu i po `expiresAt` dostep po prostu gasnie. Zadnego automatycznego
 * odnowienia nie ma i nie moze byc bez spend permissions albo subskrypcji
 * x402 - szczegoly w app/utils/monetization/subscriptions.ts.
 *
 * Cena NIE pochodzi z ciala zadania - serwer liczy ja sam z (tier, periods),
 * zeby klient nie mogl kupic poziomu Patron za jednego centa.
 *
 * Ograniczenie z brakiem firebase-admin jest takie samo jak w ../route.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SUBSCRIPTION_PERIOD_CHOICES,
  SUBSCRIPTION_TIERS,
  isSubscriptionActive,
  isValidAddress,
  isValidTxHash,
  normalizeAddress,
  type SubscriptionTierId,
} from '../../../utils/monetization/types';
import {
  getSubscription,
  getSubscriptionDays,
  getSubscriptionPrice,
  isSubscriptionTxAlreadyUsed,
  saveSubscription,
  subscriptionDocId,
} from '../../../utils/monetization/subscriptions';
import { verifyBasePayment } from '../../../utils/monetization/verifyPayment';
import { getSessionFromCookies } from '../../../utils/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Patrz komentarz przy tej samej funkcji w ../route.ts. */
function getSessionAddress(request: NextRequest): string | null {
  try {
    return getSessionFromCookies(request.cookies)?.address ?? null;
  } catch {
    return null;
  }
}

interface SubscriptionRequestBody {
  subscriberAddress?: unknown;
  creatorAddress?: unknown;
  tier?: unknown;
  periods?: unknown;
  txHash?: unknown;
}

function isTierId(value: unknown): value is SubscriptionTierId {
  return typeof value === 'string' && SUBSCRIPTION_TIERS.some(t => t.id === value);
}

export async function POST(request: NextRequest) {
  let body: SubscriptionRequestBody;
  try {
    body = (await request.json()) as SubscriptionRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { subscriberAddress, creatorAddress, tier, periods, txHash } = body;

  if (!isValidAddress(subscriberAddress)) {
    return NextResponse.json({ error: 'subscriberAddress must be a valid EVM address' }, { status: 400 });
  }
  if (!isValidAddress(creatorAddress)) {
    return NextResponse.json({ error: 'creatorAddress must be a valid EVM address' }, { status: 400 });
  }
  if (normalizeAddress(subscriberAddress) === normalizeAddress(creatorAddress)) {
    return NextResponse.json({ error: 'You cannot support yourself' }, { status: 400 });
  }
  if (!isTierId(tier)) {
    return NextResponse.json({ error: 'tier must be one of: supporter, insider, patron' }, { status: 400 });
  }
  if (typeof periods !== 'number' || !SUBSCRIPTION_PERIOD_CHOICES.includes(periods)) {
    return NextResponse.json(
      { error: `periods must be one of: ${SUBSCRIPTION_PERIOD_CHOICES.join(', ')}` },
      { status: 400 }
    );
  }
  if (!isValidTxHash(txHash)) {
    return NextResponse.json({ error: 'txHash must be a 32-byte hex transaction hash' }, { status: 400 });
  }

  const sessionAddress = getSessionAddress(request);
  if (sessionAddress && normalizeAddress(sessionAddress) !== normalizeAddress(subscriberAddress)) {
    return NextResponse.json({ error: 'subscriberAddress does not match the signed-in session' }, { status: 403 });
  }

  // Cena liczona po stronie serwera - cennik jest jedynym zrodlem prawdy.
  const amount = getSubscriptionPrice(tier, periods);
  const periodDays = getSubscriptionDays(periods);
  const docId = subscriptionDocId(subscriberAddress, creatorAddress);

  if (await isSubscriptionTxAlreadyUsed(txHash, docId)) {
    return NextResponse.json({ error: 'This transaction was already used for another subscription' }, { status: 409 });
  }

  const verification = await verifyBasePayment({
    txHash,
    expectedTo: creatorAddress,
    expectedAmount: amount,
    // Cennik jest w USDC, wiec platnosc tez - i dzieki temu zawsze weryfikowalna.
    token: 'USDC',
  });

  if (!verification.ok) {
    return NextResponse.json({ error: verification.error }, { status: 402 });
  }

  try {
    const subscription = await saveSubscription({
      subscriberAddress,
      creatorAddress,
      tier,
      periodDays,
      amount,
      token: 'USDC',
      txHash,
      verified: verification.level,
    });
    return NextResponse.json({
      success: true,
      subscription,
      // Powtorzone w odpowiedzi API, zeby zadny klient nie mogl "przegapic"
      // tego, ze nic sie samo nie odnawia.
      renewal: 'none - this is a prepaid period of access, it does not renew automatically',
      note: verification.note ?? null,
    });
  } catch (error) {
    console.error('[api/unlock/subscription] blad zapisu wsparcia:', error);
    return NextResponse.json({ error: 'Payment verified but saving the subscription failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const subscriber = request.nextUrl.searchParams.get('subscriber');
  const creator = request.nextUrl.searchParams.get('creator');

  if (!isValidAddress(subscriber) || !isValidAddress(creator)) {
    return NextResponse.json({ error: 'Valid subscriber and creator addresses are required' }, { status: 400 });
  }

  const subscription = await getSubscription(subscriber, creator);
  return NextResponse.json({
    subscribed: isSubscriptionActive(subscription),
    expiresAt: subscription?.expiresAt ?? null,
    subscription: subscription ?? null,
  });
}
