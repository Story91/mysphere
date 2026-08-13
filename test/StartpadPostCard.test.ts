export {};

const { expect } = require('chai');
const { findTokenAddress } = require('../app/basechat/components/tokenAddress');

/**
 * WYKRYWANIE ADRESU TOKENA W TRESCI POSTA.
 *
 * Do 13 sierpnia 2026 karta pod postem lapala WYLACZNIE adresy vanity B20
 * (`0xb2` plus dziewiec zer). Skutki byly dwa, oba widoczne na feedzie:
 *   - token startpada z Robinhooda (zwykly ERC-20) nie dostawal karty NIGDY;
 *   - a token, ktory karte dostawal, byl opisywany danymi ze strony b20, czyli
 *     cena z GeckoTerminala - ktory tokena bez puli na Uniswapie nie zna i
 *     dlatego pod postem stalo "no market yet" przy dzialajacej krzywej.
 *
 * Adres wykrywamy wiec KAZDY, a o tym, czy karta ma sie pokazac i skad wziac
 * dane, rozstrzyga pytanie do startpada.
 */

const B20 = '0xb200000000000000000000ba5e9d437c77345c70';
const ZWYKLY = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

describe('findTokenAddress', () => {
  it('lapie adres vanity B20', () => {
    expect(findTokenAddress(`Genara is live! ${B20}`)).to.equal(B20);
  });

  it('lapie takze zwykly adres ERC-20 - tokeny spoza Base nie sa vanity', () => {
    expect(findTokenAddress(`kup to ${ZWYKLY}`)).to.equal(ZWYKLY);
  });

  it('sprowadza do malych liter, zeby jeden token nie mial dwoch kart', () => {
    expect(findTokenAddress(`${B20.toUpperCase().replace('0X', '0x')}`)).to.equal(B20);
  });

  it('bierze PIERWSZY adres - karta jest jedna, wiec wybor musi byc przewidywalny', () => {
    expect(findTokenAddress(`${B20} oraz ${ZWYKLY}`)).to.equal(B20);
  });

  it('adres w srodku dluzszego ciagu szesnastkowego nie jest adresem', () => {
    expect(findTokenAddress(`0x${'a'.repeat(64)}`)).to.equal(null);
  });

  it('sam prefiks bez czterdziestu znakow to nie adres', () => {
    expect(findTokenAddress('0xb200 i tyle')).to.equal(null);
  });

  it('pusta tresc nie wywraca wykrywania', () => {
    expect(findTokenAddress('')).to.equal(null);
    expect(findTokenAddress(null)).to.equal(null);
  });
});
