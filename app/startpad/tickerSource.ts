import { formatEther } from 'viem';
import { base } from 'viem/chains';
import { LAUNCHPAD_NETWORKS, type LaunchpadNetwork } from './config';
import { parseTrade } from './[address]/historyScan';

/**
 * ZRODLO PASKA NA /basechat - czysta logika, bez Reacta, bez `window`.
 *
 * ===========================================================================
 * DLACZEGO TO STOI OSOBNO
 * ===========================================================================
 * Do 23.09.2026 pasek bral siec z `ACTIVE_LAUNCHPAD_NETWORK`, czyli z sieci
 * ostatnio wybranej na tablicy Startpada (localStorage `startpad.chainId`).
 * Przegladarka z zapisanym Arc pytala vault Arc o pozycje SPHERE - tokena,
 * ktory istnieje tylko na Base. Vault oddawal zerowy poolId bez bledu, zasiew
 * i subskrypcja puli nie startowaly wcale, a pasek wisial na "Watching
 * Startpad for live trades..." bez konca. Tak bylo od pierwszego dnia paska
 * u kazdego, kto kiedys przelaczyl siec.
 *
 * Wybor sieci, dekodowanie wierszy z serwera, okno czasu i stany paska sa
 * tutaj, bo `config.ts` w Node zawsze widzi Base (nie ma `window`), a
 * komponentu .tsx runner testow nie zaladuje. Test "zapisz 5042 i zaimportuj
 * pasek" przeszedlby, nie sprawdzajac niczego - te funkcje da sie sprawdzic
 * naprawde.
 */

/** Pasek pokazuje Base i tylko Base - tam zyje SPHERE i caly ruch launchpada. */
export const TICKER_CHAIN_ID: number = base.id;
export const TICKER_NETWORK: LaunchpadNetwork = LAUNCHPAD_NETWORKS[TICKER_CHAIN_ID];

/** Pasek pokazuje transakcje z ostatniej doby; starsze nie sa "na zywo". */
export const TICKER_WINDOW_SECONDS = 24 * 60 * 60;
export const TICKER_MAX_ITEMS = 20;

export type TickerTone = 'launch' | 'buy' | 'sell' | 'graduate';

export type TickerItem = {
  id: string;
  address?: string;
  symbol: string;
  label: string;
  eth?: number;
  tone: TickerTone;
  /**
   * Czas zdarzenia w sekundach unixowych. Przy wierszach z serwera to
   * estymata z numeru bloku (dokladna do ~2 s), przy zdarzeniach z subskrypcji
   * chwila odebrania. Bez tego pola pasek nie ma prawa nic pokazac - wiersz
   * bez czasu to wlasnie to, co udawalo "na zywo" transakcje sprzed tygodnia.
   */
  ts: number;
  /** Blok jako tekst dziesietny - JSON nie zna bigintow. */
  block?: string;
};

const TONES: ReadonlySet<string> = new Set(['launch', 'buy', 'sell', 'graduate']);
const POOL_ID_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DIGITS_RE = /^\d+$/;

/** Niezerowy bytes32. Zero to odpowiedz vaulta o tokenie, ktorego nie zna. */
export function isPoolId(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && POOL_ID_RE.test(value) && !/^0x0+$/.test(value);
}

/**
 * poolId do zasiewu i subskrypcji. Lancuch wygrywa, gdy odda niezerowa
 * wartosc; zero albo blad odczytu zostawiaja znana stala. Dawniej jeden
 * nieudany odczyt zostawial pasek bez puli do konca zycia strony.
 */
export function pickPoolId(
  known: string | null | undefined,
  onchain: string | null | undefined
): `0x${string}` | null {
  if (isPoolId(onchain)) return onchain;
  if (isPoolId(known)) return known;
  return null;
}

/**
 * Link z wiersza paska. `?c=8453` jest konieczne: bez niego strona tokena
 * otwieralaby sie na sieci z localStorage, a token z paska jest z Base.
 * Skutek uboczny jest swiadomy - `?c=` zapisuje sie jako wybrana siec, wiec
 * klikniecie przestawia tablice uzytkownika z Arc na Base.
 * Dziala tylko przy pelnym zaladowaniu strony (zwykle <a>): ACTIVE_LAUNCHPAD_NETWORK
 * liczy sie raz przy ladowaniu modulu, a next/link nie przeladowuje.
 */
