export {};

// Czysta logika platnych odpowiedzi z X
// (app/basechat/Solana/replies/replyCore.ts) - bez lancucha.
// Spec: docs/superpowers/specs/2026-09-23-paid-replies-from-x-design.md.
const { expect } = require('chai');
const {
  base58ByteLength,
  buildReplyMemo,
  isSolanaAddress,
  isSolanaSignature,
  parseReplyMemo,
  validateReplyText,
  readSystemTransfer,
  verifyReplyTransaction,
  REPLY_MIN_LAMPORTS,
  REPLY_MAX_BYTES,
  SYSTEM_PROGRAM_ADDRESS,
} = require('../app/basechat/Solana/replies/replyCore');
const { MEMO_PROGRAM_ADDRESS } = require('../app/basechat/Solana/config/solanaChain');

const POST = 'dOyEzDH8peXM6t11JKC5';
const REPLIER = '9qWMZftFaDyCUquZXa1X66qLFsfpycRNYgtdcdWsLZU';
const AUTHOR = '9jYKP14WAfZB9FX44HejHvpfiqPaTufxkRCifBWC38Rr';
const STRANGER = 'D89hHJT5Aqyx1trP6EnGY9jJUB3whgnq3aUvvCqedvzf';
const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

/** Dane instrukcji SystemProgram.transfer: u32 LE = 2, u64 LE = lamporty. */
function transferData(lamports: bigint, index = 2): Uint8Array {
  const data = Buffer.alloc(12);
  data.writeUInt32LE(index, 0);
  data.writeBigUInt64LE(lamports, 4);
  return new Uint8Array(data);
}

function replyTx(opts: { payer?: string; to?: string; lamports?: bigint; memo?: string; failed?: boolean } = {}) {
  const payer = opts.payer ?? REPLIER;
  const to = opts.to ?? AUTHOR;
  return {
    failed: opts.failed ?? false,
    feePayer: payer,
    accountKeys: [payer, to, SYSTEM_PROGRAM_ADDRESS, MEMO_PROGRAM_ADDRESS],
    instructions: [
      { programId: MEMO_PROGRAM_ADDRESS, accountIndexes: [0], data: bytes(opts.memo ?? buildReplyMemo(POST, 'Fair point, but check the float.')) },
      { programId: SYSTEM_PROGRAM_ADDRESS, accountIndexes: [0, 1], data: transferData(opts.lamports ?? 10_000_000n) },
    ],
    preBalances: [5_000_000_000, 1_000_000_000, 1, 1],
    preTokenBalances: [],
  };
}

const EXPECTED = { postId: POST, account: REPLIER, authorWallet: AUTHOR };

describe('Odpowiedzi z X: format memo', () => {
  it('przechodzi w obie strony, a kreska pionowa w tresci zostaje tresc', () => {
    const memo = buildReplyMemo(POST, 'a|b');
    expect(memo).to.equal(`mysphere:reply|v1|${POST}|a|b`);
    expect(parseReplyMemo(memo)).to.deep.equal({ postId: POST, text: 'a|b' });
  });

  it('odrzuca obce memo', () => {
    expect(parseReplyMemo(`mysphere:post|${AUTHOR}|gm`)).to.equal(null);
    expect(parseReplyMemo(`mysphere:reply|v2|${POST}|x`)).to.equal(null);
    expect(parseReplyMemo(`mysphere:reply|v1||x`)).to.equal(null);
  });
});

describe('Odpowiedzi z X: walidacja tekstu (odmowa zamiast cichego przycinania)', () => {
  it('normalizuje whitespace i przyjmuje tekst w limicie bajtow', () => {
    expect(validateReplyText('  hello \n  world ')).to.deep.equal({ ok: true, text: 'hello world' });
    const exactly = 'a'.repeat(REPLY_MAX_BYTES);
    expect(validateReplyText(exactly)).to.deep.equal({ ok: true, text: exactly });
  });

  it('odrzuca pusty i za dlugi (w bajtach, nie znakach)', () => {
    expect(validateReplyText('   ')).to.deep.equal({ ok: false, reason: 'empty' });
    expect(validateReplyText('a'.repeat(REPLY_MAX_BYTES + 1))).to.deep.equal({ ok: false, reason: 'too-long' });
    // 100 rakiet = 100 znakow, ale 400 bajtow.
    expect(validateReplyText('🚀'.repeat(100))).to.deep.equal({ ok: false, reason: 'too-long' });
  });
});

