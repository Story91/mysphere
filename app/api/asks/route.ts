/**
 * GET  /api/asks - otwarte Aski i cena zalozenia nowego. DARMOWE.
 * POST /api/asks - zalozenie Aska. PLATNE przez x402 (patrz middleware.ts).
 *
 * === PO CO TA TRASA ISTNIEJE ===
 * Manifest, sekcja "402 - payment required": "An agent can post an Ask the same
 * way you can - GET /api/asks to see the price, sign, then POST the question."
 * Do dzis nie bylo ani jednej, ani drugiej. Ask mial model danych
 * (app/utils/asks/*) i rysunek na stronie - i nic pomiedzy.
 *
 * === DLACZEGO GET JEST DARMOWY ===
 * Bo inaczej caly handshake 402 nie ma jak sie zaczac: agent musi poznac cene,
 * zanim cokolwiek podpisze. Platny cennik to zamkniete drzwi z napisem
 * "informacja o kluczu za oplata". Czytanie Askow jest zreszta jawne z zasady -
 * zapieczetowane sa ODPOWIEDZI, nie pytania.
 *
 * === CO DOKLADNIE KUPUJE PLATNOSC PRZY POST ===
 * Zalozenie Aska. NIE budzet. Budzetu nie da sie pobrac z gory, bo w repo nie
 * ma kontraktu escrow - i nie wolno tego nazywac escrow (app/utils/asks/types.ts
 * mowi o tym wprost). Pieniadze ida od autora do odpowiadajacego przy
 * rozstrzygnieciu, osobnym przelewem, ktorego hash zostaje przy odpowiedzi.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAsk, getOpenAsks } from '../../utils/asks/asks';
import {
  ASK_DURATIONS,
  MAX_SEATS,
  MIN_PER_ANSWER,
  perAnswerFor,
} from '../../utils/asks/types';
import { normalizeAddress } from '../../utils/monetization/types';
import { getRequester } from './identity';
import {
  ASKS_MAX_PAGE_SIZE,
  ASKS_PAGE_SIZE,
  ASK_POST_DESCRIPTION,
  MAX_QUESTION_LENGTH,
  getAskNetwork,
  getAskPostPrice,
  isAskPaymentEnforced,
} from './pricing';

// getSessionFromCookies uzywa node:crypto, ktorego nie ma na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cennik i lista sa publiczne, ale MUSZA byc swieze: `no-store` gwarantuje, ze
 * agent nie dostanie z cache'u posrednika ceny sprzed jej zmiany i nie podpisze
 * autoryzacji na kwote, ktorej bramka juz nie przyjmuje.
 */
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Odpowiedzi niosace dane konkretnego czlowieka - patrz /api/auth/session. */
const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

/** Blok `payment` - odzwierciedla stan FAKTYCZNY, nie zamierzony. */
function paymentInfo() {
  const enforced = isAskPaymentEnforced();
  return {
    protocol: 'x402',
    version: 2,
    scheme: 'exact',
    endpoint: 'POST /api/asks',
    price: getAskPostPrice(),
    currency: 'USDC',
    network: getAskNetwork(),
    description: ASK_POST_DESCRIPTION,
    enforced,
    note: enforced
      ? 'Unpaid POST returns 402 with payment requirements. Sign the USDC authorization and retry with the PAYMENT-SIGNATURE header.'
      : 'X402_PAY_TO_ADDRESS is not configured on this deployment, so Asks cannot be posted here at all. Posting is refused, not given away.',
    // Powiedziane wprost, zeby nikt nie wzial tego za escrow.
    fundingNote:
      'This price buys the Ask listing only. The budget is not escrowed - the author pays each accepted answer on resolve, and the payout transaction hash is stored with it.',
  };
}