export function tickerHref(address?: string): string {
  return address ? `/startpad/${address}?c=${TICKER_CHAIN_ID}` : `/startpad?c=${TICKER_CHAIN_ID}`;
}

/**
 * Adres zapytania o swapy puli. `sinceSeconds` przycina skan po stronie
 * serwera do ostatnich N sekund - bez niego serwer schodzi do ~3 dob wstecz,
 * a pasek i tak wyrzuca wszystko sprzed doby. Wartosc jest wzgledna, a nie
 * "od godziny X", zeby wszyscy ogladajacy wysylali ten sam adres i trafiali
 * w ten sam wpis cache'u brzegowego.
 */
export function poolSwapsPath(poolId: string, sinceSeconds?: number): string {
  const query = new URLSearchParams({
    chainId: String(TICKER_CHAIN_ID),
    poolId,
    decimals: '18',
    fromBlock: '0',
  });
  if (sinceSeconds !== undefined) query.set('sinceSeconds', String(sinceSeconds));
  return `/api/launchpad/pool-swaps?${query.toString()}`;
}

/** Ten sam klucz, co wiersz z subskrypcji puli - zasiew i zywy log sie nie dubluja. */
export function swapItemId(txHash: string | null | undefined, logIndex: number): string {
  return `${txHash ?? ''}-swap-${logIndex}`;
}

function blockOf(item: TickerItem): bigint {
  return item.block && DIGITS_RE.test(item.block) ? BigInt(item.block) : 0n;
}

function newestFirst(a: TickerItem, b: TickerItem): number {
  if (a.ts !== b.ts) return b.ts - a.ts;
  const blockA = blockOf(a);
  const blockB = blockOf(b);
  if (blockA !== blockB) return blockA > blockB ? -1 : 1;
  return 0;
}

/**
 * Wiersze `/api/launchpad/pool-swaps` -> wpisy paska, od najnowszego.
 *
 * Kodowanie jest wspolne z historia tokena (`serializeTrade`), wiec dekoduje
 * je ten sam `parseTrade` - drugi dekoder tego samego formatu predzej czy
 * pozniej rozjechalby sie z pierwszym. Wiersz bez sensownego czasu odpada.
 */
export function swapRowsToTickerItems(
  rows: unknown,
  token: { address: string; symbol: string }
): TickerItem[] {
  if (!Array.isArray(rows)) return [];
  const out: TickerItem[] = [];
  for (const row of rows) {
    const trade = parseTrade(row);
    if (!trade || !Number.isFinite(trade.ts) || trade.ts <= 0) continue;
    const isBuy = trade.kind === 'buy';
    out.push({
      id: swapItemId(trade.txHash, trade.logIndex),
      address: token.address,
      symbol: token.symbol,
      label: isBuy ? 'Pool buy' : 'Pool sell',
      eth: Number(formatEther(trade.eth)),
      tone: isBuy ? 'buy' : 'sell',
      ts: trade.ts,
      block: trade.block.toString(),
    });
  }
  return out.sort(newestFirst);
}

/**
 * Dokleja nowe wpisy bez duplikatow, od najnowszego, z sufitem. Gdy nic nowego
 * nie przyszlo, oddaje TEN SAM obiekt - setState nie przerysowuje wtedy paska.
 */
export function mergeTickerItems(
  current: TickerItem[],
  fresh: TickerItem[],
  max: number = TICKER_MAX_ITEMS
): TickerItem[] {
  if (fresh.length === 0) return current;
  const seen = new Set(current.map((item) => item.id));
  const unique: TickerItem[] = [];
  for (const item of fresh) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  if (unique.length === 0) return current;
  return [...current, ...unique].sort(newestFirst).slice(0, max);
}

/**
 * Tylko to, co zmiescilo sie w oknie. Wiersz "z przyszlosci" zostaje - to
 * estymata serwera wyprzedzajaca zegar klienta o sekundy, nie blad.
 */
export function recentTickerItems(
  items: TickerItem[],
  nowSec: number,
  windowSeconds: number = TICKER_WINDOW_SECONDS
): TickerItem[] {
  return items.filter((item) => nowSec - item.ts <= windowSeconds);
}

