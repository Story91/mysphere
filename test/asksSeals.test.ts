export {};

// Czysta logika pieczeci Askow (app/utils/asks/askSealCore.ts) i odczytu
// transferow USDC (usdcTransfersFromLogs w app/utils/monetization/verifyPayment.ts)
// - bez Firestore i bez lancucha. Runner: scripts/test-asks-seals.cjs.
const { expect } = require('chai');
const { createHmac } = require('node:crypto');
const { encodeAbiParameters, encodeEventTopics, erc20Abi } = require('viem');
const core = require('../app/utils/asks/askSealCore');
const { toAsk } = require('../app/utils/asks/askMapping');
const { usdcTransfersFromLogs, USDC_BASE_ADDRESS } = require('../app/utils/monetization/verifyPayment');

const {
  AskError,
  adoptLegacyState,
  answererDoc,
  canonicalJson,
  countTakenSeats,
  deriveAskSealKeys,
  effectiveAsk,
  escrowSeatAcceptance,
  isAutoFull,
  isDocId,
  isPayoutRegistryId,
  keyForKid,
  matchUsdcTransfers,
  newAskState,
  payoutEntryFor,
  payoutIsTimely,
  payoutRegistryId,
  pickTransfer,
  readAcceptance,
  readAnswerer,
  readRegistry,
  readSealedState,
  registryDoc,
  sealAcceptanceDoc,
  sealStateDoc,
  transferAcceptance,
} = core;

/* ------------------------------------------------------------------ */
/*  Dane                                                               */
/* ------------------------------------------------------------------ */

const SECRET = 'test-ask-seal-secret-0123456789abcdef';
const PREVIOUS = 'older-ask-seal-secret-fedcba9876543210';
const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n';
const SA = { private_key: PEM, private_key_id: 'abcdef0123456789abcdef0123' };

const ASK_ID = 'mGlRpEtdsvBfG7O8jHjd';
const ANSWER_ID = 'EDXl12VbGzece55mcSNp';
const AUTHOR = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
const AUTHOR_CHECKSUM = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const PAYEE = '0xdf1e757062d7e6ef19bab6d6b1aa6f9fa44a09eb';
const STRANGER = '0x1111111111111111111111111111111111111111';
const CONTRACT = '0xd5f65cfbe6a1aa1b6f82cbe0a336ddfcd39a5340';
const FUND_TX = `0x${'ce'.repeat(32)}`;
const PAY_TX = `0x${'43'.repeat(32)}`;

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

function keysEnv() {
  return deriveAskSealKeys({ ASK_SEAL_SECRET: SECRET });
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    askId: ASK_ID,
    author: AUTHOR,
    funding: 'escrowed',
    token: 'USDC',
    network: 'base',
    budget: 5,
    seats: 1,
    deadline: 1786468085839,
    origin: 'session',
    escrow: {
      chainId: 8453,
      contract: CONTRACT,
      fundTxHash: FUND_TX,
      perAnswerUnits: '5000000',
      seats: 1,
      deadlineSec: '1786468085',
      source: 'fund-log',
    },
    status: 'open',
    resolvedAt: null,
    resolveKind: null,
    resolveTxHash: null,
    expiredTxHash: null,
    expiredLogIndex: null,
    ...overrides,
  };
}

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

/* ------------------------------------------------------------------ */
/*  Klucze                                                             */
/* ------------------------------------------------------------------ */

