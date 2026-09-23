export {};

// Dowody z kontraktu AskEscrow (app/utils/asks/escrowProofCore.ts) na logach
// zakodowanych viem-em - bez RPC. Runner: scripts/test-asks-seals.cjs.
// Wartosci "census" pochodza z przegladu lancucha z 2026-09-23 (jedyny Ask
// escrow na Base: mGlRpEtdsvBfG7O8jHjd).
const { expect } = require('chai');
const { encodeAbiParameters, encodeEventTopics } = require('viem');
const {
  ASK_ESCROW_ABI,
  answerIdToBytes32,
  askIdToBytes32,
  escrowKeyFor,
} = require('../app/utils/asks/escrow');
const {
  checkFundedAgainstDraft,
  findAskExpired,
  findAskFunded,
  findAskResolved,
  findSeatAwards,
  hasAskResolved,
  legacyEscrowFromChain,
} = require('../app/utils/asks/escrowProofCore');

const ASK_ID = 'mGlRpEtdsvBfG7O8jHjd';
const ANSWER_ID = 'EDXl12VbGzece55mcSNp';
const AUTHOR = '0xD4885A5aa53446843CABcDE1F35DE9b4E906030e';
const WINNER = '0xDf1e757062D7E6ef19BAb6D6B1aa6f9fA44a09Eb';
const OTHER = '0x2222222222222222222222222222222222222222';
const CONTRACT = '0xD5f65Cfbe6A1AA1B6f82CBE0A336DDFCD39a5340';
const IMPOSTOR = '0x3333333333333333333333333333333333333333';
const FUND_TX = `0x${'ce'.repeat(32)}`;

const KEY = '0x847daf6f1a63932fddcc4f2606a9bcbaa34da6de371713f2f45df049d43fdc36';
const ASK_BYTES = '0x82be445b53df50c0b759b1572400952e4e2bb48270df1a28c55481680cb3f7b5';

/** Czas bloku fund z census (17:08:11Z) i termin z logu AskFunded. */
const FUND_BLOCK_SEC = 1786208891;
const DEADLINE_SEC = 1786468085n;
const DEADLINE_MS = 1786468085839;

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

const funded = (overrides: Record<string, unknown> = {}, logIndex = 236, address = CONTRACT) =>
  escrowLog(
    'AskFunded',
    { key: KEY, author: AUTHOR, askId: ASK_BYTES, perAnswer: 5000000n, seats: 1, deadline: DEADLINE_SEC, ...overrides },
    logIndex,
    address
  );

describe('ask escrow proof: ids', () => {
  it('escrowKeyFor and askIdToBytes32 match the on-chain census', () => {
    expect(askIdToBytes32(ASK_ID)).to.equal(ASK_BYTES);
    expect(escrowKeyFor(AUTHOR, ASK_ID)).to.equal(KEY);
    expect(escrowKeyFor(AUTHOR.toLowerCase(), ASK_ID)).to.equal(KEY);
  });
});

describe('ask escrow proof: findAskFunded', () => {
  const want = { contract: CONTRACT, key: KEY, author: AUTHOR, askIdBytes: ASK_BYTES };

  it('finds the census AskFunded', () => {
    const event = findAskFunded([funded()], want);
    expect(event).to.deep.equal({
      logIndex: 236,
      key: KEY,
      author: AUTHOR.toLowerCase(),
      askId: ASK_BYTES,
      perAnswer: 5000000n,
      seats: 1,
      deadline: DEADLINE_SEC,
    });
  });

  it('ignores the same event from another contract', () => {
    expect(findAskFunded([funded({}, 1, IMPOSTOR)], want)).to.equal(null);
  });

  it('ignores another key, author or askId', () => {
    const otherKey = escrowKeyFor(OTHER, ASK_ID);
    expect(findAskFunded([funded({ key: otherKey, author: OTHER })], want)).to.equal(null);
    expect(findAskFunded([funded({ askId: askIdToBytes32('someOtherAsk00000000') })], want)).to.equal(null);
  });

  it('reports two matches as ambiguous', () => {
    expect(findAskFunded([funded({}, 1), funded({}, 2)], want)).to.equal('ambiguous');
  });
});

describe('ask escrow proof: checkFundedAgainstDraft', () => {
  const event = { perAnswer: 5000000n, seats: 1, deadline: DEADLINE_SEC };
  const draft = { budget: 5, seats: 1, deadlineMs: DEADLINE_MS, blockTimeSec: FUND_BLOCK_SEC };

  it('census values give no mismatches', () => {
    expect(checkFundedAgainstDraft(event, draft)).to.deep.equal([]);
  });

  it('per_answer off by one unit', () => {
    expect(checkFundedAgainstDraft({ ...event, perAnswer: 5000001n }, draft)).to.deep.equal(['per_answer']);
  });

  it('seats', () => {
    expect(checkFundedAgainstDraft({ ...event, seats: 2 }, draft)).to.deep.equal(['seats']);
  });

  it('deadline +1 s', () => {
    expect(checkFundedAgainstDraft({ ...event, deadline: DEADLINE_SEC + 1n }, draft)).to.deep.equal(['deadline']);
  });

  it('499999 units is below the app minimum', () => {
    expect(
      checkFundedAgainstDraft({ ...event, perAnswer: 499999n }, { ...draft, budget: 0.49 })
    ).to.include('below_minimum');
    expect(checkFundedAgainstDraft({ ...event, perAnswer: 490000n }, { ...draft, budget: 0.49 })).to.deep.equal([
      'below_minimum',
    ]);
  });

  it('too_long beyond 7 days + 1 h, past at or before the block', () => {
    const far = BigInt(FUND_BLOCK_SEC + 7 * 24 * 3600 + 3601);
    expect(
      checkFundedAgainstDraft({ ...event, deadline: far }, { ...draft, deadlineMs: Number(far) * 1000 })
    ).to.deep.equal(['too_long']);
    const edge = BigInt(FUND_BLOCK_SEC + 7 * 24 * 3600 + 3600);
    expect(checkFundedAgainstDraft({ ...event, deadline: edge }, { ...draft, deadlineMs: Number(edge) * 1000 })).to.deep.equal([]);
    const past = BigInt(FUND_BLOCK_SEC);
    expect(
      checkFundedAgainstDraft({ ...event, deadline: past }, { ...draft, deadlineMs: Number(past) * 1000 })
    ).to.deep.equal(['past']);
  });

  it('a budget that gives nothing per answer is a per_answer mismatch, not a throw', () => {
    expect(checkFundedAgainstDraft(event, { ...draft, budget: 0 })).to.include('per_answer');
  });
});

