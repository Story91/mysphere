import type { Address } from 'viem';

/**
 * Odczyt POJEDYNCZEGO tokena B20 - na potrzeby strony /b20/[address].
 *
 * ===========================================================================
 * DLACZEGO OSOBNY PLIK, A NIE `getToken` Z market.ts
 * ===========================================================================
 * `market.ts` buduje tablice z OKNA 43 200 blokow (24 godziny) i `getToken`
 * szuka w tej tablicy. Token starszy niz doba po prostu w niej nie istnieje -
 * a strona tokena musi dzialac dla KAZDEGO adresu, ktory ktos wklei.
 *
 * Ten modul czyta jeden token wprost: metadane z lancucha, cene i historie
 * z GeckoTerminal. Zero zaleznosci od okna.
 *
 * ===========================================================================
 * SKAD WYKRES
 * ===========================================================================
 * Z lancucha da sie odczytac cene BIEZACA i cene z otwarcia puli. To sa dwa
 * punkty i z dwoch punktow nie rysuje sie wykresu - linia miedzy nimi
 * sugerowalaby przebieg, ktorego nie znamy.
 *
 * Prawdziwy szereg oddaje GeckoTerminal (`/pools/{id}/ohlcv/{timeframe}`) i -
 * co wazne - indeksuje pule Uniswap v4 po ich IDENTYFIKATORZE, a nie po
 * adresie, ktorego v4 nie ma. Sprawdzone odczytem na tokenie
 * 0xb2000...ef78af7adf3c70fb01: pelne swiece godzinowe z wolumenem.
 *
 * Gdy GT tokena nie zna - wykresu NIE MA i strona to mowi. Zadnego rysowania
 * plaskiej linii na zero, bo brak notowan to nie jest cena zero.
 */

const GT = 'https://api.geckoterminal.com/api/v2/networks/base';
const RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';

/** Selektory czytane z tokena. Liczone raz, bo to stale. */
const SEL = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  supplyCap: '0x869e0e89', // supplyCap()
} as const;

export type Candle = {
  /** Sekundy unix, poczatek swiecy. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Wolumen w USD. */
  v: number;
};

export type TokenQuote = {
  priceUsd: number | null;
  fdvUsd: number | null;
  volume24hUsd: number | null;
  reserveUsd: number | null;
  /** Identyfikator puli u GT - dla v4 to bytes32, nie adres. */
  poolId: string | null;
};

export type TokenDetail = {
  address: Address;
  /** Metadane z LANCUCHA. `null` znaczy, ze wywolanie zrewertowalo. */
  name: string | null;
  symbol: string | null;
  decimals: number;
  totalSupply: string | null;
  /**
   * Sufit podazy. `null` znaczy "nie odczytalismy", `'0'` znaczy BRAK SUFITU -
   * i to jest roznica, ktora widzi kupujacy, wiec nie wolno jej zgubic.
   */
  supplyCap: string | null;
  quote: TokenQuote | null;
  candles: Candle[] | null;
  /** Co sie nie udalo. Trafia na ekran, zeby braki nie czytaly sie jak zera. */
  notes: string[];
};

export type TokenResult =
  | { ok: true; token: TokenDetail }
  | { ok: false; reason: 'bad-address' | 'not-a-b20' | 'unreadable'; message: string };

/** Format adresu B20: 0xb2 + dziewiec zer + bajt wariantu + 9 bajtow skrotu. */
function looksLikeB20(address: string): boolean {
  return /^0xb2000000000000000000[0-9a-f]{20}$/i.test(address);
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || 'RPC error');
  return body.result as T;
}

/** Dekoduje `string` zwrocony w ABI. Pusty wynik daje `null`, nie pusty napis. */
function decodeString(hex: string): string | null {
  if (!hex || hex === '0x') return null;
  try {
    const body = hex.slice(2);
    // offset (32B) | dlugosc (32B) | dane
    const len = parseInt(body.slice(64, 128), 16);
    if (!Number.isFinite(len) || len === 0) return null;
    const data = body.slice(128, 128 + len * 2);
    const bytes = data.match(/.{2}/g) || [];
    return new TextDecoder().decode(Uint8Array.from(bytes.map((b) => parseInt(b, 16)))) || null;
  } catch {
    return null;
  }
}

function decodeUint(hex: string): string | null {
  if (!hex || hex === '0x') return null;
  try {
    return BigInt(hex).toString();
  } catch {
    return null;
  }
}

/**
 * Jedno wywolanie `eth_call`. Blad NIE przewraca odczytu calego tokena -
 * oddaje `null`, a wolajacy zapisuje to jako brak, nie jako zero.
 */
