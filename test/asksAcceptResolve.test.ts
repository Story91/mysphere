export {};

// Trasy POST /api/asks/[id]/accept i /resolve (plan zabezpieczen Askow, kroki
// 5 i 6) na atrapie Firestore i atrapie lancucha. Zadnego polaczenia z Firebase
// ani z Base: 'server-only' podmienia runner (scripts/test-asks-seals.cjs),
// identity.ts (sesja SIWE, @x402) i notifications.ts (kliencki SDK) podmieniamy
// w Module._load TYLKO na czas ladowania tych dwoch tras, a odczyty z lancucha
// i openAskStore - na obiektach modulow (TS -> CommonJS wola je przez
// `(0, modul_1.fn)(...)`, wiec podmiana dziala). Te podmiany zakladamy w before()
// i zdejmujemy w after() zewnetrznego describe: runner laduje wszystkie pliki
// testow Askow do jednego procesu, a inne pliki podmieniaja te same eksporty.
const Module = require('node:module');
const { expect } = require('chai');
const { encodeAbiParameters, encodeEventTopics, erc20Abi } = require('viem');

/* ------------------------------------------------------------------ */
/*  Podmiany modulow - PRZED zaladowaniem tras                         */
/* ------------------------------------------------------------------ */

const session: { address: string | null } = { address: null };
const notified: any[] = [];

const verifyPayment = require('../app/utils/monetization/verifyPayment');
const escrowProof = require('../app/api/asks/escrowProof');
const askStore = require('../app/api/asks/askStore');
const { deriveAskSealKeys, readAcceptance, readRegistry, readSealedState, sealAcceptanceDoc, sealStateDoc, transferAcceptance } =
  require('../app/utils/asks/askSealCore');
const { USDC_BASE_ADDRESS } = verifyPayment;
const { ASK_ESCROW_ABI, escrowKeyFor } = require('../app/utils/asks/escrow');

/* ------------------------------------------------------------------ */
/*  Atrapa lancucha                                                    */
/* ------------------------------------------------------------------ */

type Transfer = { from: string; to: string; value: bigint; logIndex: number };

const chain = {
  txs: new Map<string, { blockTimeSec: number; transfers: Transfer[]; extraLogs: any[] }>(),
  failures: new Map<string, 'tx_not_found' | 'tx_reverted' | 'rpc_error'>(),
  legacyEscrow: null as any,
};

function usdcLog(t: Transfer) {
  return {
    address: USDC_BASE_ADDRESS,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: t.from, to: t.to } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [t.value]),
    logIndex: t.logIndex,
  };
}

function readUsdcTransfersStub(hash: string) {
  const failure = chain.failures.get(hash);
  if (failure) return { ok: false, code: failure, error: `stub ${failure}` };
  const tx = chain.txs.get(hash);
  if (!tx) return { ok: false, code: 'tx_not_found', error: 'stub not found' };
  return {
    ok: true,
    blockNumber: 1n,
    blockTimeSec: tx.blockTimeSec,
    transfers: tx.transfers.map((t) => ({ ...t, from: t.from.toLowerCase(), to: t.to.toLowerCase() })),
  };
}

function readEscrowReceiptStub(hash: string) {
  const failure = chain.failures.get(hash);
  if (failure) return { ok: false, code: failure, error: `stub ${failure}` };
  const tx = chain.txs.get(hash);
  if (!tx) return { ok: false, code: 'tx_not_found', error: 'stub not found' };
  return { ok: true, txHash: hash, logs: [...tx.transfers.map(usdcLog), ...tx.extraLogs], blockNumber: 1n, blockTimeSec: tx.blockTimeSec };
}

function proveLegacyEscrowStub() {
  if (!chain.legacyEscrow) return { funded: false, onchain: {} };
  return { funded: true, escrow: chain.legacyEscrow, anomalies: [], onchain: {} };
}

/* ------------------------------------------------------------------ */
/*  Atrapa Firestore (z operatorem 'in')                               */
/* ------------------------------------------------------------------ */

type Stored = { data: Record<string, any>; createTime: number; updateTime?: number };

const FakeFieldValue = {
  serverTimestamp: () => ({ __sentinel: 'serverTimestamp' }),
  increment: (n: number) => ({ __sentinel: 'increment', n }),
  delete: () => ({ __sentinel: 'delete' }),
};

let idCounter = 0;

class FakeDb {
  docs = new Map<string, Stored>();
  clock = 1_800_000_900_000;
  commits = 0;

  collection(path: string) {
    return new FakeCollection(this, path);
  }

  async getAll(...refs: any[]) {
    return refs.map((ref) => this.snapshot(ref.path));
  }

