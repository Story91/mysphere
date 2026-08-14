export {};

const { expect } = require('chai');
const { withDeadline } = require('../app/api/launchpad/dbDeadline');

/**
 * TWARDY TERMIN NA ODPOWIEDZ BAZY.
 *
 * 14 sierpnia 2026 Firestore wyczerpal dzienny limit odczytow i zaczal oddawac
 * `8 RESOURCE_EXHAUSTED: Quota exceeded`. SDK Firebase ponawia ten blad z
 * narastajacym odstepem, wiec nasze `catch` nigdy nie dochodzilo do skutku w
 * rozsadnym czasie: trasa historii tokena odpowiadala po 120, a potem po 372
 * SEKUNDACH. Na ekranie wygladalo to jak wykres, ktory buduje sie w
 * nieskonczonosc.
 *
 * Cache jest PRZYSPIESZENIEM, nie zrodlem prawdy - wiec baza, ktora nie
 * odpowiada w sekunde, ma byc traktowana jak baza, ktorej nie ma. Zamiast
 * czekac, schodzimy na skan lancucha.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withDeadline', () => {
  it('oddaje wynik, gdy baza zdazyla', async () => {
    expect(await withDeadline(Promise.resolve('dane'), 50, 'zapas')).to.equal('dane');
  });

  it('po terminie oddaje wartosc zapasowa, zamiast czekac dalej', async () => {
    const wolne = sleep(200).then(() => 'za pozno');

    expect(await withDeadline(wolne, 20, null)).to.equal(null);
  });

  it('NIE czeka na spozniona obietnice - to jest caly sens', async () => {
    const start = Date.now();
    await withDeadline(sleep(1000).then(() => 'x'), 20, null);

    expect(Date.now() - start).to.be.lessThan(300);
  });

  it('blad bazy tez konczy sie wartoscia zapasowa, a nie wyjatkiem', async () => {
    const padnieta = Promise.reject(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded'));

    expect(await withDeadline(padnieta, 50, 'zapas')).to.equal('zapas');
  });

  it('odrzucenie PO terminie nie wywraca procesu', async () => {
    // Bez wlasnego `catch` na spoznionej obietnicy Node zglosilby
    // unhandledRejection - a to jest sciezka, ktora wlasnie sie zdarza przy
    // wyczerpanym limicie.
    const spozniona = sleep(60).then(() => { throw new Error('poszlo za pozno'); });
    const wynik = await withDeadline(spozniona, 10, 'zapas');
    await sleep(120);

    expect(wynik).to.equal('zapas');
  });

  it('termin zerowy albo ujemny nie blokuje odczytu na zawsze', async () => {
    expect(await withDeadline(Promise.resolve('dane'), 0, 'zapas')).to.equal('zapas');
  });
});
