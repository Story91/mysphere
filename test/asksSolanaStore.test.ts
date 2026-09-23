export {};

// Aski na Solanie - tor B: powiazanie portfela (solanaWalletStore.ts), Ask SOL
// w magazynie (createSealedAsk / commitSolAsk, mirrorAsk), zamrazanie odbiorcy
// przy odpowiedzi (answerStore.saveAnswer) i pozniej (freezeAnswerPayee) oraz
// pola SOL w GET /api/asks/[id]/answers. Atrapa Firestore w pamieci, zadnego
// Firebase ani RPC. Runner: scripts/test-asks-seals.cjs.
const Module = require('node:module');
const crypto = require('node:crypto');
const { expect } = require('chai');

const askStore = require('../app/api/asks/askStore');
const answerStore = require('../app/api/asks/answerStore');
const walletStore = require('../app/api/asks/solanaWalletStore');
const { commitSolAsk, validateSolAskDraft } = require('../app/api/asks/draft');
const {
  deriveAskSealKeys,
  readPayee,
  readSealedState,
  readSolanaBinding,
  sealStateDoc,
} = require('../app/utils/asks/askSealCore');
const { verifySolanaMessageSignature } = require('../app/utils/asks/solanaAskCore');

const { createSealedAsk, mirrorAsk, readAskBundle } = askStore;
const { saveAnswer } = answerStore;
const { encodeBase58, freezeAnswerPayee, linkSolanaWallet, mintChallenge, parseBindingSignature, readPayees } = walletStore;

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
const newId = () => `solStoreId${String(++idCounter).padStart(10, '0')}`;

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
const STRANGER = '0x2222222222222222222222222222222222222222';
const DAY = 24 * 3600_000;

function makeStore(): any {
  const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'solana-store-test-secret' });
  return { db: new FakeDb(), keys, key: keys.current, enforce: false, legacyCutoffMs: Number.POSITIVE_INFINITY, FieldValue: FakeFieldValue };
}

/** Para ed25519 i adres Solany (base58 z 32 bajtow klucza publicznego). */
function solanaKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const x = publicKey.export({ format: 'jwk' }).x as string;
  return { address: encodeBase58(new Uint8Array(Buffer.from(x, 'base64url'))), privateKey };
}

const sign = (privateKey: any, message: string) => new Uint8Array(crypto.sign(null, Buffer.from(message, 'utf8'), privateKey));