describe('Odpowiedzi z X: odczyt transferu z surowych danych instrukcji', () => {
  it('czyta nadawce, odbiorce i kwote', () => {
    const tx = replyTx();
    expect(readSystemTransfer(tx.instructions[1], tx.accountKeys)).to.deep.equal({ from: REPLIER, to: AUTHOR, lamports: 10_000_000n });
  });

  it('ignoruje inne instrukcje SystemProgram i inne programy', () => {
    const tx = replyTx();
    const createAccount = { ...tx.instructions[1], data: transferData(10_000_000n, 0) };
    expect(readSystemTransfer(createAccount, tx.accountKeys)).to.equal(null);
    expect(readSystemTransfer(tx.instructions[0], tx.accountKeys)).to.equal(null);
  });
});

describe('Odpowiedzi z X: weryfikacja transakcji przed zapisem komentarza', () => {
  it('przyjmuje poprawna odpowiedz i bierze tresc Z LANCUCHA', () => {
    expect(verifyReplyTransaction(replyTx(), EXPECTED)).to.deep.equal({
      ok: true,
      text: 'Fair point, but check the float.',
      lamports: 10_000_000n,
    });
  });

  it('dokladnie minimum przechodzi, jeden lamport mniej nie', () => {
    expect(verifyReplyTransaction(replyTx({ lamports: REPLY_MIN_LAMPORTS }), EXPECTED).ok).to.equal(true);
    expect(verifyReplyTransaction(replyTx({ lamports: REPLY_MIN_LAMPORTS - 1n }), EXPECTED)).to.deep.equal({ ok: false, reason: 'tip-too-small' });
  });

  it('odrzuca transakcje z bledem, cudzego platnika i odpowiedz pod innym postem', () => {
    expect(verifyReplyTransaction(replyTx({ failed: true }), EXPECTED)).to.deep.equal({ ok: false, reason: 'failed-tx' });
    expect(verifyReplyTransaction(replyTx({ payer: STRANGER }), EXPECTED)).to.deep.equal({ ok: false, reason: 'wrong-payer' });
    expect(verifyReplyTransaction(replyTx({ memo: buildReplyMemo('innyPost123', 'hej') }), EXPECTED)).to.deep.equal({ ok: false, reason: 'wrong-post' });
  });

  it('napiwek musi isc do autora, nie do kogokolwiek', () => {
    expect(verifyReplyTransaction(replyTx({ to: STRANGER }), EXPECTED)).to.deep.equal({ ok: false, reason: 'tip-wrong-recipient' });
  });

  it('bez memo odpowiedzi albo bez napiwku nie ma komentarza', () => {
    expect(verifyReplyTransaction(replyTx({ memo: `mysphere:post|${REPLIER}|gm` }), EXPECTED)).to.deep.equal({ ok: false, reason: 'no-reply-memo' });
    const noTip = replyTx();
    noTip.instructions = [noTip.instructions[0]];
    expect(verifyReplyTransaction(noTip, EXPECTED)).to.deep.equal({ ok: false, reason: 'no-tip' });
  });

  it('pusta tresc na lancuchu nie staje sie pustym komentarzem', () => {
    expect(verifyReplyTransaction(replyTx({ memo: `mysphere:reply|v1|${POST}|   ` }), EXPECTED)).to.deep.equal({ ok: false, reason: 'bad-text' });
  });

  it('autor nie moze "zaplacic" sam sobie i pokazac tego jako platnej odpowiedzi', () => {
    // Znalezisko z przegladu: straz byla tylko w trasie POST, nie w /confirm.
    const self = replyTx({ payer: AUTHOR, to: AUTHOR });
    expect(verifyReplyTransaction(self, { postId: POST, account: AUTHOR, authorWallet: AUTHOR })).to.deep.equal({ ok: false, reason: 'self-reply' });
  });
});

