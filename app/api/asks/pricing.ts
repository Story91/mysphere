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
 *      X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
 *      X402_NETWORK=eip155:8453
 *    UWAGA: ten facilitator WYMAGA UWIERZYTELNIENIA (CDP_API_KEY_ID
 *    i CDP_API_KEY_SECRET - oba sa juz w env tego projektu). Zwykly
 *    HTTPFacilitatorClient przyjmuje tylko `url` i `timeout`, bez naglowkow,
 *    wiec samo przestawienie zmiennej NIE WYSTARCZY: `GET /supported` bez
 *    klucza zwraca "Unauthorized" (sprawdzone). Potrzebna jest paczka
 *    @coinbase/x402, ktorej w package.json jeszcze nie ma.
 *
 * 2. ROBINHOOD CHAIN (eip155:4663) - facilitator VLED, USDG, gasless:
 *      X402_FACILITATOR_URL=<endpoint VLED>
 *      X402_NETWORK=eip155:4663
 *    Ten dziala BEZ klucza i BEZ nowej zaleznosci - stad ASK_ASSETS ponizej.
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
const ASK_ASSETS: Record<string, { asset: string; decimals: number; symbol: string }> = {
  'eip155:4663': {
    asset: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    decimals: 6,
    symbol: 'USDG',
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
export function getAskPrice(): string | { asset: string; amount: string } {
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
  return { asset: known.asset, amount };
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
