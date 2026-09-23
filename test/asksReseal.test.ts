export {};

// Reseal Askow sprzed pieczeci: czysta logika decyzji (app/utils/asks/resealCore.ts)
// i silnik trasy (app/api/admin/asks-reseal/resealEngine.ts) na atrapie
// Firestore z podstawionym lancuchem. Bramka admina (app/api/admin/isAdmin.ts).
// Runner: scripts/test-asks-seals.cjs (podmienia 'server-only').
const { expect } = require('chai');
const { encodeAbiParameters, encodeEventTopics } = require('viem');
const {
  advanceSealedAsk,
  answerAcceptedMirrorPlan,
  answerResetMirrorPlan,
  askMirrorPlan,
  classifyLegacyAsk,
  closureHashCandidates,
  parseResealRequest,
  planAcceptances,
  registryIdsToRead,
  registrySlot,
} = require('../app/utils/asks/resealCore');
const {
  deriveAskSealKeys,
  payoutEntryFor,
  payoutRegistryId,
  readAcceptance,
  readRegistry,
  readSealedState,
  registryDoc,
  sealAcceptanceDoc,
  sealStateDoc,
  transferAcceptance,
} = require('../app/utils/asks/askSealCore');
const { ASK_ESCROW_ABI, escrowKeyFor } = require('../app/utils/asks/escrow');
const { runReseal } = require('../app/api/admin/asks-reseal/resealEngine');
const { isAdminRequest } = require('../app/api/admin/isAdmin');
const { createSession, SESSION_COOKIE } = require('../app/utils/auth/session');

/* ------------------------------------------------------------------ */
/*  Dane (census z 2026-09-23 + wymyslone Aski testowe)                */
/* ------------------------------------------------------------------ */

const AUTHOR = '0xd4885a5aa53446843cabcde1f35de9b4e906030e';
const AUTHOR_CHECKSUM = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const WINNER = '0xdf1e757062d7e6ef19bab6d6b1aa6f9fa44a09eb';
const ANSWERER = '0x1111111111111111111111111111111111111111';
const STRANGER = '0x2222222222222222222222222222222222222222';
const CONTRACT = '0xd5f65cfbe6a1aa1b6f82cbe0a336ddfcd39a5340';

const ESCROW_ASK = 'mGlRpEtdsvBfG7O8jHjd';
const ESCROW_ANSWER = 'EDXl12VbGzece55mcSNp';
const FUND_TX = `0x${'ce'.repeat(32)}`;
const RESOLVE_TX = `0x${'dd'.repeat(32)}`;
const TX_447 = `0x${'43'.repeat(32)}`;
const TX_WEAK = `0x${'77'.repeat(32)}`;
const JUNK_TX = `0x${'99'.repeat(32)}`;
const RESOLVE_BLOCK_SEC = 1786468200;
const DEADLINE_MS = 1786468085839;

const escrowTerms = (overrides: Record<string, unknown> = {}) => ({
  chainId: 8453,
  contract: CONTRACT,
  fundTxHash: FUND_TX,
  perAnswerUnits: '5000000',
  seats: 1,
  deadlineSec: '1786468085',
  source: 'escrowFor',
  ...overrides,
});

const transfer = (logIndex: number, value: bigint, from = AUTHOR, to = ANSWERER) => ({ logIndex, from, to, value });

/* ------------------------------------------------------------------ */
/*  parseResealRequest                                                 */
/* ------------------------------------------------------------------ */

describe('asks reseal: request parsing', () => {
  it('an empty body is a dry run with the default page', () => {
    const parsed = parseResealRequest({});
    expect(parsed.ok).to.equal(true);
    expect(parsed.request.apply).to.equal(false);
    expect(parsed.request.cursor).to.equal(null);
    expect(parsed.request.limit).to.equal(10);
    expect(parseResealRequest(undefined).ok).to.equal(true);
  });

  it('rejects unknown fields, a string apply and limits outside 1-25', () => {
    expect(parseResealRequest({ resetForge: ['abc'] }).ok).to.equal(false);
    expect(parseResealRequest({ apply: 'true' }).ok).to.equal(false);
    expect(parseResealRequest({ limit: 26 }).ok).to.equal(false);
    expect(parseResealRequest({ limit: 0 }).ok).to.equal(false);
    expect(parseResealRequest({ limit: 2.5 }).ok).to.equal(false);
    expect(parseResealRequest({ limit: 25 }).ok).to.equal(true);
    expect(parseResealRequest([]).ok).to.equal(false);
  });

  it('rejects path-like ids and a slash in the cursor', () => {
    expect(parseResealRequest({ trustWeak: ['a/sealed/state'] }).ok).to.equal(false);
    expect(parseResealRequest({ resetForged: ['_registry'] }).ok).to.equal(false);
    expect(parseResealRequest({ repairInvalid: [''] }).ok).to.equal(false);
    expect(parseResealRequest({ cursor: 'a/b' }).ok).to.equal(false);
    // Kasowac wolno tez Aski z dziwnym id (tylko przez referencje z listingu).
    expect(parseResealRequest({ deleteUnverified: ['bad id-x'] }).ok).to.equal(true);
    expect(parseResealRequest({ deleteUnverified: ['a/b'] }).ok).to.equal(false);
  });

  it('refuses the same answer in trustWeak and resetForged, and the same Ask in delete and repair', () => {
    expect(parseResealRequest({ trustWeak: ['abc'], resetForged: ['abc'] }).ok).to.equal(false);
    expect(parseResealRequest({ deleteUnverified: ['abc'], repairInvalid: ['abc'] }).ok).to.equal(false);
  });

  it('lowercases resolve hashes and validates them', () => {
    const upper = `0x${'AB'.repeat(32)}`;
    const parsed = parseResealRequest({ resolveHashes: { [ESCROW_ASK]: upper } });
    expect(parsed.request.decisions.resolveHashes.get(ESCROW_ASK)).to.equal(upper.toLowerCase());
    expect(parseResealRequest({ resolveHashes: { [ESCROW_ASK]: '0x12' } }).ok).to.equal(false);
    expect(parseResealRequest({ resolveHashes: { 'a/b': RESOLVE_TX } }).ok).to.equal(false);
  });
});

/* ------------------------------------------------------------------ */
/*  planAcceptances                                                    */
/* ------------------------------------------------------------------ */

const noDecisions = { trustWeak: new Set(), resetForged: new Set(), repair: false };

function plan(answers: any[], opts: Record<string, any> = {}) {
  return planAcceptances({
    askId: 'askOne00000000000001',
    author: AUTHOR,
    answers,
    registry: opts.registry ?? new Map(),
    trustWeak: opts.trustWeak ?? noDecisions.trustWeak,
    resetForged: opts.resetForged ?? noDecisions.resetForged,
    repair: opts.repair ?? false,
  });
}

const accepted = (answerId: string, verdict: any, record = 'absent') => ({
  answerId,
  record,
  mirrorAccepted: true,
  verdict,
  payee: ANSWERER,
  txHash: verdict && verdict.txHash ? verdict.txHash : null,
});

const transferVerdict = (candidates: any[], txHash = TX_447, payee = ANSWERER) => ({
  kind: 'transfer',
  txHash,
  payee,
  from: AUTHOR,
  candidates,
  blockTimeSec: 1_800_000_000,
});

