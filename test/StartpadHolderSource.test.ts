export {};

const { expect } = require('chai');
const { holdersAreExact, pickHolderCount, pickHolderRows } = require('../app/startpad/[address]/detailShared');

/**
 * SKAD BIERZE SIE LICZBA HOLDEROW.
 *
 * Do 15 sierpnia 2026 strona tokena brala WIEKSZA z dwoch liczb: naszej
 * (odtworzonej z transferow) i tej z indeksu Blockscouta. Mialo to sens,
 * dopoki nasza byla przyblizeniem - salda skladalismy z roznic i przy ucietym
 * skanie wychodzily za male.
 *
 * Odkad salda czyta `balanceOf`, przy kompletnej historii nasza mapa jest
 * dokladna co do wei. Wtedy branie maksimum nie chroni juz przed zanizeniem,
 * tylko wpuszcza na ekran opoznienie cudzego indeksu - to on pokazywal
 * "Holders (1)" przy czterech kupujacych na GLIFE.
 */

describe('holdersAreExact', () => {
  it('kompletna historia z saldami znaczy salda dokladne', () => {
    expect(holdersAreExact({ complete: true, knownBalances: 5 })).to.equal(true);
  });

  it('ucieta historia to przyblizenie, choćby sald bylo duzo', () => {
    expect(holdersAreExact({ complete: false, knownBalances: 500 })).to.equal(false);
  });

  it('kompletna historia BEZ sald nie jest dowodem na zero holderow', () => {
    // Tak wygladal token z zatruta mapa: naglowek mowil "komplet", a wierszy
    // nie bylo ani jednego. Braku danych nie wolno czytac jako danych.
    expect(holdersAreExact({ complete: true, knownBalances: 0 })).to.equal(false);
  });
});

describe('pickHolderCount', () => {
  it('przy dokladnych saldach liczy NASZA liczbe, nawet gdy indeks mowi wiecej', () => {
    expect(pickHolderCount({ chain: 4, index: 9, exact: true })).to.equal(4);
  });

  it('przy dokladnych saldach spozniony indeks nie zanizy liczby', () => {
    expect(pickHolderCount({ chain: 4, index: 1, exact: true })).to.equal(4);
  });

  it('bez dokladnych sald wygrywa wieksza z dwoch - nasza bywa za mala', () => {
    expect(pickHolderCount({ chain: 2, index: 40, exact: false })).to.equal(40);
  });

  it('milczacy indeks nie jest zerem', () => {
    expect(pickHolderCount({ chain: 3, index: null, exact: false })).to.equal(3);
  });
});

describe('pickHolderRows', () => {
  const chain: Array<[string, bigint]> = [['0xa', 1n], ['0xb', 2n]];
  const index: Array<[string, bigint]> = [['0xc', 3n], ['0xd', 4n], ['0xe', 5n]];

  it('przy dokladnych saldach tabela idzie z lancucha, choćby indeks mial wiecej wierszy', () => {
    expect(pickHolderRows({ chain, index, exact: true })).to.equal(chain);
  });

  it('bez dokladnych sald pokrycie idzie z wiekszego zrodla', () => {
    // Rozlaczne adresy: indeks daje pokrycie, nasze wiersze sa dopisane, bo
    // wlasny swiezy odczyt nie ma prawa wypasc z tabeli tylko dlatego, ze
    // cudzy indeks jeszcze o nim nie wie.
    const out = pickHolderRows({ chain, index, exact: false });

    expect(out.map((r: [string, bigint]) => r[0])).to.deep.equal(['0xc', '0xd', '0xe', '0xa', '0xb']);
  });

  it('KWOTY biora sie z lancucha, nawet gdy wiersze z indeksu', () => {
    // To jest blad, ktory bylo widac na Arc: indeks mowil o krzywej 999,7M,
    // a `balanceOf` dawal rowno 1000M. Pokrycie z indeksu, kwota nasza.
    const staleIndex: Array<[string, bigint]> = [['0xa', 9997n], ['0xz', 5n]];
    const fresh: Array<[string, bigint]> = [['0xa', 10000n]];

    const out = pickHolderRows({ chain: fresh, index: staleIndex, exact: false });

    expect(out.find((r: [string, bigint]) => r[0] === '0xa')?.[1], 'kwota z lancucha, nie z indeksu').to.equal(10000n);
    expect(out.find((r: [string, bigint]) => r[0] === '0xz')?.[1], 'adres znany tylko indeksowi zostaje').to.equal(5n);
  });

  it('dokladne, ale puste, nie przebija indeksu - pusta tabela nie jest wynikiem', () => {
    // Porownanie PO WARTOSCI, nie po referencji: od 16.09 funkcja scala kwoty
    // z lancucha z pokryciem indeksu, wiec zawsze oddaje nowa tablice.
    expect(pickHolderRows({ chain: [], index, exact: true })).to.deep.equal(index);
  });

  it('remis oddaje pokrycie indeksu, bo on siega dalej niz okno skanu', () => {
    const sameSize: Array<[string, bigint]> = [['0xc', 3n], ['0xd', 4n]];

    const out = pickHolderRows({ chain, index: sameSize, exact: false });

    expect(out.slice(0, 2).map((r: [string, bigint]) => r[0])).to.deep.equal(['0xc', '0xd']);
  });
});