describe('asks seals: keys', () => {
  it('signs with ASK_SEAL_SECRET when set; kid is ask: + 8 hex', () => {
    const keys = keysEnv();
    expect(keys.current).to.not.equal(null);
    expect(keys.current.kid).to.match(/^ask:[0-9a-f]{8}$/);
    expect(keys.current.source).to.equal('env');
    expect(keys.all.map((k: any) => k.kid)).to.deep.equal([keys.current.kid]);
  });

  it('never derives a key from AUTH_SESSION_SECRET or from GOOGLE_CREDENTIALS in env', () => {
    const keys = deriveAskSealKeys({ AUTH_SESSION_SECRET: 'session-secret', GOOGLE_CREDENTIALS: JSON.stringify(SA) }, null);
    expect(keys.current).to.equal(null);
    expect(keys.all).to.deep.equal([]);
  });

  it('falls back to the service-account key when ASK_SEAL_SECRET is missing', () => {
    const keys = deriveAskSealKeys({ AUTH_SESSION_SECRET: 'session-secret' }, SA);
    expect(keys.current.kid).to.equal(`ask-sa:${SA.private_key_id.slice(0, 12)}`);
    expect(keys.current.source).to.equal('service-account');
    const expected = createHmac('sha256', PEM).update('mysphere:ask-seal:v1').digest();
    expect(Buffer.compare(keys.current.key, expected)).to.equal(0);
  });

  it('normalises the service-account PEM like receiptRegistry (escaped \\n, real \\n and CRLF give one key)', () => {
    const escaped = { ...SA, private_key: PEM.replace(/\n/g, '\\n') };
    const crlf = { ...SA, private_key: PEM.replace(/\n/g, '\r\n') };
    const a = deriveAskSealKeys({}, SA).current.key;
    expect(Buffer.compare(deriveAskSealKeys({}, escaped).current.key, a)).to.equal(0);
    expect(Buffer.compare(deriveAskSealKeys({}, crlf).current.key, a)).to.equal(0);
  });

  it('ignores an incomplete service account', () => {
    expect(deriveAskSealKeys({}, { private_key: PEM }).current).to.equal(null);
    expect(deriveAskSealKeys({}, { private_key_id: 'x' }).current).to.equal(null);
    expect(deriveAskSealKeys({}, { private_key: '  ', private_key_id: 'x' }).current).to.equal(null);
  });

  it('env signs, but the service-account key still verifies (all candidate keys)', () => {
    const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: SECRET }, SA);
    expect(keys.current.source).to.equal('env');
    expect(keys.all.map((k: any) => k.source)).to.deep.equal(['env', 'service-account']);
  });

  it('the previous secret verifies but never signs', () => {
    const onlyPrevious = deriveAskSealKeys({ ASK_SEAL_SECRET_PREVIOUS: PREVIOUS });
    expect(onlyPrevious.current).to.equal(null);
    expect(onlyPrevious.all).to.have.length(1);
    expect(onlyPrevious.all[0].source).to.equal('env-previous');

    const withAccount = deriveAskSealKeys({ ASK_SEAL_SECRET_PREVIOUS: PREVIOUS }, SA);
    expect(withAccount.current.source).to.equal('service-account');

    const full = deriveAskSealKeys({ ASK_SEAL_SECRET: SECRET, ASK_SEAL_SECRET_PREVIOUS: PREVIOUS }, SA);
    expect(full.current.source).to.equal('env');
    expect(full.all.map((k: any) => k.source)).to.deep.equal(['env', 'env-previous', 'service-account']);
  });

  it('a previous secret equal to the current one is not listed twice', () => {
    const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: SECRET, ASK_SEAL_SECRET_PREVIOUS: SECRET });
    expect(keys.all).to.have.length(1);
  });

  it('is domain-separated from the Solana receipt registry', () => {
    const key = keysEnv().current.key;
    for (const domain of ['mysphere:solana-receipt-registry:v1', 'mysphere:solana-receipt-registry:v2']) {
      const other = createHmac('sha256', SECRET).update(domain).digest();
      expect(Buffer.compare(key, other)).to.not.equal(0);
    }
  });

  it('keyForKid returns null for an unknown or non-string kid', () => {
    const keys = keysEnv();
    expect(keyForKid(keys, keys.current.kid)).to.not.equal(null);
    expect(keyForKid(keys, 'ask:00000000')).to.equal(null);
    expect(keyForKid(keys, undefined)).to.equal(null);
    expect(keyForKid(keys, 42)).to.equal(null);
  });
});

/* ------------------------------------------------------------------ */
/*  Zlote wektory MAC                                                  */
/* ------------------------------------------------------------------ */

