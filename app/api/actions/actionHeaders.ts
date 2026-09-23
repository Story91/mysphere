/**
 * Naglowki wspolne dla wszystkich tras Solana Actions (Blinkow).
 *
 * ===========================================================================
 * DLACZEGO TO NIE JEST ZWYKLY ENDPOINT JSON
 * ===========================================================================
 * Blinka nie odpytuje przegladarka uzytkownika stojaca na naszej domenie,
 * tylko CUDZY klient: rozszerzenie Phantoma renderujace karte na X, portfel
 * Solflare, interstycjal dial.to. Dla nich nasza trasa jest zasobem
 * miedzydomenowym, wiec bez CORS zobacza wylacznie blad preflightu.
 *
 * `X-Action-Version` i `X-Blockchain-Ids` nie sa ozdoba - klient po nich
 * rozpoznaje, ze to w ogole jest Action i na ktorym lancuchu ma go wykonac.
 * Brak tych naglowkow to karta, ktora sie nie rysuje.
 *
 * `Access-Control-Expose-Headers` jest konieczne, bo bez niego przegladarka
 * UKRYJE te dwa naglowki przed skryptem klienta, mimo ze je dostanie. Karta
 * znow sie nie narysuje, a w konsoli nie bedzie o tym ani slowa.
 */

import { IS_SOLANA_MAINNET } from '../../basechat/Solana/config/solanaChain';

/**
 * Identyfikatory lancucha w formacie CAIP-2. To skrocone hashe genezy, a nie
 * nazwy - klient porownuje je znak w znak, wiec nie wolno ich "poprawiac".
 */
const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

/** Wersja specyfikacji Actions, ktorej trzymaja sie te trasy. */
const ACTION_VERSION = '2.4';

export const ACTION_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids',
  'Access-Control-Expose-Headers': 'X-Action-Version, X-Blockchain-Ids',
  // `charset=utf-8` nie jest ozdoba: bez niego klient czyta odpowiedz jako
  // latin-1 i kazdy znak spoza ASCII rozpada sie na krzaki. Zmierzone - tytul
  // "Tip 0xF1…1Dfd" przyszedl jako "Tip 0xF1â€¦1Dfd", bo wielokropek to UTF-8.
  'Content-Type': 'application/json; charset=utf-8',
  'X-Action-Version': ACTION_VERSION,
  'X-Blockchain-Ids': IS_SOLANA_MAINNET ? SOLANA_MAINNET_CAIP2 : SOLANA_DEVNET_CAIP2,
};

/** Blad w ksztalcie, ktorego oczekuje klient Blinka - inaczej pokaze "coś poszło nie tak". */
export function actionError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ message }), { status, headers: ACTION_HEADERS });
}

export function actionJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: ACTION_HEADERS });
}

/**
 * Adres wlasnej domeny - potrzebny WYLACZNIE do ikony karty, ktora musi byc
 * adresem absolutnym. Linki akcji (`href`, `links.next`) sa WZGLEDNE: klient
 * Blinka rozwiazuje je wzgledem adresu, z ktorego pobral akcje.
 *
 * === DLACZEGO NIE `VERCEL_URL` ===
 * Do 23.09.2026 stal tu `VERCEL_URL`, gdy brakowalo NEXT_PUBLIC_SITE_URL.
 * Przeglad przeciwnika sprawdzil to na prod: `VERCEL_URL` to host
 * KONKRETNEGO deploymentu (mysphere-xxxx.vercel.app), a projekt ma wlaczona
 * ochrone SSO dla takich adresow. Ikona, akcje i callback prowadzily wiec na
 * strone logowania Vercela - karta w X bylaby martwa. Host bierzemy z samego
 * zadania: to jest dokladnie ta domena, pod ktora klient nas znalazl.
 */
export function originFrom(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost && !/^(0\.0\.0\.0|\[?::\]?)(:|$)/.test(forwardedHost)) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    return `${proto.split(',')[0].trim()}://${forwardedHost.split(',')[0].trim()}`;
  }

  try {
    const url = new URL(request.url);
    // `next dev -H 0.0.0.0` sprawia, ze origin zadania brzmi
    // "http://0.0.0.0:3000". To adres nasluchu, a NIE adres, pod ktory da sie
    // wejsc - ikona Blinka z takim hostem nigdy sie nie pobierze.
    if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
      return `${url.protocol}//localhost:${url.port}`;
    }
    return url.origin;
  } catch {
    // Domena produkcyjna projektu (nie deploymentu) - bez ochrony SSO.
    const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return production ? `https://${production}` : 'https://mysphere.fun';
  }
}

/**
 * Bezpiecznik: produkcja zbudowana na devnecie nie wystawia Blinkow.
 *
 * NEXT_PUBLIC_SOLANA_CLUSTER jest wklejany w kod przy buildzie. Gdy go brakuje,
 * aplikacja cicho wraca na devnet - a karta Blinka z naglowkiem devnetu jest
 * odrzucana przez portfele na mainnecie, podczas gdy link do niej krazy juz
 * po X (znalezisko z przegladu 2026-09-23: dokladnie tak stal prod). Lepiej
 * odmowic jasnym komunikatem niz pokazac karte, ktora nic nie zrobi.
 */
export function misconfiguredCluster(): Response | null {
  if (blinksDisabled()) {
    return actionError('Solana is not switched to mainnet on this deployment yet.', 503);
  }
  return null;
}

/**
 * Ta sama decyzja co misconfiguredCluster, bez odpowiedzi HTTP - dla stron,
 * ktore linkuja do Blinkow (np. /post/[id]). Link do akcji, ktora i tak
 * odpowie 503, to obietnica bez pokrycia.
 */
export function blinksDisabled(): boolean {
  return process.env.VERCEL_ENV === 'production' && !IS_SOLANA_MAINNET;
}
