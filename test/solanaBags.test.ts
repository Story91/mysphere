export {};

// Czysta logika Proof of Bags (app/basechat/Solana/bags/bagsCore.ts) i formatu
// memo posta (app/basechat/Solana/config/solanaChain.ts) - bez lancucha.
// Fixture transakcji odwzorowuje wynik symulacji z mainnetu z 2026-09-23
// (spec: docs/superpowers/specs/2026-09-23-proof-of-bags-design.md).
const { expect } = require('chai');
const {
  extractMintCandidates,
  buildBagsMemo,
  parseBagsMemo,
  computeVerdict,
  formatTokenAmount,
  readBagsProof,
  MAX_BAGS_MINTS,
  TOKEN_PROGRAM_ADDRESS,
} = require('../app/basechat/Solana/bags/bagsCore');
const {
  buildPostMemo,
  parsePostMemo,
  memoMatchesPost,
  newPostId,
  isValidPostId,
  isReceiptTimely,
  MEMO_PROGRAM_ADDRESS,
  MEMO_V1_PROGRAM_ADDRESS,
} = require('../app/basechat/Solana/config/solanaChain');

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PUMP = 'HtnYWJ3RhXXcq2tTKFXYfqdqkfWZQKyz8vj8bsu1pump';
const SIGNER = '9jYKP14WAfZB9FX44HejHvpfiqPaTufxkRCifBWC38Rr';
const ATA = '9KZ9aQsqhu1vrmzUN87cmnJPg6hi2Fn2FWHn2A8rx3uZ';
const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

describe('Proof of Bags: wykrywanie kandydatow na minta w tresci', () => {
  it('znajduje goly adres i adres wewnatrz linkow, w kolejnosci wystapienia, bez duplikatow', () => {
    const text = `gm ${USDC} and https://pump.fun/coin/${PUMP}?ref=x plus again ${USDC}`;
    expect(extractMintCandidates(text)).to.deep.equal([USDC, PUMP]);
  });

  it('nie wycina fragmentu z 88-znakowego podpisu transakcji', () => {
    const sig = '5YCszAdcrgawNvfoFmtLUZMTV2QcRMzmabdGZMeXpAa8j41qHaeiEmMAqoZbzWYiT6f67hxG1C1gKJoEymYdHhc';
    expect(extractMintCandidates(`receipt ${sig}`)).to.deep.equal([]);
  });

  it('ignoruje adres EVM i zbyt krotkie ciagi', () => {
    expect(extractMintCandidates('0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd abc123')).to.deep.equal([]);
  });
});

describe('Proof of Bags: format instrukcji', () => {
  it('memo bags przechodzi w obie strony', () => {
    const memo = buildBagsMemo([USDC, PUMP]);
    expect(memo).to.equal(`mysphere:bags|v1|${USDC},${PUMP}`);
    expect(parseBagsMemo(memo)).to.deep.equal([USDC, PUMP]);
  });

  it('odrzuca obce memo i pusta liste', () => {
    expect(parseBagsMemo('mysphere:post|x|y')).to.equal(null);
    expect(parseBagsMemo('mysphere:bags|v1|')).to.equal(null);
    expect(parseBagsMemo(`mysphere:bags|v2|${USDC}`)).to.equal(null);
  });

  it('nie przyjmuje wiecej mintow, niz miesci sie w transakcji', () => {
    const many = [USDC, PUMP, SIGNER, ATA];
    expect(() => buildBagsMemo(many)).to.throw();
    expect(MAX_BAGS_MINTS).to.equal(3);
  });
});

describe('Proof of Bags: werdykty (BigInt, nie liczby zmiennoprzecinkowe)', () => {
  it('rozroznia szesc sytuacji', () => {
    expect(computeVerdict(0n, 0n)).to.deep.equal({ verdict: 'no-position', changePct: null });
    expect(computeVerdict(0n, 5n)).to.deep.equal({ verdict: 'bought-after', changePct: null });
    expect(computeVerdict(100n, 100n)).to.deep.equal({ verdict: 'holding', changePct: 0 });
    expect(computeVerdict(100n, 120n)).to.deep.equal({ verdict: 'added', changePct: 20 });
    expect(computeVerdict(100n, 18n)).to.deep.equal({ verdict: 'reduced', changePct: -82 });
    expect(computeVerdict(100n, 0n)).to.deep.equal({ verdict: 'emptied', changePct: -100 });
  });

  it('liczy procent na kwotach wiekszych niz Number.MAX_SAFE_INTEGER', () => {
    const atPost = 10n ** 24n;
    expect(computeVerdict(atPost, atPost / 2n)).to.deep.equal({ verdict: 'reduced', changePct: -50 });
  });
});