describe('asks reseal: acceptance decisions', () => {
  it('a census-shaped transfer from the author seals as transfer with a new registry entry', () => {
    const result = plan([accepted('answerA0000000000001', transferVerdict([transfer(447, 500000n)]))]);
    expect(result.undecided).to.deep.equal([]);
    expect(result.records).to.have.length(1);
    const [only] = result.records;
    expect(only.registry).to.equal('create');
    expect(only.regId).to.equal(payoutRegistryId(8453, TX_447, 447));
    expect(only.record).to.deep.include({ kind: 'transfer', logIndex: 447, units: '500000', from: AUTHOR, payee: ANSWERER });
  });

  it('an escrowed Ask accepted through a direct transfer still seals as transfer', () => {
    // Weryfikacja probuje obu dowodow niezaleznie od funding - tu decyduje sam werdykt.
    const result = plan([accepted('answerA0000000000001', transferVerdict([transfer(3, 5000000n)]))]);
    expect(result.records[0].record.kind).to.equal('transfer');
  });

  it('SeatAwarded seals as escrow-seat, from = the escrow contract', () => {
    const verdict = {
      kind: 'escrow-seat',
      txHash: RESOLVE_TX,
      payee: WINNER,
      contract: CONTRACT,
      chainId: 8453,
      award: { logIndex: 355, amount: 5000000n },
      blockTimeSec: RESOLVE_BLOCK_SEC,
    };
    const result = plan([{ ...accepted(ESCROW_ANSWER, verdict), payee: WINNER }]);
    expect(result.records[0].record).to.deep.include({ kind: 'escrow-seat', from: CONTRACT, logIndex: 355, units: '5000000' });
    expect(result.records[0].regId).to.equal(payoutRegistryId(8453, RESOLVE_TX, 355));
  });

  it('a transfer to the payee from a third address is weak: never reset, left undecided', () => {
    const verdict = { kind: 'weak', txHash: TX_WEAK, payee: ANSWERER, candidates: [transfer(9, 500000n, STRANGER)] };
    const result = plan([accepted('answerW0000000000001', verdict)]);
    expect(result.records).to.deep.equal([]);
    expect(result.resets).to.deep.equal([]);
    expect(result.undecided).to.have.length(1);
    expect(result.undecided[0]).to.deep.include({ verdict: 'weak', payee: ANSWERER, txHash: TX_WEAK });
    expect(result.undecided[0].candidates).to.deep.equal([{ from: STRANGER, logIndex: 9, units: '500000' }]);
  });

  it('weak with trustWeak seals as legacy-weak (with a registry entry); with resetForged it is reset', () => {
    const verdict = { kind: 'weak', txHash: TX_WEAK, payee: ANSWERER, candidates: [transfer(9, 500000n, STRANGER)] };
    const trusted = plan([accepted('answerW0000000000001', verdict)], { trustWeak: new Set(['answerW0000000000001']) });
    expect(trusted.undecided).to.deep.equal([]);
    expect(trusted.records[0].record).to.deep.include({ kind: 'legacy-weak', from: STRANGER, logIndex: 9 });
    expect(trusted.records[0].registry).to.equal('create');

    const reset = plan([accepted('answerW0000000000001', verdict)], { resetForged: new Set(['answerW0000000000001']) });
    expect(reset.resets).to.deep.equal(['answerW0000000000001']);
    expect(reset.records).to.deep.equal([]);
  });

  it('no payout at all is forged: undecided unless listed in resetForged; trustWeak does not apply', () => {
    const forged = { kind: 'forged', reason: 'no_matching_payment' };
    expect(plan([accepted('answerF0000000000001', forged)]).undecided[0]).to.deep.include({ verdict: 'forged', reason: 'no_matching_payment' });
    const reset = plan([accepted('answerF0000000000001', forged)], { resetForged: new Set(['answerF0000000000001']) });
    expect(reset.resets).to.deep.equal(['answerF0000000000001']);
    const trusted = plan([accepted('answerF0000000000001', forged)], { trustWeak: new Set(['answerF0000000000001']) });
    expect(trusted.undecided).to.have.length(1);
    expect(trusted.notes).to.deep.include({ answerId: 'answerF0000000000001', code: 'trust_weak_not_applicable' });
  });

  it('a log already registered for another answer counts as used: payout_already_used', () => {
    const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'reseal-core-secret' });
    const other = transferAcceptance({
      askId: 'askOther000000000001',
      answerId: 'answerZ0000000000001',
      payee: ANSWERER,
      from: AUTHOR,
      txHash: TX_447,
      logIndex: 447,
      units: 500000n,
    });
    const regId = payoutRegistryId(8453, TX_447, 447);
    const registry = new Map([[regId, readRegistry(keys, regId, registryDoc(keys.current, payoutEntryFor(other)))]]);
    const result = plan([accepted('answerA0000000000001', transferVerdict([transfer(447, 500000n)]))], { registry });
    expect(result.records).to.deep.equal([]);
    expect(result.undecided[0]).to.deep.include({ verdict: 'forged', reason: 'payout_already_used' });
  });

  it('a registry entry already ours is kept (re-run), an invalid one blocks unless repairing', () => {
    const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: 'reseal-core-secret' });
    const mine = transferAcceptance({
      askId: 'askOne00000000000001',
      answerId: 'answerA0000000000001',
      payee: ANSWERER,
      from: AUTHOR,
      txHash: TX_447,
      logIndex: 448,
      units: 600000n,
    });
    const regId = payoutRegistryId(8453, TX_447, 448);
    const ours = new Map([[regId, readRegistry(keys, regId, registryDoc(keys.current, payoutEntryFor(mine)))]]);
    // Dwa kandydaty; nasz wpis wygrywa, choc pickTransfer wybralby mniejszy 447.
    const kept = plan([accepted('answerA0000000000001', transferVerdict([transfer(447, 500000n), transfer(448, 600000n)]))], { registry: ours });
    expect(kept.records[0].registry).to.equal('keep');
    expect(kept.records[0].record.logIndex).to.equal(448);

    const broken = new Map([[regId, { kind: 'invalid', reason: 'unknown_kid' }]]);
    const verdict = transferVerdict([transfer(448, 600000n)]);
    expect(plan([accepted('answerA0000000000001', verdict)], { registry: broken }).blocked[0].code).to.equal('registry_invalid');
    const repaired = plan([accepted('answerA0000000000001', verdict)], { registry: broken, repair: true });
    expect(repaired.records[0].registry).to.equal('overwrite');
  });

  it('two answers in one Ask cannot take the same log', () => {
    const shared = [transfer(447, 500000n, AUTHOR, ANSWERER)];
    const result = plan([
      accepted('answerA0000000000001', transferVerdict(shared)),
      accepted('answerB0000000000001', transferVerdict(shared)),
    ]);
    expect(result.records.map((r: any) => r.answerId)).to.deep.equal(['answerA0000000000001']);
    expect(result.undecided[0]).to.deep.include({ answerId: 'answerB0000000000001', reason: 'payout_already_used' });
  });

  it('a payment to the Ask author (self-answer) is never a seat', () => {
    const result = plan([{ ...accepted('answerS0000000000001', transferVerdict([transfer(1, 500000n, AUTHOR, AUTHOR)], TX_447, AUTHOR)), payee: AUTHOR }]);
    expect(result.records).to.deep.equal([]);
    expect(result.undecided[0].reason).to.equal('self_payment');
  });

  it('RPC failure is unknown; a valid record is left alone; invalid records block unless repairing', () => {
    expect(plan([accepted('answerU0000000000001', { kind: 'unknown', reason: 'rpc_error' })]).unknown).to.have.length(1);
    const recorded = plan([{ ...accepted('answerR0000000000001', null, 'valid') }], { resetForged: new Set(['answerR0000000000001']) });
    expect(recorded.resets).to.deep.equal([]);
    expect(recorded.notes).to.deep.include({ answerId: 'answerR0000000000001', code: 'reset_refused_recorded' });
    expect(plan([accepted('answerI0000000000001', transferVerdict([transfer(447, 500000n)]), 'invalid')]).blocked[0].code).to.equal('record_invalid');
    const repaired = plan([accepted('answerI0000000000001', transferVerdict([transfer(447, 500000n)]), 'invalid')], { repair: true });
    expect(repaired.records).to.have.length(1);
  });

  it('answers not marked accepted need nothing; registry ids cover every candidate', () => {
    const result = plan([{ answerId: 'answerN0000000000001', record: 'absent', mirrorAccepted: false, verdict: null, payee: ANSWERER, txHash: null }]);
    expect(result).to.deep.include({ records: [], resets: [], undecided: [], unknown: [], blocked: [] });
    const ids = registryIdsToRead([accepted('answerA0000000000001', transferVerdict([transfer(1, 1n), transfer(2, 2n)]))]);
    expect(ids).to.deep.equal([payoutRegistryId(8453, TX_447, 1), payoutRegistryId(8453, TX_447, 2)]);
    expect(registrySlot(undefined, 'a', 'b')).to.equal('free');
  });
});

