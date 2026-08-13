export {};

const { expect } = require('chai');
const { GAS_RESERVE_WEI, spendableEth, fractionOf } = require('../app/startpad/[address]/detailShared');

/**
 * ILE ETH WOLNO WYDAC PRZY KLIKNIECIU 25/50/100% ALBO MAX.
 *
 * Zgloszenie z 14 sierpnia 2026: w mini panelu handlu na tablicy przyciski
 * procentowe "nie dzialaly". Dzialaly - tylko zawsze wychodzilo z nich ZERO.
 *
 * Rezerwa na gaz byla zaszyta jako 0,005 ETH, czyli okolo dziewieciu dolarow.
 * Przy saldzie 0,0004 ETH (tyle mial zglaszajacy) rezerwa jest DWUNASTOKROTNIE
 * WIEKSZA NIZ CALE SALDO, wiec `saldo - rezerwa` schodzilo do zera i kazdy
 * procent dawal zero.
 *
 * Ta liczba byla oderwana od sieci, w ktorej dzialamy. Zmierzony koszt gazu
 * transakcji launchpada na Base to 0,0000004 ETH - rezerwa byla od niego
 * dwanascie tysiecy razy wieksza.
 *
 * Dlatego rezerwa jest teraz mala, a gdy saldo jej nie pokrywa, przyciski maja
 * byc WYLACZONE zamiast po cichu wpisywac zero. Zero w polu kwoty wyglada jak
 * zepsuty przycisk, a nie jak "nie masz z czego".
 */

const ETH = 1_000_000_000_000_000_000n;

describe('GAS_RESERVE_WEI', () => {
  it('jest o rzedy wielkosci wiekszy niz gaz jednej transakcji, ale nadal grosze', () => {
    // Zmierzony koszt transakcji launchpada na Base: 0,0000004 ETH.
    const zmierzonyGaz = 400_000_000_000n;

    expect(GAS_RESERVE_WEI).to.be.greaterThan(zmierzonyGaz * 10n);
    // I jednoczesnie ponizej jednej tysiecznej ETH - inaczej znowu zjadlby
    // cale saldo malego portfela.
    expect(GAS_RESERVE_WEI).to.be.lessThan(ETH / 1000n);
  });
});

describe('spendableEth', () => {
  it('odejmuje rezerwe od salda', () => {
    expect(spendableEth(ETH, 1000n)).to.equal(ETH - 1000n);
  });

  it('saldo ponizej rezerwy daje zero, a nie liczbe ujemna', () => {
    expect(spendableEth(500n, 1000n)).to.equal(0n);
  });

  it('brak salda to zero', () => {
    expect(spendableEth(null, 1000n)).to.equal(0n);
    expect(spendableEth(undefined, 1000n)).to.equal(0n);
  });

  it('saldo rowne rezerwie nie zostawia nic do wydania', () => {
    expect(spendableEth(1000n, 1000n)).to.equal(0n);
  });

  it('MALE saldo na Base zostaje do wydania - to jest sedno zgloszenia', () => {
    // 0,0004 ETH: przy starej rezerwie 0,005 ETH wychodzilo zero.
    const saldo = 400_000_000_000_000n;

    expect(spendableEth(saldo, GAS_RESERVE_WEI)).to.be.greaterThan(0n);
  });
});

describe('fractionOf', () => {
  it('liczy procent z kwoty', () => {
    expect(fractionOf(1000n, 25n, 100n)).to.equal(250n);
  });

  it('sto procent to cala kwota', () => {
    expect(fractionOf(1000n, 1n, 1n)).to.equal(1000n);
  });

  it('zaokragla w dol - nie wolno zaproponowac wiecej, niz jest', () => {
    expect(fractionOf(1n, 50n, 100n)).to.equal(0n);
  });

  it('z zera nie robi niczego', () => {
    expect(fractionOf(0n, 50n, 100n)).to.equal(0n);
  });
});
