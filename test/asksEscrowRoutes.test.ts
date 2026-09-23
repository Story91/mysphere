export {};

// Trasy escrow Askow: POST /api/asks/[id]/escrow-resolve i /escrow-expire,
// wolane jak przez Nexta (NextRequest -> POST), na atrapie Firestore w pamieci
// i na logach zakodowanych viem-em. Zadnego RPC i zadnej produkcyjnej bazy:
// - openAskStore podmieniamy na magazyn z atrapa (reszta askStore jest prawdziwa),
// - '../../escrowProof' (paragon, escrowFor) i '../../identity' (sesja)
//   podmieniamy w Module._load tylko na czas ladowania tras,
// - powiadomienia (kliencki SDK Firebase) - tak samo.
// Runner: scripts/test-asks-seals.cjs (podmienia 'server-only').
const Module = require('node:module');
const { expect } = require('chai');
const { encodeAbiParameters, encodeEventTopics, getAddress } = require('viem');
const { NextRequest } = require('next/server');
const {
  ASK_ESCROW_ABI,
  answerIdToBytes32,
  escrowDeployment,
  escrowKeyFor,
} = require('../app/utils/asks/escrow');
const {
  deriveAskSealKeys,
  readAcceptance,
  readRegistry,
  readSealedState,
  sealAcceptanceDoc,
  sealStateDoc,
  transferAcceptance,
} = require('../app/utils/asks/askSealCore');
const { legacyEscrowFromChain } = require('../app/utils/asks/escrowProofCore');

/* ------------------------------------------------------------------ */
/*  Podmiany zaleznosci tras                                           */
/* ------------------------------------------------------------------ */

let session: string | null = null;
const receipts = new Map<string, any>();
let rpcDown = false;
let legacyOnchain: any = null;
let legacyThrows = false;
const legacyCalls: Array<{ author: string; askId: string }> = [];
const notified: any[] = [];

const ESCROW_CHAIN_ID = 8453;
const CONTRACT = escrowDeployment(ESCROW_CHAIN_ID).address as string;
const CONTRACT_L = CONTRACT.toLowerCase();

const escrowProofStub = {
  ESCROW_CHAIN_ID,
  readEscrowReceipt: async (hash: string) => {
    if (rpcDown) return { ok: false, code: 'rpc_error', error: 'Could not read the transaction from Base. Retry in a moment.' };
    return receipts.get(hash.toLowerCase()) ?? { ok: false, code: 'tx_not_found', error: 'not found' };
  },
  // Ten sam kontrakt co prawdziwy proveLegacyEscrow: escrowFor -> legacyEscrowFromChain.
  proveLegacyEscrow: async (pub: Record<string, any>, author: string, askId: string) => {
    legacyCalls.push({ author, askId });
    if (legacyThrows) throw new Error('escrowFor read failed');
    if (!legacyOnchain?.funded) return { funded: false, onchain: legacyOnchain };
    const legacy = legacyEscrowFromChain(pub, legacyOnchain, {
      chainId: ESCROW_CHAIN_ID,
      contract: CONTRACT,
      verifiedFundTxHash: null,
    });
    if (!legacy) return { funded: false, onchain: legacyOnchain };
    return { funded: true, escrow: legacy.escrow, anomalies: legacy.anomalies, onchain: legacyOnchain };
  },
};

const originalLoad = Module._load;
Module._load = function load(request: string, ...rest: any[]) {
  if (request === '../../escrowProof') return escrowProofStub;
  if (request === '../../identity') return { sessionAddress: () => session };
  if (typeof request === 'string' && request.endsWith('/friends/notifications')) {
    return { notifyAskPayout: async (params: any) => void notified.push(params) };
  }
  return originalLoad.call(this, request, ...rest);
};
const askStore = require('../app/api/asks/askStore');
const resolveRoute = require('../app/api/asks/[id]/escrow-resolve/route');
const expireRoute = require('../app/api/asks/[id]/escrow-expire/route');
Module._load = originalLoad;

let currentStore: any = null;
askStore.openAskStore = async () => currentStore;

/* ------------------------------------------------------------------ */
/*  Atrapa Firestore (ta sama co w test/asksStore.test.ts)             */
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
/*  Dane (census z 2026-09-23: jedyny Ask escrow na Base)              */
/* ------------------------------------------------------------------ */

