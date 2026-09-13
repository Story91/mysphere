import { keccak256 } from "ethers";

/** Pins the reviewed runtime before deployment. This does not establish provenance. */
export function verifyPoolManagerCode(
  chainId: number,
  code: string,
  expectedHash = process.env.POOL_MANAGER_CODE_HASH,
): string {
  if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(code)) {
    throw new Error("PoolManager has no valid runtime code.");
  }
  if (chainId === 5042 && !expectedHash) {
    throw new Error(
      "Arc mainnet requires POOL_MANAGER_CODE_HASH from the reviewed deployment. " +
      "Verify provenance and fork-test graduation and swaps before pinning it; code presence alone is insufficient.",
    );
  }
  const actualHash = keccak256(code);
  if (expectedHash) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(expectedHash)) {
      throw new Error("POOL_MANAGER_CODE_HASH must be a 32-byte hex hash.");
    }
    if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new Error(`PoolManager runtime changed: expected ${expectedHash}, received ${actualHash}.`);
    }
  }
  return actualHash;
}
