import 'server-only';

/**
 * Kwit posta z Solany: czy transakcja istnieje, czy przeszla i czy NALEZY do
 * tego posta.
 *
 * ===========================================================================
 * DLACZEGO "NALEZY" JEST OSOBNYM PYTANIEM
 * ===========================================================================
 * Pole `txHash` w dokumencie posta zapisuje klient. Do 23.09.2026 nikt go nie
 * sprawdzal, wiec byl dowolnym stringiem: dalo sie wpisac CUDZY podpis
 * i przypisac sobie cudzy portfel. Dla odznaki sieci to kosmetyka. Dla
 * Proof of Bags byloby to podrobienie cudzych bagow, a dla Blinka z napiwkiem -
 * przekierowanie cudzych napiwkow na obcy portfel.
 *
 * Wiazanie: memo posta (`mysphere:post|<autor>|<poczatek tresci>`) musi
 * wskazywac platnika oplaty jako autora, a jego tresc musi byc poczatkiem
 * tresci posta w Firestore. Cudzej transakcji nie da sie wiec podpiac pod
 * wlasny post - chyba ze post jest identyczny z cudzym, a wtedy portfel i tak
 * wskazuje na autora oryginalu.
 */

import type { Connection, VersionedTransactionResponse } from '@solana/web3.js';
import { readBagsProof, type BagsProof, type PlainTransaction } from '../../basechat/Solana/bags/bagsCore';
import { memoMatchesPost } from '../../basechat/Solana/config/solanaChain';

export type PostReceipt =
  | {
      ok: true;
      /** Portfel Solany, ktory podpisal i oplacil post. */
      signer: string;
      slot: number;
      blockTime: number | null;
      proof: BagsProof;
    }
  | {
      ok: false;
      /**
       * not-found - RPC nie zna transakcji (swieza albo zly podpis),
       * failed-tx - transakcja jest, ale wykonala sie z bledem,
       * unverified - transakcja nie jest kwitem TEGO posta.
       */
      reason: 'not-found' | 'failed-tx' | 'unverified';
    };

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

export async function verifyPostReceipt(
  connection: Connection,
  txHash: string,
  postContent: string
): Promise<PostReceipt> {
  const res = await connection.getTransaction(txHash, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });
  if (!res) return { ok: false, reason: 'not-found' };
  if (res.meta?.err) return { ok: false, reason: 'failed-tx' };

  const plain = toPlain(res);
  if (!plain) return { ok: false, reason: 'not-found' };

  const proof = readBagsProof(plain);
  const memo = proof.postMemo;
  if (!memo || memo.author !== plain.feePayer || !memoMatchesPost(memo.body, postContent)) {
    return { ok: false, reason: 'unverified' };
  }

  return { ok: true, signer: plain.feePayer, slot: res.slot, blockTime: res.blockTime ?? null, proof };
}
