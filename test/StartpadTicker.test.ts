export {};

// Czysta logika paska Startpada na /basechat (app/startpad/tickerSource.ts).
// Komponentu .tsx ten runner nie zaladuje, a config.ts w Node zawsze widzi
// Base (nie ma `window`), wiec test "zapisz 5042 i zaimportuj pasek" nic by
// nie sprawdzal. Sprawdzamy decyzje, ktore pasek podejmuje: siec, poolId,
// dekodowanie wierszy z serwera, okno doby, wiek wiersza i stany paska.
const { expect } = require('chai');
const {
  TICKER_CHAIN_ID,
  TICKER_NETWORK,
  TICKER_WINDOW_SECONDS,
  TICKER_MAX_ITEMS,
  isPoolId,
  pickPoolId,
  tickerHref,
  poolSwapsPath,
  swapItemId,
  swapRowsToTickerItems,
  mergeTickerItems,
  recentTickerItems,
  sanitizeTickerItems,
  tickerAge,
  retryDelayMs,
  tickerStatus,
} = require('../app/startpad/tickerSource');
const { LAUNCHPAD_NETWORKS, liveWatchFor, liveWatchForChain } = require('../app/startpad/config');
const { SPHERE_POOL_ID, SPHERE_TOKEN_ADDRESS } = require('../app/startpad/sphere/sphereConfig');
const { serializeTrade } = require('../app/startpad/[address]/historyScan');

const NOW = 1_790_000_000; // sekundy unixowe, dowolna stala chwila
const TOKEN = { address: '0xB200000000000000000000BA5eDb84c678432476', symbol: 'SPHERE' };
const ZERO_ID = `0x${'0'.repeat(64)}`;
const TX = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

function trade(overrides: Record<string, unknown>) {
  return {
    id: 'x',
    kind: 'buy',
    account: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af',
    eth: 10n ** 16n, // 0.01 ETH
    tokens: 5n * 10n ** 18n,
    priceWei: 123n,
    ethReserveAfter: 0n,
    block: 51_666_000n,
    logIndex: 7,
    ts: NOW - 120,
    txHash: TX(1),
    ...overrides,
  };
}

function item(overrides: Record<string, unknown>) {
  return { id: 'a', symbol: 'SPHERE', label: 'Pool buy', tone: 'buy', ts: NOW - 60, ...overrides };
}

describe('Pasek Startpada: siec jest przypieta do Base', () => {
  it('siec paska to Base mainnet, niezaleznie od wyboru na tablicy', () => {
    expect(TICKER_CHAIN_ID).to.equal(8453);
    expect(TICKER_NETWORK).to.equal(LAUNCHPAD_NETWORKS[8453]);
    expect(TICKER_NETWORK.poolManager).to.equal('0x498581fF718922c3f8e6A244956aF099B2652b2b');
    expect(TICKER_NETWORK.chain.nativeCurrency.symbol).to.equal('ETH');
  });

  it('linki z paska niosa ?c=8453, zeby strona tokena nie otworzyla sie na sieci z localStorage', () => {
    expect(tickerHref(TOKEN.address)).to.equal(`/startpad/${TOKEN.address}?c=8453`);
    expect(tickerHref()).to.equal('/startpad?c=8453');
  });

  it('zapytanie o swapy idzie na Base i z oknem doby liczonym na serwerze', () => {
    const url = new URL(poolSwapsPath(SPHERE_POOL_ID, TICKER_WINDOW_SECONDS), 'http://x');
    expect(url.pathname).to.equal('/api/launchpad/pool-swaps');
    expect(url.searchParams.get('chainId')).to.equal('8453');
    expect(url.searchParams.get('poolId')).to.equal(SPHERE_POOL_ID);
    expect(url.searchParams.get('sinceSeconds')).to.equal('86400');
    // Bez okna (szukanie ostatniej transakcji) parametru po prostu nie ma.
    expect(new URL(poolSwapsPath(SPHERE_POOL_ID), 'http://x').searchParams.has('sinceSeconds')).to.equal(false);
  });

  it('tempo podgladu paska liczy sie z Base, a nie z sieci aktywnej', () => {
    expect(liveWatchForChain(8453)).to.deep.equal(
      liveWatchFor({
        secondsPerBlock: LAUNCHPAD_NETWORKS[8453].secondsPerBlock,
        ownRpc: process.env.NEXT_PUBLIC_BASE_RPC_URL || process.env.NEXT_PUBLIC_CDP_RPC_URL,
        wsRpc: process.env.NEXT_PUBLIC_BASE_WS_URL,
      })
    );
    // Nieznana siec nie wywraca paska - dostaje tempo w granicach rozsadku.
    const unknown = liveWatchForChain(999_999);
    expect(unknown.pollingInterval).to.be.at.least(1_000);
  });
});