  snapshot(path: string) {
    const stored = this.docs.get(path);
    return {
      id: path.split('/').pop(),
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
    for (const write of writes) {
      if (write.op === 'create' && this.docs.has(write.path)) throw new Error(`ALREADY_EXISTS ${write.path}`);
      if (write.op === 'update' && !this.docs.has(write.path)) throw new Error(`NOT_FOUND ${write.path}`);
    }
    for (const write of writes) this.apply(write);
    if (writes.length > 0) this.commits += 1;
    return result;
  }
}

class FakeQuery {
  constructor(
    public db: FakeDb,
    public path: string,
    public filters: Array<[string, string, any]> = [],
    public order: string | null = null,
    public max: number | null = null
  ) {}
  where(field: string, op: string, value: any) {
    return new FakeQuery(this.db, this.path, [...this.filters, [field, op, value]], this.order, this.max);
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
      .filter(([, stored]) =>
        this.filters.every(([field, op, value]) =>
          op === 'in' ? (value as any[]).includes(stored.data[field]) : stored.data[field] === value
        )
      );
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
    const docId = id ?? `fakeId${String(++idCounter).padStart(14, '0')}`;
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
/*  Trasy i dane                                                       */
/* ------------------------------------------------------------------ */

let currentStore: any = null;

const originalLoad = Module._load;
Module._load = function load(request: string, ...rest: any[]) {
  if (request === '../../identity') {
    return {
      sessionAddress: () => session.address,
      getRequester: () => (session.address ? { address: session.address, via: 'session' } : null),
    };
  }
  if (typeof request === 'string' && request.endsWith('/friends/notifications')) {
    return { notifyAskPayout: async (params: any) => void notified.push(params) };
  }
  return originalLoad.call(this, request, ...rest);
};
let acceptRoute: any;
let resolveRoute: any;
try {
  acceptRoute = require('../app/api/asks/[id]/accept/route');
  resolveRoute = require('../app/api/asks/[id]/resolve/route');
} finally {
  Module._load = originalLoad;
}

/** Podmiany wspolnych eksportow - tylko na czas tego pliku (patrz naglowek). */
const patches: Array<[any, string, unknown]> = [
  [askStore, 'openAskStore', async () => currentStore],
  [verifyPayment, 'readUsdcTransfers', async (hash: string) => readUsdcTransfersStub(hash)],
  [escrowProof, 'readEscrowReceipt', async (hash: string) => readEscrowReceiptStub(hash)],
  [escrowProof, 'proveLegacyEscrow', async () => proveLegacyEscrowStub()],
];
const saved: unknown[] = [];
function installPatches() {
  patches.forEach(([target, key, value], index) => {
    saved[index] = target[key];
    target[key] = value;
  });
}
function restorePatches() {
  patches.forEach(([target, key], index) => {
    target[key] = saved[index];
  });
}

const AUTHOR = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
const PAYEE = '0xdf1e757062d7e6ef19bab6d6b1aa6f9fa44a09eb';
const PAYEE_2 = '0x1111111111111111111111111111111111111111';
const STRANGER = '0x2222222222222222222222222222222222222222';
const CONTRACT = '0x3333333333333333333333333333333333333333';
const ASK = 'askMain000000000001';
const ASK_2 = 'askOther00000000002';
const ANSWER_1 = 'answerOne0000000001';
const ANSWER_2 = 'answerTwo0000000002';
const ANSWER_OTHER = 'answerElse000000003';
const RATE = 1_000_000n; // budzet 2 / 2 miejsca = 1 USDC

const NOW = Date.now();
const ANSWERED_AT = NOW - 3600_000; // odpowiedzi godzine temu
const PAID_SEC = Math.floor((NOW - 1800_000) / 1000); // wyplata pol godziny temu

const hashOf = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

function makeStore(enforce = false) {
  const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'accept-resolve-test-secret' });
  return { db: new FakeDb(), keys, key: keys.current, enforce, legacyCutoffMs: Number.POSITIVE_INFINITY, FieldValue: FakeFieldValue };
}

function seedPub(store: any, askId: string, overrides: Record<string, unknown> = {}) {
  store.db.docs.set(`asks/${askId}`, {
    data: {
      author: AUTHOR,
      question: 'What should I build?',
      budget: 2,
      seats: 2,
      perAnswer: 1,
      token: 'USDC',
      network: 'base',
      deadline: NOW + 3600_000,
      createdAt: NOW - 7200_000,
      status: 'open',
      funding: 'on-resolve',
      answerCount: 0,
      acceptedCount: 0,
      ...overrides,
    },
    createTime: NOW - 7200_000,
  });
}

function seedState(store: any, askId: string, overrides: Record<string, unknown> = {}) {
  const state = {
    v: 1,
    askId,
    author: AUTHOR,
    funding: 'on-resolve',
    token: 'USDC',
    network: 'base',
    budget: 2,
    seats: 2,
    deadline: NOW + 3600_000,
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
  store.db.docs.set(`asks/${askId}/sealed/state`, { data: sealStateDoc(store.key, state), createTime: NOW - 7200_000 });
}

function seedAnswer(store: any, answerId: string, askId: string, author: string, extra: Record<string, unknown> = {}, createTime = ANSWERED_AT) {
  store.db.docs.set(`askAnswers/${answerId}`, {
    data: { askId, author, createdAt: createTime, accepted: false, payoutTxHash: null, ...extra },
    createTime,
  });
}

function onChain(hash: string, transfers: Transfer[], blockTimeSec = PAID_SEC, extraLogs: any[] = []) {
  chain.txs.set(hash, { blockTimeSec, transfers, extraLogs });
}

/** Log AskExpired z kontraktu escrow dla (autor, askId). */
function askExpiredLog(askId: string, logIndex: number) {
  return {
    address: CONTRACT,
    topics: encodeEventTopics({ abi: ASK_ESCROW_ABI, eventName: 'AskExpired', args: { key: escrowKeyFor(AUTHOR, askId), author: AUTHOR } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [1_950_000n, 50_000n]),
    logIndex,
  };
}

async function call(route: any, askId: string, body?: unknown, as: string | null = AUTHOR) {
  session.address = as;
  const request = {
    json: async () => {
      if (body === undefined) throw new SyntaxError('no body');
      return body;
    },
  };
  const response = await route.POST(request, { params: { id: askId } });
  return { status: response.status, body: await response.json() };
}

const accept = (askId: string, body: unknown, as: string | null = AUTHOR) => call(acceptRoute, askId, body, as);
const resolve = (askId: string, as: string | null = AUTHOR) => call(resolveRoute, askId, undefined, as);

function stateOf(store: any, askId: string) {
  const raw = store.db.docs.get(`asks/${askId}/sealed/state`)?.data ?? null;
  return readSealedState(store.keys, askId, raw);
}

function recordOf(store: any, askId: string, answerId: string) {
  const raw = store.db.docs.get(`asks/${askId}/acceptances/${answerId}`)?.data ?? null;
  return readAcceptance(store.keys, askId, answerId, raw);
}

function registryOf(store: any, hash: string, logIndex: number) {
  const id = `8453:${hash}:${logIndex}`;
  return readRegistry(store.keys, id, store.db.docs.get(`askAnswerContent/_registry/payouts/${id}`)?.data ?? null);
}

function resetWorld() {
  chain.txs.clear();
  chain.failures.clear();
  chain.legacyEscrow = null;
  notified.length = 0;
  currentStore = makeStore();
}

describe('asks routes: accept and resolve (plan steps 5-6)', () => {
before(installPatches);
after(restorePatches);

/* ------------------------------------------------------------------ */
/*  ACCEPT                                                             */
/* ------------------------------------------------------------------ */

describe('asks route accept: request basics', () => {
  beforeEach(resetWorld);

  it('rejects path-injected Ask ids and answer ids with 400 invalid_id', async () => {
    expect((await accept('abc/sealed/state', { answerId: ANSWER_1, payoutTxHash: hashOf(1) })).body.code).to.equal('invalid_id');
    expect((await accept('_registry', { answerId: ANSWER_1, payoutTxHash: hashOf(1) })).status).to.equal(400);
    const bad = await accept(ASK, { answerId: 'x/../y', payoutTxHash: hashOf(1) });
    expect(bad.status).to.equal(400);
    expect(bad.body.code).to.equal('invalid_id');
  });

  it('needs a session (401), a hash (400) and a configured store (503)', async () => {
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(1) }, null)).status).to.equal(401);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: '0x1234' })).body.code).to.equal('payout_hash_required');
    currentStore = null;
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(1) });
    expect(res.status).to.equal(503);
    expect(res.body.code).to.equal('store_unavailable');
  });

  it('only the author accepts (403) and the answer must belong to the Ask (404)', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedState(store, ASK);
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    seedAnswer(store, ANSWER_OTHER, ASK_2, PAYEE);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(1) }, STRANGER)).status).to.equal(403);
    expect((await accept(ASK, { answerId: ANSWER_OTHER, payoutTxHash: hashOf(1) })).status).to.equal(404);
  });

  it('a broken state seal answers 503 seal_invalid and writes nothing', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedState(store, ASK);
    store.db.docs.get(`asks/${ASK}/sealed/state`).data.status = 'resolved'; // podrobka pod pieczecia
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(1), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(1) });
    expect(res.status).to.equal(503);
    expect(res.body.code).to.equal('seal_invalid');
    expect(store.db.commits).to.equal(0);
  });
});