/**
 * Wiersze z localStorage. Tam moze lezec wszystko - wersja sprzed zmiany
 * ksztaltu, recznie grzebany wpis, stara tasma - wiec kazde pole jest
 * sprawdzane, a wiersz spoza okna odpada.
 */
export function sanitizeTickerItems(
  raw: unknown,
  nowSec: number,
  windowSeconds: number = TICKER_WINDOW_SECONDS
): TickerItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TickerItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const { id, symbol, label, tone, ts, eth, address, block } = row;
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    if (typeof symbol !== 'string' || symbol === '' || typeof label !== 'string') continue;
    if (typeof tone !== 'string' || !TONES.has(tone)) continue;
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) continue;
    if (nowSec - ts > windowSeconds) continue;
    if (eth !== undefined && (typeof eth !== 'number' || !Number.isFinite(eth) || eth < 0)) continue;
    if (address !== undefined && (typeof address !== 'string' || !ADDRESS_RE.test(address))) continue;
    if (block !== undefined && (typeof block !== 'string' || !DIGITS_RE.test(block))) continue;
    seen.add(id);
    out.push({
      id,
      symbol,
      label,
      tone: tone as TickerTone,
      ts,
      ...(eth !== undefined ? { eth } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(block !== undefined ? { block } : {}),
    });
  }
  return out.sort(newestFirst).slice(0, TICKER_MAX_ITEMS);
}

/** "just now", "4m ago", "3h ago", "2d ago" - ten sam zapis, co `timeAgo` w zakladce Trades. */
export function tickerAge(ts: number, nowSec: number): string {
  const seconds = Math.max(0, Math.floor(nowSec - ts));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/**
 * Odstep przed kolejna proba: 2 s, 4 s, 8 s... do sufitu. Zasiew stal dotad
 * na jednej probie, a flaga "zasiane" szla w gore PRZED zapytaniem, wiec jeden
 * timeout konczyl sprawe do przeladowania strony.
 */
export function retryDelayMs(attempt: number, baseMs = 2_000, capMs = 60_000): number {
  const safe = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(capMs, baseMs * 2 ** Math.min(safe, 20));
}

export type TickerStatus =
  | { kind: 'live' }
  | { kind: 'loading' }
  | { kind: 'quiet'; last: TickerItem | null }
  | { kind: 'unavailable' };

/**
 * Co pasek ma powiedziec. Zasada: kazdy stan jest prawda albo mowi, ze nie wie.
 *
 * - `live` - sa transakcje z okna; kazda idzie z wiekiem, wiec nawet gdy
 *   zrodla akurat padly, wiersz nie udaje swiezszego niz jest.
 * - `loading` - WYLACZNIE przed pierwsza odpowiedzia, bez bledu i przed
 *   uplywem limitu. Dawne "Watching..." bywalo stanem na zawsze.
 * - `unavailable` - nie mamy ani jednej potwierdzonej odpowiedzi, albo padl
 *   naraz serwer i subskrypcja, wiec "brak transakcji" byloby zgadywaniem.
 * - `quiet` - serwer potwierdzil pusta dobe w puli SPHERE (krzywa launchpada
 *   tylko od wejscia na strone); `last` to ostatnia znana transakcja sprzed
 *   okna (moze jej nie byc).
 */
export function tickerStatus(input: {
  recentCount: number;
  /** Byla co najmniej jedna udana odpowiedz serwera. */
  synced: boolean;
  /** Ostatnia proba odczytu (serwer albo poolId) sie nie udala. */
  syncFailing: boolean;
  /** Subskrypcja zglosila blad niedawno. */
  watchFailing: boolean;
  /** Minal limit czekania na pierwsza odpowiedz. */
  loadingExpired: boolean;
  last: TickerItem | null;
}): TickerStatus {
  if (input.recentCount > 0) return { kind: 'live' };
  if (!input.synced) {
    return input.syncFailing || input.loadingExpired ? { kind: 'unavailable' } : { kind: 'loading' };
  }
  if (input.syncFailing && input.watchFailing) return { kind: 'unavailable' };
  return { kind: 'quiet', last: input.last };
}
