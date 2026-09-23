/**
 * Blink: platna odpowiedz na post z MySphere - prosto z X.
 *
 * Odpowiedz i napiwek dla autora ida w jednej transakcji: memo z trescia
 * i transfer SOL. Po potwierdzeniu klient Blinka odsyla podpis na /confirm
 * (action chaining) i dopiero serwer, po sprawdzeniu transakcji na lancuchu,
 * zapisuje komentarz.
 *
 * Spec: docs/superpowers/specs/2026-09-23-paid-replies-from-x-design.md.
 */

import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { MEMO_PROGRAM_ADDRESS, SOLANA_NETWORK_LABEL } from '../../../../basechat/Solana/config/solanaChain';
import {
  buildReplyMemo,
  isSolanaAddress,
  REPLY_AMOUNTS_SOL,
  REPLY_MAX_BYTES,
  REPLY_MIN_LAMPORTS,
  validateReplyText,
} from '../../../../basechat/Solana/replies/replyCore';
import { replyStoreAvailable } from '../../../../utils/solana/replyStore';
import { ACTION_HEADERS, actionError, actionJson, misconfiguredCluster, originFrom } from '../../actionHeaders';
import { resolveSolanaPostAuthor, shortenAddress, solanaConnection } from '../../solanaPostAuthor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Gorny limit - ochrona przed pomylka o rzad wielkosci, jak przy napiwku. */
const MAX_REPLY_SOL = 100;

const UNAVAILABLE = 'Replies are temporarily unavailable. Nothing was charged.';

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: ACTION_HEADERS });
}

export async function GET(request: Request, { params }: { params: { postId: string } }) {
  const misconfigured = misconfiguredCluster();
  if (misconfigured) return misconfigured;

  const resolved = await resolveSolanaPostAuthor(params.postId);
  if (!resolved.ok) return actionError(resolved.error, resolved.status);
  const { post, wallet, payeeLabel: author } = resolved;

  // Zanim ktokolwiek zaplaci: jesli serwer nie moze zapisac komentarza,
  // karta mowi to od razu, zamiast przyjac pieniadze na odpowiedz donikad.
  if (!(await replyStoreAvailable())) return actionError(UNAVAILABLE, 503);

  const origin = originFrom(request);
  const excerpt = post.content.length > 120 ? `${post.content.slice(0, 120)}…` : post.content;

  return actionJson({
    type: 'action',
    icon: `${origin}/post/${post.id}/opengraph-image`,
    title: `Reply to ${author} on MySphere`,
    description:
      `${excerpt}\n\n` +
      `Your reply is posted under this post and tips the author. It goes to ${wallet.toBase58()} on ${SOLANA_NETWORK_LABEL} - the wallet that signed the post.`,
    label: 'Reply',
    links: {
      actions: [
        {
          type: 'transaction' as const,
          label: 'Reply',
          // Wzgledny - patrz originFrom w actionHeaders.ts.
          href: `/api/actions/reply/${post.id}?text={text}&amount={amount}`,
          parameters: [
            {
              name: 'text',
              label: `Your reply (up to ${REPLY_MAX_BYTES} bytes)`,
              type: 'textarea' as const,
              required: true,
            },
            {
              name: 'amount',
              label: 'Tip for the author',
              type: 'select' as const,
              required: true,
              options: REPLY_AMOUNTS_SOL.map((amount, i) => ({
                label: `${amount} SOL`,
                value: String(amount),
                selected: i === 0,
              })),
            },
          ],
        },
      ],
    },
  });
}

export async function POST(request: Request, { params }: { params: { postId: string } }) {
  const misconfigured = misconfiguredCluster();
  if (misconfigured) return misconfigured;

  let body: { account?: unknown };
  try {
    body = await request.json();
  } catch {
    return actionError('Malformed request.');
  }

  // Najpierw format: `new PublicKey` przyjmuje tez liczby i tablice, wiec
  // `{"account": 1}` dawalo "poprawny" klucz 111...2 zamiast odmowy.
  if (!isSolanaAddress(body?.account)) return actionError('That is not a valid Solana address.');
  const sender = new PublicKey(body.account);

  const url = new URL(request.url);
  // Tresc walidowana PRZED budowa transakcji: pusta albo za dluga odpowiedz
  // jest odrzucana, nie przycinana - nikt nie placi za cudza redakcje swoich slow.
  const text = validateReplyText(url.searchParams.get('text') ?? '');
  if (!text.ok) {
    return actionError(
      text.reason === 'empty' ? 'Write something to reply.' : `Keep the reply under ${REPLY_MAX_BYTES} bytes.`
    );
  }

  const amount = Number(url.searchParams.get('amount'));
  // Math.round - lamport jest calkowity, a 0.001 * 1e9 w zmiennoprzecinkowej
  // potrafi wyjsc tuz pod minimum.
  const lamports = Number.isFinite(amount) ? BigInt(Math.round(amount * LAMPORTS_PER_SOL)) : 0n;
  if (lamports < REPLY_MIN_LAMPORTS) {
    return actionError(`A reply tips the author at least ${Number(REPLY_MIN_LAMPORTS) / LAMPORTS_PER_SOL} SOL.`);
  }
  if (amount > MAX_REPLY_SOL) {
    return actionError(`For safety this Blink is capped at ${MAX_REPLY_SOL} SOL.`);
  }

  const resolved = await resolveSolanaPostAuthor(params.postId);
  if (!resolved.ok) return actionError(resolved.error, resolved.status);
  const { post, wallet: author } = resolved;

  if (author.equals(sender)) {
    return actionError('This is your own post - replying here would only tip yourself.');
  }
  if (!(await replyStoreAvailable())) return actionError(UNAVAILABLE, 503);

  try {
    const { blockhash, lastValidBlockHeight } = await solanaConnection().getLatestBlockhash('confirmed');
    const transaction = new Transaction({ feePayer: sender, blockhash, lastValidBlockHeight }).add(
      // Tresc odpowiedzi na lancuchu - to z niej serwer zapisze komentarz.
      new TransactionInstruction({
        keys: [{ pubkey: sender, isSigner: true, isWritable: false }],
        programId: new PublicKey(MEMO_PROGRAM_ADDRESS),
        data: Buffer.from(buildReplyMemo(post.id, text.text), 'utf8'),
      }),
      SystemProgram.transfer({ fromPubkey: sender, toPubkey: author, lamports })
    );

    return actionJson({
      type: 'transaction',
      transaction: transaction
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString('base64'),
      message: `Replying and tipping ${amount} SOL to ${shortenAddress(author.toBase58())}.`,
      links: {
        // Action chaining: po potwierdzeniu klient odsyla tu podpis, a serwer
        // zapisuje komentarz dopiero po sprawdzeniu transakcji na lancuchu.
        next: { type: 'post', href: `/api/actions/reply/${post.id}/confirm` },
      },
    });
  } catch (error) {
    console.error('[actions/reply] Nie udalo sie zbudowac transakcji:', error);
    return actionError('Could not build the transaction right now. Try again in a moment.', 502);
  }
}
