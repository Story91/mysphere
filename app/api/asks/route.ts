/**
 * GET  /api/asks - otwarte Aski i cena zalozenia nowego. DARMOWE.
 * POST /api/asks - zalozenie Aska. PLATNE przez x402 (patrz `withX402` na dole
 * tego pliku; middleware.ts NIE ISTNIEJE i nie ma prawa wrocic - powod przy
 * samym `export const POST`).
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
import { x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
// Wybor facilitatora PER SIEC. Ten modul ciagnie CDP SDK, wiec chodzi wylacznie
// na runtime nodejs - tu, w trasie, ma wszystkie API, ktorych brakowalo mu
// w Edge.
import { NetworkRoutedFacilitatorClient } from '../../utils/x402/facilitators';
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
  getAskCurrencySymbol,
  getAskNetwork,
  getAskPaymentOptions,
  getAskPostPrice,
  getAskPriceFor,
  getPayToAddress,
  isAskPaymentEnforced,
} from './pricing';

/**
 * ===== OFERTA PLATNOSCI: KILKA SIECI W JEDNEJ ODPOWIEDZI 402 =====
 *
 * Do 2026-08-08 `accepts` mialo JEDNA pozycje, bo caly serwer zasobu byl
 * budowany z jednej sieci. Agent nie mial wyboru: albo trzymal USDG na
 * Robinhood Chain, albo odpadal - czyli odpadala wiekszosc, bo wiekszosc trzyma
 * USDC na Base. Protokol x402 pozwala podac WIELE pozycji i zostawia wybor
 * KLIENTOWI (@x402/core: RouteConfig.accepts to `PaymentOption | PaymentOption[]`,
 * a findMatchingRequirements dopasowuje pozycje po polu `accepted`, ktore klient
 * odsyla w podpisie). Wiec podajemy wszystkie, ktore naprawde umiemy rozliczyc.
 *
 * TA LISTA JEST CZYTANA RAZ, przy ladowaniu modulu - `withX402` dostaje
 * `accepts` jako gotowa konfiguracje trasy i nie ma tam wariantu funkcyjnego na
 * cala liste. Rzeczy, ktore MUSZA byc swieze przy kazdym zadaniu (adres odbiorcy
 * z AUDYT.md par. 2 oraz cena), sa przekazane JAKO FUNKCJE - biblioteka wola je
 * per zadanie. Zmiana samej LISTY SIECI wymaga nowego procesu; sluzy do tego
 * X402_ASK_NETWORKS, zeby dalo sie to zrobic bez wdrozenia kodu.
 */
const ASK_PAYMENT_OPTIONS = getAskPaymentOptions();

/**
 * Serwer zasobu x402 dla tej trasy.
 *
 * Facilitator jest wybierany PER SIEC, a nie jedna zmienna srodowiskowa -
 * historia tego bledu i powod, dla ktorego to router, a nie tablica klientow,
 * siedzi w app/utils/x402/facilitators.ts. Krotko: Base wymaga kluczy CDP,
 * Robinhood idzie przez Primera bez klucza, a Primer deklaruje takze Base, wiec
 * kolejnosc w tablicy decydowalaby o tym, kto rozlicza Base.
 */