describe('ask escrow proof: SeatAwarded / AskResolved / AskExpired', () => {
  const want = { contract: CONTRACT, key: KEY };
  const answerRef = answerIdToBytes32(ANSWER_ID);
  const otherKey = escrowKeyFor(OTHER, ASK_ID);

  const logs = [
    escrowLog('SeatAwarded', { key: KEY, recipient: WINNER, answerRef, amount: 5000000n }, 355),
    escrowLog('AskResolved', { key: KEY, author: AUTHOR, seatsAwarded: 1, refundToAuthor: 0n }, 356),
    escrowLog('SeatAwarded', { key: otherKey, recipient: WINNER, answerRef, amount: 5000000n }, 357),
    escrowLog('SeatAwarded', { key: KEY, recipient: WINNER, answerRef, amount: 5000000n }, 358, IMPOSTOR),
  ];

  it('findSeatAwards returns only this Ask\'s awards from the escrow contract', () => {
    expect(findSeatAwards(logs, want)).to.deep.equal([
      { logIndex: 355, recipient: WINNER.toLowerCase(), answerRef, amount: 5000000n },
    ]);
  });

  it('hasAskResolved / findAskResolved', () => {
    expect(hasAskResolved(logs, want)).to.equal(true);
    expect(findAskResolved(logs, want)).to.deep.equal({ logIndex: 356, seatsAwarded: 1, refundToAuthor: 0n });
    expect(hasAskResolved(logs, { contract: CONTRACT, key: otherKey })).to.equal(false);
    expect(hasAskResolved(logs, { contract: IMPOSTOR, key: KEY })).to.equal(false);
  });

  it('findAskExpired decodes the new ABI entry', () => {
    const expired = [
      escrowLog('AskExpired', { key: otherKey, author: OTHER, refundToAuthor: 1n, fee: 0n }, 11),
      escrowLog('AskExpired', { key: KEY, author: AUTHOR, refundToAuthor: 4875000n, fee: 125000n }, 12),
    ];
    expect(findAskExpired(expired, want)).to.deep.equal({
      logIndex: 12,
      author: AUTHOR.toLowerCase(),
      refundToAuthor: 4875000n,
      fee: 125000n,
    });
    expect(findAskExpired(logs, want)).to.equal(null);
    expect(findAskExpired([expired[1]], { contract: IMPOSTOR, key: KEY })).to.equal(null);
  });
});

describe('ask escrow proof: legacyEscrowFromChain', () => {
  const onchain = { funded: true, open: false, perAnswerUnits: 5000000n, deadlineSec: DEADLINE_SEC, seatsLeft: 0 };
  const pub = { author: AUTHOR, budget: 5, seats: 1, deadline: DEADLINE_MS, funding: 'escrowed', escrowTxHash: '0xjunk' };

  it('takes perAnswer and deadline from escrowFor even when pub.escrowTxHash is junk', () => {
    const result = legacyEscrowFromChain(pub, onchain, { chainId: 8453, contract: CONTRACT, verifiedFundTxHash: null });
    expect(result.escrow).to.deep.equal({
      chainId: 8453,
      contract: CONTRACT.toLowerCase(),
      fundTxHash: null,
      perAnswerUnits: '5000000',
      seats: 1,
      deadlineSec: '1786468085',
      source: 'escrowFor',
    });
    expect(result.anomalies).to.deep.equal(['fund_tx_unverified']);
  });

  it('keeps a verified fund hash, lowercase', () => {
    const result = legacyEscrowFromChain(
      { ...pub, escrowTxHash: FUND_TX },
      onchain,
      { chainId: 8453, contract: CONTRACT, verifiedFundTxHash: FUND_TX.toUpperCase().replace('0X', '0x') }
    );
    expect(result.escrow.fundTxHash).to.equal(FUND_TX);
    expect(result.anomalies).to.deep.equal([]);
  });

  it('reports doc/chain disagreements as anomalies, chain wins', () => {
    const result = legacyEscrowFromChain(
      { ...pub, budget: 6, deadline: DEADLINE_MS + 5000 },
      onchain,
      { chainId: 8453, contract: CONTRACT, verifiedFundTxHash: null }
    );
    expect(result.escrow.perAnswerUnits).to.equal('5000000');
    expect(result.escrow.deadlineSec).to.equal('1786468085');
    expect(result.anomalies).to.include.members(['per_answer_mismatch', 'deadline_mismatch']);
  });

  it('a key that was never funded gives null (fake escrow)', () => {
    expect(
      legacyEscrowFromChain(pub, { ...onchain, funded: false, perAnswerUnits: 0n }, {
        chainId: 8453,
        contract: CONTRACT,
        verifiedFundTxHash: null,
      })
    ).to.equal(null);
  });
});