const ASK_ID = 'mGlRpEtdsvBfG7O8jHjd';
const ANSWER_ID = 'EDXl12VbGzece55mcSNp';
const ANSWER_2 = 'secondAnswer00000002';
const AUTHOR = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const AUTHOR_L = AUTHOR.toLowerCase();
const WINNER = '0xDf1e757062D7E6ef19BAb6D6B1aa6f9fA44a09Eb';
const WINNER_L = WINNER.toLowerCase();
const OTHER = '0x2222222222222222222222222222222222222222';
const IMPOSTOR = '0x3333333333333333333333333333333333333333';
const KEY = escrowKeyFor(AUTHOR, ASK_ID);
const OTHER_KEY = escrowKeyFor(OTHER, ASK_ID);

const FUND_TX = `0x${'ce'.repeat(32)}`;
const RESOLVE_TX = `0x${'dd'.repeat(32)}`;
const EXPIRE_TX = `0x${'ee'.repeat(32)}`;
const OTHER_TX = `0x${'ab'.repeat(32)}`;

const DEADLINE_SEC = 1786468085n;
const DEADLINE_MS = 1786468085839;

const STATE_PATH = `asks/${ASK_ID}/sealed/state`;
const ACCEPT_PATH = `asks/${ASK_ID}/acceptances/${ANSWER_ID}`;
const regPath = (tx: string, logIndex: number) => `askAnswerContent/_registry/payouts/8453:${tx}:${logIndex}`;

function makeStore(enforce = false): any {
  const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'escrow-routes-test-secret' });
  return { db: new FakeDb(), keys, key: keys.current, enforce, legacyCutoffMs: Number.POSITIVE_INFINITY, FieldValue: FakeFieldValue };
}

function seedPub(store: any, overrides: Record<string, unknown> = {}) {
  store.db.docs.set(`asks/${ASK_ID}`, {
    data: {
      author: AUTHOR,
      question: 'Which chain should I launch on?',
      budget: 5,
      seats: 1,
      perAnswer: 5,
      token: 'USDC',
      network: 'base',
      deadline: DEADLINE_MS,
      createdAt: 1786208890753,
      status: 'open',
      funding: 'escrowed',
      answerCount: 1,
      acceptedCount: 0,
      escrowTxHash: FUND_TX,
      escrowChainId: 8453,
      ...overrides,
    },
    createTime: 1786208890753,
  });
}

const sealedEscrow = (overrides: Record<string, unknown> = {}) => ({
  chainId: 8453,
  contract: CONTRACT_L,
  fundTxHash: FUND_TX,
  perAnswerUnits: '5000000',
  seats: 1,
  deadlineSec: DEADLINE_SEC.toString(),
  source: 'fund-log',
  ...overrides,
});

function sealState(store: any, overrides: Record<string, unknown> = {}) {
  const state = {
    v: 1,
    askId: ASK_ID,
    author: AUTHOR_L,
    funding: 'escrowed',
    token: 'USDC',
    network: 'base',
    budget: 5,
    seats: 1,
    deadline: DEADLINE_MS,
    origin: 'session',
    escrow: sealedEscrow(),
    status: 'open',
    resolvedAt: null,
    resolveKind: null,
    resolveTxHash: null,
    expiredTxHash: null,
    expiredLogIndex: null,
    ...overrides,
  };
  store.db.docs.set(STATE_PATH, { data: sealStateDoc(store.key, state), createTime: 1 });
}

function seedAnswer(store: any, id = ANSWER_ID, author = WINNER_L, overrides: Record<string, unknown> = {}) {
  store.db.docs.set(`askAnswers/${id}`, {
    data: { askId: ASK_ID, author, createdAt: 1786300000000, accepted: false, payoutTxHash: null, ...overrides },
    createTime: 1786300000000,
  });
}

