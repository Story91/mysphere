import { ethers } from "hardhat";

/**
 * Symulacja PerpBuyZap na ZYWYM Base mainnet (eth_call, nic nie jest wysylane).
 *
 * Tylko tak da sie sprawdzic cala trase z prawdziwym perpem: token B20 dziala
 * przez precompile, a pula Flash ma hook - zadnego z nich nie ma na forku
 * Hardhata. Kupujacy to dowolny adres z saldem ETH podstawionym override'em.
 *
 * Bez `code` symuluje wdrozony zap; z `code` podstawia kod pod adres `zap`
 * (przed wdrozeniem).
 */

export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// Bezhakowa pula natywne ETH/USDC na v4 (fee 500, tickSpacing 10) - glowna
// pula tej pary na Base i ta sama, ktora Flash bierze do trasy ETH -> perp.
export const ETH_USDC_POOL = {
  currency0: ethers.ZeroAddress,
  currency1: BASE_USDC,
  fee: 500,
  tickSpacing: 10,
  hooks: ethers.ZeroAddress,
};

type PoolKey = { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string };

/** Klucz puli Flash dla perpa - z ich publicznego API, jak w /api/launchpad/perps. */
export async function flashPoolKey(perp: string): Promise<PoolKey> {
  const res = await fetch("https://api.tryflash.app/v1/perps");
  if (!res.ok) throw new Error(`Flash API ${res.status}`);
  const body = (await res.json()) as { items?: Array<{ token?: string; poolKey?: PoolKey }> };
  const item = (body.items ?? []).find((i) => i.token?.toLowerCase() === perp.toLowerCase());
  if (!item?.poolKey) throw new Error(`Flash nie zna perpa ${perp}`);
  return item.poolKey;
}

export async function simulateZapBuy(opts: {
  zap: string;
  launchpad: string;
  token: string;
  ethIn: bigint;
  code?: string;
}): Promise<{ perpIn: bigint; tokensOut: bigint; gas: bigint }> {
  const iface = (await ethers.getContractFactory("PerpBuyZap")).interface;
  const pad = new ethers.Contract(opts.launchpad, ["function QUOTE() view returns (address)"], ethers.provider);
  const perpPool = await flashPoolKey(await pad.QUOTE());
  const buyer = "0x00000000000000000000000000000000000b0b01";
  const block = await ethers.provider.getBlock("latest");
  const data = iface.encodeFunctionData("buyWithEth", [
    opts.launchpad,
    opts.token,
    ETH_USDC_POOL,
    perpPool,
    1n,
    1n,
    BigInt(block!.timestamp + 900),
    buyer,
  ]);
  const tx = { from: buyer, to: opts.zap, data, value: ethers.toQuantity(opts.ethIn), gas: ethers.toQuantity(15_000_000n) };
  const overrides: Record<string, { balance?: string; code?: string }> = {
    [buyer]: { balance: ethers.toQuantity(ethers.parseEther("100")) },
  };
  if (opts.code) overrides[opts.zap] = { code: opts.code };
  const ret = await ethers.provider.send("eth_call", [tx, "latest", overrides]);
  const [perpIn, tokensOut] = iface.decodeFunctionResult("buyWithEth", ret) as unknown as [bigint, bigint];
  // Nie kazdy wezel przyjmuje override w eth_estimateGas - wtedy gaz jest nieznany (0).
  const gas = await ethers.provider
    .send("eth_estimateGas", [tx, "latest", overrides])
    .then((g: string) => BigInt(g))
    .catch(() => 0n);
  return { perpIn, tokensOut, gas };
}
