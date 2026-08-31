export {};

const { expect } = require('chai');
const { pickChainId } = require('../app/startpad/chainFromUrl');

/**
 * KTORA SIEC POKAZUJE STARTPAD.
 *
 * Do 13 sierpnia 2026 wybor sieci zyl WYLACZNIE w localStorage. Parametr `?c=`
 * istnial, ale czytal go tylko serwer - do wygenerowania karty OG. Skutek byl
 * taki, ze link do tokena z Robinhooda mial poprawna karte w Telegramie, a po
 * klknieciu otwieral sie na sieci ODBIORCY: przegladarka czytala jego
 * localStorage, ustawiala Base i pytala launchpad Base o token, ktorego tam
 * nie ma. Link wygladal dobrze i prowadzil donikad.
 *
 * Zasada jest teraz jedna: ADRES WYGRYWA Z PAMIECIA. Kto dostal link, ten widzi
 * to, co nadawca chcial pokazac - a nie to, co sam ogladal ostatnio.
 */

const SIECI = { 8453: 'base', 84532: 'sepolia', 4663: 'robinhood' };
const DOMYSLNA = 8453;

const pick = (search: string, stored: string | null) =>
  pickChainId({ search, stored, networks: SIECI, fallback: DOMYSLNA });

describe('pickChainId', () => {
  it('adres wygrywa z pamiecia - po to sie linki wysyla', () => {
    expect(pick('?c=4663', '8453')).to.equal(4663);
  });

  it('bez parametru zostaje wybor z pamieci', () => {
    expect(pick('', '4663')).to.equal(4663);
  });

  it('bez parametru i bez pamieci zostaje siec domyslna', () => {
    expect(pick('', null)).to.equal(DOMYSLNA);
  });

  it('nieznana siec w adresie jest ignorowana, a nie pokazywana pusto', () => {
    expect(pick('?c=999999', '4663')).to.equal(4663);
  });

  it('smiec w parametrze tez nie psuje wyboru', () => {
    expect(pick('?c=abc', null)).to.equal(DOMYSLNA);
  });

  it('nieznana siec w pamieci nie blokuje domyslnej', () => {
    expect(pick('', '123')).to.equal(DOMYSLNA);
  });

  it('parametr obok innych parametrow tez dziala', () => {
    expect(pick('?utm=x&c=84532&ref=y', null)).to.equal(84532);
  });
});
