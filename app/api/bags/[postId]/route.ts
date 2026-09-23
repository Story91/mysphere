/**
 * Proof of Bags - werdykt dla jednego posta.
 *
 * Spec: docs/superpowers/specs/2026-09-23-proof-of-bags-design.md.
 *
 * Kolejnosc sprawdzen jest celowa i kazde z nich konczy sie cisza, a nie
 * odznaka: lepiej, zeby post nie mial odznaki wcale, niz zeby mial falszywa.
 *
 *   1. post istnieje i pochodzi z Solany,
 *   2. post ma wpis w rejestrze kwitow (zapisany przez serwer razem z postem),
 *   3. transakcja niesie instrukcje Proof of Bags,
 *   4. kazde konto tokenowe to ATA autora, a runtime zapisal jego saldo
 *      z autorem jako wlascicielem,
 *   5. saldo teraz - odczytane z lancucha w chwili zapytania.
 */

import { Connection, PublicKey, type ParsedAccountData } from '@solana/web3.js';
import { getPostForShare } from '../../../utils/posts/getPostForShare';
import { fetchPlainTransaction } from '../../../utils/solana/postReceipt';
import { resolveRegisteredReceipt } from '../../../utils/solana/receiptRegistry';
import { ataProgramFor } from '../../../basechat/Solana/bags/ata';
import {
  computeVerdict,
  formatTokenAmount,
  readBagsProof,
  type BagsPositionDto,
  type BagsResponse,
} from '../../../basechat/Solana/bags/bagsCore';
import { SOLANA_RPC_URL, solanaExplorerTxUrl } from '../../../basechat/Solana/config/solanaChain';

export const runtime = 'nodejs';
// Saldo "teraz" zmienia sie z kazdym blokiem - nie prerenderujemy.
export const dynamic = 'force-dynamic';

function json(body: BagsResponse, status = 200, cache = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Minuta na CDN: odznaka pod postem, ktory ogladaja setki osob, nie moze
      // oznaczac setek zapytan do publicznego RPC. "Teraz" z minutowym
      // opoznieniem to uczciwa cena za to, ze w ogole dziala.
      'Cache-Control': cache ? 'public, s-maxage=60, stale-while-revalidate=300' : 'no-store',
    },
  });
}

interface TokenMeta {
  symbol: string | null;
  name: string | null;
  icon: string | null;
}

/**
 * Symbol i ikona z Jupitera. Awaria nie jest bledem odznaki - pokazemy wtedy
 * skrocony adres minta. Doba cache'u, bo symbol tokena praktycznie sie nie
 * zmienia, a Jupiter ma limity.
 */
async function fetchTokenMeta(mint: string): Promise<TokenMeta> {
  try {
    const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return { symbol: null, name: null, icon: null };
    const list = (await res.json()) as Array<{ id?: string; symbol?: string; name?: string; icon?: string }>;
    const hit = list.find(t => t.id === mint);
    return { symbol: hit?.symbol ?? null, name: hit?.name ?? null, icon: hit?.icon ?? null };
  } catch {
    return { symbol: null, name: null, icon: null };
  }
}

type ParsedTokenAccount = { owner?: string; tokenAmount?: { amount?: string; decimals?: number } };
type ParsedMint = { decimals?: number };

function parsedInfo<T>(account: { data: Buffer | ParsedAccountData } | null): T | null {
  if (!account || Buffer.isBuffer(account.data)) return null;
  return (account.data.parsed?.info ?? null) as T | null;
}

