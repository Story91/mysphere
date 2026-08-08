/**
 * Cennik i konfiguracja platnosci x402 dla Askow.
 *
 * === PO CO OSOBNY PLIK ===
 * NIE WOLNO tu niczego importowac poza typami - zaden `server-only`, zaden
 * firebase-admin, zaden `node:*`, zaden @coinbase/x402. Ten modul opisuje
 * DECYZJE (ktora siec, jaka cena, czyj facilitator), a nie ich wykonanie:
 * budowanie klientow facilitatora siedzi w app/utils/x402/facilitators.ts,
 * ktory ciagnie CDP SDK i chodzi wylacznie na runtime nodejs.
 *
 * Powod historyczny: plik byl kiedys importowany takze z `middleware.ts`, czyli
 * z Edge. Middleware juz nie ma (patrz naglowek route.ts - to on wywrocil
 * wdrozenie na Vercelu), ale ta zasada zostaje, bo dzieki niej cennik da sie
 * przeczytac z dowolnego srodowiska i sondy.
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
 *
 * === CO DOKLADNIE SPRAWDZONO NA ZYWO PRZY WLACZANIU DRUGIEJ SIECI ===
 * (2026-08-08, lokalnie, na tej konfiguracji env)
 *
 * PRZESZLO:
 *  - GET /api/asks oglasza obie sieci, a odpowiedz 402 niesie DWIE pozycje
 *    w `accepts`: eip155:4663/USDG i eip155:8453/USDC, obie po 10000 jednostek
 *    przy cenie $0.01, obie z tym samym payTo.
 *  - Obie domeny EIP-712 z pola `extra` zhaszowane i porownane z DOMAIN_SEPARATOR()
 *    kontraktow: ZGADZAJA SIE. Robi to scripts/x402CheckAccepts.mjs, ktory bierze
 *    wymagania z naszego serwera i nie wydaje ani grosza.
 *  - TRASOWANIE FACILITATOROW POTWIERDZONE, nie zalozone. Wyslane dwa celowo
 *    bledne podpisy - po jednym na siec - i odpowiedzi przyszly OD ROZNYCH
 *    facilitatorow, co widac po ich wlasnym slownictwie:
 *      eip155:4663 -> "invalid_payment"                       (Primer)
 *      eip155:8453 -> "invalid_exact_evm_payload_signature:
 *                      invalid signature: signature R + N >= P" (CDP, slowo
 *                      w slowo to samo, co CDP odpowiedzial odpytany wprost)
 *    Gdyby Base szedl przez Primera - a poszedlby, gdyby zostawic rozstrzyganie
 *    kolejnosci w tablicy facilitatorow - obie odpowiedzi bylyby identyczne.
 *    Verify odmowilo, wiec settle sie nie odpalilo i nic sie nie ruszylo.
 *
 * NIE PRZESZLO, BO NIKT TEGO NIE PROBOWAL:
 *  - Przez Base nie przeszla ANI JEDNA platnosc. Rozliczenie na tej sieci jest
 *    SKONFIGUROWANE I OGLOSZONE, a nie sprawdzone. Nie pisac o nim inaczej.
 *    Jedyne potwierdzone settle to nadal ten jeden przelew 0,01 USDG na 4663.
 *
 * === CENA TEGO, ZE SIECI SA DWIE ===
 * @x402/next wola initialize() przed pierwszym zadaniem, a walidacja trasy
 * (x402HTTPResourceServer.validateRouteConfiguration) RZUCA, gdy ktorakolwiek
 * pozycja `accepts` nie ma pokrycia w /supported. Dolozenie drugiej sieci
 * dokladalo wiec drugi powod, dla ktorego cala trasa POST /api/asks moglaby
 * przewrocic - lacznie ze sciezka USDG, ktora z CDP nie ma nic wspolnego.
 * Dlatego NetworkRoutedFacilitatorClient.getSupported() przezywa awarie
 * pojedynczego facilitatora (szczegoly i uzasadnienie tam). Odpowiedz 402
 * pozostaje wtedy pelna, ale platnosc na chorej sieci zostanie ODRZUCONA -
 * nie pobrana i nie obiecana.
 */