function buildAskResourceServer() {
  const server = new x402ResourceServer(
    new NetworkRoutedFacilitatorClient(ASK_PAYMENT_OPTIONS)
  );
  for (const option of ASK_PAYMENT_OPTIONS) {
    server.register(option.network, new ExactEvmScheme());
  }
  return server;
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
    // Z SIECI, NIE NA SZTYWNO. Stalo tu 'USDC' - prawda dokladnie tak dlugo,
    // jak dlugo X402_NETWORK wskazywalo lancuch z kanonicznym USDC. Robinhood
    // Chain kanonicznego USDC NIE MA i rozlicza sie w USDG (patrz ASK_ASSETS
    // w pricing.ts), wiec samo przestawienie zmiennej srodowiskowej sprawiloby,
    // ze ten publiczny endpoint oglasza agentom nieprawdziwa walute - a to
    // jest dokladnie ta informacja, na podstawie ktorej agent buduje podpis.
    currency: getAskCurrencySymbol(),
    network: getAskNetwork(),
    // DOPISANE OBOK, NIE ZAMIAST. Pola `network` i `currency` wyzej sa
    // pojedyncze i takie zostaja, bo czytaja je istniejacy agenci - podmiana
    // na tablice zepsulaby im integracje w dniu wdrozenia. Ale one juz NIE
    // OPISUJA CALEJ PRAWDY: bramka przyjmuje kazda pozycje z tej listy, a nie
    // tylko siec glowna. Kolejnosc to nasza preferencja, nie nakaz - wybiera
    // klient.
    networks: ASK_PAYMENT_OPTIONS.map((option) => ({
      network: option.network,
      currency: option.currency,
    })),
    description: ASK_POST_DESCRIPTION,
    enforced,
    // TA SAMA PULAPKA CO W `currency` WYZEJ, A ZOSTALA TU O JEDNO WDROZENIE
    // ZA DLUGO. Zdanie mowilo "Sign the USDC authorization" na sztywno, podczas
    // gdy pole `currency` tuz obok oddawalo juz USDG. Jedna odpowiedz mowila
    // agentowi dwie rozne waluty - a to jest dokladnie ta odpowiedz, na
    // podstawie ktorej agent buduje podpis EIP-3009.
    //
    // TERAZ NIE WOLNO WPISAC TU ZADNEJ POJEDYNCZEJ WALUTY. Odpowiedz 402 niesie
    // kilka pozycji naraz, wiec zdanie "sign a USDG authorization" byloby tym
    // samym bledem, tylko z drugiej strony: kazalo by agentowi placic w walucie,
    // ktorej moze nie miec, choc druga pozycja jest dla niego dostepna.
    note: enforced
      ? 'Unpaid POST returns 402 whose `accepts` array carries every payment option this deployment can settle - pick one, sign an EIP-3009 authorization for the exact network, asset and amount of THAT entry (do not take them from here) and retry with the PAYMENT-SIGNATURE header, echoing the chosen entry back as `accepted`. The payer signs only; the facilitator submits the transaction, so the paying address needs no gas.'
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
  // Do tego miejsca zadanie dochodzi tylko z podpisem, ktory `withX402` zdazyl
  // ZWERYFIKOWAC - ale jeszcze NIE ROZLICZYC. Rozliczenie idzie po handlerze
  // i tylko przy statusie < 400 (@x402/next, handleSettlement). Kazde `return`
  // z bledem ponizej kasuje wiec platnosc, a nie pobiera jej za nic.
  // Tozsamosc jest osobna sprawa: podpis mowi ZE zaplacono, nie KTO zaklada Aska.
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
    // TEN KOMENTARZ MOWIL DOKLADNIE ODWROTNIE, NIZ ROBI KOD. Stalo tu, ze
    // platnosc rozliczylo middleware jeszcze przed startem trasy, wiec ten blad
    // oznacza pobrana oplate bez Aska - i kazalo zwracac pieniadze recznie.
    // Middleware nie ma (patrz `export const POST` nizej), a `withX402` rozlicza
    // WYLACZNIE przy statusie < 400. Status 500 znaczy, ze nikt nie zaplacil,
    // wiec nie ma czego zwracac - zwrot na podstawie tamtego zdania byloby
    // oddaniem pieniedzy, ktorych nigdy nie wzielismy.
    // `code` zostaje, bo dalej odroznia awarie zapisu od odmowy walidacyjnej.
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
    accepts: ASK_PAYMENT_OPTIONS.map((option) => ({
      scheme: 'exact' as const,
      network: option.network,
      // Adres odbiorcy rozwiazywany PER ZADANIE, nie zapamietany przy
      // ladowaniu modulu - patrz pricing.ts i AUDYT.md par. 2.
      payTo: () => {
        const payTo = getPayToAddress();
        if (!payTo) throw new Error('X402_PAY_TO_ADDRESS is not configured');
        return payTo;
      },
      // TAKZE PER ZADANIE. Wczesniej stalo tu `getAskPrice()`, czyli wynik
      // policzony raz przy ladowaniu modulu: zmiana X402_ASK_PRICE nie ruszala
      // cieplej instancji, ktora dalej brala stara stawke. To ta sama rodzina
      // bledu co zapamietany payTo z AUDYT.md par. 2.
      price: () => getAskPriceFor(option.network),
    })),
    description: ASK_POST_DESCRIPTION,
    mimeType: 'application/json',
  },
  buildAskResourceServer()
);
