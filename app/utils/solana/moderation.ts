/**
 * Moderacja platnych odpowiedzi z X - czesc wspolna przegladarki i serwera.
 *
 * Platna odpowiedz to dokument `comments/{podpis}` z polem `tipLamports`,
 * zapisany przez serwer po weryfikacji transakcji (app/utils/solana/replyStore.ts).
 * Reguly Firestore nie pozwalaja jej skasowac przegladarce, wiec admin i autor
 * posta usuwaja ja przez POST /api/solana/reply-moderation.
 *
 * Czyste funkcje, bez importow serwerowych: plik laduje i klient
 * (app/utils/firebase.ts), i trasa. Dzieki temu obie strony maja JEDNA
 * definicje "to jest platna odpowiedz" - ta sama, ktorej uzywaja reguly.
 */

import { ADMIN_ADDRESS } from '../adminAddress';

export const PAID_REPLY_MODERATION_PATH = '/api/solana/reply-moderation';

/**
 * ID komentarza przyjmowane przez trase. Platna odpowiedz ma ID = podpis
 * transakcji Solany (base58, 87-88 znakow), zwykly komentarz - ID z Firestore
 * (20 znakow). Oba mieszcza sie w tym wzorcu; ukosnik, kropka czy spacja nie,
 * wiec wartosc z zadania nie zbuduje innej sciezki dokumentu.
 */
export const MODERATION_COMMENT_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function isModerationCommentId(value: unknown): value is string {
  return typeof value === 'string' && MODERATION_COMMENT_ID.test(value);
}

/**
 * Czy dane dokumentu to platna odpowiedz. Lustro regul Firestore
 * (`resource.data.get('tipLamports', null) == null` = zwykly komentarz),
 * wiec `tipLamports: null` to tez zwykly komentarz - przegladarka i tak
 * moze go skasowac, a trasa odeslalaby go z 400.
 */
export function isPaidReplyData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const tip = (data as { tipLamports?: unknown }).tipLamports;
  return tip !== undefined && tip !== null;
}

/**
 * Kto moze usunac platna odpowiedz: admin albo autor posta Z REJESTRU KWITOW
 * (receipt.author, adres EVM z sesji SIWE w chwili zapisu posta). Nigdy
 * `posts.author` - pole posta zapisuje kazda przegladarka.
 *
 * Pusty autor w kwicie (posty sprzed memo v2, zarejestrowane migracja) nie
 * pasuje do nikogo - takie odpowiedzi moderuje tylko admin.
 */
export function mayModeratePaidReply(sessionAddress: string, registeredAuthor: string | null): boolean {
  const session = sessionAddress.trim().toLowerCase();
  if (!session) return false;
  if (session === ADMIN_ADDRESS.toLowerCase()) return true;
  const author = (registeredAuthor ?? '').trim().toLowerCase();
  return author !== '' && author === session;
}

export function isAdminAddress(address: string): boolean {
  return address.trim().toLowerCase() === ADMIN_ADDRESS.toLowerCase();
}
