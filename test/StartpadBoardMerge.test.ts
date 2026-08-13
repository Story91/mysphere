export {};

const { expect } = require('chai');
const { shouldKeepUnscanned, scanIsTrustworthy } = require('../app/startpad/boardScan');

/**
 * ZNIKAJACE TOKENY NA TABLICY.
 *
 * Objaw zgloszony 13 sierpnia 2026: przy zywszym ruchu tokeny potrafily zniknac
 * z /startpad. Dla kogos, kto ma tam pieniadze, zniknieciе tokena z listy
 * wyglada jak utrata srodkow - to nie jest usterka kosmetyczna.
 *
 * Przyczyna: okno skanu, ktore padlo dwa razy pod rzad, oddawalo PUSTA LISTE
 * zamiast bledu (LaunchpadBoard: `return []`). Skan konczyl sie wiec jako
 * kompletny, znacznik uciecia byl wylaczony, a regula scalania wyrzucala z
 * tablicy kazdy token starszy niz kwadrans, ktorego `Launched` byl akurat w tym
 * oknie. Awaria odczytu udawala fakt "tego tokena nie ma".
 *
 * Stad te dwie funkcje: skan musi umiec powiedziec, ze jest NIEPELNY, a wiersz
 * spoza skanu wolno wyrzucic dopiero wtedy, gdy skan bylo komu zaufac.
 */

describe('scanIsTrustworthy', () => {
  it('skan bez bledow, ktory zszedl do bloku wdrozenia, jest kompletny', () => {
    expect(scanIsTrustworthy({ failedWindows: 0, lowestScanned: 100n, deployBlock: 100n })).to.equal(true);
  });

  it('jedno padniete okno odbiera skanowi prawo do kasowania wierszy', () => {
    expect(scanIsTrustworthy({ failedWindows: 1, lowestScanned: 100n, deployBlock: 100n })).to.equal(false);
  });

  it('skan uciety na suficie okien nie jest kompletny, choc nic nie padlo', () => {
    expect(scanIsTrustworthy({ failedWindows: 0, lowestScanned: 500n, deployBlock: 100n })).to.equal(false);
  });
});

describe('shouldKeepUnscanned', () => {
  const now = 1_700_000_000;
  const stary = { live: true, address: '0xabc', startedAt: now - 3600 };

  it('token spoza NIEPELNEGO skanu zostaje na tablicy', () => {
    expect(shouldKeepUnscanned(stary, { now, scanned: new Set(), trustworthy: false })).to.equal(true);
  });

  it('token spoza KOMPLETNEGO skanu znika - to martwe wdrozenie, nie awaria', () => {
    expect(shouldKeepUnscanned(stary, { now, scanned: new Set(), trustworthy: true })).to.equal(false);
  });

  it('swiezy start zostaje nawet przy kompletnym skanie - RPC go jeszcze nie widzi', () => {
    const swiezy = { live: true, address: '0xabc', startedAt: now - 60 };

    expect(shouldKeepUnscanned(swiezy, { now, scanned: new Set(), trustworthy: true })).to.equal(true);
  });

  it('token, ktory skan widzial, nie jest doklejany drugi raz', () => {
    expect(shouldKeepUnscanned(stary, { now, scanned: new Set(['0xabc']), trustworthy: false })).to.equal(false);
  });

  it('adres porownywany bez wzgledu na wielkosc liter', () => {
    const row = { live: true, address: '0xAbC', startedAt: now - 3600 };

    expect(shouldKeepUnscanned(row, { now, scanned: new Set(['0xabc']), trustworthy: false })).to.equal(false);
  });

  it('wiersz podgladowy nie jest tokenem i nigdy nie zostaje', () => {
    expect(shouldKeepUnscanned({ live: false, address: '0xabc', startedAt: now }, { now, scanned: new Set(), trustworthy: false })).to.equal(false);
  });
});
