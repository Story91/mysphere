/**
 * Cennik i konfiguracja platnosci x402 dla Askow.
 *
 * === PO CO OSOBNY PLIK ===
 * Ten modul jest importowany z DWOCH srodowisk: z `middleware.ts` (Edge, bo
 * Next 14 nie umie middleware na runtime nodejs) i z tras `app/api/asks/**`
 * (Node). Dlatego NIE WOLNO tu niczego importowac poza typami - zaden
 * `server-only`, zaden firebase-admin, zaden `node:*`. Inaczej build Edge'a
 * wywali sie na middleware.
 *
 * Jest jednym zrodlem prawdy o cenie. Manifest obiecuje agentowi:
 * "GET /api/asks to see the price, sign, then POST the question" - a to
 * dziala tylko wtedy, gdy cena podana w GET jest DOKLADNIE ta, ktorej zada
 * bramka 402 przy POST. Dwa miejsca z cena to dwie ceny.
 *
 * === CZEGO TA CENA NIE JEST ===
 * To NIE jest budzet Aska. Budzetu nie da sie dzis pobrac z gory, bo nie ma
 * escrow (patrz app/utils/asks/types.ts) - platforma musialaby przyjac cudze
 * pieniadze bez kontraktu, ktory je trzyma i wydaje. Tu placi sie WYLACZNIE
 * za zalozenie Aska. Budzet nadal idzie od autora do odpowiadajacego przy
 * rozstrzygnieciu, przelewem, ktorego hash laduje przy odpowiedzi.
 */

import type { Network } from '@x402/core/types';

/** Domyslna cena zalozenia Aska. Stawka wpisowa, nie budzet. */
const DEFAULT_ASK_POST_PRICE = '$0.01';

