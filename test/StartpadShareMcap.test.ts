export {};

const { expect } = require('chai');
const { mcapLabel } = require('../app/startpad/shareText');

/**
 * KAPITALIZACJA NA KARCIE UDOSTEPNIANIA.
 *
 * Karta pokazywala dotad CENE, i to w gwei - bo cena tokena na krzywej to
 * liczby rzedu 7.5e-10 ETH, ktore w dolarach wygladaja jak zero. Gwei bylo
 * uczciwe technicznie i bezuzyteczne dla kogos, kto ten link dostal: nikt nie
 * wie, czy 0.88 gwei to duzo.
 *
 * Kapitalizacja w dolarach mowi to samo, tylko w jednostce, ktora czyta sie
 * bez tlumaczenia. Brak kursu ETH NIE MOZE zamienic sie w "$0" - to wyglada
 * jak wycena, i to jak wycena zerowa.
 */

describe('mcapLabel', () => {
  it('miliony skraca do M', () => {
    expect(mcapLabel(2_400_000)).to.equal('$2.4M');
  });

  it('tysiace skraca do k', () => {
    expect(mcapLabel(1_672)).to.equal('$1.7k');
  });

  it('male kwoty pokazuje w calosci', () => {
    expect(mcapLabel(940)).to.equal('$940');
  });

  it('brak kursu to kreska, nigdy zero dolarow', () => {
    expect(mcapLabel(null)).to.equal('--');
    expect(mcapLabel(0)).to.equal('--');
  });

  it('smiec zamiast liczby tez konczy sie kreska', () => {
    expect(mcapLabel(Number.NaN)).to.equal('--');
    expect(mcapLabel(Number.POSITIVE_INFINITY)).to.equal('--');
  });

  it('nie zostawia ogona zer - 1.0M czyta sie jak niedokonczona liczba', () => {
    expect(mcapLabel(3_000_000)).to.equal('$3M');
    expect(mcapLabel(2_000)).to.equal('$2k');
  });
});
