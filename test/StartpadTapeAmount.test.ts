export {};

const { expect } = require('chai');
const { tapeAmount, totalEarned } = require('../app/startpad/[address]/detailShared');

/**
 * PASEK ZDARZEN NA ZYWO i RANKING ZAROBKOW - dwie liczby, ktore klamaly
 * inaczej, ale obie odbieraly tablicy sens.
 *
 * 1. PASEK pisal kwoty w ETH. Na krzywej typowe kupno to 0,00008 ETH, wiec po
 *    tablicy jechalo "Buy 0.000 ETH" - liczba, ktora wyglada jak zero i nie
 *    mowi nikomu nic. W dolarach to samo zdarzenie brzmi "Buy $0.15": tyle samo
 *    prawdy, a widac, ze ktos naprawde cos kupil.
 *
 * 2. RANKING pokazywal wylacznie to, co zostalo DO ODEBRANIA. Kto odebral swoje
 *    oplaty, spadal z listy do zera - a przeciez zarobil je naprawde. Ranking
 *    "top earnings" musi liczyc to, co ZARABIANE, nie to, co jeszcze lezy.
 */

describe('tapeAmount', () => {
  it('male kwoty pisze w dolarach - w ETH byloby zero', () => {
    // 0,00008 ETH przy kursie $1800 to 14 centow.
    expect(tapeAmount(0.00008, 1800)).to.equal('$0.14');
  });

  it('wieksze kwoty zostaja w ETH - tam liczba mowi sama za siebie', () => {
    expect(tapeAmount(0.05, 1800)).to.contain('ETH');
  });

  it('bez kursu zostaje ETH, nigdy zmyslony dolar', () => {
    expect(tapeAmount(0.00008, null)).to.contain('ETH');
  });

  it('kwoty ponizej centa nie udaja zera dolarow', () => {
    // 0,0000001 ETH to ulamek centa; "$0.00" wygladaloby jak brak transakcji.
    expect(tapeAmount(0.0000001, 1800)).to.equal('<$0.01');
  });

  it('zero zostaje zerem, bez udziwnien', () => {
    expect(tapeAmount(0, 1800)).to.equal('$0.00');
  });

  it('duze kwoty skraca, zeby pasek nie pekl', () => {
    expect(tapeAmount(10, 1800)).to.contain('ETH');
  });
});

describe('totalEarned', () => {
  it('bierze sume ze zdarzen - to jest CALY zarobek, takze juz odebrany', () => {
    expect(totalEarned(1000n, 200n)).to.equal(1000n);
  });

  it('gdy do odebrania jest wiecej niz widzial skan, wygrywa saldo', () => {
    // Padniete okno skanu zaniza sume zdarzen; saldo z lancucha jest wtedy
    // twardym dolem, ponizej ktorego ranking nie ma prawa zejsc.
    expect(totalEarned(100n, 900n)).to.equal(900n);
  });

  it('brak jednego i drugiego to zero', () => {
    expect(totalEarned(0n, 0n)).to.equal(0n);
  });

  it('samo saldo bez historii zdarzen tez sie liczy', () => {
    expect(totalEarned(0n, 500n)).to.equal(500n);
  });
});