/**
 * Domyslna siec: Base Sepolia w CAIP-2.
 *
 * DLACZEGO NIE MAINNET DOMYSLNIE: publiczny facilitator
 * (https://x402.org/facilitator/supported) deklaruje dla schematu `exact`
 * i przestrzeni eip155 WYLACZNIE `eip155:84532`. Sprawdzone na zywo.
 * Na kazdej innej sieci EVM zadanie konczyloby sie bledem facilitatora
 * zamiast uczciwym 402 - wiec testnet jest jedynym wariantem, ktory dziala
 * bez dodatkowej konfiguracji.
 *
 * === SA DWA MAINNETY I OBA DA SIE WLACZYC ===
 *
 * 1. BASE (eip155:8453) - facilitator Coinbase CDP:
 *      X402_NETWORK=eip155:8453
 *      X402_FACILITATOR_URL=            <- MUSI ZOSTAC PUSTE
 *
 *    UWAGA, TU BYL BLAD W TEJ INSTRUKCJI. Stalo tu "ustaw
 *    X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402".
 *    To ZEPSULOBY platnosci: route.ts sprawdza `if (url)` JAKO PIERWSZE
 *    i zbudowalby HTTPFacilitatorClient({url}) BEZ naglowkow uwierzytelniajacych,
 *    a CDP bez klucza odpowiada 401. Galaz CDP (route.ts, CDP_NETWORKS) odpala
 *    sie WYLACZNIE wtedy, gdy ta zmienna jest pusta - dopiero ona dokleja
 *    klucze przez createFacilitatorConfig z @coinbase/x402.
 *
 *    Klucze CDP_API_KEY_ID i CDP_API_KEY_SECRET sa juz w env tego projektu,
 *    a @coinbase/x402 JEST juz w package.json (drugi nieaktualny fragment
 *    tego komentarza - twierdzil, ze paczki brakuje; route.ts jej uzywa).
 *    Na tej sciezce `extra` domeny EIP-712 wypelnia sie samo, bo eip155:8453
 *    siedzi w DEFAULT_STABLECOINS biblioteki.
 *
 * 2. ROBINHOOD CHAIN (eip155:4663) - USDG, bez gazu po stronie placacego:
 *      X402_FACILITATOR_URL=https://x402.primer.systems
 *      X402_NETWORK=eip155:4663
 *    Dziala BEZ klucza i BEZ nowej zaleznosci - stad ASK_ASSETS ponizej.
 *
 *    === DLACZEGO PRIMER, A NIE VLED (stal tu wczesniej placeholder) ===
 *    Ten komentarz mowil "facilitator VLED" i zostawial <endpoint VLED> do
 *    wpisania. VLED ISTNIEJE (facilitator.vledx402.tech) i jest zbudowany
 *    dokladnie pod nasze USDG - ale WPISANIE GO ZEPSULOBY KAZDA PLATNOSC:
 *
 *      VLED /supported deklaruje:  x402Version 1, network "robinhood"
 *      nasz kod prosi o:           x402Version 2, network "eip155:4663"
 *
 *    Mamy @x402/core 2.21, a route.ts rejestruje schemat pod CAIP-2
 *    z getAskNetwork(). Nie ma czesci wspolnej - agent dostawalby blad
 *    facilitatora zamiast uczciwego 402. Do tego sygnatariusz VLED
 *    (0x735b9A0b...) mial przy sprawdzeniu 0,000087 ETH gazu, czyli tyle,
 *    ile trzeba, zeby przestac dzialac w srodku dnia.
 *
 *    Odrzucony zostal takze facilitator.naven.network: jego /supported
 *    wyglada IDEALNIE (x402Version 2, eip155:4663, bez klucza), ale POST
 *    /verify zwraca HTTP 500 na KAZDE wejscie, lacznie z pustym obiektem.
 *    Resource server wola verify przed settle, wiec to dyskwalifikuje.
 *    Samo /supported nie jest dowodem - trzeba zawolac /verify.
 *
 *    Primer sprawdzony realnym POST /verify: przechodzi walidacje sieci
 *    ORAZ aktywa (nasze USDG) i dociera do odtwarzania podpisu ECDSA.
 *    /stats podaje 27 466 rozliczonych platnosci, wiec to dzialajacy produkt.
 *
 *    UWAGA NA TOKEN "PR": strona Primera podaje dla tej sieci adres
 *    0x235767cc3d01ec18B5db87973975AC8616b2A153. To ICH wlasny token (symbol
 *    odczytany z lancucha: "PR"), NIE USDG. Nie wpisywac go do ASK_ASSETS.
 *
 *    CZEGO NIE SPRAWDZONO: pelnej platnosci koniec-koncem. Potwierdzone sa
 *    deklaracja sieci, prawdziwosc jej walidacji, akceptacja USDG i dotarcie
 *    do weryfikacji podpisu. Realnego `settle` nie da sie sprawdzic bez
 *    prawdziwego podpisu i USDG w portfelu. ZANIM OGLOSIMY TO NA STRONIE
 *    PRODUKTU, trzeba puscic jedna platnosc na 0,01 USDG.
 *
 *    Domena EIP-712 dla USDG (potrzebna do podpisu, odtworzona z
 *    DOMAIN_SEPARATOR, bo eip712Domain() na tym kontrakcie rewertuje):
 *      name="Global Dollar", version="1", chainId=4663,
 *      verifyingContract=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
 */
const DEFAULT_ASK_NETWORK = 'eip155:84532';

/**
 * Token rozliczeniowy per siec, gdy nie jest to domyslny stablecoin schematu.
 *
 * PO CO: `price: "$0.01"` dziala tylko tam, gdzie schemat `exact` sam wie,
 * czym jest dolar - czyli na sieciach z kanonicznym USDC. Robinhood Chain
 * kanonicznego USDC NIE MA. Sprawdzilem to na lancuchu: pod adresami USDC
 * z Base i z Arbitrum nie ma tam ZADNEGO kontraktu, a z czterech stablecoinow
 * na liscie explorera tylko USDG odpowiada na `authorizationState(...)`
 * i `DOMAIN_SEPARATOR()`, czyli tylko on obsluguje EIP-3009 - a bez EIP-3009
 * agent nie ma czego podpisac i caly schemat `exact` nie ma sie o co oprzec.
 *
 * Adres potwierdzony dwiema niezaleznymi drogami: odczytem z lancucha
 * i strona facilitatora VLED, ktora podaje ten sam kontrakt.
 *
 * Kwota jest w NAJMNIEJSZEJ JEDNOSTCE. USDG ma 6 miejsc, wiec 10000 = 0,01.
 * Wpisanie tu 18 miejsc, odruchowo jak przy ETH, pomnozyloby cene przez
 * bilion.
 */
