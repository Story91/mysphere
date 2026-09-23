export {};

// Aski na Solanie - tor C: akceptacja z podpisem Solany
// (app/api/asks/solanaAccept.ts) z wstrzyknietym fetchTx, rozgalezienie trasy
// accept po `payoutSignature`, resolve bez starego swiata na Asku SOL.
// Atrapa Firestore w pamieci, zadnego Firebase ani RPC.
// Runner: scripts/test-asks-seals.cjs.
const Module = require('node:module');
const crypto = require('node:crypto');
const { expect } = require('chai');

const askStore = require('../app/api/asks/askStore');
const { saveAnswer } = require('../app/api/asks/answerStore');
const { encodeBase58, linkSolanaWallet, mintChallenge } = require('../app/api/asks/solanaWalletStore');
const { acceptSolanaAnswer } = require('../app/api/asks/solanaAccept');
const { commitSolAsk, validateSolAskDraft } = require('../app/api/asks/draft');
const {
  deriveAskSealKeys,
  payoutEntryFor,
  readAnyAcceptance,
  readAnyRegistry,
  readSealedState,
  registryDoc,
  sealAcceptanceDoc,
  sealStateDoc,
  solanaPayoutRegistryId,
  solanaTransferAcceptance,
} = require('../app/utils/asks/askSealCore');
const { buildAskPayoutMemo } = require('../app/utils/asks/solAmounts');
const { MEMO_PROGRAM_ADDRESS } = require('../app/basechat/Solana/config/solanaChain');
const { SYSTEM_PROGRAM_ADDRESS } = require('../app/basechat/Solana/replies/replyCore');

/* ------------------------------------------------------------------ */
/*  Atrapa Firestore (jak w test/asksStore.test.ts)                    */
/* ------------------------------------------------------------------ */

type Stored = { data: Record<string, any>; createTime: number; updateTime?: number };

const SERVER_TS = { __sentinel: 'serverTimestamp' };
const FakeFieldValue = {
  serverTimestamp: () => SERVER_TS,
  increment: (n: number) => ({ __sentinel: 'increment', n }),
  delete: () => ({ __sentinel: 'delete' }),
};

let idCounter = 0;
const newId = () => `solAccId${String(++idCounter).padStart(12, '0')}`;

class FakeDb {
  docs = new Map<string, Stored>();
  clock = Date.now();

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
/*  Dane i pomocnicze                                                  */
/* ------------------------------------------------------------------ */

const AUTHOR = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
const ANSWERER = '0xdf1e757062d7e6ef19bab6d6b1aa6f9fa44a09eb';
const ANSWERER_2 = '0x1111111111111111111111111111111111111111';
const ANSWERER_3 = '0x3333333333333333333333333333333333333333';
const STRANGER = '0x2222222222222222222222222222222222222222';
const DAY = 24 * 3600_000;
const PER_ANSWER = 10_000_000n; // 0.02 SOL / 2 miejsca

function makeStore(): any {
  const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'solana-accept-test-secret' });
  return { db: new FakeDb(), keys, key: keys.current, enforce: false, legacyCutoffMs: Number.POSITIVE_INFINITY, FieldValue: FakeFieldValue };
}

function solanaKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const x = publicKey.export({ format: 'jwk' }).x as string;
  return { address: encodeBase58(new Uint8Array(Buffer.from(x, 'base64url'))), privateKey };
}

async function link(store: any, evm: string, wallet: any, nowMs = Date.now()) {
  const minted = mintChallenge(store, evm, wallet.address, nowMs);
  const signature = new Uint8Array(crypto.sign(null, Buffer.from(minted.message, 'utf8'), wallet.privateKey));
  return linkSolanaWallet(store, { evm, solana: wallet.address, challenge: minted.challenge, signature, nowMs });
}