describe('asks route accept: payout binding', () => {
  beforeEach(resetWorld);

  beforeEach(() => {
    seedPub(currentStore, ASK);
    seedState(currentStore, ASK);
    seedAnswer(currentStore, ANSWER_1, ASK, PAYEE);
    seedAnswer(currentStore, ANSWER_2, ASK, PAYEE_2);
  });

  it('records a verified payout: record, registry entry, mirrors and one notification', async () => {
    const hash = hashOf(10);
    onChain(hash, [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 447 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hash.toUpperCase().replace('0X', '0x') });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.include({ accepted: true, payoutTxHash: hash, payoutLogIndex: 447, payoutAmount: 1, acceptedCount: 1, seats: 2, status: 'open' });

    const store = currentStore;
    const record = recordOf(store, ASK, ANSWER_1);
    expect(record.kind).to.equal('valid');
    expect(record.value).to.deep.include({ kind: 'transfer', payee: PAYEE, from: AUTHOR, txHash: hash, logIndex: 447, units: '1000000' });
    expect(registryOf(store, hash, 447).kind).to.equal('valid');
    expect(store.db.docs.get(`askAnswers/${ANSWER_1}`).data).to.deep.include({ accepted: true, payoutTxHash: hash, payoutLogIndex: 447, payoutToken: 'USDC' });
    expect(store.db.docs.get(`asks/${ASK}`).data).to.deep.include({ acceptedCount: 1, status: 'open', token: 'USDC', network: 'base' });
    expect(notified).to.have.length(1);
    expect(notified[0]).to.deep.include({ askId: ASK, answerId: ANSWER_1, amount: '1.00', token: 'USDC', delivery: 'wallet', txHash: hash });
  });

  it('a retry with the same hash is 200 alreadyRecorded and sends no second notification', async () => {
    const hash = hashOf(11);
    onChain(hash, [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 3 }]);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hash })).status).to.equal(200);
    const again = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hash });
    expect(again.status).to.equal(200);
    expect(again.body.alreadyRecorded).to.equal(true);
    expect(notified).to.have.length(1);
    const other = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(12) });
    expect(other.status).to.equal(409);
    expect(other.body).to.deep.include({ code: 'already_accepted', payoutTxHash: hash });
  });

  it('a transfer from another wallet is payout_wrong_sender; none at all is payout_unverified', async () => {
    onChain(hashOf(20), [{ from: STRANGER, to: PAYEE, value: RATE, logIndex: 1 }]);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(20) })).body.code).to.equal('payout_wrong_sender');
    onChain(hashOf(21), [{ from: AUTHOR, to: PAYEE, value: RATE - 1n, logIndex: 1 }]);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(21) })).body.code).to.equal('payout_unverified');
    const unknown = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(22) });
    expect(unknown.status).to.equal(409);
    expect(unknown.body).to.deep.include({ code: 'payout_unverified', retryable: true });
    expect(currentStore.db.commits).to.equal(0);
  });

  it('a transfer older than the answer is payout_predates_answer', async () => {
    onChain(hashOf(30), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }], Math.floor((ANSWERED_AT - 60_000) / 1000));
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(30) });
    expect(res.status).to.equal(409);
    expect(res.body.code).to.equal('payout_predates_answer');
  });

  it('an RPC outage is 503 chain_unavailable, never "unpaid"', async () => {
    chain.failures.set(hashOf(31), 'rpc_error');
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(31) });
    expect(res.status).to.equal(503);
    expect(res.body.code).to.equal('chain_unavailable');
  });

  it('one log pays one answer: replaying it on another Ask is payout_already_used; a second log in the same tx pays', async () => {
    const store = currentStore;
    seedPub(store, ASK_2);
    seedState(store, ASK_2);
    seedAnswer(store, ANSWER_OTHER, ASK_2, PAYEE);
    const hash = hashOf(40);
    onChain(hash, [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 5 }]);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hash })).status).to.equal(200);
    const replay = await accept(ASK_2, { answerId: ANSWER_OTHER, payoutTxHash: hash });
    expect(replay.status).to.equal(409);
    expect(replay.body.code).to.equal('payout_already_used');

    onChain(hash, [
      { from: AUTHOR, to: PAYEE, value: RATE, logIndex: 5 },
      { from: AUTHOR, to: PAYEE, value: RATE, logIndex: 6 },
    ]);
    const second = await accept(ASK_2, { answerId: ANSWER_OTHER, payoutTxHash: hash });
    expect(second.status).to.equal(200);
    expect(second.body.payoutLogIndex).to.equal(6);
  });

  it('forged mirror fields (status resolved, acceptedCount = seats, network solana) do not block a sealed Ask', async () => {
    Object.assign(currentStore.db.docs.get(`asks/${ASK}`).data, { status: 'resolved', acceptedCount: 2, network: 'solana', token: 'ETH' });
    onChain(hashOf(41), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(41) });
    expect(res.status).to.equal(200);
    expect(currentStore.db.docs.get(`asks/${ASK}`).data).to.deep.include({ acceptedCount: 1, status: 'open', network: 'base', token: 'USDC' });
  });

  it('a devtools-flipped accepted flag on another answer does not take a seat: no auto-resolve', async () => {
    Object.assign(currentStore.db.docs.get(`askAnswers/${ANSWER_2}`).data, { accepted: true, payoutTxHash: hashOf(99) });
    onChain(hashOf(42), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(42) });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.include({ acceptedCount: 1, status: 'open' });
    const state = stateOf(currentStore, ASK);
    expect(state.kind).to.equal('valid');
    expect(state.value.status).to.equal('open');
  });

  it('the last paid seat auto-resolves the Ask with a sealed resolved/auto-full state', async () => {
    onChain(hashOf(43), [
      { from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 },
      { from: AUTHOR, to: PAYEE_2, value: RATE, logIndex: 2 },
    ]);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(43) })).body.status).to.equal('open');
    const last = await accept(ASK, { answerId: ANSWER_2, payoutTxHash: hashOf(43) });
    expect(last.status).to.equal(200);
    expect(last.body).to.deep.include({ acceptedCount: 2, status: 'resolved', autoResolved: true, payoutLogIndex: 2 });
    const state = stateOf(currentStore, ASK);
    expect(state.value).to.deep.include({ status: 'resolved', resolveKind: 'auto-full' });
    expect(currentStore.db.docs.get(`asks/${ASK}`).data.status).to.equal('resolved');
    // Ponowienie ostatniego miejsca po domknieciu to wciaz 200, nie "resolved".
    const retry = await accept(ASK, { answerId: ANSWER_2, payoutTxHash: hashOf(43) });
    expect(retry.status).to.equal(200);
    expect(retry.body.alreadyRecorded).to.equal(true);
  });

  it('no seat left: 409 no_seats_left from records, whatever the mirror says', async () => {
    const store = currentStore;
    seedState(store, ASK, { budget: 1, seats: 1 });
    // Jedno miejsce zajete prawdziwym rekordem (np. z escrow-resolve).
    const record = transferAcceptance({ askId: ASK, answerId: ANSWER_2, payee: PAYEE_2, from: AUTHOR, txHash: hashOf(50), logIndex: 1, units: RATE });
    store.db.docs.set(`asks/${ASK}/acceptances/${ANSWER_2}`, { data: sealAcceptanceDoc(store.key, record), createTime: NOW });
    store.db.docs.get(`asks/${ASK}`).data.acceptedCount = 0;
    onChain(hashOf(51), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(51) });
    expect(res.status).to.equal(409);
    expect(res.body).to.deep.include({ code: 'no_seats_left', acceptedCount: 1, seats: 1 });
  });
});

