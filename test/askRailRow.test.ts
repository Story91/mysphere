export {};

// Czysta logika wiersza Aska w prawym railu (app/basechat/components/AskRailRow.tsx)
// i wspolnego z AskCard formatu "3h ago" - bez przegladarki i bez Reacta DOM.
//
// Awatar podmieniamy w require.cache PRZED zaladowaniem AskCard: prawdziwy
// modul ciagnie aliasy `@/...` i hooki tozsamosci, ktore do tych zdan nie maja
// nic do dodania, a pod ts-node w CommonJS sie nie rozwiaza.
const path = require('node:path');
const avatarPath = require.resolve(path.join(__dirname, '..', 'app', 'components', 'identity', 'Avatar'));
require.cache[avatarPath] = {
  id: avatarPath,
  filename: avatarPath,
  loaded: true,
  exports: { AvatarPlaceholder: () => null, Avatar: () => null, default: () => null },
} as unknown as NodeJS.Module;

const { expect } = require('chai');
const { formatAgo } = require('../app/basechat/components/AskCard');
const { resolvedRowMeta } = require('../app/basechat/components/AskRailRow');

/** Cale zdanie tak, jak czyta je patrzacy: kwota, spacja, reszta. */
const line = (ask: unknown, now: number | null): string => {
  const { amount, detail } = resolvedRowMeta(ask, now);
  return `${amount} ${detail}`;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);

/** Rozstrzygniety Ask z escrow - wariant, przy ktorym "paid" byloby nieprawda. */
function resolvedAsk(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ask-1',
    author: '0x1111111111111111111111111111111111111111',
    question: 'What breaks first?',
    budget: 6,
    seats: 3,
    perAnswer: 2,
    token: 'USDC',
    network: 'base',
    deadline: NOW - DAY,
    createdAt: NOW - 3 * DAY,
    status: 'resolved',
    funding: 'escrowed',
    answerCount: 4,
    acceptedCount: 1,
    resolvedAt: NOW - 3 * HOUR,
    ...overrides,
  };
}

describe('Asks: formatAgo (wspolny dla AskCard i AskRailRow)', () => {
  it('ponizej minuty i dla zlych wejsc mowi "just now", nigdy liczby ujemnej', () => {
    expect(formatAgo(0)).to.equal('just now');
    expect(formatAgo(59 * 1000)).to.equal('just now');
    expect(formatAgo(-5 * MINUTE)).to.equal('just now');
    expect(formatAgo(Number.NaN)).to.equal('just now');
  });

  it('schodzi z minut na godziny i dni', () => {
    expect(formatAgo(5 * MINUTE)).to.equal('5m ago');
    expect(formatAgo(2 * HOUR + 59 * MINUTE)).to.equal('2h ago');
    expect(formatAgo(3 * DAY + HOUR)).to.equal('3d ago');
  });
});

describe('Asks: linia meta rozstrzygnietego Aska w railu', () => {
  it('mowi stawke, ile miejsc przyjeto i kiedy zamknieto', () => {
    expect(line(resolvedAsk(), NOW)).to.equal(
      '$2.00 per answer · 1 of 3 accepted · resolved 3h ago'
    );
  });

  it('nie uzywa slow o wyplacie ani o zywym Asku - takze przy escrow', () => {
    for (const funding of ['escrowed', 'on-resolve']) {
      const text = line(resolvedAsk({ funding }), NOW).toLowerCase();
      expect(text).to.not.match(/paid|payout|sealed|slot|left/);
      // Zadnego zegara HH:MM:SS ani "3d 04h" - odliczanie po resolve nic nie znaczy.
      expect(text).to.not.match(/\d{2}:\d{2}:\d{2}|\d+d \d{2}h/);
    }
  });

  it('bez resolvedAt nie zgaduje godziny: "closed"', () => {
    expect(line(resolvedAsk({ resolvedAt: undefined }), NOW)).to.equal(
      '$2.00 per answer · 1 of 3 accepted · closed'
    );
  });

  it('przed zamontowaniem (now === null) tez "closed", bez czasu z serwera', () => {
    expect(line(resolvedAsk(), null)).to.equal('$2.00 per answer · 1 of 3 accepted · closed');
  });

  it('kwota wraca osobno, zeby wiersz mogl ja pokazac w kolorze kwot', () => {
    const { amount, detail } = resolvedRowMeta(resolvedAsk(), NOW);
    expect(amount).to.equal('$2.00');
    expect(detail).to.equal('per answer · 1 of 3 accepted · resolved 3h ago');
  });

  it('token inny niz USDC dostaje swoja nazwe, a nie znak dolara', () => {
    expect(line(resolvedAsk({ token: 'SPHERE', perAnswer: 150 }), NOW)).to.equal(
      '150.00 SPHERE per answer · 1 of 3 accepted · resolved 3h ago'
    );
  });
});
