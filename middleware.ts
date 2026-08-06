/**
 * Bramka platnosci x402 dla trasy, ktora zaklada Aska.
 *
 * === CO TU BYLO PRZEDTEM: NIC ===
 * Manifest (`app/re-definition/page.tsx`, sekcja "402 - payment required")
 * obiecuje wprost: "An agent can post an Ask the same way you can - GET
 * /api/asks to see the price, sign, then POST the question". Pakiety x402 2.21
 * lezaly w node_modules, w `app/utils/myclaw/x402.ts` byl gotowy wrapper - ale
 * `middleware.ts` nie istnialo i zadna trasa Aska nie istniala, wiec nic
 * niczego nie egzekwowalo. Obietnica byla zdaniem na stronie.
 *
 * === DLACZEGO MIDDLEWARE, A NIE withX402 NA TRASIE ===
 * MyClaw uzywa `withX402` i ma po temu powod zapisany w swoim pliku:
 * settlement nastepuje dopiero PO udanej odpowiedzi handlera, wiec nie pobiera
 * sie pieniedzy za blad 5xx. Middleware tej wlasciwosci NIE MA - `paymentProxy`
 * rozlicza platnosc na `NextResponse.next()`, czyli ZANIM trasa w ogole
 * wystartuje. To jest realna wada tego wariantu i nie wolno jej przemilczec:
 * jesli POST /api/asks wywali sie po zaksiegowaniu platnosci, pieniadze sa
 * pobrane, a Ask nie powstal. Trasa jest dlatego napisana tak, zeby caly zapis
 * byl na koncu i po walidacji - ale to jest ostroznosc, nie gwarancja.
 *
 * === GRANICA, KTOREJ TA BRAMKA NIE PRZEKRACZA ===
 * Middleware w Next 14.2 chodzi WYLACZNIE na Edge (runtime 'nodejs' dla
 * middleware doszedl dopiero w Next 15.2). Dlatego nie ma tu ani firebase-admin,
 * ani `node:crypto`, ani sesji SIWE - tozsamosc sprawdza trasa, bramka sprawdza
 * wylacznie platnosc. Import z `./app/api/asks/pricing` jest bezpieczny, bo ten
 * modul nie importuje niczego poza typami.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { paymentProxy } from '@x402/next';
// Uwierzytelnienie facilitatora Coinbase. Bez tego mainnet Base jest
// nieosiagalny - patrz buildFacilitator() nizej.
import { createFacilitatorConfig } from '@coinbase/x402';
import {
  ASK_POST_DESCRIPTION,
  getAskNetwork,
  getAskPostPrice,
  getAskCurrencySymbol,
  getFacilitatorUrl,
  getPayToAddress,
} from './app/api/asks/pricing';

/**
 * Obie postacie sciezki, bo `trailingSlash: true` w next.config.js kanonizuje
 * /api/asks -> /api/asks/ PRZED middleware. Gdyby matcher znal tylko jedna,
 * bramka nie odpalilaby sie wcale i POST byl darmowy.
 */
export const config = {
  matcher: ['/api/asks', '/api/asks/'],
};

/** Odpowiedz bramki nigdy nie moze trafic do cache'u posrednika. */
const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

/**
 * Proxy budujemy LENIWIE, przy pierwszym platnym zadaniu, a nie przy ladowaniu
 * modulu. `paymentProxy` startuje synchronizacje z facilitatorem juz w
 * konstruktorze; robienie tego na poziomie modulu Edge znaczyloby siec przy
 * zimnym starcie kazdej instancji, takze dla zadan, ktore i tak nie placa.
 *
 * Klucz cache'a zawiera siec i cene, zeby zmiana konfiguracji nie zostala
 * zamrozona w cieplej instancji - ten sam blad, ktory AUDYT.md §2 opisuje dla
 * adresu odbiorcy.
 */
let cached: { key: string; run: (request: NextRequest) => Promise<NextResponse> } | null = null;

/**
 * Konfiguracja facilitatora dla WYBRANEJ sieci.
 *
 * === TRZY SCIEZKI, KAZDA Z INNEGO POWODU ===
 *
 * 1. CDP (Base mainnet). Facilitator Coinbase WYMAGA UWIERZYTELNIENIA - samo
 *    wskazanie adresu nie wystarczy, `GET /supported` bez klucza zwraca
 *    "Unauthorized" (sprawdzone). `createFacilitatorConfig` z @coinbase/x402
 *    dokłada `createAuthHeaders`, ktore podpisuja kazde zadanie kluczem CDP.
 *    Wlacza sie SAMO, gdy siec to eip155:8453 i oba klucze sa w env.
 *
 * 2. Wlasny adres z X402_FACILITATOR_URL - tak wpina sie VLED dla Robinhood
 *    Chain (eip155:4663, USDG, gasless). Ten nie wymaga klucza.
 *
 * 3. Brak konfiguracji - biblioteka bierze publiczny facilitator x402.org,
 *    ktory dla EVM obsluguje wylacznie Base Sepolia.
 *
 * Gdy siec to mainnet Base, a kluczy CDP NIE MA, swiadomie NIE cofamy sie po
 * cichu do publicznego facilitatora: on tej sieci nie obsluguje, wiec kazde
 * zadanie skonczyloby sie bledem facilitatora zamiast uczciwym 402. Lepiej
 * niech konfiguracja zawiedzie glosno.
 */
