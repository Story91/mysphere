/**
 * Platne odpowiedzi z X - czysta logika. Bez web3.js, bez sieci.
 *
 * Odpowiedz i napiwek dla autora ida w jednej transakcji: memo z trescia
 * i transfer SOL do portfela, ktory podpisal post. Serwer zapisuje komentarz
 * dopiero po sprawdzeniu tej transakcji na lancuchu - a TRESC bierze z memo,
 * nie z zadania, wiec w feedzie laduje dokladnie to, co ktos podpisal
 * i oplacil.
 *
 * Spec: docs/superpowers/specs/2026-09-23-paid-replies-from-x-design.md.
 */

import { MEMO_PROGRAM_ADDRESS, normalizePostText } from '../config/solanaChain';
import type { PlainInstruction, PlainTransaction } from '../bags/bagsCore';

/**
 * 0.001 SOL. Tyle kosztuje odpowiedz: spam musi kosztowac, a autor ma
 * zarabiac na rozmowie pod swoim postem. Opłata sieci (~0.000005 SOL) sama
 * w sobie spamu nie zatrzyma - to prawie dwiescie razy mniej.
 */
export const REPLY_MIN_LAMPORTS = 1_000_000n;

/** Kwoty w karcie Blinka. Najnizsza to minimum. */
export const REPLY_AMOUNTS_SOL = [0.001, 0.01, 0.05] as const;

/** Limit tresci - ten sam co dla memo posta, a wiec i dla transakcji. */
export const REPLY_MAX_BYTES = 280;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Ile bajtow koduje napis base58 - albo null, gdy to nie base58. */
export function base58ByteLength(text: string): number | null {
  if (!text || text.length > 100) return null;
  let value = 0n;
  let leadingZeros = 0;
  let counting = true;
  for (const ch of text) {
    const digit = BASE58_ALPHABET.indexOf(ch);
    if (digit < 0) return null;
    if (counting && digit === 0) leadingZeros += 1;
    else counting = false;
    value = value * 58n + BigInt(digit);
  }
  let bytes = 0;
  while (value > 0n) {
    value >>= 8n;
    bytes += 1;
  }
  return bytes + leadingZeros;
}

/**
 * Podpis transakcji Solany: 64 bajty w base58. Tanie sprawdzenie PRZED
 * jakimkolwiek zapytaniem do RPC - smieci nie maja kosztowac nas limitu
 * publicznego endpointu.
 */
export function isSolanaSignature(value: unknown): value is string {
  return typeof value === 'string' && base58ByteLength(value) === 64;
}

/** Klucz publiczny Solany: 32 bajty w base58. */
export function isSolanaAddress(value: unknown): value is string {
  return typeof value === 'string' && base58ByteLength(value) === 32;
}

export const SYSTEM_PROGRAM_ADDRESS = '11111111111111111111111111111111';

const REPLY_MEMO_PREFIX = 'mysphere:reply|v1|';

/** Indeks instrukcji Transfer w SystemProgram (u32 LE na poczatku danych). */
const SYSTEM_TRANSFER_INDEX = 2;

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Tresc odpowiedzi po normalizacji - albo powod odmowy.
 *
 * Za dluga tresc jest ODRZUCANA, a nie przycinana: ucinanie cudzej, oplaconej
 * wypowiedzi bez pytania to zmienianie tego, za co ktos zaplacil.
 */
export function validateReplyText(
  raw: string
): { ok: true; text: string } | { ok: false; reason: 'empty' | 'too-long' } {
  const text = normalizePostText(raw);
  if (!text) return { ok: false, reason: 'empty' };
  if (utf8Length(text) > REPLY_MAX_BYTES) return { ok: false, reason: 'too-long' };
  return { ok: true, text };
}

export function buildReplyMemo(postId: string, text: string): string {
  return `${REPLY_MEMO_PREFIX}${postId}|${text}`;
}

/**
 * Rozbiera memo odpowiedzi. Identyfikator posta konczy sie na pierwszej kresce;
 * wszystko dalej to tresc, lacznie z kolejnymi kreskami.
 */
export function parseReplyMemo(memo: string): { postId: string; text: string } | null {
  if (!memo.startsWith(REPLY_MEMO_PREFIX)) return null;
  const rest = memo.slice(REPLY_MEMO_PREFIX.length);
  const separator = rest.indexOf('|');
  if (separator <= 0) return null;
  return { postId: rest.slice(0, separator), text: rest.slice(separator + 1) };
}

