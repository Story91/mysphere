export {};

// Co wolno pokazac o Asku: odslanianie odpowiedzi i "przyjete" w
// GET /api/asks/[id]/answers, lista GET /api/asks i strona /ask/[id]
// (app/utils/asks/askPublicView.ts), plus odczyty z magazynu dla listy i strony
// (app/api/asks/askPublicRead.ts) na atrapie Firestore w pamieci.
// Zadnego polaczenia z Firebase. Runner: scripts/test-asks-seals.cjs.
const { expect } = require('chai');
const view = require('../app/utils/asks/askPublicView');
const { listOpenAsks, listOpenAsksWith, readAskShareWith } = require('../app/api/asks/askPublicRead');
const {
  deriveAskSealKeys,
  effectiveAsk,
  readSealedState,
  sealAcceptanceDoc,
  sealStateDoc,
  transferAcceptance,
} = require('../app/utils/asks/askSealCore');
const { toAsk } = require('../app/utils/asks/askMapping');

const {
  answerPayoutFacts,
  formatShareMoney,
  listingEntry,
  planAnswerThread,
  revealsAllAnswers,
  hasPaidAnswer,
  shareFromView,
  shareFundingNote,
  shareSeatsLabel,
  shareStateLine,
  shareTakesAnswers,
  shareUnchecked,
  uncheckedListingEntry,
} = view;

/* ------------------------------------------------------------------ */
/*  Dane                                                               */
/* ------------------------------------------------------------------ */

const KEYS = deriveAskSealKeys({ ASK_SEAL_SECRET: 'public-view-test-secret-0123456789' });
const OTHER_KEYS = deriveAskSealKeys({ ASK_SEAL_SECRET: 'some-other-deployment-secret-xyz' });

const ASK_ID = 'mGlRpEtdsvBfG7O8jHjd';
const AUTHOR = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
const AUTHOR_CHECKSUM = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const ANSWERER = '0xdf1e757062d7e6ef19bab6d6b1aa6f9fa44a09eb';
const ANSWERER_2 = '0x9dde9b991753aeff62f5d869e873102861cfb5cd';
const STRANGER = '0x1111111111111111111111111111111111111111';
const CONTRACT = '0xd5f65cfbe6a1aa1b6f82cbe0a336ddfcd39a5340';
const FUND_TX = `0x${'ce'.repeat(32)}`;
const PAY_TX = `0x${'43'.repeat(32)}`;
const FORGED_TX = `0x${'ff'.repeat(32)}`;
const NOW = 1_800_000_000_000;

