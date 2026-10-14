export {};

const { expect } = require('chai');
const {
  BACKED_ARM_MS,
  backedNow,
  cornerShareText,
  fightShareText,
  fightShareUrl,
  heldSide,
  rivalHref,
  roundOfDay,
  sideLogo,
  stripViewOf,
} = require('../app/startpad/perps/clashStripLogic');
const { shareIntentUrl } = require('../app/startpad/shareText');

/**
 * Pasek areny na stronie tokena (ClashStrip.tsx) - czesc, ktora decyduje.
 *
 * Czego te testy pilnuja:
 *   - pasek jest tylko dla pary z OBIEMA stronami; ladowanie, pusta lista, token
 *     spoza starc i starcie bez rywala nie daja nic (strona wyglada jak zawsze);
 *   - ogladajacy "trzyma" strone wylacznie z salda TEGO tokena - o drugim
 *     tokenie nie mowimy nic;
 *   - "You backed" tylko po potwierdzonej transakcji z panelu, nie po kazdym
 *     wzroscie salda (przelew, wejscie z portfela, reczne Refresh);
 *   - link do drugiej strony niesie rynek (?m=), a teksty do postow nie maja
 *     kwot, zyskow ani cen i filtruja obcy ticker.
 */

const A = '0xb200000000000000000000Bc3bd9a122a6910594';
const B = '0xb20000000000000000000068beF64880cBbeE29E';

type Over = Record<string, unknown>;

