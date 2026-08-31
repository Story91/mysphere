export {};

const { expect } = require('chai');
const { mergeIndex, indexDocId } = require('../app/api/launchpad/tokenIndexShape');

/**
 * INDEKS TOKENOW - lista startow trzymana w bazie.
 *
 * Zgloszenie z 13 sierpnia 2026: z tablicy znikal SAUSAGES, czyli NAJSTARSZY i
 * najwiekszy token. To nie byl przypadek. Lista powstawala ze skanu zdarzen
 * `Launched` robionego W PRZEGLADARCE, oknami po 9500 blokow. Sonda pokazala,
 * gdzie leza wszystkie piec startow:
 *
 *   okno 0  blok 49927416      okno 8  blok 49856516
 *   okno 2  blok 49910795      okno 9  blok 49848206  <- SAUSAGES
 *   okno 4  blok 49887587
 *
 * Najstarszy token siedzi w NAJGLEBSZYM oknie, wiec cokolwiek utnie skan -
 * limit RPC, padniete okno, sufit okien - zabiera najpierw wlasnie jego.
 *
 * Dlatego lista przestaje powstawac przy kazdym wejsciu, a zaczyna byc
 * ZAPISYWANA. Tak robi to kazdy duzy launchpad: pump.fun czyta z wlasnego API,
 * Flaunch z subgrafu, a lancuch sluzy im wylacznie do dowozenia nowosci.
 *
 * Te testy pilnuja jedynej wlasnosci, na ktorej to stoi: RAZ ZAPISANY TOKEN
 * NIE MOZE WYPASC Z LISTY.
 */

const token = (address: string, block: number, over: Record<string, unknown> = {}) => ({
  address,
  name: 'Token',
  symbol: 'TKN',
  creator: '0x1111111111111111111111111111111111111111',
  launchBlock: String(block),
  startedAt: 1_700_000_000 + block,
  ...over,
});

const A = '0xaaaa000000000000000000000000000000000001';
const B = '0xbbbb000000000000000000000000000000000002';
const C = '0xcccc000000000000000000000000000000000003';

describe('indexDocId', () => {
  it('rozdziela sieci - ten sam launchpad na dwoch lancuchach to dwie listy', () => {
    expect(indexDocId(8453)).to.not.equal(indexDocId(84532));
  });
});

describe('mergeIndex', () => {
  it('dokleja nowy token do zapisanej listy, nowszy na gorze', () => {
    const merged = mergeIndex([token(A, 100)], [token(B, 200)]);

    expect(merged.map((t: any) => t.address)).to.deep.equal([B, A]);
  });

  it('NIE GUBI tokena, ktorego nowy skan nie zwrocil - to jest cala poprawka', () => {
    // Skan objal tylko swiezy zakres i nie widzial startu sprzed tygodnia.
    // Dokladnie ten przypadek zabieral SAUSAGES z tablicy.
    const merged = mergeIndex([token(A, 100), token(B, 200)], [token(B, 200)]);

    expect(merged.map((t: any) => t.address)).to.deep.equal([B, A]);
  });

  it('nie duplikuje tokena, ktory byl i przyszedl znowu', () => {
    const merged = mergeIndex([token(A, 100)], [token(A, 100)]);

    expect(merged).to.have.length(1);
  });

  it('swiezsze dane wygrywaja przy tym samym adresie - nazwa mogla dojsc pozniej', () => {
    const merged = mergeIndex([token(A, 100, { name: '' })], [token(A, 100, { name: 'Hot' })]);

    expect(merged[0].name).to.equal('Hot');
  });

  it('adres porownywany bez wzgledu na wielkosc liter', () => {
    const merged = mergeIndex([token(A, 100)], [token(A.toUpperCase(), 100)]);

    expect(merged).to.have.length(1);
  });

  it('uklada od NAJNOWSZEGO startu - tablica pokazuje swieze u gory', () => {
    const merged = mergeIndex([], [token(A, 100), token(C, 300), token(B, 200)]);

    expect(merged.map((t: any) => t.address)).to.deep.equal([C, B, A]);
  });

  it('wiersz bez adresu nie wchodzi do indeksu', () => {
    expect(mergeIndex([], [token('', 100)])).to.have.length(0);
  });

  it('pusty skan zostawia zapisana liste nietknieta', () => {
    const stored = [token(A, 100), token(B, 200)];

    expect(mergeIndex(stored, [])).to.have.length(2);
  });
});