/** Jeden log zdarzenia escrow: topics z viem, dane = pola nieindeksowane. */
function escrowLog(eventName: string, args: Record<string, unknown>, logIndex: number, address = CONTRACT) {
  const event = ASK_ESCROW_ABI.find((item: any) => item.type === 'event' && item.name === eventName);
  const indexed = event.inputs.filter((input: any) => input.indexed);
  const plain = event.inputs.filter((input: any) => !input.indexed);
  const topicArgs: Record<string, unknown> = {};
  for (const input of indexed) topicArgs[input.name] = args[input.name];
  return {
    address,
    topics: encodeEventTopics({ abi: ASK_ESCROW_ABI, eventName, args: topicArgs }),
    data: encodeAbiParameters(
      plain.map((input: any) => ({ type: input.type })),
      plain.map((input: any) => args[input.name])
    ),
    logIndex,
  };
}

const award = (overrides: Record<string, unknown> = {}, logIndex = 355, address = CONTRACT) =>
  escrowLog('SeatAwarded', { key: KEY, recipient: WINNER, answerRef: answerIdToBytes32(ANSWER_ID), amount: 5000000n, ...overrides }, logIndex, address);
const resolvedLog = (overrides: Record<string, unknown> = {}, logIndex = 356, address = CONTRACT) =>
  escrowLog('AskResolved', { key: KEY, author: AUTHOR, seatsAwarded: 1, refundToAuthor: 0n, ...overrides }, logIndex, address);
const expiredLog = (overrides: Record<string, unknown> = {}, logIndex = 12, address = CONTRACT) =>
  escrowLog('AskExpired', { key: KEY, author: AUTHOR, refundToAuthor: 4875000n, fee: 125000n, ...overrides }, logIndex, address);

function setReceipt(txHash: string, logs: any[]) {
  receipts.set(txHash, { ok: true, txHash, logs, blockNumber: 49871236n, blockTimeSec: 1786400000 });
}

