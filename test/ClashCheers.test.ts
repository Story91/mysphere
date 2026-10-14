export {};

const { expect } = require('chai');
const {
  CHEERS_PER_SIDE,
  CHEER_MAX_CHARS,
  CALLS_LIMIT,
  MAX_CHEER_TOKENS,
  parseTokensParam,
  selectCalls,
  cheerTokens,
  cheerText,
  cheersFromCalls,
  dayRound,
} = require('../app/startpad/perps/cheers');
const { buildClashUrl, buildClashShareText } = require('../app/startpad/shareText');

/**
 * Okrzyki druzyn pod stronami karty starcia i drobiazgi udostepnienia.
 *
 * Tresc jest z lancucha (od obcych), a karta ma pokazac TYLKO glos: tekst, autora,
 * plakietke. Testy pilnuja, ze:
 *   - filtr `?tokens=` odrzuca smieci, nie przepuszcza wiecej niz 40 adresow i
 *     rozroznia "brak filtra" od "filtr bez poprawnych adresow";
 *   - filtr trasy dziala PRZED przycieciem do 100 (cichy pojedynek nie ginie wsrod
 *     najlepszych calli calej Base) i oddaje od najnowszego;
 *   - okrzyki: tylko wskazane tokeny, od najnowszego, po dwa na strone, bez pustych,
 *     bez samego "Team BULL:" z przycisku, bez linkow i adresow;
 *   - w okrzyku nie ma mnoznika ani kwoty, a tekst jest przyciety;
 *   - numer rundy to doba UTC.
 */

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);
const C = '0x' + 'c'.repeat(40);
const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

type Row = Record<string, unknown>;
const call = (over: Row = {}) => ({
  txHash: '0x' + '9'.repeat(64),
  token: A,
  symbol: 'MOREBULL',
  marketId: 'eth2xl',
  quoteSymbol: 'ETH2xL',
  buyer: WALLET,
  verified: false,
  message: 'wagmi',
  paid: 0.5,
  multiple: 2.1,
  ts: 1000,
  ...over,
});

describe('parseTokensParam', () => {
  it('bez parametru albo z pustym nie ma filtra (null), a nie pusty filtr', () => {
    expect(parseTokensParam(null)).to.equal(null);
    expect(parseTokensParam(undefined)).to.equal(null);
    expect(parseTokensParam('')).to.equal(null);
    expect(parseTokensParam('   ')).to.equal(null);
  });

  it('male litery, bez powtorzen, kolejnosc z zapytania', () => {
    const upper = '0x' + 'AB'.repeat(20);
    expect(parseTokensParam(`${B},${A},${upper},${A}`)).to.deep.equal([B, A, upper.toLowerCase()]);
  });

  it('bledne adresy sa pomijane, reszta zostaje', () => {
    expect(parseTokensParam(`nonsense,0x123,${A},${A}0,0x${'g'.repeat(40)},,${B}`)).to.deep.equal([A, B]);
  });

  it('filtr bez ani jednego poprawnego adresu to pusta lista (zero wierszy), nie brak filtra', () => {
    expect(parseTokensParam('nonsense,0x123')).to.deep.equal([]);
  });

  it('bierze najwyzej 40 adresow', () => {
    const many = Array.from({ length: 60 }, (_, i) => '0x' + i.toString(16).padStart(40, '0'));
    const parsed = parseTokensParam(many.join(','));
    expect(parsed).to.have.length(MAX_CHEER_TOKENS);
    expect(parsed[0]).to.equal(many[0]);
    expect(parsed[39]).to.equal(many[39]);
  });
});

describe('selectCalls', () => {
  it('bez filtra oddaje pierwsze 100 w tej samej kolejnosci (jak przed zmiana)', () => {
    const rows = Array.from({ length: 130 }, (_, i) => call({ token: A, ts: i, txHash: String(i) }));
    const out = selectCalls(rows, null);
    expect(out).to.have.length(CALLS_LIMIT);
    expect(out[0]).to.equal(rows[0]);
    expect(out[99]).to.equal(rows[99]);
  });

  it('filtr dziala PRZED przycieciem: cichy token znajduje sie mimo 100 lepszych calli innych', () => {
    const loud = Array.from({ length: 100 }, (_, i) => call({ token: B, multiple: 50 - i / 10, ts: 5000 + i }));
    const quiet = call({ token: A, multiple: 0.9, ts: 10, message: 'ghost town' });
    const rows = [...loud, quiet]; // posortowane wg mnoznika: cichy jest 101.
    expect(selectCalls(rows, null).some((r: Row) => r.token === A)).to.equal(false);
    const out = selectCalls(rows, [A]);
    expect(out).to.have.length(1);
    expect(out[0].message).to.equal('ghost town');
  });

  it('z filtrem oddaje tylko wskazane tokeny (wielkosc liter bez znaczenia), od najnowszego', () => {
    const rows = [call({ token: A, ts: 1 }), call({ token: B, ts: 9 }), call({ token: A.toUpperCase().replace('0X', '0x'), ts: 5 }), call({ token: C, ts: 7 })];
    const out = selectCalls(rows, [A, C]);
    expect(out.map((r: Row) => r.ts)).to.deep.equal([7, 5, 1]);
  });

  it('pusty filtr to zero wierszy, a wejscie zostaje nietkniete', () => {
    const rows = [call({ ts: 1 }), call({ ts: 2 })];
    expect(selectCalls(rows, [])).to.deep.equal([]);
    selectCalls(rows, [A]);
    expect(rows.map((r: Row) => r.ts)).to.deep.equal([1, 2]);
  });

  it('z filtrem tez przycina do limitu, zostawiajac najnowsze', () => {
    const rows = Array.from({ length: 150 }, (_, i) => call({ token: A, ts: i }));
    const out = selectCalls(rows, [A]);
    expect(out).to.have.length(CALLS_LIMIT);
    expect(out[0].ts).to.equal(149);
    expect(out[99].ts).to.equal(50);
  });
});

