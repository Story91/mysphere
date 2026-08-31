import 'server-only';
import type { NextRequest } from 'next/server';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { getSessionFromCookies } from '../../utils/auth/session';
import { isAskPaymentEnforced } from './pricing';

/**
 * Kto sklada to zadanie.
 *
 * === ZASADA, KTORA TU OBOWIAZUJE ===
 * Adres z ciala zadania NIE JEST tozsamoscia. Jest to zapisane wprost w
 * app/api/premium/route.ts i dotyczy tak samo Askow: gdyby autor Aska bral sie
 * z JSON-a, kazdy zakladalby Aski w cudzym imieniu, a `resolve rate` - jedyna
 * liczba chroniaca odpowiadajacych - byla by do wpisania z palca.
 *
 * === DWIE DROGI, BO SA DWAJ KUPUJACY ===
 * Manifest mowi: "The buyer does not have to be human". Czlowiek ma przegladarke
 * i podpisana sesje SIWE. Agent nie ma ani przegladarki, ani konta - ma
 * podpisana autoryzacje platnosci x402. Obie sa dowodem posiadania klucza
 * prywatnego, tylko z innego obrzadku.
 *
 *   sesja SIWE       cookie podpisane HMAC po weryfikacji podpisu on-chain
 *   platnosc x402    `authorization.from` z ladunku PAYMENT-SIGNATURE
 *
 * Ladunek platnosci czytamy DOPIERO wtedy, gdy bramka jest uzbrojona
 * (X402_PAY_TO_ADDRESS ustawiony), bo tylko wtedy `withX402` zdazyl zweryfikowac
 * ten naglowek u facilitatora, zanim oddal sterowanie handlerowi (middleware.ts
 * NIE ISTNIEJE - powod przy `export const POST` w route.ts). Bez tego warunku
 * wystarczyloby dokleic wlasnorecznie
 * sklecony naglowek, zeby podac sie za dowolny adres.
 */

export type Requester = {
  address: string;
  /** Skad wzieta tozsamosc - trafia do odpowiedzi, zeby bylo jawne. */
  via: 'session' | 'x402';
};

/**
 * Adres z podpisanej sesji albo null.
 *
 * Blad odczytu (najczesciej brak AUTH_SESSION_SECRET) traktujemy jak brak
 * sesji. Failujemy zamknieto - brak konfiguracji ma znaczyc "nie wiem, kto to",
 * nigdy "wpusc".
 */
export function sessionAddress(request: NextRequest): string | null {
  try {
    return getSessionFromCookies(request.cookies)?.address ?? null;
  } catch {
    return null;
  }
}

/** Adres platnika z ladunku x402 - wylacznie schemat `exact` na EVM. */
function payerFromPaymentHeader(request: NextRequest): string | null {
  const header =
    request.headers.get('payment-signature') ?? request.headers.get('x-payment') ?? null;
  if (!header) return null;

  try {
    const payload = decodePaymentSignatureHeader(header);
    const inner = payload.payload as Record<string, unknown> | undefined;
    const authorization = inner?.authorization as Record<string, unknown> | undefined;
    const from = authorization?.from;
    if (typeof from !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(from)) return null;
    return from;
  } catch {
    // Niepoprawny naglowek to brak tozsamosci, nie blad serwera. Zadanie
    // i tak nie przeszloby bramki, gdyby platnosc byla wymagana.
    return null;
  }
}

/**
 * Tozsamosc skladajacego zadanie albo null, gdy zadna droga nie dala dowodu.
 *
 * Sesja ma pierwszenstwo: gdy czlowiek jest zalogowany i JEDNOCZESNIE placi
 * przez x402, Ask ma nalezec do niego, a nie do portfela, ktorym akurat
 * zaplacil.
 */
export function getRequester(request: NextRequest): Requester | null {
  const fromSession = sessionAddress(request);
  if (fromSession) return { address: fromSession, via: 'session' };

  if (!isAskPaymentEnforced()) return null;

  const fromPayment = payerFromPaymentHeader(request);
  if (fromPayment) return { address: fromPayment, via: 'x402' };

  return null;
}
