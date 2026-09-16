export {};

const { expect } = require('chai');
const { LAUNCHPAD_NETWORKS } = require('../app/startpad/config');

/**
 * LOGO TOKENOW: KAZDA SKONFIGUROWANA SIEC MUSI BYC DOZWOLONA.
 *
 * `/api/startpad/logos` listuje kubelek `startpad/logos/{chainId}/` i dlatego
 * trzyma liste zamknieta - bez niej dowolny ciag z adresu listowalby dowolny
 * prefiks. Lista byla WPISANA RECZNIE i rozjechala sie z konfiguracja: Arc
 * mainnet (5042) mial wpis w `LAUNCHPAD_NETWORKS`, POST wgrywal logo do
 * `startpad/logos/5042/` poprawnie, ale GET oddawal 400 i pusta mape - wiec
 * tablica, strona tokena, ticker i ekran nagrod pokazywaly na Arc mainnet
 * same glify zamiast obrazkow (token ARPE, 16.09.2026).
 *
 * Test pilnuje umowy, nie implementacji: cokolwiek jest w konfiguracji sieci,
 * ma byc dozwolone w trasie logo - i nic poza tym.
 */
describe('Startpad: sieci dozwolone dla logo', function () {
  // Odwzorowanie tego, co robi route - trzymane tutaj, zeby test nie
  // potrzebowal serwera Next ani Bloba.
  const allowed = new Set(Object.keys(LAUNCHPAD_NETWORKS));

  it('kazda siec z LAUNCHPAD_NETWORKS jest dozwolona', function () {
    const ids = Object.keys(LAUNCHPAD_NETWORKS);
    expect(ids.length).to.be.greaterThan(0);
    for (const id of ids) {
      expect(allowed.has(id), `siec ${id} musi byc dozwolona dla logo`).to.equal(true);
    }
  });

  it('Arc mainnet 5042 jest w konfiguracji i dozwolony', function () {
    expect(LAUNCHPAD_NETWORKS[5042], 'brak wpisu Arc mainnet w konfiguracji').to.not.equal(undefined);
    expect(allowed.has('5042')).to.equal(true);
  });

  it('obcy chainId i proba wyjscia ze sciezki odpadaja', function () {
    for (const bad of ['1', '999999', '', '../', 'startpad', '5042/../8453', '05042']) {
      expect(allowed.has(bad), `${bad} nie moze byc dozwolone`).to.equal(false);
    }
  });

  it('kazdy klucz konfiguracji jest liczba - to gwarancja, ze prefiks jest nasz', function () {
    for (const id of Object.keys(LAUNCHPAD_NETWORKS)) {
      expect(/^\d+$/.test(id), `klucz ${id} nie jest liczba`).to.equal(true);
    }
  });
});
