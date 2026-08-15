export {};

const { expect } = require('chai');
const { applyClaimLogs } = require('../app/startpad/[address]/liveClaims');

/**
 * PANEL „YOUR CLAIMS" NA ZYWO.
 *
 * Salda do odebrania czytaly sie raz, przy wejsciu na strone tokena, i staly do
 * przeladowania - ktos handlowal twoim tokenem, oplata byla ci naliczana, a
 * ekran pokazywal liczbe sprzed. Zdarzenia `FeeAccrued` i tak dolatywaly do
 * subskrypcji strony; te testy pilnuja, ze doliczamy z nich TYLKO to, co
 * naprawde nasze, i ze przy oplatach puli wolimy doczytac niz zgadnac.
 */

const ME = '0x1111111111111111111111111111111111111111';
const SOMEONE = '0x2222222222222222222222222222222222222222';
const TOKEN = '0xb20000000000000000000000000000000000b20b';
const OTHER_TOKEN = '0xb20000000000000000000000000000000000cafe';

const core = (over: Record<string, unknown> = {}) => ({
  launchClaimable: 100n,
  hookEthClaimable: 10n,
  hookTokenClaimable: 5n,
  vaultEthClaimable: 0n,
  vaultTokenClaimable: 0n,
  ...over,
});

const ctx = (over: Record<string, unknown> = {}) => ({
  viewer: ME.toLowerCase(),
  token: TOKEN.toLowerCase(),
  isCreator: true,
  ...over,
});

describe('applyClaimLogs', () => {
  it('naliczona oplata powieksza saldo od razu, bez odczytu z lancucha', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'FeeAccrued', args: { token: TOKEN, account: ME, amount: 42n, kind: 1 } }],
      ctx()
    );

    expect(result.core.launchClaimable).to.equal(142n);
    expect(result.reload).to.equal(false);
  });

  it('cudza oplata nie jest twoja - to jest caly sens tego filtra', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'FeeAccrued', args: { token: TOKEN, account: SOMEONE, amount: 42n, kind: 1 } }],
      ctx()
    );

    expect(result.core.launchClaimable).to.equal(100n);
  });

  it('oplata z INNEGO twojego tokena tez powieksza saldo, bo saldo jest per konto', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'FeeAccrued', args: { token: OTHER_TOKEN, account: ME, amount: 7n, kind: 0 } }],
      ctx()
    );

    expect(result.core.launchClaimable).to.equal(107n);
  });

  it('kilka naliczen w jednym bloku sumuje sie co do wei', () => {
    const fee = (amount: bigint) => ({ eventName: 'FeeAccrued', args: { token: TOKEN, account: ME, amount, kind: 1 } });

    const result = applyClaimLogs(core(), [fee(1n), fee(2n), fee(3n)], ctx());

    expect(result.core.launchClaimable).to.equal(106n);
  });

  it('po wlasnym claimie panel pokazuje zero od razu - kontrakt wyplaca CALE saldo', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'Claimed', args: { account: ME, amount: 100n, caller: ME } }],
      ctx()
    );

    expect(result.core.launchClaimable).to.equal(0n);
  });

  it('cudzy claim nie zeruje twojego salda', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'Claimed', args: { account: SOMEONE, amount: 100n, caller: SOMEONE } }],
      ctx()
    );

    expect(result.core.launchClaimable).to.equal(100n);
  });

  it('rozliczenie hooka idzie do claimow tworcy, w ETH i w tokenie', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'HookFeeSettled', args: { token: TOKEN, ethToCreator: 3n, tokenToCreator: 4n } }],
      ctx()
    );

    expect(result.core.hookEthClaimable).to.equal(13n);
    expect(result.core.hookTokenClaimable).to.equal(9n);
  });

  it('nie-tworca nie dostaje rozliczenia hooka', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'HookFeeSettled', args: { token: TOKEN, ethToCreator: 3n, tokenToCreator: 4n } }],
      ctx({ isCreator: false })
    );

    expect(result.core.hookEthClaimable).to.equal(10n);
  });

  it('rozliczenie CUDZEGO tokena nie rusza tej strony', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'HookFeeSettled', args: { token: OTHER_TOKEN, ethToCreator: 3n, tokenToCreator: 4n } }],
      ctx()
    );

    expect(result.core.hookEthClaimable).to.equal(10n);
  });

  it('zbior oplat puli konczy sie doczytaniem, a nie zgadywaniem podzialu', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'Harvested', args: { token: TOKEN, fee0: 1_000n, fee1: 2_000n } }],
      ctx()
    );

    expect(result.reload).to.equal(true);
    // Salda vaulta zostaja nietkniete - podzial robi kontrakt, nie my.
    expect(result.core.vaultEthClaimable).to.equal(0n);
  });

  it('bez podlaczonego portfela nie ma czyich sald doliczac', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'FeeAccrued', args: { token: TOKEN, account: ME, amount: 42n, kind: 1 } }],
      ctx({ viewer: null })
    );

    expect(result.core.launchClaimable).to.equal(100n);
    expect(result.reload).to.equal(false);
  });

  it('bez zmian oddaje TEN SAM obiekt - React nie ma sie po co przerysowac', () => {
    const before = core();

    const result = applyClaimLogs(before, [{ eventName: 'Bought', args: { token: TOKEN } }], ctx());

    expect(result.core).to.equal(before);
  });

  it('adres w checksumie i malymi literami to ten sam adres', () => {
    const result = applyClaimLogs(
      core(),
      [{ eventName: 'FeeAccrued', args: { token: TOKEN, account: ME.toUpperCase().replace('0X', '0x'), amount: 5n } }],
      ctx()
    );

    expect(result.core.launchClaimable).to.equal(105n);
  });
});