/** Losowy podpis transakcji (64 bajty, base58). */
const newSignature = () => encodeBase58(new Uint8Array(crypto.randomBytes(64)));

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
function payoutTx(input: { askId: string; answerId: string; payer: string; payee: string; lamports?: bigint; feePayer?: string; memo?: string; failed?: boolean }) {
  const feePayer = input.feePayer ?? solanaKeypair().address;
  return {
    feePayer,
    accountKeys: [feePayer, input.payer, input.payee, SYSTEM_PROGRAM_ADDRESS, MEMO_PROGRAM_ADDRESS],
    instructions: [
      memoIx(input.memo ?? buildAskPayoutMemo(input.askId, input.answerId), [1]),
      transferIx(1, 2, input.lamports ?? PER_ANSWER),
    ],
    preBalances: [],
    preTokenBalances: [],
    failed: input.failed ?? false,
  };
}

/** Lancuch w pamieci: podpis -> transakcja i czas bloku. */
function makeChain() {
  const txs = new Map<string, { tx: any; blockTimeSec: number | null }>();
  const calls: string[] = [];
  let down = false;
  return {
    txs,
    calls,
    setDown(value: boolean) {
      down = value;
    },
    fetchTx: async (signature: string) => {
      calls.push(signature);
      if (down) throw new Error('rpc down');
      return txs.get(signature) ?? null;
    },
  };
}

