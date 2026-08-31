export {};

const { expect } = require('chai');
const {
  emptyAggregate,
  reduceBoardLogs,
  mergeAggregates,
  serializeAggregate,
  parseAggregate,
  MAX_BUYERS_PER_TOKEN,
  MAX_FEED_ENTRIES,
  MAX_PRICES_PER_TOKEN,
} = require('../app/startpad/boardScan');

/**
 * SKAN ROZNICOWY TABLICY.
 *
 * Do 15 sierpnia 2026 `/startpad` przy kazdym wejsciu skanowal lancuch od glowy
 * az do bloku wdrozenia launchpada - koszt rosnacy z kazda doba Base, z twardym
 * sufitem okien, po ktorym najstarsze tokeny tracily wolumen i ceny.
 *
 * Naprawa stoi na jednej wlasnosci: wszystko, co tablica liczy z logow, jest
 * ADDYTYWNE, wiec wynik wolno zapamietac razem z blokiem, do ktorego jest
 * policzony, i nastepnym razem doliczyc same nowe bloki. Te testy pilnuja
 * dokladnie tego: ze redukcja liczy to samo co petla, ktora zastapila, ze
 * scalanie sumuje bez gubienia i bez podwajania, i ze uszkodzony zapis konczy
 * sie brakiem migawki, a nie cichym doliczeniem smieci.
 */

const TOKEN_A = '0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
const TOKEN_B = '0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB';
const BUYER_1 = '0x1111111111111111111111111111111111111111';
const BUYER_2 = '0x2222222222222222222222222222222222222222';
const CREATOR = '0xCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCc';

const HELPERS = {
  ethOf: (wei: bigint) => Number(wei) / 1e18,
  priceOf: (eth: bigint, tokens: bigint) => (tokens <= 0n ? 0 : Number(eth) / Number(tokens)),
};

/**
 * Pola loga nadpisujemy PRZED `args`, a nie po - inaczej `...over` podmienialby
 * cale `args` na sama nadpiske i log tracil adres tokena.
 */
const bought = (over: Record<string, unknown> = {}) => {
  const { args, ...rest } = over;
  return {
    eventName: 'Bought',
    transactionHash: '0xhash1',
    blockNumber: 100n,
    logIndex: 0,
    ...rest,
    args: {
      token: TOKEN_A,
      buyer: BUYER_1,
      ethNet: 10n ** 18n,
      ethReserveAfter: 4n * 10n ** 18n,
      tokenReserveAfter: 2n * 10n ** 18n,
      ...((args as Record<string, unknown>) ?? {}),
    },
  };
};

