export {};

// Aski na Solanie - czysta logika toru A: kwoty w lamportach
// (app/utils/asks/solAmounts.ts), base58/ed25519/challenge/weryfikacja
// wyplaty (app/utils/asks/solanaAskCore.ts), pieczecie SOL (askSealCore.ts),
// widok, mapowanie i reseal. Bez Firestore i bez RPC.
// Runner: scripts/test-asks-seals.cjs.
const { expect } = require('chai');
const crypto = require('node:crypto');
const amounts = require('../app/utils/asks/solAmounts');
const solCore = require('../app/utils/asks/solanaAskCore');
const core = require('../app/utils/asks/askSealCore');
const { toAsk } = require('../app/utils/asks/askMapping');
const publicView = require('../app/utils/asks/askPublicView');
const reseal = require('../app/utils/asks/resealCore');
const { MEMO_PROGRAM_ADDRESS } = require('../app/basechat/Solana/config/solanaChain');
const { SYSTEM_PROGRAM_ADDRESS, base58ByteLength } = require('../app/basechat/Solana/replies/replyCore');

const {
  MIN_PER_ANSWER_LAMPORTS,
  MAX_BUDGET_LAMPORTS,
  parseSolToLamports,
  formatLamports,
  lamportsToSolNumber,
  perAnswerLamportsFor,
  isLamportsString,
  ASK_PAYOUT_MEMO_PREFIX,
  buildAskPayoutMemo,
  parseAskPayoutMemo,
  buildSolanaBindingMessage,
  isSolAsk,
} = amounts;
const { decodeBase58, verifySolanaMessageSignature, mintBindingChallenge, checkBindingChallenge, verifySolanaAskPayout } = solCore;
const {
  AskError,
  deriveAskSealKeys,
  newAskState,
  sealStateDoc,
  readSealedState,
  effectiveAsk,
  railOf,
  solanaTransferAcceptance,
  transferAcceptance,
  sealAcceptanceDoc,
  readAcceptance,
  readAnyAcceptance,
  payoutEntryFor,
  registryDoc,
  readRegistry,
  readAnyRegistry,
  solanaPayoutRegistryId,
  payoutRegistryIdFor,
  payoutRegistryId,
  isPayoutRegistryId,
  acceptancePayoutRef,
  solanaWalletBinding,
  sealSolanaBindingDoc,
  readSolanaBinding,
  answerPayee,
  sealPayeeDoc,
  readPayee,
  sealMac,
  SEAL_DOMAINS,
} = core;

/* ------------------------------------------------------------------ */
/*  Pomocnicze                                                         */
/* ------------------------------------------------------------------ */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Niezalezny koder base58 (dzieleniem bajtow, nie bigintem) - do sprawdzenia decodeBase58. */
function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = '';
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += '1';
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) out += ALPHABET[digits[i]];
  return out;
}

/** Para kluczy ed25519 i adres Solany z JWK `x` (base64url -> base58). */
function solanaKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const x = publicKey.export({ format: 'jwk' }).x as string;
  return { address: encodeBase58(Buffer.from(x, 'base64url')), privateKey };
}

function signMessage(privateKey: any, message: string): Uint8Array {
  return new Uint8Array(crypto.sign(null, Buffer.from(message, 'utf8'), privateKey));
}

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