/* ------------------------------------------------------------------ */
/*  classifyLegacyAsk / advanceSealedAsk                               */
/* ------------------------------------------------------------------ */

const NOW = 1_800_000_000_000;

function legacyPub(overrides: Record<string, unknown> = {}) {
  return {
    author: AUTHOR_CHECKSUM,
    question: 'What should I build?',
    budget: 1,
    seats: 2,
    perAnswer: 0.5,
    token: 'USDC',
    network: 'base',
    deadline: NOW + 3600_000,
    createdAt: NOW - 86_400_000,
    status: 'open',
    funding: 'on-resolve',
    answerCount: 0,
    acceptedCount: 0,
    ...overrides,
  };
}

function classify(pub: any, extra: Record<string, unknown> = {}) {
  return classifyLegacyAsk({
    askId: 'askOne00000000000001',
    pub,
    pubCreateTimeMs: NOW - 86_400_000,
    sealed: null,
    answerCount: 0,
    recordedCount: 0,
    latestPayoutMs: null,
    escrow: null,
    nowMs: NOW,
    ...extra,
  });
}

describe('asks reseal: classifying Asks without a seal', () => {
  it("on-resolve 'expired' is forged_expire and seals as open", () => {
    const result = classify(legacyPub({ status: 'expired' }), { answerCount: 1 });
    expect(result.ok).to.equal(true);
    expect(result.state.status).to.equal('open');
    expect(result.state.origin).to.equal('legacy');
    expect(result.labels).to.include('forged_expire');
  });

  it("'resolved' with answers and no verified acceptance is forged_resolve (open)", () => {
    const result = classify(legacyPub({ status: 'resolved', acceptedCount: 2 }), { answerCount: 3, recordedCount: 0 });
    expect(result.state.status).to.equal('open');
    expect(result.labels).to.include('forged_resolve');
  });

  it("'resolved' with zero answers, or with a verified acceptance, seals as resolved/legacy", () => {
    const empty = classify(legacyPub({ status: 'resolved', resolvedAt: NOW - 1000 }), { answerCount: 0 });
    expect(empty.state).to.deep.include({ status: 'resolved', resolveKind: 'legacy', resolvedAt: NOW - 1000 });
    expect(empty.labels).to.include('resolved_empty');

    const paid = classify(legacyPub({ status: 'resolved', seats: 3, budget: 3 }), { answerCount: 2, recordedCount: 1, latestPayoutMs: NOW - 5000 });
    expect(paid.state).to.deep.include({ status: 'resolved', resolveKind: 'legacy' });
    // resolvedAt z lustra brak -> czas ostatniej zweryfikowanej wyplaty.
    expect(paid.state.resolvedAt).to.equal(NOW - 5000);
    expect(paid.labels).to.include('resolved_legacy');
  });

  it('an open on-resolve Ask with every seat paid closes as auto-full (replaces backfillResolvedAsks)', () => {
    const result = classify(legacyPub({ status: 'open', acceptedCount: 0 }), { answerCount: 2, recordedCount: 2, latestPayoutMs: NOW - 1 });
    expect(result.state).to.deep.include({ status: 'resolved', resolveKind: 'auto-full', resolvedAt: NOW - 1 });
    // Podrobione acceptedCount == seats przy zerze rekordow niczego nie zamyka.
    const forged = classify(legacyPub({ status: 'open', acceptedCount: 2 }), { answerCount: 2, recordedCount: 0 });
    expect(forged.state.status).to.equal('open');
  });

  it('escrowed, funded per escrowFor, closed by an AskResolved found in a frozen payout hash: resolved/escrow', () => {
    const result = classify(
      legacyPub({ funding: 'escrowed', budget: 5, seats: 1, status: 'resolved', deadline: DEADLINE_MS, escrowTxHash: JUNK_TX }),
      {
        answerCount: 1,
        recordedCount: 1,
        escrow: {
          funded: true,
          escrow: escrowTerms(),
          anomalies: ['fund_tx_unverified'],
          open: false,
          closure: { kind: 'resolved', txHash: RESOLVE_TX, logIndex: 356, blockTimeSec: RESOLVE_BLOCK_SEC },
          closureConflict: false,
        },
      }
    );
    expect(result.state).to.deep.include({
      status: 'resolved',
      funding: 'escrowed',
      resolveKind: 'escrow',
      resolveTxHash: RESOLVE_TX,
      resolvedAt: RESOLVE_BLOCK_SEC * 1000,
    });
    expect(result.state.escrow.source).to.equal('escrowFor');
    expect(result.anomalies).to.include('fund_tx_unverified');
    expect(result.labels).to.include('escrow_resolved');
  });

  it('escrowFor not funded: fake_escrow, sealed as on-resolve without escrow terms', () => {
    const result = classify(legacyPub({ funding: 'escrowed', escrowTxHash: JUNK_TX, escrowChainId: 8453 }), { escrow: { funded: false } });
    expect(result.fakeEscrow).to.equal(true);
    expect(result.labels).to.include('fake_escrow');
    expect(result.state).to.deep.include({ funding: 'on-resolve', escrow: null, status: 'open' });
  });

  it('escrowed, closed on chain, no hash proves it: open + closed_on_chain_unrecorded', () => {
    const result = classify(legacyPub({ funding: 'escrowed', budget: 5, seats: 1, deadline: DEADLINE_MS }), {
      escrow: { funded: true, escrow: escrowTerms(), anomalies: [], open: false, closure: null, closureConflict: false },
    });
    expect(result.state.status).to.equal('open');
    expect(result.anomalies).to.include('closed_on_chain_unrecorded');
  });

  it('escrowed, still open on chain, forged resolved: open + forged_resolve; AskExpired seals expired', () => {
    const open = classify(legacyPub({ funding: 'escrowed', budget: 5, seats: 1, status: 'resolved', deadline: DEADLINE_MS }), {
      escrow: { funded: true, escrow: escrowTerms(), anomalies: [], open: true, closure: null, closureConflict: false },
    });
    expect(open.state.status).to.equal('open');
    expect(open.labels).to.include('forged_resolve');

    const expired = classify(legacyPub({ funding: 'escrowed', budget: 5, seats: 1, deadline: DEADLINE_MS }), {
      escrow: {
        funded: true,
        escrow: escrowTerms(),
        anomalies: [],
        open: false,
        closure: { kind: 'expired', txHash: RESOLVE_TX, logIndex: 7 },
        closureConflict: false,
      },
    });
    expect(expired.state).to.deep.include({ status: 'expired', expiredTxHash: RESOLVE_TX, expiredLogIndex: 7, resolvedAt: null });
  });

  it('an unknown status seals open with an anomaly; a malformed Ask is refused', () => {
    const odd = classify(legacyPub({ status: 'closed<script>' }));
    expect(odd.state.status).to.equal('open');
    expect(odd.anomalies).to.include('unknown_status:closedscript');
    const bad = classify(legacyPub({ author: 'nobody' }));
    expect(bad).to.deep.include({ ok: false, code: 'ask_malformed' });
    expect(classify(legacyPub({ funding: 'escrowed' })).code).to.equal('escrow_unchecked');
  });

  it('a sealed state only moves on proof: auto-full on-resolve, escrow closure, otherwise unchanged', () => {
    const base = classify(legacyPub()).state;
    const same = advanceSealedAsk({ askId: base.askId, pub: legacyPub(), pubCreateTimeMs: 0, sealed: base, answerCount: 1, recordedCount: 1, latestPayoutMs: null, escrow: null, nowMs: NOW });
    expect(same.changed).to.equal(false);
    const full = advanceSealedAsk({ askId: base.askId, pub: legacyPub(), pubCreateTimeMs: 0, sealed: base, answerCount: 2, recordedCount: 2, latestPayoutMs: NOW - 9, escrow: null, nowMs: NOW });
    expect(full.changed).to.equal(true);
    expect(full.state).to.deep.include({ status: 'resolved', resolveKind: 'auto-full' });
    const resolved = { ...base, status: 'resolved', resolveKind: 'author', resolvedAt: NOW - 50 };
    expect(advanceSealedAsk({ askId: base.askId, pub: legacyPub(), pubCreateTimeMs: 0, sealed: resolved, answerCount: 2, recordedCount: 2, latestPayoutMs: null, escrow: null, nowMs: NOW }).changed).to.equal(false);
  });

  it('closure hashes: accepted payouts first, then the mirror hashes, then the owner hash; deduplicated', () => {
    const rows = [
      { raw: { accepted: true, payoutTxHash: RESOLVE_TX.toUpperCase().replace('0X', '0x') } },
      { raw: { accepted: false, payoutTxHash: JUNK_TX } },
    ];
    const hashes = closureHashCandidates(rows, { escrowResolveTxHash: RESOLVE_TX, expiredTxHash: 'junk' }, TX_447);
    expect(hashes).to.deep.equal([RESOLVE_TX, TX_447]);
  });
});