export async function GET(_request: Request, { params }: { params: { postId: string } }) {
  let post;
  try {
    post = await getPostForShare(params.postId);
  } catch (error) {
    console.error('[api/bags] Chwilowy blad odczytu posta:', error);
    return json({ status: 'error' }, 503);
  }
  if (!post) return json({ status: 'not-found' }, 404);
  if (post.network !== 'solana' || !post.txHash) return json({ status: 'not-applicable' }, 200, true);

  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

  // Kwit z REJESTRU, nie z pola `txHash` posta: to pole moze zmienic kazda
  // przegladarka, a wtedy pod cudzym postem pokazalibysmy czyjes bagi.
  // Szczegoly: naglowek app/utils/solana/receiptRegistry.ts.
  let resolution;
  try {
    resolution = await resolveRegisteredReceipt(params.postId);
  } catch (error) {
    console.error('[api/bags] Nie udalo sie odczytac kwitu posta:', error);
    return json({ status: 'error' }, 502);
  }
  if (!resolution.ok) {
    if (resolution.reason === 'not-solana') return json({ status: 'not-applicable' }, 200, true);
    if (resolution.reason === 'post-missing') return json({ status: 'not-found' }, 200, true);
    if (resolution.reason === 'unavailable') return json({ status: 'error' }, 503);
    return json({ status: 'unverified' }, 200, true);
  }

  let fetched;
  try {
    fetched = await fetchPlainTransaction(connection, resolution.receipt.txHash);
  } catch (error) {
    console.error('[api/bags] Nie udalo sie odczytac transakcji z rejestru:', error);
    return json({ status: 'error' }, 502);
  }
  if (!fetched || fetched.failed || fetched.plain.feePayer !== resolution.receipt.signer) {
    return json({ status: 'unverified' }, 200, true);
  }
  const receipt = { signer: resolution.receipt.signer, blockTime: resolution.receipt.blockTime, proof: readBagsProof(fetched.plain) };
  if (!receipt.proof.positions) return json({ status: 'no-proof' }, 200, true);

  const signer = receipt.signer;
  // Tylko pozycje z dowodem: saldo zapisane z autorem jako wlascicielem albo
  // konto, ktorego nie bylo. Do tego konto MUSI byc ATA autora dla tego minta -
  // inaczej ktos dokladalby do posta dowolne konto tokenowe.
  const proven = receipt.proof.positions
    .filter(p => p.ownerOk && p.atPost !== null)
    .filter(p => ataProgramFor(signer, p.mint, p.ata) !== null);
  if (proven.length === 0) return json({ status: 'unverified' }, 200, true);

  let accounts;
  try {
    // Jedno zapytanie: najpierw konta tokenowe (saldo teraz), potem minty
    // (decimals dla pozycji, ktorej w chwili posta nie bylo).
    accounts = await connection.getMultipleParsedAccounts([
      ...proven.map(p => new PublicKey(p.ata)),
      ...proven.map(p => new PublicKey(p.mint)),
    ]);
  } catch (error) {
    console.error('[api/bags] Nie udalo sie odczytac sald:', error);
    return json({ status: 'error' }, 502);
  }

  const metas = await Promise.all(proven.map(p => fetchTokenMeta(p.mint)));

  const positions: BagsPositionDto[] = proven.map((p, i) => {
    const token = parsedInfo<ParsedTokenAccount>(accounts.value[i]);
    const mint = parsedInfo<ParsedMint>(accounts.value[proven.length + i]);
    const decimals = p.decimals ?? token?.tokenAmount?.decimals ?? mint?.decimals ?? 0;

    // Konto zamkniete albo przekazane komus innemu = autor tego tokena w tym
    // portfelu juz nie ma. Nie twierdzimy, czy to sprzedaz, czy przelew.
    const now = token && token.owner === signer ? BigInt(token.tokenAmount?.amount ?? '0') : 0n;
    const atPost = p.atPost as bigint;
    const { verdict, changePct } = computeVerdict(atPost, now);

    return {
      mint: p.mint,
      ...metas[i],
      decimals,
      atPost: atPost.toString(),
      now: now.toString(),
      atPostUi: formatTokenAmount(atPost, decimals),
      nowUi: formatTokenAmount(now, decimals),
      verdict,
      changePct,
    };
  });

  return json(
    {
      status: 'ok',
      signer,
      txHash: resolution.receipt.txHash,
      explorerUrl: solanaExplorerTxUrl(resolution.receipt.txHash),
      blockTime: receipt.blockTime,
      positions,
    },
    200,
    true
  );
}
