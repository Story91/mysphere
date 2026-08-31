export {};

const { expect } = require('chai');
const { buildBoardUrl, buildBoardText } = require('../app/startpad/shareText');

/**
 * UDOSTEPNIANIE CALEJ TABLICY, a nie pojedynczego tokena.
 *
 * Startpad ma trzy rynki (Base B20, Sepolia, Robinhood) i do 13 sierpnia 2026
 * wszystkie trzy mialy TEN SAM adres - wybor sieci zyl w localStorage. Odkad
 * przelacznik dopisuje `?c=`, kazdy rynek da sie wyslac osobno; brakowalo
 * tylko tresci i przycisku.
 */

const BASE = 8453;
const ROBINHOOD = 4663;

describe('buildBoardUrl', () => {
  it('siec domyslna zostaje bez parametru - najczestszy link ma byc krotki', () => {
    expect(buildBoardUrl(BASE)).to.equal('https://mysphere.fun/startpad/');
  });

  it('pozostale sieci niosa `c`, inaczej odbiorca zobaczy SWOJ rynek', () => {
    expect(buildBoardUrl(ROBINHOOD)).to.equal('https://mysphere.fun/startpad/?c=4663');
  });
});

describe('buildBoardText', () => {
  it('nazywa rynek, bo to jest cala roznica miedzy tymi linkami', () => {
    expect(buildBoardText({ label: 'RobinHood', tokens: 12 })).to.contain('RobinHood');
  });

  it('podaje liczbe tokenow, gdy ja znamy', () => {
    expect(buildBoardText({ label: 'Base B20', tokens: 12 })).to.contain('12');
  });

  it('bez tokenow NIE pisze o zerze - pusty rynek opisuje sie inaczej', () => {
    const text = buildBoardText({ label: 'Base B20', tokens: 0 });

    expect(text).to.not.contain('0 ');
    expect(text).to.contain('Base B20');
  });

  it('konczy sie zaproszeniem, tak jak tekst tokena', () => {
    expect(buildBoardText({ label: 'Base B20', tokens: 3 })).to.contain('MySphere Startpad');
  });

  it('nazwa sieci przechodzi przez sito - to string z konfiguracji, ale idzie do posta', () => {
    const text = buildBoardText({ label: 'Zla\nnazwa', tokens: 1 });

    expect(text).to.not.contain('\n');
  });
});
