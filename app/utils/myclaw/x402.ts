/**
 * Konfiguracja x402 v2 dla MyClaw Academy.
 *
 * Pakiety: @x402/next 2.21 (withX402), @x402/core (x402ResourceServer,
 * HTTPFacilitatorClient), @x402/evm (ExactEvmScheme - implementacja serwerowa).
 *
 * Roznice wobec martwej galezi v1 (`x402-next`):
 *  - sieci w formacie CAIP-2: "base" -> "eip155:8453", "base-sepolia" -> "eip155:84532"
 *  - naglowki: X-PAYMENT -> PAYMENT-SIGNATURE, X-PAYMENT-RESPONSE -> PAYMENT-RESPONSE
 *  - konfiguracja route'u przez pole `accepts` (PaymentOption | PaymentOption[])
 *  - dla App Router API routes uzywamy `withX402`, nie middleware: settlement
 *    nastepuje dopiero PO udanej odpowiedzi handlera (status < 400), wiec nie
 *    pobieramy pieniedzy za blad 4xx/5xx.
 */

import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
/**
 * ROZBIEZNOSC WERSJI - sprawdzone, ryzyko ograniczone.
 *
 * @x402/next 2.21 deklaruje peerDependency `next >= 16.2.6`, a ten projekt stoi
 * na Next 14.2.35. Instalacja przechodzi tylko dzieki --legacy-peer-deps.
 *
 * Dlaczego mimo to uzywamy tego pakietu: sprawdzone, ze @x402/next importuje
 * WYLACZNIE z "next/server" - stabilnego API obecnego w Next 14. Wymog Next 16
 * dotyczy najpewniej sciezki `paymentProxy`, ktora opiera sie na pliku proxy.ts
 * wprowadzonym dopiero w Next 16. My tej sciezki NIE uzywamy - bierzemy
 * `withX402` na poziomie pojedynczych API routes.
 *
 * Czego to NIE gwarantuje: pelnej sciezki 402 przy wlaczonym egzekwowaniu nikt
 * jeszcze nie przeszedl na tej kombinacji wersji. Przed ustawieniem
 * X402_PAY_TO_ADDRESS na produkcji zrob realny handshake na Base Sepolia
 * (eip155:84532).
 */
import { withX402 } from "@x402/next";
import type { NextRequest, NextResponse } from "next/server";

/** Base mainnet w formacie CAIP-2 (x402 v2). */
export const MYCLAW_NETWORK: Network = "eip155:8453";

/** Czytelna nazwa sieci - tylko do odpowiedzi JSON, nie do konfiguracji x402. */
export const MYCLAW_NETWORK_NAME = "base";

/** Cennik - jedno zrodlo prawdy dla /catalog i dla wrapperow platnosci. */
export const MYCLAW_PRICES = {
  lesson: "$0.001",
  challenge: "$0.005",
  certification: "$0.01",
  certificateMint: "$0.05",
} as const;

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

let payToWarningLogged = false;

/**
 * Adres odbiorcy platnosci. Brak zmiennej (albo niepoprawny adres) = brak
 * egzekwowania platnosci. Nie wywalamy endpointu - to tylko wylacza x402.
 */
export function getPayToAddress(): string | null {
  const raw = process.env.X402_PAY_TO_ADDRESS?.trim();
  if (!raw) {
    if (!payToWarningLogged) {
      payToWarningLogged = true;
      console.warn(
        "[myclaw/x402] X402_PAY_TO_ADDRESS is not set - payment enforcement is DISABLED. " +
          "MyClaw endpoints are served for free until the variable is configured."
      );
    }
    return null;
  }
  if (!EVM_ADDRESS_RE.test(raw)) {
    if (!payToWarningLogged) {
      payToWarningLogged = true;
      console.warn(
        `[myclaw/x402] X402_PAY_TO_ADDRESS is not a valid EVM address ("${raw}") - payment enforcement is DISABLED.`
      );
    }
    return null;
  }
  return raw;
}

/** Czy egzekwowanie platnosci jest aktywne w tym procesie. */
export function isX402EnforcementEnabled(): boolean {
  return getPayToAddress() !== null;
}

let resourceServer: x402ResourceServer | null = null;

/**
 * Jeden wspoldzielony x402ResourceServer: schemat `exact` na Base mainnet,
 * weryfikacja i settlement przez facilitatora HTTP.
 */
function getResourceServer(): x402ResourceServer {
  if (!resourceServer) {
    const facilitatorUrl = process.env.X402_FACILITATOR_URL?.trim();
    const facilitator = new HTTPFacilitatorClient(facilitatorUrl ? { url: facilitatorUrl } : undefined);
    resourceServer = new x402ResourceServer(facilitator).register(MYCLAW_NETWORK, new ExactEvmScheme());
  }
  return resourceServer;
}

export type MyClawPaymentConfig = {
  /** Cena w formacie Money, np. "$0.001". */
  price: string;
  /** Opis zasobu pokazywany w odpowiedzi 402. */
  description: string;
};

/**
 * Owija handler App Routera platnoscia x402.
 *
 * Gdy X402_PAY_TO_ADDRESS nie jest ustawione - zwraca handler bez zmian, wiec
 * endpoint dziala jak dotad (darmowo). Konstrukcja wrappera jest leniwa i
 * cache'owana: env czytamy przy pierwszym zadaniu, nie w czasie importu modulu.
 *
 * Uwaga: handler dostaje wylacznie `request` (tak wywoluje go withX402), wiec
 * trasy dynamiczne musza przekazac sobie `params` innym kanalem - patrz
 * requestParams ponizej.
 */
export function withMyClawPayment<T>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  config: MyClawPaymentConfig
): (request: NextRequest) => Promise<NextResponse<T>> {
  let wrapped: ((request: NextRequest) => Promise<NextResponse<T>>) | null = null;
  let resolved = false;

  return async (request: NextRequest): Promise<NextResponse<T>> => {
    if (!resolved) {
      resolved = true;
      const payTo = getPayToAddress();
      if (payTo) {
        wrapped = withX402<T>(
          handler,
          {
            accepts: {
              scheme: "exact",
              network: MYCLAW_NETWORK,
              payTo,
              price: config.price,
            },
            description: config.description,
            mimeType: "application/json",
          },
          getResourceServer()
        );
      }
    }
    return wrapped ? wrapped(request) : handler(request);
  };
}

/**
 * Kanal przekazania `params` z trasy dynamicznej do handlera owinietego
 * przez withX402. Klucz to ten sam obiekt NextRequest, wiec wpis znika razem
 * z zadaniem (WeakMap).
 */
const requestParams = new WeakMap<NextRequest, Record<string, string>>();

export function setRequestParams(request: NextRequest, params: Record<string, string>): void {
  requestParams.set(request, params);
}

export function getRequestParam(request: NextRequest, key: string): string | undefined {
  return requestParams.get(request)?.[key];
}

/** Blok `payment` doklejany do odpowiedzi - odzwierciedla stan faktyczny. */
export function paymentInfo(price: string, description: string) {
  const enforced = isX402EnforcementEnabled();
  return {
    protocol: "x402",
    version: 2,
    scheme: "exact",
    price,
    currency: "USDC",
    network: MYCLAW_NETWORK,
    networkName: MYCLAW_NETWORK_NAME,
    enforced,
    description,
    note: enforced
      ? "Paid resource. Unpaid requests receive 402 with payment requirements; retry with the PAYMENT-SIGNATURE header. Settlement happens only after a successful response."
      : "X402_PAY_TO_ADDRESS is not configured on this deployment, so payment is not enforced and this resource is served for free.",
  };
}