// Wartosci policzone kodem sprzed Askow na Solanie (2026-09-23) i wpisane na
// sztywno. Pieczecie Base juz leza w Firestore - kazda zmiana ladunku (nowy
// klucz, inna kolejnosc, undefined zamiast braku pola) uniewaznilaby je
// wszystkie naraz. Gdy ten test pada, NIE przepisuj heksow: napraw kod.
describe('asks seals: golden MAC vectors (Base payloads must never change)', () => {
  const golden = deriveAskSealKeys({ ASK_SEAL_SECRET: 'golden' });
  const GOLDEN_AUTHOR = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
  const onResolve = {
    v: 1,
    askId: 'goldenAsk00000000001',
    author: GOLDEN_AUTHOR,
    funding: 'on-resolve',
    token: 'USDC',
    network: 'base',
    budget: 1.5,
    seats: 3,
    deadline: 1790000000000,
    origin: 'session',
    escrow: null,
    status: 'resolved',
    resolvedAt: 1790000500000,
    resolveKind: 'author',
    resolveTxHash: null,
    expiredTxHash: null,
    expiredLogIndex: null,
  };
  const escrowed = {
    ...baseState(),
    askId: 'goldenAsk00000000002',
  };
  const acceptance = () =>
    transferAcceptance({
      askId: 'goldenAsk00000000001',
      answerId: 'goldenAnswer00000001',
      payee: PAYEE,
      from: GOLDEN_AUTHOR,
      txHash: PAY_TX,
      logIndex: 447,
      units: 500000n,
    });

  it('the golden key id is stable', () => {
    expect(golden.current.kid).to.equal('ask:dd56de41');
  });

  it('on-resolve Base state', () => {
    const doc = sealStateDoc(golden.current, onResolve);
    expect(doc.mac).to.equal('b8d4856f99e83ff48d44796ad63125dc8ad39a209e05f0c2837bd5bcfaa00d6f');
    expect(Object.keys(doc).filter((key) => key !== 'mac' && key !== 'kid').sort()).to.deep.equal(Object.keys(onResolve).sort());
    expect(readSealedState(golden, 'goldenAsk00000000001', roundTrip(doc)).kind).to.equal('valid');
  });

  it('escrowed Base state', () => {
    const doc = sealStateDoc(golden.current, escrowed);
    expect(doc.mac).to.equal('133e390f961faa922d520cd75415dcc830e3428982ad7bf987934b52842340f2');
    expect(doc).to.not.have.property('solana');
    expect(readSealedState(golden, 'goldenAsk00000000002', roundTrip(doc)).kind).to.equal('valid');
  });

  it('EVM acceptance record', () => {
    const doc = sealAcceptanceDoc(golden.current, acceptance());
    expect(doc.mac).to.equal('55f6e782b071c3a7f2b898ad71329383a9022333530d6b289fa9f6f20bce1811');
    expect(readAcceptance(golden, 'goldenAsk00000000001', 'goldenAnswer00000001', roundTrip(doc)).kind).to.equal('valid');
  });

  it('EVM payout registry entry', () => {
    const doc = registryDoc(golden.current, payoutEntryFor(acceptance()));
    expect(doc.mac).to.equal('0f417c5a4398397b47f5eaade93274f71a6d4fab9b0e754ba3ecc454418ecdfa');
    expect(readRegistry(golden, payoutRegistryId(8453, PAY_TX, 447), roundTrip(doc)).kind).to.equal('valid');
  });
});

/* ------------------------------------------------------------------ */
/*  canonicalJson                                                      */
/* ------------------------------------------------------------------ */

