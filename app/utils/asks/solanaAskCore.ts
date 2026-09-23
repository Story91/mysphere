import { createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';
import type { PlainTransaction } from '../../basechat/Solana/bags/bagsCore';
import { MEMO_PROGRAM_ADDRESS } from '../../basechat/Solana/config/solanaChain';
import { isSolanaAddress, readSystemTransfer } from '../../basechat/Solana/replies/replyCore';
import { AskError, SEAL_DOMAINS, isDocId, keyForKid, lowerAddress, sealMac, type AskSealKey, type AskSealKeys } from './askSealCore';
import { ASK_PAYOUT_MEMO_PREFIX, SOLANA_BINDING_TTL_MS, buildAskPayoutMemo, buildSolanaBindingMessage } from './solAmounts';

/**
 * ASKI NA SOLANIE - czysta logika serwera: base58, podpis ed25519,
 * challenge powiazania portfela i weryfikacja wyplaty. Bez Firestore, bez RPC
 * i bez '@solana/*'.
 *
 * Plik NIE importuje 'server-only', zeby mocha ladowala go wprost
 * (test/asksSolanaCore.test.ts), ale ciagnie node:crypto - do przegladarki nie
 * trafia. Kod klienta bierze formaty z solAmounts.ts.
 *
 * ed25519 bez nowych paczek: Node weryfikuje go natywnie, trzeba tylko
 * owinac 32 bajty klucza w naglowek SPKI (DER) - `crypto.verify(null, ...)`.
 */

/* ------------------------------------------------------------------ */
/*  BASE58                                                             */
/* ------------------------------------------------------------------ */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * base58 (alfabet Bitcoina, jak w Solanie) -> bajty, albo null. Bigintem:
 * wiodace '1' to wiodace bajty zerowe. Bez zadnej normalizacji wielkosci
 * liter - 'a' i 'A' to rozne cyfry. `maxChars` chroni przed kwadratowym
 * kosztem na smieciach z zadania (podpis ma najwyzej 88 znakow).
 */
export function decodeBase58(text: unknown, maxChars = 128): Uint8Array | null {
  if (typeof text !== 'string' || text === '' || text.length > maxChars) return null;
  let value = 0n;
  let zeros = 0;
  let leading = true;
  for (const ch of text) {
    const digit = BASE58_ALPHABET.indexOf(ch);
    if (digit < 0) return null;
    if (leading && digit === 0) zeros += 1;
    else leading = false;
    value = value * 58n + BigInt(digit);
  }
  const body: number[] = [];
  while (value > 0n) {
    body.push(Number(value & 0xffn));
    value >>= 8n;
  }
  body.reverse();
  const out = new Uint8Array(zeros + body.length);
  out.set(body, zeros);
  return out;
}

/* ------------------------------------------------------------------ */
/*  PODPIS ED25519                                                     */
/* ------------------------------------------------------------------ */

/** Naglowek DER SubjectPublicKeyInfo dla Ed25519 (OID 1.3.101.112) + BIT STRING 32 B. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Czy `signature` jest podpisem ed25519 wiadomosci `message` kluczem
 * `publicKey` (adres Solany = klucz publiczny w base58).
 *
 * Podpis przyjmujemy jako bajty (signMessage portfela zwraca Uint8Array) albo
 * base58. Kazdy blad (zly klucz, punkt spoza krzywej, zla dlugosc) to false -
 * wolajacy odpowiada wtedy solana_signature_invalid, a nie 500.
 */
export function verifySolanaMessageSignature(
  message: string | Uint8Array,
  signature: string | Uint8Array,
  publicKey: string
): boolean {
  const key = decodeBase58(publicKey);
  if (!key || key.length !== 32) return false;
  const sig = typeof signature === 'string' ? decodeBase58(signature) : signature;
  if (!(sig instanceof Uint8Array) || sig.length !== 64) return false;
  const bytes = typeof message === 'string' ? Buffer.from(message, 'utf8') : Buffer.from(message);
  try {
    const spki = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(key)]), format: 'der', type: 'spki' });
    return cryptoVerify(null, bytes, spki, Buffer.from(sig));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  CHALLENGE POWIAZANIA PORTFELA                                      */
/* ------------------------------------------------------------------ */

/** Luz zegara miedzy instancjami serwera (mint na jednej, check na drugiej). */
export const BINDING_CLOCK_SKEW_MS = 60_000;

const CHALLENGE_VERSION = 'v1';