describe('Odpowiedzi z X: tanie sprawdzenie formatu przed RPC', () => {
  // Prawdziwy ksztalt: 64 losowe bajty w base58 (88 znakow).
  const SIGNATURE = '642MYFiKBTNKnCUNqWwMDFbAUwbvSF8bgSsssp1CGBMxs1ax74ok6V2svtsWg3paNcLcWHtZJ6R2KNFiwosE9rML';
  // 64 bajty z zerowym pierwszym bajtem - wiodace '1' to zera, nie cyfry.
  const SIGNATURE_LEADING_ZERO = '12r5sGazgJ8JUquAqpFGp8okRYQ9FfpgXgcdmx4F5CwPFBa3MYFTyh73zTU4nxM9G1Xnh6KEBtocioRbVmj8kpW';
  const SIGNATURE_63_BYTES = 'muW4XX7ZYR6BswR5PUHNmEGZqgjuQrLqRZpBAh4QpRsmJu4AHgpYKTpvpuMVjuDyvDKoHCYXmD7txDoGFJwsY5';
  const KEY_31_BYTES = '6TWfMoubFU7NdNJmWiJHNuP4cPUf4dxa4NHYqQFG4U';
  const KEY_33_BYTES = 'rrKgQArn94iXXnrU9BBjn9LsavfrVC5Vvy6QfL7a4oGgY';

  it('base58ByteLength liczy bajty, lacznie z wiodacymi zerami', () => {
    expect(base58ByteLength(AUTHOR)).to.equal(32);
    expect(base58ByteLength(SIGNATURE)).to.equal(64);
    expect(base58ByteLength(SIGNATURE_LEADING_ZERO)).to.equal(64);
    expect(base58ByteLength(SYSTEM_PROGRAM_ADDRESS)).to.equal(32);
    expect(base58ByteLength('2')).to.equal(1);
  });

  it('base58ByteLength odrzuca pusty, spoza alfabetu i absurdalnie dlugi napis', () => {
    expect(base58ByteLength('')).to.equal(null);
    // 0, O, I i l nie naleza do alfabetu base58.
    expect(base58ByteLength('0OIl')).to.equal(null);
    expect(base58ByteLength('abc def')).to.equal(null);
    expect(base58ByteLength('2'.repeat(101))).to.equal(null);
  });

  it('isSolanaSignature: 64 bajty tak, wszystko inne nie', () => {
    expect(isSolanaSignature(SIGNATURE)).to.equal(true);
    expect(isSolanaSignature(SIGNATURE_LEADING_ZERO)).to.equal(true);
    expect(isSolanaSignature(SIGNATURE_63_BYTES)).to.equal(false);
    expect(isSolanaSignature(AUTHOR)).to.equal(false);
    expect(isSolanaSignature('abc')).to.equal(false);
    expect(isSolanaSignature(`${SIGNATURE.slice(0, -1)}0`)).to.equal(false);
    expect(isSolanaSignature('')).to.equal(false);
    expect(isSolanaSignature(undefined)).to.equal(false);
    expect(isSolanaSignature(42)).to.equal(false);
  });

  it('isSolanaAddress: 32 bajty tak, wszystko inne nie', () => {
    expect(isSolanaAddress(AUTHOR)).to.equal(true);
    expect(isSolanaAddress(REPLIER)).to.equal(true);
    expect(isSolanaAddress(SYSTEM_PROGRAM_ADDRESS)).to.equal(true);
    expect(isSolanaAddress(KEY_31_BYTES)).to.equal(false);
    expect(isSolanaAddress(KEY_33_BYTES)).to.equal(false);
    expect(isSolanaAddress(SIGNATURE)).to.equal(false);
    expect(isSolanaAddress('not-a-key')).to.equal(false);
    expect(isSolanaAddress('0x5B38Da6a701c568545dCfcB03FcB875f56beddC4')).to.equal(false);
    expect(isSolanaAddress(null)).to.equal(false);
    expect(isSolanaAddress({ toString: () => AUTHOR })).to.equal(false);
  });
});

describe('Odpowiedzi z X: ID posta z kreska pionowa', () => {
  // Firestore dopuszcza `|` w ID. Parsowanie po pierwszej kresce ucinalo takie
  // ID i oplacona odpowiedz dostawala `wrong-post`, choc pieniadze doszly.
  const PIPE_POST = 'abc|x';

  it('weryfikuje odpowiedz pod postem `abc|x` po dokladnym prefiksie', () => {
    const tx = replyTx({ memo: `mysphere:reply|v1|${PIPE_POST}|Fair point|really` });
    expect(verifyReplyTransaction(tx, { ...EXPECTED, postId: PIPE_POST })).to.deep.equal({
      ok: true,
      text: 'Fair point|really',
      lamports: 10_000_000n,
    });
  });

  it('ta sama transakcja pod innym postem to `wrong-post`', () => {
    const tx = replyTx({ memo: `mysphere:reply|v1|${PIPE_POST}|Fair point` });
    expect(verifyReplyTransaction(tx, { ...EXPECTED, postId: 'abc|y' })).to.deep.equal({ ok: false, reason: 'wrong-post' });
    expect(verifyReplyTransaction(tx, { ...EXPECTED, postId: POST })).to.deep.equal({ ok: false, reason: 'wrong-post' });
  });

  it('ID bedace prefiksem innego ID nie przejmuje cudzej odpowiedzi', () => {
    const tx = replyTx({ memo: buildReplyMemo('abcd', 'hello') });
    expect(verifyReplyTransaction(tx, { ...EXPECTED, postId: 'abc' })).to.deep.equal({ ok: false, reason: 'wrong-post' });
  });
});
