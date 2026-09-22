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
 * Adres wlasnej domeny. Bierzemy go z zadania, a nie ze stalej, bo ta sama
 * trasa musi dzialac na podgladzie Vercela i na localhoscie - a ikona w karcie
 * Blinka MUSI byc adresem absolutnym.
 */
export function originFrom(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  // Podglad Vercela ma wlasna domene i to na niej stoi ikona.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  try {
    const url = new URL(request.url);
    // `next dev -H 0.0.0.0` sprawia, ze origin zadania brzmi
    // "http://0.0.0.0:3000". To adres nasluchu, a NIE adres, pod ktory da sie
    // wejsc - ikona Blinka z takim hostem nigdy sie nie pobierze i karta
    // zostanie pusta. Zmierzone przy pierwszym tescie trasy.
    if (url.hostname === '0.0.0.0' || url.hostname === '::') {
      return `${url.protocol}//localhost:${url.port}`;
    }
    return url.origin;
  } catch {
    return 'https://mysphere.fun';
  }
}