export type BindingChallenge = {
  /** `v1.<kid>.<issuedAtMs>.<nonce>.<mac>` - klient odsyla go bez zmian. */
  challenge: string;
  /** Tekst do podpisania portfelem (buildSolanaBindingMessage). */
  message: string;
  nonce: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

function challengeMac(key: Buffer, payload: { evm: string; solana: string; issuedAtMs: number; nonce: string }): string {
  return sealMac(key, SEAL_DOMAINS.solChallenge, payload);
}

/**
 * Nowy challenge dla pary (konto EVM z sesji, portfel Solany z zadania).
 *
 * Bezstanowy: nie zapisujemy go nigdzie, MAC wiaze evm, solana, czas i nonce.
 * Podrobiony albo przeniesiony na inny portfel challenge nie przejdzie
 * checkBindingChallenge. `nonce` tylko dla testow - produkcja losuje 16 bajtow.
 * Rzuca AskError('invalid_address', 400) przy zlym adresie.
 */
export function mintBindingChallenge(
  key: AskSealKey,
  input: { evm: string; solana: string; nowMs: number; nonce?: string }
): BindingChallenge {
  const evm = lowerAddress(input.evm);
  if (!evm) throw new AskError('invalid_address', 400, 'The account is not an EVM address.');
  if (!isSolanaAddress(input.solana)) throw new AskError('invalid_address', 400, 'That is not a Solana address.');
  const issuedAtMs = Math.floor(input.nowMs);
  if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs <= 0) throw new AskError('invalid_ask', 400, 'Invalid clock value.');
  const nonce = input.nonce ?? randomBytes(16).toString('hex');
  if (!/^[0-9a-f]{32}$/.test(nonce)) throw new AskError('invalid_ask', 400, 'Invalid nonce.');
  const mac = challengeMac(key.key, { evm, solana: input.solana, issuedAtMs, nonce });
  return {
    challenge: `${CHALLENGE_VERSION}.${key.kid}.${issuedAtMs}.${nonce}.${mac}`,
    message: buildSolanaBindingMessage({ solana: input.solana, evm, nonce, issuedAtMs }),
    nonce,
    issuedAtMs,
    expiresAtMs: issuedAtMs + SOLANA_BINDING_TTL_MS,
  };
}

export type BindingChallengeCheck =
  | { ok: true; evm: string; solana: string; issuedAtMs: number; nonce: string; message: string }
  | { ok: false; reason: 'challenge_invalid' | 'challenge_expired' };

/**
 * Sprawdza challenge odeslany przez klienta dla (evm z SESJI, solana z zadania).
 *
 * Kolejnosc: ksztalt -> klucz (nieznany kid = invalid) -> MAC -> czas. MAC
 * przed czasem, zeby podrobiony znacznik czasu dawal 'challenge_invalid',
 * a nie mylace 'challenge_expired'. Czas: najwyzej 60 s "z przyszlosci"
 * i najwyzej 10 min + 60 s wstecz.
 *
 * Zwraca wiadomosc odtworzona po stronie serwera - DOKLADNIE ten tekst
 * sprawdza potem verifySolanaMessageSignature.
 */
