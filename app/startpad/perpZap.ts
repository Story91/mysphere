import type { Address, PublicClient, WalletClient } from 'viem';
import { base } from 'viem/chains';
import { ETH_USDC_POOL, perpZapAbi, perpZapOf } from './config';

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

/* ======================================================================= */
/*  KUPNO ZA ETH (wspolne dla szybkiego kupna na /perps i paneli)           */
/* ======================================================================= */

const BPS = 10_000n;

/**
 * Jedno kupno mema z rynku perpa za ETH przez PerpZap: swieza symulacja calej
 * trasy, poslizg na obu nogach, zapas gazu (hook Flash zuzywa kilka mln gazu).
 * Zwraca hash i liczbe kupionych tokenow z symulacji.
 */
export async function zapBuyWithEth(input: {
  client: PublicClient;
  wallet: WalletClient;
  account: Address;
  launchpad: Address;
  token: Address;
  perp: Address;
  value: bigint;
  slippageBps: number;
  dataSuffix?: `0x${string}`;
}): Promise<{ hash: `0x${string}`; tokensOut: bigint }> {
  const zap = perpZapOf(base.id);
  if (!zap) throw new Error('The ETH route is not available on this network.');
  const perpPool = await fetchPerpPoolKey(base.id, input.perp);
  if (!perpPool) throw new Error('The ETH route to this perp is unavailable right now. Try again in a moment.');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
  const call = { address: zap, abi: perpZapAbi, functionName: 'buyWithEth' as const, value: input.value, account: input.account };
  const { result } = await input.client.simulateContract({
    ...call,
    args: [input.launchpad, input.token, ETH_USDC_POOL, perpPool, 1n, 1n, deadline, input.account],
  });
  const slip = (x: bigint) => {
    const v = (x * (BPS - BigInt(input.slippageBps))) / BPS;
    return v > 0n ? v : 1n;
  };
  const args = [input.launchpad, input.token, ETH_USDC_POOL, perpPool, slip(result[0]), slip(result[1]), deadline, input.account] as const;
  const gas = await input.client.estimateContractGas({ ...call, args }).catch(() => undefined);
  const hash = await input.wallet.writeContract({
    ...call,
    args,
    chain: base,
    ...(input.dataSuffix ? { dataSuffix: input.dataSuffix } : {}),
    ...(gas ? { gas: (gas * 120n) / 100n } : {}),
  });
  const receipt = await input.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The buy transaction reverted.');
  return { hash, tokensOut: result[1] };
}