describe('asks route accept: escrow and legacy Asks', () => {
  beforeEach(resetWorld);

  it('escrowed: use_escrow_resolve until deadline+48h (chain deadline), then a direct payout is recorded', async () => {
    const store = currentStore;
    const escrow = (deadlineMs: number) => ({
      chainId: 8453,
      contract: CONTRACT,
      fundTxHash: hashOf(60),
      perAnswerUnits: '1000000',
      seats: 2,
      deadlineSec: String(Math.floor(deadlineMs / 1000)),
      source: 'fund-log',
    });
    seedPub(store, ASK, { funding: 'escrowed', status: 'expired' }); // lustro 'expired' nic nie otwiera
    seedState(store, ASK, { funding: 'escrowed', escrow: escrow(NOW - 3600_000) });
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(61), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const early = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(61) });
    expect(early.status).to.equal(409);
    expect(early.body.code).to.equal('use_escrow_resolve');

    seedState(store, ASK, { funding: 'escrowed', escrow: escrow(NOW - 49 * 3600_000) });
    const late = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(61) });
    expect(late.status).to.equal(200);
    expect(stateOf(store, ASK).value.status).to.equal('open'); // escrow nie domyka sie "na komplet"
  });

  it('unsealed escrowed Ask: escrowFor decides (not the mirror); unfunded is 409 escrow_unverified', async () => {
    const store = currentStore;
    seedPub(store, ASK, { funding: 'escrowed', status: 'expired', escrowTxHash: hashOf(62) });
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(63), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const unfunded = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(63) });
    expect(unfunded.status).to.equal(409);
    expect(unfunded.body.code).to.equal('escrow_unverified');

    chain.legacyEscrow = {
      chainId: 8453,
      contract: CONTRACT,
      fundTxHash: null,
      perAnswerUnits: '1000000',
      seats: 2,
      deadlineSec: String(Math.floor((NOW - 3600_000) / 1000)),
      source: 'escrowFor',
    };
    const early = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(63) });
    expect(early.body.code).to.equal('use_escrow_resolve'); // lustro 'expired' nie otwiera furtki
    expect(stateOf(store, ASK).kind).to.equal('absent');
  });

  it('unsealed escrowed Ask past the grace window: adopted with the proven AskExpired, mirror stays expired', async () => {
    const store = currentStore;
    seedPub(store, ASK, { funding: 'escrowed', status: 'expired', expiredTxHash: hashOf(64) });
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    chain.legacyEscrow = {
      chainId: 8453,
      contract: CONTRACT,
      fundTxHash: null,
      perAnswerUnits: '1000000',
      seats: 2,
      deadlineSec: String(Math.floor((NOW - 49 * 3600_000) / 1000)),
      source: 'escrowFor',
    };
    onChain(hashOf(64), [], PAID_SEC, [askExpiredLog(ASK, 12)]);
    onChain(hashOf(65), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(65) });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.include({ status: 'expired', acceptedCount: 1 });
    const state = stateOf(store, ASK);
    expect(state.value).to.deep.include({ origin: 'adopted', funding: 'escrowed', status: 'expired', expiredTxHash: hashOf(64), expiredLogIndex: 12 });
    expect(state.value.escrow).to.deep.include({ source: 'escrowFor', perAnswerUnits: '1000000' });
    expect(store.db.docs.get(`asks/${ASK}`).data.status).to.equal('expired');
  });

  it('unsealed escrowed Ask past the grace window with a junk expiredTxHash: adopted as open', async () => {
    const store = currentStore;
    seedPub(store, ASK, { funding: 'escrowed', status: 'expired', expiredTxHash: hashOf(66) });
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    chain.legacyEscrow = {
      chainId: 8453,
      contract: CONTRACT,
      fundTxHash: null,
      perAnswerUnits: '1000000',
      seats: 2,
      deadlineSec: String(Math.floor((NOW - 49 * 3600_000) / 1000)),
      source: 'escrowFor',
    };
    onChain(hashOf(66), [], PAID_SEC, [askExpiredLog(ASK_2, 3)]); // wygasniecie CUDZEGO Aska
    onChain(hashOf(67), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(67) });
    expect(res.status).to.equal(200);
    expect(stateOf(store, ASK).value.status).to.equal('open');
  });

  it('legacy Ask: a genuine earlier acceptance is recorded, counts as a seat, and the Ask is adopted and auto-resolved', async () => {
    const store = currentStore;
    seedPub(store, ASK, { acceptedCount: 1 });
    seedAnswer(store, ANSWER_2, ASK, PAYEE_2, { accepted: true, payoutTxHash: hashOf(70) }, ANSWERED_AT - 1000);
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(70), [{ from: AUTHOR, to: PAYEE_2, value: RATE, logIndex: 9 }]);
    onChain(hashOf(71), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 4 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(71) });
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.include({ acceptedCount: 2, status: 'resolved' });
    expect(recordOf(store, ASK, ANSWER_2).value).to.deep.include({ txHash: hashOf(70), logIndex: 9, payee: PAYEE_2 });
    expect(registryOf(store, hashOf(70), 9).kind).to.equal('valid');
    const state = stateOf(store, ASK);
    expect(state.value).to.deep.include({ origin: 'adopted', status: 'resolved', resolveKind: 'auto-full' });
  });

  it('legacy Ask: a forged earlier acceptance is ignored (not a seat, not reset)', async () => {
    const store = currentStore;
    seedPub(store, ASK, { acceptedCount: 1 });
    seedAnswer(store, ANSWER_2, ASK, PAYEE_2, { accepted: true, payoutTxHash: hashOf(72) });
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(73), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 4 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(73) });
    expect(res.body).to.deep.include({ acceptedCount: 1, status: 'open' });
    expect(recordOf(store, ASK, ANSWER_2).kind).to.equal('absent');
    expect(store.db.docs.get(`askAnswers/${ANSWER_2}`).data.accepted).to.equal(true);
  });

  it('flag on (unverified): a legacy doc that says resolved is refused, never re-sealed as open', async () => {
    currentStore = makeStore(true);
    const store = currentStore;
    seedPub(store, ASK, { status: 'resolved' });
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(74), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(74) })).body.code).to.equal('ask_resolved');
    expect((await resolve(ASK)).body.code).to.equal('already_resolved');
    expect(stateOf(store, ASK).kind).to.equal('absent');
  });

  it('flag on (unverified): an open legacy Ask is adopted from frozen fields on accept', async () => {
    currentStore = makeStore(true);
    const store = currentStore;
    seedPub(store, ASK, { network: 'solana', acceptedCount: 2 });
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(75), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(75) });
    expect(res.status).to.equal(200);
    expect(stateOf(store, ASK).value).to.deep.include({ origin: 'adopted', status: 'open', seats: 2, budget: 2 });
    expect(store.db.docs.get(`asks/${ASK}`).data).to.deep.include({ acceptedCount: 1, network: 'base' });
  });

  it('legacy: the same answer already paid with another verified hash is 409 already_accepted and that payout gets recorded', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedAnswer(store, ANSWER_1, ASK, PAYEE, { accepted: true, payoutTxHash: hashOf(80) });
    onChain(hashOf(80), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 2 }]);
    onChain(hashOf(81), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 3 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(81) });
    expect(res.status).to.equal(409);
    expect(res.body).to.deep.include({ code: 'already_accepted', payoutTxHash: hashOf(80) });
    expect(recordOf(store, ASK, ANSWER_1).value.txHash).to.equal(hashOf(80));
  });

  it('legacy: a genuine use of the same log on another Ask wins the log, and is recorded even though ours is refused', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedPub(store, ASK_2, { budget: 1, seats: 1 });
    seedAnswer(store, ANSWER_OTHER, ASK_2, PAYEE, { accepted: true, payoutTxHash: hashOf(90) }, ANSWERED_AT - 5000);
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(90), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(90) });
    expect(res.status).to.equal(409);
    expect(res.body.code).to.equal('payout_already_used');
    expect(recordOf(store, ASK_2, ANSWER_OTHER).value).to.deep.include({ logIndex: 1, askId: ASK_2 });
    expect(recordOf(store, ASK, ANSWER_1).kind).to.equal('absent');
  });

  it('legacy: a browser cannot pre-squat a hash with an unverifiable accepted flag', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedPub(store, ASK_2, { author: STRANGER, budget: 1, seats: 1 });
    // Podrobka: odpowiedz PAYEE na cudzym Asku oznaczona naszym hashem.
    seedAnswer(store, ANSWER_OTHER, ASK_2, PAYEE, { accepted: true, payoutTxHash: hashOf(91) }, ANSWERED_AT - 5000);
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(91), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(91) });
    expect(res.status).to.equal(200);
    expect(recordOf(store, ASK_2, ANSWER_OTHER).kind).to.equal('absent');
  });
});