async function call(route: any, id: string, body: unknown) {
  const request = new NextRequest(`http://localhost/api/asks/${encodeURIComponent(id)}/x`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const response = await route.POST(request, { params: { id } });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const stateOf = (store: any) => readSealedState(store.keys, ASK_ID, store.db.docs.get(STATE_PATH)?.data ?? null);
const pubOf = (store: any) => store.db.docs.get(`asks/${ASK_ID}`)?.data;

function reset() {
  session = AUTHOR;
  receipts.clear();
  rpcDown = false;
  legacyOnchain = null;
  legacyThrows = false;
  legacyCalls.length = 0;
  notified.length = 0;
  currentStore = makeStore();
}

/* ------------------------------------------------------------------ */
/*  escrow-resolve                                                     */
/* ------------------------------------------------------------------ */

describe('asks route: escrow-resolve', () => {
  beforeEach(reset);

  it('refuses a path-injected id before touching the store', async () => {
    currentStore = null;
    const result = await call(resolveRoute, `${ASK_ID}/sealed/state`, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(400);
    expect(result.body.code).to.equal('invalid_id');
    expect(result.headers.get('cache-control')).to.equal('no-store, private');
  });

  it('401 without a session, 400 without a hash, 503 without the store', async () => {
    session = null;
    expect((await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX })).body.code).to.equal('session_required');
    session = AUTHOR;
    expect((await call(resolveRoute, ASK_ID, { txHash: 'nope' })).body.code).to.equal('tx_hash_required');
    expect((await call(resolveRoute, ASK_ID, '{not json')).status).to.equal(400);
    currentStore = null;
    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(503);
    expect(result.body.code).to.equal('store_unavailable');
  });

  it('records the census award as a sealed record, closes the Ask and notifies once', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store);
    seedAnswer(store);
    setReceipt(RESOLVE_TX, [award(), resolvedLog()]);

    // Hash wielkimi literami - trasa i tak zapisuje go malymi.
    const first = await call(resolveRoute, ASK_ID, { txHash: `0x${'DD'.repeat(32)}` });
    expect(first.status).to.equal(200);
    expect(first.body).to.deep.include({
      askId: ASK_ID,
      status: 'resolved',
      txHash: RESOLVE_TX,
      seatsAwarded: 1,
      acceptedCount: 1,
      seats: 1,
      unsealed: true,
    });
    expect(first.body.recorded).to.deep.equal([ANSWER_ID]);
    expect(first.body.alreadyAccepted).to.deep.equal([]);
    expect(first.body.unmatched).to.deep.equal([]);
    expect(first.body.conflicts).to.deep.equal([]);

    const record = readAcceptance(store.keys, ASK_ID, ANSWER_ID, store.db.docs.get(ACCEPT_PATH).data);
    expect(record.kind).to.equal('valid');
    expect(record.value).to.deep.include({
      kind: 'escrow-seat',
      payee: WINNER_L,
      from: CONTRACT_L,
      txHash: RESOLVE_TX,
      logIndex: 355,
      units: '5000000',
      chainId: 8453,
    });
    const registry = readRegistry(store.keys, `8453:${RESOLVE_TX}:355`, store.db.docs.get(regPath(RESOLVE_TX, 355)).data);
    expect(registry.kind).to.equal('valid');
    expect(registry.value).to.deep.include({ askId: ASK_ID, answerId: ANSWER_ID, kind: 'escrow-seat' });

    const state = stateOf(store);
    expect(state.kind).to.equal('valid');
    expect(state.value).to.deep.include({ status: 'resolved', resolveKind: 'escrow', resolveTxHash: RESOLVE_TX });
    // Czas z bloku (setReceipt: 1786400000 s), nie z zegara serwera.
    expect(state.value.resolvedAt).to.equal(1786400000 * 1000);

    expect(pubOf(store)).to.deep.include({
      status: 'resolved',
      acceptedCount: 1,
      escrowResolveTxHash: RESOLVE_TX,
      escrowChainId: 8453,
      escrowTxHash: FUND_TX,
      funding: 'escrowed',
      token: 'USDC',
      network: 'base',
      resolvedAt: state.value.resolvedAt,
    });
    expect(store.db.docs.get(`askAnswers/${ANSWER_ID}`).data).to.deep.include({
      accepted: true,
      payoutTxHash: RESOLVE_TX,
      payoutLogIndex: 355,
      payoutAmount: 5,
      payoutToken: 'USDC',
      payoutNetwork: 'base',
    });

    expect(notified).to.have.length(1);
    expect(notified[0]).to.deep.equal({
      recipientId: getAddress(WINNER),
      askAuthorId: getAddress(AUTHOR),
      askId: ASK_ID,
      answerId: ANSWER_ID,
      amount: '5.00',
      token: 'USDC',
      delivery: 'escrow',
      txHash: RESOLVE_TX,
    });

    // Ponowienie z tym samym hashem: nic nowego, zadnego drugiego powiadomienia.
    const again = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(again.status).to.equal(200);
    expect(again.body.recorded).to.deep.equal([]);
    expect(again.body.alreadyAccepted).to.deep.equal([ANSWER_ID]);
    expect(again.body.acceptedCount).to.equal(1);
    expect(notified).to.have.length(1);
    expect(stateOf(store).value.resolvedAt).to.equal(state.value.resolvedAt);
  });

  it('a browser-forged accepted flag on the answer does not block the real award', async () => {
    const store = currentStore;
    seedPub(store, { acceptedCount: 1, status: 'resolved' });
    sealState(store);
    seedAnswer(store, ANSWER_ID, WINNER_L, { accepted: true, payoutTxHash: `0x${'00'.repeat(32)}`, payoutAmount: 1e9 });
    setReceipt(RESOLVE_TX, [award(), resolvedLog()]);

    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(200);
    expect(result.body.recorded).to.deep.equal([ANSWER_ID]);
    expect(store.db.docs.get(`askAnswers/${ANSWER_ID}`).data).to.deep.include({ payoutTxHash: RESOLVE_TX, payoutAmount: 5 });
    expect(notified).to.have.length(1);
  });

  it('griefed legacy Ask (junk escrowTxHash, chain 1, forged expired) still resolves from escrowFor', async () => {
    const store = currentStore;
    seedPub(store, { escrowTxHash: `0x${'00'.repeat(32)}`, escrowChainId: 1, status: 'expired', acceptedCount: 1 });
    seedAnswer(store);
    legacyOnchain = { funded: true, open: false, perAnswerUnits: 5000000n, deadlineSec: DEADLINE_SEC, seatsLeft: 0 };
    setReceipt(RESOLVE_TX, [award(), resolvedLog()]);

    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(200);
    expect(result.body.status).to.equal('resolved');
    expect(result.body.recorded).to.deep.equal([ANSWER_ID]);
    expect(legacyCalls).to.deep.equal([{ author: AUTHOR_L, askId: ASK_ID }]);

    const state = stateOf(store);
    expect(state.kind).to.equal('valid');
    expect(state.value).to.deep.include({ origin: 'adopted', status: 'resolved', resolveKind: 'escrow', author: AUTHOR_L });
    expect(state.value.escrow).to.deep.include({ source: 'escrowFor', fundTxHash: null, perAnswerUnits: '5000000', contract: CONTRACT_L });
    expect(pubOf(store)).to.deep.include({ status: 'resolved', escrowChainId: 8453, acceptedCount: 1 });
  });

  it('legacy Ask with no deposit in escrowFor: 409 escrow_unverified, nothing written', async () => {
    const store = currentStore;
    seedPub(store);
    seedAnswer(store);
    legacyOnchain = { funded: false, open: false, perAnswerUnits: 0n, deadlineSec: 0n, seatsLeft: 0 };
    setReceipt(RESOLVE_TX, [award(), resolvedLog()]);

    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(409);
    expect(result.body.code).to.equal('escrow_unverified');
    expect(store.db.docs.has(STATE_PATH)).to.equal(false);
    expect(store.db.docs.has(ACCEPT_PATH)).to.equal(false);

    legacyThrows = true;
    const outage = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(outage.status).to.equal(503);
    expect(outage.body.code).to.equal('escrow_unavailable');
  });

  it('on-resolve Ask: 409 not_escrowed; another wallet: 403 not_ask_author', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store, { funding: 'on-resolve', escrow: null });
    seedAnswer(store);
    setReceipt(RESOLVE_TX, [award(), resolvedLog()]);
    expect((await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX })).body.code).to.equal('not_escrowed');

    sealState(store);
    session = WINNER;
    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(403);
    expect(result.body.code).to.equal('not_ask_author');
    expect(store.db.docs.has(ACCEPT_PATH)).to.equal(false);
  });

  it('events from another contract or another key prove nothing: 409 no_seats_awarded', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store);
    seedAnswer(store);
    setReceipt(RESOLVE_TX, [
      award({}, 355, IMPOSTOR),
      resolvedLog({}, 356, IMPOSTOR),
      award({ key: OTHER_KEY }, 357),
      resolvedLog({ key: OTHER_KEY, author: OTHER }, 358),
    ]);

    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(409);
    expect(result.body.code).to.equal('no_seats_awarded');
    expect(stateOf(store).value.status).to.equal('open');
    expect(store.db.docs.has(ACCEPT_PATH)).to.equal(false);
  });

  it('awards to another wallet or below the rate are unmatched; AskResolved still closes the Ask', async () => {
    const store = currentStore;
    seedPub(store, { budget: 10, seats: 2 });
    sealState(store, { budget: 10, seats: 2, escrow: sealedEscrow({ seats: 2 }) });
    seedAnswer(store);
    seedAnswer(store, ANSWER_2, `0x${'44'.repeat(20)}`);
    setReceipt(RESOLVE_TX, [
      award({ recipient: OTHER }, 355),
      award({ recipient: `0x${'44'.repeat(20)}`, answerRef: answerIdToBytes32(ANSWER_2), amount: 4999999n }, 356),
      resolvedLog({ seatsAwarded: 2 }, 357),
    ]);

    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(200);
    expect(result.body.recorded).to.deep.equal([]);
    expect(result.body.unmatched).to.deep.equal([answerIdToBytes32(ANSWER_ID), answerIdToBytes32(ANSWER_2)]);
    expect(result.body.status).to.equal('resolved');
    expect(result.body.acceptedCount).to.equal(0);
    expect(store.db.docs.has(ACCEPT_PATH)).to.equal(false);
    expect(notified).to.have.length(0);
  });

  it('an answer that already has another sealed record is a conflict, not an overwrite', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store);
    seedAnswer(store);
    const existing = transferAcceptance({
      askId: ASK_ID,
      answerId: ANSWER_ID,
      payee: WINNER_L,
      from: AUTHOR_L,
      txHash: OTHER_TX,
      logIndex: 7,
      units: 5000000n,
    });
    store.db.docs.set(ACCEPT_PATH, { data: sealAcceptanceDoc(store.key, existing), createTime: 1 });
    setReceipt(RESOLVE_TX, [award(), resolvedLog()]);

    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(200);
    expect(result.body.recorded).to.deep.equal([]);
    expect(result.body.conflicts).to.deep.equal([{ answerId: ANSWER_ID, reason: 'answer_already_paid', payoutTxHash: OTHER_TX }]);
    expect(result.body.acceptedCount).to.equal(1);
    expect(readAcceptance(store.keys, ASK_ID, ANSWER_ID, store.db.docs.get(ACCEPT_PATH).data).value.txHash).to.equal(OTHER_TX);
    expect(store.db.docs.has(regPath(RESOLVE_TX, 355))).to.equal(false);
    expect(notified).to.have.length(0);
  });

  it('a broken state seal or a broken acceptance seal: 503 seal_invalid, nothing written', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store);
    seedAnswer(store);
    setReceipt(RESOLVE_TX, [award(), resolvedLog()]);
    const sealed = store.db.docs.get(STATE_PATH);
    store.db.docs.set(STATE_PATH, { ...sealed, data: { ...sealed.data, status: 'resolved' } });

    const broken = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(broken.status).to.equal(503);
    expect(broken.body.code).to.equal('seal_invalid');
    expect(store.db.docs.has(ACCEPT_PATH)).to.equal(false);

    sealState(store);
    store.db.docs.set(`asks/${ASK_ID}/acceptances/${ANSWER_2}`, { data: { v: 1, junk: true, mac: 'x', kid: 'y' }, createTime: 1 });
    const badRecord = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(badRecord.status).to.equal(503);
    expect(badRecord.body.code).to.equal('seal_invalid');
    expect(store.db.docs.has(ACCEPT_PATH)).to.equal(false);
    expect(stateOf(store).value.status).to.equal('open');
  });

  it('RPC outage: 503 retryable; unknown hash: 409 tx_not_found; reverted: 409 tx_reverted', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store);
    seedAnswer(store);

    rpcDown = true;
    const outage = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(outage.status).to.equal(503);
    expect(outage.body).to.deep.include({ code: 'rpc_error', retryable: true });

    rpcDown = false;
    const missing = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(missing.status).to.equal(409);
    expect(missing.body).to.deep.include({ code: 'tx_not_found', retryable: true });

    receipts.set(RESOLVE_TX, { ok: false, code: 'tx_reverted', error: 'reverted' });
    expect((await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX })).body.code).to.equal('tx_reverted');
    expect(stateOf(store).value.status).to.equal('open');
  });

  it('a sealed expired Ask: 409 ask_expired', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store, { status: 'expired', expiredTxHash: EXPIRE_TX, expiredLogIndex: 12 });
    seedAnswer(store);
    setReceipt(RESOLVE_TX, [award(), resolvedLog()]);
    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(409);
    expect(result.body.code).to.equal('ask_expired');
    expect(store.db.docs.has(ACCEPT_PATH)).to.equal(false);
  });

  it('a missing Ask: 404', async () => {
    const result = await call(resolveRoute, ASK_ID, { txHash: RESOLVE_TX });
    expect(result.status).to.equal(404);
    expect(result.body.code).to.equal('ask_not_found');
  });
});