export function checkBindingChallenge(
  keys: AskSealKeys,
  challenge: unknown,
  input: { evm: unknown; solana: unknown; nowMs: number }
): BindingChallengeCheck {
  const invalid = { ok: false, reason: 'challenge_invalid' } as const;
  if (typeof challenge !== 'string' || challenge.length > 300) return invalid;
  const parts = challenge.split('.');
  if (parts.length < 5 || parts[0] !== CHALLENGE_VERSION) return invalid;
  const mac = parts[parts.length - 1];
  const nonce = parts[parts.length - 2];
  const issuedText = parts[parts.length - 3];
  // kid moze kiedys zawierac kropke - skladamy go ze srodka.
  const kid = parts.slice(1, -3).join('.');
  if (!/^[0-9a-f]{64}$/.test(mac) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[1-9][0-9]{0,15}$/.test(issuedText)) return invalid;
  const issuedAtMs = Number(issuedText);
  if (!Number.isSafeInteger(issuedAtMs)) return invalid;

  const evm = lowerAddress(input.evm);
  if (!evm || !isSolanaAddress(input.solana)) return invalid;
  const solana = input.solana;
  const key = keyForKid(keys, kid);
  if (!key) return invalid;

  const expected = Buffer.from(challengeMac(key, { evm, solana, issuedAtMs, nonce }), 'hex');
  const given = Buffer.from(mac, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return invalid;

  if (!Number.isFinite(input.nowMs)) return invalid;
  if (issuedAtMs > input.nowMs + BINDING_CLOCK_SKEW_MS) return invalid;
  if (input.nowMs > issuedAtMs + SOLANA_BINDING_TTL_MS + BINDING_CLOCK_SKEW_MS) {
    return { ok: false, reason: 'challenge_expired' };
  }
  return {
    ok: true,
    evm,
    solana,
    issuedAtMs,
    nonce,
    message: buildSolanaBindingMessage({ solana, evm, nonce, issuedAtMs }),
  };
}

/* ------------------------------------------------------------------ */
/*  WERYFIKACJA WYPLATY SOL                                            */
/* ------------------------------------------------------------------ */

export type SolanaAskPayoutReason =
  | 'failed-tx'
  | 'no-ask-memo'
  | 'ambiguous-memo'
  | 'wrong-memo'
  | 'memo-not-signed'
  | 'no-transfer'
  | 'wrong-sender'
  | 'wrong-recipient'
  | 'too-small'
  | 'self-pay';

export type SolanaAskPayoutCheck =
  | { ok: true; lamports: bigint; memo: string }
  | { ok: false; reason: SolanaAskPayoutReason };

/**
 * Transakcja do sprawdzenia - zwykle dane (jak w bagsCore/replyCore), nie
 * obiekt web3.js. `signers` opcjonalne: gdy trasa je zna (naglowek wiadomosci),
 * platnik musi byc wsrod nich; bez nich wystarcza gwarancja Memo v2 (kazde
 * konto przekazane do Memo v2 musi podpisac, inaczej transakcja pada).
 */
export type SolanaPayoutTx = Pick<PlainTransaction, 'accountKeys' | 'instructions'> & {
  failed?: boolean;
  signers?: readonly string[];
};

const decoder = new TextDecoder();

/**
 * Czy transakcja jest wyplata za TE odpowiedz na TYM Asku SOL.
 *
 * `payer` = state.solana.payer (zamrozony przy tworzeniu Aska), `payee` =
 * odbiorca zamrozony w asks/{id}/payees/{answerId}, `minLamports` =
 * perAnswerLamports ze stanu. Wszystko z pieczeci, nic z zadania.
 *
 * Kolejnosc sprawdzen (i powody) sa czescia kontraktu z trasa accept:
 *   failed-tx        transakcja padla na lancuchu,
 *   no-ask-memo      zadnego memo `mysphere:ask|` (Memo v2),
 *   ambiguous-memo   wiecej niz jedno - jedna transakcja nie placi dwoch odpowiedzi,
 *   wrong-memo       memo innego Aska/odpowiedzi albo nie w formacie v1,
 *   memo-not-signed  platnika nie ma wsrod kont memo (albo wsrod podpisujacych) -
 *                    bez tego fee payer moglby "podpisac" memo za autora,
 *   no-transfer      brak instrukcji SystemProgram.Transfer,
 *   wrong-sender     zaden transfer nie wychodzi od platnika autora,
 *   wrong-recipient  zaden transfer platnika nie idzie do odbiorcy odpowiedzi,
 *   too-small        suma przelewow platnik -> odbiorca < stawka,
 *   self-pay         platnik == odbiorca (autor "placi" sam sobie).
 * Fee payer NIE musi byc autorem - liczy sie zrodlo transferu i podpis memo.
 */
export function verifySolanaAskPayout(
  tx: SolanaPayoutTx,
  expected: { askId: string; answerId: string; payer: string; payee: string; minLamports: bigint }
): SolanaAskPayoutCheck {
  if (tx.failed) return { ok: false, reason: 'failed-tx' };

  const askMemos: Array<{ memo: string; accountIndexes: number[] }> = [];
  for (const ix of tx.instructions) {
    if (ix.programId !== MEMO_PROGRAM_ADDRESS) continue;
    const memo = decoder.decode(ix.data);
    if (memo.startsWith(ASK_PAYOUT_MEMO_PREFIX)) askMemos.push({ memo, accountIndexes: ix.accountIndexes });
  }
  if (askMemos.length === 0) return { ok: false, reason: 'no-ask-memo' };
  if (askMemos.length > 1) return { ok: false, reason: 'ambiguous-memo' };

  const [{ memo, accountIndexes }] = askMemos;
  if (!isDocId(expected.askId) || !isDocId(expected.answerId)) return { ok: false, reason: 'wrong-memo' };
  if (memo !== buildAskPayoutMemo(expected.askId, expected.answerId)) return { ok: false, reason: 'wrong-memo' };

  const memoAccounts = accountIndexes.map((index) => tx.accountKeys[index]);
  if (!memoAccounts.includes(expected.payer)) return { ok: false, reason: 'memo-not-signed' };
  if (tx.signers && !tx.signers.includes(expected.payer)) return { ok: false, reason: 'memo-not-signed' };

  const transfers = tx.instructions
    .map((ix) => readSystemTransfer(ix, tx.accountKeys))
    .filter((t): t is NonNullable<typeof t> => t !== null);
  if (transfers.length === 0) return { ok: false, reason: 'no-transfer' };

  const fromPayer = transfers.filter((t) => t.from === expected.payer);
  if (fromPayer.length === 0) return { ok: false, reason: 'wrong-sender' };

  const toPayee = fromPayer.filter((t) => t.to === expected.payee);
  if (toPayee.length === 0) return { ok: false, reason: 'wrong-recipient' };

  const lamports = toPayee.reduce((sum, t) => sum + t.lamports, 0n);
  if (lamports < expected.minLamports) return { ok: false, reason: 'too-small' };

  if (expected.payer === expected.payee) return { ok: false, reason: 'self-pay' };

  return { ok: true, lamports, memo };
}
