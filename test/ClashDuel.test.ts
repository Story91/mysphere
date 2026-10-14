export {};

const { expect } = require('chai');
const { clashPhase, clashKoWinner, clashVerdict, clashSharePct, fightOfTheDay, findClashOf, sideTraded } = require('../app/startpad/duel');

/**
 * Fazy i werdykt starcia Bull vs Bear / Asset Clash.
 *
 * Miejsce, w ktorym ta karta klamala: kapitalizacja w USD to cena w perpie razy
 * NAV perpa, wiec przed pierwszym zakupem jedna strona "prowadzila" z samej
 * roznicy NAV (ETH2xS 1.05 vs ETH2xL 0.84 dawalo "BEAR LEADS 56%", a jedyny
 * kupujacy byl po stronie BULL). Testy pilnuja, ze:
 *   - przed zakupami po OBU stronach nie ma lidera, a lina stoi na 50/50;
 *   - werdykt rozroznia kapitalizacje (z NAV) od handlu (bez NAV);
 *   - KO to dokladnie jedna strona z zapelniona krzywa.
 */

type Side = Record<string, unknown>;

const side = (over: Side = {}) => ({
  address: '0x' + '1'.repeat(40),
  name: 'T',
  symbol: 'T',
  marketId: 'eth2xl',
  perpSymbol: 'ETH2xL',
  state: 'Curve',
  raised: 0,
  priceInPerp: 0.000001875,
  sinceLaunchPct: 0,
  image: null,
  mcapUsd: 1574,
  perpChange24h: null,
  launchpad: '0x' + '2'.repeat(40),
  ...over,
});

const clash = (a: Side | null, b: Side | null, id = 'x') => ({
  id,
  ticker: 'MORE',
  creator: '0x' + '3'.repeat(40),
  image: null,
  description: null,
  startedAt: 1,
  a: a === null ? null : side({ address: '0x' + 'a'.repeat(40), symbol: 'MOREBULL', ...a }),
  b: b === null ? null : side({ address: '0x' + 'b'.repeat(40), symbol: 'MOREBEAR', perpSymbol: 'ETH2xS', marketId: 'eth2xs', mcapUsd: 1972, ...b }),
});

describe('sideTraded', () => {
  it('strona bez zakupu albo z zaokragleniem ceny nie "zadala ciosu"', () => {
    expect(sideTraded(null)).to.equal(false);
    expect(sideTraded(side())).to.equal(false);
    expect(sideTraded(side({ raised: 0.0001, sinceLaunchPct: 0.0001 }))).to.equal(false);
  });

  it('realny zakup albo zapelniona krzywa to cios', () => {
    expect(sideTraded(side({ raised: 0.294, sinceLaunchPct: 0.03 }))).to.equal(true);
    expect(sideTraded(side({ state: 'Locked' }))).to.equal(true);
    expect(sideTraded(side({ state: 'Graduated' }))).to.equal(true);
  });
});

describe('clashPhase', () => {
  it('bez zakupow po obu stronach to warmup - przewaga NAV nie jest wynikiem', () => {
    expect(clashPhase(clash({}, {}))).to.equal('warmup');
  });

  it('zakup tylko po stronie BULL (stan MORE na zywo 14.10) nadal jest warmup', () => {
    expect(clashPhase(clash({ raised: 0.294, sinceLaunchPct: 0.03 }, {}))).to.equal('warmup');
  });

  it('starcie bez drugiej strony czeka', () => {
    expect(clashPhase(clash({ raised: 1, sinceLaunchPct: 1 }, null))).to.equal('warmup');
  });

  it('zakupy po obu stronach to bijatyka', () => {
    expect(clashPhase(clash({ raised: 1, sinceLaunchPct: 0.1 }, { raised: 2, sinceLaunchPct: 0.2 }))).to.equal('brawl');
  });

  it('dokladnie jedna strona z zapelniona krzywa to KO, a zwyciezca to ona', () => {
    const c = clash({ state: 'Locked', raised: 7500, sinceLaunchPct: 2400 }, { raised: 5, sinceLaunchPct: 0.2 });
    expect(clashPhase(c)).to.equal('ko');
    expect(clashKoWinner(c)).to.equal('a');
    const d = clash({ raised: 5, sinceLaunchPct: 0.2 }, { state: 'Graduated' });
    expect(clashKoWinner(d)).to.equal('b');
  });

  it('obie strony zapelnione to nie KO (nikt nie byl pierwszy z samego pola stanu)', () => {
    const c = clash({ state: 'Locked' }, { state: 'Locked' });
    expect(clashPhase(c)).to.equal('brawl');
    expect(clashKoWinner(c)).to.equal(null);
  });
});

