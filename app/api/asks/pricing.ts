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
 * DLACZEGO NIE MAINNET, skoro cala reszta aplikacji stoi na Base (8453):
 * publiczny facilitator (https://x402.org/facilitator) deklaruje dla schematu
 * `exact` wylacznie `eip155:84532`. Na `eip155:8453` kazde zadanie konczyloby
 * sie bledem facilitatora zamiast uczciwym 402. Mainnet wymaga facilitatora,
 * ktory go obsluguje - wskaz go przez X402_FACILITATOR_URL i przestaw
 * X402_NETWORK. Do tego czasu testnet jest jedynym wariantem, ktory dziala
 * naprawde, a nie tylko w opisie.
 */
const DEFAULT_ASK_NETWORK = 'eip155:84532';

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