const token = (over: Over = {}) => ({
  address: A,
  name: 'T',
  symbol: 'MOREBULL',
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

const bearToken = (over: Over = {}) => token({ address: B, symbol: 'MOREBEAR', marketId: 'eth2xs', perpSymbol: 'ETH2xS', mcapUsd: 1972, ...over });

const clash = (a: Over | null, b: Over | null, over: Over = {}) => ({
  id: 'x',
  ticker: 'MORE',
  creator: '0x' + '3'.repeat(40),
  image: null,
  description: null,
  startedAt: 1,
  a: a === null ? null : token(a),
  b: b === null ? null : bearToken(b),
  ...over,
});

describe('stripViewOf', () => {
  it('bez danych (ladowanie, pusta lista, blad) nie rysuje nic', () => {
    expect(stripViewOf(null, A)).to.equal(null);
    expect(stripViewOf(undefined, A)).to.equal(null);
    expect(stripViewOf([], A)).to.equal(null);
  });

  it('token spoza jakiegokolwiek starcia nie dostaje paska', () => {
    expect(stripViewOf([clash({}, {})], '0x' + 'c'.repeat(40))).to.equal(null);
  });

  it('starcie bez drugiej strony nie dostaje paska (z zadnej strony)', () => {
    expect(stripViewOf([clash({}, null)], A)).to.equal(null);
    expect(stripViewOf([clash(null, {})], B)).to.equal(null);
  });

  it('strona A: ja = A, rywal = B, slowa BULL/BEAR', () => {
    const view = stripViewOf([clash({}, {})], A.toLowerCase());
    expect(view.side).to.equal('a');
    expect(view.me.symbol).to.equal('MOREBULL');
    expect(view.rival.symbol).to.equal('MOREBEAR');
    expect(view.bullBear).to.equal(true);
    expect(view.words).to.deep.equal({ a: 'BULL', b: 'BEAR' });
  });

  it('strona B: ja = B, rywal = A, niezaleznie od wielkosci liter adresu', () => {
    const view = stripViewOf([clash({}, {})], B.toUpperCase().replace('0X', '0x'));
    expect(view.side).to.equal('b');
    expect(view.me.symbol).to.equal('MOREBEAR');
    expect(view.rival.symbol).to.equal('MOREBULL');
  });

  it('Asset Clash (ETH vs NVDA) niesie bazy perpow zamiast BULL/BEAR', () => {
    const c = clash({}, { perpSymbol: 'NVDA2xL', marketId: 'nvda2xl' });
    const view = stripViewOf([c], A);
    expect(view.bullBear).to.equal(false);
    expect(view.words).to.deep.equal({ a: 'ETH', b: 'NVDA' });
  });
});

describe('heldSide', () => {
  it('saldo tego tokena > 0 to jego strona', () => {
    expect(heldSide('a', 1n)).to.equal('a');
    expect(heldSide('b', 10n ** 24n)).to.equal('b');
  });

  it('zero, brak odczytu albo brak portfela to nikt', () => {
    expect(heldSide('a', 0n)).to.equal(null);
    expect(heldSide('b', null)).to.equal(null);
    expect(heldSide('b', undefined)).to.equal(null);
  });
});

describe('backedNow', () => {
  const T = 1_000_000;

  it('wzrost salda tuz po potwierdzonej transakcji to "You backed"', () => {
    expect(backedNow({ prev: 0n, next: 500n, armedAt: T, now: T + 4_000 })).to.equal(true);
    expect(backedNow({ prev: 500n, next: 900n, armedAt: T, now: T + 30_000 })).to.equal(true);
  });

  it('bez transakcji z panelu wzrost salda nic nie znaczy (przelew, odswiezenie)', () => {
    expect(backedNow({ prev: 0n, next: 500n, armedAt: null, now: T })).to.equal(false);
  });

  it('pierwszy odczyt to punkt odniesienia, nie zakup', () => {
    expect(backedNow({ prev: null, next: 500n, armedAt: T, now: T + 1 })).to.equal(false);
    expect(backedNow({ prev: 0n, next: null, armedAt: T, now: T + 1 })).to.equal(false);
    expect(backedNow({ prev: 0n, next: undefined, armedAt: T, now: T + 1 })).to.equal(false);
  });

  it('sprzedaz albo brak zmiany to nie zakup', () => {
    expect(backedNow({ prev: 900n, next: 500n, armedAt: T, now: T + 1 })).to.equal(false);
    expect(backedNow({ prev: 500n, next: 500n, armedAt: T, now: T + 1 })).to.equal(false);
  });

  it('uzbrojenie wygasa, a zegar cofniety nie uzbraja', () => {
    expect(backedNow({ prev: 0n, next: 1n, armedAt: T, now: T + BACKED_ARM_MS })).to.equal(true);
    expect(backedNow({ prev: 0n, next: 1n, armedAt: T, now: T + BACKED_ARM_MS + 1 })).to.equal(false);
    expect(backedNow({ prev: 0n, next: 1n, armedAt: T, now: T - 1 })).to.equal(false);
  });
});

describe('rivalHref', () => {
  it('adres malymi literami i rynek rywala w ?m= (zmiana rynku to pelne przeladowanie)', () => {
    expect(rivalHref({ address: B, marketId: 'eth2xs' })).to.equal('/startpad/0xb20000000000000000000068bef64880cbbee29e?m=eth2xs');
  });
});

describe('roundOfDay', () => {
  it('stoi przez cala dobe UTC i rosnie o 1 o polnocy', () => {
    const midnight = Date.UTC(2026, 9, 14, 0, 0, 0);
    expect(roundOfDay(midnight)).to.equal(roundOfDay(midnight + 86_399_999));
    expect(roundOfDay(midnight + 86_400_000)).to.equal(roundOfDay(midnight) + 1);
  });
});

describe('sideLogo', () => {
  it('Blob (profil) wygrywa z obrazkiem z metadanych, a bez obu sa inicjaly', () => {
    const t = { address: A, image: 'data:image/webp;base64,AAAA' };
    expect(sideLogo(t, { [A.toLowerCase()]: 'https://blob/x.png' })).to.equal('https://blob/x.png');
    expect(sideLogo(t, {})).to.equal('data:image/webp;base64,AAAA');
    expect(sideLogo({ address: A, image: null }, {})).to.equal(undefined);
  });
});

describe('teksty i linki do udostepniania', () => {
  const view = stripViewOf([clash({}, {})], A);

  it('walka: ten sam tekst co plakat, bez liczb', () => {
    expect(fightShareText(view)).to.equal('$MORE: Bull vs Bear. Pick a side.');
  });

  it('"Share your corner" niesie druzyne ogladanego tokena', () => {
    expect(cornerShareText(view)).to.equal("I'm on Team BULL in $MORE: Bull vs Bear. Pick a side.");
    expect(cornerShareText(stripViewOf([clash({}, {})], B))).to.equal("I'm on Team BEAR in $MORE: Bull vs Bear. Pick a side.");
  });

  it('Asset Clash: druzyna to baza perpa', () => {
    const c = clash({}, { perpSymbol: 'NVDA2xL', marketId: 'nvda2xl' });
    expect(cornerShareText(stripViewOf([c], B))).to.equal("I'm on Team NVDA in $MORE: ETH vs NVDA. Pick a side.");
  });

  it('tekst nie mowi o cenach, zyskach ani zwrotach', () => {
    const banned = /\b(price|profit|gain|gains|return|returns|pump|moon|win|wins|winning|apy|roi)\b|\d/i;
    expect(fightShareText(view)).not.to.match(banned);
    expect(cornerShareText(view).replace(/\$MORE/, '')).not.to.match(banned);
  });

  it('obcy ticker przechodzi sito (bez nowych linii, linkow i spacji)', () => {
    const hostile = stripViewOf([clash({}, {}, { ticker: 'MO RE\nhttps://evil.example @x' })], A);
    const text = cornerShareText(hostile);
    expect(text).not.to.match(/[\n\s]{2,}|https?:|@/);
    expect(text).to.contain('$MORE');
  });

  it('link do plakatu: oba adresy malymi literami, a przed b, runda dnia w ?r=', () => {
    const now = Date.UTC(2026, 9, 14, 12, 0, 0);
    const expected = `https://mysphere.fun/perps/clash/${A.toLowerCase()}-${B.toLowerCase()}/?r=${roundOfDay(now)}`;
    expect(fightShareUrl(view, now)).to.equal(expected);
    // Ta sama para widziana z drugiej strony daje ten sam adres (jeden plakat na pare).
    expect(fightShareUrl(stripViewOf([clash({}, {})], B), now)).to.equal(expected);
  });

  it('intencja X niesie tekst i adres plakatu', () => {
    const url = shareIntentUrl('x', { text: cornerShareText(view), url: fightShareUrl(view, 0) });
    expect(url.startsWith('https://x.com/intent/tweet?')).to.equal(true);
    const params = new URL(url).searchParams;
    expect(params.get('text')).to.equal("I'm on Team BULL in $MORE: Bull vs Bear. Pick a side.");
    expect(params.get('url')).to.contain('/perps/clash/');
  });
});