const CDP_NETWORKS = new Set(['eip155:8453']);

function buildFacilitator(network: string) {
  const url = getFacilitatorUrl();
  if (url) return new HTTPFacilitatorClient({ url });

  if (CDP_NETWORKS.has(network)) {
    const id = process.env.CDP_API_KEY_ID?.trim();
    const secret = process.env.CDP_API_KEY_SECRET?.trim();
    if (id && secret) {
      return new HTTPFacilitatorClient(createFacilitatorConfig(id, secret));
    }
  }

  return new HTTPFacilitatorClient();
}

function getProxy(network: string, price: string) {
  // Klucz cache'a niesie takze OBECNOSC kluczy CDP: gdyby zostaly dodane bez
  // restartu, ciepla instancja trzymalaby facilitator bez uwierzytelnienia.
  const hasCdp = Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
  const key = `${network}|${price}|${getFacilitatorUrl() ?? ''}|${hasCdp}`;
  if (cached && cached.key === key) return cached.run;

  const server = new x402ResourceServer(buildFacilitator(network)).register(
    network as `${string}:${string}`,
    new ExactEvmScheme()
  );

  const run = paymentProxy(
    {
      // Klucz z czasownikiem: platny jest WYLACZNIE POST. GET /api/asks to
      // cennik i lista - czytanie jest darmowe, inaczej agent nie mialby jak
      // poznac ceny przed zaplaceniem.
      'POST /api/asks': {
        accepts: {
          scheme: 'exact',
          network: network as `${string}:${string}`,
          // Adres odbiorcy rozwiazywany PER ZADANIE, nie zapamietany w
          // konfiguracji trasy. Powod w pricing.ts i w AUDYT.md §2.
          payTo: () => {
            const payTo = getPayToAddress();
            // Nie powinno sie zdarzyc - middleware sprawdza to wczesniej i
            // odmawia. Rzucamy, bo cichy pusty adres oznaczalby platnosc
            // wyslana donikad.
            if (!payTo) throw new Error('X402_PAY_TO_ADDRESS is not configured');
            return payTo;
          },
          price,
        },
        description: ASK_POST_DESCRIPTION,
        mimeType: 'application/json',
        // Bez tego cialo odpowiedzi 402 to dokladnie `{}` - wszystko siedzi
        // w naglowku PAYMENT-REQUIRED. Klient x402 sobie poradzi, ale czlowiek
        // z curlem i agent bez tej biblioteki dostaja pusta klamre zamiast
        // powodu. Mowimy wprost, ile to kosztuje i gdzie sprawdzic cene.
        unpaidResponseBody: () => ({
          contentType: 'application/json',
          body: {
            error: 'Payment required to post an Ask.',
            code: 'payment_required',
            price,
            // Symbol z konfiguracji sieci, nie wpisany na sztywno: na
            // Robinhood Chain rozliczamy w USDG, nie w USDC.
            currency: getAskCurrencySymbol(),
            network,
            scheme: 'exact',
            howTo:
              'Read the PAYMENT-REQUIRED header (base64 JSON), sign the USDC authorization, ' +
              'and retry this POST with the PAYMENT-SIGNATURE header. GET /api/asks is free and lists the same price.',
            fundingNote:
              'This price buys the Ask listing only. The budget is not escrowed - the author pays each accepted answer on resolve.',
          },
        }),
      },
    },
    server
  );

  cached = { key, run };
  return run;
}

export async function middleware(request: NextRequest) {
  // Czytanie jest darmowe. Bramka dotyczy wylacznie zakladania Aska.
  if (request.method !== 'POST') {
    return NextResponse.next();
  }

  const payTo = getPayToAddress();
  if (!payTo) {
    // NIE przepuszczamy. Zasob platny bez skonfigurowanego odbiorcy nie jest
    // zasobem darmowym - jest zasobem, ktorego nie da sie dzis sprzedac.
    // Przepuszczenie tutaj bylo dokladnie tym bledem, ktory AUDYT.md §2 opisuje
    // jako "serwowanie platnych zasobow za darmo".
    return NextResponse.json(
      {
        error: 'Payments are not configured on this deployment, so Asks cannot be posted.',
        code: 'payments_unconfigured',
      },
      { status: 503, headers: NO_STORE }
    );
  }

  const network = getAskNetwork();
  const price = getAskPostPrice();

  try {
    return await getProxy(network, price)(request);
  } catch (error) {
    // Awaria bramki to NIE jest zgoda na darmowy dostep. 402 mowi prawde:
    // za ten zasob trzeba zaplacic, tylko nie umiemy w tej chwili podac
    // wiazacych warunkow. Pusta lista `accepts` jest tu informacja, a nie
    // zaproszeniem - klient x402 nie ma czego podpisac i ponowi pozniej.
    console.error('[middleware/x402] Bramka platnosci Aska zawiodla:', error);
    return NextResponse.json(
      {
        x402Version: 2,
        error: 'Payment gate is temporarily unavailable. Retry shortly.',
        code: 'payment_gate_unavailable',
        accepts: [],
      },
      { status: 402, headers: { ...NO_STORE, 'Retry-After': '30' } }
    );
  }
}