describe('Proof of Bags: formatowanie kwot', () => {
  it('skraca duze kwoty i nie zeruje malych', () => {
    expect(formatTokenAmount(1_240_000_000_000n, 6)).to.equal('1.24M');
    expect(formatTokenAmount(1_842_829n, 6)).to.equal('1.84');
    expect(formatTokenAmount(120n, 6)).to.equal('0.00012');
    expect(formatTokenAmount(0n, 9)).to.equal('0');
  });
});

describe('Memo posta: przycinanie po bajtach i wiazanie z trescia', () => {
  const POST_ID = 'AbCdEfGhIjKlMnOpQrSt';

  it('krotki post przechodzi bez zmian, a whitespace jest znormalizowany', () => {
    expect(buildPostMemo('GM  from\nSOLANA ', SIGNER, POST_ID)).to.equal(
      `mysphere:post|v2|${POST_ID}|${SIGNER}|GM from SOLANA`
    );
  });

  it('memo v2 niesie ID posta, a stary format nadal sie parsuje', () => {
    expect(parsePostMemo(buildPostMemo('gm', SIGNER, POST_ID))).to.deep.equal({
      author: SIGNER,
      body: 'gm',
      postId: POST_ID,
    });
    expect(parsePostMemo(`mysphere:post|${SIGNER}|gm`)).to.deep.equal({ author: SIGNER, body: 'gm', postId: null });
    // ID puste albo spoza alfabetu - memo odrzucone, a nie przyciete.
    expect(parsePostMemo(`mysphere:post|v2||${SIGNER}|gm`)).to.equal(null);
    expect(parsePostMemo(`mysphere:post|v2|a b|${SIGNER}|gm`)).to.equal(null);
  });

  it('newPostId daje 20 znakow z alfabetu Firestore i przechodzi walidacje', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newPostId()));
    expect(ids.size).to.equal(200);
    for (const id of Array.from(ids)) {
      expect(id).to.match(/^[A-Za-z0-9]{20}$/);
      expect(isValidPostId(id)).to.equal(true);
    }
    expect(isValidPostId('abc|x')).to.equal(false);
    expect(isValidPostId('')).to.equal(false);
    expect(isValidPostId(42)).to.equal(false);
  });

  it('dlugi post emoji miesci sie w limicie bajtow i nie rozrywa znaku', () => {
    const memo = buildPostMemo('🚀'.repeat(200), SIGNER, POST_ID);
    const body = parsePostMemo(memo).body;
    expect(Buffer.byteLength(body, 'utf8')).to.be.at.most(280);
    expect(body.endsWith('…')).to.equal(true);
    expect(body.includes('�')).to.equal(false);
    // Kazdy znak poza wielokropkiem to pelna rakieta (para zastepcza cala).
    expect(Array.from(body.slice(0, -1)).every(ch => ch === '🚀')).to.equal(true);
  });

  it('rozbiera memo z kreska pionowa w tresci', () => {
    expect(parsePostMemo(`mysphere:post|${SIGNER}|a|b`)).to.deep.equal({ author: SIGNER, body: 'a|b', postId: null });
    expect(parsePostMemo(`mysphere:post|v2|${POST_ID}|${SIGNER}|a|b`)).to.deep.equal({
      author: SIGNER,
      body: 'a|b',
      postId: POST_ID,
    });
    expect(parsePostMemo('cos innego')).to.equal(null);
  });

  it('wiaze memo z trescia posta DOKLADNIE, w obu formatach uciecia', () => {
    expect(memoMatchesPost('GM from SOLANA', 'GM  from SOLANA')).to.equal(true);
    // Nowy format: ucinanie po bajtach.
    const long = 'x'.repeat(400);
    expect(memoMatchesPost(parsePostMemo(buildPostMemo(long, SIGNER, POST_ID)).body, long)).to.equal(true);
    // Stary format (posty sprzed 23.09.2026): 179 znakow + wielokropek.
    const legacy = 'y'.repeat(200);
    expect(memoMatchesPost(`${'y'.repeat(179)}…`, legacy)).to.equal(true);
    expect(memoMatchesPost('GM from SOLANA', 'something else entirely')).to.equal(false);
    expect(memoMatchesPost('', 'anything')).to.equal(false);
  });

  it('sam prefiks NIE wystarcza - jedna tania transakcja nie moze pasowac do wielu postow', () => {
    // Znalezisko z przegladu 2026-09-23: memo "G" pasowalo do kazdego posta na G.
    expect(memoMatchesPost('G', 'GM from SOLANA')).to.equal(false);
    expect(memoMatchesPost('GM from…', 'GM from SOLANA, the long version')).to.equal(false);
  });
});