import type { Network } from '@x402/core/types';

/** Domyslna cena zalozenia Aska. Stawka wpisowa, nie budzet. */
const DEFAULT_ASK_POST_PRICE = '$0.01';

/**
 * Domyslna siec: Base Sepolia w CAIP-2.
 *
 * === UWAGA: TO NIE JEST SIEC, NA KTOREJ TO DZIS CHODZI ===
 * To tylko awaryjna wartosc dla wdrozenia bez konfiguracji. Wdrozenie, ktore
 * przyjelo prawdziwa platnosc, mialo X402_NETWORK=eip155:4663 i placilo w USDG
 * (wariant 2 nizej). Nie wnioskuj z tej stalej, gdzie ida pieniadze - odpowiedz
 * na to daje GET /api/asks, a wiazaco: naglowek `payment-required` przy 402.
 *
 * DLACZEGO NIE MAINNET DOMYSLNIE: publiczny facilitator
 * (https://x402.org/facilitator/supported) deklaruje dla schematu `exact`
 * i przestrzeni eip155 WYLACZNIE `eip155:84532`. Sprawdzone na zywo.
 * Na kazdej innej sieci EVM zadanie konczyloby sie bledem facilitatora
 * zamiast uczciwym 402 - wiec testnet jest jedynym wariantem, ktory dziala
 * bez dodatkowej konfiguracji.
 *
 * === SA DWA MAINNETY I OD 2026-08-08 IDA NARAZ ===
 * Wczesniej stalo tu "oba DA SIE wlaczyc" i byla to instrukcja PRZELACZANIA:
 * X402_NETWORK wskazywalo jedna siec, `accepts` w odpowiedzi 402 mialo jedna
 * pozycje, a agent bez USDG na Robinhoodzie po prostu odpadal. Protokol x402
 * pozwala podac WIELE pozycji i to KLIENT wybiera, czym zaplaci - wiec teraz
 * oglaszamy obie. Ktore konkretnie: patrz getAskPaymentOptions() nizej.
 *
 * 1. BASE (eip155:8453) - facilitator Coinbase CDP:
 *      CDP_API_KEY_ID + CDP_API_KEY_SECRET   <- i NIC WIECEJ
 *
 *    UWAGA, TU BYL BLAD W TEJ INSTRUKCJI. Stalo tu "ustaw
 *    X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402".
 *    To ZEPSULOBY platnosci: kod sprawdzal `if (url)` JAKO PIERWSZE i budowal
 *    HTTPFacilitatorClient({url}) BEZ naglowkow uwierzytelniajacych, a CDP bez
 *    klucza odpowiada 401. Ta pulapka JUZ NIE ISTNIEJE - wybor facilitatora
 *    jest teraz mapa siec -> plan (NETWORK_FACILITATORS nizej), a nie kolejnoscia
 *    ifow, wiec adres z env nie ma jak podmienic galezi CDP.
 *
 *    Klucze CDP_API_KEY_ID i CDP_API_KEY_SECRET sa juz w env tego projektu,
 *    a @coinbase/x402 JEST juz w package.json. Na tej sciezce `extra` domeny
 *    EIP-712 wypelnia sie samo, bo eip155:8453 siedzi w DEFAULT_STABLECOINS
 *    biblioteki: USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,
 *    name "USD Coin", version "2", 6 miejsc. Sprawdzone na lancuchu tak samo
 *    jak USDG: zhaszowana domena rowna sie DOMAIN_SEPARATOR() kontraktu
 *    (0x02fa7265e7c5d81118673727957699e4d68f74cd74b7db77da710fe8a2c7834f).
 *
 *    CDP odpytany kluczami z env 2026-08-08: /supported HTTP 200 deklaruje
 *    {x402Version 2, scheme "exact", network "eip155:8453"} (oraz `upto`
 *    i `batch-settlement`, ktorych nie rejestrujemy). Samo /supported to za malo
 *    - kosztowal nas juz facilitator z idealnym /supported i HTTP 500 na kazde
 *    /verify - wiec zawolane zostalo takze POST /verify z celowo zepsutym
 *    podpisem: HTTP 400 i STRUKTURALNA odmowa
 *    {"isValid":false,"invalidReason":"invalid_exact_evm_payload_signature",
 *     "payer":"0x...2"}. Odzyskany adres placacego dowodzi, ze CDP przeszedl
 *    przez siec, aktyw i kwote az do odtwarzania ECDSA - dokladnie ta sama
 *    glebokosc dowodu, co przy Primerze.
 *
 *    CZEGO TO NIE DOWODZI: przez Base nie przeszla ANI JEDNA nasza platnosc.
 *    Sciezka jest ogloszona i skonfigurowana, nie przejechana.
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
 *    Mamy @x402/core 2.21, a route.ts rejestruje schemat pod CAIP-2.
 *    Nie ma czesci wspolnej - agent dostawalby blad
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
 *
 *    OSTROZNIE Z JEGO /stats. Stalo tu "27 466 rozliczonych platnosci, wiec to
 *    dzialajacy produkt" - liczba jest prawdziwa, ale wniosek za szeroki: to
 *    suma po WSZYSTKICH lancuchach, ktore ten facilitator obsluguje, a nie
 *    dowod ruchu na 4663. Sygnatariusz Primera na TYM lancuchu mial przy
 *    sprawdzeniu 0,000273 ETH gazu i 19 transakcji w calej historii. Dziala -
 *    ale to swiezy tor, nie ubita droga, i tak trzeba o nim pisac.
 *
 *    UWAGA NA TOKEN "PR": strona Primera podaje dla tej sieci adres
 *    0x235767cc3d01ec18B5db87973975AC8616b2A153. To ICH wlasny token (symbol
 *    odczytany z lancucha: "PR"), NIE USDG. Nie wpisywac go do ASK_ASSETS.
 *
 *    UWAGA DRUGA, WAZNA OD CHWILI, GDY OGLASZAMY DWIE SIECI: Primer deklaruje
 *    w /supported takze eip155:8453, czyli NASZE BASE (sprawdzone 2026-08-08:
 *    8453, 84532, 4663, 46630, 324705682, 1187947933). Zakresy facilitatorow
 *    sie NAKLADAJA, a x402ResourceServer rozstrzyga takie kolizje KOLEJNOSCIA
 *    w tablicy facilitatorow - wiec przy naiwnym [Primer, CDP] platnosci na Base
 *    poszlyby do Primera, mimo kluczy CDP w env i mimo tego komentarza. Dlatego
 *    przypisanie sieci do facilitatora jest JAWNE i nie zalezy od kolejnosci:
 *    patrz NETWORK_FACILITATORS nizej i NetworkRoutedFacilitatorClient
 *    w app/utils/x402/facilitators.ts.
 *
 *    === TO JUZ PRZESZLO. SETTLE POTWIERDZONY NA ZYWO ===
 *    Stal tu warunek: "zanim ogloszimy to na stronie produktu, trzeba puscic
 *    jedna platnosc na 0,01 USDG". Zostal spelniony przez scripts/x402PayAsk.mjs:
 *    402 z wymaganiami -> podpis EIP-3009 -> ponowienie z PAYMENT-SIGNATURE ->
 *    201 z identityVia: "x402". Na lancuchu placacy 0xD4885A5a... stracil
 *    10 000 jednostek, odbiorca 0xF1fa2002... dostal 10 000 - czyli 0,01 USDG.
 *    Placacy NIE placil gazu; transakcje wyslal facilitator.
 *
 *    CO Z TEGO NIE WYNIKA. Jeden przebieg, jeden cent, dwa NASZE adresy. To
 *    dowod, ze sciezka dziala, a nie ze ktokolwiek nia chodzi. Nie wolno tego
 *    nazwac "przetestowane w boju" ani "dziala w produkcji" - ani tutaj, ani
 *    na stronie.
 *
 *    Domena EIP-712 dla USDG (potrzebna do podpisu, odtworzona z
 *    DOMAIN_SEPARATOR, bo eip712Domain() na tym kontrakcie rewertuje):
 *      name="Global Dollar", version="1", chainId=4663,
 *      verifyingContract=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
 */