describe('reduceBoardLogs', () => {
  it('z Launched bierze tozsamosc tokena i wpis na tasme', () => {
    const agg = reduceBoardLogs(
      [
        {
          eventName: 'Launched',
          transactionHash: '0xh',
          blockNumber: 10n,
          logIndex: 1,
          args: { token: TOKEN_A, name: 'Alfa', symbol: 'ALF', creator: CREATOR, startedAt: 1_700_000_000 },
        },
      ],
      HELPERS
    );

    expect(agg.launched.get(TOKEN_A)).to.deep.equal({
      name: 'Alfa',
      symbol: 'ALF',
      creator: CREATOR,
      startedAt: 1_700_000_000,
    });
    expect(agg.feed).to.have.length(1);
    expect(agg.feed[0].tone).to.equal('launch');
  });

  it('kupno liczy wolumen, transakcje, kupujacego i cene po transakcji', () => {
    const agg = reduceBoardLogs([bought()], HELPERS);

    expect(agg.activity.get(TOKEN_A)).to.deep.equal({ volume: 1, trades: 1 });
    expect([...agg.buyers.get(TOKEN_A)]).to.deep.equal([BUYER_1]);
    expect(agg.priceEntries.get(TOKEN_A)[0].price).to.equal(2);
  });

  it('sprzedajacy tez jest handlujacym - kolumna liczy uczestnikow, nie kupno', () => {
    const agg = reduceBoardLogs(
      [
        {
          eventName: 'Sold',
          transactionHash: '0xh',
          blockNumber: 101n,
          logIndex: 0,
          args: { token: TOKEN_A, seller: BUYER_2, ethOut: 10n ** 18n, ethReserveAfter: 1n, tokenReserveAfter: 1n },
        },
      ],
      HELPERS
    );

    expect([...agg.buyers.get(TOKEN_A)]).to.deep.equal([BUYER_2]);
    expect(agg.activity.get(TOKEN_A).trades).to.equal(1);
  });

  it('cena nie powstaje z pustej rezerwy tokena - dzielenie przez zero nie jest cena', () => {
    const agg = reduceBoardLogs([bought({ args: { tokenReserveAfter: 0n } })], HELPERS);

    expect(agg.priceEntries.has(TOKEN_A)).to.equal(false);
  });

  it('FeeAccrued liczy sie TYLKO dla strony tworcy (kind 1)', () => {
    const fee = (kind: number) => ({
      eventName: 'FeeAccrued',
      transactionHash: '0xh',
      blockNumber: 5n,
      logIndex: 0,
      args: { token: TOKEN_A, account: CREATOR, amount: 7n, kind },
    });

    const creatorSide = reduceBoardLogs([fee(1)], HELPERS);
    const protocolSide = reduceBoardLogs([fee(0)], HELPERS);

    expect(creatorSide.creatorSideEarned.get(CREATOR.toLowerCase()).get(TOKEN_A)).to.equal(7n);
    expect(protocolSide.creatorSideEarned.size).to.equal(0);
  });

  it('log bez tokena nie psuje agregatu', () => {
    const agg = reduceBoardLogs([{ eventName: 'Bought', args: {}, blockNumber: 1n, logIndex: 0 }], HELPERS);

    expect(agg.activity.size).to.equal(0);
  });

  it('zbior handlujacych ma sufit - kolumna nasyca sie zamiast zjadac localStorage', () => {
    const logs = Array.from({ length: MAX_BUYERS_PER_TOKEN + 25 }, (_, index) =>
      bought({
        blockNumber: BigInt(index),
        args: { buyer: `0x${String(index).padStart(40, '0')}` },
      })
    );

    const agg = reduceBoardLogs(logs, HELPERS);

    expect(agg.buyers.get(TOKEN_A).size).to.equal(MAX_BUYERS_PER_TOKEN);
    // Wolumen NIE nasyca sie razem z nim - to sa dwie rozne liczby.
    expect(agg.activity.get(TOKEN_A).trades).to.equal(MAX_BUYERS_PER_TOKEN + 25);
  });
});

describe('planBoardScan', () => {
  const { planBoardScan } = require('../app/startpad/boardScan');
  const base = { head: 1_000_000n, deployBlock: 900_000n, maxSpan: 100_000n };

  it('bez zapamietanego agregatu skanuje od bloku wdrozenia', () => {
    expect(planBoardScan({ ...base, cachedLastBlock: null })).to.deep.equal({ floor: 900_000n, resume: false });
  });

  it('z pokryciem dolicza SAME nowe bloki - o to chodzi w calej zmianie', () => {
    expect(planBoardScan({ ...base, cachedLastBlock: 999_000n })).to.deep.equal({ floor: 999_001n, resume: true });
  });

  it('pokrycie na glowie nie ma czego skanowac, ale dalej wolno mu wierzyc', () => {
    expect(planBoardScan({ ...base, cachedLastBlock: 1_000_000n })).to.deep.equal({ floor: 1_000_001n, resume: true });
  });

  it('pokrycie ponizej bloku wdrozenia to nie jest pokrycie', () => {
    expect(planBoardScan({ ...base, cachedLastBlock: 899_999n })).to.deep.equal({ floor: 900_000n, resume: false });
  });

  it('glowa cofnieta pod agregatem znaczy inna siec albo inny endpoint', () => {
    expect(planBoardScan({ ...base, cachedLastBlock: 1_000_001n })).to.deep.equal({ floor: 900_000n, resume: false });
  });

  it('zaleglosc wieksza niz jedno zadanie konczy sie pelnym skanem, nie dziura', () => {
    expect(planBoardScan({ ...base, cachedLastBlock: 899_999n + 1n, maxSpan: 10n })).to.deep.equal({
      floor: 900_000n,
      resume: false,
    });
  });
});