/* ------------------------------------------------------------------ */
/*  Lustra                                                             */
/* ------------------------------------------------------------------ */

describe('asks reseal: mirror plans', () => {
  it('a fake escrow mirror loses its escrow fields and becomes on-resolve', () => {
    const state = classify(legacyPub({ funding: 'escrowed', escrowTxHash: JUNK_TX, escrowChainId: 8453 }), { escrow: { funded: false } }).state;
    const mirror = askMirrorPlan(state, legacyPub({ funding: 'escrowed', escrowTxHash: JUNK_TX, escrowChainId: 8453 }), { accepted: 0, answers: 0 });
    expect(mirror.set).to.deep.equal({ funding: 'on-resolve' });
    expect(mirror.remove).to.have.members(['escrowTxHash', 'escrowChainId']);
  });

  it('forged status and counters are repaired; a matching mirror needs no write', () => {
    const state = classify(legacyPub()).state;
    const forged = askMirrorPlan(state, legacyPub({ status: 'resolved', resolvedAt: NOW, acceptedCount: 2, network: 'solana' }), { accepted: 0, answers: 3 });
    // acceptedCount z rekordow (0), nie z podrobionego lustra (2).
    expect(forged.set).to.deep.include({ status: 'open', acceptedCount: 0, answerCount: 3, network: 'base' });
    expect(forged.remove).to.include('resolvedAt');
    const clean = askMirrorPlan(state, legacyPub({ answerCount: 3 }), { accepted: 0, answers: 3 });
    expect(clean.fields).to.deep.equal([]);
  });

  it('answer mirrors: an inflated payoutAmount is corrected, a smaller one kept; reset clears the payout', () => {
    const record = transferAcceptance({ askId: 'askOne00000000000001', answerId: 'answerA0000000000001', payee: ANSWERER, from: AUTHOR, txHash: TX_447, logIndex: 447, units: 500000n });
    const inflated = answerAcceptedMirrorPlan({ accepted: true, payoutTxHash: TX_447, payoutAmount: 1000, payoutToken: 'USDC', payoutNetwork: 'base', acceptedAt: 1 }, record);
    expect(inflated.set).to.deep.equal({ payoutLogIndex: 447, payoutAmount: 0.5 });
    const fine = answerAcceptedMirrorPlan({ accepted: true, payoutTxHash: TX_447, payoutLogIndex: 447, payoutAmount: 0.5, payoutToken: 'USDC', payoutNetwork: 'base', acceptedAt: 1 }, record);
    expect(fine.fields).to.deep.equal([]);
    const reset = answerResetMirrorPlan({ accepted: true, payoutTxHash: JUNK_TX, payoutAmount: 9, acceptedAt: 1 });
    expect(reset.set).to.deep.equal({ accepted: false, payoutTxHash: null });
    expect(reset.remove).to.have.members(['payoutAmount', 'acceptedAt']);
  });
});

/* ------------------------------------------------------------------ */
/*  Atrapa Firestore (kopia z asksStore.test.ts + delete i ref)        */
/* ------------------------------------------------------------------ */

type Stored = { data: Record<string, any>; createTime: number; updateTime?: number };

const SERVER_TS = { __sentinel: 'serverTimestamp' };
const FakeFieldValue = {
  serverTimestamp: () => SERVER_TS,
  increment: (n: number) => ({ __sentinel: 'increment', n }),
  delete: () => ({ __sentinel: 'delete' }),
};

class FakeDb {
  docs = new Map<string, Stored>();
  clock = NOW;

  collection(path: string) {
    return new FakeCollection(this, path);
  }

  ref(path: string): any {
    const db = this;
    return {
      id: path.split('/').pop(),
      path,
      collection: (name: string) => new FakeCollection(db, `${path}/${name}`),
      get: async () => db.snapshot(path),
    };
  }

  async getAll(...refs: any[]) {
    return refs.map((ref) => this.snapshot(ref.path));
  }

  snapshot(path: string) {
    const stored = this.docs.get(path);
    return {
      id: path.split('/').pop(),
      ref: this.ref(path),
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
    if (write.op === 'delete') {
      this.docs.delete(write.path);
      return;
    }
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
      delete: (ref: any) => writes.push({ op: 'delete', path: ref.path }),
    };
    const result = await fn(tx);
    for (const write of writes) {
      if (write.op === 'create' && this.docs.has(write.path)) throw new Error(`ALREADY_EXISTS ${write.path}`);
      if (write.op === 'update' && !this.docs.has(write.path)) throw new Error(`NOT_FOUND ${write.path}`);
    }
    for (const write of writes) this.apply(write);
    return result;
  }