function expectAskError(fn: () => unknown, code: string, status?: number) {
  let caught: any = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected AskError ${code}`).to.be.instanceOf(AskError);
  expect(caught.code).to.equal(code);
  if (status !== undefined) expect(caught.status).to.equal(status);
}

const ASK_ID = 'solAsk00000000000001';
const ANSWER_ID = 'solAnswer00000000001';
const AUTHOR = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
const AUTHOR_CHECKSUM = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const ANSWERER = '0xdf1e757062d7e6ef19bab6d6b1aa6f9fa44a09eb';
// Adres z wielka litera 'L' - malymi literami daje 'l', czyli znak spoza base58.
const PAYER = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const PAYEE = 'So11111111111111111111111111111111111111112';
const STRANGER = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SIGNATURE = encodeBase58(new Uint8Array(64).fill(7));
const OTHER_SIGNATURE = encodeBase58(new Uint8Array(64).fill(9));

const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'solana-test-secret-0123456789' });

function solInput(overrides: Record<string, unknown> = {}) {
  return {
    author: AUTHOR_CHECKSUM,
    origin: 'session',
    budget: 0,
    seats: 4,
    deadline: 1790000000000,
    funding: 'on-resolve',
    escrow: null,
    rail: 'sol-solana',
    solana: { cluster: 'devnet', payer: PAYER, budgetLamports: '100000001' },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Kwoty                                                              */
/* ------------------------------------------------------------------ */

describe('asks SOL: amounts', () => {
  it('constants match the owner decision (0.005 SOL minimum, 1000 SOL ceiling)', () => {
    expect(MIN_PER_ANSWER_LAMPORTS).to.equal(5_000_000n);
    expect(MAX_BUDGET_LAMPORTS).to.equal(1_000_000_000_000n);
  });

  it('parseSolToLamports accepts dot and comma, up to 9 decimals', () => {
    expect(parseSolToLamports('0.5')).to.equal(500_000_000n);
    expect(parseSolToLamports('0,5')).to.equal(500_000_000n);
    expect(parseSolToLamports(' 1 ')).to.equal(1_000_000_000n);
    expect(parseSolToLamports('.25')).to.equal(250_000_000n);
    expect(parseSolToLamports('2.')).to.equal(2_000_000_000n);
    expect(parseSolToLamports('0.000000001')).to.equal(1n);
    expect(parseSolToLamports('0')).to.equal(0n);
    expect(parseSolToLamports('1000')).to.equal(1_000_000_000_000n);
  });

  it('parseSolToLamports rejects exponents, signs, >9 decimals, separators and junk', () => {
    for (const bad of ['', ' ', '.', ',', '1e3', '1E-3', '-1', '+1', '0.0000000001', '1,000.5', '1.2.3', '1 000', 'abc', '0x10', 'Infinity', 'NaN', null, 1, undefined]) {
      expect(parseSolToLamports(bad), String(bad)).to.equal(null);
    }
    // u64 to sufit instrukcji Transfer.
    expect(parseSolToLamports('18446744073.709551615')).to.equal(18_446_744_073_709_551_615n);
    expect(parseSolToLamports('18446744073.709551616')).to.equal(null);
  });

  it('formatLamports is exact and trims zeros; lamportsToSolNumber for display', () => {
    expect(formatLamports(5_000_000n)).to.equal('0.005');
    expect(formatLamports('1000000000')).to.equal('1');
    expect(formatLamports(1n)).to.equal('0.000000001');
    expect(formatLamports(12_500_000_000n)).to.equal('12.5');
    expect(formatLamports(0n)).to.equal('0');
    expect(formatLamports('05')).to.equal('0');
    expect(formatLamports(-1n)).to.equal('0');
    expect(lamportsToSolNumber('300000000')).to.equal(0.3);
    for (const text of ['0.1', '0.3', '123.456789012', '0.005']) {
      expect(formatLamports(parseSolToLamports(text))).to.equal(text);
    }
  });

  it('isLamportsString: canonical decimal u64 only', () => {
    for (const good of ['0', '1', '5000000', '18446744073709551615']) expect(isLamportsString(good), good).to.equal(true);
    for (const bad of ['', '01', '-1', '1.5', '1e3', ' 1', '18446744073709551616', 5, 5n, null]) {
      expect(isLamportsString(bad), String(bad)).to.equal(false);
    }
  });

  it('perAnswerLamportsFor floors, never exceeds the budget, 0n on bad input', () => {
    expect(perAnswerLamportsFor(100_000_001n, 4)).to.equal(25_000_000n);
    expect(perAnswerLamportsFor('10', 3)).to.equal(3n);
    expect(perAnswerLamportsFor(10n, 0)).to.equal(0n);
    expect(perAnswerLamportsFor(10n, 1.5)).to.equal(0n);
    expect(perAnswerLamportsFor('x', 1)).to.equal(0n);
    // 0.02 SOL na 4 miejsca = dokladnie minimum; 0.019999999 - ponizej.
    expect(perAnswerLamportsFor(parseSolToLamports('0.02'), 4) >= MIN_PER_ANSWER_LAMPORTS).to.equal(true);
    expect(perAnswerLamportsFor(parseSolToLamports('0.019999999'), 4) >= MIN_PER_ANSWER_LAMPORTS).to.equal(false);
  });

  it('isSolAsk needs both SOL and solana', () => {
    expect(isSolAsk({ token: 'SOL', network: 'solana' })).to.equal(true);
    expect(isSolAsk({ token: 'USDC', network: 'solana' })).to.equal(false);
    expect(isSolAsk({ token: 'SOL', network: 'base' })).to.equal(false);
    expect(isSolAsk(null)).to.equal(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Memo i wiadomosc powiazania                                        */
/* ------------------------------------------------------------------ */

describe('asks SOL: payout memo and binding message', () => {
  it('builds and parses the whole memo', () => {
    const memo = buildAskPayoutMemo(ASK_ID, ANSWER_ID);
    expect(memo).to.equal(`mysphere:ask|v1|${ASK_ID}|${ANSWER_ID}`);
    expect(memo.startsWith(ASK_PAYOUT_MEMO_PREFIX)).to.equal(true);
    expect(parseAskPayoutMemo(memo)).to.deep.equal({ askId: ASK_ID, answerId: ANSWER_ID });
  });

  it('refuses ids that isDocId would refuse', () => {
    expect(() => buildAskPayoutMemo('a|b', ANSWER_ID)).to.throw(TypeError);
    expect(() => buildAskPayoutMemo(ASK_ID, '_registry')).to.throw(TypeError);
    for (const bad of [`mysphere:ask|v2|${ASK_ID}|${ANSWER_ID}`, `mysphere:ask|v1|${ASK_ID}|${ANSWER_ID}|x`, `mysphere:ask|v1|${ASK_ID}`, 'mysphere:ask|v1|a/b|c', 'other']) {
      expect(parseAskPayoutMemo(bad), bad).to.equal(null);
    }
  });

  it('binding message is byte-for-byte the spec format', () => {
    const message = buildSolanaBindingMessage({ solana: PAYER, evm: AUTHOR_CHECKSUM, nonce: 'ab'.repeat(16), issuedAtMs: Date.parse('2026-09-23T10:00:00Z') });
    expect(message).to.equal(
      [
        'mysphere: link a Solana wallet to Asks',
        '',
        `Solana wallet: ${PAYER}`,
        `Account: ${AUTHOR}`,
        'Use: receive SOL for accepted answers and pay SOL on your own Asks',
        `Nonce: ${'ab'.repeat(16)}`,
        'Issued at: 2026-09-23T10:00:00.000Z',
        'Expires at: 2026-09-23T10:10:00.000Z',
        '',
        'This signature is free and does not move funds.',
      ].join('\n')
    );
  });
});

/* ------------------------------------------------------------------ */
/*  base58 i ed25519                                                   */
/* ------------------------------------------------------------------ */

describe('asks SOL: base58', () => {
  it('round-trips random bytes, leading zeros included', () => {
    for (const bytes of [new Uint8Array(32), Uint8Array.from([0, 0, 1, 2, 255]), crypto.randomBytes(32), crypto.randomBytes(64), Uint8Array.from([255])]) {
      const text = encodeBase58(bytes);
      expect(Buffer.from(decodeBase58(text)).equals(Buffer.from(bytes))).to.equal(true);
      expect(base58ByteLength(text)).to.equal(bytes.length);
    }
    expect(decodeBase58('11111111111111111111111111111111')).to.have.length(32);
  });

  it('rejects non-base58, empty and too long input without normalising case', () => {
    for (const bad of ['', '0', 'O', 'I', 'l', 'abc!', null, 5, 'x'.repeat(129)]) expect(decodeBase58(bad), String(bad)).to.equal(null);
    expect(Buffer.from(decodeBase58('a')).equals(Buffer.from(decodeBase58('A')))).to.equal(false);
  });
});

describe('asks SOL: ed25519 message signatures', () => {
  const { address, privateKey } = solanaKeypair();
  const message = 'mysphere: link a Solana wallet to Asks\n\nhello';
  const signature = signMessage(privateKey, message);

  it('verifies bytes and base58 signatures', () => {
    expect(verifySolanaMessageSignature(message, signature, address)).to.equal(true);
    expect(verifySolanaMessageSignature(message, encodeBase58(signature), address)).to.equal(true);
    expect(verifySolanaMessageSignature(Buffer.from(message, 'utf8'), signature, address)).to.equal(true);
  });

  it('rejects another message, another key, bad lengths and junk', () => {
    const other = solanaKeypair();
    expect(verifySolanaMessageSignature(`${message}.`, signature, address)).to.equal(false);
    expect(verifySolanaMessageSignature(message, signature, other.address)).to.equal(false);
    expect(verifySolanaMessageSignature(message, signature.slice(0, 63), address)).to.equal(false);
    expect(verifySolanaMessageSignature(message, 'not-base58!', address)).to.equal(false);
    expect(verifySolanaMessageSignature(message, signature, 'short')).to.equal(false);
    const tampered = Uint8Array.from(signature);
    tampered[0] ^= 1;
    expect(verifySolanaMessageSignature(message, tampered, address)).to.equal(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Challenge powiazania                                               */
/* ------------------------------------------------------------------ */

describe('asks SOL: binding challenge', () => {
  const NOW = Date.parse('2026-09-23T10:00:00Z');
  const NONCE = '0123456789abcdef0123456789abcdef';
  const minted = () => mintBindingChallenge(keys.current, { evm: AUTHOR_CHECKSUM, solana: PAYER, nowMs: NOW, nonce: NONCE });

  it('round-trips and rebuilds the exact message', () => {
    const c = minted();
    expect(c.challenge).to.match(new RegExp(`^v1\\.${keys.current.kid}\\.${NOW}\\.${NONCE}\\.[0-9a-f]{64}$`));
    expect(c.expiresAtMs).to.equal(NOW + 10 * 60 * 1000);
    const check = checkBindingChallenge(keys, c.challenge, { evm: AUTHOR, solana: PAYER, nowMs: NOW + 1000 });
    expect(check).to.deep.equal({ ok: true, evm: AUTHOR, solana: PAYER, issuedAtMs: NOW, nonce: NONCE, message: c.message });
  });

  it('mints a random 32-hex nonce by default and refuses bad addresses', () => {
    const c = mintBindingChallenge(keys.current, { evm: AUTHOR, solana: PAYER, nowMs: NOW });
    expect(c.nonce).to.match(/^[0-9a-f]{32}$/);
    expectAskError(() => mintBindingChallenge(keys.current, { evm: 'nobody', solana: PAYER, nowMs: NOW }), 'invalid_address', 400);
    expectAskError(() => mintBindingChallenge(keys.current, { evm: AUTHOR, solana: '0xabc', nowMs: NOW }), 'invalid_address', 400);
  });

  it('expires after 10 min + 60 s skew; a future one beyond 60 s is invalid', () => {
    const c = minted().challenge;
    const at = (nowMs: number) => checkBindingChallenge(keys, c, { evm: AUTHOR, solana: PAYER, nowMs });
    expect(at(NOW + 11 * 60 * 1000).ok).to.equal(true);
    expect(at(NOW + 11 * 60 * 1000 + 1)).to.deep.equal({ ok: false, reason: 'challenge_expired' });
    expect(at(NOW - 60_000).ok).to.equal(true);
    expect(at(NOW - 60_001)).to.deep.equal({ ok: false, reason: 'challenge_invalid' });
  });

  it('is bound to the EVM account and the Solana wallet', () => {
    const c = minted().challenge;
    const other = solanaKeypair().address;
    expect(checkBindingChallenge(keys, c, { evm: ANSWERER, solana: PAYER, nowMs: NOW })).to.deep.equal({ ok: false, reason: 'challenge_invalid' });
    expect(checkBindingChallenge(keys, c, { evm: AUTHOR, solana: other, nowMs: NOW })).to.deep.equal({ ok: false, reason: 'challenge_invalid' });
    expect(checkBindingChallenge(keys, c, { evm: AUTHOR, solana: PAYER.toLowerCase(), nowMs: NOW })).to.deep.equal({ ok: false, reason: 'challenge_invalid' });
  });

  it('tampered time, nonce, mac or version is invalid (never expired)', () => {
    const c = minted().challenge;
    const parts = c.split('.');
    const variants = [
      [parts[0], parts[1], String(NOW - 3_600_000), parts[3], parts[4]].join('.'),
      [parts[0], parts[1], parts[2], 'f'.repeat(32), parts[4]].join('.'),
      [parts[0], parts[1], parts[2], parts[3], '0'.repeat(64)].join('.'),
      ['v2', parts[1], parts[2], parts[3], parts[4]].join('.'),
      c.slice(0, -1),
      `${c}.x`,
      '',
      42,
    ];
    for (const bad of variants) {
      expect(checkBindingChallenge(keys, bad, { evm: AUTHOR, solana: PAYER, nowMs: NOW }), String(bad)).to.deep.equal({
        ok: false,
        reason: 'challenge_invalid',
      });
    }
  });

  it('a kid this server does not know is invalid; a previous secret still verifies', () => {
    const foreign = deriveAskSealKeys({ ASK_SEAL_SECRET: 'another-deployment' });
    const c = mintBindingChallenge(foreign.current, { evm: AUTHOR, solana: PAYER, nowMs: NOW, nonce: NONCE }).challenge;
    expect(checkBindingChallenge(keys, c, { evm: AUTHOR, solana: PAYER, nowMs: NOW })).to.deep.equal({ ok: false, reason: 'challenge_invalid' });
    const rotated = deriveAskSealKeys({ ASK_SEAL_SECRET: 'new-secret', ASK_SEAL_SECRET_PREVIOUS: 'another-deployment' });
    expect(checkBindingChallenge(rotated, c, { evm: AUTHOR, solana: PAYER, nowMs: NOW }).ok).to.equal(true);
  });

  it('the whole flow: sign the rebuilt message with the wallet', () => {
    const wallet = solanaKeypair();
    const c = mintBindingChallenge(keys.current, { evm: AUTHOR, solana: wallet.address, nowMs: NOW });
    const signature = signMessage(wallet.privateKey, c.message);
    const check = checkBindingChallenge(keys, c.challenge, { evm: AUTHOR, solana: wallet.address, nowMs: NOW + 5000 });
    expect(check.ok).to.equal(true);
    expect(verifySolanaMessageSignature(check.message, signature, wallet.address)).to.equal(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Weryfikacja wyplaty                                                */
/* ------------------------------------------------------------------ */

const FEE_PAYER = STRANGER;
const PER_ANSWER = 25_000_000n;

function memoIx(text: string, accountIndexes: number[]) {
  return { programId: MEMO_PROGRAM_ADDRESS, accountIndexes, data: new TextEncoder().encode(text) };
}

function transferIx(fromIndex: number, toIndex: number, lamports: bigint) {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);
  return { programId: SYSTEM_PROGRAM_ADDRESS, accountIndexes: [fromIndex, toIndex], data };
}

/** Klucze: 0 fee payer, 1 platnik autora, 2 odbiorca, 3 SystemProgram, 4 Memo. */
function payoutTx(overrides: Record<string, unknown> = {}) {
  return {
    feePayer: FEE_PAYER,
    accountKeys: [FEE_PAYER, PAYER, PAYEE, SYSTEM_PROGRAM_ADDRESS, MEMO_PROGRAM_ADDRESS],
    instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1]), transferIx(1, 2, PER_ANSWER)],
    preBalances: [],
    preTokenBalances: [],
    ...overrides,
  };
}

const EXPECTED = { askId: ASK_ID, answerId: ANSWER_ID, payer: PAYER, payee: PAYEE, minLamports: PER_ANSWER };
const reason = (tx: any, expected = EXPECTED) => {
  const check = verifySolanaAskPayout(tx, expected);
  return check.ok ? 'ok' : check.reason;
};

describe('asks SOL: verifySolanaAskPayout', () => {
  it('accepts a payout sent by another fee payer, summing payer -> payee transfers', () => {
    expect(verifySolanaAskPayout(payoutTx(), EXPECTED)).to.deep.equal({
      ok: true,
      lamports: PER_ANSWER,
      memo: buildAskPayoutMemo(ASK_ID, ANSWER_ID),
    });
    const split = payoutTx({
      instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1]), transferIx(1, 2, 20_000_000n), transferIx(1, 2, 5_000_000n)],
    });
    expect(verifySolanaAskPayout(split, EXPECTED)).to.deep.include({ ok: true, lamports: PER_ANSWER });
    expect(reason(payoutTx({ signers: [FEE_PAYER, PAYER] }))).to.equal('ok');
  });

  it('failed-tx', () => {
    expect(reason(payoutTx({ failed: true }))).to.equal('failed-tx');
  });

  it('no-ask-memo (other memos, or an Ask memo on Memo v1, do not count)', () => {
    expect(reason(payoutTx({ instructions: [transferIx(1, 2, PER_ANSWER)] }))).to.equal('no-ask-memo');
    expect(reason(payoutTx({ instructions: [memoIx('mysphere:reply|v1|x|hi', [1]), transferIx(1, 2, PER_ANSWER)] }))).to.equal('no-ask-memo');
    const v1 = { ...memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1]), programId: 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo' };
    expect(reason(payoutTx({ instructions: [v1, transferIx(1, 2, PER_ANSWER)] }))).to.equal('no-ask-memo');
  });

  it('ambiguous-memo: two Ask memos, even for the same answer', () => {
    const memo = memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1]);
    expect(reason(payoutTx({ instructions: [memo, memo, transferIx(1, 2, PER_ANSWER)] }))).to.equal('ambiguous-memo');
    const other = memoIx(buildAskPayoutMemo(ASK_ID, 'otherAnswer000000001'), [1]);
    expect(reason(payoutTx({ instructions: [memo, other, transferIx(1, 2, PER_ANSWER)] }))).to.equal('ambiguous-memo');
  });

  it('wrong-memo: another answer, another Ask, extra text, v2', () => {
    for (const text of [
      buildAskPayoutMemo(ASK_ID, 'otherAnswer000000001'),
      buildAskPayoutMemo('otherAsk000000000001', ANSWER_ID),
      `${buildAskPayoutMemo(ASK_ID, ANSWER_ID)}|extra`,
      `mysphere:ask|v2|${ASK_ID}|${ANSWER_ID}`,
    ]) {
      expect(reason(payoutTx({ instructions: [memoIx(text, [1]), transferIx(1, 2, PER_ANSWER)] })), text).to.equal('wrong-memo');
    }
    expect(reason(payoutTx(), { ...EXPECTED, askId: 'a/b' })).to.equal('wrong-memo');
  });

  it('memo-not-signed: payer not among memo accounts or not a signer', () => {
    expect(reason(payoutTx({ instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [0]), transferIx(1, 2, PER_ANSWER)] }))).to.equal(
      'memo-not-signed'
    );
    expect(reason(payoutTx({ instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), []), transferIx(1, 2, PER_ANSWER)] }))).to.equal(
      'memo-not-signed'
    );
    expect(reason(payoutTx({ signers: [FEE_PAYER] }))).to.equal('memo-not-signed');
  });

  it('no-transfer', () => {
    expect(reason(payoutTx({ instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1])] }))).to.equal('no-transfer');
  });

  it('wrong-sender: the fee payer paid instead of the frozen author payer', () => {
    expect(reason(payoutTx({ instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1]), transferIx(0, 2, PER_ANSWER)] }))).to.equal(
      'wrong-sender'
    );
  });

  it('wrong-recipient', () => {
    expect(reason(payoutTx({ instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1]), transferIx(1, 0, PER_ANSWER)] }))).to.equal(
      'wrong-recipient'
    );
  });

  it('too-small: one lamport short', () => {
    expect(reason(payoutTx({ instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1]), transferIx(1, 2, PER_ANSWER - 1n)] }))).to.equal(
      'too-small'
    );
  });

  it('self-pay: payer and payee are the same wallet', () => {
    const tx = payoutTx({ instructions: [memoIx(buildAskPayoutMemo(ASK_ID, ANSWER_ID), [1]), transferIx(1, 1, PER_ANSWER)] });
    expect(reason(tx, { ...EXPECTED, payee: PAYER })).to.equal('self-pay');
  });

  it('never matches a lowercased payer (base58 is case-sensitive)', () => {
    expect(reason(payoutTx(), { ...EXPECTED, payer: PAYER.toLowerCase() })).to.equal('memo-not-signed');
  });
});

/* ------------------------------------------------------------------ */
/*  Stan Aska SOL                                                      */
/* ------------------------------------------------------------------ */

describe('asks SOL: sealed state', () => {
  const state = newAskState(ASK_ID, solInput());

  it('newAskState(rail sol-solana) derives budget and per-answer from lamports', () => {
    expect(state).to.deep.equal({
      v: 1,
      askId: ASK_ID,
      author: AUTHOR,
      funding: 'on-resolve',
      token: 'SOL',
      network: 'solana',
      budget: 0.100000001,
      seats: 4,
      deadline: 1790000000000,
      origin: 'session',
      escrow: null,
      status: 'open',
      resolvedAt: null,
      resolveKind: null,
      resolveTxHash: null,
      expiredTxHash: null,
      expiredLogIndex: null,
      solana: { cluster: 'devnet', payer: PAYER, budgetLamports: '100000001', perAnswerLamports: '25000000' },
    });
  });

  it('round-trips through seal and read', () => {
    const doc = roundTrip(sealStateDoc(keys.current, state));
    const check = readSealedState(keys, ASK_ID, doc);
    expect(check.kind).to.equal('valid');
    expect(check.value).to.deep.equal(state);
  });

  it('newAskState refuses escrow, x402, bad payer, too little per answer and too big a budget', () => {
    expectAskError(() => newAskState(ASK_ID, solInput({ funding: 'escrowed' })), 'invalid_funding', 400);
    expectAskError(() => newAskState(ASK_ID, solInput({ origin: 'x402' })), 'invalid_ask', 400);
    expectAskError(() => newAskState(ASK_ID, solInput({ solana: { cluster: 'devnet', payer: PAYER.toLowerCase(), budgetLamports: '100000001' } })), 'invalid_ask');
    expectAskError(() => newAskState(ASK_ID, solInput({ solana: { cluster: 'testnet', payer: PAYER, budgetLamports: '100000001' } })), 'invalid_ask');
    expectAskError(() => newAskState(ASK_ID, solInput({ solana: { cluster: 'devnet', payer: PAYER, budgetLamports: '19999999' } })), 'invalid_ask');
    expect(newAskState(ASK_ID, solInput({ solana: { cluster: 'devnet', payer: PAYER, budgetLamports: '20000000' } })).solana.perAnswerLamports).to.equal('5000000');
    expectAskError(() => newAskState(ASK_ID, solInput({ solana: { cluster: 'devnet', payer: PAYER, budgetLamports: '1000000000001' } })), 'invalid_ask');
    expect(newAskState(ASK_ID, solInput({ solana: { cluster: 'mainnet-beta', payer: PAYER, budgetLamports: '1000000000000' } })).budget).to.equal(1000);
    expectAskError(() => newAskState(ASK_ID, solInput({ solana: undefined })), 'invalid_ask');
    expectAskError(() => newAskState(ASK_ID, solInput({ seats: 21 })), 'invalid_ask');
  });

  it('a Base Ask never carries a solana key, and refuses Solana terms', () => {
    const base = newAskState(ASK_ID, { author: AUTHOR, origin: 'session', budget: 1, seats: 1, deadline: 1790000000000, funding: 'on-resolve', escrow: null });
    expect(base).to.not.have.property('solana');
    expect(railOf(base)).to.equal('usdc-base');
    expectAskError(
      () => newAskState(ASK_ID, { author: AUTHOR, origin: 'session', budget: 1, seats: 1, deadline: 1790000000000, funding: 'on-resolve', escrow: null, solana: state.solana }),
      'invalid_ask'
    );
    // Doklejony klucz `solana` w dokumencie Base nie wchodzi do ladunku.
    const doc = { ...roundTrip(sealStateDoc(keys.current, base)), solana: state.solana };
    const check = readSealedState(keys, ASK_ID, doc);
    expect(check.kind).to.equal('valid');
    expect(check.value).to.not.have.property('solana');
  });

  it('refuses to seal a SOL state that breaks an invariant', () => {
    const bad = (patch: Record<string, unknown>) => ({ ...state, ...patch });
    const badTerms = (patch: Record<string, unknown>) => bad({ solana: { ...state.solana, ...patch } });
    for (const [label, s] of [
      ['lowercased payer', badTerms({ payer: PAYER.toLowerCase() })],
      ['per-answer not floor(budget/seats)', badTerms({ perAnswerLamports: '25000001' })],
      ['budget number != lamports', bad({ budget: 0.1 })],
      ['escrowed', bad({ funding: 'escrowed' })],
      ['origin x402', bad({ origin: 'x402' })],
      ['token USDC', bad({ token: 'USDC' })],
      ['missing terms', bad({ solana: undefined })],
      ['EVM resolve hash', bad({ resolveTxHash: `0x${'dd'.repeat(32)}` })],
      ['escrow resolve kind', bad({ resolveKind: 'escrow' })],
      // Spojne pola (floor i liczba budzetu sie zgadzaja), ale stawka 1 lamport pod minimum.
      ['below minimum', { ...state, seats: 20, budget: 0.099999999, solana: { ...state.solana, budgetLamports: '99999999', perAnswerLamports: '4999999' } }],
      ['above the ceiling', { ...state, seats: 1, budget: 1000.000000001, solana: { ...state.solana, budgetLamports: '1000000000001', perAnswerLamports: '1000000000001' } }],
    ] as Array<[string, any]>) {
      expect(() => sealStateDoc(keys.current, s), label).to.throw();
    }
    // Kontrola: dokladnie minimum (100000001 / 20 = 5000000) sie pieczetuje.
    expect(() => sealStateDoc(keys.current, { ...state, seats: 20, solana: { ...state.solana, perAnswerLamports: '5000000' } })).to.not.throw();
  });

  it('reading a SOL state with a lowercased payer, tampered lamports or cluster is invalid', () => {
    const doc = roundTrip(sealStateDoc(keys.current, state));
    expect(readSealedState(keys, ASK_ID, { ...doc, solana: { ...doc.solana, payer: PAYER.toLowerCase() } }).kind).to.equal('invalid');
    expect(readSealedState(keys, ASK_ID, { ...doc, solana: { ...doc.solana, cluster: 'mainnet-beta' } })).to.deep.equal({ kind: 'invalid', reason: 'bad_mac' });
    expect(readSealedState(keys, ASK_ID, { ...doc, solana: { ...doc.solana, payer: STRANGER } })).to.deep.equal({ kind: 'invalid', reason: 'bad_mac' });
    // Zmiana budzetu wymaga spojnych trzech pol - i tak konczy sie na MAC.
    const forged = { ...doc, budget: 0.2, solana: { ...doc.solana, budgetLamports: '200000000', perAnswerLamports: '50000000' } };
    expect(readSealedState(keys, ASK_ID, forged)).to.deep.equal({ kind: 'invalid', reason: 'bad_mac' });
    expect(readSealedState(keys, 'otherAsk000000000001', doc)).to.deep.equal({ kind: 'invalid', reason: 'wrong_binding' });
    // Ta sama tresc przestawiona na 'base' nie udaje stanu Base.
    expect(readSealedState(keys, ASK_ID, { ...doc, network: 'base' }).kind).to.equal('invalid');
  });
});

/* ------------------------------------------------------------------ */
/*  Przyjecie i rejestr SOL                                            */
/* ------------------------------------------------------------------ */

describe('asks SOL: acceptance and payout registry', () => {
  const record = solanaTransferAcceptance({
    askId: ASK_ID,
    answerId: ANSWER_ID,
    payee: PAYEE,
    from: PAYER,
    cluster: 'devnet',
    signature: SIGNATURE,
    lamports: PER_ANSWER,
  });

  it('builds a case-preserving record', () => {
    expect(record).to.deep.equal({
      v: 1,
      askId: ASK_ID,
      answerId: ANSWER_ID,
      payee: PAYEE,
      kind: 'sol-transfer',
      cluster: 'devnet',
      signature: SIGNATURE,
      lamports: '25000000',
      from: PAYER,
      token: 'SOL',
      network: 'solana',
    });
  });

  it('refuses self-pay, bad signatures and lowercased addresses', () => {
    const base = { askId: ASK_ID, answerId: ANSWER_ID, payee: PAYEE, from: PAYER, cluster: 'devnet', signature: SIGNATURE, lamports: 1n };
    expectAskError(() => solanaTransferAcceptance({ ...base, payee: PAYER }), 'seal_write_malformed');
    expectAskError(() => solanaTransferAcceptance({ ...base, signature: PAYER }), 'seal_write_malformed');
    expectAskError(() => solanaTransferAcceptance({ ...base, from: PAYER.toLowerCase() }), 'seal_write_malformed');
    expectAskError(() => solanaTransferAcceptance({ ...base, lamports: 0n }), 'seal_write_malformed');
  });

  it('round-trips via readAnyAcceptance; readAcceptance (EVM only) fails closed', () => {
    const doc = roundTrip(sealAcceptanceDoc(keys.current, record));
    const any = readAnyAcceptance(keys, ASK_ID, ANSWER_ID, doc);
    expect(any.kind).to.equal('valid');
    expect(any.value).to.deep.equal(record);
    expect(readAcceptance(keys, ASK_ID, ANSWER_ID, doc)).to.deep.equal({ kind: 'invalid', reason: 'malformed' });
    expect(readAnyAcceptance(keys, ASK_ID, 'otherAnswer000000001', doc)).to.deep.equal({ kind: 'invalid', reason: 'wrong_binding' });
    expect(readAnyAcceptance(keys, ASK_ID, ANSWER_ID, { ...doc, lamports: '25000001' })).to.deep.equal({ kind: 'invalid', reason: 'bad_mac' });
    expect(readAnyAcceptance(keys, ASK_ID, ANSWER_ID, { ...doc, signature: OTHER_SIGNATURE })).to.deep.equal({ kind: 'invalid', reason: 'bad_mac' });
    expect(readAnyAcceptance(keys, ASK_ID, ANSWER_ID, null)).to.deep.equal({ kind: 'absent' });
  });

  it('readAnyAcceptance still reads EVM records', () => {
    const evm = transferAcceptance({ askId: ASK_ID, answerId: ANSWER_ID, payee: ANSWERER, from: AUTHOR, txHash: `0x${'43'.repeat(32)}`, logIndex: 1, units: 500000n });
    const doc = roundTrip(sealAcceptanceDoc(keys.current, evm));
    expect(readAnyAcceptance(keys, ASK_ID, ANSWER_ID, doc).value).to.deep.equal(evm);
  });

  it('registry id is solana:<signature>, case preserved, and validates', () => {
    const id = solanaPayoutRegistryId(SIGNATURE);
    expect(id).to.equal(`solana:${SIGNATURE}`);
    expect(payoutRegistryIdFor(record)).to.equal(id);
    expect(payoutRegistryIdFor(payoutEntryFor(record))).to.equal(id);
    expect(isPayoutRegistryId(id)).to.equal(true);
    expect(isPayoutRegistryId('solana:abc')).to.equal(false);
    expect(isPayoutRegistryId(`solana:${SIGNATURE}/x`)).to.equal(false);
    expect(isPayoutRegistryId(`8453:0x${'43'.repeat(32)}:1`)).to.equal(true);
    expect(SIGNATURE.toLowerCase()).to.not.equal(SIGNATURE);
  });

  it('a registry entry verifies only under its own case-exact id', () => {
    const entry = payoutEntryFor(record);
    expect(entry).to.deep.equal({
      v: 1,
      network: 'solana',
      cluster: 'devnet',
      signature: SIGNATURE,
      kind: 'sol-transfer',
      askId: ASK_ID,
      answerId: ANSWER_ID,
      payee: PAYEE,
      from: PAYER,
      lamports: '25000000',
      token: 'SOL',
    });
    const doc = roundTrip(registryDoc(keys.current, entry));
    expect(readAnyRegistry(keys, solanaPayoutRegistryId(SIGNATURE), doc).kind).to.equal('valid');
    expect(readAnyRegistry(keys, `solana:${SIGNATURE.toLowerCase()}`, doc)).to.deep.equal({ kind: 'invalid', reason: 'wrong_binding' });
    expect(readAnyRegistry(keys, solanaPayoutRegistryId(OTHER_SIGNATURE), doc)).to.deep.equal({ kind: 'invalid', reason: 'wrong_binding' });
    expect(readAnyRegistry(keys, solanaPayoutRegistryId(SIGNATURE), { ...doc, answerId: 'otherAnswer000000001' }).reason).to.equal('bad_mac');
    expect(readRegistry(keys, solanaPayoutRegistryId(SIGNATURE), doc)).to.deep.equal({ kind: 'invalid', reason: 'malformed' });
  });

  it('readAnyRegistry still reads EVM entries under the EVM id', () => {
    const evm = transferAcceptance({ askId: ASK_ID, answerId: ANSWER_ID, payee: ANSWERER, from: AUTHOR, txHash: `0x${'43'.repeat(32)}`, logIndex: 3, units: 500000n });
    const doc = roundTrip(registryDoc(keys.current, payoutEntryFor(evm)));
    expect(readAnyRegistry(keys, payoutRegistryId(8453, evm.txHash, 3), doc).kind).to.equal('valid');
  });

  it('acceptancePayoutRef describes both rails', () => {
    expect(acceptancePayoutRef(record)).to.deep.equal({
      network: 'solana',
      token: 'SOL',
      txRef: SIGNATURE,
      logIndex: null,
      amount: 0.025,
      regId: `solana:${SIGNATURE}`,
    });
    const evm = transferAcceptance({ askId: ASK_ID, answerId: ANSWER_ID, payee: ANSWERER, from: AUTHOR, txHash: `0x${'43'.repeat(32)}`, logIndex: 3, units: 500000n });
    expect(acceptancePayoutRef(evm)).to.deep.equal({
      network: 'base',
      token: 'USDC',
      txRef: evm.txHash,
      logIndex: 3,
      amount: 0.5,
      regId: `8453:${evm.txHash}:3`,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Powiazanie i odbiorca                                              */
/* ------------------------------------------------------------------ */

describe('asks SOL: binding and payee seals', () => {
  const binding = solanaWalletBinding({
    evm: AUTHOR_CHECKSUM,
    solana: PAYER,
    issuedAtMs: 1790000000000,
    nonce: 'ab'.repeat(16),
    signature: SIGNATURE,
  });
  const payee = answerPayee({ askId: ASK_ID, answerId: ANSWER_ID, answerer: ANSWERER.toUpperCase().replace('0X', '0x'), payee: PAYEE, frozenAtMs: 1790000001000 });

  it('binding: lowercase EVM, case-preserving Solana, bound to the EVM account', () => {
    expect(binding).to.deep.equal({ v: 1, evm: AUTHOR, solana: PAYER, issuedAtMs: 1790000000000, nonce: 'ab'.repeat(16), signature: SIGNATURE });
    const doc = roundTrip(sealSolanaBindingDoc(keys.current, binding));
    expect(readSolanaBinding(keys, AUTHOR_CHECKSUM, doc).kind).to.equal('valid');
    expect(readSolanaBinding(keys, ANSWERER, doc)).to.deep.equal({ kind: 'invalid', reason: 'wrong_binding' });
    expect(readSolanaBinding(keys, AUTHOR, { ...doc, solana: STRANGER })).to.deep.equal({ kind: 'invalid', reason: 'bad_mac' });
    expect(readSolanaBinding(keys, AUTHOR, { ...doc, solana: PAYER.toLowerCase() }).kind).to.equal('invalid');
    expect(readSolanaBinding(keys, AUTHOR, { ...doc, issuedAtMs: 1790000000001 }).reason).to.equal('bad_mac');
    expect(readSolanaBinding(keys, AUTHOR, null)).to.deep.equal({ kind: 'absent' });
    expectAskError(() => solanaWalletBinding({ evm: AUTHOR, solana: PAYER, issuedAtMs: 1, nonce: 'AB'.repeat(16), signature: SIGNATURE }), 'seal_write_malformed');
  });

  it('payee: bound to the Ask and the answer, case-preserving', () => {
    expect(payee).to.deep.equal({ v: 1, askId: ASK_ID, answerId: ANSWER_ID, answerer: ANSWERER, payee: PAYEE, frozenAtMs: 1790000001000 });
    const doc = roundTrip(sealPayeeDoc(keys.current, payee));
    expect(readPayee(keys, ASK_ID, ANSWER_ID, doc).kind).to.equal('valid');
    expect(readPayee(keys, ASK_ID, 'otherAnswer000000001', doc)).to.deep.equal({ kind: 'invalid', reason: 'wrong_binding' });
    expect(readPayee(keys, 'otherAsk000000000001', ANSWER_ID, doc)).to.deep.equal({ kind: 'invalid', reason: 'wrong_binding' });
    expect(readPayee(keys, ASK_ID, ANSWER_ID, { ...doc, payee: STRANGER })).to.deep.equal({ kind: 'invalid', reason: 'bad_mac' });
    expectAskError(() => answerPayee({ askId: ASK_ID, answerId: ANSWER_ID, answerer: ANSWERER, payee: '0xabc', frozenAtMs: 1 }), 'seal_write_malformed');
  });

  it('domains are separated: one seal never verifies as another', () => {
    expect(SEAL_DOMAINS.payee).to.equal('askpayee:v1');
    expect(SEAL_DOMAINS.solBind).to.equal('asksolbind:v1');
    expect(SEAL_DOMAINS.solChallenge).to.equal('asksolchallenge:v1');
    const payload = { a: 1 };
    const macs = new Set(Object.values(SEAL_DOMAINS).map((domain) => sealMac(keys.current.key, domain, payload)));
    expect(macs.size).to.equal(Object.values(SEAL_DOMAINS).length);
  });
});

/* ------------------------------------------------------------------ */
/*  Widok, mapowanie, szyna                                            */
/* ------------------------------------------------------------------ */

describe('asks SOL: effectiveAsk, toAsk and railOf', () => {
  const state = newAskState(ASK_ID, solInput());
  const check = readSealedState(keys, ASK_ID, roundTrip(sealStateDoc(keys.current, state)));
  const pub = { author: AUTHOR, question: 'Best RPC?', budget: 0.100000001, seats: 4, token: 'SOL', network: 'solana', budgetLamports: '100000001', createdAt: 1789990000000, answerCount: 2 };

  it('a sealed SOL state gives a SOL view with lamports from the state', () => {
    const forged = { ...pub, budgetLamports: '900000000000', budget: 900, token: 'USDC', network: 'base', solanaCluster: 'mainnet-beta' };
    const view = effectiveAsk(ASK_ID, forged, check, true);
    expect(view.trust).to.equal('sealed');
    expect(view).to.deep.include({
      token: 'SOL',
      network: 'solana',
      budget: 0.100000001,
      perAnswer: 0.025,
      budgetLamports: '100000001',
      perAnswerLamports: '25000000',
      solanaCluster: 'devnet',
      question: 'Best RPC?',
    });
    expect(view).to.not.have.property('solanaPayer');
    expect(railOf(view)).to.equal('sol-solana');
    expect(railOf(view.state)).to.equal('sol-solana');
  });

  it('a sealed Base state with a mirror pretending to be SOL stays USDC, no SOL fields', () => {
    const base = newAskState(ASK_ID, { author: AUTHOR, origin: 'session', budget: 2, seats: 4, deadline: 1790000000000, funding: 'on-resolve', escrow: null });
    const baseCheck = readSealedState(keys, ASK_ID, roundTrip(sealStateDoc(keys.current, base)));
    const view = effectiveAsk(ASK_ID, pub, baseCheck, true);
    expect(view).to.deep.include({ token: 'USDC', network: 'base', budget: 2, perAnswer: 0.5 });
    for (const field of ['budgetLamports', 'perAnswerLamports', 'solanaCluster']) expect(view).to.not.have.property(field);
    expect(railOf(view)).to.equal('usdc-base');
  });

  it('without a state (unverified/broken) a SOL mirror is read as USDC from frozen fields', () => {
    for (const [stateCheck, trust] of [[{ kind: 'absent' }, 'unverified'], [{ kind: 'invalid', reason: 'bad_mac' }, 'broken']] as Array<[any, string]>) {
      const view = effectiveAsk(ASK_ID, pub, stateCheck, true);
      expect(view.trust).to.equal(trust);
      expect(view).to.deep.include({ token: 'USDC', network: 'base', perAnswer: 0.02 });
      expect(view).to.not.have.property('budgetLamports');
    }
  });

  it('toAsk computes a SOL per-answer from lamports, never cents', () => {
    const ask = toAsk(ASK_ID, { ...pub, seats: 20, budgetLamports: '100000000', budget: 0.1, perAnswer: 99 });
    expect(ask).to.deep.include({ token: 'SOL', network: 'solana', budget: 0.1, perAnswer: 0.005, budgetLamports: '100000000', perAnswerLamports: '5000000' });
    // Bez lamportow: z liczby budget.
    const fromNumber = toAsk(ASK_ID, { ...pub, budgetLamports: undefined, budget: 0.1, seats: 20 });
    expect(fromNumber).to.deep.include({ perAnswer: 0.005, budgetLamports: '100000000' });
    expect(toAsk(ASK_ID, { ...pub, solanaCluster: 'devnet' }).solanaCluster).to.equal('devnet');
    expect(toAsk(ASK_ID, { ...pub, solanaCluster: 'evilnet' })).to.not.have.property('solanaCluster');
    // Ask USDC bez zmian (bez pol SOL).
    const usdc = toAsk(ASK_ID, { ...pub, token: 'USDC', network: 'base', budget: 1, seats: 3 });
    expect(usdc.perAnswer).to.equal(0.33);
    expect(usdc).to.not.have.property('budgetLamports');
  });

  it('railOf defaults to usdc-base', () => {
    expect(railOf(null)).to.equal('usdc-base');
    expect(railOf({ network: 'base' })).to.equal('usdc-base');
    expect(railOf({ network: 'solana' })).to.equal('sol-solana');
  });
});

describe('asks SOL: public view', () => {
  const state = newAskState(ASK_ID, solInput());
  const check = readSealedState(keys, ASK_ID, roundTrip(sealStateDoc(keys.current, state)));
  const pub = { author: AUTHOR, question: 'Best RPC?', budget: 0.100000001, seats: 4, token: 'USDC', network: 'base', deadline: 1790000000000, status: 'open', createdAt: 1789990000000 };

  it('listing and share take the rail from the state, never publish the payer', () => {
    const view = effectiveAsk(ASK_ID, pub, check, false);
    const listed = publicView.listingEntry(view);
    expect(listed).to.deep.include({ token: 'SOL', network: 'solana', budgetLamports: '100000001', perAnswerLamports: '25000000', solanaCluster: 'devnet' });
    expect(JSON.stringify(listed)).to.not.include(PAYER);
    const share = publicView.shareFromView(view, { valid: 0, invalid: 0 });
    expect(share.ask.token).to.equal('SOL');
    expect(JSON.stringify(share)).to.not.include(PAYER);
    expect(publicView.shareFundingNote(share)).to.deep.equal({ kind: 'on-resolve' });
  });

  it('a legacy view pretending to be SOL is published as USDC', () => {
    const legacy = effectiveAsk(ASK_ID, { ...pub, token: 'SOL', network: 'solana', budgetLamports: '100000001' }, { kind: 'absent' }, false);
    const listed = publicView.listingEntry(legacy);
    expect(listed).to.deep.include({ token: 'USDC', network: 'base' });
    expect(listed).to.not.have.property('budgetLamports');
  });

  it('formats SOL amounts without rounding to cents', () => {
    expect(publicView.formatShareMoney(0.005, 'SOL')).to.equal('0.005 SOL');
    expect(publicView.formatShareMoney(0.1 + 0.2, 'SOL')).to.equal('0.3 SOL');
    expect(publicView.formatShareMoney(12, 'SOL')).to.equal('12 SOL');
    expect(publicView.formatShareMoney(1.5)).to.equal('$1.50');
  });

  it('answerPayoutFacts marks a SOL record with its network and case-exact signature', () => {
    const record = solanaTransferAcceptance({ askId: ASK_ID, answerId: ANSWER_ID, payee: PAYEE, from: PAYER, cluster: 'devnet', signature: SIGNATURE, lamports: PER_ANSWER });
    expect(publicView.answerPayoutFacts('sealed', { accepted: false }, record)).to.deep.equal({
      accepted: true,
      payoutTxHash: SIGNATURE,
      payoutLogIndex: null,
      payoutVerified: true,
      payoutNetwork: 'solana',
    });
    const resolvedView = effectiveAsk(ASK_ID, pub, { kind: 'valid', value: { ...state, status: 'resolved' }, kid: keys.current.kid }, false);
    expect(publicView.revealsAllAnswers(resolvedView, new Map([[ANSWER_ID, record]]))).to.equal(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Reseal                                                             */
/* ------------------------------------------------------------------ */

describe('asks SOL: reseal core', () => {
  const state = newAskState(ASK_ID, solInput());
  const record = solanaTransferAcceptance({ askId: ASK_ID, answerId: ANSWER_ID, payee: PAYEE, from: PAYER, cluster: 'devnet', signature: SIGNATURE, lamports: PER_ANSWER });

  it('askMirrorPlan writes the SOL rail from the state and drops a published payer', () => {
    const plan = reseal.askMirrorPlan(state, { status: 'open', funding: 'on-resolve', token: 'USDC', network: 'base', acceptedCount: 0, budget: 5, solanaPayer: PAYER }, { accepted: 0, answers: null });
    expect(plan.set).to.deep.equal({
      token: 'SOL',
      network: 'solana',
      budget: 0.100000001,
      budgetLamports: '100000001',
      perAnswerLamports: '25000000',
      solanaCluster: 'devnet',
    });
    expect(plan.remove).to.deep.equal(['solanaPayer']);
    const synced = { status: 'open', funding: 'on-resolve', token: 'SOL', network: 'solana', acceptedCount: 0, budget: 0.100000001, budgetLamports: '100000001', perAnswerLamports: '25000000', solanaCluster: 'devnet' };
    expect(reseal.askMirrorPlan(state, synced, { accepted: 0, answers: null }).fields).to.deep.equal([]);
  });

  it('askMirrorPlan on a Base state removes SOL mirror fields', () => {
    const base = newAskState(ASK_ID, { author: AUTHOR, origin: 'session', budget: 1, seats: 1, deadline: 1790000000000, funding: 'on-resolve', escrow: null });
    const plan = reseal.askMirrorPlan(base, { status: 'open', funding: 'on-resolve', token: 'SOL', network: 'solana', acceptedCount: 0, budgetLamports: '1', solanaCluster: 'devnet' }, { accepted: 0, answers: null });
    expect(plan.set).to.deep.include({ token: 'USDC', network: 'base' });
    expect(plan.remove).to.include.members(['budgetLamports', 'solanaCluster']);
  });

  it('answerAcceptedMirrorPlan keeps the signature exact and drops logIndex', () => {
    const plan = reseal.answerAcceptedMirrorPlan({ accepted: false, payoutTxHash: SIGNATURE.toLowerCase(), payoutLogIndex: 4, payoutAmount: 7 }, record);
    expect(plan.set).to.deep.equal({ accepted: true, payoutTxHash: SIGNATURE, payoutToken: 'SOL', payoutNetwork: 'solana', payoutAmount: 0.025 });
    expect(plan.remove).to.deep.equal(['payoutLogIndex']);
    expect(plan.stamp).to.deep.equal(['acceptedAt']);
    const synced = { accepted: true, payoutTxHash: SIGNATURE, payoutToken: 'SOL', payoutNetwork: 'solana', payoutAmount: 0.025, acceptedAt: 1 };
    expect(reseal.answerAcceptedMirrorPlan(synced, record).fields).to.deep.equal([]);
  });

  it('planAcceptances on a SOL Ask: no legacy verification, forged_on_sol_ask, never auto-reset', () => {
    const transferVerdict = { kind: 'transfer', txHash: `0x${'43'.repeat(32)}`, payee: ANSWERER, from: AUTHOR, candidates: [{ logIndex: 1, from: AUTHOR, to: ANSWERER, value: 10n ** 12n }], blockTimeSec: 1 };
    const answers = [
      { answerId: 'recorded000000000001', record: 'valid', mirrorAccepted: true, verdict: null, payee: null, txHash: null },
      { answerId: 'mirrorOnly0000000001', record: 'absent', mirrorAccepted: true, verdict: transferVerdict, payee: ANSWERER, txHash: null },
      { answerId: 'notAccepted000000001', record: 'absent', mirrorAccepted: false, verdict: null, payee: ANSWERER, txHash: null },
    ];
    const input = { askId: ASK_ID, author: AUTHOR, answers, registry: new Map(), trustWeak: new Set(['mirrorOnly0000000001']), resetForged: new Set(), repair: false, rail: 'sol-solana' };
    const plan = reseal.planAcceptances(input);
    expect(plan.records).to.deep.equal([]);
    expect(plan.resets).to.deep.equal([]);
    expect(plan.undecided).to.deep.equal([
      { answerId: 'mirrorOnly0000000001', verdict: 'forged', reason: 'forged_on_sol_ask', payee: ANSWERER, txHash: null, candidates: [] },
    ]);
    expect(plan.notes).to.deep.include({ answerId: 'mirrorOnly0000000001', code: 'trust_weak_not_applicable' });
    // Wlasciciel moze jawnie wyczyscic lustro.
    const withReset = reseal.planAcceptances({ ...input, trustWeak: new Set(), resetForged: new Set(['mirrorOnly0000000001']) });
    expect(withReset.resets).to.deep.equal(['mirrorOnly0000000001']);
    expect(withReset.undecided).to.deep.equal([]);
    // Ten sam werdykt na Asku USDC daje rekord - rozgalezienie zalezy tylko od szyny.
    const usdc = reseal.planAcceptances({ ...input, rail: undefined, trustWeak: new Set() });
    expect(usdc.records.map((r: any) => r.answerId)).to.deep.equal(['mirrorOnly0000000001']);
  });

  it('planAcceptances on a SOL Ask blocks an invalid record even with repair', () => {
    const answers = [{ answerId: 'broken00000000000001', record: 'invalid', mirrorAccepted: true, verdict: null, payee: null, txHash: null }];
    const base = { askId: ASK_ID, author: AUTHOR, answers, registry: new Map(), trustWeak: new Set(), resetForged: new Set(), rail: 'sol-solana' };
    expect(reseal.planAcceptances({ ...base, repair: false }).blocked).to.deep.equal([{ answerId: 'broken00000000000001', code: 'record_invalid' }]);
    expect(reseal.planAcceptances({ ...base, repair: true }).blocked).to.deep.equal([{ answerId: 'broken00000000000001', code: 'record_invalid_unrecoverable' }]);
  });

  it('registryIdsToRead reads nothing for a SOL Ask', () => {
    const answers = [{ answerId: ANSWER_ID, record: 'absent', mirrorAccepted: true, verdict: { kind: 'transfer', txHash: `0x${'43'.repeat(32)}`, payee: ANSWERER, from: AUTHOR, candidates: [{ logIndex: 1, from: AUTHOR, to: ANSWERER, value: 1n }], blockTimeSec: 1 }, payee: null, txHash: null }];
    expect(reseal.registryIdsToRead(answers, 'sol-solana')).to.deep.equal([]);
    expect(reseal.registryIdsToRead(answers)).to.have.length(1);
  });

  it('classifyLegacyAsk refuses a SOL document without a state', () => {
    const plan = reseal.classifyLegacyAsk({
      askId: ASK_ID,
      pub: { author: AUTHOR, budget: 0.1, seats: 1, deadline: 1790000000000, funding: 'on-resolve', status: 'open', token: 'SOL', network: 'solana' },
      pubCreateTimeMs: 1,
      sealed: null,
      answerCount: 0,
      recordedCount: 0,
      latestPayoutMs: null,
      escrow: null,
      nowMs: 2,
    });
    expect(plan).to.deep.include({ ok: false, code: 'sol_ask_without_state' });
  });

  it('advanceSealedAsk auto-fills a SOL Ask like any on-resolve Ask', () => {
    const one = newAskState(ASK_ID, solInput({ seats: 1 }));
    const plan = reseal.planAskState({ askId: ASK_ID, pub: {}, pubCreateTimeMs: 1, sealed: one, answerCount: 1, recordedCount: 1, latestPayoutMs: 5, escrow: null, nowMs: 9 });
    expect(plan.ok).to.equal(true);
    expect(plan.state).to.deep.include({ status: 'resolved', resolveKind: 'auto-full', resolvedAt: 5 });
    expect(() => sealStateDoc(keys.current, plan.state)).to.not.throw();
  });
});
