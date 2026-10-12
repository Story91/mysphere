import type { Address } from 'viem';

/**
 * Klucz puli Flash USDC/perp - druga noga PerpBuyZap. Z naszej trasy
 * /api/launchpad/perps (ta bierze go z API Flash). Zap sam sprawdza, ze pula
 * laczy USDC z QUOTE launchpada, wiec zly klucz konczy sie rewertem, nie strata.
 */
export type ZapPoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };

const cache = new Map<string, Promise<ZapPoolKey | null>>();

export function fetchPerpPoolKey(chainId: number, perp: Address): Promise<ZapPoolKey | null> {
  const key = `${chainId}:${perp.toLowerCase()}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch(`/api/launchpad/perps?chainId=${chainId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { perps?: Array<{ address: string; poolKey: ZapPoolKey | null }> } | null) => {
        const found = body?.perps?.find((p) => p.address.toLowerCase() === perp.toLowerCase())?.poolKey ?? null;
        if (!found) cache.delete(key);
        return found;
      })
      .catch(() => {
        cache.delete(key);
        return null;
      });
    cache.set(key, hit);
  }
  return hit;
}
