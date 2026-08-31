export {};

const { expect } = require('chai');
const {
  formatMultiple,
  buildShareUrl,
  buildShareText,
  shareIntentUrl,
} = require('../app/startpad/shareText');
const { samplePoints, buildChartSvg, chartDataUri } = require('../app/components/og/chartSvg');

/**
 * Udostepnianie tokena startpada.
 *
 * Dwa czyste moduly, na ktorych stoi caly system: tekst z adresem (to, co
 * wychodzi na X, Farcastera i Telegrama) oraz wykres wstawiany w karte OG.
 * Reszta - odczyty z lancucha, render obrazka, menu w interfejsie - jest
 * warstwa wokol nich i testuje sie ja uruchomieniem, nie asercja.
 *
 * Czego te testy pilnuja, bo to sa miejsca, w ktorych taki system klamie:
 *   - mnoznik NIE MOZE powstac z niepelnych danych ("x0.00" przy nieznanej
 *     cenie wyglada jak wycena, a jest brakiem wyceny);
 *   - symbol tokena pochodzi od obcego tworcy i trafia prosto do tresci posta;
 *   - adres musi niesc siec, bo ten sam token pod tym samym adresem nie istnieje
 *     na wszystkich trzech lancuchach;
 *   - wykres z mniej niz dwoma punktami to zmyslony rynek.
 */

/** Cena startowa krzywej: R_VIRT / T0 = 7.5e-10 ETH za caly token. */
const START = 7.5e-10;

describe('formatMultiple', () => {
  it('cena poltora raza wyzsza od startowej daje x1.50', () => {
    expect(formatMultiple(START * 1.5, START)).to.equal('x1.50');
  });

  it('ponizej jedynki pokazuje strate, a nie kreske', () => {
    expect(formatMultiple(START * 0.8, START)).to.equal('x0.80');
  });

  it('im wiekszy mnoznik, tym mniej miejsc po przecinku', () => {
    expect(formatMultiple(START * 12.345, START)).to.equal('x12.3');
    expect(formatMultiple(START * 248.9, START)).to.equal('x249');
  });

  it('tysiace skracamy, zeby liczba zmiescila sie na karcie', () => {
    expect(formatMultiple(START * 4200, START)).to.equal('x4.2k');
  });

  it('nieznana cena nie zamienia sie w zero', () => {
    expect(formatMultiple(0, START)).to.equal(null);
    expect(formatMultiple(Number.NaN, START)).to.equal(null);
    expect(formatMultiple(START, 0)).to.equal(null);
  });
});

describe('buildShareUrl', () => {
  const TOKEN = '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01';

  it('link do tokena z domyslnej sieci nie niesie parametru sieci', () => {
    expect(buildShareUrl({ address: TOKEN, chainId: 8453 })).to.equal(
      `https://mysphere.fun/startpad/${TOKEN.toLowerCase()}/`
    );
  });

  it('token z innej sieci niesie ja w adresie', () => {
    expect(buildShareUrl({ address: TOKEN, chainId: 4663 })).to.equal(
      `https://mysphere.fun/startpad/${TOKEN.toLowerCase()}/?c=4663`
    );
  });

  it('ukosnik na koncu jest obowiazkowy - projekt ma trailingSlash', () => {
    const url = new URL(buildShareUrl({ address: TOKEN, chainId: 84532 }));
    expect(url.pathname.endsWith('/')).to.equal(true);
  });
});

describe('buildShareText', () => {
  const base = { symbol: 'MOSS', multiple: 'x1.50', raised: 0.462, target: 3, state: 'Curve' };

  it('niesie mnoznik i postep krzywej', () => {
    expect(buildShareText(base)).to.equal(
      '$MOSS x1.50 since launch. 0.46 of 3 ETH on the curve. Trade it on MySphere Startpad.'
    );
  });

  it('token po graduacji mowi o puli, a nie o krzywej', () => {
    expect(buildShareText({ ...base, state: 'Graduated', raised: 3 })).to.equal(
      '$MOSS x1.50 since launch. Graduated to a live pool. Trade it on MySphere Startpad.'
    );
  });

  it('bez mnoznika zdanie o nim znika, zamiast pokazac pustke', () => {
    expect(buildShareText({ ...base, multiple: null })).to.equal(
      '$MOSS 0.46 of 3 ETH on the curve. Trade it on MySphere Startpad.'
    );
  });

  it('symbol od obcego tworcy nie wnosi wlasnych linii ani dlugosci', () => {
    const text = buildShareText({ ...base, symbol: 'EVIL\nBUY NOW http://spam.example ' + 'X'.repeat(40) });
    expect(text.split('\n')).to.have.length(1);
    expect(text.startsWith('$EVILBUYNOWhttp')).to.equal(false);
    expect(text.indexOf('spam.example')).to.equal(-1);
  });
});