describe('cheerTokens', () => {
  const token = (address: string) => ({ address });
  it('zbiera adresy a i b wszystkich starc, male litery, bez powtorzen', () => {
    const clashes = [
      { a: token(A.toUpperCase().replace('0X', '0x')), b: token(B) },
      { a: token(C), b: null },
      { a: token(A), b: token(C) },
    ];
    expect(cheerTokens(clashes)).to.deep.equal([A, B, C]);
  });

  it('brak starc to pusta lista, a starcie bez strony nie wywala', () => {
    expect(cheerTokens(null)).to.deep.equal([]);
    expect(cheerTokens(undefined)).to.deep.equal([]);
    expect(cheerTokens([{ a: null, b: null }])).to.deep.equal([]);
  });

  it('nie wychodzi poza 40 adresow', () => {
    const clashes = Array.from({ length: 30 }, (_, i) => ({
      a: token('0x' + (2 * i).toString(16).padStart(40, '0')),
      b: token('0x' + (2 * i + 1).toString(16).padStart(40, '0')),
    }));
    expect(cheerTokens(clashes)).to.have.length(MAX_CHEER_TOKENS);
  });
});

describe('cheerText', () => {
  it('zwykly tekst przechodzi, emoji tez', () => {
    expect(cheerText('wagmi 🚀')).to.equal('wagmi 🚀');
  });

  it('wycina przedrostek "Team BULL:" z przycisku Back i zostawia reszte', () => {
    expect(cheerText('Team BULL: send it')).to.equal('send it');
    expect(cheerText('team nvda:   lfg')).to.equal('lfg');
  });

  it('sam przedrostek albo pusty tekst to nie okrzyk', () => {
    expect(cheerText('Team BULL:')).to.equal(null);
    expect(cheerText('Team BEAR: ')).to.equal(null);
    expect(cheerText('')).to.equal(null);
    expect(cheerText('   ')).to.equal(null);
    expect(cheerText(undefined)).to.equal(null);
    expect(cheerText(42)).to.equal(null);
  });

  it('link i adres sa zasloniete w tabeli, wiec tu ich nie ma wcale', () => {
    expect(cheerText('claim at free-eth.xyz now')).to.equal(null);
    expect(cheerText('https://evil.example/drain')).to.equal(null);
    expect(cheerText('Team BULL: t.me/scam')).to.equal(null);
    expect(cheerText(`send to ${WALLET}`)).to.equal(null);
  });

  it('czysci znaki sterujace i kierunku tekstu', () => {
    expect(cheerText('go‮up\u0000now')).to.equal('goup now');
  });

  it('dlugi tekst jest przyciety do limitu z wielokropkiem', () => {
    const out = cheerText('x'.repeat(300));
    expect(Array.from(out)).to.have.length(CHEER_MAX_CHARS);
    expect(out.endsWith('…')).to.equal(true);
  });

  it('przyciecie nie rozcina pary zastepczej emoji', () => {
    const out = cheerText('🚀'.repeat(200));
    expect(Array.from(out)).to.have.length(CHEER_MAX_CHARS);
    expect(out).to.not.match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe('cheersFromCalls', () => {
  it('bierze tylko wskazane tokeny i klucze to male litery', () => {
    const out = cheersFromCalls([call({ token: A.toUpperCase().replace('0X', '0x'), message: 'one' }), call({ token: B, message: 'two' }), call({ token: C, message: 'three' })], [A, B]);
    expect(Object.keys(out).sort()).to.deep.equal([A, B]);
    expect(out[A][0].text).to.equal('one');
  });

  it('od najnowszego, najwyzej dwa na strone', () => {
    const rows = [1, 2, 3, 4].map((n) => call({ message: `m${n}`, ts: n * 10, txHash: `0x${n}` }));
    const out = cheersFromCalls(rows, [A]);
    expect(CHEERS_PER_SIDE).to.equal(2);
    expect(out[A].map((c: { text: string }) => c.text)).to.deep.equal(['m4', 'm3']);
  });

  it('pomija puste, same przedrostki i zaslonete, a kolejne wiadomosci wskakuja na ich miejsce', () => {
    const rows = [
      call({ message: 'Team BULL:', ts: 50, txHash: '0x5' }),
      call({ message: 'visit scam.xyz', ts: 40, txHash: '0x4' }),
      call({ message: '', ts: 30, txHash: '0x3' }),
      call({ message: 'real one', ts: 20, txHash: '0x2' }),
      call({ message: 'older one', ts: 10, txHash: '0x1' }),
    ];
    expect(cheersFromCalls(rows, [A])[A].map((c: { text: string }) => c.text)).to.deep.equal(['real one', 'older one']);
  });

  it('plakietka tylko przy verified === true, autor skrocony', () => {
    const out = cheersFromCalls([call({ verified: true, ts: 2, txHash: '0x2' }), call({ verified: 'yes', ts: 1, txHash: '0x1', message: 'b' })], [A]);
    expect(out[A][0].verified).to.equal(true);
    expect(out[A][0].who).to.equal('0x1234…5678');
    expect(out[A][1].verified).to.equal(false);
  });

  it('autor bez poprawnego adresu to pusty napis, nie smiec', () => {
    const out = cheersFromCalls([call({ buyer: '<img src=x onerror=alert(1)>' })], [A]);
    expect(out[A][0].who).to.equal('');
  });

  it('ten sam autor i ten sam tekst nie zajmuje obu miejsc', () => {
    const rows = [call({ ts: 3, txHash: '0x3' }), call({ ts: 2, txHash: '0x2' }), call({ message: 'other', ts: 1, txHash: '0x1' })];
    expect(cheersFromCalls(rows, [A])[A].map((c: { text: string }) => c.text)).to.deep.equal(['wagmi', 'other']);
  });

  it('oddaje tylko tekst, autora, plakietke i czas - bez mnoznika, kwoty i rynku', () => {
    const cheer = cheersFromCalls([call()], [A])[A][0];
    expect(Object.keys(cheer).sort()).to.deep.equal(['id', 'text', 'ts', 'verified', 'who']);
    expect(JSON.stringify(cheer)).to.not.match(/2\.1|0\.5|multiple|paid/);
  });

  it('smieciowa odpowiedz nie wywala: nie-tablica, null w srodku, brak pol', () => {
    expect(cheersFromCalls(undefined, [A])).to.deep.equal({});
    expect(cheersFromCalls({ calls: [] }, [A])).to.deep.equal({});
    expect(cheersFromCalls([null, 7, 'x', {}, { token: A }, { token: A, message: 5 }, call({ ts: 'late' })], [A])[A]).to.have.length(1);
  });

  it('bez tokenow albo bez okrzykow nie ma kluczy', () => {
    expect(cheersFromCalls([call()], [])).to.deep.equal({});
    expect(cheersFromCalls([call({ message: 'Team BULL:' })], [A])).to.deep.equal({});
  });
});

describe('dayRound', () => {
  it('to numer doby UTC od epoki', () => {
    expect(dayRound(0)).to.equal(0);
    expect(dayRound(86_399_999)).to.equal(0);
    expect(dayRound(86_400_000)).to.equal(1);
    expect(dayRound(Date.UTC(2026, 9, 14, 23, 59, 59))).to.equal(dayRound(Date.UTC(2026, 9, 14, 0, 0, 0)));
    expect(dayRound(Date.UTC(2026, 9, 15, 0, 0, 0))).to.equal(dayRound(Date.UTC(2026, 9, 14, 0, 0, 0)) + 1);
  });

  it('zly czas daje 0, a nie NaN w adresie', () => {
    expect(dayRound(NaN)).to.equal(0);
    expect(dayRound(Infinity)).to.equal(0);
  });
});

describe('link do udostepnienia pojedynku', () => {
  it('niesie oba adresy tokenow malymi literami i numer doby jako ?r=', () => {
    const url = buildClashUrl(A.toUpperCase().replace('0X', '0x'), B, dayRound(Date.UTC(2026, 9, 14, 12)));
    expect(url).to.equal(`https://mysphere.fun/perps/clash/${A}-${B}/?r=${dayRound(Date.UTC(2026, 9, 14, 12))}`);
  });

  it('tekst posta nie mowi o cenach ani zwrotach, a strony to BULL/BEAR albo aktywo', () => {
    expect(buildClashShareText({ ticker: 'MORE', sideA: 'BULL', sideB: 'BEAR' })).to.equal('$MORE: Bull vs Bear. Pick a side.');
    expect(buildClashShareText({ ticker: 'PEPE', sideA: 'ETH', sideB: 'NVDA' })).to.equal('$PEPE: ETH vs NVDA. Pick a side.');
  });
});
