export {};

// Magazyn Askow po stronie serwera (app/api/asks/askStore.ts i transakcyjne
// saveAnswer z app/api/asks/answerStore.ts) na atrapie Firestore w pamieci.
// Zadnego polaczenia z Firebase - 'server-only' podmienia runner
// (scripts/test-asks-seals.cjs), a magazyn dostaje atrape zamiast getAdminDb().
const { expect } = require('chai');
const {
  askRef,
  answererRef,
  createSealedAsk,
  mirrorAsk,
  putState,
  readAcceptances,
  readAnswerRows,
  readAskBundle,
  stateRef,
  usableView,
} = require('../app/api/asks/askStore');
const { saveAnswer } = require('../app/api/asks/answerStore');
const { AskError, deriveAskSealKeys, readAnswerer, sealStateDoc } = require('../app/utils/asks/askSealCore');

/* ------------------------------------------------------------------ */
/*  Atrapa Firestore - tylko to, czego uzywa magazyn Askow             */
/* ------------------------------------------------------------------ */

type Stored = { data: Record<string, any>; createTime: number; updateTime?: number };

const SERVER_TS = { __sentinel: 'serverTimestamp' };
const FakeFieldValue = {
  serverTimestamp: () => SERVER_TS,
  increment: (n: number) => ({ __sentinel: 'increment', n }),
  delete: () => ({ __sentinel: 'delete' }),
};

let idCounter = 0;
const newId = () => `fakeId${String(++idCounter).padStart(14, '0')}`;

class FakeDb {
  docs = new Map<string, Stored>();
  clock = 1_800_000_000_000;

  collection(path: string) {
    return new FakeCollection(this, path);
  }

  async getAll(...refs: any[]) {
    return refs.map((ref) => this.snapshot(ref.path));
  }

  snapshot(path: string) {
    const stored = this.docs.get(path);
    const id = path.split('/').pop();
    return {
      id,
      exists: stored !== undefined,
      data: () => (stored ? JSON.parse(JSON.stringify(stored.data)) : undefined),
      createTime: stored ? { toMillis: () => stored.createTime } : undefined,
      updateTime: stored ? { toMillis: () => stored.updateTime ?? stored.createTime } : undefined,
    };
  }

  resolve(value: any, previous: any): any {
    if (value && value.__sentinel === 'serverTimestamp') return this.clock;
    if (value && value.__sentinel === 'increment') return (typeof previous === 'number' ? previous : 0) + value.n;
    return value;
  }

  apply(write: any) {
    const existing = this.docs.get(write.path);
    if (write.op === 'create' && existing) throw new Error(`ALREADY_EXISTS ${write.path}`);
    if (write.op === 'update' && !existing) throw new Error(`NOT_FOUND ${write.path}`);
    const base = write.op === 'create' || (write.op === 'set' && !write.merge) ? {} : { ...(existing?.data ?? {}) };
    for (const [key, value] of Object.entries(write.data)) {
      if (value && (value as any).__sentinel === 'delete') delete base[key];
      else base[key] = this.resolve(value, base[key]);
    }
    this.docs.set(write.path, { data: base, createTime: existing?.createTime ?? this.clock });
  }

  async runTransaction(fn: (tx: any) => Promise<any>) {
    const writes: any[] = [];
    const tx = {
      getAll: async (...refs: any[]) => this.getAll(...refs),
      get: async (refOrQuery: any) => refOrQuery.get(),
      create: (ref: any, data: any) => writes.push({ op: 'create', path: ref.path, data }),
      set: (ref: any, data: any, opts?: any) => writes.push({ op: 'set', path: ref.path, data, merge: Boolean(opts?.merge) }),
      update: (ref: any, data: any) => writes.push({ op: 'update', path: ref.path, data }),
    };
    const result = await fn(tx);
    // Atomowo: najpierw sprawdzamy wszystkie create/update, potem zapisujemy.
    for (const write of writes) {
      if (write.op === 'create' && this.docs.has(write.path)) throw new Error(`ALREADY_EXISTS ${write.path}`);
      if (write.op === 'update' && !this.docs.has(write.path)) throw new Error(`NOT_FOUND ${write.path}`);
    }
    for (const write of writes) this.apply(write);
    return result;
  }
}

