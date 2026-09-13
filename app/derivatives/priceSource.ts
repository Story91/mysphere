/** Mirrors DerivativeMarket.indexPrice; a failed read is never a fallback. */
export function resolvePriceSource(feed: string | null, round: readonly unknown[] | null, registryTime: number | null) {
  if (!feed) return { source: 'unknown' as const, updatedAt: null };
  if (/^0x0{40}$/i.test(feed)) return { source: 'registry' as const, updatedAt: registryTime };
  if (!round || typeof round[1] !== 'bigint' || typeof round[3] !== 'bigint') {
    return { source: 'unknown' as const, updatedAt: null };
  }
  return round[1] > 0n && round[3] !== 0n
    ? { source: 'external' as const, updatedAt: Number(round[3]) }
    : { source: 'fallback' as const, updatedAt: registryTime };
}

export function spendableMargin(balance: bigint | null, gasReserve: bigint): bigint | null {
  return balance === null ? null : balance > gasReserve ? balance - gasReserve : 0n;
}

export function requireSuccessfulReceipt(receipt: { status: string }) {
  if (receipt.status !== 'success') throw new Error('Transaction reverted. No successful operation was confirmed.');
}