const ASK_ASSETS: Record<
  string,
  { asset: string; decimals: number; symbol: string; eip712: { name: string; version: string } }
> = {
  'eip155:4663': {
    asset: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    decimals: 6,
    symbol: 'USDG',
    /**
     * === TA PARA MUSI TU BYC, INACZEJ NIKT NICZEGO NIE PODPISZE ===
     * Klient x402 (@x402/evm, client/index.js) sprawdza to PRZED podpisem:
     *
     *   if (!requirements.extra?.name || !requirements.extra?.version)
     *     throw new Error('EIP-712 domain parameters (name, version) are required...')
     *
     * Na sieciach z kanonicznym USDC biblioteka wypelnia to sama z wlasnej
     * listy DEFAULT_STABLECOINS. Robinhood Chain na tej liscie NIE JEST, wiec
     * bez tych dwoch pol odpowiedz 402 wychodzi z `extra: {}` i kazda platnosc
     * konczy sie wyjatkiem u agenta - jeszcze zanim dotknie facilitatora.
     *
     * WARTOSCI SA ODTWORZONE Z LANCUCHA, NIE PRZEPISANE Z DOKUMENTACJI.
     * `version()` i `eip712Domain()` na tym kontrakcie OBA rewertuja
     * (0x800ab12c), wiec nie da sie ich odczytac w czasie dzialania - stad
     * wpis na sztywno. Poprawnosc sprawdzona przez zhaszowanie domeny
     * i porownanie z DOMAIN_SEPARATOR() =
     * 0x7a3d7400b27830f4f91c2c16a082486d67c1befecaec2f53b33f1f35d5b62036.
     * Warianty "USDG"/"1", "Global Dollar"/"2" i "Global Dollar"/"" NIE
     * pasuja - zla wersja psuje kazdy podpis po cichu, bo blad wychodzi
     * dopiero przy odzyskiwaniu adresu i wyglada jak zly podpis.
     */
    eip712: { name: 'Global Dollar', version: '1' },
  },
};

/** "$0.01" albo "0.01". Notacja naukowa i ujemne kwoty odrzucone. */
const PRICE_RE = /^\$?\d+(\.\d+)?$/;

/** CAIP-2: przestrzen nazw i referencja. */
const NETWORK_RE = /^[a-z0-9-]+:[a-zA-Z0-9-]+$/;

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Adres odbiorcy platnosci - CZYTANY PRZY KAZDYM WYWOLANIU, nigdy przy
 * ladowaniu modulu.
 *
 * AUDYT.md §2 opisuje, co dawalo zapamietanie tej decyzji: ciepla instancja
 * uruchomiona przed ustawieniem X402_PAY_TO_ADDRESS serwowala platne zasoby
 * za darmo do konca swojego zycia - czyli dokladnie wtedy, gdy adres wreszcie
 * ustawiono. Ta funkcja jest tania (odczyt env + regex), wiec nie ma czego
 * cache'owac.
 *
 * Zwraca null przy braku albo blednym adresie. Wolajacy MA wtedy odmowic,
 * a nie przepuscic za darmo - patrz middleware.ts.
 */
export function getPayToAddress(): string | null {
  const raw = process.env.X402_PAY_TO_ADDRESS?.trim();
  if (!raw || !EVM_ADDRESS_RE.test(raw)) return null;
  return raw;
}

