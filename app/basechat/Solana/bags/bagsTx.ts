/**
 * Proof of Bags po stronie klienta: ktore tokeny post wspomina i jak dolozyc
 * dowod do transakcji posta.
 *
 * Ladowane wylacznie przez SolanaPostButton, ktory sam jest ladowany leniwie -
 * web3.js nie trafia stad do bundle'a feedu.
 */

import { PublicKey, TransactionInstruction, type Connection } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { MEMO_V1_PROGRAM_ADDRESS } from '../config/solanaChain';
import { deriveAta } from './ata';
import {
  buildBagsMemo,
  extractMintCandidates,
  MAX_BAGS_MINTS,
  MAX_MINT_CANDIDATES,
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from './bagsCore';

export interface BagsMint {
  mint: PublicKey;
  tokenProgram: PublicKey;
}

const TOKEN_PROGRAMS = new Set([TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS]);

/**
 * Minty wspomniane w tresci - zweryfikowane na lancuchu jednym zapytaniem.
 *
 * Ciag base58 dlugosci adresu moze byc portfelem, para DEX-owa albo niczym.
 * Zostaje tylko to, co RPC zwraca jako `parsed.type === 'mint'` w programie
 * SPL Token albo Token-2022.
 *
 * `getMultipleAccounts`, a nie `getTokenSupply` czy `getTokenAccountBalance`:
 * publicnode, na ktorym stoi mainnet, blokuje czesc "indeksowanych" metod
 * (zmierzone 2026-09-23), a ta przechodzi.
 */
export async function detectBagsMints(connection: Connection, text: string): Promise<BagsMint[]> {
  const keys: PublicKey[] = [];
  for (const candidate of extractMintCandidates(text).slice(0, MAX_MINT_CANDIDATES)) {
    try {
      // Ciag base58 o dlugosci 32-44 nie musi sie dekodowac do 32 bajtow -
      // taki PublicKey rzuca wyjatkiem i po prostu odpada.
      keys.push(new PublicKey(candidate));
    } catch {
      /* nie adres */
    }
  }
  if (keys.length === 0) return [];

  const accounts = await connection.getMultipleParsedAccounts(keys);
  const out: BagsMint[] = [];
  accounts.value.forEach((account, i) => {
    if (!account || out.length >= MAX_BAGS_MINTS) return;
    const owner = account.owner.toBase58();
    const data = account.data as { parsed?: { type?: string } };
    if (TOKEN_PROGRAMS.has(owner) && data.parsed?.type === 'mint') {
      out.push({ mint: keys[i], tokenProgram: account.owner });
    }
  });
  return out;
}

/**
 * Instrukcja Memo v1 z kontami tokenowymi autora - to ona zamienia post
 * w dowod.
 *
 * Konta tokenowe ida przed programami tokena, w kolejnosci mintow w danych -
 * ten uklad czyta serwer (readBagsProof). Programy tokena sa w instrukcji po
 * to, zeby wystapily w kontach transakcji: bez nich runtime nie zapisuje
 * `preTokenBalances` (zmierzone symulacja na mainnecie, spec sekcja
 * "Mechanizm").
 *
 * Wszystkie konta read-only i bez podpisu: instrukcja niczego nie zmienia,
 * wiec portfel w symulacji nie pokazuje zadnych ruchow srodkow. Konto
 * tokenowe, ktorego jeszcze nie ma (autor nie trzyma tokena), tez tu trafia -
 * jego zerowe saldo lamportow jest dowodem braku pozycji.
 */
export function buildBagsInstruction(owner: PublicKey, mints: BagsMint[]): TransactionInstruction {
  const atas = mints.map(({ mint, tokenProgram }) => deriveAta(owner, mint, tokenProgram));
  const programs = Array.from(new Set(mints.map(m => m.tokenProgram.toBase58()))).map(p => new PublicKey(p));

  return new TransactionInstruction({
    programId: new PublicKey(MEMO_V1_PROGRAM_ADDRESS),
    keys: [...atas, ...programs].map(pubkey => ({ pubkey, isSigner: false, isWritable: false })),
    data: Buffer.from(buildBagsMemo(mints.map(m => m.mint.toBase58())), 'utf8'),
  });
}