/* ------------------------------------------------------------------ */
/*  GRANICA STAREGO SWIATA (przeglad: pieniadze + auth)                */
/* ------------------------------------------------------------------ */

describe('asks legacy cutoff: a mirror-only accept after the cutoff never binds a payout', () => {
  // Aski (NOW-2h) i odpowiedzi (NOW-1h) sa sprzed granicy, wyplata (NOW-30min) po niej.
  const CUTOFF = NOW - 2400_000;
  const BEFORE_CUTOFF_SEC = Math.floor((ANSWERED_AT + 60_000) / 1000);
  const FLIPPED_AT = NOW - 60_000;

  beforeEach(() => {
    resetWorld();
    currentStore.legacyCutoffMs = CUTOFF;
  });

  function flip(store: any, answerId: string, hash: string, at = FLIPPED_AT) {
    const stored = store.db.docs.get(`askAnswers/${answerId}`);
    stored.data = { ...stored.data, accepted: true, payoutTxHash: hash };
    stored.updateTime = at;
  }

  it('a third party pinning the author\'s fresh payout to another answer of the same payee does not steal it', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedPub(store, ASK_2, { budget: 1, seats: 1 });
    seedAnswer(store, ANSWER_OTHER, ASK_2, PAYEE, {}, ANSWERED_AT - 5000);
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(95), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    // Przed zapisem przyjecia autora ktos przestawia odpowiedz PAYEE na ASK_2.
    flip(store, ANSWER_OTHER, hashOf(95));
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(95) });
    expect(res.status).to.equal(200);
    expect(recordOf(store, ASK, ANSWER_1).value).to.deep.include({ txHash: hashOf(95), logIndex: 1 });
    expect(recordOf(store, ASK_2, ANSWER_OTHER).kind).to.equal('absent');
    expect(registryOf(store, hashOf(95), 1).value).to.deep.include({ askId: ASK, answerId: ANSWER_1 });
  });

  it('same answer flipped to an older author->payee transfer after the cutoff: the real payout is recorded (no 409)', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    // Stary przelew autor -> PAYEE (np. napiwek) sprzed granicy, po odpowiedzi.
    onChain(hashOf(96), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 4 }], BEFORE_CUTOFF_SEC);
    onChain(hashOf(97), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 5 }]);
    flip(store, ANSWER_1, hashOf(96));
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(97) });
    expect(res.status).to.equal(200);
    expect(recordOf(store, ASK, ANSWER_1).value.txHash).to.equal(hashOf(97));
    expect(registryOf(store, hashOf(96), 4).kind).to.equal('absent');
  });

  it('a genuine accept from before the cutoff still counts (409 already_accepted, recorded)', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedAnswer(store, ANSWER_1, ASK, PAYEE, { accepted: true, payoutTxHash: hashOf(98) });
    onChain(hashOf(98), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 2 }], BEFORE_CUTOFF_SEC);
    onChain(hashOf(99), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 3 }]);
    const res = await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(99) });
    expect(res.status).to.equal(409);
    expect(res.body).to.deep.include({ code: 'already_accepted', payoutTxHash: hashOf(98) });
    expect(recordOf(store, ASK, ANSWER_1).value.txHash).to.equal(hashOf(98));
  });

  it('resolve does not count a mirror-only accept flipped after the cutoff', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    onChain(hashOf(96), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 4 }], BEFORE_CUTOFF_SEC);
    flip(store, ANSWER_1, hashOf(96));
    const res = await resolve(ASK);
    expect(res.status).to.equal(409);
    expect(res.body.code).to.equal('nothing_accepted');
    expect(recordOf(store, ASK, ANSWER_1).kind).to.equal('absent');
    expect(stateOf(store, ASK).kind).to.equal('absent');
  });

  it('verifyLegacyAcceptance: weak with mirror_after_cutoff / payout_after_cutoff, transfer when both are earlier', async () => {
    const store = currentStore;
    onChain(hashOf(96), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 4 }], BEFORE_CUTOFF_SEC);
    onChain(hashOf(97), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 5 }]);
    const ctx = { askId: ASK, author: AUTHOR, perAnswerUnits: RATE, escrow: null, legacyCutoffMs: store.legacyCutoffMs };
    const row = (hash: string, updateTimeMs: number) => ({
      id: ANSWER_1,
      raw: { askId: ASK, author: PAYEE, accepted: true, payoutTxHash: hash },
      createTimeMs: ANSWERED_AT,
      updateTimeMs,
    });
    expect(await askStore.verifyLegacyAcceptance(ctx, row(hashOf(96), ANSWERED_AT + 90_000))).to.deep.include({ kind: 'transfer' });
    expect(await askStore.verifyLegacyAcceptance(ctx, row(hashOf(96), FLIPPED_AT))).to.deep.include({
      kind: 'weak',
      reason: 'mirror_after_cutoff',
    });
    expect(await askStore.verifyLegacyAcceptance(ctx, row(hashOf(97), ANSWERED_AT + 90_000))).to.deep.include({
      kind: 'weak',
      reason: 'payout_after_cutoff',
    });
    // Brak updateTime (Infinity) = zamknieto.
    expect(await askStore.verifyLegacyAcceptance(ctx, row(hashOf(96), Number.POSITIVE_INFINITY))).to.deep.include({ kind: 'weak' });
  });

  it('an unsealed Ask document created after the cutoff reads as unverified; one from before stays legacy', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedPub(store, ASK_2);
    store.db.docs.get(`asks/${ASK_2}`).createTime = NOW - 60_000;
    expect((await askStore.readAskBundle(store, ASK)).view.trust).to.equal('legacy');
    expect((await askStore.readAskBundle(store, ASK_2)).view.trust).to.equal('unverified');
    // Ze stanem - zawsze wedlug pieczeci, niezaleznie od createTime.
    seedState(store, ASK_2);
    expect((await askStore.readAskBundle(store, ASK_2)).view.trust).to.equal('sealed');
  });
});