describe('asks seals: canonicalJson', () => {
  it('does not depend on key order, nested too', () => {
    const a = { b: 1, a: { d: 'x', c: [3, { f: null, e: true }] } };
    const b = { a: { c: [3, { e: true, f: null }], d: 'x' }, b: 1 };
    expect(canonicalJson(a)).to.equal(canonicalJson(b));
    expect(canonicalJson(a)).to.equal('{"a":{"c":[3,{"e":true,"f":null}],"d":"x"},"b":1}');
  });

  it('keeps array order', () => {
    expect(canonicalJson([1, 2])).to.not.equal(canonicalJson([2, 1]));
  });

  it('throws on undefined, NaN, Infinity, bigint and non-plain objects', () => {
    for (const bad of [undefined, NaN, Infinity, -Infinity, 1n, new Date(0), () => 1]) {
      expect(() => canonicalJson(bad)).to.throw();
      expect(() => canonicalJson({ nested: bad })).to.throw();
      expect(() => canonicalJson([bad])).to.throw();
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Stan Aska                                                          */
/* ------------------------------------------------------------------ */

describe('asks seals: sealed state', () => {
  const keys = keysEnv();

  it('stays valid after a JSON round trip (Firestore read-back)', () => {
    const doc = roundTrip(sealStateDoc(keys.current, baseState()));
    const check = readSealedState(keys, ASK_ID, doc);
    expect(check.kind).to.equal('valid');
    expect(check.value).to.deep.equal(baseState());
    expect(check.kid).to.equal(keys.current.kid);
  });

  it('ignores extra unsigned fields', () => {
    const doc = { ...roundTrip(sealStateDoc(keys.current, baseState())), sealedAt: { _seconds: 1 }, junk: 'x' };
    expect(readSealedState(keys, ASK_ID, doc).kind).to.equal('valid');
  });

  const tampers: Array<[string, (d: any) => void]> = [
    ['status', (d) => (d.status = 'resolved')],
    ['author', (d) => (d.author = STRANGER)],
    ['funding', (d) => (d.funding = 'on-resolve')],
    ['budget', (d) => (d.budget = 6)],
    ['seats', (d) => (d.seats = 2)],
    ['deadline', (d) => (d.deadline += 1)],
    ['escrow.perAnswerUnits', (d) => (d.escrow.perAnswerUnits = '5000001')],
    ['escrow.fundTxHash', (d) => (d.escrow.fundTxHash = `0x${'ab'.repeat(32)}`)],
    ['resolvedAt', (d) => (d.resolvedAt = 1786468000000)],
    ['origin', (d) => (d.origin = 'legacy')],
  ];
  for (const [field, mutate] of tampers) {
    it(`tampering with ${field} gives invalid/bad_mac`, () => {
      const doc = roundTrip(sealStateDoc(keys.current, baseState()));
      mutate(doc);
      expect(readSealedState(keys, ASK_ID, doc)).to.deep.equal({ kind: 'invalid', reason: 'bad_mac' });
    });
  }

  it('a state moved to another Ask is invalid (wrong binding), not valid', () => {
    const doc = roundTrip(sealStateDoc(keys.current, baseState()));
    expect(readSealedState(keys, 'otherAskId0000000000', doc)).to.deep.equal({
      kind: 'invalid',
      reason: 'wrong_binding',
    });
  });

  it('a missing doc is absent', () => {
    expect(readSealedState(keys, ASK_ID, null)).to.deep.equal({ kind: 'absent' });
    expect(readSealedState(keys, ASK_ID, undefined)).to.deep.equal({ kind: 'absent' });
  });

  it('a kid that is not configured gives invalid/unknown_kid, never absent', () => {
    const foreign = deriveAskSealKeys({ ASK_SEAL_SECRET: 'some-other-deployment' });
    const doc = roundTrip(sealStateDoc(foreign.current, baseState()));
    expect(readSealedState(keys, ASK_ID, doc)).to.deep.equal({ kind: 'invalid', reason: 'unknown_kid' });
  });

  it('a malformed mac or a malformed field is invalid/malformed', () => {
    const doc = roundTrip(sealStateDoc(keys.current, baseState()));
    expect(readSealedState(keys, ASK_ID, { ...doc, mac: 'zz' })).to.deep.equal({ kind: 'invalid', reason: 'malformed' });
    expect(readSealedState(keys, ASK_ID, { ...doc, kid: undefined })).to.deep.equal({ kind: 'invalid', reason: 'malformed' });
    expect(readSealedState(keys, ASK_ID, { ...doc, author: AUTHOR_CHECKSUM })).to.deep.equal({
      kind: 'invalid',
      reason: 'malformed',
    });
    expect(readSealedState(keys, ASK_ID, { ...doc, budget: '5' })).to.deep.equal({ kind: 'invalid', reason: 'malformed' });
  });

  it('a seal made with the previous secret still verifies after rotation', () => {
    const old = deriveAskSealKeys({ ASK_SEAL_SECRET: PREVIOUS });
    const doc = roundTrip(sealStateDoc(old.current, baseState()));
    const rotated = deriveAskSealKeys({ ASK_SEAL_SECRET: SECRET, ASK_SEAL_SECRET_PREVIOUS: PREVIOUS });
    expect(rotated.current.kid).to.not.equal(old.current.kid);
    expect(readSealedState(rotated, ASK_ID, doc).kind).to.equal('valid');
  });

  it('a service-account seal still verifies once ASK_SEAL_SECRET is set', () => {
    const before = deriveAskSealKeys({}, SA);
    const doc = roundTrip(sealStateDoc(before.current, baseState()));
    const after = deriveAskSealKeys({ ASK_SEAL_SECRET: SECRET }, SA);
    expect(after.current.source).to.equal('env');
    expect(readSealedState(after, ASK_ID, doc).kind).to.equal('valid');
  });

  it('refuses to seal an inconsistent state (escrowed without terms)', () => {
    expectAskError(() => sealStateDoc(keys.current, baseState({ escrow: null })), 'seal_write_malformed', 500);
    expectAskError(() => sealStateDoc(keys.current, baseState({ funding: 'on-resolve' })), 'seal_write_malformed');
    expectAskError(() => sealStateDoc(keys.current, baseState({ author: AUTHOR_CHECKSUM })), 'seal_write_malformed');
  });
});

/* ------------------------------------------------------------------ */
/*  Przyjecia, rejestr, straznik                                       */
/* ------------------------------------------------------------------ */

describe('asks seals: acceptance record', () => {
  const keys = keysEnv();
  const record = transferAcceptance({
    askId: ASK_ID,
    answerId: ANSWER_ID,
    payee: PAYEE.toUpperCase().replace('0X', '0x'),
    from: AUTHOR_CHECKSUM,
    txHash: PAY_TX.toUpperCase().replace('0X', '0x'),
    logIndex: 447,
    units: 500000n,
  });

  it('builds lowercase, decimal-string records', () => {
    expect(record).to.deep.equal({
      v: 1,
      askId: ASK_ID,
      answerId: ANSWER_ID,
      payee: PAYEE,
      kind: 'transfer',
      chainId: 8453,
      txHash: PAY_TX,
      logIndex: 447,
      units: '500000',
      from: AUTHOR,
      token: 'USDC',
      network: 'base',
    });
  });

  it('is valid at its own path after a round trip', () => {
    const doc = roundTrip(sealAcceptanceDoc(keys.current, record));
    expect(readAcceptance(keys, ASK_ID, ANSWER_ID, doc).kind).to.equal('valid');
  });

  it('moved to another answer or Ask it is invalid', () => {
    const doc = roundTrip(sealAcceptanceDoc(keys.current, record));
    expect(readAcceptance(keys, ASK_ID, 'otherAnswer000000000', doc)).to.deep.equal({
      kind: 'invalid',
      reason: 'wrong_binding',
    });
    expect(readAcceptance(keys, 'otherAsk000000000000', ANSWER_ID, doc)).to.deep.equal({
      kind: 'invalid',
      reason: 'wrong_binding',
    });
  });

  it('tampering with units or payee gives bad_mac', () => {
    const doc = roundTrip(sealAcceptanceDoc(keys.current, record));
    expect(readAcceptance(keys, ASK_ID, ANSWER_ID, { ...doc, units: '5000000' }).reason).to.equal('bad_mac');
    expect(readAcceptance(keys, ASK_ID, ANSWER_ID, { ...doc, payee: STRANGER }).reason).to.equal('bad_mac');
  });

  it('escrow-seat records use the contract as from', () => {
    const seat = escrowSeatAcceptance({
      askId: ASK_ID,
      answerId: ANSWER_ID,
      payee: PAYEE,
      contract: CONTRACT,
      chainId: 8453,
      txHash: PAY_TX,
      logIndex: 355,
      units: '5000000',
    });
    expect(seat.kind).to.equal('escrow-seat');
    expect(seat.from).to.equal(CONTRACT);
  });

  it('refuses to build a record with a bad hash or id', () => {
    expectAskError(
      () => transferAcceptance({ askId: 'a/b', answerId: ANSWER_ID, payee: PAYEE, from: AUTHOR, txHash: PAY_TX, logIndex: 1, units: 1n }),
      'seal_write_malformed'
    );
    expectAskError(
      () => transferAcceptance({ askId: ASK_ID, answerId: ANSWER_ID, payee: PAYEE, from: AUTHOR, txHash: '0x12', logIndex: 1, units: 1n }),
      'seal_write_malformed'
    );
  });
});

describe('asks seals: payout registry', () => {
  const keys = keysEnv();
  const record = transferAcceptance({
    askId: ASK_ID,
    answerId: ANSWER_ID,
    payee: PAYEE,
    from: AUTHOR,
    txHash: PAY_TX,
    logIndex: 447,
    units: 500000n,
  });

  it('payoutRegistryId lowercases the hash: 8453:0x..:447', () => {
    const id = payoutRegistryId(8453, PAY_TX.toUpperCase().replace('0X', '0x'), 447);
    expect(id).to.equal(`8453:${PAY_TX}:447`);
    expect(isPayoutRegistryId(id)).to.equal(true);
    expect(isPayoutRegistryId('8453:0xabc:1')).to.equal(false);
    expect(isPayoutRegistryId(`8453/${PAY_TX}:1`)).to.equal(false);
  });

  it('an entry verifies only under the id derived from its content', () => {
    const entry = payoutEntryFor(record);
    const doc = roundTrip(registryDoc(keys.current, entry));
    expect(readRegistry(keys, payoutRegistryId(8453, PAY_TX, 447), doc).kind).to.equal('valid');
    expect(readRegistry(keys, payoutRegistryId(8453, PAY_TX, 448), doc)).to.deep.equal({
      kind: 'invalid',
      reason: 'wrong_binding',
    });
    expect(readRegistry(keys, payoutRegistryId(8453, PAY_TX, 447), { ...doc, answerId: 'otherAnswer000000000' }).reason).to.equal(
      'bad_mac'
    );
    expect(readRegistry(keys, payoutRegistryId(8453, PAY_TX, 447), null)).to.deep.equal({ kind: 'absent' });
  });
});

describe('asks seals: answerer guard', () => {
  const keys = keysEnv();
  const guard = { v: 1, askId: ASK_ID, author: PAYEE, answerId: ANSWER_ID, createdAt: 1786300000000 };

  it('is bound to the Ask and the author address', () => {
    const doc = roundTrip(answererDoc(keys.current, guard));
    expect(readAnswerer(keys, ASK_ID, PAYEE, doc).kind).to.equal('valid');
    expect(readAnswerer(keys, ASK_ID, PAYEE.toUpperCase().replace('0X', '0x'), doc).kind).to.equal('valid');
    expect(readAnswerer(keys, ASK_ID, STRANGER, doc).reason).to.equal('wrong_binding');
    expect(readAnswerer(keys, 'otherAsk000000000000', PAYEE, doc).reason).to.equal('wrong_binding');
  });
});

/* ------------------------------------------------------------------ */
/*  Widok Aska                                                         */
/* ------------------------------------------------------------------ */

describe('asks seals: effectiveAsk', () => {
  const keys = keysEnv();
  const forgedPub = {
    author: STRANGER,
    question: 'What is the best L2?',
    budget: 50,
    seats: 5,
    perAnswer: 10,
    token: 'ETH',
    network: 'solana',
    deadline: 1,
    createdAt: 1786208890753,
    status: 'resolved',
    funding: 'on-resolve',
    answerCount: 3,
    acceptedCount: 5,
  };

  it('a sealed state beats a forged public doc', () => {
    const check = readSealedState(keys, ASK_ID, roundTrip(sealStateDoc(keys.current, baseState())));
    const view = effectiveAsk(ASK_ID, forgedPub, check, false);
    expect(view.trust).to.equal('sealed');
    expect(view.status).to.equal('open');
    expect(view.token).to.equal('USDC');
    expect(view.network).to.equal('base');
    expect(view.funding).to.equal('escrowed');
    expect(view.author).to.equal(AUTHOR);
    expect(view.budget).to.equal(5);
    expect(view.seats).to.equal(1);
    expect(view.perAnswer).to.equal(5);
    expect(view.deadline).to.equal(1786468085839);
    expect(view.escrow.perAnswerUnits).to.equal('5000000');
    expect(view.escrowTxHash).to.equal(FUND_TX);
    // Pytanie i czas utworzenia to tylko wyswietlanie - z lustra.
    expect(view.question).to.equal('What is the best L2?');
  });

  it('a sealed escrow resolve exposes the resolve hash', () => {
    const resolveTx = `0x${'dd'.repeat(32)}`;
    const state = baseState({ status: 'resolved', resolvedAt: 1786300000000, resolveKind: 'escrow', resolveTxHash: resolveTx });
    const check = readSealedState(keys, ASK_ID, roundTrip(sealStateDoc(keys.current, state)));
    const view = effectiveAsk(ASK_ID, forgedPub, check, true);
    expect(view.status).to.equal('resolved');
    expect(view.resolvedAt).to.equal(1786300000000);
    expect(view.escrowResolveTxHash).to.equal(resolveTx);
  });

  it('an invalid state gives trust broken', () => {
    const view = effectiveAsk(ASK_ID, forgedPub, { kind: 'invalid', reason: 'bad_mac' }, false);
    expect(view.trust).to.equal('broken');
    expect(view.escrow).to.equal(null);
  });

  it('no state with the flag on gives unverified: frozen fields only, open, USDC/base, no escrow', () => {
    const pub = { ...forgedPub, author: AUTHOR_CHECKSUM, funding: 'escrowed', escrowTxHash: FUND_TX, escrowChainId: 8453 };
    const view = effectiveAsk(ASK_ID, pub, { kind: 'absent' }, true);
    expect(view.trust).to.equal('unverified');
    expect(view.status).to.equal('open');
    expect(view.token).to.equal('USDC');
    expect(view.network).to.equal('base');
    expect(view.escrow).to.equal(null);
    expect(view.escrowTxHash).to.equal(null);
    expect(view.acceptedCount).to.equal(0);
    expect(view.author).to.equal(AUTHOR);
    expect(view.funding).to.equal('escrowed');
    expect(view.budget).to.equal(50);
    expect(view.seats).to.equal(5);
  });

  it('no state with the flag off gives legacy: exactly today\'s toAsk', () => {
    const view = effectiveAsk(ASK_ID, forgedPub, { kind: 'absent' }, false);
    expect(view.trust).to.equal('legacy');
    const { trust, escrow, state, ...ask } = view;
    expect(ask).to.deep.equal(toAsk(ASK_ID, forgedPub));
    expect(escrow).to.equal(null);
    expect(state).to.equal(null);
  });
});

/* ------------------------------------------------------------------ */
/*  Identyfikatory, adopcja, nowy Ask                                  */
/* ------------------------------------------------------------------ */

describe('asks seals: isDocId', () => {
  it('rejects path injection, reserved and empty ids', () => {
    for (const bad of ['a/sealed/state', '_registry', '..', '.', '', 'a.b', 'a_b', 'x'.repeat(65), null, 42, undefined]) {
      expect(isDocId(bad), String(bad)).to.equal(false);
    }
  });

  it('accepts Firestore auto ids', () => {
    expect(isDocId('mGlRpEtdsvBfG7O8jHjd')).to.equal(true);
    expect(isDocId(ANSWER_ID)).to.equal(true);
  });
});

describe('asks seals: adoptLegacyState / newAskState', () => {
  const pub = {
    author: AUTHOR_CHECKSUM,
    question: 'q',
    budget: 1,
    seats: 2,
    deadline: 1786468085839,
    funding: 'on-resolve',
    status: 'resolved',
    token: 'ETH',
    network: 'solana',
    acceptedCount: 2,
  };

  it('uses only the frozen fields: status open, USDC/base, lowercase author', () => {
    const state = adoptLegacyState(ASK_ID, pub, 'adopted', null);
    expect(state).to.deep.include({
      askId: ASK_ID,
      author: AUTHOR,
      funding: 'on-resolve',
      token: 'USDC',
      network: 'base',
      budget: 1,
      seats: 2,
      deadline: 1786468085839,
      origin: 'adopted',
      escrow: null,
      status: 'open',
      resolvedAt: null,
    });
  });

  it('refuses an escrowed Ask without verified escrow terms (409 escrow_unverified)', () => {
    expectAskError(() => adoptLegacyState(ASK_ID, { ...pub, funding: 'escrowed' }, 'legacy', null), 'escrow_unverified', 409);
  });

  it('keeps chain escrow terms for an escrowed Ask', () => {
    const escrow = baseState().escrow;
    const state = adoptLegacyState(ASK_ID, { ...pub, funding: 'escrowed', budget: 5, seats: 1 }, 'legacy', escrow);
    expect(state.escrow).to.deep.equal(escrow);
    expect(state.funding).to.equal('escrowed');
  });

  it('refuses a malformed legacy doc (409 ask_malformed)', () => {
    expectAskError(() => adoptLegacyState(ASK_ID, { ...pub, author: 'nobody' }, 'legacy', null), 'ask_malformed', 409);
    expectAskError(() => adoptLegacyState(ASK_ID, { ...pub, seats: 0 }, 'legacy', null), 'ask_malformed');
    expectAskError(() => adoptLegacyState(ASK_ID, { ...pub, deadline: null }, 'legacy', null), 'ask_malformed');
  });

  it('newAskState validates id, seats and escrow/funding consistency', () => {
    const input = { author: AUTHOR, origin: 'x402', budget: 1, seats: 1, deadline: 1786468085839, funding: 'on-resolve', escrow: null };
    expect(newAskState(ASK_ID, input).status).to.equal('open');
    expectAskError(() => newAskState('a/b', input), 'invalid_id', 400);
    expectAskError(() => newAskState(ASK_ID, { ...input, seats: 21 }), 'invalid_ask', 400);
    expectAskError(() => newAskState(ASK_ID, { ...input, funding: 'escrowed' }), 'invalid_ask');
    expectAskError(() => newAskState(ASK_ID, { ...input, budget: 0.001 }), 'invalid_ask');
  });
});

/* ------------------------------------------------------------------ */
/*  Wyplaty                                                            */
/* ------------------------------------------------------------------ */

const TRANSFER_TOPIC = encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer' })[0];

function usdcLog(from: string, to: string, value: bigint, logIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    address: USDC_BASE_ADDRESS,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
    logIndex,
    ...overrides,
  };
}

describe('asks payouts: usdcTransfersFromLogs', () => {
  it('keeps only well-formed USDC Transfer logs', () => {
    const good = usdcLog(AUTHOR_CHECKSUM, PAYEE, 500000n, 447);
    const logs = [
      good,
      usdcLog(AUTHOR, PAYEE, 500000n, 1, { address: '0x4200000000000000000000000000000000000006' }),
      usdcLog(AUTHOR, PAYEE, 500000n, 2, { topics: [`0x${'00'.repeat(32)}`, ...good.topics.slice(1)] }),
      usdcLog(AUTHOR, PAYEE, 500000n, 3, { topics: good.topics.slice(0, 2) }),
      usdcLog(AUTHOR, PAYEE, 500000n, 4, { data: '0x' }),
      usdcLog(AUTHOR, PAYEE, 500000n, 5, { data: 'not-hex' }),
      usdcLog(AUTHOR, PAYEE, 500000n, 6, { logIndex: null }),
    ];
    expect(usdcTransfersFromLogs(logs)).to.deep.equal([{ logIndex: 447, from: AUTHOR, to: PAYEE, value: 500000n }]);
  });
});

describe('asks payouts: matchUsdcTransfers / pickTransfer / payoutIsTimely', () => {
  const transfers = [
    { logIndex: 10, from: AUTHOR, to: PAYEE, value: 1000000n },
    { logIndex: 3, from: AUTHOR, to: PAYEE, value: 500000n },
    { logIndex: 7, from: AUTHOR, to: PAYEE, value: 500000n },
    { logIndex: 1, from: STRANGER, to: PAYEE, value: 500000n },
    { logIndex: 2, from: AUTHOR, to: STRANGER, value: 500000n },
    { logIndex: 4, from: AUTHOR, to: PAYEE, value: 499999n },
  ];

  it('matches sender, recipient and minimum; rejects the rest', () => {
    const matched = matchUsdcTransfers(transfers, { from: AUTHOR_CHECKSUM, to: PAYEE, minUnits: 500000n });
    expect(matched.map((t: any) => t.logIndex)).to.deep.equal([3, 7, 10]);
    expect(matchUsdcTransfers(transfers, { from: STRANGER, to: STRANGER, minUnits: 1n })).to.deep.equal([]);
  });

  it('picks the smallest sufficient value, lowest logIndex on a tie, skipping used ones', () => {
    const matched = matchUsdcTransfers(transfers, { from: AUTHOR, to: PAYEE, minUnits: 500000n });
    expect(pickTransfer(matched, new Set()).logIndex).to.equal(3);
    expect(pickTransfer(matched, new Set([3])).logIndex).to.equal(7);
    expect(pickTransfer(matched, new Set([3, 7])).logIndex).to.equal(10);
    expect(pickTransfer(matched, new Set([3, 7, 10]))).to.equal(null);
  });

  it('payoutIsTimely: census case true, hours before false, 5000/5001 ms edges', () => {
    // Odpowiedz zapisana 0,753 s po pelnej sekundzie bloku (flashblocks) - ma przejsc.
    expect(payoutIsTimely(1786208891, 1786208890753)).to.equal(true);
    expect(payoutIsTimely(1786208890, 1786208890753)).to.equal(true);
    // Przelew z blokiem trzy godziny przed odpowiedzia - stary przelew, odpada.
    expect(payoutIsTimely(1786208891 - 3 * 3600, 1786208890753)).to.equal(false);
    const block = 1786208891;
    expect(payoutIsTimely(block, block * 1000 + 5000)).to.equal(true);
    expect(payoutIsTimely(block, block * 1000 + 5001)).to.equal(false);
    expect(payoutIsTimely(NaN, 1)).to.equal(false);
  });
});

describe('asks seats: strict counting', () => {
  it('counts only records and chain-verified legacy acceptances, once each', () => {
    // Surowe `accepted: true` z lustra nie ma tu wejscia w ogole - licznik
    // przyjmuje wylacznie id z waznych rekordow i z weryfikacji lancucha.
    expect(countTakenSeats(['a', 'b'], ['b', 'c'])).to.equal(3);
    expect(countTakenSeats(['a', 'b'], ['c'], 'a')).to.equal(2);
    expect(countTakenSeats([], [])).to.equal(0);
  });

  it('auto-full triggers only for on-resolve when records fill the seats', () => {
    expect(isAutoFull(2, 2, 'on-resolve')).to.equal(true);
    expect(isAutoFull(1, 2, 'on-resolve')).to.equal(false);
    expect(isAutoFull(2, 2, 'escrowed')).to.equal(false);
  });
});