/* ------------------------------------------------------------------ */
/*  escrow-expire                                                      */
/* ------------------------------------------------------------------ */

describe('asks route: escrow-expire', () => {
  beforeEach(() => {
    reset();
    // settleExpired jest bez uprawnien, wiec trasa tez: zadnej sesji.
    session = null;
  });

  it('refuses a path-injected id and a missing hash', async () => {
    expect((await call(expireRoute, `${ASK_ID}/sealed/state`, { txHash: EXPIRE_TX })).body.code).to.equal('invalid_id');
    expect((await call(expireRoute, ASK_ID, {})).body.code).to.equal('tx_hash_required');
    currentStore = null;
    expect((await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX })).body.code).to.equal('store_unavailable');
  });

  it('records a proven expiry without a session; a retry is 200 alreadyRecorded', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store);
    setReceipt(EXPIRE_TX, [expiredLog()]);

    const first = await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX });
    expect(first.status).to.equal(200);
    expect(first.body).to.deep.equal({
      askId: ASK_ID,
      status: 'expired',
      txHash: EXPIRE_TX,
      logIndex: 12,
      alreadyRecorded: false,
      refundToAuthor: '4.88',
      fee: '0.13',
      token: 'USDC',
    });
    const state = stateOf(store);
    expect(state.kind).to.equal('valid');
    expect(state.value).to.deep.include({ status: 'expired', expiredTxHash: EXPIRE_TX, expiredLogIndex: 12, resolvedAt: null });
    expect(pubOf(store)).to.deep.include({
      status: 'expired',
      expiredTxHash: EXPIRE_TX,
      expiredAt: store.db.clock,
      escrowChainId: 8453,
      escrowTxHash: FUND_TX,
    });

    const again = await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX });
    expect(again.status).to.equal(200);
    expect(again.body.alreadyRecorded).to.equal(true);
  });

  it('a hash without AskExpired for this Ask: 409 not_an_expiry, state untouched', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store);
    setReceipt(EXPIRE_TX, [expiredLog({ key: OTHER_KEY, author: OTHER }), expiredLog({}, 13, IMPOSTOR), resolvedLog()]);

    const result = await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX });
    expect(result.status).to.equal(409);
    expect(result.body.code).to.equal('not_an_expiry');
    expect(stateOf(store).value.status).to.equal('open');
  });

  it('a sealed resolved Ask: 409 already_resolved; expired with another hash: 409 already_expired', async () => {
    const store = currentStore;
    seedPub(store);
    sealState(store, { status: 'resolved', resolvedAt: 1786400000000, resolveKind: 'escrow', resolveTxHash: RESOLVE_TX });
    setReceipt(EXPIRE_TX, [expiredLog()]);
    const resolved = await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX });
    expect(resolved.status).to.equal(409);
    expect(resolved.body.code).to.equal('already_resolved');
    expect(stateOf(store).value.status).to.equal('resolved');

    sealState(store, { status: 'expired', expiredTxHash: OTHER_TX, expiredLogIndex: 3 });
    const other = await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX });
    expect(other.status).to.equal(409);
    expect(other.body).to.deep.include({ code: 'already_expired', expiredTxHash: OTHER_TX });
    expect(stateOf(store).value.expiredTxHash).to.equal(OTHER_TX);
  });

  it('legacy Ask: a forged expired status without proof stays unsealed; the proven expiry seals it', async () => {
    const store = currentStore;
    seedPub(store, { status: 'expired', expiredTxHash: `0x${'00'.repeat(32)}` });
    legacyOnchain = { funded: true, open: false, perAnswerUnits: 5000000n, deadlineSec: DEADLINE_SEC, seatsLeft: 0 };
    setReceipt(OTHER_TX, [resolvedLog()]);
    const forged = await call(expireRoute, ASK_ID, { txHash: OTHER_TX });
    expect(forged.status).to.equal(409);
    expect(forged.body.code).to.equal('not_an_expiry');
    expect(store.db.docs.has(STATE_PATH)).to.equal(false);

    setReceipt(EXPIRE_TX, [expiredLog()]);
    const proven = await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX });
    expect(proven.status).to.equal(200);
    const state = stateOf(store);
    expect(state.value).to.deep.include({ origin: 'adopted', status: 'expired', expiredTxHash: EXPIRE_TX, author: AUTHOR_L });
    expect(state.value.escrow.source).to.equal('escrowFor');
    expect(pubOf(store).expiredTxHash).to.equal(EXPIRE_TX);
  });

  it('an on-resolve Ask: 409 not_escrowed; a missing Ask: 404', async () => {
    const store = currentStore;
    setReceipt(EXPIRE_TX, [expiredLog()]);
    expect((await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX })).status).to.equal(404);
    seedPub(store, { funding: 'on-resolve' });
    const result = await call(expireRoute, ASK_ID, { txHash: EXPIRE_TX });
    expect(result.status).to.equal(409);
    expect(result.body.code).to.equal('not_escrowed');
  });
});