/**
 * Transfer SOL zapisany w instrukcji SystemProgram - albo `null`, gdy to inna
 * instrukcja. Uklad danych: u32 LE z indeksem instrukcji (2 = Transfer), potem
 * u64 LE z liczba lamportow. Konta: [nadawca, odbiorca].
 */
export function readSystemTransfer(
  ix: PlainInstruction,
  accountKeys: string[]
): { from: string; to: string; lamports: bigint } | null {
  if (ix.programId !== SYSTEM_PROGRAM_ADDRESS || ix.data.length < 12 || ix.accountIndexes.length < 2) return null;
  const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
  if (view.getUint32(0, true) !== SYSTEM_TRANSFER_INDEX) return null;
  return {
    from: accountKeys[ix.accountIndexes[0]],
    to: accountKeys[ix.accountIndexes[1]],
    lamports: view.getBigUint64(4, true),
  };
}

export type ReplyCheck =
  | { ok: true; text: string; lamports: bigint }
  | {
      ok: false;
      reason:
        | 'failed-tx'
        | 'self-reply'
        | 'wrong-payer'
        | 'no-reply-memo'
        | 'wrong-post'
        | 'bad-text'
        | 'no-tip'
        | 'tip-wrong-recipient'
        | 'tip-too-small';
    };

const decoder = new TextDecoder();

/**
 * Czy transakcja jest oplacona odpowiedzia na TEN post od TEGO portfela.
 *
 * Kolejnosc sprawdzen idzie od tanich do drogich i od "to nie nasza
 * transakcja" do "nasza, ale niewystarczajaca" - powod odmowy ma mowic
 * prawde o tym, co jest nie tak.
 */
export function verifyReplyTransaction(
  tx: PlainTransaction & { failed?: boolean },
  expected: { postId: string; account: string; authorWallet: string }
): ReplyCheck {
  if (tx.failed) return { ok: false, reason: 'failed-tx' };
  // Autor "placacy" sam sobie wyglada w feedzie jak oplacona odpowiedz, a nie
  // kosztuje go nic poza oplata sieci. Straz byla tylko w trasie POST - kto
  // zbudowal transakcje sam, omijal ja (znalezisko z przegladu 2026-09-23).
  if (expected.account === expected.authorWallet) return { ok: false, reason: 'self-reply' };
  if (tx.feePayer !== expected.account) return { ok: false, reason: 'wrong-payer' };

  // Dopasowanie po DOKLADNYM prefiksie z oczekiwanym ID, a nie po parsowaniu:
  // gdyby ID posta zawieralo `|` (Firestore na to pozwala), parseReplyMemo
  // ucialby je na pierwszej kresce i kazda oplacona odpowiedz dostawalaby
  // `wrong-post`, choc pieniadze doszly do autora.
  const ownPrefix = `${REPLY_MEMO_PREFIX}${expected.postId}|`;
  let sawReplyMemo = false;
  let reply: { postId: string; text: string } | null = null;
  for (const ix of tx.instructions) {
    if (ix.programId !== MEMO_PROGRAM_ADDRESS) continue;
    const memo = decoder.decode(ix.data);
    if (!memo.startsWith(REPLY_MEMO_PREFIX)) continue;
    sawReplyMemo = true;
    if (memo.startsWith(ownPrefix)) {
      reply = { postId: expected.postId, text: memo.slice(ownPrefix.length) };
      break;
    }
  }
  if (!sawReplyMemo) return { ok: false, reason: 'no-reply-memo' };
  if (!reply) return { ok: false, reason: 'wrong-post' };

  const text = validateReplyText(reply.text);
  // Tresc z lancucha musi juz byc w postaci znormalizowanej - inaczej nie
  // przeszlaby przez nasza trase POST, wiec ktos zbudowal transakcje sam.
  if (!text.ok || text.text !== reply.text) return { ok: false, reason: 'bad-text' };

  const transfers = tx.instructions
    .map(ix => readSystemTransfer(ix, tx.accountKeys))
    .filter((t): t is NonNullable<typeof t> => t !== null && t.from === expected.account && t.from !== t.to);
  if (transfers.length === 0) return { ok: false, reason: 'no-tip' };

  const toAuthor = transfers.filter(t => t.to === expected.authorWallet);
  if (toAuthor.length === 0) return { ok: false, reason: 'tip-wrong-recipient' };

  const lamports = toAuthor.reduce((sum, t) => sum + t.lamports, 0n);
  if (lamports < REPLY_MIN_LAMPORTS) return { ok: false, reason: 'tip-too-small' };

  return { ok: true, text: reply.text, lamports };
}
