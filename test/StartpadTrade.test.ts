export {};

const { expect } = require('chai');
const {
  applySlippage,
  SLIPPAGE_OPTIONS,
  DEFAULT_SLIPPAGE_BPS,
  tradeErrorMessage,
} = require('../app/startpad/[address]/detailShared');

/**
 * Handel na krzywej: bufor poslizgu i tlumaczenie bledow kontraktu.
 *
 * Dlaczego to ma testy, a nie "przeciez to mnozenie": 13 sierpnia 2026 na
 * tokenie SAUSAGES (Base mainnet) padalo 28% sprzedazy i 15% zakupow. Jedna z
 * dwoch przyczyn byl bufor 0,5% zaszyty w kodzie - przy krzywej, ktorej
 * rezerwa spadla z 0,2136 do 0,0822 ETH w kilkanascie minut, wystarczyla jedna
 * cudza transakcja, zeby minimum przestalo byc osiagalne.
 *
 * Druga przyczyna: nieudane zatwierdzenie szlo dalej jak sukces i wysylalismy
 * `sell` bez allowance. Stad `tradeErrorMessage` - uzytkownik ma zobaczyc, CO
 * sie stalo, a nie goly `execution reverted`.
 */

describe('applySlippage', () => {
  it('odejmuje zadany bufor od wyceny', () => {
    expect(applySlippage(1_000n, 300)).to.equal(970n);
  });

  it('bufor zerowy zostawia wycene bez zmian', () => {
    expect(applySlippage(1_000n, 0)).to.equal(1_000n);
  });

  it('zaokragla W DOL - minimum ma byc osiagalne, nie ambitne', () => {
    // 101 * 9900 / 10000 = 99.99; w gore daloby minimum wyzsze niz zamierzone.
    expect(applySlippage(101n, 100)).to.equal(99n);
  });

  it('z niezerowej wyceny nigdy nie robi zera', () => {
    // Kontrakt rewertuje z SlippageRequired przy minEthOut == 0, wiec
    // zaokraglenie pylu do zera zamienialoby male zlecenie w pewny rewert.
    expect(applySlippage(1n, 300)).to.equal(1n);
  });

  it('zerowa wycena zostaje zerem - nie ma czego chronic', () => {
    expect(applySlippage(0n, 300)).to.equal(0n);
  });

  it('domyslny bufor jest jedna z opcji do wyboru', () => {
    expect(SLIPPAGE_OPTIONS).to.include(DEFAULT_SLIPPAGE_BPS);
  });
});

describe('tradeErrorMessage', () => {
  it('poslizg tlumaczy na powod, nie na nazwe bledu', () => {
    const text = tradeErrorMessage(new Error('execution reverted: custom error Slippage()'));

    expect(text).to.match(/price moved/i);
    expect(text).to.not.match(/Slippage\(\)/);
  });

  it('nieudany transfer tokena wskazuje na zatwierdzenie', () => {
    const text = tradeErrorMessage(new Error('reverted with custom error TokenTransferFailed()'));

    expect(text).to.match(/approval/i);
  });

  it('pusty claim mowi wprost, ze nie ma czego odbierac', () => {
    expect(tradeErrorMessage(new Error('NothingToClaim()'))).to.match(/nothing to claim/i);
  });

  it('odmowe w portfelu zostawia bez straszenia', () => {
    expect(tradeErrorMessage(new Error('User rejected the request.'))).to.match(/cancel/i);
  });

  it('nieznany blad oddaje pierwsza linie, a nie caly slad', () => {
    expect(tradeErrorMessage(new Error('Cos poszlo nie tak\nlinia druga\nlinia trzecia'))).to.equal('Cos poszlo nie tak');
  });

  it('radzi sobie z czyms, co nie jest bledem', () => {
    expect(tradeErrorMessage('zwykly tekst')).to.equal('zwykly tekst');
  });
});