describe('mergeAggregates', () => {
  it('wolumen i transakcje sie sumuja - na tym stoi caly skan roznicowy', () => {
    const base = reduceBoardLogs([bought({ blockNumber: 100n })], HELPERS);
    const delta = reduceBoardLogs([bought({ blockNumber: 200n, transactionHash: '0xhash2' })], HELPERS);

    const merged = mergeAggregates(base, delta);

    expect(merged.activity.get(TOKEN_A)).to.deep.equal({ volume: 2, trades: 2 });
  });

  it('handlujacy ida w unie, wiec ten sam adres w obu zakresach liczy sie raz', () => {
    const base = reduceBoardLogs([bought({ blockNumber: 100n })], HELPERS);
    const delta = reduceBoardLogs(
      [bought({ blockNumber: 200n, transactionHash: '0xhash2', args: { buyer: BUYER_2 } })],
      HELPERS
    );

    const merged = mergeAggregates(base, delta);

    expect(merged.buyers.get(TOKEN_A).size).to.equal(2);
  });

  it('naliczenia oplat sumuja sie per konto i per token', () => {
    const fee = (block: bigint, amount: bigint) => ({
      eventName: 'FeeAccrued',
      transactionHash: `0x${block}`,
      blockNumber: block,
      logIndex: 0,
      args: { token: TOKEN_A, account: CREATOR, amount, kind: 1 },
    });

    const merged = mergeAggregates(
      reduceBoardLogs([fee(1n, 5n)], HELPERS),
      reduceBoardLogs([fee(2n, 6n)], HELPERS)
    );

    expect(merged.creatorSideEarned.get(CREATOR.toLowerCase()).get(TOKEN_A)).to.equal(11n);
  });

  it('oplaty hooka sumuja sie per token', () => {
    const settled = (block: bigint, wei: bigint) => ({
      eventName: 'HookFeeSettled',
      transactionHash: `0x${block}`,
      blockNumber: block,
      logIndex: 0,
      args: { token: TOKEN_B, ethToCreator: wei },
    });

    const merged = mergeAggregates(
      reduceBoardLogs([settled(1n, 100n)], HELPERS),
      reduceBoardLogs([settled(2n, 200n)], HELPERS)
    );

    expect(merged.hookCreatorEth.get(TOKEN_B)).to.equal(300n);
  });

  it('ceny z tego samego zdarzenia nie dubluja sie po scaleniu', () => {
    const base = reduceBoardLogs([bought({ blockNumber: 100n })], HELPERS);
    const sameAgain = reduceBoardLogs([bought({ blockNumber: 100n })], HELPERS);

    const merged = mergeAggregates(base, sameAgain);

    // Klucz (blok, logIndex) jest ten sam, wiec punkt cenowy jest jeden.
    expect(merged.priceEntries.get(TOKEN_A)).to.have.length(1);
  });

  it('ceny ida rosnaco po bloku, bo wykres czyta je od konca', () => {
    const base = reduceBoardLogs([bought({ blockNumber: 300n })], HELPERS);
    const delta = reduceBoardLogs([bought({ blockNumber: 100n, transactionHash: '0xhash2' })], HELPERS);

    const merged = mergeAggregates(base, delta);

    expect(merged.priceEntries.get(TOKEN_A).map((p: any) => p.order)).to.deep.equal([1_000_000, 3_000_000]);
  });

  it('tasma nie dubluje wpisu o tym samym id i idzie od najnowszego', () => {
    const base = reduceBoardLogs([bought({ blockNumber: 100n })], HELPERS);
    const delta = reduceBoardLogs(
      [bought({ blockNumber: 100n }), bought({ blockNumber: 400n, transactionHash: '0xhash9' })],
      HELPERS
    );

    const merged = mergeAggregates(base, delta);

    expect(merged.feed).to.have.length(2);
    expect(merged.feed[0].order).to.be.greaterThan(merged.feed[1].order);
  });

  it('tasma ma sufit - nie rosnie w nieskonczonosc miedzy wizytami', () => {
    const many = Array.from({ length: MAX_FEED_ENTRIES + 20 }, (_, index) =>
      bought({ blockNumber: BigInt(index + 1), transactionHash: `0xh${index}` })
    );

    const merged = mergeAggregates(emptyAggregate(), reduceBoardLogs(many, HELPERS));

    expect(merged.feed).to.have.length(MAX_FEED_ENTRIES);
  });

  it('scalenie z pustym agregatem oddaje to samo, co bylo', () => {
    const only = reduceBoardLogs([bought()], HELPERS);

    const merged = mergeAggregates(emptyAggregate(), only);

    expect(merged.activity.get(TOKEN_A)).to.deep.equal({ volume: 1, trades: 1 });
    expect(merged.launched.size).to.equal(0);
  });
});