describe('Pasek Startpada: poolId SPHERE', () => {
  it('znana stala jest poprawnym, niezerowym poolId', () => {
    expect(isPoolId(SPHERE_POOL_ID)).to.equal(true);
    expect(SPHERE_TOKEN_ADDRESS).to.equal(TOKEN.address);
  });

  it('zerowy poolId z vaulta (token nieznany tej sieci) NIE kasuje puli - zostaje stala', () => {
    expect(pickPoolId(SPHERE_POOL_ID, ZERO_ID)).to.equal(SPHERE_POOL_ID);
  });

  it('blad odczytu (brak wartosci) tez zostawia stala', () => {
    expect(pickPoolId(SPHERE_POOL_ID, null)).to.equal(SPHERE_POOL_ID);
    expect(pickPoolId(SPHERE_POOL_ID, undefined)).to.equal(SPHERE_POOL_ID);
  });

  it('inny niezerowy poolId z lancucha wygrywa ze stala', () => {
    const other = `0x${'ab'.repeat(32)}`;
    expect(pickPoolId(SPHERE_POOL_ID, other)).to.equal(other);
  });

  it('bez zadnej poprawnej wartosci jest null, a nie zero udajace pule', () => {
    expect(pickPoolId(null, ZERO_ID)).to.equal(null);
    expect(pickPoolId('0x1234', 'nope')).to.equal(null);
  });
});

describe('Pasek Startpada: wiersze z /api/launchpad/pool-swaps', () => {
  it('zachowuje czas i blok zdarzenia, a id zgadza sie z wierszem z subskrypcji', () => {
    const rows = [serializeTrade(trade({}))];
    const [first] = swapRowsToTickerItems(rows, TOKEN);
    expect(first).to.deep.equal({
      id: `${TX(1)}-swap-7`,
      address: TOKEN.address,
      symbol: 'SPHERE',
      label: 'Pool buy',
      eth: 0.01,
      tone: 'buy',
      ts: NOW - 120,
      block: '51666000',
    });
    expect(first.id).to.equal(swapItemId(TX(1), 7));
  });

  it('sprzedaz jest sprzedaza', () => {
    const [row] = swapRowsToTickerItems([serializeTrade(trade({ kind: 'sell' }))], TOKEN);
    expect(row.label).to.equal('Pool sell');
    expect(row.tone).to.equal('sell');
  });

  it('serwer oddaje chronologicznie - pasek dostaje od najnowszego', () => {
    const rows = [
      serializeTrade(trade({ ts: NOW - 300, block: 100n, txHash: TX(1) })),
      serializeTrade(trade({ ts: NOW - 200, block: 150n, txHash: TX(2) })),
      serializeTrade(trade({ ts: NOW - 100, block: 200n, txHash: TX(3) })),
    ];
    const items = swapRowsToTickerItems(rows, TOKEN);
    expect(items.map((i: { block: string }) => i.block)).to.deep.equal(['200', '150', '100']);
  });

  it('uszkodzone wiersze i wiersze bez czasu odpadaja, reszta zostaje', () => {
    const good = serializeTrade(trade({}));
    const rows = [
      'garbage',
      good.split('|').slice(0, 9).join('|'),
      serializeTrade(trade({ ts: 0, txHash: TX(9) })),
      42,
      null,
      good,
    ];
    expect(swapRowsToTickerItems(rows, TOKEN)).to.have.length(1);
    expect(swapRowsToTickerItems('not an array', TOKEN)).to.deep.equal([]);
  });
});

