import { cleanTradeMessage, displayTradeMessage } from '../[address]/tradeMessage';
import type { Clash } from '../duel';

/**
 * Okrzyki druzyn pod stronami karty starcia ("Cheers") i drobiazgi do udostepnienia.
 * Czyste funkcje bez DOM-u i sieci, zeby dalo sie je przetestowac (test/ClashCheers.test.ts).
 *
 * Tresc przychodzi z lancucha (dopisek w calldata kupna), czyli od obcych - dlatego
 * przechodzi przez te same sita co tabela transakcji (`cleanTradeMessage`,
 * `displayTradeMessage`), a wiadomosc z linkiem albo adresem NIE jest pokazywana wcale
 * (w tabeli dostaje zaslepke, tu zaslepka tylko zasmiecalaby waski wiersz).
 * Z wiersza /api/launchpad/calls bierzemy WYLACZNIE tekst, autora, plakietke i czas:
 * `multiple` (to ruch perpa, nie dolarow, i brzmialby jak zwrot) oraz `paid` zostaja
 * po drugiej stronie.
 */

/** Ile okrzykow na strone karty. */
export const CHEERS_PER_SIDE = 2;
/** Sufit na adresy w `?tokens=`: 20 par starc to z zapasem cala tablice. */
export const MAX_CHEER_TOKENS = 40;
/** On-chain wiadomosc ma najwyzej 64 bajty; to sufit na wypadek cudzego klienta. */
export const CHEER_MAX_CHARS = 80;
/** Ile wierszy oddaje /api/launchpad/calls (tyle bylo przed filtrem). */
export const CALLS_LIMIT = 100;

const DAY_MS = 86_400_000;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
/** Okrzyk z przycisku "Back BULL" ("Team BULL: ") - pod strona BULL nic nie mowi. */
const TEAM_PREFIX = /^team\s+[a-z0-9]{1,12}\s*:\s*/i;

export type Cheer = {
  id: string;
  text: string;
  /** Skrocony portfel autora albo '' (brak poprawnego adresu). */
  who: string;
  /** Coinbase Verified - plakietka obok autora. */
  verified: boolean;
  /** Unix, sekundy (przyblizone z numeru bloku, jak w calls). */
  ts: number;
};

/**
 * `?tokens=0xa,0xb` z adresu trasy calls: adresy malymi literami, bez powtorzen i
 * bez smieci, najwyzej `MAX_CHEER_TOKENS`. `null` = filtra nie ma (brak parametru albo
 * pusty); pusta tablica = filtr jest, ale zaden adres nie przeszedl - wtedy trasa
 * oddaje zero wierszy, a nie cala liste (literowka nie ma ciagnac stu cudzych calli).
 */
export function parseTokensParam(raw: string | null | undefined): string[] | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const out: string[] = [];
  const seen = new Set<string>();
  // Dwa tysiace znakow to 40 adresow z przecinkami z zapasem; reszta jest smieciem.
  for (const part of raw.slice(0, 2000).split(',')) {
    const token = part.trim().toLowerCase();
    if (!ADDRESS.test(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= MAX_CHEER_TOKENS) break;
  }
  return out;
}

/**
 * Wiersze, ktore trasa calls ma oddac. Bez filtra: jak dotad, pierwsze `limit` (lista
 * jest juz posortowana wg mnoznika). Z filtrem: tylko wskazane tokeny, od NAJNOWSZEGO -
 * filtr dziala PRZED przycieciem, a okrzyki chca ostatnich wiadomosci, wiec przy ponad
 * `limit` wierszach to najstarsze, nie najnowsze, musza odpasc.
 */
export function selectCalls<T extends { token: string; ts: number }>(rows: readonly T[], only: readonly string[] | null, limit = CALLS_LIMIT): T[] {
  if (only === null) return rows.slice(0, limit);
  const wanted = new Set(only.map((t) => t.toLowerCase()));
  return rows
    .filter((r) => wanted.has(r.token.toLowerCase()))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
}