/* ------------------------------------------------------------------ */
/*  RESOLVE                                                            */
/* ------------------------------------------------------------------ */

describe('asks route resolve', () => {
  beforeEach(resetWorld);

  it('rejects bad ids (400), no session (401), strangers (403) and escrowed Asks (409)', async () => {
    expect((await resolve('abc/sealed/state')).status).to.equal(400);
    expect((await resolve(ASK, null)).status).to.equal(401);
    const store = currentStore;
    seedPub(store, ASK);
    seedState(store, ASK);
    expect((await resolve(ASK, STRANGER)).status).to.equal(403);
    seedPub(store, ASK_2, { funding: 'escrowed' });
    const escrowed = await resolve(ASK_2);
    expect(escrowed.status).to.equal(409);
    expect(escrowed.body.code).to.equal('use_escrow_resolve');
  });

  it('a zero-answer Ask resolves: sealed resolved/author and a repaired mirror', async () => {
    const store = currentStore;
    seedPub(store, ASK, { answerCount: 5 }); // podbity licznik nie blokuje
    seedState(store, ASK);
    const res = await resolve(ASK);
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.include({ status: 'resolved', acceptedCount: 0, answerCount: 0, unsealed: true });
    expect(stateOf(store, ASK).value).to.deep.include({ status: 'resolved', resolveKind: 'author' });
    expect(store.db.docs.get(`asks/${ASK}`).data).to.deep.include({ status: 'resolved', answerCount: 0, acceptedCount: 0 });
    expect((await resolve(ASK)).body.code).to.equal('already_resolved');
  });

  it('answers with nothing accepted, or only a devtools-flipped flag: 409 nothing_accepted and nothing written', async () => {
    const store = currentStore;
    seedPub(store, ASK, { acceptedCount: 2 }); // podbity licznik nie pomaga
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    seedAnswer(store, ANSWER_2, ASK, PAYEE_2, { accepted: true, payoutTxHash: hashOf(100) });
    const res = await resolve(ASK);
    expect(res.status).to.equal(409);
    expect(res.body).to.deep.include({ code: 'nothing_accepted', answerCount: 2 });
    expect(stateOf(store, ASK).kind).to.equal('absent');
    expect(store.db.commits).to.equal(0);
  });

  it('after a real accept it resolves and counts only records', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedState(store, ASK);
    seedAnswer(store, ANSWER_1, ASK, PAYEE);
    seedAnswer(store, ANSWER_2, ASK, PAYEE_2, { accepted: true, payoutTxHash: hashOf(100) });
    onChain(hashOf(101), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 1 }]);
    expect((await accept(ASK, { answerId: ANSWER_1, payoutTxHash: hashOf(101) })).status).to.equal(200);
    const res = await resolve(ASK);
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.include({ acceptedCount: 1, answerCount: 2 });
  });

  it('legacy Ask: a forged public "expired" does not block, and a genuine earlier acceptance is recorded', async () => {
    const store = currentStore;
    seedPub(store, ASK, { status: 'expired' });
    seedAnswer(store, ANSWER_1, ASK, PAYEE, { accepted: true, payoutTxHash: hashOf(110) });
    onChain(hashOf(110), [{ from: AUTHOR, to: PAYEE, value: RATE, logIndex: 7 }]);
    const res = await resolve(ASK);
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.include({ acceptedCount: 1, answerCount: 1 });
    expect(recordOf(store, ASK, ANSWER_1).value).to.deep.include({ logIndex: 7, txHash: hashOf(110) });
    expect(stateOf(store, ASK).value).to.deep.include({ origin: 'adopted', status: 'resolved' });
    expect(store.db.docs.get(`asks/${ASK}`).data.status).to.equal('resolved');
  });

  it('an RPC outage while checking an old acceptance is 503, not "nothing accepted"', async () => {
    const store = currentStore;
    seedPub(store, ASK);
    seedAnswer(store, ANSWER_1, ASK, PAYEE, { accepted: true, payoutTxHash: hashOf(120) });
    chain.failures.set(hashOf(120), 'rpc_error');
    const res = await resolve(ASK);
    expect(res.status).to.equal(503);
    expect(res.body.code).to.equal('chain_unavailable');
  });

  it('a legacy Ask whose public doc says resolved stays refused (the reseal decides)', async () => {
    const store = currentStore;
    seedPub(store, ASK, { status: 'resolved' });
    expect((await resolve(ASK)).body.code).to.equal('already_resolved');
    expect(stateOf(store, ASK).kind).to.equal('absent');
  });
});
});