describe('Proof of Bags: odczyt dowodu z transakcji', () => {
  // Uklad kont jak w symulacji: platnik, konto tokenowe, program tokena, Memo v2, Memo v1.
  const baseTx = (overrides: Record<string, unknown> = {}) => ({
    feePayer: SIGNER,
    accountKeys: [SIGNER, ATA, TOKEN_PROGRAM_ADDRESS, MEMO_PROGRAM_ADDRESS, MEMO_V1_PROGRAM_ADDRESS],
    instructions: [
      { programId: MEMO_PROGRAM_ADDRESS, accountIndexes: [0], data: bytes(`mysphere:post|${SIGNER}|gm ${USDC}`) },
      { programId: MEMO_V1_PROGRAM_ADDRESS, accountIndexes: [1, 2], data: bytes(buildBagsMemo([USDC])) },
    ],
    preBalances: [880054, 2039280, 1, 1, 1],
    preTokenBalances: [
      { accountIndex: 1, mint: USDC, owner: SIGNER, amount: '1842829', decimals: 6, programId: TOKEN_PROGRAM_ADDRESS },
    ],
    ...overrides,
  });

  it('czyta memo posta i saldo z chwili publikacji', () => {
    const proof = readBagsProof(baseTx());
    expect(proof.postMemo).to.deep.equal({ author: SIGNER, body: `gm ${USDC}`, postId: null });
    expect(proof.positions).to.have.length(1);
    expect(proof.positions[0]).to.deep.include({ mint: USDC, ata: ATA, existed: true, ownerOk: true, decimals: 6 });
    expect(proof.positions[0].atPost).to.equal(1842829n);
  });

  it('konto, ktorego nie bylo (0 lamportow), dowodzi zerowej pozycji', () => {
    const proof = readBagsProof(baseTx({ preBalances: [880054, 0, 1, 1, 1], preTokenBalances: [] }));
    expect(proof.positions[0]).to.deep.include({ existed: false, ownerOk: true });
    expect(proof.positions[0].atPost).to.equal(0n);
  });

  it('cudze konto tokenowe nie przechodzi jako bagi autora', () => {
    const tx = baseTx({
      preTokenBalances: [{ accountIndex: 1, mint: USDC, owner: 'SomeoneElse111111111111111111111111111111111', amount: '999', decimals: 6 }],
    });
    expect(readBagsProof(tx).positions[0].ownerOk).to.equal(false);
  });

  it('istniejace konto bez wpisu salda tokena jest nieweryfikowalne, a nie zerowe', () => {
    const proof = readBagsProof(baseTx({ preTokenBalances: [] }));
    expect(proof.positions[0].atPost).to.equal(null);
  });

  it('transakcja bez instrukcji bags nie ma dowodu', () => {
    const tx = baseTx();
    const proof = readBagsProof({ ...tx, instructions: [tx.instructions[0]] });
    expect(proof.positions).to.equal(null);
    expect(proof.postMemo).to.not.equal(null);
  });
});

describe('Kwit posta: okno czasowe rejestracji', () => {
  // createTime dokumentu posta nadaje Firestore i klient go nie zmieni. Transakcja
  // posta potwierdza sie PRZED zapisem dokumentu, zwykle kilka sekund wczesniej.
  const created = Date.UTC(2026, 8, 22, 21, 52, 50);
  const sec = (ms: number) => Math.floor(ms / 1000);

  it('przyjmuje transakcje z chwili tworzenia posta', () => {
    expect(isReceiptTimely(sec(created - 5_000), created)).to.equal(true);
    expect(isReceiptTimely(sec(created + 60_000), created)).to.equal(true);
  });

  it('odrzuca transakcje doklejona do starego posta i transakcje sprzed tygodnia', () => {
    expect(isReceiptTimely(sec(created + 3 * 86_400_000), created)).to.equal(false);
    expect(isReceiptTimely(sec(created - 7 * 86_400_000), created)).to.equal(false);
    expect(isReceiptTimely(null, created)).to.equal(false);
  });
});