async function call(to: string, data: string): Promise<string | null> {
  try {
    return await rpc<string>('eth_call', [{ to, data }, 'latest']);
  } catch {
    return null;
  }
}

async function readChain(address: Address, notes: string[]) {
  const [name, symbol, decimals, total, cap] = await Promise.all([
    call(address, SEL.name),
    call(address, SEL.symbol),
    call(address, SEL.decimals),
    call(address, SEL.totalSupply),
    call(address, SEL.supplyCap),
  ]);

  if (name === null && symbol === null && total === null) {
    // Nic sie nie odczytalo - to nie jest "token bez nazwy", tylko awaria
    // albo adres, pod ktorym nic nie stoi.
    notes.push('The chain did not answer for this address.');
  }

  const decoded = decodeUint(decimals ?? '');
  return {
    name: decodeString(name ?? ''),
    symbol: decodeString(symbol ?? ''),
    decimals: decoded === null ? 18 : Number(decoded),
    totalSupply: decodeUint(total ?? ''),
    // `supplyCap()` na tokenie bez sufitu rewertuje albo oddaje zero -
    // rozroznienie zostaje na ekranie, nie tutaj.
    supplyCap: decodeUint(cap ?? ''),
  };
}

async function readQuote(address: Address, notes: string[]): Promise<TokenQuote | null> {
  try {
    const res = await fetch(`${GT}/tokens/${address}?include=top_pools`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 60 },
    });
    if (res.status === 404) return null; // GT o tym tokenie nie slyszal - to nie awaria
    if (!res.ok) {
      notes.push('Price data is unavailable right now.');
      return null;
    }
    const body = await res.json();
    const a = body?.data?.attributes ?? {};
    const poolRaw: string | undefined = body?.data?.relationships?.top_pools?.data?.[0]?.id;

    const num = (v: unknown): number | null => {
      const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
      return Number.isFinite(n) ? n : null;
    };

    return {
      priceUsd: num(a.price_usd),
      fdvUsd: num(a.fdv_usd),
      volume24hUsd: num(a.volume_usd?.h24),
      reserveUsd: num(a.total_reserve_in_usd),
      // GT zwraca "base_0x…" - sam identyfikator jest za prefiksem sieci.
      poolId: poolRaw ? poolRaw.replace(/^base_/, '') : null,
    };
  } catch {
    notes.push('Price data is unavailable right now.');
    return null;
  }
}

/**
 * Szereg swiec. `null` znaczy "nie mamy historii" i strona ma to napisac -
 * pusta tablica bylaby czytana jako "handel byl, ale zerowy".
 */
async function readCandles(poolId: string, notes: string[]): Promise<Candle[] | null> {
  try {
    const res = await fetch(`${GT}/pools/${poolId}/ohlcv/hour?limit=168`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      notes.push('The price history could not be loaded.');
      return null;
    }
    const body = await res.json();
    const list: unknown = body?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(list) || list.length === 0) return null;

    const candles: Candle[] = [];
    for (const row of list) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const [t, o, h, l, c, v] = row as number[];
      if (![t, o, h, l, c].every((n) => Number.isFinite(n))) continue;
      candles.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
    }
    if (candles.length === 0) return null;

    // GT oddaje od najnowszej. Wykres rysuje sie od lewej, wiec odwracamy TU,
    // zeby zaden komponent nie musial o tym pamietac.
    return candles.reverse();
  } catch {
    notes.push('The price history could not be loaded.');
    return null;
  }
}

export async function getTokenDetail(addressRaw: string): Promise<TokenResult> {
  const address = (addressRaw || '').trim().toLowerCase();

  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return { ok: false, reason: 'bad-address', message: 'That is not an address.' };
  }
  if (!looksLikeB20(address)) {
    // Sprawdzenie FORMATU, nie istnienia - ale tu wystarcza: adres spoza
    // przestrzeni B20 na pewno nie jest tokenem B20.
    return {
      ok: false,
      reason: 'not-a-b20',
      message: 'This address is not a B20 token. B20 addresses all start with 0xb2 followed by zeros.',
    };
  }

  const notes: string[] = [];

  try {
    const chain = await readChain(address as Address, notes);
    const quote = await readQuote(address as Address, notes);
    const candles = quote?.poolId ? await readCandles(quote.poolId, notes) : null;

    return {
      ok: true,
      token: { address: address as Address, ...chain, quote, candles, notes },
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'unreadable',
      message: error instanceof Error ? error.message : 'The read failed.',
    };
  }
}
