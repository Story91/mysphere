export {};

const { expect } = require('chai');
const {
  planBoardStatsScan,
  splitPayload,
  joinPayload,
  stalePartIds,
  boardStatsDocId,
  partId,
  MAX_PARTS,
} = require('../app/api/launchpad/boardStatsLayout');
const { pickAggregateBase, readBoardStatsResponse } = require('../app/startpad/boardStats');
const {
  emptyAggregate,
  reduceBoardLogs,
  serializeAggregate,
  mergeAggregates,
} = require('../app/startpad/boardScan');

/**
 * WSPOLNY AGREGAT TABLICY.
 *
 * Zgloszenie: "wchodze na strone z innego urzadzenia i pobiera dane od nowa,
 * zamiast zapisac poprzednie i aktualizowac przy wlaczaniu - tokeny, wolumen,
 * wszystko na startpadzie, na kazdej sieci".
 *
 * Przyczyna byla jedna: policzony agregat lezal WYLACZNIE w `localStorage`
 * jednej przegladarki. Drugie urzadzenie nie mialo czego odswiezyc, wiec
 * liczylo wszystko od bloku wdrozenia - a to juz sie nie miesci w suficie okien
 * (Base Sepolia potrzebuje ~96 okien przy suficie 64), wiec skan konczyl sie
 * jako niewiarygodny i agregat NIE BYL ZAPISYWANY nawet lokalnie. Cache, ktory
 * nigdy sie nie zapisuje, nie istnieje.
 *
 * Te testy pilnuja trzech rzeczy, ktore musza byc poprawne, zeby naprawa nie
 * byla gorsza od usterki:
 *   1. serwerowy plan skanu idzie W GORE i ZAPISUJE POSTEP, wiec zaleglosc
 *      domyka sie w kilku zadaniach zamiast nie domykac sie nigdy;
 *   2. dwa zapamietane agregaty (serwer i localStorage) sa WYBIERANE, nigdy
 *      sumowane - oba znacza "policzone od bloku wdrozenia", wiec zlozenie ich
 *      podwoiloby wolumen;
 *   3. odpowiedz serwera czytana jest nieufnie: cokolwiek nie pasuje do
 *      ksztaltu znaczy "nie ma agregatu", a nie "agregat jest pusty".
 */

const DEPLOY = 1_000_000n;
const WINDOW = 10_000n;
const MAX_WINDOWS = 40;
const BUDGET = WINDOW * BigInt(MAX_WINDOWS); // 400 000 blokow na zadanie

const plan = (over: Record<string, unknown> = {}) =>
  planBoardStatsScan({
    cachedLastBlock: null,
    head: DEPLOY + 1_000n,
    deployBlock: DEPLOY,
    scanWindow: WINDOW,
    maxWindows: MAX_WINDOWS,
    ...over,
  });

/** Okna maja pokrywac [floor, ceiling] BEZ DZIUR i BEZ ZACHODZENIA. */
const assertContiguous = (windows: Array<{ fromBlock: bigint; toBlock: bigint }>, floor: bigint, ceiling: bigint) => {
  expect(windows.length).to.be.greaterThan(0);
  expect(windows[0].fromBlock).to.equal(floor);
  expect(windows[windows.length - 1].toBlock).to.equal(ceiling);
  for (let index = 0; index < windows.length; index += 1) {
    expect(windows[index].toBlock >= windows[index].fromBlock).to.equal(true);
    if (index > 0) expect(windows[index].fromBlock).to.equal(windows[index - 1].toBlock + 1n);
  }
};

