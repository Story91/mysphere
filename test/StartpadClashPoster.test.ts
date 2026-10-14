export {};

const { expect } = require('chai');
const {
  buildClashUrl,
  buildClashShareText,
  parseClashPair,
  orderClashPair,
  clashRopeShare,
  shareIntentUrl,
} = require('../app/startpad/shareText');
const { DEFAULT_LAUNCHPAD_CHAIN_ID } = require('../app/startpad/config');

/**
 * Plakat pojedynku (/perps/clash/<a>-<b>/).
 *
 * Czyste funkcje, na ktorych stoi caly plakat: adres i tekst udostepnienia
 * (wychodza na X, Farcastera, Telegrama), czytanie pary z adresu, sprawdzenie,
 * ze dwa tokeny to NAPRAWDE jedna para (bez skanu lancucha) i podzial liny.
 * Render karty OG i widok w przegladarce testuje sie uruchomieniem.
 *
 * Czego te testy pilnuja:
 *   - ukosnik na koncu adresu jest obowiazkowy (trailingSlash), a `?r=` tylko
 *     gdy ktos o niego prosi;
 *   - tekst udostepnienia nie mowi o cenach ani zwrotach, a ticker od obcego
 *     tworcy przechodzi przez sito;
 *   - para jest uznana wylacznie, gdy sa te same `duel.id`, przeciwne strony,
 *     ten sam tworca i dwa rozne rynki perpow - inaczej plakat pokazalby walke,
 *     ktorej nie ma;
 *   - lina nie udaje wyniku: bez ruchu po OBU stronach jest 50/50 i nie ma
 *     "prowadzi".
 */

const A = '0xb200000000000000000000bc3bd9a122a6910594';
const B = '0xb20000000000000000000068bef64880cbbee29e';
const CREATOR = '0x76211da24AEdaf913A7795E814E59011cdBC4264';

/** Minimalna karta tokena, tyle ile widzi `orderClashPair`. */
function side(address: string, which: 'a' | 'b', perp: string, overrides: Record<string, unknown> = {}) {
  return {
    address,
    chainId: DEFAULT_LAUNCHPAD_CHAIN_ID,
    creator: CREATOR,
    duel: { id: '5wbv8r6rgy000000', side: which, ticker: 'MORE' },
    perp: { symbol: perp },
    ...overrides,
  };
}

describe('buildClashUrl', () => {
  it('adres ma obie strony, male litery i ukosnik na koncu', () => {
    expect(buildClashUrl(A.toUpperCase().replace('0X', '0x'), B)).to.equal(`https://mysphere.fun/perps/clash/${A}-${B}/`);
  });

  it('bez rundy nie ma parametru', () => {
    expect(buildClashUrl(A, B).includes('?')).to.equal(false);
    expect(buildClashUrl(A, B, '').includes('?')).to.equal(false);
  });

  it('runda dopisuje przelamywacz cache\'u po ukosniku', () => {
    expect(buildClashUrl(A, B, 'k1x')).to.equal(`https://mysphere.fun/perps/clash/${A}-${B}/?r=k1x`);
    expect(buildClashUrl(A, B, 7)).to.equal(`https://mysphere.fun/perps/clash/${A}-${B}/?r=7`);
    // Zero to prawdziwa runda, nie brak.
    expect(buildClashUrl(A, B, 0)).to.equal(`https://mysphere.fun/perps/clash/${A}-${B}/?r=0`);
  });

  it('runda z dziwnymi znakami nie rozbija adresu', () => {
    const url = new URL(buildClashUrl(A, B, 'a&b=c#d'));
    expect(url.searchParams.get('r')).to.equal('a&b=c#d');
    expect(url.pathname.endsWith('/')).to.equal(true);
  });
});