const DEFAULT_ASK_NETWORK = 'eip155:84532';

/** Base mainnet - siec dolaczana do oferty, gdy tylko sa klucze CDP. */
const BASE_MAINNET = 'eip155:8453';

/** Facilitator Robinhood Chain. Adres domyslny, nadpisywalny z env. */
const PRIMER_FACILITATOR_URL = 'https://x402.primer.systems';

/**
 * Skad brac facilitatora dla danej sieci.
 *
 * `cdp` MUSI byc osobnym rodzajem, a nie adresem: facilitator Coinbase wymaga
 * naglowka Authorization z JWT budowanym przez createFacilitatorConfig, wiec
 * "adres URL" go NIE opisuje. To jest ta sama roznica, ktora kiedys zamienila
 * konfiguracje Base w ciche 401.
 */
export type AskFacilitatorPlan =
  | { kind: 'url'; url: string }
  | { kind: 'cdp' }
  | { kind: 'public' };

const NETWORK_FACILITATORS: Record<string, AskFacilitatorPlan> = {
  [BASE_MAINNET]: { kind: 'cdp' },
  'eip155:4663': { kind: 'url', url: PRIMER_FACILITATOR_URL },
  'eip155:84532': { kind: 'public' },
};

/** Jedna pozycja oferty: siec, jej waluta i facilitator, ktory ja rozlicza. */
export interface AskPaymentOption {
  network: Network;
  currency: string;
  facilitator: AskFacilitatorPlan;
}

