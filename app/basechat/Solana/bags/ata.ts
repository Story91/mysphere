/**
 * Adres konta tokenowego (ATA) - jedyne miejsce Proof of Bags, ktore potrzebuje
 * PublicKey, a wiec web3.js. Wydzielone z bagsCore.ts, zeby czysta logika nie
 * ciagnela za soba calego stosu Solany.
 *
 * Wlasna implementacja zamiast @solana/spl-token: to jedno wyprowadzenie PDA,
 * a pakiet dokladalby kolejne zaleznosci do bundle'a przycisku posta.
 */

import { PublicKey } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from './bagsCore';

const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);

/** ATA wlasciciela dla danego minta i programu tokena. */
export function deriveAta(owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM
  );
  return address;
}

/**
 * Program tokena, dla ktorego podane konto jest ATA wlasciciela - albo `null`.
 *
 * Sprawdzamy oba programy, bo konto, ktorego w chwili posta nie bylo, nie
 * niesie informacji, pod ktorym z nich mialoby powstac.
 */
export function ataProgramFor(owner: string, mint: string, ata: string): string | null {
  const ownerKey = new PublicKey(owner);
  const mintKey = new PublicKey(mint);
  for (const program of [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS]) {
    if (deriveAta(ownerKey, mintKey, new PublicKey(program)).toBase58() === ata) return program;
  }
  return null;
}