describe('buildClashShareText', () => {
  it('Bull vs Bear', () => {
    expect(buildClashShareText({ ticker: 'MORE', sideA: 'Bull', sideB: 'Bear' })).to.equal('$MORE: Bull vs Bear. Pick a side.');
  });

  it('BULL i BEAR z wielkich liter wychodza po ludzku', () => {
    expect(buildClashShareText({ ticker: 'MORE', sideA: 'BULL', sideB: 'BEAR' })).to.equal('$MORE: Bull vs Bear. Pick a side.');
  });

  it('Asset Clash zostawia aktywa tak, jak podano', () => {
    expect(buildClashShareText({ ticker: 'MORE', sideA: 'ETH', sideB: 'NVDA' })).to.equal('$MORE: ETH vs NVDA. Pick a side.');
  });

  it('nie mowi o cenach, zwrotach ani hasztagach', () => {
    const text = buildClashShareText({ ticker: 'MORE', sideA: 'BULL', sideB: 'BEAR' });
    expect(/[#%]|x\d|\d/.test(text)).to.equal(false);
    expect(/since launch|gain|profit|moon|price|return/i.test(text)).to.equal(false);
  });

  it('ticker i strony od obcego tworcy przechodza przez sito', () => {
    const text = buildClashShareText({
      ticker: 'EVIL\nBUY NOW http://spam.example ' + 'X'.repeat(40),
      sideA: 'A\nB http://x.example',
      sideB: '',
    });
    expect(text.split('\n')).to.have.length(1);
    expect(text.indexOf('spam.example')).to.equal(-1);
    expect(text.indexOf('x.example')).to.equal(-1);
    // Pusta strona dostaje litere zamiast pustki.
    expect(text).to.contain(' vs B. Pick a side.');
  });
});

describe('shareIntentUrl dla plakatu', () => {
  it('X dostaje zdanie i adres z ukosnikiem w osobnych polach', () => {
    const url = new URL(
      shareIntentUrl('x', {
        text: buildClashShareText({ ticker: 'MORE', sideA: 'BULL', sideB: 'BEAR' }),
        url: buildClashUrl(A, B, 'r1'),
      })
    );
    expect(url.searchParams.get('text')).to.equal('$MORE: Bull vs Bear. Pick a side.');
    expect(url.searchParams.get('url')).to.equal(`https://mysphere.fun/perps/clash/${A}-${B}/?r=r1`);
  });
});

describe('parseClashPair', () => {
  it('czyta dwa adresy malymi literami', () => {
    expect(parseClashPair(`${A}-${B}`)).to.deep.equal([A, B]);
  });

  it('toleruje wielkie litery, kodowanie procentowe i ukosnik na koncu', () => {
    const upper = `0x${A.slice(2).toUpperCase()}-0x${B.slice(2).toUpperCase()}`;
    expect(parseClashPair(upper)).to.deep.equal([A, B]);
    expect(parseClashPair(encodeURIComponent(`${A}-${B}`))).to.deep.equal([A, B]);
    expect(parseClashPair(`${A}-${B}/`)).to.deep.equal([A, B]);
  });

  it('kolejnosc z adresu zostaje - porzadkuje ja dopiero duel.side', () => {
    expect(parseClashPair(`${B}-${A}`)).to.deep.equal([B, A]);
  });

  it('smiec, ten sam adres dwa razy i zla dlugosc to null', () => {
    expect(parseClashPair('hello')).to.equal(null);
    expect(parseClashPair('')).to.equal(null);
    expect(parseClashPair(`${A}-${A}`)).to.equal(null);
    expect(parseClashPair(`${A}-${B.slice(0, -1)}`)).to.equal(null);
    expect(parseClashPair(`${A}-${B}-${A}`)).to.equal(null);
    expect(parseClashPair(`${A}_${B}`)).to.equal(null);
    expect(parseClashPair('%E0%A4%A')).to.equal(null);
  });
});

describe('orderClashPair', () => {
  const a = side(A, 'a', 'ETH2xL');
  const b = side(B, 'b', 'ETH2xS');

  it('porzadkuje po duel.side niezaleznie od kolejnosci w adresie', () => {
    const forward = orderClashPair(a, b);
    const backward = orderClashPair(b, a);
    expect(forward.a.address).to.equal(A);
    expect(forward.b.address).to.equal(B);
    expect(backward.a.address).to.equal(A);
    expect(backward.b.address).to.equal(B);
    expect(forward.id).to.equal('5wbv8r6rgy000000');
    expect(forward.ticker).to.equal('MORE');
  });

  it('nie jest para, gdy ktorys token nie ma duel', () => {
    expect(orderClashPair(a, side(B, 'b', 'ETH2xS', { duel: null }))).to.equal(null);
    expect(orderClashPair(side(A, 'a', 'ETH2xL', { duel: null }), b)).to.equal(null);
  });

  it('nie jest para przy roznych duel.id', () => {
    expect(orderClashPair(a, side(B, 'b', 'ETH2xS', { duel: { id: 'zzzzzzzzzzzzzzzz', side: 'b', ticker: 'MORE' } }))).to.equal(null);
  });

  it('nie jest para, gdy obie strony sa ta sama strona', () => {
    expect(orderClashPair(a, side(B, 'a', 'ETH2xS'))).to.equal(null);
  });

  it('nie jest para przy innym tworcy (porownanie bez wzgledu na wielkosc liter)', () => {
    expect(orderClashPair(a, side(B, 'b', 'ETH2xS', { creator: '0x1111111111111111111111111111111111111111' }))).to.equal(null);
    expect(orderClashPair(a, side(B, 'b', 'ETH2xS', { creator: CREATOR.toLowerCase() }))).to.not.equal(null);
  });

  it('nie jest para na tym samym rynku perpa', () => {
    expect(orderClashPair(a, side(B, 'b', 'ETH2xL'))).to.equal(null);
  });

  it('nie jest para, gdy token nie stoi na rynku perpa', () => {
    expect(orderClashPair(a, side(B, 'b', 'ETH2xS', { perp: null }))).to.equal(null);
  });

  it('nie jest para poza siecia Base ani dla tego samego adresu dwa razy', () => {
    expect(orderClashPair(a, side(B, 'b', 'ETH2xS', { chainId: 4663 }))).to.equal(null);
    expect(orderClashPair(a, side(A, 'b', 'ETH2xS'))).to.equal(null);
  });

  it('Asset Clash: dwa rozne aktywa, ta sama sciezka', () => {
    const nvda = orderClashPair(side(A, 'a', 'ETH2xL'), side(B, 'b', 'NVDA2xL'));
    expect(nvda).to.not.equal(null);
    expect(nvda.b.perp.symbol).to.equal('NVDA2xL');
  });
});

describe('clashRopeShare', () => {
  it('bez ruchu po obu stronach lina jest 50/50 i nie ma wyniku', () => {
    expect(clashRopeShare({ raised: 0.29 }, { raised: 0 })).to.deep.equal({ traded: false, aPct: 50, bPct: 50 });
    expect(clashRopeShare({ raised: 0 }, { raised: 0 })).to.deep.equal({ traded: false, aPct: 50, bPct: 50 });
  });

  it('brak danych nie zamienia sie w NaN ani w wynik', () => {
    const rope = clashRopeShare({ raised: Number.NaN }, { raised: undefined as unknown as number });
    expect(rope).to.deep.equal({ traded: false, aPct: 50, bPct: 50 });
    expect(clashRopeShare({ raised: -3 }, { raised: 2 }).traded).to.equal(false);
    expect(clashRopeShare({ raised: Infinity }, { raised: 2 }).traded).to.equal(false);
  });

  it('gdy obie strony cos zebraly, dzieli proporcjonalnie w jednostkach perpa', () => {
    expect(clashRopeShare({ raised: 3 }, { raised: 1 })).to.deep.equal({ traded: true, aPct: 75, bPct: 25 });
  });

  it('gdy zna NAV obu perpow, liczy w dolarach - rozne perpy to rozne pieniadze', () => {
    // 1 jednostka NVDA2xL za 20 $ wazy tyle, co 20 jednostek ETH2xL za 1 $.
    const rope = clashRopeShare({ raised: 20, navUsd: 1 }, { raised: 1, navUsd: 20 });
    expect(rope).to.deep.equal({ traded: true, aPct: 50, bPct: 50 });
  });

  it('z jednym NAV zostaje przy jednostkach perpa (nie miesza walut)', () => {
    const rope = clashRopeShare({ raised: 3, navUsd: 5 }, { raised: 1, navUsd: null });
    expect(rope.aPct).to.equal(75);
  });

  it('procent trzyma sie w 1..99 i zawsze sumuje do 100', () => {
    const lopsided = clashRopeShare({ raised: 1000, navUsd: 1 }, { raised: 0.0001, navUsd: 1 });
    expect(lopsided.aPct).to.equal(99);
    expect(lopsided.bPct).to.equal(1);
    for (const [x, y] of [[1, 1], [2, 3], [0.37, 0.91], [5, 0.01]]) {
      const rope = clashRopeShare({ raised: x }, { raised: y });
      expect(rope.aPct + rope.bPct).to.equal(100);
      expect(Number.isFinite(rope.aPct)).to.equal(true);
    }
  });
});