describe('Startpad - plan serwerowego skanu agregatu', () => {
  it('bez zapisu rusza od bloku wdrozenia i nie wznawia', () => {
    const result = plan({ cachedLastBlock: null, head: DEPLOY + 25_000n });
    expect(result.resume).to.equal(false);
    assertContiguous(result.windows, DEPLOY, DEPLOY + 25_000n);
  });

  it('z zapisem rusza DOKLADNIE jeden blok nad nim - zakresy nie zachodza', () => {
    const result = plan({ cachedLastBlock: DEPLOY + 5_000n, head: DEPLOY + 25_000n });
    expect(result.resume).to.equal(true);
    assertContiguous(result.windows, DEPLOY + 5_001n, DEPLOY + 25_000n);
  });

  it('zaleglosc wieksza niz jedno zadanie NIE kasuje wznowienia - to jest cala roznica wobec planu przegladarki', () => {
    // Przegladarka (`planBoardScan`) przy takiej zaleglosci oddaje
    // `resume: false` i skanuje od bloku wdrozenia, bo nie umie zapisac
    // postepu. Serwer umie, wiec nadrabia porcjami i nie traci tego, co ma.
    const result = plan({ cachedLastBlock: DEPLOY + 100n, head: DEPLOY + 10_000_000n });
    expect(result.resume).to.equal(true);
    expect(result.windows.length).to.equal(MAX_WINDOWS);
    assertContiguous(result.windows, DEPLOY + 101n, DEPLOY + 100n + BUDGET);
    // Sufit okien jest TEMPEM, nie sciana: kolejne zadanie rusza znad tego.
    expect(result.ceiling < DEPLOY + 10_000_000n).to.equal(true);
  });

  it('kolejne zadania domykaja zaleglosc, ktorej jedno nie uniesie', () => {
    const head = DEPLOY + BUDGET * 2n + 7n;
    const first = plan({ cachedLastBlock: null, head });
    const second = plan({ cachedLastBlock: first.ceiling, head });
    const third = plan({ cachedLastBlock: second.ceiling, head });

    // Bez dziury na kazdym styku.
    expect(second.windows[0].fromBlock).to.equal(first.ceiling + 1n);
    expect(third.windows[0].fromBlock).to.equal(second.ceiling + 1n);
    expect(third.ceiling).to.equal(head);
  });

  it('zapis siegajacy glowy nie generuje ani jednego okna', () => {
    const result = plan({ cachedLastBlock: DEPLOY + 25_000n, head: DEPLOY + 25_000n });
    expect(result.resume).to.equal(true);
    expect(result.windows.length).to.equal(0);
  });

  it('zapis ponizej bloku wdrozenia znaczy pelny skan - jego suma nie opisuje calosci', () => {
    const result = plan({ cachedLastBlock: DEPLOY - 1n, head: DEPLOY + 25_000n });
    expect(result.resume).to.equal(false);
    assertContiguous(result.windows, DEPLOY, DEPLOY + 25_000n);
  });

  it('zapis POWYZEJ glowy lancucha znaczy pelny skan - inny endpoint albo reorganizacja', () => {
    // Doliczenie delty do stanu, ktory siega wyzej niz glowa, policzyloby
    // czesc zdarzen dwa razy. Wolumenu potem nikt nie odkreci.
    const result = plan({ cachedLastBlock: DEPLOY + 90_000n, head: DEPLOY + 25_000n });
    expect(result.resume).to.equal(false);
    assertContiguous(result.windows, DEPLOY, DEPLOY + 25_000n);
  });

  it('ostatnie okno konczy sie na glowie, a nie nad nia', () => {
    const result = plan({ cachedLastBlock: null, head: DEPLOY + 15_000n });
    expect(result.windows.length).to.equal(2);
    expect(result.windows[1].toBlock).to.equal(DEPLOY + 15_000n);
  });
});