describe('serializeAggregate / parseAggregate', () => {
  const sample = () =>
    reduceBoardLogs(
      [
        {
          eventName: 'Launched',
          transactionHash: '0xh0',
          blockNumber: 9n,
          logIndex: 0,
          args: { token: TOKEN_A, name: 'Alfa', symbol: 'ALF', creator: CREATOR, startedAt: 1_700_000_000 },
        },
        bought(),
        {
          eventName: 'FeeAccrued',
          transactionHash: '0xh2',
          blockNumber: 11n,
          logIndex: 0,
          args: { token: TOKEN_A, account: CREATOR, amount: 42n, kind: 1 },
        },
        {
          eventName: 'HookFeeSettled',
          transactionHash: '0xh3',
          blockNumber: 12n,
          logIndex: 0,
          args: { token: TOKEN_A, ethToCreator: 7n },
        },
      ],
      HELPERS
    );

  it('oddaje ten sam agregat po zapisie i odczycie, razem z bigintami', () => {
    const restored = parseAggregate(JSON.parse(JSON.stringify(serializeAggregate(sample()))));

    expect(restored.activity.get(TOKEN_A)).to.deep.equal({ volume: 1, trades: 1 });
    expect(restored.creatorSideEarned.get(CREATOR.toLowerCase()).get(TOKEN_A)).to.equal(42n);
    expect(restored.hookCreatorEth.get(TOKEN_A)).to.equal(7n);
    expect([...restored.buyers.get(TOKEN_A)]).to.deep.equal([BUYER_1]);
    expect(restored.launched.get(TOKEN_A).symbol).to.equal('ALF');
  });

  it('odczytany agregat dalej sie scala - to jest caly sens zapisu', () => {
    const restored = parseAggregate(JSON.parse(JSON.stringify(serializeAggregate(sample()))));
    const delta = reduceBoardLogs([bought({ blockNumber: 500n, transactionHash: '0xlater' })], HELPERS);

    const merged = mergeAggregates(restored, delta);

    expect(merged.activity.get(TOKEN_A)).to.deep.equal({ volume: 2, trades: 2 });
  });

  it('nie zapisuje wiecej punktow cenowych, niz wynosi sufit', () => {
    const many = reduceBoardLogs(
      Array.from({ length: MAX_PRICES_PER_TOKEN + 30 }, (_, index) =>
        bought({ blockNumber: BigInt(index + 1), transactionHash: `0xp${index}` })
      ),
      HELPERS
    );

    expect(serializeAggregate(many).priceEntries[0][1]).to.have.length(MAX_PRICES_PER_TOKEN);
  });

  it('smiec zamiast agregatu to BRAK migawki, a nie polowa danych', () => {
    expect(parseAggregate(null)).to.equal(null);
    expect(parseAggregate('nie jestem agregatem')).to.equal(null);
    expect(parseAggregate({ hookCreatorEth: [[TOKEN_A, 'trzysta']] })).to.equal(null);
  });

  it('ujemny wolumen znaczy uszkodzony zapis, nie maly rynek', () => {
    expect(parseAggregate({ activity: [[TOKEN_A, { volume: -1, trades: 1 }]] })).to.equal(null);
  });

  it('pusty obiekt czyta sie jako pusty agregat, bo taki jest przed pierwszym startem', () => {
    const empty = parseAggregate({});

    expect(empty).to.not.equal(null);
    expect(empty.activity.size).to.equal(0);
  });
});