async function expectAskError(promise: Promise<unknown>, code: string, status?: number) {
  let caught: any = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected AskError ${code}`).to.not.equal(null);
  expect(caught.code).to.equal(code);
  if (status !== undefined) expect(caught.status).to.equal(status);
  return caught;
}

type World = {
  store: any;
  chain: ReturnType<typeof makeChain>;
  notified: any[];
  askId: string;
  payer: any;
  answers: Array<{ id: string; evm: string; wallet: any }>;
  deps: any;
  state: any;
};

/** Ask SOL 0.02 SOL / 2 miejsca, dwie odpowiedzi z powiazanymi portfelami. */
async function makeWorld(opts: { seats?: number; budget?: string; answerers?: string[] } = {}): Promise<World> {
  const store = makeStore();
  const payer = solanaKeypair();
  await link(store, AUTHOR, payer);
  const draft = validateSolAskDraft({ question: 'Best Solana RPC?', budget: opts.budget ?? '0.02', seats: opts.seats ?? 2 }).value;
  const created = await commitSolAsk(store, { session: AUTHOR, draft, deadline: Date.now() + DAY, cluster: 'devnet' });
  const answers: World['answers'] = [];
  for (const evm of opts.answerers ?? [ANSWERER, ANSWERER_2]) {
    const wallet = solanaKeypair();
    await link(store, evm, wallet);
    const saved = await saveAnswer(store, { askId: created.askId, author: evm, content: `answer from ${evm}` });
    answers.push({ id: saved.answer.id, evm, wallet });
  }
  const chain = makeChain();
  const notified: any[] = [];
  const deps = { fetchTx: chain.fetchTx, cluster: 'devnet', notify: async (p: any) => void notified.push(p) };
  return { store, chain, notified, askId: created.askId, payer, answers, deps, state: created.state };
}

/** Wyplata za odpowiedz `index` zapisana na "lancuchu"; zwraca podpis. */
function pay(world: World, index: number, overrides: Record<string, unknown> = {}, blockTimeSec: number | null = Math.floor(Date.now() / 1000) + 5) {
  const answer = world.answers[index];
  const signature = newSignature();
  world.chain.txs.set(signature, {
    tx: payoutTx({ askId: world.askId, answerId: answer.id, payer: world.payer.address, payee: answer.wallet.address, ...overrides }),
    blockTimeSec,
  });
  return signature;
}

const accept = (world: World, index: number, signature: string, viewer = AUTHOR, deps: any = world.deps) =>
  acceptSolanaAnswer(world.store, { askId: world.askId, answerId: world.answers[index].id, signature, viewer }, deps);

/* ------------------------------------------------------------------ */
/*  acceptSolanaAnswer                                                 */
/* ------------------------------------------------------------------ */

describe('asks SOL accept: acceptSolanaAnswer', () => {
  it('records a verified payout: record, solana: registry entry, mirrors, notification', async () => {
    const world = await makeWorld();
    const signature = pay(world, 0);
    const result = await accept(world, 0, signature);
    const answerId = world.answers[0].id;

    expect(result.status).to.equal(200);
    expect(result.body).to.deep.include({
      askId: world.askId,
      answerId,
      accepted: true,
      payoutTxHash: signature,
      payoutSignature: signature,
      payoutLogIndex: null,
      payoutAmount: 0.01,
      payoutLamports: '10000000',
      payoutToken: 'SOL',
      payoutNetwork: 'solana',
      solanaCluster: 'devnet',
      verification: 'strict',
      acceptedCount: 1,
      seats: 2,
      status: 'open',
    });
    expect(result.body).to.not.have.property('alreadyRecorded');

    const record = readAnyAcceptance(world.store.keys, world.askId, answerId, world.store.db.docs.get(`asks/${world.askId}/acceptances/${answerId}`).data);
    expect(record.kind).to.equal('valid');
    expect(record.value).to.deep.include({ kind: 'sol-transfer', signature, from: world.payer.address, payee: world.answers[0].wallet.address, lamports: '10000000' });

    // Id rejestru z podpisem w ORYGINALNEJ wielkosci liter.
    const regId = solanaPayoutRegistryId(signature);
    const entry = world.store.db.docs.get(`askAnswerContent/_registry/payouts/${regId}`);
    expect(readAnyRegistry(world.store.keys, regId, entry.data).kind).to.equal('valid');

    const mirror = world.store.db.docs.get(`askAnswers/${answerId}`).data;
    expect(mirror).to.deep.include({ accepted: true, payoutTxHash: signature, payoutToken: 'SOL', payoutNetwork: 'solana', payoutAmount: 0.01 });
    expect(mirror).to.not.have.property('payoutLogIndex');
    const pub = world.store.db.docs.get(`asks/${world.askId}`).data;
    expect(pub).to.deep.include({ acceptedCount: 1, token: 'SOL', network: 'solana', status: 'open' });
    expect(JSON.stringify(pub)).to.not.include(world.payer.address);

    expect(world.notified).to.have.length(1);
    expect(world.notified[0]).to.deep.include({ askId: world.askId, answerId, amount: '0.01', token: 'SOL', delivery: 'wallet', txHash: signature });
    expect(world.notified[0].recipientId.toLowerCase()).to.equal(ANSWERER);
  });

  it('retry with the same signature is idempotent; another signature is already_accepted', async () => {
    const world = await makeWorld();
    const signature = pay(world, 0);
    await accept(world, 0, signature);
    const again = await accept(world, 0, signature);
    expect(again.body).to.deep.include({ alreadyRecorded: true, acceptedCount: 1, payoutSignature: signature });
    expect(world.notified).to.have.length(1);
    // Ponowienie nie siega do lancucha - rekord wystarcza.
    expect(world.chain.calls).to.have.length(1);

    const other = pay(world, 0);
    const refused = await expectAskError(accept(world, 0, other), 'already_accepted', 409);
    expect(refused.details.payoutTxHash).to.equal(signature);
  });

  it('the last seat auto-resolves; a resolved Ask refuses further payouts', async () => {
    const world = await makeWorld({ answerers: [ANSWERER, ANSWERER_2, ANSWERER_3] });
    await accept(world, 0, pay(world, 0));
    const second = await accept(world, 1, pay(world, 1));
    expect(second.body).to.deep.include({ acceptedCount: 2, status: 'resolved', autoResolved: true });
    const state = readSealedState(world.store.keys, world.askId, world.store.db.docs.get(`asks/${world.askId}/sealed/state`).data);
    expect(state.value).to.deep.include({ status: 'resolved', resolveKind: 'auto-full' });
    expect(world.store.db.docs.get(`asks/${world.askId}`).data).to.deep.include({ status: 'resolved', token: 'SOL' });

    await expectAskError(accept(world, 2, pay(world, 2)), 'ask_resolved', 409);
  });

  it('no_seats_left when records already fill the Ask (state still open)', async () => {
    const world = await makeWorld({ answerers: [ANSWERER, ANSWERER_2, ANSWERER_3] });
    // Dwa rekordy zapisane bez przejscia stanu (np. stan sprzed auto-full).
    for (const index of [0, 1]) {
      const a = world.answers[index];
      const record = solanaTransferAcceptance({
        askId: world.askId, answerId: a.id, payee: a.wallet.address, from: world.payer.address, cluster: 'devnet', signature: newSignature(), lamports: PER_ANSWER,
      });
      world.store.db.docs.set(`asks/${world.askId}/acceptances/${a.id}`, { data: sealAcceptanceDoc(world.store.key, record), createTime: 1 });
    }
    const refused = await expectAskError(accept(world, 2, pay(world, 2)), 'no_seats_left', 409);
    expect(refused.details).to.deep.include({ acceptedCount: 2, seats: 2 });
  });

  it('one signature pays one answer forever (registry) and a registry entry of this answer is reused', async () => {
    const world = await makeWorld();
    const a0 = world.answers[0];
    const a1 = world.answers[1];
    const signature = pay(world, 1);
    // Wpis rejestru dla tego podpisu nalezy do INNEJ odpowiedzi.
    const foreign = solanaTransferAcceptance({
      askId: world.askId, answerId: a0.id, payee: a0.wallet.address, from: world.payer.address, cluster: 'devnet', signature, lamports: PER_ANSWER,
    });
    const regPath = `askAnswerContent/_registry/payouts/${solanaPayoutRegistryId(signature)}`;
    world.store.db.docs.set(regPath, { data: registryDoc(world.store.key, payoutEntryFor(foreign)), createTime: 1 });
    await expectAskError(accept(world, 1, signature), 'payout_already_used', 409);
    expect(world.store.db.docs.has(`asks/${world.askId}/acceptances/${a1.id}`)).to.equal(false);

    // Wpis nalezacy do TEJ odpowiedzi (rekord skasowany) - przyjecie przechodzi bez drugiego wpisu.
    const own = solanaTransferAcceptance({
      askId: world.askId, answerId: a1.id, payee: a1.wallet.address, from: world.payer.address, cluster: 'devnet', signature, lamports: PER_ANSWER,
    });
    world.store.db.docs.set(regPath, { data: registryDoc(world.store.key, payoutEntryFor(own)), createTime: 1 });
    const result = await accept(world, 1, signature);
    expect(result.body.accepted).to.equal(true);

    // Niewazny wpis rejestru -> 503, nic nie nadpisujemy.
    const s2 = pay(world, 0);
    const badPath = `askAnswerContent/_registry/payouts/${solanaPayoutRegistryId(s2)}`;
    world.store.db.docs.set(badPath, { data: { ...registryDoc(world.store.key, payoutEntryFor({ ...own, signature: s2 })), lamports: '1' }, createTime: 1 });
    await expectAskError(accept(world, 0, s2), 'seal_invalid', 503);
  });

  it('maps every verification failure to its payout_* code', async () => {
    const world = await makeWorld();
    const a0 = world.answers[0];
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ failed: true }, 'payout_failed'],
      [{ memo: 'hello' }, 'payout_memo_missing'],
      [{ memo: buildAskPayoutMemo(world.askId, world.answers[1].id) }, 'payout_wrong_memo'],
      [{ lamports: PER_ANSWER - 1n }, 'payout_too_small'],
      [{ payee: solanaKeypair().address }, 'payout_wrong_recipient'],
      [{ payer: solanaKeypair().address }, 'payout_memo_unsigned'],
    ];
    for (const [overrides, code] of cases) {
      const error = await expectAskError(accept(world, 0, pay(world, 0, overrides)), code, 409);
      expect(error.details.reason).to.be.a('string');
    }
    // Memo podpisane przez platnika, ale przelew od kogos innego.
    const stranger = solanaKeypair().address;
    const signature = newSignature();
    world.chain.txs.set(signature, {
      tx: {
        feePayer: stranger,
        accountKeys: [stranger, world.payer.address, a0.wallet.address, SYSTEM_PROGRAM_ADDRESS, MEMO_PROGRAM_ADDRESS],
        instructions: [memoIx(buildAskPayoutMemo(world.askId, a0.id), [1]), transferIx(0, 2, PER_ANSWER)],
        preBalances: [],
        preTokenBalances: [],
      },
      blockTimeSec: Math.floor(Date.now() / 1000) + 5,
    });
    await expectAskError(accept(world, 0, signature), 'payout_wrong_sender', 409);
    expect(world.store.db.docs.has(`asks/${world.askId}/acceptances/${a0.id}`)).to.equal(false);
  });

  it('timing: unknown block time is retryable, a payout older than the answer is refused', async () => {
    const world = await makeWorld();
    const unknown = await expectAskError(accept(world, 0, pay(world, 0, {}, null)), 'payout_time_unknown', 409);
    expect(unknown.details.retryable).to.equal(true);
    const hourAgo = Math.floor(Date.now() / 1000) - 3600;
    await expectAskError(accept(world, 0, pay(world, 0, {}, hourAgo)), 'payout_predates_answer', 409);
  });

  it('chain: not visible yet is retryable payout_unverified, RPC failure is chain_unavailable', async () => {
    const world = await makeWorld();
    const missing = await expectAskError(accept(world, 0, newSignature()), 'payout_unverified', 409);
    expect(missing.details.retryable).to.equal(true);
    world.chain.setDown(true);
    await expectAskError(accept(world, 0, pay(world, 0)), 'chain_unavailable', 503);
  });

  it('refuses a non-author, a foreign answer, another cluster, an unbound payee and a bad signature', async () => {
    const world = await makeWorld();
    const signature = pay(world, 0);
    await expectAskError(accept(world, 0, signature, STRANGER), 'not_ask_author', 403);
    await expectAskError(
      acceptSolanaAnswer(world.store, { askId: world.askId, answerId: 'missingAnswer0000001', signature, viewer: AUTHOR }, world.deps),
      'answer_not_found',
      404
    );
    const wrongCluster = await expectAskError(accept(world, 0, signature, AUTHOR, { ...world.deps, cluster: 'mainnet-beta' }), 'wrong_cluster', 409);
    expect(wrongCluster.details).to.deep.equal({ askCluster: 'devnet', serverCluster: 'mainnet-beta' });
    await expectAskError(accept(world, 0, 'not-a-signature'), 'invalid_signature', 400);
    // Podpis malymi literami to INNY (albo zaden) podpis - nigdy normalizowany.
    await expectAskError(accept(world, 0, signature.toLowerCase()), signature.toLowerCase() === signature ? 'already_accepted' : 'invalid_signature');

    // Odpowiedz bez powiazanego portfela: wyplata zablokowana.
    const unbound = await saveAnswer(world.store, { askId: world.askId, author: ANSWERER_3, content: 'no wallet' });
    await expectAskError(
      acceptSolanaAnswer(world.store, { askId: world.askId, answerId: unbound.answer.id, signature: newSignature(), viewer: AUTHOR }, world.deps),
      'payee_unbound',
      409
    );
    expect(world.chain.calls).to.deep.equal([]);
  });

  it('a USDC Ask is wrong_rail', async () => {
    const store = makeStore();
    const askId = 'usdcAsk0000000000009';
    const state = {
      v: 1, askId, author: AUTHOR, funding: 'on-resolve', token: 'USDC', network: 'base', budget: 2, seats: 2,
      deadline: Date.now() + DAY, origin: 'session', escrow: null, status: 'open', resolvedAt: null, resolveKind: null,
      resolveTxHash: null, expiredTxHash: null, expiredLogIndex: null,
    };
    store.db.docs.set(`asks/${askId}`, { data: { author: AUTHOR, budget: 2, seats: 2, token: 'SOL', network: 'solana' }, createTime: 1 });
    store.db.docs.set(`asks/${askId}/sealed/state`, { data: sealStateDoc(store.key, state), createTime: 1 });
    await expectAskError(
      acceptSolanaAnswer(store, { askId, answerId: 'anyAnswer00000000001', signature: newSignature(), viewer: AUTHOR }, { fetchTx: async () => null, cluster: 'devnet' }),
      'wrong_rail',
      409
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Trasy: accept (rozgalezienie) i resolve na Asku SOL                */
/* ------------------------------------------------------------------ */

describe('asks SOL accept: routes', () => {
  const session: { address: string | null } = { address: null };
  let currentStore: any = null;
  let acceptRoute: any;
  let resolveRoute: any;
  const saved: Array<[any, string, unknown]> = [];

  before(() => {
    const paths = [require.resolve('../app/api/asks/[id]/accept/route'), require.resolve('../app/api/asks/[id]/resolve/route')];
    for (const p of paths) delete require.cache[p];
    const originalLoad = Module._load;
    Module._load = function load(request: string, ...rest: any[]) {
      if (request === '../../identity') return { sessionAddress: () => session.address };
      if (typeof request === 'string' && request.endsWith('/friends/notifications')) return { notifyAskPayout: async () => undefined };
      return originalLoad.call(this, request, ...rest);
    };
    try {
      acceptRoute = require('../app/api/asks/[id]/accept/route');
      resolveRoute = require('../app/api/asks/[id]/resolve/route');
    } finally {
      Module._load = originalLoad;
      for (const p of paths) delete require.cache[p];
    }
    saved.push([askStore, 'openAskStore', askStore.openAskStore]);
    askStore.openAskStore = async () => currentStore;
  });

  after(() => {
    for (const [target, key, value] of saved.reverse()) target[key] = value;
  });

  async function call(route: any, askId: string, body: unknown, as: string | null = AUTHOR) {
    session.address = as;
    const request = { json: async () => body };
    const response = await route.POST(request, { params: { id: askId } });
    return { status: response.status, body: await response.json() };
  }

  it('a Base hash on a SOL Ask is wrong_rail; a signature on a USDC Ask is wrong_rail', async () => {
    const world = await makeWorld();
    currentStore = world.store;
    const evm = await call(acceptRoute, world.askId, { answerId: world.answers[0].id, payoutTxHash: `0x${'ab'.repeat(32)}` });
    expect(evm).to.deep.include({ status: 409 });
    expect(evm.body.code).to.equal('wrong_rail');

    const store = makeStore();
    currentStore = store;
    const askId = 'usdcAsk0000000000010';
    const state = {
      v: 1, askId, author: AUTHOR, funding: 'on-resolve', token: 'USDC', network: 'base', budget: 2, seats: 2,
      deadline: Date.now() + DAY, origin: 'session', escrow: null, status: 'open', resolvedAt: null, resolveKind: null,
      resolveTxHash: null, expiredTxHash: null, expiredLogIndex: null,
    };
    store.db.docs.set(`asks/${askId}`, { data: { author: AUTHOR, budget: 2, seats: 2, token: 'USDC', network: 'base' }, createTime: 1 });
    store.db.docs.set(`asks/${askId}/sealed/state`, { data: sealStateDoc(store.key, state), createTime: 1 });
    const sol = await call(acceptRoute, askId, { answerId: 'anyAnswer00000000001', payoutSignature: newSignature() });
    expect(sol.status).to.equal(409);
    expect(sol.body.code).to.equal('wrong_rail');

    const empty = await call(acceptRoute, askId, { answerId: 'anyAnswer00000000001', payoutSignature: '' });
    expect(empty.body.code).to.equal('invalid_signature');
  });

  it('resolve on a SOL Ask ignores a forged mirror flag and counts only records', async () => {
    const world = await makeWorld();
    currentStore = world.store;
    // Podrobione `accepted: true` w lustrze - na Asku SOL nie ma starego swiata.
    Object.assign(world.store.db.docs.get(`askAnswers/${world.answers[0].id}`).data, { accepted: true, payoutTxHash: `0x${'cd'.repeat(32)}` });
    const refused = await call(resolveRoute, world.askId, undefined);
    expect(refused.status).to.equal(409);
    expect(refused.body.code).to.equal('nothing_accepted');

    await acceptSolanaAnswer(world.store, { askId: world.askId, answerId: world.answers[1].id, signature: pay(world, 1), viewer: AUTHOR }, world.deps);
    const resolved = await call(resolveRoute, world.askId, undefined);
    expect(resolved.status).to.equal(200);
    expect(resolved.body).to.deep.include({ status: 'resolved', acceptedCount: 1, answerCount: 2 });
    const state = readSealedState(world.store.keys, world.askId, world.store.db.docs.get(`asks/${world.askId}/sealed/state`).data);
    expect(state.value).to.deep.include({ status: 'resolved', resolveKind: 'author', token: 'SOL' });
    expect(world.store.db.docs.get(`asks/${world.askId}`).data).to.deep.include({ status: 'resolved', token: 'SOL', network: 'solana' });
  });
});