  dump() {
    return JSON.stringify([...this.docs.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  }
}

class FakeQuery {
  constructor(
    public db: FakeDb,
    public path: string,
    public filters: Array<[string, any]> = [],
    public max: number | null = null
  ) {}
  where(field: string, _op: string, value: any) {
    return new FakeQuery(this.db, this.path, [...this.filters, [field, value]], this.max);
  }
  limit(n: number) {
    return new FakeQuery(this.db, this.path, this.filters, n);
  }
  async get() {
    let rows = [...this.db.docs.entries()]
      .filter(([path]) => path.startsWith(`${this.path}/`) && !path.slice(this.path.length + 1).includes('/'))
      .filter(([, stored]) => this.filters.every(([field, value]) => stored.data[field] === value))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    if (this.max !== null) rows = rows.slice(0, this.max);
    const docs = rows.map(([path]) => this.db.snapshot(path));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeCollection extends FakeQuery {
  doc(id: string) {
    return this.db.ref(`${this.path}/${id}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Silnik: magazyn, lancuch, listing                                  */
/* ------------------------------------------------------------------ */

function makeStore(secret = 'reseal-engine-secret'): any {
  const keys = deriveAskSealKeys({ ASK_SEAL_SECRET: secret });
  return { db: new FakeDb(), keys, key: keys.current, enforce: false, legacyCutoffMs: Number.POSITIVE_INFINITY, FieldValue: FakeFieldValue };
}

function seed(store: any, path: string, data: Record<string, any>, createTime = NOW - 86_400_000) {
  store.db.docs.set(path, { data, createTime });
}

function escrowLog(eventName: string, args: Record<string, unknown>, logIndex: number) {
  const event = ASK_ESCROW_ABI.find((item: any) => item.type === 'event' && item.name === eventName);
  const indexed = event.inputs.filter((input: any) => input.indexed);
  const plain = event.inputs.filter((input: any) => !input.indexed);
  const topicArgs: Record<string, unknown> = {};
  for (const input of indexed) topicArgs[input.name] = args[input.name];
  return {
    address: CONTRACT,
    topics: encodeEventTopics({ abi: ASK_ESCROW_ABI, eventName, args: topicArgs }),
    data: encodeAbiParameters(
      plain.map((input: any) => ({ type: input.type })),
      plain.map((input: any) => args[input.name])
    ),
    logIndex,
  };
}

type Chain = {
  verdicts: Record<string, any>;
  escrow: Record<string, any>;
  onchain: Record<string, any>;
  receipts: Record<string, any>;
  calls: { verify: number };
  onVerify?: (row: any) => void;
};

function makeDeps(store: any, chain: Chain) {
  return {
    async listPage(_store: any, cursor: string | null, limit: number) {
      const ids = [...store.db.docs.keys()]
        .filter((path: string) => path.startsWith('asks/') && path.split('/').length === 2)
        .map((path: string) => path.slice('asks/'.length))
        .sort();
      const start = cursor === null ? 0 : ids.findIndex((id: string) => id > cursor);
      const page = start < 0 ? [] : ids.slice(start, start + limit);
      return page.map((id: string) => {
        const stored = store.db.docs.get(`asks/${id}`);
        return { id, ref: store.db.ref(`asks/${id}`), data: stored.data, createTimeMs: stored.createTime };
      });
    },
    async verifyAcceptance(ctx: any, row: any) {
      chain.calls.verify += 1;
      if (chain.onVerify) chain.onVerify(row);
      const verdict = chain.verdicts[row.id];
      if (typeof verdict === 'function') return verdict(ctx, row);
      return verdict ?? { kind: 'forged', reason: 'no_matching_payment' };
    },
    async proveEscrow(_pub: any, _author: string, askId: string) {
      const proof = chain.escrow[askId];
      if (proof instanceof Error) throw proof;
      return proof ?? { funded: false, onchain: { funded: false, open: false, perAnswerUnits: 0n, deadlineSec: 0n, seatsLeft: 0 } };
    },
    async readOnchain(_author: string, askId: string) {
      const onchain = chain.onchain[askId];
      if (onchain instanceof Error) throw onchain;
      return onchain ?? { funded: false, open: false, perAnswerUnits: 0n, deadlineSec: 0n, seatsLeft: 0 };
    },
    async readReceipt(txHash: string) {
      return chain.receipts[txHash] ?? { ok: false, code: 'tx_not_found', error: 'unknown tx' };
    },
    now: () => NOW,
    timeBudgetMs: 60_000,
  };
}

const newChain = (): Chain => ({ verdicts: {}, escrow: {}, onchain: {}, receipts: {}, calls: { verify: 0 } });

function request(overrides: Record<string, unknown> = {}) {
  const parsed = parseResealRequest(overrides);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.request;
}

const ON_ASK = 'onResolveAsk00000001';
const ON_ANSWER = 'answerPaid0000000001';
const ON_ANSWER_2 = 'answerOpen0000000001';
const OPEN_ASK = 'openAsk0000000000001';

/** Census w miniaturze: Ask escrow zamkniety przez AskResolved, Ask 'on-resolve' z jedna wyplata, pusty otwarty Ask. */
function seedCensus(store: any, chain: Chain) {
  seed(store, `asks/${ESCROW_ASK}`, {
    ...legacyPub({
      budget: 5,
      seats: 1,
      perAnswer: 5,
      deadline: DEADLINE_MS,
      status: 'resolved',
      funding: 'escrowed',
      answerCount: 1,
      acceptedCount: 1,
      escrowTxHash: FUND_TX,
      escrowChainId: 8453,
      escrowResolveTxHash: RESOLVE_TX,
      resolvedAt: RESOLVE_BLOCK_SEC * 1000 + 3000,
    }),
  });
  seed(store, `askAnswers/${ESCROW_ANSWER}`, {
    askId: ESCROW_ASK,
    author: WINNER,
    createdAt: NOW - 80_000_000,
    accepted: true,
    payoutTxHash: RESOLVE_TX,
    payoutAmount: 5,
    payoutToken: 'USDC',
    payoutNetwork: 'base',
    acceptedAt: RESOLVE_BLOCK_SEC * 1000 + 3000,
  });
  chain.escrow[ESCROW_ASK] = {
    funded: true,
    escrow: escrowTerms(),
    anomalies: [],
    onchain: { funded: true, open: false, perAnswerUnits: 5000000n, deadlineSec: 1786468085n, seatsLeft: 0 },
  };
  chain.receipts[RESOLVE_TX] = {
    ok: true,
    txHash: RESOLVE_TX,
    blockNumber: 49871236n,
    blockTimeSec: RESOLVE_BLOCK_SEC,
    logs: [
      escrowLog('AskResolved', { key: escrowKeyFor(AUTHOR, ESCROW_ASK), author: AUTHOR_CHECKSUM, seatsAwarded: 1, refundToAuthor: 0n }, 356),
    ],
  };
  chain.verdicts[ESCROW_ANSWER] = (ctx: any) => {
    // Silnik musi podac warunki escrow z lancucha do weryfikacji przyjecia.
    expect(ctx.escrow.source).to.equal('escrowFor');
    expect(ctx.perAnswerUnits).to.equal(5000000n);
    return {
      kind: 'escrow-seat',
      txHash: RESOLVE_TX,
      payee: WINNER,
      contract: CONTRACT,
      chainId: 8453,
      award: { logIndex: 355, recipient: WINNER, answerRef: '0x', amount: 5000000n },
      blockTimeSec: RESOLVE_BLOCK_SEC,
    };
  };

  seed(store, `asks/${ON_ASK}`, legacyPub({ status: 'resolved', answerCount: 2, acceptedCount: 1, resolvedAt: NOW - 3600_000 }));
  seed(store, `askAnswers/${ON_ANSWER}`, {
    askId: ON_ASK,
    author: ANSWERER,
    createdAt: NOW - 7_200_000,
    accepted: true,
    payoutTxHash: TX_447,
    payoutAmount: 0.5,
    payoutToken: 'USDC',
    payoutNetwork: 'base',
    acceptedAt: NOW - 3_600_000,
  }, NOW - 7_200_000);
  seed(store, `askAnswers/${ON_ANSWER_2}`, { askId: ON_ASK, author: STRANGER, createdAt: NOW - 7_000_000, accepted: false, payoutTxHash: null }, NOW - 7_000_000);
  chain.verdicts[ON_ANSWER] = transferVerdict([transfer(447, 500000n)], TX_447, ANSWERER);

  seed(store, `asks/${OPEN_ASK}`, legacyPub());
}

describe('asks reseal engine: census dry run, apply, idempotent re-run', () => {
  it('a dry run reports the census and writes nothing', async () => {
    const store = makeStore();
    const chain = newChain();
    seedCensus(store, chain);
    const before = store.db.dump();

    const report = await runReseal(store, request(), makeDeps(store, chain));
    expect(store.db.dump()).to.equal(before);
    expect(report).to.deep.include({ dryRun: true, processed: 3, nextCursor: null });
    expect(report.needsDecision).to.deep.equal([]);

    const escrowed = report.sealed.find((s: any) => s.askId === ESCROW_ASK);
    expect(escrowed).to.deep.include({ status: 'resolved', funding: 'escrowed', resolveKind: 'escrow', escrowSource: 'escrowFor', written: false });
    expect(report.sealed.find((s: any) => s.askId === ON_ASK)).to.deep.include({ status: 'resolved', resolveKind: 'legacy' });
    expect(report.sealed.find((s: any) => s.askId === OPEN_ASK)).to.deep.include({ status: 'open', origin: 'legacy' });

    expect(report.acceptances.map((a: any) => [a.answerId, a.kind, a.logIndex])).to.have.deep.members([
      [ESCROW_ANSWER, 'escrow-seat', 355],
      [ON_ANSWER, 'transfer', 447],
    ]);
  });

  it('apply writes valid seals, records and registry entries; a second run has nothing to do', async () => {
    const store = makeStore();
    const chain = newChain();
    seedCensus(store, chain);

    const applied = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(applied.anomalies.filter((a: any) => a.code !== 'closed_on_chain_unrecorded')).to.deep.equal([]);
    expect(applied.sealed.every((s: any) => s.written)).to.equal(true);

    const escrowState = readSealedState(store.keys, ESCROW_ASK, store.db.docs.get(`asks/${ESCROW_ASK}/sealed/state`).data);
    expect(escrowState.kind).to.equal('valid');
    expect(escrowState.value).to.deep.include({
      status: 'resolved',
      funding: 'escrowed',
      resolveKind: 'escrow',
      resolveTxHash: RESOLVE_TX,
      resolvedAt: RESOLVE_BLOCK_SEC * 1000,
      origin: 'legacy',
      author: AUTHOR,
    });

    const seat = readAcceptance(store.keys, ESCROW_ASK, ESCROW_ANSWER, store.db.docs.get(`asks/${ESCROW_ASK}/acceptances/${ESCROW_ANSWER}`).data);
    expect(seat.kind).to.equal('valid');
    expect(seat.value).to.deep.include({ kind: 'escrow-seat', logIndex: 355, from: CONTRACT });
    const regId = payoutRegistryId(8453, TX_447, 447);
    const entry = store.db.docs.get(`askAnswerContent/_registry/payouts/${regId}`);
    expect(readRegistry(store.keys, regId, entry.data).value).to.deep.include({ askId: ON_ASK, answerId: ON_ANSWER });

    // Lustra: licznik z rekordow, liczba odpowiedzi z zapytania, logIndex przy odpowiedzi.
    expect(store.db.docs.get(`asks/${ON_ASK}`).data).to.deep.include({ status: 'resolved', acceptedCount: 1, answerCount: 2 });
    expect(store.db.docs.get(`askAnswers/${ON_ANSWER}`).data.payoutLogIndex).to.equal(447);
    expect(readSealedState(store.keys, OPEN_ASK, store.db.docs.get(`asks/${OPEN_ASK}/sealed/state`).data).value.status).to.equal('open');

    const verifyCalls = chain.calls.verify;
    const again = await runReseal(store, request(), makeDeps(store, chain));
    expect(again.sealed).to.deep.equal([]);
    expect(again.acceptances).to.deep.equal([]);
    expect(again.mirrorRepairs).to.deep.equal([]);
    expect(again.asks.map((a: any) => a.outcome)).to.deep.equal(['unchanged', 'unchanged', 'unchanged']);
    // Zapieczetowane przyjecia nie wymagaja juz RPC.
    expect(chain.calls.verify).to.equal(verifyCalls);
  });

  it('pages through the collection with the cursor', async () => {
    const store = makeStore();
    const chain = newChain();
    seedCensus(store, chain);
    const first = await runReseal(store, request({ limit: 2 }), makeDeps(store, chain));
    expect(first.processed).to.equal(2);
    expect(first.nextCursor).to.equal(first.asks[1].askId);
    const second = await runReseal(store, request({ limit: 2, cursor: first.nextCursor }), makeDeps(store, chain));
    expect(second.processed).to.equal(1);
    expect(second.nextCursor).to.equal(null);
  });
});

describe('asks reseal engine: owner decisions', () => {
  const WEAK_ASK = 'weakAsk0000000000001';
  const WEAK_ANSWER = 'answerWeak0000000001';

  function seedWeak(store: any, chain: Chain) {
    seed(store, `asks/${WEAK_ASK}`, legacyPub({ status: 'resolved', answerCount: 1, acceptedCount: 1 }));
    seed(store, `askAnswers/${WEAK_ANSWER}`, {
      askId: WEAK_ASK,
      author: ANSWERER,
      createdAt: NOW - 5000,
      accepted: true,
      payoutTxHash: TX_WEAK,
      payoutAmount: 0.5,
      acceptedAt: NOW - 1000,
    });
    chain.verdicts[WEAK_ANSWER] = { kind: 'weak', txHash: TX_WEAK, payee: ANSWERER, candidates: [transfer(9, 500000n, STRANGER)] };
  }

  it('an undecided weak payment leaves the Ask unsealed and unchanged, even with apply', async () => {
    const store = makeStore();
    const chain = newChain();
    seedWeak(store, chain);
    const before = store.db.dump();
    const report = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(store.db.dump()).to.equal(before);
    expect(report.needsDecision).to.have.length(1);
    expect(report.needsDecision[0]).to.deep.include({ askId: WEAK_ASK, answerId: WEAK_ANSWER, verdict: 'weak' });
    expect(report.asks[0].outcome).to.equal('needs_decision');
  });

  it('trustWeak seals it as legacy-weak and the Ask as resolved', async () => {
    const store = makeStore();
    const chain = newChain();
    seedWeak(store, chain);
    const report = await runReseal(store, request({ apply: true, trustWeak: [WEAK_ANSWER] }), makeDeps(store, chain));
    expect(report.needsDecision).to.deep.equal([]);
    const record = readAcceptance(store.keys, WEAK_ASK, WEAK_ANSWER, store.db.docs.get(`asks/${WEAK_ASK}/acceptances/${WEAK_ANSWER}`).data);
    expect(record.value).to.deep.include({ kind: 'legacy-weak', from: STRANGER });
    expect(readSealedState(store.keys, WEAK_ASK, store.db.docs.get(`asks/${WEAK_ASK}/sealed/state`).data).value.status).to.equal('resolved');
  });

  it('resetForged clears a forged acceptance and seals the Ask open (forged_resolve)', async () => {
    const store = makeStore();
    const chain = newChain();
    seedWeak(store, chain);
    chain.verdicts[WEAK_ANSWER] = { kind: 'forged', reason: 'no_matching_payment' };
    const report = await runReseal(store, request({ apply: true, resetForged: [WEAK_ANSWER] }), makeDeps(store, chain));
    expect(report.resets).to.deep.equal([{ askId: WEAK_ASK, answerId: WEAK_ANSWER, written: true }]);
    const answer = store.db.docs.get(`askAnswers/${WEAK_ANSWER}`).data;
    expect(answer).to.deep.include({ accepted: false, payoutTxHash: null });
    expect(answer).to.not.have.property('payoutAmount');
    expect(answer).to.not.have.property('acceptedAt');
    expect(store.db.docs.get(`asks/${WEAK_ASK}`).data).to.deep.include({ status: 'open', acceptedCount: 0 });
    expect(report.sealed[0].labels).to.include('forged_resolve');
  });

  it('a fake escrow is sealed as on-resolve and its mirror loses the escrow fields', async () => {
    const store = makeStore();
    const chain = newChain();
    seed(store, 'asks/fakeEscrow000000001', legacyPub({ funding: 'escrowed', escrowTxHash: JUNK_TX, escrowChainId: 8453 }));
    const report = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(report.sealed[0].labels).to.include('fake_escrow');
    const mirror = store.db.docs.get('asks/fakeEscrow000000001').data;
    expect(mirror.funding).to.equal('on-resolve');
    expect(mirror).to.not.have.property('escrowTxHash');
    expect(mirror).to.not.have.property('escrowChainId');
  });
});

describe('asks reseal engine: deletes, broken seals, races and outages', () => {
  it('deleteUnverified removes an unsealed Ask without answers or escrow, with its guard docs', async () => {
    const store = makeStore();
    const chain = newChain();
    seed(store, 'asks/spoofAsk000000000001', legacyPub({ author: STRANGER }));
    seed(store, `asks/spoofAsk000000000001/answerers/${ANSWERER}`, { v: 1 });
    seed(store, 'asks/spoofAsk000000000002', legacyPub({ author: STRANGER, answerCount: 0 }));
    seed(store, 'askAnswers/spoofAnswer000000001', { askId: 'spoofAsk000000000002', author: ANSWERER, accepted: false });
    seed(store, 'asks/spoofAsk000000000003', legacyPub());
    chain.onchain.spoofAsk000000000003 = { funded: true, open: true, perAnswerUnits: 1n, deadlineSec: 1n, seatsLeft: 1 };

    const report = await runReseal(
      store,
      request({ apply: true, deleteUnverified: ['spoofAsk000000000001', 'spoofAsk000000000002', 'spoofAsk000000000003'] }),
      makeDeps(store, chain)
    );
    expect(report.deleted).to.deep.equal([{ askId: 'spoofAsk000000000001', written: true }]);
    expect(store.db.docs.has('asks/spoofAsk000000000001')).to.equal(false);
    expect(store.db.docs.has(`asks/spoofAsk000000000001/answerers/${ANSWERER}`)).to.equal(false);
    // Z odpowiedzia i z depozytem escrow - odmowa, nic nie skasowane ani zapieczetowane.
    expect(store.db.docs.has('asks/spoofAsk000000000002')).to.equal(true);
    expect(store.db.docs.has('asks/spoofAsk000000000003')).to.equal(true);
    expect(store.db.docs.has('asks/spoofAsk000000000002/sealed/state')).to.equal(false);
    expect(report.anomalies.filter((a: any) => a.code === 'delete_refused').map((a: any) => a.askId)).to.deep.equal([
      'spoofAsk000000000002',
      'spoofAsk000000000003',
    ]);
  });

  it('an Ask id outside isDocId is only reported, and can be deleted through the listing ref', async () => {
    const store = makeStore();
    const chain = newChain();
    seed(store, 'asks/bad id-x', legacyPub());
    const report = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(report.asks[0].outcome).to.equal('invalid_id');
    expect(store.db.docs.has('asks/bad id-x/sealed/state')).to.equal(false);
    const deleted = await runReseal(store, request({ apply: true, deleteUnverified: ['bad id-x'] }), makeDeps(store, chain));
    expect(deleted.deleted).to.deep.equal([{ askId: 'bad id-x', written: true }]);
    expect(store.db.docs.has('asks/bad id-x')).to.equal(false);
  });

  it('a state signed with an unknown key is skipped, and repairInvalid refuses to overwrite it', async () => {
    const store = makeStore();
    const chain = newChain();
    seed(store, `asks/${OPEN_ASK}`, legacyPub());
    const foreign = makeStore('some-other-build-secret');
    const state = classify(legacyPub()).state;
    const foreignDoc = sealStateDoc(foreign.key, { ...state, askId: OPEN_ASK, status: 'resolved', resolveKind: 'author', resolvedAt: NOW });
    seed(store, `asks/${OPEN_ASK}/sealed/state`, foreignDoc);

    const skipped = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(skipped.anomalies[0]).to.deep.include({ askId: OPEN_ASK, code: 'state_invalid' });
    expect(readSealedState(store.keys, OPEN_ASK, store.db.docs.get(`asks/${OPEN_ASK}/sealed/state`).data).kind).to.equal('invalid');

    // unknown_kid to pieczec innego klucza (np. produkcja z ASK_SEAL_SECRET),
    // a nie uszkodzenie - naprawa zgubilaby prawdziwe 'resolved'.
    const refused = await runReseal(store, request({ apply: true, repairInvalid: [OPEN_ASK] }), makeDeps(store, chain));
    expect(refused.anomalies[0]).to.deep.include({ askId: OPEN_ASK, code: 'unknown_kid_needs_matching_key' });
    expect(refused.sealed).to.deep.equal([]);
    expect(store.db.docs.get(`asks/${OPEN_ASK}/sealed/state`).data).to.deep.equal(foreignDoc);
  });

  it('repairInvalid re-derives and overwrites a state whose MAC is broken (bad_mac)', async () => {
    const store = makeStore();
    const chain = newChain();
    seed(store, `asks/${OPEN_ASK}`, legacyPub());
    const state = classify(legacyPub()).state;
    const tampered = { ...sealStateDoc(store.key, { ...state, askId: OPEN_ASK }), status: 'resolved' };
    seed(store, `asks/${OPEN_ASK}/sealed/state`, tampered);
    expect(readSealedState(store.keys, OPEN_ASK, tampered)).to.deep.include({ kind: 'invalid', reason: 'bad_mac' });

    const repaired = await runReseal(store, request({ apply: true, repairInvalid: [OPEN_ASK] }), makeDeps(store, chain));
    expect(repaired.sealed[0]).to.deep.include({ askId: OPEN_ASK, mode: 'repair', status: 'open', written: true });
    expect(readSealedState(store.keys, OPEN_ASK, store.db.docs.get(`asks/${OPEN_ASK}/sealed/state`).data).kind).to.equal('valid');
  });

  it('a concurrent answer during the run aborts that Ask without writing anything', async () => {
    const store = makeStore();
    const chain = newChain();
    seedCensus(store, chain);
    chain.onVerify = (row: any) => {
      if (row.id !== ON_ANSWER) return;
      seed(store, 'askAnswers/answerLate0000000001', { askId: ON_ASK, author: '0x3333333333333333333333333333333333333333', accepted: false }, NOW);
    };
    const report = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(report.anomalies).to.deep.include({
      askId: ON_ASK,
      code: 'changed_during_run',
      detail: 'The answers changed while the reseal was running. Run it again.',
    });
    expect(store.db.docs.has(`asks/${ON_ASK}/sealed/state`)).to.equal(false);
    expect(store.db.docs.has(`asks/${ON_ASK}/acceptances/${ON_ANSWER}`)).to.equal(false);
    // Pozostale Aski zapisane normalnie.
    expect(store.db.docs.has(`asks/${ESCROW_ASK}/sealed/state`)).to.equal(true);
  });

  it('RPC trouble never writes: unknown verdicts and escrowFor failures skip the Ask', async () => {
    const store = makeStore();
    const chain = newChain();
    seedCensus(store, chain);
    chain.verdicts[ON_ANSWER] = { kind: 'unknown', reason: 'rpc_error' };
    chain.escrow[ESCROW_ASK] = new Error('escrowFor read failed');
    const report = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    const codes = report.anomalies.map((a: any) => `${a.askId}:${a.code}`);
    expect(codes).to.include(`${ON_ASK}:rpc_error`);
    expect(codes).to.include(`${ESCROW_ASK}:evidence_unavailable`);
    expect(store.db.docs.has(`asks/${ON_ASK}/sealed/state`)).to.equal(false);
    expect(store.db.docs.has(`asks/${ESCROW_ASK}/sealed/state`)).to.equal(false);
  });

  it('an RPC error while looking for the escrow closure also skips (no sealing an open state by accident)', async () => {
    const store = makeStore();
    const chain = newChain();
    seedCensus(store, chain);
    chain.receipts[RESOLVE_TX] = { ok: false, code: 'rpc_error', error: 'timeout' };
    const report = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(report.anomalies.map((a: any) => `${a.askId}:${a.code}`)).to.include(`${ESCROW_ASK}:rpc_error`);
    expect(store.db.docs.has(`asks/${ESCROW_ASK}/sealed/state`)).to.equal(false);
  });

  it('a sealed Ask with a forged mirror gets the mirror repaired, the state untouched', async () => {
    const store = makeStore();
    const chain = newChain();
    seed(store, `asks/${OPEN_ASK}`, legacyPub({ status: 'open', acceptedCount: 5, network: 'solana' }));
    const state = { ...classify(legacyPub()).state, askId: OPEN_ASK, status: 'resolved', resolveKind: 'author', resolvedAt: NOW - 10 };
    seed(store, `asks/${OPEN_ASK}/sealed/state`, sealStateDoc(store.key, state));
    const stateBefore = JSON.stringify(store.db.docs.get(`asks/${OPEN_ASK}/sealed/state`));
    const report = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(report.sealed).to.deep.equal([]);
    expect(report.mirrorRepairs[0].fields).to.include.members(['status', 'acceptedCount', 'network', 'resolvedAt']);
    expect(store.db.docs.get(`asks/${OPEN_ASK}`).data).to.deep.include({ status: 'resolved', acceptedCount: 0, network: 'base' });
    expect(JSON.stringify(store.db.docs.get(`asks/${OPEN_ASK}/sealed/state`))).to.equal(stateBefore);
  });

  it('an existing valid record plus a forged mirror elsewhere: records count, not the mirror', async () => {
    const store = makeStore();
    const chain = newChain();
    seed(store, `asks/${ON_ASK}`, legacyPub({ seats: 2, acceptedCount: 2 }));
    const state = { ...classify(legacyPub()).state, askId: ON_ASK };
    seed(store, `asks/${ON_ASK}/sealed/state`, sealStateDoc(store.key, state));
    seed(store, `askAnswers/${ON_ANSWER}`, { askId: ON_ASK, author: ANSWERER, accepted: true, payoutTxHash: TX_447, payoutLogIndex: 447, payoutAmount: 0.5, payoutToken: 'USDC', payoutNetwork: 'base', acceptedAt: 1 });
    const record = transferAcceptance({ askId: ON_ASK, answerId: ON_ANSWER, payee: ANSWERER, from: AUTHOR, txHash: TX_447, logIndex: 447, units: 500000n });
    seed(store, `asks/${ON_ASK}/acceptances/${ON_ANSWER}`, sealAcceptanceDoc(store.key, record));
    seed(store, `askAnswers/${ON_ANSWER_2}`, { askId: ON_ASK, author: STRANGER, accepted: true, payoutTxHash: JUNK_TX });
    chain.verdicts[ON_ANSWER_2] = { kind: 'forged', reason: 'tx_not_found' };

    const undecided = await runReseal(store, request({ apply: true }), makeDeps(store, chain));
    expect(undecided.needsDecision.map((d: any) => d.answerId)).to.deep.equal([ON_ANSWER_2]);
    // Podrobione drugie przyjecie nie domyka Aska "na komplet".
    expect(readSealedState(store.keys, ON_ASK, store.db.docs.get(`asks/${ON_ASK}/sealed/state`).data).value.status).to.equal('open');

    const decided = await runReseal(store, request({ apply: true, resetForged: [ON_ANSWER_2] }), makeDeps(store, chain));
    expect(decided.resets).to.have.length(1);
    expect(store.db.docs.get(`asks/${ON_ASK}`).data.acceptedCount).to.equal(1);
    expect(readSealedState(store.keys, ON_ASK, store.db.docs.get(`asks/${ON_ASK}/sealed/state`).data).value.status).to.equal('open');
  });
});

/* ------------------------------------------------------------------ */
/*  Bramka admina                                                      */
/* ------------------------------------------------------------------ */

describe('admin gate: isAdminRequest', () => {
  const previous = process.env.AUTH_SESSION_SECRET;
  after(() => {
    if (previous === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previous;
  });

  const cookiesFor = (token: string | undefined) => ({
    cookies: { get: (name: string) => (name === SESSION_COOKIE && token ? { value: token } : undefined) },
  });
  const sessionFor = (address: string) => {
    const now = Math.floor(Date.now() / 1000);
    return createSession({ address, chainId: 8453, issuedAt: now, expiresAt: now + 3600 });
  };

  it('only a signed session of ADMIN_ADDRESS passes; no secret means no admin', () => {
    process.env.AUTH_SESSION_SECRET = 'admin-gate-test-secret';
    expect(isAdminRequest(cookiesFor(sessionFor(AUTHOR_CHECKSUM)))).to.equal(true);
    expect(isAdminRequest(cookiesFor(sessionFor(STRANGER)))).to.equal(false);
    expect(isAdminRequest(cookiesFor(undefined))).to.equal(false);
    const token = sessionFor(AUTHOR_CHECKSUM);
    expect(isAdminRequest(cookiesFor(`${token.split('.')[0]}.forged`))).to.equal(false);
    delete process.env.AUTH_SESSION_SECRET;
    expect(isAdminRequest(cookiesFor(token))).to.equal(false);
  });
});