describe('shareIntentUrl', () => {
  const input = { text: 'MOSS x1.50 & rising', url: 'https://mysphere.fun/startpad/0xabc/' };

  it('X dostaje tekst i adres w osobnych polach', () => {
    const url = new URL(shareIntentUrl('x', input));
    expect(url.host).to.equal('x.com');
    expect(url.searchParams.get('text')).to.equal(input.text);
    expect(url.searchParams.get('url')).to.equal(input.url);
  });

  it('Farcaster bierze adres jako embed, a nie w tresci', () => {
    const url = new URL(shareIntentUrl('farcaster', input));
    expect(url.host).to.equal('farcaster.xyz');
    expect(url.searchParams.get('text')).to.equal(input.text);
    expect(url.searchParams.get('embeds[]')).to.equal(input.url);
  });

  it('Facebook przyjmuje sam adres - tresc i tak czyta z metadanych', () => {
    const url = new URL(shareIntentUrl('facebook', input));
    expect(url.searchParams.get('u')).to.equal(input.url);
  });

  it('ampersand w tekscie nie rozbija adresu na dwa parametry', () => {
    const url = new URL(shareIntentUrl('telegram', input));
    expect(url.searchParams.get('text')).to.equal(input.text);
    expect(url.searchParams.get('url')).to.equal(input.url);
  });
});

describe('samplePoints', () => {
  it('dluga historia schodzi do sufitu, zachowujac pierwszy i ostatni punkt', () => {
    const values = Array.from({ length: 500 }, (_, index) => index);
    const sampled = samplePoints(values, 48);
    expect(sampled.length).to.be.at.most(48);
    expect(sampled[0]).to.equal(0);
    expect(sampled[sampled.length - 1]).to.equal(499);
  });

  it('krotka historia przechodzi bez zmiany', () => {
    expect(samplePoints([1, 2, 3], 48)).to.deep.equal([1, 2, 3]);
  });
});

describe('buildChartSvg', () => {
  const opts = { width: 900, height: 240, up: true };

  it('mniej niz dwa punkty to nie jest rynek - nie rysujemy nic', () => {
    expect(buildChartSvg([], opts)).to.equal(null);
    expect(buildChartSvg([1], opts)).to.equal(null);
  });

  it('linia zaczyna sie na lewej krawedzi i konczy na prawej', () => {
    const svg = buildChartSvg([1, 2, 3], opts);
    expect(svg).to.be.a('string');
    expect(svg.indexOf('M 0 ')).to.be.greaterThan(-1);
    expect(svg.indexOf(`L ${opts.width} `)).to.be.greaterThan(-1);
  });

  it('plaska cena nie produkuje NaN', () => {
    const svg = buildChartSvg([5, 5, 5, 5], opts);
    expect(svg.indexOf('NaN')).to.equal(-1);
  });

  it('spadek rysuje sie innym kolorem niz wzrost', () => {
    const up = buildChartSvg([1, 2, 3], { ...opts, up: true });
    const down = buildChartSvg([3, 2, 1], { ...opts, up: false });
    expect(up).to.not.equal(down);
  });
});

describe('chartDataUri', () => {
  it('gotowy do wstawienia w obrazek OG albo null, gdy nie ma czego rysowac', () => {
    expect(chartDataUri([], { width: 900, height: 240, up: true })).to.equal(null);
    const uri = chartDataUri([1, 2, 3], { width: 900, height: 240, up: true });
    expect(uri.startsWith('data:image/svg+xml;base64,')).to.equal(true);
    const decoded = Buffer.from(uri.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8');
    expect(decoded.startsWith('<svg')).to.equal(true);
  });
});