/** Czy w ogole mamy czym uwierzytelnic sie w CDP. */
function hasCdpCredentials(): boolean {
  return (
    !!process.env.CDP_API_KEY_ID?.trim() && !!process.env.CDP_API_KEY_SECRET?.trim()
  );
}

/**
 * Adres facilitatora podany recznie dla KONKRETNEJ sieci.
 *
 * Dwie drogi, obie potrzebne:
 *  - X402_FACILITATOR_URL_<referencja CAIP-2>, np. X402_FACILITATOR_URL_4663 -
 *    jednoznaczna, dziala niezaleznie od tego, ktora siec jest glowna;
 *  - X402_FACILITATOR_URL - stara galka JEDNOSIECIOWA. Dziala WYLACZNIE dla
 *    sieci z X402_NETWORK i tylko dlatego, ze tak jest ustawione dzialajace
 *    wdrozenie (=primer.systems + eip155:4663). Gdyby stosowala sie do
 *    wszystkich sieci, wlaczenie Base przekierowaloby Base na Primera -
 *    dokladnie ten blad, ktory ten plik opisuje dwa akapity wyzej.
 */
function facilitatorUrlOverride(network: Network): string | undefined {
  const reference = network.split(':')[1];
  const perNetwork = process.env[`X402_FACILITATOR_URL_${reference}`]?.trim();
  if (perNetwork) return perNetwork;

  const legacy = process.env.X402_FACILITATOR_URL?.trim();
  if (legacy && network === getAskNetwork()) return legacy;

  return undefined;
}

/**
 * Kto rozlicza platnosci na tej sieci. `null` znaczy DOKLADNIE jedno: nie mamy
 * czym - i wtedy tej sieci nie wolno ogloszic w odpowiedzi 402.
 */
