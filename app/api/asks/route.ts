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
 * Zalozenie Aska. NIE budzet. Ta trasa zapisuje na sztywno
 * `funding: 'on-resolve'` (nizej), wiec pieniadze ida od autora do
 * odpowiadajacego dopiero przy rozstrzygnieciu, osobnym przelewem, ktorego hash
 * zostaje przy odpowiedzi. `fundingNote` w cenniku mowi to agentowi wprost.
 *
 * UWAGA - POWOD SIE ZMIENIL, ZDANIE ZOSTAJE. Kiedys budzetu nie dalo sie
 * pobrac z gory, bo kontraktu escrow po prostu nie bylo. Teraz JEST (AskEscrow,
 * adresy w deployments/) i sciezka z przegladarki go wola - ale nie ta trasa.
 * Blokada jest inna: escrow wymaga `approve` + `fund` PODPISANYCH przez portfel
 * autora, a agent placacy przez x402 nie podpisuje tu niczego wlasnym kluczem.
 * Dopoki to sie nie zmieni, Ask od agenta nie ma pokrycia w kontrakcie i NIE
 * WOLNO go nazywac escrow.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { withX402 } from '@x402/next';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
// Uwierzytelnienie facilitatora Coinbase. Tu, w trasie na runtime nodejs,
// CDP SDK ma wszystkie API, ktorych brakowalo mu w Edge.
import { createFacilitatorConfig } from '@coinbase/x402';
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
  getAskPrice,
  getPayToAddress,
  isAskPaymentEnforced,
} from './pricing';

/**
 * Serwer zasobu x402 dla tej trasy.
 *
 * Trzy sciezki facilitatora, kazda z innego powodu:
 *   1. wlasny adres z X402_FACILITATOR_URL - tak wpina sie VLED dla Robinhood
 *      Chain (eip155:4663, USDG, gasless); nie wymaga klucza
 *   2. CDP z kluczami, gdy siec to Base mainnet - ten facilitator WYMAGA
 *      uwierzytelnienia, samo wskazanie adresu nie wystarczy
 *   3. brak konfiguracji - publiczny facilitator x402.org, ktory dla EVM
 *      obsluguje wylacznie Base Sepolia
 *
 * Gdy siec to mainnet Base, a kluczy CDP nie ma, swiadomie NIE cofamy sie po
 * cichu do publicznego facilitatora: on tej sieci nie obsluguje, wiec zadanie
 * skonczyloby sie jego bledem zamiast uczciwym 402.
 */
const CDP_NETWORKS = new Set(['eip155:8453']);

function buildAskResourceServer() {
  const network = getAskNetwork();
  const url = process.env.X402_FACILITATOR_URL?.trim();

  let client;
  if (url) {
    client = new HTTPFacilitatorClient({ url });
  } else if (CDP_NETWORKS.has(network)) {
    const id = process.env.CDP_API_KEY_ID?.trim();
    const secret = process.env.CDP_API_KEY_SECRET?.trim();
    client = id && secret
      ? new HTTPFacilitatorClient(createFacilitatorConfig(id, secret))
      : new HTTPFacilitatorClient();
  } else {
    client = new HTTPFacilitatorClient();
  }

  return new x402ResourceServer(client).register(
    network as `${string}:${string}`,
    new ExactEvmScheme()
  );
}

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

// Zwracany typ podany JAWNIE. Bez tego TypeScript wnioskuje go z pierwszej
// galezi unii (odpowiedz bledu) i withX402 odrzuca handler, ktory potrafi
// zwrocic takze utworzonego Aska.
async function handlePost(request: NextRequest): Promise<NextResponse<unknown>> {
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

/**
 * ===== EGZEKWOWANIE PLATNOSCI: W TRASIE, NIE W MIDDLEWARE =====
 *
 * Bylo w `middleware.ts` i to byl blad, ktory WYWROCIL WDROZENIE NA VERCELU:
 *
 *   The Edge Function "middleware" is referencing unsupported modules:
 *     - @x402/extensions/bazaar
 *
 * Middleware Next.js 14 chodzi wylacznie w Edge Runtime, a stos x402 razem
 * z @coinbase/x402 ciagnie CDP SDK, ktore stoi na `axios` i `jose` - te
 * uzywaja `setImmediate`, `process.nextTick`, `CompressionStream`. W Edge tych
 * API nie ma. Build przechodzil, wdrozenie padalo dopiero na koncu.
 *
 * `withX402` owija HANDLER TRASY, a trasa ma `runtime = 'nodejs'` - wiec
 * wszystkie te API sa dostepne i problem znika u korzenia, zamiast byc
 * obchodzony konfiguracja webpacka.
 *
 * === TO NAPRAWIA TAKZE DRUGA WADE ===
 * `paymentProxy` w middleware rozliczal platnosc na `NextResponse.next()`,
 * czyli ZANIM handler w ogole wystartowal. Gdyby zapis Aska padl po
 * zaksiegowaniu, pieniadze bylyby pobrane, a Aska by nie bylo.
 *
 * `withX402` rozlicza dopiero przy statusie < 400. Walidacja i zapis dzieja
 * sie PRZED rozliczeniem, wiec agent nie placi za blad walidacyjny ani za
 * nieudany zapis.
 */
export const POST = withX402(
  handlePost,
  {
    accepts: {
      scheme: 'exact',
      network: getAskNetwork(),
      // Adres odbiorcy rozwiazywany PER ZADANIE, nie zapamietany przy
      // ladowaniu modulu - patrz pricing.ts i AUDYT.md par. 2.
      payTo: () => {
        const payTo = getPayToAddress();
        if (!payTo) throw new Error('X402_PAY_TO_ADDRESS is not configured');
        return payTo;
      },
      price: getAskPrice(),
    },
    description: ASK_POST_DESCRIPTION,
    mimeType: 'application/json',
  },
  buildAskResourceServer()
);
