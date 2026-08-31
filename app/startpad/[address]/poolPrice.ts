import type { Address } from 'viem';
import { STATE_VIEW_ADDRESS } from '../config';

/**
 * CENA PO GRADUACJI - z puli Uniswap v4, nie z krzywej.
 *
 * ===========================================================================
 * OBJAW
 * ===========================================================================
 * Po graduacji `spotPriceWeiPerToken` na launchpadzie REWERTUJE (krzywa juz nie
 * handluje), wiec `spotPriceWei` schodzil do zera, a strona pokazywala ostatnia
 * cene krzywej - liczbe z chwili, w ktorej token przestal byc na krzywej.
 * Wykres konczyl sie na graduacji i nic sie juz nie ruszalo. To sa akurat te
 * tokeny, ktorym SIE UDALO, a wygladaly na martwe.
 *
 * ===========================================================================
 * SKAD BIERZEMY CENE
 * ===========================================================================
 * Z `slot0` puli, przez `StateView` - to jedyny sposob odczytania stanu puli
 * v4 bez transient storage (ten sam kontrakt, ktorego uzywaja strony /b20).
 * Jeden odczyt, bez bazy, bez indeksera i bez opoznienia.
 *
 * Kolejnosci walut nie zgadujemy: `LiquidityVault` tworzy pule z
 * `currency0 = address(0)` (natywny ETH) i `currency1 = token`, i sprawdza to
 * przy seedowaniu (`LiquidityVault.sol:462`). Token jest wiec ZAWSZE currency1.
 */

export const stateViewAbi = [
  {
    type: 'function',
    name: 'getSlot0',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
] as const;

const Q192 = 1n << 192n;

/**
 * sqrtPriceX96 -> wei ETH za JEDEN caly token.
 *
 * `sqrtPriceX96` koduje pierwiastek ceny `amount1/amount0` w jednostkach
 * SUROWYCH, a token jest currency1 przy natywnym ETH jako currency0:
 *
 *   rawPrice = (sqrt / 2^96)^2          surowych tokenow za jedno wei
 *   priceWei = 10^decimals / rawPrice   wei za jeden caly token
 *
 * Liczymy w bigintach, a nie na `Number`: cena tokena z krzywej jest rzedu
 * 1e-9 ETH i po drodze przez `Number` gubi cyfry akurat tam, gdzie caly wynik
 * ma znaczenie. Ta sama liczba idzie potem do kapitalizacji, wiec blad by sie
 * mnozyl przez miliard tokenow.
 *
 * Zero znaczy "puli nie ma albo nie ma ceny" - i tak ma byc czytane wyzej,
 * bo `spotPriceWei == 0n` jest w tym projekcie umowa na "brak ceny".
 */
export function poolPriceWeiFromSqrt(sqrtPriceX96: bigint, decimals: number): bigint {
  if (sqrtPriceX96 <= 0n) return 0n;
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 36) return 0n;
  return (10n ** BigInt(Math.round(decimals)) * Q192) / (sqrtPriceX96 * sqrtPriceX96);
}

/** Pusty `poolId` znaczy, ze pula nie zostala jeszcze zalozona. */
export function hasPool(poolId: string | null | undefined): boolean {
  return typeof poolId === 'string' && /^0x[0-9a-fA-F]{64}$/.test(poolId) && !/^0x0+$/.test(poolId);
}

type SlotClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract: (args: any) => Promise<any>;
};

/**
 * Biezaca cena z puli. `null` znaczy "nie wiem" - brak adresu StateView dla tej
 * sieci, brak puli albo nieudany odczyt. Nigdy zero udajace cene: strona ma
 * wtedy pokazac ostatnia cene krzywej, a nie zjechac na zero.
 */
export async function readPoolPriceWei(
  client: SlotClient,
  input: { poolId: string; decimals: number }
): Promise<bigint | null> {
  if (!STATE_VIEW_ADDRESS || !hasPool(input.poolId)) return null;
  try {
    const slot0 = (await client.readContract({
      address: STATE_VIEW_ADDRESS as Address,
      abi: stateViewAbi,
      functionName: 'getSlot0',
      args: [input.poolId as `0x${string}`],
    })) as readonly [bigint, number, number, number];
    const price = poolPriceWeiFromSqrt(slot0[0], input.decimals);
    return price > 0n ? price : null;
  } catch {
    // Pula moze nie istniec (StateView rewertuje) albo RPC moze odmowic.
    // Jedno i drugie znaczy tyle samo: zostajemy przy tym, co juz pokazujemy.
    return null;
  }
}
