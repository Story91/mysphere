export {};

const { expect } = require('chai');
const { themeKeyFor, networkThemeCss, NETWORK_THEMES } = require('../app/startpad/networkTheme');

/**
 * Motyw sieci na startpadzie.
 *
 * Robinhood ma byc czarno-zielony, a Base i Sepolia zostaja jasne. Cala decyzja
 * sprowadza sie do jednej funkcji: ze sciezki i numeru sieci wychodzi klucz
 * motywu albo nic. Te testy pilnuja trzech rzeczy, na ktorych taki przelacznik
 * zwykle sie wywraca:
 *   - czern nie wycieka poza startpad (inne strony maja zostac jasne);
 *   - dopasowanie sciezki idzie po SEGMENCIE, a nie po prefiksie tekstowym;
 *   - siec bez motywu nie produkuje pustego bloku CSS, ktory nadpisalby
 *     wartosci domyslne bielami.
 */

const ROBINHOOD = 4663;
const BASE = 8453;

describe('themeKeyFor', () => {
  it('tablica startpada na Robinhoodzie dostaje motyw', () => {
    expect(themeKeyFor('/startpad/', ROBINHOOD)).to.equal('robinhood');
  });

  it('strona tokena tez, bo to ten sam launchpad', () => {
    expect(themeKeyFor('/startpad/0xb200000000000000000000ba5e9d437c77345c70/', ROBINHOOD)).to.equal('robinhood');
  });

  it('ta sama siec poza startpadem niczego nie maluje', () => {
    expect(themeKeyFor('/money/', ROBINHOOD)).to.equal(null);
    expect(themeKeyFor('/', ROBINHOOD)).to.equal(null);
  });

  it('sciezka musi konczyc segment - startpadding to nie startpad', () => {
    expect(themeKeyFor('/startpadding/', ROBINHOOD)).to.equal(null);
  });

  it('siec bez wlasnych barw zostaje jasna', () => {
    expect(themeKeyFor('/startpad/', BASE)).to.equal(null);
  });

  it('nieznana siec nie wywala funkcji', () => {
    expect(themeKeyFor('/startpad/', 999_999)).to.equal(null);
  });
});

describe('networkThemeCss', () => {
  const css = networkThemeCss();

  it('opisuje kazda siec, ktora ma motyw', () => {
    for (const theme of NETWORK_THEMES) {
      expect(css.indexOf(`[data-net-theme="${theme.key}"]`)).to.be.greaterThan(-1);
    }
  });

  it('nie produkuje bloku dla sieci bez motywu', () => {
    expect(css.indexOf('[data-net-theme="base"]')).to.equal(-1);
  });

  it('kazda zmienna jest trojka RGB, nie hexem', () => {
    // Tailwind sklada z tych wartosci `rgb(var(--x) / <alpha-value>)`, wiec hex
    // wpisany tutaj zabilby WSZYSTKIE polprzezroczyste warianty naraz - i to po
    // cichu, bo sama zmienna wygladalaby poprawnie.
    for (const theme of NETWORK_THEMES) {
      for (const [name, value] of Object.entries(theme.vars)) {
        expect(value, `${theme.key} ${name}`).to.match(/^\d{1,3} \d{1,3} \d{1,3}$/);
      }
    }
  });

  it('motyw nadpisuje tez tokeny wspolnej powloki, nie sam startpad', () => {
    // Bez tego czarna tablica siedzialaby pod jasna nawigacja.
    const robinhood = NETWORK_THEMES.find((theme: { key: string }) => theme.key === 'robinhood');
    expect(Object.keys(robinhood.vars).some((name: string) => name.startsWith('--soft-'))).to.equal(true);
  });
});
