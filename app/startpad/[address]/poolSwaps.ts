import { getAbiItem, type Address } from 'viem';
import { ACTIVE_LAUNCHPAD_NETWORK } from '../config';
import { poolPriceWeiFromSqrt } from './poolPrice';
import type { TradeEntry } from './detailShared';
import { parseTrades, tradeId, type ScanLog } from './historyScan';

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
  /** Podloga skanu: blok graduacji. */
  fromBlock: bigint;
  /** Gorny koniec; serwer i tak nie wyjdzie ponad glowe lancucha. */
  toBlock: bigint;
  /** Start tokena - serwer nie datuje transakcji wczesniej. */
  startedAt: number;
};

/**
 * Swapy puli - z serwerowej trasy `/api/launchpad/pool-swaps`.
 *
 * Do 10.09.2026 ten skan chodzil TUTAJ, w przegladarce: 90 kolejnych
 * `getLogs` po 2 000 blokow na PoolManagerze, z publicznego RPC. Nie konczyl
 * sie w rozsadnym czasie, a jego bledy ladowaly w cichym `catch` - efekt byl
 * taki, ze zakladka "Trades" na zgraduowanym $SPHERE pokazywala 74 transakcje
 * z krzywej i ani jednej z 2 562 swapow puli z ostatnich osmiu dni.
 *
 * Skan robi teraz serwer, tym samym wezlem CDP co historia krzywej, od
 * najnowszych blokow w dol, a odpowiedz stoi w cache'u brzegowym. Klient
 * dostaje gotowe wiersze w tym samym kodowaniu, co historia krzywej.
 */
export async function scanPoolSwaps(opts: PoolScanOptions): Promise<{ trades: TradeEntry[]; scannedFrom: bigint }> {
  const query = new URLSearchParams({
    chainId: String(ACTIVE_LAUNCHPAD_NETWORK.chain.id),
    poolId: opts.poolId,
    decimals: String(opts.decimals),
    fromBlock: opts.fromBlock.toString(),
    toBlock: opts.toBlock.toString(),
    startedAt: String(opts.startedAt),
  });
  // Sufit czasu jak przy historii krzywej: dluzsze czekanie przestaje byc
  // przyspieszeniem, a strona ma sie zbudowac z tego, co juz jest.
  const response = await fetch(`/api/launchpad/pool-swaps?${query.toString()}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Pool swaps route responded ${response.status}.`);
  const data = (await response.json()) as { swaps?: unknown[]; scannedFrom?: string };
  const trades = parseTrades(Array.isArray(data.swaps) ? data.swaps : []);
  let scannedFrom = opts.toBlock + 1n;
  try {
    if (typeof data.scannedFrom === 'string') scannedFrom = BigInt(data.scannedFrom);
  } catch {
    /* zostaje wartosc zachowawcza: nic nie uznajemy za pokryte */
  }
  return { trades, scannedFrom };
}
