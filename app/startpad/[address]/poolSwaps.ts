import { getAbiItem, type Address } from 'viem';
import { ACTIVE_LAUNCHPAD_NETWORK } from '../config';
import { poolPriceWeiFromSqrt } from './poolPrice';
import type { TradeEntry } from './detailShared';
import { tradeId, type ScanClient, type ScanLog } from './historyScan';

/**
 * HISTORIA CEN PO GRADUACJI - ze swapow w puli Uniswap v4.
 *
 * Do 2.09.2026 wykres konczyl sie na graduacji: punkty braly sie wylacznie
 * z Bought/Sold krzywej, a po przeniesieniu handlu do puli nie bylo zadnego
 * zrodla kolejnych. Cena w boxie handlu byla zywa (slot0), wykres martwy -
 * token wygladal, jakby stanal dokladnie w chwili, w ktorej mu sie udalo.
 *
 * Zrodlo jest to samo, co dla krzywej, tylko inny kontrakt: PoolManager
 * emituje `Swap(id, sender, amount0, amount1, sqrtPriceX96, ...)` przy KAZDEJ
 * transakcji w puli, z cena PO transakcji. `id` to nasz poolId, wiec filtr
 * po temacie oddaje wylacznie swapy tej jednej puli.
 *
 * Znaki delt sa z perspektywy swapujacego: amount0 < 0 znaczy, ze zaplacil
 * ETH (currency0), czyli KUPIL token; amount0 > 0 to sprzedaz. Token jest
 * zawsze currency1 (LiquidityVault seeduje pule z address(0) jako currency0).
 *
 * `account` w takim wpisie to nadawca swapu widziany przez PoolManager -
 * zwykle Universal Router albo nasz hook (auto-burn), nie portfel czlowieka.
 * Wykres tego nie potrzebuje; taba Trades pokaze router, i to jest prawda.
 */
export const POOL_SWAP_ABI = [
  {
    type: 'event',
    name: 'Swap',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'amount0', type: 'int128', indexed: false },
      { name: 'amount1', type: 'int128', indexed: false },
      { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
      { name: 'liquidity', type: 'uint128', indexed: false },
      { name: 'tick', type: 'int24', indexed: false },
      { name: 'fee', type: 'uint24', indexed: false },
    ],
  },
] as const;

export const POOL_SWAP_EVENT = getAbiItem({ abi: POOL_SWAP_ABI, name: 'Swap' });

/** Swap z puli -> wpis historii w tym samym ksztalcie, co transakcja z krzywej. */
export function swapLogToTrade(log: ScanLog, decimals: number, ts: number): TradeEntry | null {
  const args = log.args ?? {};
  const amount0 = args.amount0 as bigint | undefined;
  const amount1 = args.amount1 as bigint | undefined;
  const sqrtPriceX96 = args.sqrtPriceX96 as bigint | undefined;
  const sender = args.sender as Address | undefined;
  if (amount0 === undefined || amount1 === undefined || sqrtPriceX96 === undefined || !sender) return null;
  const priceWei = poolPriceWeiFromSqrt(sqrtPriceX96, decimals);
  if (priceWei <= 0n) return null;
  const abs = (x: bigint) => (x < 0n ? -x : x);
  return {
    id: tradeId(log.transactionHash, Number(log.logIndex ?? 0)),
    kind: amount0 < 0n ? 'buy' : 'sell',
    account: sender,
    eth: abs(amount0),
    tokens: abs(amount1),
    priceWei,
    // Krzywej juz nie ma - rezerwa zero mowi "to punkt z puli". Po tym polu
    // useTokenHistory odroznia swapy puli od transakcji krzywej.
    ethReserveAfter: 0n,
    block: log.blockNumber ?? 0n,
    logIndex: Number(log.logIndex ?? 0),
    ts,
    txHash: log.transactionHash ?? null,
  };
}

export type PoolScanOptions = {
  poolId: `0x${string}`;
  decimals: number;
  fromBlock: bigint;
  toBlock: bigint;
  estTs: (block: bigint) => number;
};

/**
 * Wszystkie swapy puli w [fromBlock, toBlock], oknami wielkosci skanu sieci.
 * Puli zaklada sie nie wiecej niz kilka tysiecy blokow po graduacji, wiec
 * to zwykle jedno-dwa zapytania; sufit okien chroni przed odjechaniem, gdy
 * ktos otworzy strone tygodnie pozniej z pusta migawka.
 */
export async function scanPoolSwaps(client: ScanClient, opts: PoolScanOptions): Promise<TradeEntry[]> {
  // Okno mniejsze niz skan krzywej (9 500 na Base): PoolManager to najbardziej
  // ruchliwy kontrakt sieci i publiczny RPC odbija szerokie zapytania 413,
  // nawet z filtrem po temacie. 800 blokow schodzi w ~0.6 s; 2 000 to 3-4
  // zapytania od graduacji do teraz.
  const window = 2_000n;
  const maxWindows = ACTIVE_LAUNCHPAD_NETWORK.maxScanWindows;
  const out: TradeEntry[] = [];
  let from = opts.fromBlock;
  let windows = 0;
  while (from <= opts.toBlock && windows < maxWindows) {
    const to = from + window - 1n < opts.toBlock ? from + window - 1n : opts.toBlock;
    const logs = await client.getLogs({
      address: ACTIVE_LAUNCHPAD_NETWORK.poolManager,
      event: POOL_SWAP_EVENT,
      args: { id: opts.poolId },
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      const trade = swapLogToTrade(log, opts.decimals, opts.estTs(log.blockNumber ?? to));
      if (trade) out.push(trade);
    }
    from = to + 1n;
    windows += 1;
  }
  return out;
}