describe('clashVerdict', () => {
  it('przed bijatyka werdyktu nie ma', () => {
    expect(clashVerdict(clash({}, {})).kind).to.equal('early');
  });

  it('kapitalizacja i handel wskazuja ta sama strone: unanimous', () => {
    const v = clashVerdict(clash({ raised: 1, sinceLaunchPct: 0.1, mcapUsd: 1000 }, { raised: 2, sinceLaunchPct: 0.4, mcapUsd: 3000 }));
    expect(v).to.deep.equal({ kind: 'unanimous', cap: 'b', trading: 'b' });
  });

  it('rozne strony: split decision (BEAR ma wyzszy NAV, BULL wiecej handlu)', () => {
    const v = clashVerdict(clash({ raised: 5, sinceLaunchPct: 0.5, mcapUsd: 1574 }, { raised: 1, sinceLaunchPct: 0.05, mcapUsd: 1972 }));
    expect(v).to.deep.equal({ kind: 'split', cap: 'b', trading: 'a' });
  });

  it('remis handlu to za wczesnie na werdykt', () => {
    const v = clashVerdict(clash({ raised: 1, sinceLaunchPct: 0.1 }, { raised: 1, sinceLaunchPct: 0.1 }));
    expect(v.kind).to.equal('early');
    expect(v.trading).to.equal(null);
  });
});

describe('clashSharePct', () => {
  it('w warmup lina stoi na 50/50 mimo roznicy NAV', () => {
    expect(clashSharePct(clash({ mcapUsd: 1574 }, { mcapUsd: 1972 }))).to.equal(50);
  });

  it('w bijatyce to udzial strony A w sumie kapitalizacji', () => {
    const share = clashSharePct(clash({ raised: 1, sinceLaunchPct: 0.1, mcapUsd: 1000 }, { raised: 1, sinceLaunchPct: 0.1, mcapUsd: 3000 }));
    expect(share).to.equal(25);
  });

  it('bez wyceny jednej strony (Flash nie odpowiada) nie zgaduje - 50/50', () => {
    expect(clashSharePct(clash({ raised: 1, sinceLaunchPct: 0.1, mcapUsd: null }, { raised: 1, sinceLaunchPct: 0.1, mcapUsd: 3000 }))).to.equal(50);
  });
});

describe('fightOfTheDay i findClashOf', () => {
  it('bez starc nie ma walki dnia, a starcie z jedna strona sie nie liczy', () => {
    expect(fightOfTheDay([])).to.equal(null);
    expect(fightOfTheDay([clash({ raised: 1, sinceLaunchPct: 1 }, null)])).to.equal(null);
  });

  it('wybiera bijatyke najblizsza 50/50, a bez bijatyki najnowsze', () => {
    const lopsided = clash({ raised: 1, sinceLaunchPct: 0.1, mcapUsd: 1000 }, { raised: 1, sinceLaunchPct: 0.1, mcapUsd: 9000 }, 'lop');
    const close = clash({ raised: 1, sinceLaunchPct: 0.1, mcapUsd: 1000 }, { raised: 1, sinceLaunchPct: 0.1, mcapUsd: 1100 }, 'close');
    expect(fightOfTheDay([lopsided, close]).id).to.equal('close');
    const fresh = clash({}, {}, 'fresh');
    const old = clash({}, {}, 'old');
    expect(fightOfTheDay([fresh, old]).id).to.equal('fresh');
  });

  it('znajduje strone tokena niezaleznie od wielkosci liter adresu', () => {
    const c = clash({}, {});
    const hit = findClashOf([c], '0x' + 'B'.repeat(40));
    expect(hit && hit.side).to.equal('b');
    expect(findClashOf([c], '0x' + 'c'.repeat(40))).to.equal(null);
  });
});
