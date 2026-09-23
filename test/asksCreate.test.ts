export {};

// Zakladanie Aska: decyzja o id przy escrow (decideEscrowedCreate - obrona
// przed przejeciem cudzego Aska), walidacja szkicu (app/api/asks/draft.ts),
// czysta logika klienta (zapamietany depozyt, ponowienia) i transakcja
// commitEscrowedAsk na malej atrapie Firestore (na dole pliku). Bez
// prawdziwego Firebase i bez lancucha. Runner: scripts/test-asks-seals.cjs.
const { expect } = require('chai');
const {
  CREATE_RETRY_LIMIT,
  createRetryDelayMs,
  decideEscrowedCreate,
  isDefinitiveEscrowRefusal,
  isEscrowAskId,
  isRetryableCreateRefusal,
  parsePendingEscrows,
  pendingEscrowFor,
  publicAsk,
  withPendingEscrow,
  withoutPendingEscrow,
} = require('../app/utils/asks/askCreateCore');
const { validateAskDraft, validateDurationMs, validateEscrowFields } = require('../app/api/asks/draft');
const { deriveAskSealKeys, effectiveAsk, readSealedState, sealStateDoc } = require('../app/utils/asks/askSealCore');
const { ASK_DURATIONS, MAX_SEATS } = require('../app/utils/asks/types');
const { MAX_QUESTION_LENGTH } = require('../app/api/asks/pricing');

/* ------------------------------------------------------------------ */
/*  Dane                                                               */
/* ------------------------------------------------------------------ */

const ASK_ID = 'mGlRpEtdsvBfG7O8jHjd';
const VICTIM = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
const VICTIM_CHECKSUM = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const ATTACKER = '0x1111111111111111111111111111111111111111';
const CONTRACT = '0xd5f65cfbe6a1aa1b6f82cbe0a336ddfcd39a5340';
const FUND_TX = `0x${'ce'.repeat(32)}`;
const OTHER_TX = `0x${'ab'.repeat(32)}`;

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));
const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'create-test-secret-0123456789' });