/** Cena zalozenia Aska. Bledna wartosc w env cofa sie do domyslnej. */
export function getAskPostPrice(): string {
  const raw = process.env.X402_ASK_PRICE?.trim();
  if (!raw || !PRICE_RE.test(raw)) return DEFAULT_ASK_POST_PRICE;
  return raw.startsWith('$') ? raw : `$${raw}`;
}

/** Siec platnosci w CAIP-2. Bledna wartosc w env cofa sie do domyslnej. */
export function getAskNetwork(): Network {
  const raw = process.env.X402_NETWORK?.trim();
  if (!raw || !NETWORK_RE.test(raw)) return DEFAULT_ASK_NETWORK as Network;
  return raw as Network;
}

/**
 * Cena w postaci, ktora schemat `exact` zrozumie na WYBRANEJ sieci.
 *
 * Na sieciach z kanonicznym USDC oddajemy zapis kwotowy ("$0.01") - schemat
 * sam wie, czym jest dolar. Tam, gdzie kanonicznego USDC nie ma (dzis:
 * Robinhood Chain), oddajemy JAWNY token i kwote w najmniejszej jednostce,
 * bo inaczej nie ma czego wpisac w pole `asset` odpowiedzi 402 i agent
 * dostalby zadanie zaplaty bez wskazania, czym ma zaplacic.
 *
 * Przeliczenie idzie przez zaokraglenie do najblizszej jednostki, a nie przez
 * obciecie: przy cenie 0,015 USDG obciecie dawaloby 0,01 - czyli cene INNA
 * niz ta, ktora ogloszilismy w GET /api/asks.
 */
export function getAskPrice():
  | string
  | { asset: string; amount: string; extra: { name: string; version: string } } {
  const network = getAskNetwork();
  const known = ASK_ASSETS[network];
  const money = getAskPostPrice();
  if (!known) return money;

  const value = Number(money.replace('$', ''));
  if (!Number.isFinite(value) || value <= 0) {
    // Nie zgadujemy kwoty. Lepiej oddac zapis dolarowy i pozwolic schematowi
    // odmowic glosno, niz wystawic cene wzieta z powietrza.
    return money;
  }

  const amount = Math.round(value * 10 ** known.decimals).toString();
  // `extra` PRZECHODZI DALEJ BEZ ZMIAN az do odpowiedzi 402 - schemat `exact`
  // po stronie serwera (@x402/evm, parsePrice) kopiuje je jeden do jednego,
  // a klient bez niego rzuca wyjatkiem. Patrz ASK_ASSETS wyzej.
  return { asset: known.asset, amount, extra: known.eip712 };
}

/** Symbol waluty do pokazania czlowiekowi. Nie uzywany do rozliczenia. */
export function getAskCurrencySymbol(): string {
  return ASK_ASSETS[getAskNetwork()]?.symbol ?? 'USDC';
}

/** Adres facilitatora albo undefined (wtedy biblioteka bierze swoj domyslny). */
export function getFacilitatorUrl(): string | undefined {
  const raw = process.env.X402_FACILITATOR_URL?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

/** Czy bramka platnosci jest w ogole uzbrojona w tym procesie. */
export function isAskPaymentEnforced(): boolean {
  return getPayToAddress() !== null;
}

/** Opis zasobu, ktory agent zobaczy w odpowiedzi 402. */
export const ASK_POST_DESCRIPTION =
  'Post an Ask: a question with a budget, a number of seats and a deadline.';

/** Sciezka chroniona bramka. Jedno miejsce dla middleware i dla opisu w GET. */
export const ASK_POST_PATH = '/api/asks';

/** Gorna granica dlugosci pytania. Ask ma byc pytaniem, nie briefem. */
export const MAX_QUESTION_LENGTH = 500;

/** Gorna granica dlugosci odpowiedzi - tyle samo, co tresc premium. */
export const MAX_ANSWER_LENGTH = 5000;

/** Ile Askow wydaje GET /api/asks za jednym razem. */
export const ASKS_PAGE_SIZE = 20;
export const ASKS_MAX_PAGE_SIZE = 50;
