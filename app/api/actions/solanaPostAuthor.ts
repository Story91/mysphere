import 'server-only';

/**
 * Portfel Solany autora posta - wspolny dla Blinka z napiwkiem i dla platnych
 * odpowiedzi. Oba przelewaja pieniadze na ten adres, wiec oba MUSZA brac go
 * z tego samego zrodla: z rejestru kwitow (app/utils/solana/receiptRegistry.ts),
 * a nie z pola `txHash` posta.
 *
 * Do 23.09.2026 adres brany byl z `txHash` posta po sprawdzeniu prefiksu memo.
 * Przeglad przeciwnika pokazal, ze `posts` sa zapisywalne dla kazdej
 * przegladarki, wiec kazdy mogl podpiac WLASNA transakcje pod CUDZY post
 * i przekierowac napiwki. Szczegoly i trzy warstwy ochrony: naglowek
 * receiptRegistry.ts.
 *
 * Bledy niosa status HTTP, bo "nie umiemy teraz odczytac" (502/503, ponow)
 * i "to nie jest kwit tego posta" (400, nie ponawiaj) to rozne odpowiedzi.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getPostForShare, type SharedPost } from '../../utils/posts/getPostForShare';
import { resolveRegisteredReceipt } from '../../utils/solana/receiptRegistry';
import { SOLANA_RPC_URL, isValidPostId } from '../../basechat/Solana/config/solanaChain';

export type SolanaPostAuthor =
  | {
      ok: true;
      post: SharedPost;
      wallet: PublicKey;
      txHash: string;
      /**
       * Jak nazwac odbiorce na karcie Blinka. Z REJESTRU (adres z sesji SIWE
       * w chwili zapisu), a nie z pol posta, ktore zmieni kazda przegladarka -
       * inaczej karta "Tip <cudze imie>" moglaby prowadzic do obcego portfela.
       */
      payeeLabel: string;
    }
  | { ok: false; error: string; status: number };

export function solanaConnection(): Connection {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

const NOT_SOLANA = 'This post was not published on Solana, so it has no Solana wallet to pay.';
const RETRY_LATER = 'The on-chain receipt for this post could not be read right now. Try again in a moment.';

export async function resolveSolanaPostAuthor(postId: string): Promise<SolanaPostAuthor> {
  // `|` w ID rozjechalby memo odpowiedzi, a smieci nie maja isc do Firestore.
  if (!isValidPostId(postId)) return { ok: false, error: 'This post does not exist.', status: 404 };

  // getPostForShare RZUCA przy chwilowej awarii Firestore i zwraca null tylko
  // wtedy, gdy posta naprawde nie ma. Do 23.09 oba przypadki zlewaly sie w 404
  // "post no longer exists", a nasza strona odpowiedzi traktowala 404 jako
  // ostateczne i przestawala ponawiac zapis juz OPLACONEJ odpowiedzi.
  let post: SharedPost | null;
  try {
    post = await getPostForShare(postId);
  } catch (error) {
    console.error('[actions] Chwilowy blad odczytu posta:', error);
    return { ok: false, error: RETRY_LATER, status: 503 };
  }
  if (!post) return { ok: false, error: 'This post no longer exists.', status: 404 };

  let resolution;
  try {
    resolution = await resolveRegisteredReceipt(postId);
  } catch (error) {
    console.error('[actions] Nie udalo sie odczytac kwitu posta:', error);
    return { ok: false, error: RETRY_LATER, status: 502 };
  }

  if (resolution.ok) {
    const { receipt } = resolution;
    return {
      ok: true,
      post,
      wallet: new PublicKey(receipt.signer),
      txHash: receipt.txHash,
      payeeLabel: receipt.author ? shortenAddress(receipt.author) : shortenAddress(receipt.signer),
    };
  }

  switch (resolution.reason) {
    case 'post-missing':
      return { ok: false, error: 'This post no longer exists.', status: 404 };
    case 'not-solana':
      return { ok: false, error: NOT_SOLANA, status: 400 };
    case 'unavailable':
      // Bez rejestru nie wiemy na pewno, czyj to portfel - a tu chodzi o
      // pieniadze. Blokujemy zamiast zgadywac.
      return { ok: false, error: 'Payments to Solana posts are temporarily unavailable. Nothing was charged.', status: 503 };
    case 'wrong-cluster':
      return {
        ok: false,
        error: 'This post was published on a different Solana cluster, so it cannot be paid here.',
        status: 400,
      };
    default:
      // unregistered / tampered: nie ma zweryfikowanego portfela autora.
      return {
        ok: false,
        error: 'This post has no verified Solana wallet, so it cannot receive payments. Nothing was charged.',
        status: 400,
      };
  }
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