async function link(store: any, evm: string, wallet: any, nowMs = Date.now()) {
  const minted = mintChallenge(store, evm, wallet.address, nowMs);
  return linkSolanaWallet(store, {
    evm,
    solana: wallet.address,
    challenge: minted.challenge,
    signature: sign(wallet.privateKey, minted.message),
    nowMs,
  });
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

const bindingPath = (evm: string) => `askAnswerContent/_registry/solanaWallets/${evm}`;

function solDraft(budget = '0.02', seats = 2) {
  const check = validateSolAskDraft({ question: 'Which Solana wallet is best?', budget, seats });
  if (!check.ok) throw new Error(JSON.stringify(check.refusal));
  return check.value;
}

async function createSolAsk(store: any, payer: any, opts: { budget?: string; seats?: number } = {}) {
  await link(store, AUTHOR, payer);
  return commitSolAsk(store, {
    session: AUTHOR,
    draft: solDraft(opts.budget ?? '0.02', opts.seats ?? 2),
    deadline: Date.now() + DAY,
    cluster: 'devnet',
  });
}

function seedUsdcAsk(store: any, askId: string) {
  store.db.docs.set(`asks/${askId}`, {
    data: { author: AUTHOR, question: 'Q', budget: 2, seats: 2, token: 'USDC', network: 'base', deadline: Date.now() + DAY, status: 'open', funding: 'on-resolve', answerCount: 0, acceptedCount: 0 },
    createTime: Date.now() - 1000,
  });
  const state = {
    v: 1, askId, author: AUTHOR, funding: 'on-resolve', token: 'USDC', network: 'base', budget: 2, seats: 2,
    deadline: Date.now() + DAY, origin: 'session', escrow: null, status: 'open', resolvedAt: null, resolveKind: null,
    resolveTxHash: null, expiredTxHash: null, expiredLogIndex: null,
  };
  store.db.docs.set(`asks/${askId}/sealed/state`, { data: sealStateDoc(store.key, state), createTime: Date.now() - 1000 });
}

/* ------------------------------------------------------------------ */
/*  Powiazanie portfela                                                */
/* ------------------------------------------------------------------ */

describe('asks SOL store: linking a Solana wallet', () => {
  it('links after an ed25519 signature of the server-rebuilt message; case preserved', async () => {
    const store = makeStore();
    const wallet = solanaKeypair();
    const minted = mintChallenge(store, AUTHOR, wallet.address, Date.now());
    const linked = await linkSolanaWallet(store, {
      evm: AUTHOR.toUpperCase().replace('0X', '0x'),
      solana: wallet.address,
      challenge: minted.challenge,
      signature: sign(wallet.privateKey, minted.message),
      nowMs: Date.now(),
    });
    expect(linked.created).to.equal(true);
    expect(linked.binding).to.deep.include({ evm: AUTHOR, solana: wallet.address, nonce: minted.nonce, issuedAtMs: minted.issuedAtMs });
    const raw = store.db.docs.get(bindingPath(AUTHOR)).data;
    const check = readSolanaBinding(store.keys, AUTHOR, raw);
    expect(check.kind).to.equal('valid');
    expect(check.value.solana).to.equal(wallet.address);
    // Zapisany podpis (base58) weryfikuje sie ponownie - wlasciciel moze to sprawdzic.
    expect(verifySolanaMessageSignature(minted.message, check.value.signature, wallet.address)).to.equal(true);
  });

  it('retrying with the same challenge and signature is idempotent', async () => {
    const store = makeStore();
    const wallet = solanaKeypair();
    const now = Date.now();
    const minted = mintChallenge(store, AUTHOR, wallet.address, now);
    const input = { evm: AUTHOR, solana: wallet.address, challenge: minted.challenge, signature: sign(wallet.privateKey, minted.message), nowMs: now };
    expect((await linkSolanaWallet(store, input)).created).to.equal(true);
    const again = await linkSolanaWallet(store, input);
    expect(again.created).to.equal(false);
    expect(again.binding.solana).to.equal(wallet.address);
  });

  it('refuses a wrong signer, another account, expiry, bad address and a missing signature', async () => {
    const store = makeStore();
    const wallet = solanaKeypair();
    const other = solanaKeypair();
    const now = Date.now();
    const minted = mintChallenge(store, AUTHOR, wallet.address, now);
    const base = { evm: AUTHOR, solana: wallet.address, challenge: minted.challenge, nowMs: now };

    await expectAskError(linkSolanaWallet(store, { ...base, signature: sign(other.privateKey, minted.message) }), 'solana_signature_invalid', 400);
    // Challenge wydany dla innego konta EVM (sesji) nie przechodzi.
    await expectAskError(
      linkSolanaWallet(store, { ...base, evm: ANSWERER, signature: sign(wallet.privateKey, minted.message) }),
      'challenge_invalid',
      400
    );
    // Ten sam challenge przeniesiony na inny portfel.
    await expectAskError(
      linkSolanaWallet(store, { ...base, solana: other.address, signature: sign(other.privateKey, minted.message) }),
      'challenge_invalid',
      400
    );
    await expectAskError(
      linkSolanaWallet(store, { ...base, nowMs: now + 12 * 60_000, signature: sign(wallet.privateKey, minted.message) }),
      'challenge_expired',
      400
    );
    await expectAskError(linkSolanaWallet(store, { ...base, solana: 'not-a-wallet', signature: new Uint8Array(64) }), 'invalid_address', 400);
    await expectAskError(linkSolanaWallet(store, { ...base, signature: null }), 'invalid_signature', 400);
    expect(store.db.docs.has(bindingPath(AUTHOR))).to.equal(false);
  });

  it('a newer link replaces the wallet; an older (intercepted) one is binding_outdated', async () => {
    const store = makeStore();
    const first = solanaKeypair();
    const second = solanaKeypair();
    const t0 = Date.now() - 60_000;
    const old = mintChallenge(store, AUTHOR, first.address, t0);
    await link(store, AUTHOR, second, t0 + 30_000);
    await expectAskError(
      linkSolanaWallet(store, {
        evm: AUTHOR,
        solana: first.address,
        challenge: old.challenge,
        signature: sign(first.privateKey, old.message),
        nowMs: t0 + 40_000,
      }),
      'binding_outdated',
      409
    );
    const after = readSolanaBinding(store.keys, AUTHOR, store.db.docs.get(bindingPath(AUTHOR)).data);
    expect(after.value.solana).to.equal(second.address);

    await link(store, AUTHOR, first, t0 + 50_000);
    expect(readSolanaBinding(store.keys, AUTHOR, store.db.docs.get(bindingPath(AUTHOR)).data).value.solana).to.equal(first.address);
  });

  it('never overwrites a binding whose seal fails', async () => {
    const store = makeStore();
    const wallet = solanaKeypair();
    await link(store, AUTHOR, wallet);
    store.db.docs.get(bindingPath(AUTHOR)).data.solana = solanaKeypair().address; // podrobka bez MAC
    const before = JSON.stringify(store.db.docs.get(bindingPath(AUTHOR)).data);
    await expectAskError(link(store, AUTHOR, solanaKeypair(), Date.now() + 1000), 'seal_invalid', 503);
    expect(JSON.stringify(store.db.docs.get(bindingPath(AUTHOR)).data)).to.equal(before);
  });

  it('parses the signature as base58 or base64, 64 bytes only', () => {
    const bytes = new Uint8Array(64).map((_, i) => (i * 7 + 3) & 0xff);
    expect(Array.from(parseBindingSignature({ signature: encodeBase58(bytes) }))).to.deep.equal(Array.from(bytes));
    expect(Array.from(parseBindingSignature({ signatureBase64: Buffer.from(bytes).toString('base64') }))).to.deep.equal(Array.from(bytes));
    expect(parseBindingSignature({ signature: encodeBase58(bytes.slice(0, 63)) })).to.equal(null);
    expect(parseBindingSignature({ signatureBase64: 'not base64!' })).to.equal(null);
    expect(parseBindingSignature({})).to.equal(null);
  });
});

/* ------------------------------------------------------------------ */
/*  Szkic i zapis Aska SOL                                             */
/* ------------------------------------------------------------------ */

describe('asks SOL store: draft and create', () => {
  it('validateSolAskDraft counts lamports: comma input, minimum 0.005 SOL per answer, ceiling', () => {
    expect(validateSolAskDraft({ question: 'Q', budget: '0,01', seats: 2 }).value).to.deep.equal({
      question: 'Q',
      budgetLamports: '10000000',
      seats: 2,
      perAnswerLamports: '5000000',
    });
    expect(validateSolAskDraft({ question: 'Q', budgetLamports: '15000001', seats: 3 }).value.perAnswerLamports).to.equal('5000000');
    expect(validateSolAskDraft({ question: 'Q', budget: 0.009, seats: 2 }).refusal.body.code).to.equal('per_answer_too_low');
    expect(validateSolAskDraft({ question: 'Q', budget: '1000.000000001', seats: 1 }).refusal.body.code).to.equal('budget_too_high');
    expect(validateSolAskDraft({ question: 'Q', budget: 1e-7, seats: 1 }).refusal.body.code).to.equal('invalid_budget');
    expect(validateSolAskDraft({ question: 'Q', budget: '0.0000000001', seats: 1 }).refusal.body.code).to.equal('invalid_budget');
    expect(validateSolAskDraft({ question: 'Q', budgetLamports: '05', seats: 1 }).refusal.body.code).to.equal('invalid_budget');
    expect(validateSolAskDraft({ question: '', budget: '1', seats: 1 }).refusal.body.code).to.equal('missing_question');
    expect(validateSolAskDraft({ question: 'Q', budget: '1', seats: 0 }).refusal.body.code).to.equal('invalid_seats');
  });

  it('without a linked wallet: solana_wallet_required and nothing is written', async () => {
    const store = makeStore();
    await expectAskError(
      commitSolAsk(store, { session: AUTHOR, draft: solDraft(), deadline: Date.now() + DAY, cluster: 'devnet' }),
      'solana_wallet_required',
      409
    );
    expect([...store.db.docs.keys()].filter((p) => p.startsWith('asks/'))).to.deep.equal([]);
  });

  it('seals the payer from the binding and mirrors SOL without the payer address', async () => {
    const store = makeStore();
    const payer = solanaKeypair();
    const created = await createSolAsk(store, payer, { budget: '0.03', seats: 3 });
    expect(created.state).to.deep.include({ token: 'SOL', network: 'solana', funding: 'on-resolve', origin: 'session', budget: 0.03 });
    expect(created.state.solana).to.deep.equal({ cluster: 'devnet', payer: payer.address, budgetLamports: '30000000', perAnswerLamports: '10000000' });
    expect(readSealedState(store.keys, created.askId, store.db.docs.get(`asks/${created.askId}/sealed/state`).data).kind).to.equal('valid');

    const pub = store.db.docs.get(`asks/${created.askId}`).data;
    expect(pub).to.deep.include({
      author: AUTHOR,
      token: 'SOL',
      network: 'solana',
      budget: 0.03,
      perAnswer: 0.01,
      budgetLamports: '30000000',
      perAnswerLamports: '10000000',
      solanaCluster: 'devnet',
    });
    expect(JSON.stringify(pub)).to.not.include(payer.address);
    expect(created.ask).to.deep.include({ token: 'SOL', network: 'solana', perAnswerLamports: '10000000', solanaCluster: 'devnet' });
  });

  it('createSealedAsk without a rail is the unchanged USDC path', async () => {
    const store = makeStore();
    const created = await createSealedAsk(store, { author: AUTHOR, origin: 'session', question: 'Q', budget: 2, seats: 2, deadline: Date.now() + DAY });
    const pub = store.db.docs.get(`asks/${created.askId}`).data;
    expect(pub).to.deep.include({ token: 'USDC', network: 'base', perAnswer: 1 });
    expect(pub).to.not.have.any.keys('budgetLamports', 'perAnswerLamports', 'solanaCluster');
    expect(created.state).to.not.have.property('solana');
  });

  it('mirrorAsk takes the rail from the state and drops a planted payer', async () => {
    const store = makeStore();
    const payer = solanaKeypair();
    const created = await createSolAsk(store, payer);
    const path = `asks/${created.askId}`;
    Object.assign(store.db.docs.get(path).data, { token: 'USDC', network: 'base', perAnswerLamports: '1', solanaPayer: solanaKeypair().address });
    await store.db.runTransaction(async (tx: any) => mirrorAsk(tx, store, created.askId, { acceptedCount: 0 }, created.state));
    const pub = store.db.docs.get(path).data;
    expect(pub).to.deep.include({ token: 'SOL', network: 'solana', perAnswerLamports: '10000000', budgetLamports: '20000000', solanaCluster: 'devnet', budget: 0.02 });
    expect(pub).to.not.have.property('solanaPayer');

    // Bez stanu (albo ze stanem Base) - dokladnie dzisiejsze USDC/base.
    await store.db.runTransaction(async (tx: any) => mirrorAsk(tx, store, created.askId, { acceptedCount: 1 }));
    expect(store.db.docs.get(path).data).to.deep.include({ token: 'USDC', network: 'base', acceptedCount: 1 });
  });

  it('an unsealed document pretending to be SOL is read as a USDC Ask from its frozen budget', async () => {
    const store = makeStore();
    store.db.docs.set('asks/spoofSol000000000001', {
      data: { author: AUTHOR, question: 'Q', budget: 2, seats: 2, token: 'SOL', network: 'solana', budgetLamports: '1', deadline: Date.now() + DAY, status: 'open', funding: 'on-resolve' },
      createTime: Date.now() - 1000,
    });
    const view = (await readAskBundle(store, 'spoofSol000000000001')).view;
    expect(view).to.deep.include({ trust: 'legacy', token: 'USDC', network: 'base', budget: 2, perAnswer: 1 });
    expect(view).to.not.have.property('budgetLamports');
  });
});

/* ------------------------------------------------------------------ */
/*  Odbiorca odpowiedzi                                                */
/* ------------------------------------------------------------------ */

describe('asks SOL store: freezing the payee', () => {
  it('an answer from a linked wallet freezes its payee in the same transaction', async () => {
    const store = makeStore();
    const payer = solanaKeypair();
    const answererWallet = solanaKeypair();
    const { askId } = await createSolAsk(store, payer);
    await link(store, ANSWERER, answererWallet);
    const saved = await saveAnswer(store, { askId, author: ANSWERER, content: 'Phantom.' });
    expect(saved).to.deep.include({ ok: true, rail: 'sol-solana', payoutAddressBound: true });
    const raw = store.db.docs.get(`asks/${askId}/payees/${saved.answer.id}`).data;
    const payee = readPayee(store.keys, askId, saved.answer.id, raw);
    expect(payee.kind).to.equal('valid');
    expect(payee.value).to.deep.include({ answerer: ANSWERER, payee: answererWallet.address });
    expect((await readPayees(store, askId)).valid.get(saved.answer.id).payee).to.equal(answererWallet.address);
  });

  it('answering without a wallet is allowed; the payout waits (payoutAddressBound false)', async () => {
    const store = makeStore();
    const { askId } = await createSolAsk(store, solanaKeypair());
    const saved = await saveAnswer(store, { askId, author: ANSWERER, content: 'Solflare.' });
    expect(saved).to.deep.include({ ok: true, rail: 'sol-solana', payoutAddressBound: false });
    expect(saved).to.not.have.property('payoutAddressIssue');
    expect(store.db.docs.has(`asks/${askId}/payees/${saved.answer.id}`)).to.equal(false);
  });

  it("the author's own payer wallet is never frozen as a payee", async () => {
    const store = makeStore();
    const payer = solanaKeypair();
    const { askId } = await createSolAsk(store, payer);
    await link(store, ANSWERER, payer); // ten sam portfel pod drugim kontem EVM
    const saved = await saveAnswer(store, { askId, author: ANSWERER, content: 'Self-deal.' });
    expect(saved).to.deep.include({ ok: true, payoutAddressBound: false, payoutAddressIssue: 'payee_is_author_wallet' });
    expect(store.db.docs.has(`asks/${askId}/payees/${saved.answer.id}`)).to.equal(false);
  });

  it('a USDC Ask answer result has no SOL keys at all', async () => {
    const store = makeStore();
    seedUsdcAsk(store, 'usdcAsk0000000000001');
    await link(store, ANSWERER, solanaKeypair());
    const saved = await saveAnswer(store, { askId: 'usdcAsk0000000000001', author: ANSWERER, content: 'USDC.' });
    expect(Object.keys(saved).sort()).to.deep.equal(['answer', 'ok']);
    expect([...store.db.docs.keys()].some((p) => p.includes('/payees/'))).to.equal(false);
  });

  it('freezeAnswerPayee: link later, freeze once, locked after switching wallets', async () => {
    const store = makeStore();
    const payer = solanaKeypair();
    const first = solanaKeypair();
    const second = solanaKeypair();
    const { askId } = await createSolAsk(store, payer);
    const saved = await saveAnswer(store, { askId, author: ANSWERER, content: 'Later.' });
    const answerId = saved.answer.id;
    const input = { askId, answerId, viewer: ANSWERER, nowMs: Date.now() };

    await expectAskError(freezeAnswerPayee(store, input), 'solana_wallet_required', 409);
    await expectAskError(freezeAnswerPayee(store, { ...input, viewer: STRANGER }), 'not_answer_author', 403);
    await expectAskError(freezeAnswerPayee(store, { ...input, answerId: 'missingAnswer0000001' }), 'answer_not_found', 404);

    await link(store, ANSWERER, first, Date.now() - 5000);
    const frozen = await freezeAnswerPayee(store, input);
    expect(frozen.created).to.equal(true);
    expect(frozen.payee.payee).to.equal(first.address);
    expect((await freezeAnswerPayee(store, input)).created).to.equal(false);

    await link(store, ANSWERER, second, Date.now());
    const locked = await expectAskError(freezeAnswerPayee(store, input), 'payee_locked', 409);
    expect(locked.details.payoutAddress).to.equal(first.address);
    expect(readPayee(store.keys, askId, answerId, store.db.docs.get(`asks/${askId}/payees/${answerId}`).data).value.payee).to.equal(first.address);

    // Nowa odpowiedz innego konta z nowym portfelem - dziala normalnie.
    await link(store, ANSWERER_2, solanaKeypair());
    const other = await saveAnswer(store, { askId, author: ANSWERER_2, content: 'Other.' });
    expect(other.payoutAddressBound).to.equal(true);
  });

  it('freezeAnswerPayee refuses USDC Asks, resolved Asks and the payer wallet', async () => {
    const store = makeStore();
    seedUsdcAsk(store, 'usdcAsk0000000000002');
    store.db.docs.set('askAnswers/usdcAnswer0000000001', { data: { askId: 'usdcAsk0000000000002', author: ANSWERER, createdAt: 1 }, createTime: 1 });
    await link(store, ANSWERER, solanaKeypair());
    await expectAskError(
      freezeAnswerPayee(store, { askId: 'usdcAsk0000000000002', answerId: 'usdcAnswer0000000001', viewer: ANSWERER, nowMs: Date.now() }),
      'wrong_rail',
      409
    );

    const payer = solanaKeypair();
    const created = await createSolAsk(store, payer);
    const saved = await saveAnswer(store, { askId: created.askId, author: ANSWERER_2, content: 'Mine.' });
    await link(store, ANSWERER_2, payer);
    await expectAskError(
      freezeAnswerPayee(store, { askId: created.askId, answerId: saved.answer.id, viewer: ANSWERER_2, nowMs: Date.now() }),
      'payee_is_author_wallet',
      409
    );

    const resolved = { ...created.state, status: 'resolved', resolvedAt: Date.now(), resolveKind: 'author' };
    store.db.docs.set(`asks/${created.askId}/sealed/state`, { data: sealStateDoc(store.key, resolved), createTime: 1 });
    await link(store, ANSWERER_2, solanaKeypair(), Date.now() + 1000);
    await expectAskError(
      freezeAnswerPayee(store, { askId: created.askId, answerId: saved.answer.id, viewer: ANSWERER_2, nowMs: Date.now() }),
      'ask_resolved',
      409
    );
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/asks/[id]/answers - pola SOL                              */
/* ------------------------------------------------------------------ */

const session: { address: string | null } = { address: null };
let answersRoute: any;
let currentStore: any = null;

describe('asks SOL store: GET answers', () => {
  const saved: Array<[any, string, unknown]> = [];
  const patch = (target: any, key: string, value: unknown) => {
    saved.push([target, key, target[key]]);
    target[key] = value;
  };

  before(() => {
    const routePath = require.resolve('../app/api/asks/[id]/answers/route');
    delete require.cache[routePath];
    const originalLoad = Module._load;
    Module._load = function load(request: string, ...rest: any[]) {
      if (request === '../../identity') return { sessionAddress: () => session.address };
      return originalLoad.call(this, request, ...rest);
    };
    try {
      answersRoute = require('../app/api/asks/[id]/answers/route');
    } finally {
      Module._load = originalLoad;
      delete require.cache[routePath];
    }
    patch(askStore, 'openAskStore', async () => currentStore);
    patch(answerStore, 'readAnswerContents', async (ids: string[]) => new Map(ids.map((id) => [id, `content ${id}`])));
  });

  after(() => {
    for (const [target, key, value] of saved.reverse()) target[key] = value;
  });

  async function get(askId: string, as: string | null) {
    session.address = as;
    const response = await answersRoute.GET({}, { params: { id: askId } });
    return { status: response.status, body: await response.json() };
  }

  it('the author gets the payer, payee addresses and memos; others only what is theirs', async () => {
    const store = makeStore();
    currentStore = store;
    const payer = solanaKeypair();
    const w1 = solanaKeypair();
    const { askId } = await createSolAsk(store, payer);
    await link(store, ANSWERER, w1);
    const a1 = await saveAnswer(store, { askId, author: ANSWERER, content: 'one' });
    const a2 = await saveAnswer(store, { askId, author: ANSWERER_2, content: 'two' });

    const author = await get(askId, AUTHOR);
    expect(author.status).to.equal(200);
    expect(author.body).to.deep.include({
      rail: 'sol-solana',
      token: 'SOL',
      network: 'solana',
      solanaCluster: 'devnet',
      perAnswerLamports: '10000000',
      solanaPayer: payer.address,
    });
    const byId = (body: any, id: string) => body.answers.find((a: any) => a.id === id);
    expect(byId(author.body, a1.answer.id)).to.deep.include({
      payoutAddress: w1.address,
      payoutAddressBound: true,
      payoutMemo: `mysphere:ask|v1|${askId}|${a1.answer.id}`,
      payoutNetwork: null,
    });
    expect(byId(author.body, a2.answer.id)).to.deep.include({ payoutAddress: null, payoutAddressBound: false });

    const own = await get(askId, ANSWERER);
    expect(own.body).to.not.have.property('solanaPayer');
    expect(byId(own.body, a1.answer.id)).to.deep.include({ payoutAddress: w1.address });
    expect(byId(own.body, a1.answer.id)).to.not.have.property('payoutMemo');

    const stranger = await get(askId, STRANGER);
    expect(stranger.body).to.not.have.property('solanaPayer');
    expect(byId(stranger.body, a1.answer.id)).to.deep.include({ payoutAddress: null, payoutAddressBound: true });
    expect(JSON.stringify(stranger.body)).to.not.include(payer.address);
    expect(JSON.stringify(stranger.body)).to.not.include(w1.address);
  });

  it('a USDC Ask keeps the old response shape (no SOL keys)', async () => {
    const store = makeStore();
    currentStore = store;
    seedUsdcAsk(store, 'usdcAsk0000000000003');
    const saved = await saveAnswer(store, { askId: 'usdcAsk0000000000003', author: ANSWERER, content: 'x' });
    const res = await get('usdcAsk0000000000003', AUTHOR);
    expect(res.status).to.equal(200);
    expect(res.body).to.not.have.any.keys('rail', 'solanaPayer', 'perAnswerLamports', 'solanaCluster');
    expect(Object.keys(res.body.answers[0]).sort()).to.deep.equal(
      ['accepted', 'askId', 'author', 'content', 'createdAt', 'id', 'payoutLogIndex', 'payoutTxHash', 'payoutVerified', 'sealed'].sort()
    );
    expect(res.body.answers[0].id).to.equal(saved.answer.id);
  });
});