describe('Pasek Startpada: laczenie, okno doby i migawka', () => {
  it('dokleja nowe bez duplikatow, od najnowszego, z sufitem', () => {
    const current = [item({ id: 'b', ts: NOW - 50 }), item({ id: 'a', ts: NOW - 500 })];
    const merged = mergeTickerItems(current, [item({ id: 'a', ts: NOW - 500 }), item({ id: 'c', ts: NOW - 10 })]);
    expect(merged.map((i: { id: string }) => i.id)).to.deep.equal(['c', 'b', 'a']);

    const many = Array.from({ length: TICKER_MAX_ITEMS + 5 }, (_, n) => item({ id: `n${n}`, ts: NOW - n }));
    const capped = mergeTickerItems([], many);
    expect(capped).to.have.length(TICKER_MAX_ITEMS);
    expect(capped[0].id).to.equal('n0');
  });

  it('bez nowosci oddaje ten sam obiekt - bez przerysowania paska', () => {
    const current = [item({ id: 'a' })];
    expect(mergeTickerItems(current, [])).to.equal(current);
    expect(mergeTickerItems(current, [item({ id: 'a' })])).to.equal(current);
  });

  it('okno doby: 24 h jeszcze tak, sekunde dluzej juz nie', () => {
    const items = [
      item({ id: 'edge', ts: NOW - TICKER_WINDOW_SECONDS }),
      item({ id: 'old', ts: NOW - TICKER_WINDOW_SECONDS - 1 }),
      item({ id: 'future', ts: NOW + 5 }),
    ];
    expect(recentTickerItems(items, NOW).map((i: { id: string }) => i.id)).to.deep.equal(['edge', 'future']);
  });

  it('migawka: wiersze tasmy tablicy (bez czasu) odpadaja, stare i zepsute tez', () => {
    const raw = [
      // ksztalt ActivityItem z tablicy - bez `ts`, czyli bez prawa do wieku
      { id: 'board', symbol: 'SPHERE', label: 'Buy', tone: 'buy', accent: '#fff', eth: 0.1 },
      item({ id: 'stale', ts: NOW - TICKER_WINDOW_SECONDS - 60 }),
      item({ id: 'bad-tone', tone: 'moon' }),
      item({ id: 'bad-address', address: '0x123' }),
      item({ id: 'bad-eth', eth: -1 }),
      item({ id: 'bad-block', block: '12a' }),
      'string',
      null,
      item({ id: 'ok', address: TOKEN.address, eth: 0.02, block: '51666000' }),
      item({ id: 'ok' }),
    ];
    const restored = sanitizeTickerItems(raw, NOW);
    expect(restored).to.deep.equal([
      { id: 'ok', symbol: 'SPHERE', label: 'Pool buy', tone: 'buy', ts: NOW - 60, eth: 0.02, address: TOKEN.address, block: '51666000' },
    ]);
    expect(sanitizeTickerItems({ items: [] }, NOW)).to.deep.equal([]);
  });
});

describe('Pasek Startpada: wiek wiersza i ponawianie', () => {
  it('wiek w tym samym zapisie, co zakladka Trades', () => {
    expect(tickerAge(NOW - 5, NOW)).to.equal('just now');
    expect(tickerAge(NOW + 30, NOW)).to.equal('just now');
    expect(tickerAge(NOW - 60, NOW)).to.equal('1m ago');
    expect(tickerAge(NOW - 3599, NOW)).to.equal('59m ago');
    expect(tickerAge(NOW - 3600, NOW)).to.equal('1h ago');
    expect(tickerAge(NOW - 86_399, NOW)).to.equal('23h ago');
    expect(tickerAge(NOW - 3 * 86_400, NOW)).to.equal('3d ago');
  });

  it('odstep rosnie dwukrotnie i staje na suficie', () => {
    expect([0, 1, 2, 3, 4].map((n) => retryDelayMs(n))).to.deep.equal([2_000, 4_000, 8_000, 16_000, 32_000]);
    expect(retryDelayMs(5)).to.equal(60_000);
    expect(retryDelayMs(500)).to.equal(60_000);
    expect(retryDelayMs(-3)).to.equal(2_000);
    expect(retryDelayMs(Number.NaN)).to.equal(2_000);
  });
});

describe('Pasek Startpada: stany', () => {
  const base = {
    recentCount: 0,
    synced: false,
    syncFailing: false,
    watchFailing: false,
    loadingExpired: false,
    last: null,
  };

  it('ladowanie tylko przed pierwsza odpowiedzia, bez bledu i przed limitem', () => {
    expect(tickerStatus(base)).to.deep.equal({ kind: 'loading' });
  });

  it('"Watching..." nie jest juz stanem na zawsze: po limicie albo bledzie jest "niedostepne"', () => {
    expect(tickerStatus({ ...base, loadingExpired: true })).to.deep.equal({ kind: 'unavailable' });
    expect(tickerStatus({ ...base, syncFailing: true })).to.deep.equal({ kind: 'unavailable' });
  });

  it('sa transakcje z doby - pasek jedzie, nawet gdy zrodla chwilowo padly (kazdy wiersz ma wiek)', () => {
    expect(tickerStatus({ ...base, recentCount: 3 })).to.deep.equal({ kind: 'live' });
    expect(tickerStatus({ ...base, recentCount: 1, syncFailing: true, watchFailing: true })).to.deep.equal({ kind: 'live' });
  });

  it('pusta doba potwierdzona przez serwer: cisza z ostatnia transakcja', () => {
    const last = item({ id: 'old', ts: NOW - 3 * 86_400 });
    expect(tickerStatus({ ...base, synced: true, last })).to.deep.equal({ kind: 'quiet', last });
    expect(tickerStatus({ ...base, synced: true })).to.deep.equal({ kind: 'quiet', last: null });
  });

  it('po synchronizacji padl serwer, ale subskrypcja zyje - "brak transakcji" nadal jest prawda', () => {
    expect(tickerStatus({ ...base, synced: true, syncFailing: true }).kind).to.equal('quiet');
  });

  it('padl naraz serwer i subskrypcja - nie wiemy, wiec "niedostepne"', () => {
    expect(tickerStatus({ ...base, synced: true, syncFailing: true, watchFailing: true })).to.deep.equal({
      kind: 'unavailable',
    });
  });
});