describe('Startpad - uklad kawalkow agregatu w bazie', () => {
  it('rozbicie i zlozenie oddaje ten sam ciag', () => {
    const json = 'x'.repeat(450_123);
    const parts = splitPayload(json, 100_000);
    expect(parts.length).to.equal(5);
    expect(joinPayload(parts)).to.equal(json);
  });

  it('pusty agregat to JEDEN kawalek, nie zero - zero znaczy naglowek bez tresci', () => {
    expect(splitPayload('').length).to.equal(1);
  });

  it('NIE tnie pary zastepczej - inaczej emoji w nazwie tokena wraca jako dwa znaki zapytania', () => {
    // Ciecie wypadloby dokladnie miedzy polowkami emoji. Firestore trzyma
    // stringi w UTF-8, wiec samotna polowka wraca jako U+FFFD - i nazwa tokena
    // zostaje uszkodzona na zawsze, bo `JSON.parse` sie na tym nie wywala.
    const json = 'a'.repeat(9) + '\u{1F680}' + 'b'.repeat(9);
    const parts = splitPayload(json, 10);
    expect(joinPayload(parts)).to.equal(json);
    for (const part of parts) {
      // Zadna polowka pary nie stoi samotnie na brzegu kawalka.
      const first = part.charCodeAt(0);
      const last = part.charCodeAt(part.length - 1);
      expect(first >= 0xdc00 && first <= 0xdfff).to.equal(false);
      expect(last >= 0xd800 && last <= 0xdbff).to.equal(false);
    }
  });

  it('sufit kawalka jest przestrzegany mimo unikania ciecia pary', () => {
    const json = '\u{1F680}'.repeat(50);
    for (const part of splitPayload(json, 7)) expect(part.length <= 7).to.equal(true);
  });

  it('krotszy zapis wskazuje ogon do skasowania - inaczej doklejalby sie jako smieci', () => {
    expect(stalePartIds(5, 2)).to.deep.equal([partId(2), partId(3), partId(4)]);
    expect(stalePartIds(2, 5)).to.deep.equal([]);
  });

  it('klucz niesie siec I ADRES LAUNCHPADA, zawsze malymi literami', () => {
    const checksummed = '0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D';
    expect(boardStatsDocId(8453, checksummed)).to.equal(`8453-${checksummed.toLowerCase()}`);
    // Ten sam launchpad zapisany dwoma sposobami nie moze dac dwoch dokumentow.
    expect(boardStatsDocId(8453, checksummed)).to.equal(boardStatsDocId(8453, checksummed.toLowerCase()));
    // Martwe wdrozenie na tej samej sieci ma WLASNY dokument - jego suma nie ma
    // prawa dosumowac sie do zywego launchpada.
    expect(boardStatsDocId(8453, '0x0000000000000000000000000000000000000001')).to.not.equal(
      boardStatsDocId(8453, checksummed)
    );
  });

  it('sufit kawalkow jest bezpiecznikiem, a nie pojemnoscia', () => {
    expect(MAX_PARTS).to.be.greaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  WYBOR PODSTAWY - NAJWAZNIEJSZA REGULA CALEJ ZMIANY                        */
/* -------------------------------------------------------------------------- */

const TOKEN = '0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
const BUYER = '0x1111111111111111111111111111111111111111';

const HELPERS = {
  ethOf: (wei: bigint) => Number(wei) / 1e18,
  priceOf: (eth: bigint, tokens: bigint) => (tokens <= 0n ? 0 : Number(eth) / Number(tokens)),
};

/** Agregat z jedna transakcja o wolumenie 1. */
const oneTrade = (hash: string) =>
  reduceBoardLogs(
    [
      {
        eventName: 'Bought',
        transactionHash: hash,
        blockNumber: 100n,
        logIndex: 0,
        args: {
          token: TOKEN,
          buyer: BUYER,
          ethNet: 10n ** 18n,
          ethReserveAfter: 4n * 10n ** 18n,
          tokenReserveAfter: 2n * 10n ** 18n,
        },
      },
    ],
    HELPERS,
    emptyAggregate()
  );

const HEAD = 1_000n;

describe('Startpad - wybor miedzy agregatem z serwera a lokalnym', () => {
  it('wygrywa ten, ktory siega WYZEJ', () => {
    const local = { aggregate: oneTrade('0xa'), lastBlock: 100n };
    const server = { aggregate: oneTrade('0xb'), lastBlock: 200n };
    expect(pickAggregateBase(local, server, HEAD).source).to.equal('server');
    expect(pickAggregateBase(local, server, HEAD).lastBlock).to.equal(200n);

    const ahead = { aggregate: oneTrade('0xc'), lastBlock: 300n };
    expect(pickAggregateBase(ahead, server, HEAD).source).to.equal('local');
  });

  it('przy remisie wygrywa lokalny - ta sama tresc, mniejszy koszt', () => {
    const local = { aggregate: oneTrade('0xa'), lastBlock: 150n };
    const server = { aggregate: oneTrade('0xb'), lastBlock: 150n };
    expect(pickAggregateBase(local, server, HEAD).source).to.equal('local');
  });

  it('kazdy z osobna, i brak obu', () => {
    const only = { aggregate: oneTrade('0xa'), lastBlock: 150n };
    expect(pickAggregateBase(null, only, HEAD).source).to.equal('server');
    expect(pickAggregateBase(only, null, HEAD).source).to.equal('local');
    expect(pickAggregateBase(null, null, HEAD)).to.equal(null);
  });

  it('podstawa NAD GLOWA odpada i przegrywa z lokalna, zamiast ja wyprzec', () => {
    // Serwer czyta glowe swoim endpointem, przegladarka swoim. Serwerowy
    // lastBlock o kilka blokow nad glowa tej przegladarki to stan normalny -
    // a `planBoardScan` odrzuca taka podstawe w calosci i skanuje od bloku
    // wdrozenia. Gdyby wygrala sam wysokoscia, naprawa POGARSZALABY objaw.
    const local = { aggregate: oneTrade('0xa'), lastBlock: 900n };
    const server = { aggregate: oneTrade('0xb'), lastBlock: HEAD + 3n };

    const picked = pickAggregateBase(local, server, HEAD);
    expect(picked.source).to.equal('local');
    expect(picked.lastBlock).to.equal(900n);
  });

  it('gdy OBIE siegaja nad glowe, nie ma podstawy - pelny skan jest wtedy jedyna prawda', () => {
    const local = { aggregate: oneTrade('0xa'), lastBlock: HEAD + 1n };
    const server = { aggregate: oneTrade('0xb'), lastBlock: HEAD + 2n };
    expect(pickAggregateBase(local, server, HEAD)).to.equal(null);
  });

  it('podstawa DOKLADNIE na glowie jest dobra - nie ma czego dociagac', () => {
    const local = { aggregate: oneTrade('0xa'), lastBlock: HEAD };
    expect(pickAggregateBase(local, null, HEAD).source).to.equal('local');
  });

  it('WYBIERA, a nie sumuje - zlozenie dwoch pelnych agregatow podwoiloby wolumen', () => {
    // Oba stany znacza "policzone od bloku wdrozenia do lastBlock", wiec ich
    // zakresy zachodza na siebie prawie w calosci. To jest dowod, ze wybor jest
    // konieczny: `mergeAggregates` na tej samej parze daje wolumen 2 zamiast 1.
    const local = { aggregate: oneTrade('0xa'), lastBlock: 100n };
    const server = { aggregate: oneTrade('0xb'), lastBlock: 200n };

    const picked = pickAggregateBase(local, server, HEAD);
    expect(picked.aggregate.activity.get(TOKEN).volume).to.equal(1);
    expect(picked.aggregate.activity.get(TOKEN).trades).to.equal(1);

    const wrong = mergeAggregates(local.aggregate, server.aggregate);
    expect(wrong.activity.get(TOKEN).volume).to.equal(2);
  });
});

describe('Startpad - tasma z serwerowego skanu W GORE', () => {
  it('zapis oddaje NAJNOWSZE zdarzenia, mimo ze skan szedl od najstarszych', () => {
    /**
     * `serializeAggregate` tnie tasme przez `feed.slice(0, MAX_FEED_ENTRIES)`,
     * czyli OD POCZATKU tablicy. Dla przegladarki jest to poprawne, bo ona
     * skanuje od glowy w dol i ma tasme najnowszymi do przodu. Serwer idzie w
     * gore, wiec jego surowa tasma jest odwrotna i to samo ciecie zostawiloby
     * NAJSTARSZE zdarzenia launchpada - "live tape" pokazywalaby pierwsze
     * transakcje w historii na kazdym urzadzeniu.
     *
     * Trasa przepuszcza wiec kazdy agregat przez `mergeAggregates`, ktore
     * sortuje malejaco przed cieciem. Ten test pilnuje wlasnie tego kroku.
     */
    const ascending = emptyAggregate();
    for (let block = 1; block <= 100; block += 1) {
      reduceBoardLogs(
        [
          {
            eventName: 'Bought',
            transactionHash: `0x${block}`,
            blockNumber: BigInt(block),
            logIndex: 0,
            args: {
              token: TOKEN,
              buyer: BUYER,
              ethNet: 10n ** 18n,
              ethReserveAfter: 4n * 10n ** 18n,
              tokenReserveAfter: 2n * 10n ** 18n,
            },
          },
        ],
        HELPERS,
        ascending
      );
    }

    const naive = serializeAggregate(ascending);
    const highestNaive = Math.max(...naive.feed.map((entry: { order: number }) => entry.order));

    const fixed = serializeAggregate(mergeAggregates(emptyAggregate(), ascending));
    const highestFixed = Math.max(...fixed.feed.map((entry: { order: number }) => entry.order));

    // Blok 100 to najnowsze zdarzenie: `order` = 100 * 10 000.
    expect(highestFixed).to.equal(1_000_000);
    // A tak wygladalby zapis bez tego kroku - sama koncowka najstarszych.
    expect(highestNaive).to.be.lessThan(highestFixed);
  });
});

describe('Startpad - odpowiedz trasy agregatu czytana nieufnie', () => {
  const good = () => ({
    ok: true,
    lastBlock: '1234',
    aggregate: serializeAggregate(oneTrade('0xa')),
  });

  it('poprawna odpowiedz daje agregat i blok', () => {
    const read = readBoardStatsResponse(good());
    expect(read.lastBlock).to.equal(1234n);
    expect(read.aggregate.activity.get(TOKEN).volume).to.equal(1);
  });

  it('odrzuca wszystko, co nie jest pelna odpowiedzia', () => {
    expect(readBoardStatsResponse(null)).to.equal(null);
    expect(readBoardStatsResponse('nie obiekt')).to.equal(null);
    expect(readBoardStatsResponse({ ...good(), ok: false })).to.equal(null);
    expect(readBoardStatsResponse({ ...good(), lastBlock: 1234 })).to.equal(null);
    expect(readBoardStatsResponse({ ...good(), lastBlock: '0' })).to.equal(null);
    expect(readBoardStatsResponse({ ...good(), lastBlock: 'abc' })).to.equal(null);
    expect(readBoardStatsResponse({ ...good(), aggregate: null })).to.equal(null);
  });

  it('uszkodzony agregat znaczy BRAK agregatu, a nie agregat pusty', () => {
    // Ujemny wolumen to uszkodzony zapis, nie maly rynek. Gdyby przeszedl jako
    // "pusty", przegladarka dosumowalaby do niego delte i zapisala jako pelna.
    const broken = good();
    broken.aggregate.activity = [[TOKEN, { volume: -5, trades: 1 }]];
    expect(readBoardStatsResponse(broken)).to.equal(null);
  });
});
