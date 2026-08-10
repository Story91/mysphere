/**
 * Klient Blockscouta widziany z przegladarki - zawsze przez NASZ proxy, nigdy
 * wprost do api.blockscout.com (tam idzie sekretny klucz, patrz route.ts).
 *
 * Wszystko tu jest MIEKKIE: gdy Blockscout nie odpowie albo jeszcze nie
 * zaindeksowal tokena, zwracamy `null`, a UI pokazuje wtedy swoja dotychczasowa
 * liczbe z lancucha. Zaden odczyt stad nie ma prawa wywalic tablicy.
 */

function proxyBase(chainId: number): string {
  return `/api/startpad/chain/${chainId}/api/v2`;
}

type TokenInfo = {
  holders_count?: string;
  holders?: string;
};

/**
 * Liczba POSIADACZY tokena wg indeksu Blockscouta - liczba, ktorej z samego
 * RPC nie da sie policzyc bez skanowania wszystkich transferow. `null` znaczy
 * "nie wiem" (brak klucza, token nieznany, siec poza planem), nie "zero".
 */
export async function fetchHolderCount(chainId: number, token: string): Promise<number | null> {
  try {
    const res = await fetch(`${proxyBase(chainId)}/tokens/${token}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as TokenInfo;
    const raw = data.holders_count ?? data.holders;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
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