class FakeQuery {
  constructor(
    public db: FakeDb,
    public path: string,
    public filters: Array<[string, any]> = [],
    public order: string | null = null,
    public max: number | null = null
  ) {}
  where(field: string, _op: string, value: any) {
    return new FakeQuery(this.db, this.path, [...this.filters, [field, value]], this.order, this.max);
  }
  orderBy(field: string) {
    return new FakeQuery(this.db, this.path, this.filters, field, this.max);
  }
  limit(n: number) {
    return new FakeQuery(this.db, this.path, this.filters, this.order, n);
  }
  async get() {
    let rows = [...this.db.docs.entries()]
      .filter(([path]) => path.startsWith(`${this.path}/`) && !path.slice(this.path.length + 1).includes('/'))
      .filter(([, stored]) => this.filters.every(([field, value]) => stored.data[field] === value));
    if (this.order) {
      const field = this.order;
      rows = rows.filter(([, s]) => field in s.data).sort(([, a], [, b]) => a.data[field] - b.data[field]);
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    const docs = rows.map(([path]) => this.db.snapshot(path));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeCollection extends FakeQuery {
  doc(id?: string) {
    const docId = id ?? newId();
    const path = `${this.path}/${docId}`;
    const db = this.db;
    return {
      id: docId,
      path,
      collection: (name: string) => new FakeCollection(db, `${path}/${name}`),
      get: async () => db.snapshot(path),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Dane                                                               */
/* ------------------------------------------------------------------ */

const AUTHOR = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
const ANSWERER = '0xdf1e757062d7e6ef19bab6d6b1aa6f9fa44a09eb';
const ANSWERER_2 = '0x1111111111111111111111111111111111111111';
const ASK_ID = 'askLegacy00000000001';

function makeStore(enforce = false): any {
  const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'store-test-secret' });
  return { db: new FakeDb(), keys, key: keys.current, enforce, legacyCutoffMs: Number.POSITIVE_INFINITY, FieldValue: FakeFieldValue };
}

function seedLegacyAsk(store: any, overrides: Record<string, unknown> = {}, askId = ASK_ID) {
  store.db.docs.set(`asks/${askId}`, {
    data: {
      author: AUTHOR,
      question: 'What should I build?',
      budget: 2,
      seats: 2,
      perAnswer: 1,
      token: 'USDC',
      network: 'base',
      deadline: Date.now() + 3600_000,
      createdAt: Date.now() - 1000,
      status: 'open',
      funding: 'on-resolve',
      answerCount: 0,
      acceptedCount: 0,
      ...overrides,
    },
    createTime: Date.now() - 1000,
  });
}

function sealState(store: any, askId: string, overrides: Record<string, unknown> = {}) {
  const state = {
    v: 1,
    askId,
    author: AUTHOR,
    funding: 'on-resolve',
    token: 'USDC',
    network: 'base',
    budget: 2,
    seats: 2,
    deadline: Date.now() + 3600_000,
    origin: 'session',
    escrow: null,
    status: 'open',
    resolvedAt: null,
    resolveKind: null,
    resolveTxHash: null,
    expiredTxHash: null,
    expiredLogIndex: null,
    ...overrides,
  };
  store.db.docs.set(`asks/${askId}/sealed/state`, { data: sealStateDoc(store.key, state), createTime: Date.now() });
}

const content = 'A sealed answer.';

/* ------------------------------------------------------------------ */
/*  saveAnswer                                                         */
/* ------------------------------------------------------------------ */

describe('asks store: saveAnswer (one transaction)', () => {
  it('writes guard, content, metadata and the counter together', async () => {
    const store = makeStore();
    seedLegacyAsk(store);
    const result = await saveAnswer(store, { askId: ASK_ID, author: ANSWERER.toUpperCase().replace('0X', '0x'), content });
    expect(result.ok).to.equal(true);
    const { id } = result.answer;
    expect(result.answer.author).to.equal(ANSWERER);

    const guard = store.db.docs.get(`asks/${ASK_ID}/answerers/${ANSWERER}`);
    expect(readAnswerer(store.keys, ASK_ID, ANSWERER, guard.data).kind).to.equal('valid');
    expect(guard.data.answerId).to.equal(id);
    expect(store.db.docs.get(`askAnswerContent/${id}`).data.content).to.equal(content);
    expect(store.db.docs.get(`askAnswers/${id}`).data).to.deep.include({ askId: ASK_ID, author: ANSWERER, accepted: false, payoutTxHash: null });
    expect(store.db.docs.get(`asks/${ASK_ID}`).data.answerCount).to.equal(1);
  });

  it('the same wallet twice: already_answered, counter unchanged', async () => {
    const store = makeStore();
    seedLegacyAsk(store);
    expect((await saveAnswer(store, { askId: ASK_ID, author: ANSWERER, content })).ok).to.equal(true);
    const again = await saveAnswer(store, { askId: ASK_ID, author: ANSWERER, content });
    expect(again).to.deep.equal({ ok: false, code: 'already_answered', status: 409 });
    expect(store.db.docs.get(`asks/${ASK_ID}`).data.answerCount).to.equal(1);
  });

  it('an answer from before the guard existed also counts as a duplicate', async () => {
    const store = makeStore();
    seedLegacyAsk(store);
    store.db.docs.set('askAnswers/oldAnswer00000000001', {
      data: { askId: ASK_ID, author: ANSWERER, createdAt: 1, accepted: false, payoutTxHash: null },
      createTime: 1,
    });
    const result = await saveAnswer(store, { askId: ASK_ID, author: ANSWERER, content });
    expect(result.code).to.equal('already_answered');
  });

  it('two concurrent submissions: exactly one lands', async () => {
    const store = makeStore();
    seedLegacyAsk(store);
    const results = await Promise.all([
      saveAnswer(store, { askId: ASK_ID, author: ANSWERER, content }),
      saveAnswer(store, { askId: ASK_ID, author: ANSWERER, content }),
    ]);
    expect(results.filter((r: any) => r.ok)).to.have.length(1);
    expect(results.filter((r: any) => !r.ok)[0].code).to.be.oneOf(['already_answered', 'answer_write_failed']);
    expect(store.db.docs.get(`asks/${ASK_ID}`).data.answerCount).to.equal(1);
  });

  it('refuses own Ask, closed, past deadline, missing Ask and bad ids', async () => {
    const store = makeStore();
    seedLegacyAsk(store);
    expect((await saveAnswer(store, { askId: ASK_ID, author: AUTHOR, content })).code).to.equal('own_ask');
    expect((await saveAnswer(store, { askId: 'nope0000000000000000', author: ANSWERER, content })).code).to.equal('ask_not_found');
    expect((await saveAnswer(store, { askId: 'a/sealed/state', author: ANSWERER, content })).code).to.equal('invalid_id');
    expect((await saveAnswer(store, { askId: ASK_ID, author: 'nobody', content })).code).to.equal('invalid_author');

    seedLegacyAsk(store, { status: 'resolved' }, 'askClosed00000000001');
    const closed = await saveAnswer(store, { askId: 'askClosed00000000001', author: ANSWERER, content });
    expect(closed).to.deep.equal({ ok: false, code: 'ask_closed', status: 409, askStatus: 'resolved' });

    seedLegacyAsk(store, { deadline: Date.now() - 1 }, 'askPast0000000000001');
    expect((await saveAnswer(store, { askId: 'askPast0000000000001', author: ANSWERER, content })).code).to.equal('ask_closed');
  });

  it('a sealed Ask ignores a forged public status and uses the sealed one', async () => {
    const store = makeStore();
    seedLegacyAsk(store, { status: 'resolved' });
    sealState(store, ASK_ID);
    expect((await saveAnswer(store, { askId: ASK_ID, author: ANSWERER, content })).ok).to.equal(true);

    seedLegacyAsk(store, { status: 'open' }, 'askSealedResolved001');
    sealState(store, 'askSealedResolved001', { status: 'resolved', resolvedAt: 1, resolveKind: 'author' });
    const refused = await saveAnswer(store, { askId: 'askSealedResolved001', author: ANSWERER, content });
    expect(refused.code).to.equal('ask_closed');
  });

  it('a broken seal refuses with 503 and writes nothing', async () => {
    const store = makeStore();
    seedLegacyAsk(store);
    sealState(store, ASK_ID);
    const stored = store.db.docs.get(`asks/${ASK_ID}/sealed/state`);
    stored.data.status = 'resolved'; // podrobka bez nowego MAC
    const before = store.db.docs.size;
    const result = await saveAnswer(store, { askId: ASK_ID, author: ANSWERER, content });
    expect(result).to.deep.equal({ ok: false, code: 'seal_invalid', status: 503 });
    expect(store.db.docs.size).to.equal(before);
  });

  it('with the flag on, an unsealed Ask is unverified and takes no answers', async () => {
    const store = makeStore(true);
    seedLegacyAsk(store);
    expect((await saveAnswer(store, { askId: ASK_ID, author: ANSWERER_2, content })).code).to.equal('ask_unverified');
  });
});

/* ------------------------------------------------------------------ */
/*  Odczyty i zapisy magazynu                                          */
/* ------------------------------------------------------------------ */

describe('asks store: bundle, create, mirror', () => {
  it('createSealedAsk writes the public doc and a valid sealed state', async () => {
    const store = makeStore();
    const deadline = Date.now() + 6 * 3600_000;
    const created = await createSealedAsk(store, {
      author: '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e',
      origin: 'x402',
      question: '  Is this sealed?  ',
      budget: 1,
      seats: 1,
      deadline,
    });
    expect(created.state).to.deep.include({ author: AUTHOR, origin: 'x402', status: 'open', funding: 'on-resolve' });
    const pub = store.db.docs.get(`asks/${created.askId}`).data;
    expect(pub).to.deep.include({ author: AUTHOR, question: 'Is this sealed?', token: 'USDC', network: 'base', status: 'open', answerCount: 0 });

    const bundle = await readAskBundle(store, created.askId);
    expect(bundle.exists).to.equal(true);
    expect(bundle.stateCheck.kind).to.equal('valid');
    expect(usableView(bundle).trust).to.equal('sealed');
    expect(bundle.view.deadline).to.equal(deadline);
  });

  it('usableView maps missing and broken Asks to AskError', async () => {
    const store = makeStore();
    let caught: any = null;
    try {
      usableView(await readAskBundle(store, 'missing0000000000001'));
    } catch (error) {
      caught = error;
    }
    expect(caught).to.be.instanceOf(AskError);
    expect(caught.code).to.equal('ask_not_found');

    sealState(store, ASK_ID);
    store.db.docs.get(`asks/${ASK_ID}/sealed/state`).data.kid = 'ask:deadbeef';
    const bundle = await readAskBundle(store, ASK_ID);
    expect(bundle.exists).to.equal(true);
    expect(bundle.stateCheck).to.deep.equal({ kind: 'invalid', reason: 'unknown_kid' });
    caught = null;
    try {
      usableView(bundle);
    } catch (error) {
      caught = error;
    }
    expect(caught.code).to.equal('seal_invalid');
    expect(caught.status).to.equal(503);
  });

  it('refs refuse path injection before touching Firestore', () => {
    const store = makeStore();
    for (const fn of [
      () => askRef(store, 'x/sealed/state'),
      () => stateRef(store, '_registry'),
      () => answererRef(store, ASK_ID, 'not-an-address'),
    ]) {
      let caught: any = null;
      try {
        fn();
      } catch (error) {
        caught = error;
      }
      expect(caught).to.be.instanceOf(AskError);
      expect(caught.code).to.equal('invalid_id');
    }
  });

  it('mirrorAsk repairs token/network; putState seals; readAcceptances flags invalid records', async () => {
    const store = makeStore();
    seedLegacyAsk(store, { token: 'ETH', network: 'solana' });
    await store.db.runTransaction(async (tx: any) => {
      mirrorAsk(tx, store, ASK_ID, { acceptedCount: 0 });
      putState(tx, store, {
        v: 1, askId: ASK_ID, author: AUTHOR, funding: 'on-resolve', token: 'USDC', network: 'base',
        budget: 2, seats: 2, deadline: Date.now() + 1000, origin: 'adopted', escrow: null, status: 'open',
        resolvedAt: null, resolveKind: null, resolveTxHash: null, expiredTxHash: null, expiredLogIndex: null,
      });
    });
    const pub = store.db.docs.get(`asks/${ASK_ID}`).data;
    expect(pub.token).to.equal('USDC');
    expect(pub.network).to.equal('base');
    expect(pub.question).to.equal('What should I build?');
    expect((await readAskBundle(store, ASK_ID)).view.trust).to.equal('sealed');

    store.db.docs.set(`asks/${ASK_ID}/acceptances/forgedAnswer00000001`, { data: { v: 1, junk: true }, createTime: 1 });
    const set = await readAcceptances(store, ASK_ID);
    expect(set.invalid).to.deep.equal(['forgedAnswer00000001']);
    expect(set.valid.size).to.equal(0);
  });

  it('readAnswerRows returns server createTime, ordered by createdAt', async () => {
    const store = makeStore();
    store.db.docs.set('askAnswers/b0000000000000000002', { data: { askId: ASK_ID, author: ANSWERER, createdAt: 2 }, createTime: 22 });
    store.db.docs.set('askAnswers/a0000000000000000001', { data: { askId: ASK_ID, author: ANSWERER_2, createdAt: 1 }, createTime: 11 });
    store.db.docs.set('askAnswers/c0000000000000000003', { data: { askId: 'otherAsk000000000000', author: ANSWERER, createdAt: 0 }, createTime: 1 });
    const rows = await readAnswerRows(store, ASK_ID);
    expect(rows.map((r: any) => [r.id, r.createTimeMs])).to.deep.equal([
      ['a0000000000000000001', 11],
      ['b0000000000000000002', 22],
    ]);
  });
});