function pubDoc(overrides: Record<string, unknown> = {}) {
  return {
    author: AUTHOR,
    question: 'Where does the Steakhouse vault yield come from?',
    budget: 2,
    seats: 2,
    perAnswer: 1,
    token: 'USDC',
    network: 'base',
    deadline: NOW + 3600_000,
    createdAt: NOW - 60_000,
    status: 'open',
    funding: 'on-resolve',
    answerCount: 2,
    acceptedCount: 0,
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    askId: ASK_ID,
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
}

const ESCROW = {
  chainId: 8453,
  contract: CONTRACT,
  fundTxHash: FUND_TX,
  perAnswerUnits: '1000000',
  seats: 2,
  deadlineSec: String((NOW + 3600_000) / 1000),
  source: 'fund-log',
};

function sealedDoc(overrides: Record<string, unknown> = {}) {
  return sealStateDoc(KEYS.current, state(overrides));
}

/** Widok tak, jak buduje go askStore: publiczny dokument + wynik readSealedState. */
function sealedView(stateOverrides: Record<string, unknown> = {}, pubOverrides: Record<string, unknown> = {}) {
  const check = readSealedState(KEYS, ASK_ID, sealedDoc(stateOverrides));
  expect(check.kind).to.equal('valid');
  return effectiveAsk(ASK_ID, pubDoc(pubOverrides), check, false);
}

function legacyView(pubOverrides: Record<string, unknown> = {}) {
  return effectiveAsk(ASK_ID, pubDoc(pubOverrides), { kind: 'absent' }, false);
}

function unverifiedView(pubOverrides: Record<string, unknown> = {}) {
  return effectiveAsk(ASK_ID, pubDoc(pubOverrides), { kind: 'absent' }, true);
}

function brokenView(pubOverrides: Record<string, unknown> = {}) {
  return effectiveAsk(ASK_ID, pubDoc(pubOverrides), { kind: 'invalid', reason: 'bad_mac' }, false);
}

function record(answerId: string, payee = ANSWERER, logIndex = 7) {
  return transferAcceptance({ askId: ASK_ID, answerId, payee, from: AUTHOR, txHash: PAY_TX, logIndex, units: 1_000_000n });
}

const ROWS = [
  { id: 'answerOne0000000001', raw: { askId: ASK_ID, author: ANSWERER, createdAt: NOW - 30_000, accepted: false, payoutTxHash: null } },
  {
    id: 'answerTwo0000000002',
    // Podrobione z devtools: accepted + hash, bez rekordu przyjecia.
    raw: { askId: ASK_ID, author: ANSWERER_2, createdAt: NOW - 20_000, accepted: true, payoutTxHash: FORGED_TX, payoutLogIndex: 3 },
  },
];

/* ------------------------------------------------------------------ */
/*  Odslanianie i przyjecia                                            */
/* ------------------------------------------------------------------ */

describe('askPublicView - revealsAllAnswers', () => {
  const PAID = new Map([['answerOne0000000001', record('answerOne0000000001')]]);
  const NONE = new Map();

  it('sealed: only a sealed resolved state reveals, a forged public status never does (flag off)', () => {
    expect(revealsAllAnswers(sealedView({}, { status: 'resolved' }), PAID)).to.equal(false);
    expect(revealsAllAnswers(sealedView({ status: 'resolved', resolvedAt: NOW, resolveKind: 'author' }), PAID)).to.equal(true);
    // Stan rozstrzygniety, lustro "open" (np. przestawione z devtools) - dalej odsloniete.
    expect(
      revealsAllAnswers(sealedView({ status: 'resolved', resolvedAt: NOW, resolveKind: 'author' }, { status: 'open' }), PAID)
    ).to.equal(true);
    expect(revealsAllAnswers(sealedView({ status: 'expired' }), PAID)).to.equal(false);
  });

  it('sealed resolved without a paid answer reveals nothing (escrow resolve() to the author\'s own wallets)', () => {
    const escrowResolved = sealedView({
      status: 'resolved',
      resolvedAt: NOW,
      resolveKind: 'escrow',
      resolveTxHash: PAY_TX,
      funding: 'escrowed',
      escrow: ESCROW,
    });
    expect(revealsAllAnswers(escrowResolved, NONE)).to.equal(false);
    // Rekord wyplaty dla samego autora tez nie jest zaplata za odpowiedz.
    const selfPaid = new Map([['answerOne0000000001', record('answerOne0000000001', AUTHOR)]]);
    expect(revealsAllAnswers(escrowResolved, selfPaid)).to.equal(false);
    expect(revealsAllAnswers(escrowResolved, PAID)).to.equal(true);
  });

  it('hasPaidAnswer ignores address case and needs a payee other than the author', () => {
    expect(hasPaidAnswer([], AUTHOR)).to.equal(false);
    expect(hasPaidAnswer([{ payee: AUTHOR }], AUTHOR_CHECKSUM)).to.equal(false);
    expect(hasPaidAnswer([{ payee: AUTHOR }, { payee: ANSWERER }], AUTHOR)).to.equal(true);
  });

  it('legacy keeps today\'s semantics, unverified and broken never reveal', () => {
    expect(revealsAllAnswers(legacyView({ status: 'resolved' }), NONE)).to.equal(true);
    expect(revealsAllAnswers(legacyView({ status: 'open' }), NONE)).to.equal(false);
    expect(revealsAllAnswers(unverifiedView({ status: 'resolved' }), PAID)).to.equal(false);
    expect(revealsAllAnswers(brokenView({ status: 'resolved' }), PAID)).to.equal(false);
  });
});

describe('askPublicView - answerPayoutFacts', () => {
  it('a valid record wins in every trust mode', () => {
    for (const trust of ['sealed', 'legacy', 'unverified', 'broken']) {
      expect(answerPayoutFacts(trust, { accepted: false }, record('answerOne0000000001'))).to.deep.equal({
        accepted: true,
        payoutTxHash: PAY_TX,
        payoutLogIndex: 7,
        payoutVerified: true,
        payoutNetwork: 'base',
      });
    }
  });

  it('sealed and unverified ignore a forged accepted flag and hash', () => {
    for (const trust of ['sealed', 'unverified', 'broken']) {
      expect(answerPayoutFacts(trust, ROWS[1].raw, undefined)).to.deep.equal({
        accepted: false,
        payoutTxHash: null,
        payoutLogIndex: null,
        payoutVerified: false,
        payoutNetwork: null,
      });
    }
  });

  it('legacy shows the answer document as today, marked unverified', () => {
    expect(answerPayoutFacts('legacy', ROWS[1].raw, undefined)).to.deep.equal({
      accepted: true,
      payoutTxHash: FORGED_TX,
      payoutLogIndex: 3,
      payoutVerified: false,
      payoutNetwork: 'base',
    });
    expect(answerPayoutFacts('legacy', { accepted: 'yes', payoutLogIndex: -1 }, undefined)).to.deep.equal({
      accepted: true,
      payoutTxHash: null,
      payoutLogIndex: null,
      payoutVerified: false,
      payoutNetwork: 'base',
    });
  });
});

describe('askPublicView - planAnswerThread', () => {
  const plan = (v: any, viewer: string | null, acceptances = new Map()) =>
    planAnswerThread({ askId: ASK_ID, view: v, rows: ROWS, acceptances, viewer });

  it('a signed-out stranger sees metadata only on an open sealed Ask, even with a forged resolved status', () => {
    const p = plan(sealedView({}, { status: 'resolved' }), null);
    expect(p.status).to.equal('open');
    expect(p.resolved).to.equal(false);
    expect(p.trust).to.equal('sealed');
    expect(p.viewerIsAuthor).to.equal(false);
    expect(p.answers.map((a: any) => a.visible)).to.deep.equal([false, false]);
    // Podrobione accepted przy Asku zapieczetowanym NIE jest przyjete.
    expect(p.answers[1].accepted).to.equal(false);
    expect(p.answers[1].payoutTxHash).to.equal(null);
    expect(p.answers[0]).to.include({ id: 'answerOne0000000001', askId: ASK_ID, author: ANSWERER, createdAt: NOW - 30_000 });
  });

  it('the author (any address case) sees every answer; an answerer sees only their own', () => {
    const asAuthor = plan(sealedView(), AUTHOR_CHECKSUM);
    expect(asAuthor.viewerIsAuthor).to.equal(true);
    expect(asAuthor.answers.every((a: any) => a.visible)).to.equal(true);

    const asAnswerer = plan(sealedView(), ANSWERER.toUpperCase().replace('0X', '0x'));
    expect(asAnswerer.viewerIsAuthor).to.equal(false);
    expect(asAnswerer.answers.map((a: any) => a.visible)).to.deep.equal([true, false]);

    const asStranger = plan(sealedView(), STRANGER);
    expect(asStranger.answers.map((a: any) => a.visible)).to.deep.equal([false, false]);
  });

  it('the sealed author comes from the state, not from the public document', () => {
    const p = plan(sealedView({}, { author: STRANGER }), STRANGER);
    expect(p.viewerIsAuthor).to.equal(false);
    expect(p.answers.map((a: any) => a.visible)).to.deep.equal([false, false]);
  });

  it('a sealed resolved state reveals to everyone and shows acceptances from records only', () => {
    const recs = new Map([['answerOne0000000001', record('answerOne0000000001')]]);
    const p = plan(sealedView({ status: 'resolved', resolvedAt: NOW, resolveKind: 'author' }, { status: 'open' }), null, recs);
    expect(p.status).to.equal('resolved');
    expect(p.resolved).to.equal(true);
    expect(p.answers.map((a: any) => a.visible)).to.deep.equal([true, true]);
    expect(p.answers.map((a: any) => a.accepted)).to.deep.equal([true, false]);
    expect(p.answers[0]).to.include({ payoutTxHash: PAY_TX, payoutLogIndex: 7, payoutVerified: true });
  });

  it('legacy (flag off) behaves as today; unverified (flag on) reveals nothing and shows no acceptances', () => {
    const legacy = plan(legacyView({ status: 'resolved' }), null);
    expect(legacy.trust).to.equal('legacy');
    expect(legacy.resolved).to.equal(true);
    expect(legacy.answers.map((a: any) => a.visible)).to.deep.equal([true, true]);
    expect(legacy.answers[1]).to.include({ accepted: true, payoutTxHash: FORGED_TX, payoutVerified: false });

    const unverified = plan(unverifiedView({ status: 'resolved' }), null);
    expect(unverified.trust).to.equal('unverified');
    expect(unverified.status).to.equal('open');
    expect(unverified.resolved).to.equal(false);
    expect(unverified.answers.map((a: any) => a.visible)).to.deep.equal([false, false]);
    expect(unverified.answers[1].accepted).to.equal(false);

    // Autor Aska bez pieczeci dalej czyta odpowiedzi - pole author jest zamrozone.
    expect(plan(unverifiedView(), AUTHOR).answers.every((a: any) => a.visible)).to.equal(true);
  });

  it('a malformed viewer is no identity', () => {
    const p = plan(sealedView(), 'not-an-address');
    expect(p.viewerIsAuthor).to.equal(false);
    expect(p.answers.map((a: any) => a.visible)).to.deep.equal([false, false]);
  });
});

/* ------------------------------------------------------------------ */
/*  Lista dla agentow                                                  */
/* ------------------------------------------------------------------ */

describe('askPublicView - listingEntry', () => {
  it('a sealed escrowed Ask lists its sealed escrow as verified', () => {
    const entry = listingEntry(
      sealedView({ funding: 'escrowed', escrow: ESCROW }, { funding: 'escrowed', escrowTxHash: FORGED_TX, escrowChainId: 1 })
    );
    expect(entry).to.include({
      id: ASK_ID,
      status: 'open',
      funding: 'escrowed',
      trust: 'sealed',
      escrowVerified: true,
      escrowTxHash: FUND_TX,
      escrowChainId: 8453,
      token: 'USDC',
      network: 'base',
    });
    expect(entry).to.not.have.property('state');
    expect(entry).to.not.have.property('escrow');
  });

  it('omits Asks the seal says are closed, broken ones and unverified ones', () => {
    expect(listingEntry(sealedView({ status: 'resolved', resolvedAt: NOW, resolveKind: 'author' }, { status: 'open' }))).to.equal(null);
    expect(listingEntry(sealedView({ status: 'expired' }, { status: 'open' }))).to.equal(null);
    expect(listingEntry(brokenView())).to.equal(null);
    expect(listingEntry(unverifiedView())).to.equal(null);
  });

  it('legacy: keeps the declared funding, but no escrow hash and escrowVerified false; token forced to USDC on Base', () => {
    const entry = listingEntry(legacyView({ funding: 'escrowed', escrowTxHash: FORGED_TX, escrowChainId: 8453, token: 'ETH', network: 'solana' }));
    expect(entry).to.include({
      trust: 'legacy',
      funding: 'escrowed',
      escrowVerified: false,
      escrowTxHash: null,
      escrowChainId: null,
      escrowResolveTxHash: null,
      token: 'USDC',
      network: 'base',
    });
  });

  it('unchecked entries (no store) carry no verified claims', () => {
    const entry = uncheckedListingEntry(toAsk(ASK_ID, pubDoc({ funding: 'escrowed', escrowTxHash: FORGED_TX, token: 'ETH' })));
    expect(entry).to.include({ trust: 'unchecked', escrowVerified: false, escrowTxHash: null, funding: 'escrowed', token: 'USDC' });
  });
});

/* ------------------------------------------------------------------ */
/*  Strona udostepniania                                               */
/* ------------------------------------------------------------------ */

describe('askPublicView - share page', () => {
  it('formats money like the feed card', () => {
    expect(formatShareMoney(1)).to.equal('$1.00');
    expect(formatShareMoney(0.5, 'USDC')).to.equal('$0.50');
    expect(formatShareMoney(2, 'USDG')).to.equal('2.00 USDG');
    expect(formatShareMoney(Number.NaN)).to.equal('$0.00');
  });

  it('sealed resolved: "Settled", seats from records, escrow link to the sealed deposit', () => {
    const share = shareFromView(
      sealedView(
        { status: 'resolved', resolvedAt: NOW, resolveKind: 'escrow', resolveTxHash: PAY_TX, funding: 'escrowed', escrow: ESCROW },
        { status: 'open', acceptedCount: 2, escrowTxHash: FORGED_TX, funding: 'escrowed' }
      ),
      { valid: 1, invalid: 0 }
    );
    expect(share.trust).to.equal('sealed');
    expect(share.ask.acceptedCount).to.equal(1);
    expect(shareSeatsLabel(share)).to.equal('1 of 2');
    expect(shareStateLine(share, NOW)).to.equal('Settled: the budget has been paid out.');
    expect(shareFundingNote(share)).to.deep.equal({
      kind: 'escrow',
      href: `https://basescan.org/tx/${FUND_TX}`,
      linkLabel: 'Check the deposit',
    });
    expect(shareTakesAnswers(share, NOW)).to.equal(false);
  });

  it('a sealed escrow without a verified fund hash links the contract instead', () => {
    const share = shareFromView(sealedView({ funding: 'escrowed', escrow: { ...ESCROW, fundTxHash: null, source: 'escrowFor' } }), {
      valid: 0,
      invalid: 0,
    });
    expect(shareFundingNote(share)).to.deep.equal({
      kind: 'escrow',
      href: `https://basescan.org/address/${CONTRACT}`,
      linkLabel: 'See the escrow contract',
    });
  });

  it('sealed resolved with no payout record does not claim "Settled"', () => {
    const share = shareFromView(
      sealedView(
        { status: 'resolved', resolvedAt: NOW, resolveKind: 'escrow', resolveTxHash: PAY_TX, funding: 'escrowed', escrow: ESCROW },
        { status: 'resolved', acceptedCount: 2, funding: 'escrowed' }
      ),
      { valid: 0, invalid: 0 }
    );
    expect(share.ask.acceptedCount).to.equal(0);
    expect(shareStateLine(share, NOW)).to.equal('Resolved, but no payout to an answer has been recorded.');
  });

  it('a forged resolved status on a sealed open Ask still reads as open and takes answers', () => {
    const share = shareFromView(sealedView({}, { status: 'resolved', acceptedCount: 2 }), { valid: 0, invalid: 0 });
    expect(shareStateLine(share, NOW)).to.equal('2 of the seats are still open.');
    expect(shareTakesAnswers(share, NOW)).to.equal(true);
    expect(shareFundingNote(share)).to.deep.equal({ kind: 'on-resolve' });
  });

  it('legacy: status as marked, but no "Settled" and no unverified escrow link', () => {
    const resolved = shareFromView(legacyView({ status: 'resolved', funding: 'escrowed', escrowTxHash: FORGED_TX }));
    expect(resolved.trust).to.equal('legacy');
    expect(shareStateLine(resolved, NOW)).to.equal('Marked resolved. Its payouts have not been verified yet.');
    expect(shareFundingNote(resolved)).to.deep.equal({ kind: 'escrow-unverified' });
    expect(resolved.ask.escrowTxHash).to.equal(null);

    const expired = shareFromView(legacyView({ status: 'expired' }));
    expect(shareStateLine(expired, NOW)).to.equal('Marked closed without a payout.');

    const open = shareFromView(legacyView({ acceptedCount: 1 }));
    expect(shareStateLine(open, NOW)).to.equal('1 of the seats are still open.');
    expect(shareSeatsLabel(open)).to.equal('1 of 2');
    expect(shareTakesAnswers(open, NOW)).to.equal(true);
    expect(shareTakesAnswers(open, NOW + 3600_000)).to.equal(false);
    expect(shareStateLine(open, NOW + 3600_000)).to.equal('Past its deadline, waiting on the author.');
  });

  it('unverified, broken and unchecked speak neutrally and never invite answers', () => {
    const unverified = shareFromView(unverifiedView({ status: 'resolved', funding: 'escrowed', escrowTxHash: FORGED_TX }));
    expect(shareStateLine(unverified, NOW)).to.equal('This Ask has not been verified yet, so it is not taking answers.');
    expect(shareFundingNote(unverified)).to.deep.equal({ kind: 'escrow-unverified' });
    expect(shareTakesAnswers(unverified, NOW)).to.equal(false);
    expect(shareSeatsLabel(unverified)).to.equal('2');

    const broken = shareFromView(brokenView());
    expect(broken.trust).to.equal('broken');
    expect(shareStateLine(broken, NOW)).to.equal('This Ask cannot be verified right now.');
    expect(shareTakesAnswers(broken, NOW)).to.equal(false);

    // Niewazny rekord przyjecia przy waznym stanie - tez 'broken', jak w trasach (503).
    const badRecords = shareFromView(sealedView({ funding: 'escrowed', escrow: ESCROW }), { valid: 1, invalid: 1 });
    expect(badRecords.trust).to.equal('broken');
    expect(badRecords.escrow).to.equal(null);
    expect(shareFundingNote(badRecords)).to.deep.equal({ kind: 'escrow-unverified' });

    const unchecked = shareUnchecked(toAsk(ASK_ID, pubDoc({ status: 'resolved', funding: 'escrowed', escrowTxHash: FORGED_TX, token: 'ETH' })));
    expect(unchecked.trust).to.equal('unchecked');
    expect(unchecked.ask.token).to.equal('USDC');
    expect(unchecked.ask.escrowTxHash).to.equal(null);
    expect(shareStateLine(unchecked, NOW)).to.equal('Its current state could not be checked right now.');
    expect(shareFundingNote(unchecked)).to.deep.equal({ kind: 'escrow-unverified' });
    expect(shareTakesAnswers(unchecked, NOW)).to.equal(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Odczyty z magazynu (askPublicRead) na atrapie                      */
/* ------------------------------------------------------------------ */

type Stored = { data: Record<string, any>; createTime: number; updateTime?: number };

class FakeDb {
  docs = new Map<string, Stored>();
  failReads = false;

  collection(path: string) {
    return new FakeQuery(this, path);
  }

  async getAll(...refs: any[]) {
    if (this.failReads) throw new Error('UNAVAILABLE');
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

  put(path: string, data: Record<string, any>) {
    this.docs.set(path, { data, createTime: NOW - 60_000 });
  }
}

class FakeQuery {
  constructor(
    public db: FakeDb,
    public path: string,
    public filters: Array<[string, any]> = [],
    public order: [string, string] | null = null,
    public max: number | null = null
  ) {}
  where(field: string, _op: string, value: any) {
    return new FakeQuery(this.db, this.path, [...this.filters, [field, value]], this.order, this.max);
  }
  orderBy(field: string, direction = 'asc') {
    return new FakeQuery(this.db, this.path, this.filters, [field, direction], this.max);
  }
  limit(n: number) {
    return new FakeQuery(this.db, this.path, this.filters, this.order, n);
  }
  doc(id: string) {
    const path = `${this.path}/${id}`;
    const db = this.db;
    return { id, path, collection: (name: string) => new FakeQuery(db, `${path}/${name}`), get: async () => db.snapshot(path) };
  }
  async get() {
    if (this.db.failReads) throw new Error('UNAVAILABLE');
    let rows = [...this.db.docs.entries()]
      .filter(([p]) => p.startsWith(`${this.path}/`) && !p.slice(this.path.length + 1).includes('/'))
      .filter(([, s]) => this.filters.every(([field, value]) => s.data[field] === value));
    if (this.order) {
      const [field, direction] = this.order;
      const sign = direction === 'desc' ? -1 : 1;
      rows = rows.filter(([, s]) => field in s.data).sort(([, a], [, b]) => sign * (a.data[field] - b.data[field]));
    }
    if (this.max !== null) rows = rows.slice(0, this.max);
    const docs = rows.map(([p]) => this.db.snapshot(p));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

function makeStore(enforce = false): any {
  return { db: new FakeDb(), keys: KEYS, key: KEYS.current, enforce, legacyCutoffMs: Number.POSITIVE_INFINITY, FieldValue: {} };
}

function seedAsk(store: any, askId: string, pub: Record<string, unknown>, sealed?: Record<string, unknown> | 'forged') {
  store.db.put(`asks/${askId}`, pubDoc(pub));
  if (sealed === 'forged') {
    store.db.put(`asks/${askId}/sealed/state`, sealStateDoc(OTHER_KEYS.current, state({ askId })));
  } else if (sealed) {
    store.db.put(`asks/${askId}/sealed/state`, sealStateDoc(KEYS.current, state({ askId, ...sealed })));
  }
}

describe('askPublicRead - listOpenAsksWith', () => {
  it('lists open Asks newest first, checked against their seals', async () => {
    const store = makeStore();
    seedAsk(store, 'sealedOpen000000001', { createdAt: NOW - 1000 }, {});
    seedAsk(store, 'sealedClosed0000002', { createdAt: NOW - 2000 }, { status: 'resolved', resolvedAt: NOW, resolveKind: 'author' });
    seedAsk(store, 'legacyEscrow0000003', { createdAt: NOW - 3000, funding: 'escrowed', escrowTxHash: FORGED_TX });
    seedAsk(store, 'brokenSeal000000004', { createdAt: NOW - 500 }, 'forged');
    seedAsk(store, 'resolvedMirror00005', { createdAt: NOW - 100, status: 'resolved' });
    // Id spoza isDocId (tylko z zapisu przegladarki) - pomijane.
    store.db.put('asks/bad_id', pubDoc({ createdAt: NOW }));

    const listed = await listOpenAsksWith(store, 20);
    expect(listed.map((a: any) => [a.id, a.trust, a.escrowVerified])).to.deep.equal([
      ['sealedOpen000000001', 'sealed', false],
      ['legacyEscrow0000003', 'legacy', false],
    ]);
    expect(listed[1]).to.include({ funding: 'escrowed', escrowTxHash: null });
  });

  it('omits unverified Asks once the flag is on', async () => {
    const store = makeStore(true);
    seedAsk(store, 'sealedOpen000000001', { createdAt: NOW - 1000 }, {});
    seedAsk(store, 'noSealYet0000000002', { createdAt: NOW - 500 });
    const listed = await listOpenAsksWith(store, 20);
    expect(listed.map((a: any) => a.id)).to.deep.equal(['sealedOpen000000001']);
  });

  it('listOpenAsks without a store falls back to the given reader, marked unchecked', async () => {
    // Bez GOOGLE_CREDENTIALS openAskStore() zwraca null - zadnego polaczenia.
    const saved = process.env.GOOGLE_CREDENTIALS;
    delete process.env.GOOGLE_CREDENTIALS;
    try {
      const asks = [toAsk('a0000000000000000001', pubDoc({ funding: 'escrowed', escrowTxHash: FORGED_TX })), toAsk('a0000000000000000002', pubDoc())];
      const ok = await listOpenAsks(1, async () => ({ asks, failed: false }));
      expect(ok.ok).to.equal(true);
      expect(ok.checked).to.equal(false);
      expect(ok.asks.map((a: any) => [a.id, a.trust, a.escrowVerified, a.escrowTxHash])).to.deep.equal([
        ['a0000000000000000001', 'unchecked', false, null],
      ]);
      const failed = await listOpenAsks(5, async () => ({ asks: [], failed: true }));
      expect(failed).to.deep.equal({ ok: false });
    } finally {
      if (saved !== undefined) process.env.GOOGLE_CREDENTIALS = saved;
    }
  });
});

describe('askPublicRead - readAskShareWith', () => {
  it('sealed: seats from acceptance records, not from the mirror counter', async () => {
    const store = makeStore();
    seedAsk(store, ASK_ID, { acceptedCount: 2, status: 'resolved' }, {});
    store.db.put(`asks/${ASK_ID}/acceptances/answerOne0000000001`, sealAcceptanceDoc(KEYS.current, record('answerOne0000000001')));
    const read = await readAskShareWith(store, ASK_ID);
    expect(read.kind).to.equal('ok');
    expect(read.share.trust).to.equal('sealed');
    expect(read.share.ask.status).to.equal('open');
    expect(read.share.ask.acceptedCount).to.equal(1);
  });

  it('an acceptance record with a bad seal makes the share broken', async () => {
    const store = makeStore();
    seedAsk(store, ASK_ID, {}, {});
    store.db.put(`asks/${ASK_ID}/acceptances/answerOne0000000001`, sealAcceptanceDoc(OTHER_KEYS.current, record('answerOne0000000001')));
    const read = await readAskShareWith(store, ASK_ID);
    expect(read.kind).to.equal('ok');
    expect(read.share.trust).to.equal('broken');
  });

  it('legacy, broken state, missing document and read failure', async () => {
    const legacyStore = makeStore();
    seedAsk(legacyStore, ASK_ID, { status: 'resolved' });
    const legacy = await readAskShareWith(legacyStore, ASK_ID);
    expect(legacy.share.trust).to.equal('legacy');
    expect(legacy.share.ask.status).to.equal('resolved');

    const brokenStore = makeStore();
    seedAsk(brokenStore, ASK_ID, {}, 'forged');
    expect((await readAskShareWith(brokenStore, ASK_ID)).share.trust).to.equal('broken');

    const emptyStore = makeStore();
    expect(await readAskShareWith(emptyStore, ASK_ID)).to.deep.equal({ kind: 'missing' });

    // Sam stan bez publicznego dokumentu - nie ma pytania do pokazania.
    const orphanStore = makeStore();
    orphanStore.db.put(`asks/${ASK_ID}/sealed/state`, sealedDoc());
    expect(await readAskShareWith(orphanStore, ASK_ID)).to.deep.equal({ kind: 'missing' });

    const failingStore = makeStore();
    seedAsk(failingStore, ASK_ID, {}, {});
    failingStore.db.failReads = true;
    expect(await readAskShareWith(failingStore, ASK_ID)).to.deep.equal({ kind: 'unavailable' });
  });
});
