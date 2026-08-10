/**
 * Klient Blockscouta widziany z przegladarki - zawsze przez NASZ proxy, nigdy
 * wprost do api.blockscout.com (tam idzie sekretny klucz, patrz route.ts).
 *
 * Wszystko tu jest MIEKKIE: gdy Blockscout nie odpowie albo jeszcze nie
 * zaindeksowal tokena, zwracamy `null`, a UI pokazuje wtedy swoja dotychczasowa
 * liczbe z lancucha. Zaden odczyt stad nie ma prawa wywalic tablicy.
 */

// Proxy sam doklada `/api/v2/` do adresu Blockscouta, wiec TU go nie ma -
// inaczej sciezka bylaby podwojona i odbita przez allowliste (403).
function proxyBase(chainId: number): string {
  return `/api/startpad/chain/${chainId}`;
}

/**
 * CACHE ZAPYTAN - zeby nie palic kredytow Buildera.
 *
 * Liczba posiadaczy i transferow zmienia sie wolno, a tablica przeladowuje sie
 * czesto (eventy na zywo, recznie, przy zmianie zakladki). Bez cache kazde
 * przeladowanie to N nowych zapytan. Dlatego:
 *  - trzymamy wynik per URL przez TTL (60 s) - powtorka w tym oknie = 0 zapytan;
 *  - deduplikujemy zapytania W LOCIE - piec workerow boardu proszacych o ten sam
 *    token robi JEDNO zapytanie, nie piec.
 * Serwerowy proxy ma wlasny cache (revalidate), wiec to druga, tansza warstwa.
 */
const TTL_MS = 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cachedGet<T>(url: string): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T | null;

  const pending = inflight.get(url);
  if (pending) return pending as Promise<T | null>;

  const task = (async () => {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) {
        // Bledu NIE cache'ujemy. Cache'owanie null na 60 s zatruwaloby wynik po
        // JEDNEJ nieudanej probie (np. cold-compile trasy w dev, chwilowy 5xx) -
        // i statystyka zostawala na fallbacku, choc kolejne zapytanie by przeszlo.
        // Dedup "w locie" i tak chroni przed burstem, a fallback dziala od reki.
        return null;
      }
      const value = (await res.json()) as T;
      cache.set(url, { at: Date.now(), value });
      return value;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return task as Promise<T | null>;
}

type CountersResponse = {
  token_holders_count?: string;
  transfers_count?: string;
};

/**
 * Liczba POSIADACZY tokena wg indeksu Blockscouta - liczba, ktorej z samego
 * RPC nie da sie policzyc bez skanowania wszystkich transferow. `null` znaczy
 * "nie wiem" (brak klucza, token nieznany, siec poza planem), nie "zero".
 *
 * Uzywamy `/tokens/{addr}/counters`, a NIE `/tokens/{addr}` - to pierwsze
 * dziala na obu sieciach; drugie na Base Sepolii oddaje 404 (zmierzone).
 */
function toCount(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export type TokenCounters = {
  /** Liczba posiadaczy wg indeksu; `null` = indeks milczy. */
  holders: number | null;
  /** Liczba WSZYSTKICH transferow tokena (nie tylko naszych transakcji krzywej). */
  transfers: number | null;
};

/**
 * Oba liczniki tokena jednym zapytaniem `/counters`. To ten sam URL, ktory
 * wola `fetchHolderCount`, wiec przy wlaczonym cache liczba posiadaczy i liczba
 * transferow dziela JEDNO zapytanie - dodanie statystyki transferow nie kosztuje
 * ani jednego kredytu wiecej.
 */
export async function fetchTokenCounters(chainId: number, token: string): Promise<TokenCounters> {
  const data = await cachedGet<CountersResponse>(`${proxyBase(chainId)}/tokens/${token}/counters`);
  return { holders: toCount(data?.token_holders_count), transfers: toCount(data?.transfers_count) };
}

export async function fetchHolderCount(chainId: number, token: string): Promise<number | null> {
  return (await fetchTokenCounters(chainId, token)).holders;
}

export type IndexedHolder = {
  /** Adres posiadacza, lowercase. */
  address: string;
  /** Saldo w jednostkach bazowych. */
  balance: bigint;
};

type HoldersResponse = {
  items?: Array<{ address?: { hash?: string }; value?: string }>;
};

/**
 * RANKING posiadaczy wg Blockscouta - prawdziwe salda, nie ograniczone oknem
 * skanu transferow (nasze odtwarzanie z RPC widzi tylko ostatnie N blokow).
 * Pusta lista/blad -> `[]`, UI zostaje wtedy przy swoim odczycie z lancucha.
 */
export async function fetchTokenHolders(
  chainId: number,
  token: string,
  limit = 50
): Promise<IndexedHolder[]> {
  const data = await cachedGet<HoldersResponse>(`${proxyBase(chainId)}/tokens/${token}/holders?limit=${limit}`);
  const items = data?.items ?? [];
  const out: IndexedHolder[] = [];
  for (const item of items) {
    const hash = item.address?.hash;
    if (!hash || item.value == null) continue;
    try {
      out.push({ address: hash.toLowerCase(), balance: BigInt(item.value) });
    } catch {
      // Wartosc, ktora nie jest liczba calkowita - pomijamy ten wiersz.
    }
  }
  return out;
}

/**
 * Liczby posiadaczy dla wielu tokenow naraz, z ograniczona rownolegloscia -
 * plan Builder ma limit 15 req/s, wiec nie wypuszczamy 40 zapytan w jednym
 * mgnieniu. Zwraca mape adres(lowercase) -> liczba; tokeny bez odpowiedzi
 * po prostu nie maja klucza w mapie.
 */
export async function fetchHolderCounts(
  chainId: number,
  tokens: string[],
  concurrency = 5
): Promise<Record<string, number>> {
  const unique = Array.from(new Set(tokens.map((t) => t.toLowerCase())));
  const out: Record<string, number> = {};
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const index = cursor++;
      const address = unique[index];
      const count = await fetchHolderCount(chainId, address);
      if (count !== null) out[address] = count;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return out;
}