export function getAskFacilitatorPlan(network: Network): AskFacilitatorPlan | null {
  const url = facilitatorUrlOverride(network);
  if (url) return { kind: 'url', url };

  // Siec spoza mapy dostaje publicznego facilitatora. On obsluguje tylko Base
  // Sepolia, wiec kazda inna skonczy sie GLOSNYM bledem konfiguracji przy
  // starcie trasy - i tak ma byc. Zgadywanie facilitatora byloby gorsze.
  const plan = NETWORK_FACILITATORS[network] ?? ({ kind: 'public' } as const);
  if (plan.kind === 'cdp' && !hasCdpCredentials()) return null;
  return plan;
}

/**
 * PELNA OFERTA PLATNOSCI - to trafia do `accepts` odpowiedzi 402 i do GET.
 *
 * Kolejnosc to nasza PREFERENCJA, nie nakaz: protokol x402 zostawia wybor
 * klientowi, wiec agent moze wziac dowolna pozycje z listy.
 *
 * Domyslnie: siec z X402_NETWORK plus Base mainnet, o ile sa klucze CDP.
 * Bez kluczy Base po prostu nie ma na liscie - lepiej nie ogloszic sieci, niz
 * ogloszic i odbic kazda platnosc na 401.
 *
 * X402_ASK_NETWORKS (lista CAIP-2 po przecinku) nadpisuje ten dobor w calosci.
 * Istnieje po to, zeby wylaczyc jedna siec BEZ wdrozenia kodu - bo lista sieci
 * jest czytana raz, przy budowaniu trasy (withX402 dostaje `accepts` w chwili
 * ladowania modulu i nie da sie tego zrobic per zadanie). Cena i adres odbiorcy
 * czytane sa juz per zadanie i tego ograniczenia nie maja.
 */
export function getAskPaymentOptions(): AskPaymentOption[] {
  const explicit = process.env.X402_ASK_NETWORKS?.trim();
  const wanted = explicit
    ? explicit
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => NETWORK_RE.test(entry))
    : defaultAskNetworks();

  const options: AskPaymentOption[] = [];
  const seen = new Set<string>();
  for (const network of wanted) {
    if (seen.has(network)) continue;
    const facilitator = getAskFacilitatorPlan(network as Network);
    if (!facilitator) continue;
    seen.add(network);
    options.push({
      network: network as Network,
      currency: getAskCurrencySymbolFor(network as Network),
      facilitator,
    });
  }

  if (options.length > 0) return options;

  // Pusta oferta oznaczalaby odpowiedz 402 z pustym `accepts`, czyli zadanie
  // zaplaty bez podania czym - agent nie ma wtedy nic do podpisania. Wolimy
  // oddac siec glowna z publicznym facilitatorem i pozwolic jej odmowic
  // glosno przy starcie, niz wystawic zadanie bez tresci.
  const fallback = getAskNetwork();
  return [
    {
      network: fallback,
      currency: getAskCurrencySymbolFor(fallback),
      facilitator: getAskFacilitatorPlan(fallback) ?? { kind: 'public' },
    },
  ];
}

/** Siec glowna, a do niej Base - bo wiekszosc agentow trzyma USDC wlasnie tam. */
function defaultAskNetworks(): string[] {
  const primary = getAskNetwork();
  return primary === BASE_MAINNET ? [primary] : [primary, BASE_MAINNET];
}

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
 * a nie przepuscic za darmo - patrz `payTo` w route.ts.
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
export function getAskPriceFor(
  network: Network
):
  | string
  | { asset: string; amount: string; extra: { name: string; version: string } } {
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

/**
 * Symbol waluty na danej sieci - do pokazania czlowiekowi i agentowi
 * przy WYBORZE sieci. Nie uzywany do rozliczenia: tam liczy sie wylacznie
 * `asset` z odpowiedzi 402.
 */
export function getAskCurrencySymbolFor(network: Network): string {
  return ASK_ASSETS[network]?.symbol ?? 'USDC';
}

/** Waluta sieci glownej - zgodnosc wsteczna dla pola `payment.currency` w GET. */
export function getAskCurrencySymbol(): string {
  return getAskCurrencySymbolFor(getAskNetwork());
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
