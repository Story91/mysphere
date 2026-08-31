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
 * Co sie zmienilo, a czego ten warunek NIE obejmuje. Pelna sciezka 402 na tej
 * kombinacji wersji JUZ PRZESZLA - ale nie tutaj. Przeszla na `POST /api/asks`,
 * na Robinhood Chain (eip155:4663) w USDG, przez facilitator primer.systems.
 * To zdejmuje watpliwosc co do samej biblioteki na Next 14.2.35.
 *
 * CZEGO NIE ZDEJMUJE: przez TRASY MyClaw nie przeszla ani jedna platnosc.
 * Stoja one na eip155:8453 z facilitatorem CDP, czyli na zupelnie innej galezi
 * niz ta sprawdzona - inny lancuch, inny token, inny facilitator, inne
 * uwierzytelnienie. X402_PAY_TO_ADDRESS jest juz ustawiony, wiec egzekwowanie
 * na tych trasach CHODZI, mimo ze nikt ich nie przejechal. Warunek "zrob
 * realny handshake, zanim ustawisz adres" stal sie wiec bezprzedmiotowy nie
 * dlatego, ze go spelniono, tylko dlatego, ze adres ustawiono wczesniej.
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

/**
 * Cena zasobu. Stala (np. "$0.001") albo wyliczana z zadania.
 *
 * Wariant funkcyjny istnieje dla zasobow, ktorych cena rozni sie miedzy
 * zadaniami - jak Ask, gdzie kazde zlecenie ma wlasny budzet. Zwrocenie null
 * oznacza "tego zasobu nie wyceniamy" i przepuszcza zadanie do handlera, ktory
 * sam decyduje, co odpowiedziec (np. 404 na nieistniejacy zasob).
 */
export type MyClawPrice =
  | string
  | ((request: NextRequest) => string | null | Promise<string | null>);

export type MyClawPaymentConfig = {
  price: MyClawPrice;
  /** Opis zasobu pokazywany w odpowiedzi 402. */
  description: string;
};

/**
 * Owija handler App Routera platnoscia x402.
 *
 * Gdy X402_PAY_TO_ADDRESS nie jest ustawione - zwraca handler bez zmian, wiec
 * endpoint dziala jak dotad (darmowo). Env czytamy przy KAZDYM zadaniu, a nie
 * raz na proces: poprzednia wersja zapamietywala pierwsza decyzje na cale zycie
 * instancji, wiec ciepla instancja, ktora wystartowala przed ustawieniem
 * zmiennej, serwowala platne zasoby za darmo do konca swojego zycia.
 *
 * Wrapper jest cache'owany tylko dla ceny STALEJ i tylko dla konkretnego
 * `payTo` - zmiana adresu wymusza zbudowanie nowego. Przy cenie dynamicznej
 * wrapper powstaje per zadanie, bo `price` jest czescia konfiguracji withX402
 * i inaczej pierwsza cena zamrozilaby sie dla wszystkich kolejnych zadan.
 *
 * Uwaga: handler dostaje wylacznie `request` (tak wywoluje go withX402), wiec
 * trasy dynamiczne musza przekazac sobie `params` innym kanalem - patrz
 * requestParams ponizej.
 */
export function withMyClawPayment<T>(
  handler: (request: NextRequest) => Promise<NextResponse<T>>,
  config: MyClawPaymentConfig
): (request: NextRequest) => Promise<NextResponse<T>> {
  // Cache dla ceny stalej. Klucz to payTo, zeby zmiana adresu nie serwowala
  // platnosci na stary portfel.
  let cached: { payTo: string; run: (request: NextRequest) => Promise<NextResponse<T>> } | null =
    null;

  const build = (payTo: string, price: string) =>
    withX402<T>(
      handler,
      {
        accepts: {
          scheme: "exact",
          network: MYCLAW_NETWORK,
          payTo,
          price,
        },
        description: config.description,
        mimeType: "application/json",
      },
      getResourceServer()
    );

  return async (request: NextRequest): Promise<NextResponse<T>> => {
    const payTo = getPayToAddress();
    if (!payTo) return handler(request);

    if (typeof config.price === "string") {
      if (!cached || cached.payTo !== payTo) {
        cached = { payTo, run: build(payTo, config.price) };
      }
      return cached.run(request);
    }

    const price = await config.price(request);
    // Brak ceny = zasob nie podlega wycenie w tym zadaniu. Handler dostaje
    // zadanie bez bramki i sam decyduje o odpowiedzi.
    if (!price) return handler(request);

    return build(payTo, price)(request);
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