/* ------------------------------------------------------------------ */
/* GET - lista otwartych Askow + cennik                                */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get('limit');
  const parsedLimit = rawLimit ? Number(rawLimit) : ASKS_PAGE_SIZE;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), ASKS_MAX_PAGE_SIZE)
      : ASKS_PAGE_SIZE;

  const { asks, failed } = await getOpenAsks(limit);

  if (failed) {
    // AWARIA I PUSTKA TO NIE TO SAMO ZDANIE. Pusta lista przy nieudanym
    // odczycie mowilaby "nikt o nic nie pyta" - a to jest oskarzenie
    // postawione w chwili, gdy nie udalo sie tego sprawdzic.
    return NextResponse.json(
      {
        error: 'Failed to read Asks',
        code: 'asks_unavailable',
        payment: paymentInfo(),
      },
      { status: 503, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    {
      asks,
      count: asks.length,
      payment: paymentInfo(),
      limits: {
        maxQuestionLength: MAX_QUESTION_LENGTH,
        maxSeats: MAX_SEATS,
        minPerAnswer: MIN_PER_ANSWER,
        durations: ASK_DURATIONS.map((duration) => ({
          label: duration.label,
          ms: duration.ms,
        })),
      },
    },
    { headers: NO_STORE }
  );
}

/* ------------------------------------------------------------------ */
/* POST - zalozenie Aska                                               */
/* ------------------------------------------------------------------ */

interface CreateBody {
  question?: unknown;
  budget?: unknown;
  seats?: unknown;
  durationMs?: unknown;
}

const ALLOWED_DURATIONS = new Set<number>(ASK_DURATIONS.map((duration) => duration.ms));

export async function POST(request: NextRequest) {
  // Do tego miejsca zadanie dochodzi tylko przez middleware, czyli albo z
  // rozliczona platnoscia x402, albo wcale. Tozsamosc jest osobna sprawa:
  // platnosc mowi ZE zaplacono, nie KTO zaklada Aska.
  const requester = getRequester(request);
  if (!requester) {
    return NextResponse.json(
      {
        error:
          'Sign in with your wallet, or post with an x402 payment signature. ' +
          'An address in the request body is not an identity.',
        code: 'identity_required',
      },
      { status: 401, headers: NO_STORE_PRIVATE }
    );
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400, headers: NO_STORE });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Question is limited to ${MAX_QUESTION_LENGTH} characters` },
      { status: 400, headers: NO_STORE }
    );
  }

  const budget = typeof body.budget === 'number' ? body.budget : Number(body.budget);
  if (!Number.isFinite(budget) || budget <= 0) {
    return NextResponse.json({ error: 'Invalid budget' }, { status: 400, headers: NO_STORE });
  }

  const seats = typeof body.seats === 'number' ? body.seats : Number(body.seats);
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
    return NextResponse.json(
      { error: `Seats must be a whole number between 1 and ${MAX_SEATS}` },
      { status: 400, headers: NO_STORE }
    );
  }

  const durationMs = typeof body.durationMs === 'number' ? body.durationMs : Number(body.durationMs);
  if (!ALLOWED_DURATIONS.has(durationMs)) {
    // Zamkniety zbior, a nie dowolna liczba: termin krotszy niz godzina nie daje
    // szans na odpowiedz, a dowolnie dlugi zamraza `resolve rate` autora.
    return NextResponse.json(
      {
        error: 'Invalid duration',
        allowed: ASK_DURATIONS.map((duration) => ({ label: duration.label, ms: duration.ms })),
      },
      { status: 400, headers: NO_STORE }
    );
  }

  // Kwota ponizej progu jest gestem, nie zaplata - i to jest jedyne miejsce,
  // ktore moze tego pilnowac po stronie serwera.
  const perAnswer = perAnswerFor(budget, seats);
  if (perAnswer < MIN_PER_ANSWER) {
    return NextResponse.json(
      {
        error: `Each seat must be worth at least ${MIN_PER_ANSWER} - this budget gives ${perAnswer} per answer`,
        code: 'per_answer_too_low',
      },
      { status: 400, headers: NO_STORE }
    );
  }

  let id: string;
  try {
    id = await createAsk({
      author: normalizeAddress(requester.address),
      question,
      budget,
      seats,
      durationMs,
    });
  } catch (error) {
    console.error('[api/asks] Zapis Aska nie powiodl sie:', error);
    // UWAGA: platnosc x402 zostala juz rozliczona przez middleware, zanim ta
    // trasa wystartowala (paymentProxy rozlicza na NextResponse.next()).
    // Ten blad oznacza wiec pobrana oplate bez Aska. Zwracamy `code`, zeby dalo
    // sie to odroznic od odmowy walidacyjnej i zwrocic pieniadze recznie.
    return NextResponse.json(
      { error: 'Failed to create Ask', code: 'ask_write_failed' },
      { status: 500, headers: NO_STORE_PRIVATE }
    );
  }

  return NextResponse.json(
    {
      id,
      author: normalizeAddress(requester.address),
      identityVia: requester.via,
      question,
      budget,
      seats,
      perAnswer,
      status: 'open',
      funding: 'on-resolve',
      deadline: Date.now() + durationMs,
    },
    { status: 201, headers: NO_STORE_PRIVATE }
  );
}