/** Adresy tokenow wszystkich starc (a potem b), male litery, bez powtorzen, do `MAX_CHEER_TOKENS`. */
export function cheerTokens(clashes: readonly Clash[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const clash of clashes ?? []) {
    for (const token of [clash.a, clash.b]) {
      if (!token) continue;
      const address = token.address.toLowerCase();
      if (!ADDRESS.test(address) || seen.has(address)) continue;
      seen.add(address);
      out.push(address);
      if (out.length >= MAX_CHEER_TOKENS) return out;
    }
  }
  return out;
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
}

/** Tekst okrzyku albo null, gdy nic z niego nie zostaje (pusty, sam przedrostek, link, adres). */
export function cheerText(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const clean = cleanTradeMessage(message);
  const body = clean.replace(TEAM_PREFIX, '').trim();
  if (!body) return null;
  // Zasloniete w tabeli = niepokazane tutaj. Sprawdzamy i calosc, i reszte po przedrostku.
  if (displayTradeMessage(clean) !== clean || displayTradeMessage(body) !== body) return null;
  return truncate(body, CHEER_MAX_CHARS);
}

function shortWallet(buyer: unknown): string {
  return typeof buyer === 'string' && ADDRESS.test(buyer) ? `${buyer.slice(0, 6)}…${buyer.slice(-4)}` : '';
}

/**
 * Okrzyki na strone: z listy calli (cudza odpowiedz, wiec sprawdzamy kazde pole) bierze
 * wiersze wskazanych tokenow, wyrzuca puste i zaslonete, powtorzenia tego samego autora
 * i tego samego tekstu, sortuje od najnowszego i zostawia `perSide` na token. Klucze to
 * adresy malymi literami; token bez okrzykow nie ma klucza.
 */
export function cheersFromCalls(calls: unknown, tokens: readonly string[], perSide = CHEERS_PER_SIDE): Record<string, Cheer[]> {
  const out: Record<string, Cheer[]> = {};
  if (!Array.isArray(calls)) return out;
  const wanted = new Set(tokens.map((t) => t.toLowerCase()));

  const rows: Array<{ token: string; text: string; who: string; verified: boolean; ts: number; id: string; at: number }> = [];
  calls.forEach((row: unknown, at) => {
    if (!row || typeof row !== 'object') return;
    const r = row as Record<string, unknown>;
    if (typeof r.token !== 'string') return;
    const token = r.token.toLowerCase();
    if (!wanted.has(token)) return;
    const text = cheerText(r.message);
    if (!text) return;
    rows.push({
      token,
      text,
      who: shortWallet(r.buyer),
      verified: r.verified === true,
      ts: typeof r.ts === 'number' && Number.isFinite(r.ts) ? r.ts : 0,
      id: `${token}-${typeof r.txHash === 'string' ? r.txHash : at}`,
      at,
    });
  });
  // Najnowsze pierwsze; przy tym samym czasie kolejnosc z odpowiedzi.
  rows.sort((x, y) => y.ts - x.ts || x.at - y.at);

  const seen = new Set<string>();
  for (const row of rows) {
    const list = out[row.token] ?? (out[row.token] = []);
    if (list.length >= perSide) continue;
    const key = `${row.token}|${row.who}|${row.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ id: row.id, text: row.text, who: row.who, verified: row.verified, ts: row.ts });
  }
  return out;
}

/**
 * Numer doby UTC - `?r=` w linku do plakatu. X trzyma pierwsza pobrana wersje strony
 * pod danym adresem, wiec co dobe link dostaje swiezy odczyt, a w obrebie doby wszystkie
 * udostepnienia jednej pary maja ten sam adres (jedna karta w cache, nie tysiac).
 */
export function dayRound(nowMs: number = Date.now()): number {
  return Number.isFinite(nowMs) ? Math.floor(nowMs / DAY_MS) : 0;
}