function escrowedState(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    askId: ASK_ID,
    author: VICTIM,
    funding: 'escrowed',
    token: 'USDC',
    network: 'base',
    budget: 1,
    seats: 2,
    deadline: 1786468085000,
    origin: 'session',
    escrow: {
      chainId: 8453,
      contract: CONTRACT,
      fundTxHash: FUND_TX,
      perAnswerUnits: '500000',
      seats: 2,
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

/** Stan tak, jak wychodzi z Firestore: zapieczetowany i przepuszczony przez JSON. */
function validCheck(state: Record<string, unknown>) {
  const check = readSealedState(keys, ASK_ID, roundTrip(sealStateDoc(keys.current, state)));
  expect(check.kind).to.equal('valid');
  return check;
}

function tamperedCheck() {
  const doc = roundTrip(sealStateDoc(keys.current, escrowedState()));
  doc.author = ATTACKER;
  const check = readSealedState(keys, ASK_ID, doc);
  expect(check.kind).to.equal('invalid');
  return check;
}

const ABSENT = { kind: 'absent' };

function decide(overrides: Record<string, unknown>) {
  return decideEscrowedCreate({
    pubExists: false,
    pubAuthor: undefined,
    stateCheck: ABSENT,
    hasAnswers: false,
    session: VICTIM,
    fundTxHash: FUND_TX,
    ...overrides,
  });
}

/* ------------------------------------------------------------------ */
/*  decideEscrowedCreate                                               */
/* ------------------------------------------------------------------ */

describe('asks create: decideEscrowedCreate (anti-hijack)', () => {
  it("attacker's session against the victim's sealed Ask: 409 ask_exists", () => {
    // Napastnik sfinansowal keccak(ASK_ID) ze swojego portfela - fund
    // przechodzi, ale stan Aska juz istnieje i nalezy do kogos innego.
    const decision = decide({
      session: ATTACKER,
      fundTxHash: OTHER_TX,
      pubExists: true,
      pubAuthor: VICTIM,
      stateCheck: validCheck(escrowedState()),
    });
    expect(decision).to.include({ action: 'refuse', status: 409, code: 'ask_exists' });
  });

  it("attacker's session against the victim's unsealed legacy Ask: 409 ask_exists", () => {
    const decision = decide({ session: ATTACKER, fundTxHash: OTHER_TX, pubExists: true, pubAuthor: VICTIM });
    expect(decision).to.include({ action: 'refuse', status: 409, code: 'ask_exists' });
  });

  it("attacker cannot take over the victim's legacy Ask even when it has no answers", () => {
    const decision = decide({ session: ATTACKER, pubExists: true, pubAuthor: VICTIM, hasAnswers: false });
    expect(decision).to.include({ action: 'refuse', code: 'ask_exists' });
  });

  it('attacker cannot take over a doc whose author field is junk', () => {
    const decision = decide({ session: ATTACKER, pubExists: true, pubAuthor: 'not-an-address' });
    expect(decision).to.include({ action: 'refuse', code: 'ask_exists' });
  });

  it('the author against their own squatted, empty doc (no state, no answers): overwrite', () => {
    expect(decide({ pubExists: true, pubAuthor: VICTIM })).to.deep.equal({ action: 'overwrite' });
  });

  it('the author match is case-insensitive (checksummed doc author)', () => {
    expect(decide({ pubExists: true, pubAuthor: VICTIM_CHECKSUM, session: VICTIM })).to.deep.equal({
      action: 'overwrite',
    });
    expect(decide({ pubExists: true, pubAuthor: VICTIM, session: VICTIM_CHECKSUM })).to.deep.equal({
      action: 'overwrite',
    });
  });

  it('the author against their own doc that already has answers: 409 ask_exists', () => {
    const decision = decide({ pubExists: true, pubAuthor: VICTIM, hasAnswers: true });
    expect(decision).to.include({ action: 'refuse', status: 409, code: 'ask_exists' });
  });

  it("the author's retry with the same fund hash: existing (200)", () => {
    const decision = decide({ pubExists: true, pubAuthor: VICTIM, stateCheck: validCheck(escrowedState()) });
    expect(decision).to.deep.equal({ action: 'existing' });
  });

  it('the retry matches hashes case-insensitively', () => {
    const decision = decide({ fundTxHash: FUND_TX.toUpperCase().replace('0X', '0x'), stateCheck: validCheck(escrowedState()) });
    expect(decision).to.deep.equal({ action: 'existing' });
  });

  it('the author with a different fund hash: 409 ask_exists', () => {
    const decision = decide({ fundTxHash: OTHER_TX, stateCheck: validCheck(escrowedState()) });
    expect(decision).to.include({ action: 'refuse', status: 409, code: 'ask_exists' });
  });

  it("the author's own on-resolve sealed Ask under the same id: 409 (never converted to escrow)", () => {
    const state = escrowedState({ funding: 'on-resolve', escrow: null });
    const decision = decide({ stateCheck: validCheck(state) });
    expect(decision).to.include({ action: 'refuse', code: 'ask_exists' });
  });

  it('a valid state without a public doc still wins (no re-create over a sealed state)', () => {
    const decision = decide({ session: ATTACKER, pubExists: false, stateCheck: validCheck(escrowedState()) });
    expect(decision).to.include({ action: 'refuse', code: 'ask_exists' });
  });

  it('an invalid state: 503 seal_invalid, even for the author and even without a doc', () => {
    expect(decide({ stateCheck: tamperedCheck() })).to.include({ action: 'refuse', status: 503, code: 'seal_invalid' });
    expect(decide({ stateCheck: tamperedCheck(), pubExists: true, pubAuthor: VICTIM })).to.include({
      status: 503,
      code: 'seal_invalid',
    });
    expect(decide({ stateCheck: { kind: 'invalid', reason: 'unknown_kid' } })).to.include({ code: 'seal_invalid' });
  });

  it('nothing there: create', () => {
    expect(decide({})).to.deep.equal({ action: 'create' });
  });

  it('refuses malformed session or hash with 400 instead of guessing', () => {
    expect(decide({ session: 'nope' })).to.include({ action: 'refuse', status: 400, code: 'invalid_request' });
    expect(decide({ fundTxHash: '0x1234' })).to.include({ action: 'refuse', status: 400, code: 'invalid_request' });
  });
});

/* ------------------------------------------------------------------ */
/*  Formaty i odpowiedz                                                */
/* ------------------------------------------------------------------ */

describe('asks create: ids and response shape', () => {
  it('isEscrowAskId accepts exactly the newAskId format', () => {
    expect(isEscrowAskId(ASK_ID)).to.equal(true);
    for (const bad of ['a/sealed/state', '_registry', '..', '', 'short', `${ASK_ID}x`, ASK_ID.slice(1), 'mGlRpEtdsvBfG7O8jHj_', 42, null]) {
      expect(isEscrowAskId(bad), String(bad)).to.equal(false);
    }
  });

  it('publicAsk strips server-only fields and keeps the Ask shape', () => {
    const view = effectiveAsk(
      ASK_ID,
      { question: 'Q?', createdAt: 1_800_000_000_000, answerCount: 0, acceptedCount: 0 },
      validCheck(escrowedState()),
      false
    );
    const ask = publicAsk(view);
    expect(ask).to.not.have.any.keys('trust', 'escrow', 'state');
    expect(ask).to.include({
      id: ASK_ID,
      author: VICTIM,
      question: 'Q?',
      budget: 1,
      seats: 2,
      perAnswer: 0.5,
      token: 'USDC',
      network: 'base',
      deadline: 1786468085000,
      status: 'open',
      funding: 'escrowed',
      escrowTxHash: FUND_TX,
      escrowChainId: 8453,
    });
    expect(roundTrip(ask)).to.deep.equal(ask);
  });
});

/* ------------------------------------------------------------------ */
/*  Walidacja szkicu (draft.ts)                                        */
/* ------------------------------------------------------------------ */

describe('asks create: validateAskDraft', () => {
  const good = { question: '  What should I build?  ', budget: 1, seats: 2 };

  it('accepts a valid draft, trims the question and computes perAnswer once', () => {
    const result = validateAskDraft(good);
    expect(result.ok).to.equal(true);
    expect(result.value).to.deep.equal({ question: 'What should I build?', budget: 1, seats: 2, perAnswer: 0.5 });
  });

  it('accepts numeric strings like the old handlePost did', () => {
    expect(validateAskDraft({ question: 'Q', budget: '1', seats: '2' }).ok).to.equal(true);
  });

  const refusals: Array<[string, Record<string, unknown>, string, string]> = [
    ['missing question', { ...good, question: '   ' }, 'missing_question', 'Missing question'],
    [
      'too long question',
      { ...good, question: 'x'.repeat(MAX_QUESTION_LENGTH + 1) },
      'question_too_long',
      `Question is limited to ${MAX_QUESTION_LENGTH} characters`,
    ],
    ['zero budget', { ...good, budget: 0 }, 'invalid_budget', 'Invalid budget'],
    ['NaN budget', { ...good, budget: 'abc' }, 'invalid_budget', 'Invalid budget'],
    ['fractional seats', { ...good, seats: 1.5 }, 'invalid_seats', `Seats must be a whole number between 1 and ${MAX_SEATS}`],
    ['too many seats', { ...good, seats: MAX_SEATS + 1 }, 'invalid_seats', `Seats must be a whole number between 1 and ${MAX_SEATS}`],
    ['zero seats', { ...good, seats: 0 }, 'invalid_seats', `Seats must be a whole number between 1 and ${MAX_SEATS}`],
    [
      'per answer below minimum',
      { ...good, budget: 0.99, seats: 2 },
      'per_answer_too_low',
      'Each seat must be worth at least 0.5 - this budget gives 0.49 per answer',
    ],
  ];
  for (const [label, body, code, error] of refusals) {
    it(`refuses ${label} with 400 ${code} and the old message`, () => {
      const result = validateAskDraft(body);
      expect(result.ok).to.equal(false);
      expect(result.refusal.status).to.equal(400);
      expect(result.refusal.body).to.include({ code, error });
    });
  }

  it('the question limit is inclusive', () => {
    expect(validateAskDraft({ ...good, question: 'x'.repeat(MAX_QUESTION_LENGTH) }).ok).to.equal(true);
  });
});

describe('asks create: validateDurationMs', () => {
  it('accepts every listed duration, also as a numeric string', () => {
    for (const duration of ASK_DURATIONS) {
      expect(validateDurationMs(duration.ms)).to.deep.equal({ ok: true, value: duration.ms });
      expect(validateDurationMs(String(duration.ms))).to.deep.equal({ ok: true, value: duration.ms });
    }
  });

  it('refuses anything else and lists the allowed values', () => {
    for (const bad of [1, 3600_000, undefined, null, 'x', 30 * 24 * 3600_000]) {
      const result = validateDurationMs(bad);
      expect(result.ok, String(bad)).to.equal(false);
      expect(result.refusal.body.code).to.equal('invalid_duration');
      expect(result.refusal.body.error).to.equal('Invalid duration');
      expect(result.refusal.body.allowed).to.have.length(ASK_DURATIONS.length);
    }
  });
});

describe('asks create: validateEscrowFields', () => {
  const good = { askId: ASK_ID, fundTxHash: FUND_TX.toUpperCase().replace('0X', '0x'), deadlineMs: 1786468085839 };

  it('accepts a valid escrow body and lowercases the hash', () => {
    const result = validateEscrowFields(good);
    expect(result).to.deep.equal({
      ok: true,
      value: { askId: ASK_ID, fundTxHash: FUND_TX, deadlineMs: 1786468085839 },
    });
  });

  it('refuses ids that could address another path, and anything not in newAskId format', () => {
    for (const askId of ['X/sealed/state', `${ASK_ID}/sealed/state`, '_registry', '..', '', 'abc', 7]) {
      const result = validateEscrowFields({ ...good, askId });
      expect(result.ok, String(askId)).to.equal(false);
      expect(result.refusal.body.code).to.equal('invalid_id');
    }
  });

  it('refuses a missing or malformed fund hash', () => {
    for (const fundTxHash of [undefined, '', '0x1234', `0x${'zz'.repeat(32)}`]) {
      expect(validateEscrowFields({ ...good, fundTxHash }).refusal.body.code).to.equal('invalid_fund_tx');
    }
  });

  it('refuses a missing or non-positive deadline', () => {
    for (const deadlineMs of [undefined, 0, -1, 'soon', Infinity]) {
      expect(validateEscrowFields({ ...good, deadlineMs }).refusal.body.code).to.equal('invalid_deadline');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Klient: ponowienia i zapamietany depozyt                           */
/* ------------------------------------------------------------------ */

describe('asks create: client retry policy', () => {
  it('retries only fund_not_visible', () => {
    expect(isRetryableCreateRefusal('fund_not_visible')).to.equal(true);
    for (const code of ['fund_mismatch', 'ask_exists', 'store_unavailable', 'session_required', null, undefined]) {
      expect(isRetryableCreateRefusal(code), String(code)).to.equal(false);
    }
  });

  it('backs off 1500 ms x retry number, 8 retries (~54 s)', () => {
    expect(CREATE_RETRY_LIMIT).to.equal(8);
    expect([1, 2, 8].map(createRetryDelayMs)).to.deep.equal([1500, 3000, 12000]);
    let total = 0;
    for (let retry = 1; retry <= CREATE_RETRY_LIMIT; retry += 1) total += createRetryDelayMs(retry);
    expect(total).to.equal(54000);
  });

  it('forgets the deposit only on refusals that can never succeed for it', () => {
    for (const code of ['fund_reverted', 'fund_not_for_this_ask', 'fund_mismatch', 'ask_exists', 'per_answer_too_low']) {
      expect(isDefinitiveEscrowRefusal(code), code).to.equal(true);
    }
    // Chwilowe albo zalezne od biezacej tresci pytania - depozyt zostaje.
    for (const code of [
      'fund_not_visible',
      'store_unavailable',
      'seal_invalid',
      'session_required',
      'missing_question',
      'question_too_long',
      'ask_write_failed',
      'network_error',
      null,
    ]) {
      expect(isDefinitiveEscrowRefusal(code), String(code)).to.equal(false);
    }
  });
});

describe('asks create: pending escrow (keyed by author)', () => {
  const entry = {
    author: VICTIM,
    reservedId: ASK_ID,
    fundTxHash: FUND_TX,
    deadlineMs: 1786468085839,
    budget: 1,
    seats: 2,
    question: 'First wording',
    savedAt: 1,
  };

  it('round-trips through JSON and is found by the author in any case', () => {
    const map = withPendingEscrow({}, entry);
    const parsed = parsePendingEscrows(JSON.stringify(map));
    expect(pendingEscrowFor(parsed, VICTIM_CHECKSUM)).to.deep.equal(entry);
    expect(pendingEscrowFor(parsed, ATTACKER)).to.equal(null);
  });

  it('is keyed by author only - an edited question still finds the same deposit', () => {
    const map = withPendingEscrow({}, entry);
    const found = pendingEscrowFor(map, VICTIM);
    expect(found.reservedId).to.equal(ASK_ID);
    expect(found.fundTxHash).to.equal(FUND_TX);
  });

  it('keeps two wallets on one device apart', () => {
    const other = { ...entry, author: ATTACKER, reservedId: 'abcdefghijKLMNOPQRST', fundTxHash: OTHER_TX };
    const map = withPendingEscrow(withPendingEscrow({}, entry), other);
    expect(pendingEscrowFor(map, VICTIM).fundTxHash).to.equal(FUND_TX);
    expect(pendingEscrowFor(map, ATTACKER).fundTxHash).to.equal(OTHER_TX);
    const cleared = withoutPendingEscrow(map, VICTIM_CHECKSUM);
    expect(pendingEscrowFor(cleared, VICTIM)).to.equal(null);
    expect(pendingEscrowFor(cleared, ATTACKER)).to.not.equal(null);
  });

  it('drops unreadable storage and malformed or mis-keyed entries silently', () => {
    expect(parsePendingEscrows(null)).to.deep.equal({});
    expect(parsePendingEscrows('{not json')).to.deep.equal({});
    expect(parsePendingEscrows('[]')).to.deep.equal({});
    const raw = JSON.stringify({
      [ATTACKER]: entry, // klucz innego portfela niz autor wpisu
      [VICTIM]: { ...entry, reservedId: 'a/sealed/state' },
    });
    expect(parsePendingEscrows(raw)).to.deep.equal({});
  });

  it('withPendingEscrow ignores a malformed entry', () => {
    const map = withPendingEscrow({}, { ...entry, fundTxHash: 'junk' });
    expect(map).to.deep.equal({});
  });
});

/* ------------------------------------------------------------------ */
/*  commitEscrowedAsk na atrapie Firestore                             */
/* ------------------------------------------------------------------ */

// Mala atrapa - tylko to, czego uzywa commitEscrowedAsk (getAll, get zapytania,
// create/set w transakcji). Pelniejsza wersja zyje w test/asksStore.test.ts.
const { commitEscrowedAsk } = require('../app/api/asks/draft');
const { AskError } = require('../app/utils/asks/askSealCore');

const SERVER_TS = { __sentinel: 'serverTimestamp' };

class TinyDb {
  docs = new Map<string, Record<string, any>>();
  writes = 0;

  collection(path: string): any {
    const db = this;
    const query = (filters: Array<[string, any]>, max: number | null): any => ({
      where: (field: string, _op: string, value: any) => query([...filters, [field, value]], max),
      limit: (n: number) => query(filters, n),
      get: async () => {
        let rows = [...db.docs.entries()].filter(
          ([p, data]) =>
            p.startsWith(`${path}/`) &&
            !p.slice(path.length + 1).includes('/') &&
            filters.every(([field, value]) => data[field] === value)
        );
        if (max !== null) rows = rows.slice(0, max);
        return { empty: rows.length === 0, size: rows.length, docs: rows.map(([p]) => db.snapshot(p)) };
      },
    });
    return {
      ...query([], null),
      doc: (id: string) => {
        const docPath = `${path}/${id}`;
        return { id, path: docPath, collection: (name: string) => db.collection(`${docPath}/${name}`) };
      },
    };
  }

  snapshot(path: string) {
    const data = this.docs.get(path);
    return {
      id: path.split('/').pop(),
      exists: data !== undefined,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
      createTime: data ? { toMillis: () => 1 } : undefined,
      updateTime: data ? { toMillis: () => 1 } : undefined,
    };
  }

  async getAll(...refs: any[]) {
    return refs.map((ref) => this.snapshot(ref.path));
  }

  async runTransaction(fn: (tx: any) => Promise<any>) {
    const pending: Array<{ op: string; path: string; data: any }> = [];
    const tx = {
      getAll: (...refs: any[]) => this.getAll(...refs),
      get: (queryOrRef: any) => queryOrRef.get(),
      create: (ref: any, data: any) => pending.push({ op: 'create', path: ref.path, data }),
      set: (ref: any, data: any, opts?: any) => {
        if (opts?.merge) throw new Error('merge not expected here');
        pending.push({ op: 'set', path: ref.path, data });
      },
    };
    const result = await fn(tx);
    for (const w of pending) if (w.op === 'create' && this.docs.has(w.path)) throw new Error(`ALREADY_EXISTS ${w.path}`);
    for (const w of pending) {
      const data: Record<string, any> = {};
      for (const [k, v] of Object.entries(w.data)) data[k] = v === SERVER_TS ? 1_800_000_000_000 : v;
      this.docs.set(w.path, JSON.parse(JSON.stringify(data)));
      this.writes += 1;
    }
    return result;
  }
}

function tinyStore(enforce = false): any {
  return {
    db: new TinyDb(),
    keys,
    key: keys.current,
    enforce,
    legacyCutoffMs: Number.POSITIVE_INFINITY,
    FieldValue: { serverTimestamp: () => SERVER_TS },
  };
}

const ESCROW = {
  chainId: 8453,
  contract: CONTRACT,
  fundTxHash: FUND_TX,
  perAnswerUnits: '500000',
  seats: 2,
  deadlineSec: '1786468085',
  source: 'fund-log',
};
const DRAFT = { question: 'What should I build?', budget: 1, seats: 2, perAnswer: 0.5 };
const DEADLINE = 1786468085000;

function commit(store: any, overrides: Record<string, unknown> = {}) {
  return commitEscrowedAsk(store, { askId: ASK_ID, session: VICTIM, draft: DRAFT, escrow: ESCROW, deadline: DEADLINE, ...overrides });
}

async function expectRefusal(promise: Promise<unknown>, code: string, status: number) {
  let caught: any = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected AskError ${code}`).to.be.instanceOf(AskError);
  expect(caught.code).to.equal(code);
  expect(caught.status).to.equal(status);
}

describe('asks create: commitEscrowedAsk (transaction)', () => {
  it('creates the public doc and a valid sealed state with chain terms', async () => {
    const store = tinyStore();
    const result = await commit(store);
    expect(result.created).to.equal(true);
    expect(result.state).to.deep.include({ author: VICTIM, origin: 'session', funding: 'escrowed', deadline: DEADLINE, status: 'open' });
    expect(result.state.escrow).to.deep.equal(ESCROW);

    const pub = store.db.docs.get(`asks/${ASK_ID}`);
    expect(pub).to.deep.include({
      author: VICTIM,
      question: DRAFT.question,
      funding: 'escrowed',
      escrowTxHash: FUND_TX,
      escrowChainId: 8453,
      deadline: DEADLINE,
      status: 'open',
      token: 'USDC',
      network: 'base',
    });
    const state = readSealedState(keys, ASK_ID, store.db.docs.get(`asks/${ASK_ID}/sealed/state`));
    expect(state.kind).to.equal('valid');
    expect(publicAsk(result.ask)).to.include({ id: ASK_ID, funding: 'escrowed', escrowTxHash: FUND_TX });
  });

  it('the retry by the author with the same fund returns the existing Ask and writes nothing', async () => {
    const store = tinyStore();
    await commit(store);
    const writes = store.db.writes;
    const retry = await commit(store, { draft: { ...DRAFT, question: 'Edited wording' } });
    expect(retry.created).to.equal(false);
    expect(retry.ask.question).to.equal(DRAFT.question);
    expect(store.db.writes).to.equal(writes);
  });

  it('an attacker who funded keccak(victimId) from their own wallet gets 409 and changes nothing', async () => {
    const store = tinyStore();
    await commit(store);
    const before = JSON.stringify([...store.db.docs.entries()]);
    await expectRefusal(
      commit(store, { session: ATTACKER, escrow: { ...ESCROW, fundTxHash: OTHER_TX } }),
      'ask_exists',
      409
    );
    expect(JSON.stringify([...store.db.docs.entries()])).to.equal(before);
  });

  it('an attacker cannot seal over the unsealed legacy Ask of the victim', async () => {
    const store = tinyStore();
    store.db.docs.set(`asks/${ASK_ID}`, { author: VICTIM, question: 'Legacy', funding: 'on-resolve', status: 'open' });
    await expectRefusal(commit(store, { session: ATTACKER, escrow: { ...ESCROW, fundTxHash: OTHER_TX } }), 'ask_exists', 409);
    expect(store.db.docs.has(`asks/${ASK_ID}/sealed/state`)).to.equal(false);
    expect(store.db.docs.get(`asks/${ASK_ID}`).author).to.equal(VICTIM);
  });

  it('a squatted empty doc carrying the author address is fully rewritten (no merge)', async () => {
    const store = tinyStore();
    store.db.docs.set(`asks/${ASK_ID}`, {
      author: VICTIM_CHECKSUM,
      question: 'Squatted',
      status: 'resolved',
      acceptedCount: 5,
      network: 'solana',
      junk: 'x',
    });
    const result = await commit(store);
    expect(result.created).to.equal(true);
    const pub = store.db.docs.get(`asks/${ASK_ID}`);
    expect(pub).to.not.have.property('junk');
    expect(pub).to.deep.include({ status: 'open', acceptedCount: 0, network: 'base', question: DRAFT.question, author: VICTIM });
  });

  it('a doc of the author that already has answers: 409', async () => {
    const store = tinyStore();
    store.db.docs.set(`asks/${ASK_ID}`, { author: VICTIM, question: 'Has answers' });
    store.db.docs.set('askAnswers/answer00000000000001', { askId: ASK_ID, author: ATTACKER });
    await expectRefusal(commit(store), 'ask_exists', 409);
  });

  it('a broken seal under the id: 503 seal_invalid and nothing is overwritten', async () => {
    const store = tinyStore();
    await commit(store);
    store.db.docs.get(`asks/${ASK_ID}/sealed/state`).status = 'resolved';
    const before = JSON.stringify([...store.db.docs.entries()]);
    await expectRefusal(commit(store), 'seal_invalid', 503);
    expect(JSON.stringify([...store.db.docs.entries()])).to.equal(before);
  });

  it('refuses path-like ids before touching Firestore', async () => {
    const store = tinyStore();
    await expectRefusal(commit(store, { askId: 'x/sealed/state' }), 'invalid_id', 400);
    expect(store.db.writes).to.equal(0);
  });
});
