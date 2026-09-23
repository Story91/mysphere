import 'server-only';

/**
 * Transakcja z lancucha jako zwykle dane - wspolny odczyt dla zapisu posta
 * z Solany (rejestr kwitow), Proof of Bags i platnych odpowiedzi.
 *
 * Samo wiazanie transakcji z postem (memo v2 z ID posta, platnik = podpisujacy,
 * tresc) sprawdza app/utils/solana/receiptRegistry.ts - to jedyne miejsce,
 * ktore o nim decyduje.
 */

import type { Connection, VersionedTransactionResponse } from '@solana/web3.js';
import type { PlainTransaction } from '../../basechat/Solana/bags/bagsCore';

/** Transakcja z RPC zamieniona na zwykle dane, ktore czyta readBagsProof. */
function toPlain(res: VersionedTransactionResponse): PlainTransaction | null {
  if (!res.meta) return null;
  const message = res.transaction.message;
  // Wiadomosc v0 z tablicami adresow wymaga kluczy z tablic, zeby indeksy
  // kont w instrukcjach wskazywaly wlasciwe adresy. Legacy ich nie ma.
  const keys =
    message.version === 0
      ? message.getAccountKeys({ accountKeysFromLookups: res.meta.loadedAddresses ?? undefined })
      : message.getAccountKeys();

  const accountKeys: string[] = [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys.get(i);
    if (!key) return null;
    accountKeys.push(key.toBase58());
  }

  return {
    feePayer: accountKeys[0],
    accountKeys,
    instructions: message.compiledInstructions.map(ix => ({
      programId: accountKeys[ix.programIdIndex],
      accountIndexes: Array.from(ix.accountKeyIndexes),
      data: ix.data,
    })),
    preBalances: res.meta.preBalances,
    preTokenBalances: (res.meta.preTokenBalances ?? []).map(b => ({
      accountIndex: b.accountIndex,
      mint: b.mint,
      owner: b.owner,
      amount: b.uiTokenAmount.amount,
      decimals: b.uiTokenAmount.decimals,
      programId: b.programId,
    })),
  };
}

/**
 * Transakcja z lancucha jako zwykle dane - wspolny odczyt dla kwitu posta
 * i dla platnych odpowiedzi. `null`, gdy RPC jej (jeszcze) nie zna.
 */
export async function fetchPlainTransaction(
  connection: Connection,
  signature: string
): Promise<{ plain: PlainTransaction; failed: boolean; slot: number; blockTime: number | null } | null> {
  const res = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });
  if (!res) return null;
  const plain = toPlain(res);
  if (!plain) return null;
  return { plain, failed: !!res.meta?.err, slot: res.slot, blockTime: res.blockTime ?? null };
}
