export {};

const { expect } = require('chai');
const {
  mergeTrades,
  applyTransferLogs,
  serializeTrades,
  parseTrades,
  serializeBalances,
  parseBalances,
  chunk,
  scanBackward,
} = require('../app/startpad/[address]/historyScan');

/**
 * Cache historii tokena startpada.
 *
 * Do 2026-08-13 kazde wejscie na strone tokena odtwarzalo cala historie z
 * lancucha: dziesiatki sekwencyjnych `getLogs` z PRZEGLADARKI, oknami po 1900
 * blokow wstecz az do bloku startu. Na tokenie z ruchem (Sausages) to sie
 * zacinalo, a im starszy token, tym dluzej.
 *
 * Naprawa opiera sie na tym pliku: czysta logika, ktora potrafi ZLOZYC stan z
 * kawalkow i DOLOZYC tylko nowe bloki. Testy pilnuja dokladnie tych wlasnosci,
 * na ktorych stoi poprawnosc cache'u - scalanie bez duplikatow, zapis i odczyt
 * bez utraty bigintow, oraz to, ze skan konczy sie na zdarzeniu Launched.
 */

const HASH = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

const trade = (over: Record<string, unknown> = {}) => ({
  id: `${HASH(1)}-0`,
  kind: 'buy',
  account: '0x1111111111111111111111111111111111111111',
  eth: 1_000_000_000_000_000n,
  tokens: 2_000_000_000_000_000_000n,
  priceWei: 750_000_000n,
  ethReserveAfter: 5_000_000_000_000_000n,
  block: 100n,
  logIndex: 0,
  ts: 1_700_000_000,
  txHash: HASH(1),
  ...over,
});

describe('mergeTrades', () => {
  it('nie duplikuje transakcji, ktora juz jest w cache', () => {
    const cached = [trade()];
    const fresh = [trade(), trade({ id: `${HASH(2)}-0`, block: 101n, txHash: HASH(2) })];

    const merged = mergeTrades(cached, fresh);

    expect(merged).to.have.length(2);
    expect(merged.map((entry: any) => entry.id)).to.deep.equal([`${HASH(1)}-0`, `${HASH(2)}-0`]);
  });

  it('uklada rosnaco po bloku, a w bloku po logIndex', () => {
    const a = trade({ id: 'a', block: 200n, logIndex: 1 });
    const b = trade({ id: 'b', block: 200n, logIndex: 0 });
    const c = trade({ id: 'c', block: 100n, logIndex: 9 });

    const merged = mergeTrades([a], [b, c]);

    expect(merged.map((entry: any) => entry.id)).to.deep.equal(['c', 'b', 'a']);
  });

  it('nowszy wpis nadpisuje starszy o tym samym id', () => {
    const stale = trade({ ts: 1 });
    const fixed = trade({ ts: 1_700_000_500 });

    const merged = mergeTrades([stale], [fixed]);

    expect(merged).to.have.length(1);
    expect(merged[0].ts).to.equal(1_700_000_500);
  });
});

describe('applyTransferLogs', () => {
  const A = '0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA';
  const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const ZERO = '0x0000000000000000000000000000000000000000';

  it('dolicza przyrost do salda, ktore juz bylo w mapie', () => {
    const balances = new Map([[A.toLowerCase(), 5n]]);

    applyTransferLogs(balances, [{ args: { from: B, to: A, value: 3n } }]);

    expect(balances.get(A.toLowerCase())).to.equal(8n);
    expect(balances.get(B.toLowerCase())).to.equal(-3n);
  });

  it('trzyma adresy malymi literami, zeby ten sam holder nie mial dwoch wierszy', () => {
    const balances = new Map();

    applyTransferLogs(balances, [{ args: { from: ZERO, to: A, value: 7n } }]);

    expect([...balances.keys()]).to.deep.equal([A.toLowerCase()]);
  });

  it('pomija adres zerowy - mint nie jest holderem', () => {
    const balances = new Map();

    applyTransferLogs(balances, [{ args: { from: ZERO, to: A, value: 7n } }]);

    expect(balances.has(ZERO)).to.equal(false);
  });

  it('pomija log bez wartosci zamiast psuc salda', () => {
    const balances = new Map();

    applyTransferLogs(balances, [{ args: { from: A, to: B } }]);

    expect(balances.size).to.equal(0);
  });
});

describe('serializeTrades / parseTrades', () => {
  it('oddaje te sama transakcje po zapisie i odczycie', () => {
    const original = trade({ kind: 'sell', logIndex: 4, txHash: HASH(7), id: `${HASH(7)}-4` });

    const [restored] = parseTrades(serializeTrades([original]));

    expect(restored).to.deep.equal(original);
  });

  it('zapisuje wiersz jako string - Firestore nie przyjmuje tablicy w tablicy', () => {
    const rows = serializeTrades([trade()]);

    expect(rows).to.have.length(1);
    expect(rows[0]).to.be.a('string');
  });

  it('odtwarza transakcje bez hasza, nie gubiac jej', () => {
    const original = trade({ txHash: null, id: 'log-0' });

    const [restored] = parseTrades(serializeTrades([original]));

    expect(restored.txHash).to.equal(null);
    expect(restored.id).to.equal('log-0');
  });

  it('pomija uszkodzony wiersz zamiast wywracac odczyt calego kawalka', () => {
    const rows = [...serializeTrades([trade()]), 'smiec'];

    expect(parseTrades(rows)).to.have.length(1);
  });
});

describe('serializeBalances / parseBalances', () => {
  it('oddaje te sama mape po zapisie i odczycie', () => {
    const balances = new Map([
      ['0x1111111111111111111111111111111111111111', 10n ** 24n],
      ['0x2222222222222222222222222222222222222222', 1n],
    ]);

    expect(parseBalances(serializeBalances(balances))).to.deep.equal(balances);
  });

  it('nie zapisuje zerowych sald - to jest wiekszosc mapy po sprzedazach', () => {
    const balances = new Map([
      ['0x1111111111111111111111111111111111111111', 0n],
      ['0x2222222222222222222222222222222222222222', 5n],
    ]);

    expect(serializeBalances(balances)).to.have.length(1);
  });
});

describe('chunk', () => {
  it('tnie na kawalki o zadanym rozmiarze, ostatni krotszy', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).to.deep.equal([[1, 2], [3, 4], [5]]);
  });

  it('z pustej listy robi jeden pusty kawalek, zeby zapis wyczyscil stary stan', () => {
    expect(chunk([], 2)).to.deep.equal([[]]);
  });
});

describe('uklad dokumentow cache', () => {
  const {
    historyDocId,
    partId,
    buildParts,
    composeParts,
    changedChunks,
    stalePartIds,
  } = require('../app/api/launchpad/historyLayout');

  const TOKEN = '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd';

  describe('historyDocId', () => {
    it('nie zalezy od wielkosci liter w adresie - inaczej token ma dwa dokumenty', () => {
      expect(historyDocId(8453, TOKEN)).to.equal(historyDocId(8453, TOKEN.toLowerCase()));
    });

    it('rozdziela sieci - ten sam adres na dwoch lancuchach to dwie historie', () => {
      expect(historyDocId(8453, TOKEN)).to.not.equal(historyDocId(84532, TOKEN));
    });
  });

  describe('partId', () => {
    it('numeruje z zerami, zeby kawalki sortowaly sie po nazwie', () => {
      expect(partId('t', 0)).to.equal('t0000');
      expect(partId('t', 12)).to.equal('t0012');
    });
  });

  describe('buildParts / composeParts', () => {
    it('oddaje te sama historie po pocieciu i zlozeniu', () => {
      const trades = [
        trade({ id: `${HASH(1)}-0`, block: 1n, txHash: HASH(1) }),
        trade({ id: `${HASH(2)}-0`, block: 2n, txHash: HASH(2) }),
        trade({ id: `${HASH(3)}-0`, block: 3n, txHash: HASH(3) }),
      ];
      const balances = new Map([['0x1111111111111111111111111111111111111111', 9n]]);

      const parts = buildParts(trades, balances, { tradeChunkSize: 2, balanceChunkSize: 2 });
      const composed = composeParts(parts.parts);

      expect(composed.trades).to.deep.equal(trades);
      expect(composed.balances).to.deep.equal(balances);
    });

    it('tnie transakcje na kawalki zadanego rozmiaru', () => {
      const trades = [1, 2, 3].map((n) => trade({ id: `${HASH(n)}-0`, block: BigInt(n), txHash: HASH(n) }));

      const parts = buildParts(trades, new Map(), { tradeChunkSize: 2, balanceChunkSize: 2 });

      expect(parts.tradeChunks).to.equal(2);
      expect(parts.parts.map((part: any) => part.id)).to.include('t0000');
      expect(parts.parts.map((part: any) => part.id)).to.include('t0001');
    });
  });

  describe('changedChunks', () => {
    it('pelnego kawalka nie przepisuje po raz drugi', () => {
      expect(changedChunks(1_000, 1_001, 1_000)).to.deep.equal({ first: 1, last: 1 });
    });

    it('dopisanie do niepelnego kawalka przepisuje go razem z nastepnym', () => {
      expect(changedChunks(999, 1_002, 1_000)).to.deep.equal({ first: 0, last: 1 });
    });

    it('bez nowych transakcji nie ma czego zapisywac', () => {
      expect(changedChunks(5, 5, 1_000)).to.equal(null);
    });

    it('pierwszy zapis zaczyna od zerowego kawalka', () => {
      expect(changedChunks(0, 5, 1_000)).to.deep.equal({ first: 0, last: 0 });
    });
  });

  describe('stalePartIds', () => {
    it('wskazuje kawalki do skasowania, gdy historia sie skrocila', () => {
      expect(stalePartIds('t', 3, 1)).to.deep.equal(['t0001', 't0002']);
    });

    it('nic nie kasuje, gdy historia urosla', () => {
      expect(stalePartIds('t', 1, 3)).to.deep.equal([]);
    });
  });
});

describe('pageSlice', () => {
  const { pageSlice } = require('../app/startpad/[address]/detailShared');
  const items = [1, 2, 3, 4, 5, 6, 7];

  it('oddaje zadana strone i laczna liczbe stron', () => {
    expect(pageSlice(items, 1, 3)).to.deep.equal({ rows: [4, 5, 6], page: 1, pages: 3 });
  });

  it('ostatnia strona bywa krotsza', () => {
    expect(pageSlice(items, 2, 3)).to.deep.equal({ rows: [7], page: 2, pages: 3 });
  });

  it('strona poza zakresem wraca do ostatniej istniejacej - lista mogla sie skrocic', () => {
    expect(pageSlice(items, 9, 3)).to.deep.equal({ rows: [7], page: 2, pages: 3 });
  });

  it('pusta lista to jedna pusta strona, nie zero stron', () => {
    expect(pageSlice([], 0, 3)).to.deep.equal({ rows: [], page: 0, pages: 1 });
  });
});

describe('rpcCandidates', () => {
  const { rpcCandidates } = require('../app/api/launchpad/historyRpc');

  const CDP = 'https://api.developer.coinbase.com/rpc/v1/base/klucz';

  it('wlasny RPC idzie pierwszy, publiczny zostaje jako zapasowy', () => {
    expect(rpcCandidates(8453, { BASE_RPC_URL: CDP })).to.deep.equal([CDP, undefined]);
  });

  it('bez wlasnego RPC zostaje sam publiczny', () => {
    expect(rpcCandidates(8453, {})).to.deep.equal([undefined]);
  });

  it('Sepolia ma wlasna zmienna - klucz Base mainnet tam nie zadziala', () => {
    const sep = 'https://sepolia.example/klucz';
    expect(rpcCandidates(84532, { BASE_RPC_URL: CDP, BASE_SEPOLIA_RPC_URL: sep })).to.deep.equal([sep, undefined]);
  });

  it('siec bez wlasnej zmiennej nie dostaje cudzego endpointu', () => {
    expect(rpcCandidates(4663, { BASE_RPC_URL: CDP })).to.deep.equal([undefined]);
  });

  it('pusta zmienna jest traktowana jak brak, a nie jak adres', () => {
    expect(rpcCandidates(8453, { BASE_RPC_URL: '   ' })).to.deep.equal([undefined]);
  });
});

describe('capRows', () => {
  const { capRows } = require('../app/startpad/snapshot');

  it('krotka historia miesci sie w calosci', () => {
    expect(capRows(['a', 'b'], 5)).to.deep.equal({ rows: ['a', 'b'], full: true });
  });

  it('z dluzszej zostawia NAJNOWSZE wpisy - wykres rysuje sie od konca', () => {
    expect(capRows(['a', 'b', 'c'], 2)).to.deep.equal({ rows: ['b', 'c'], full: false });
  });
});

describe('planScan', () => {
  const { planScan } = require('../app/api/launchpad/historyLayout');

  const base = { head: 1_000n, launchFloor: 100n };

  it('bez cache skanuje od glowy az do bloku startu tokena', () => {
    expect(planScan(null, base)).to.deep.equal([{ head: 1_000n, floor: 100n }]);
  });

  it('z pelnym cache dociaga TYLKO bloki nad ostatnim zapisanym', () => {
    const meta = { highBlock: 900n, lowBlock: 100n, complete: true };

    expect(planScan(meta, base)).to.deep.equal([{ head: 1_000n, floor: 901n }]);
  });

  it('nie rusza lancucha, gdy cache stoi na aktualnej glowie', () => {
    const meta = { highBlock: 1_000n, lowBlock: 100n, complete: true };

    expect(planScan(meta, base)).to.deep.equal([]);
  });

  it('po ucietym skanie dociaga i gore, i brakujacy ogon', () => {
    const meta = { highBlock: 900n, lowBlock: 500n, complete: false };

    expect(planScan(meta, base)).to.deep.equal([
      { head: 1_000n, floor: 901n },
      { head: 499n, floor: 100n },
    ]);
  });

  it('tnie dluga zaleglosc do zadanej rozpietosci, a przedzial dalej przylega do cache', () => {
    const meta = { highBlock: 900n, lowBlock: 100n, complete: true };

    expect(planScan(meta, { ...base, maxSpan: 50n })).to.deep.equal([{ head: 950n, floor: 901n }]);
  });

  it('tnie ogon do zadanej rozpietosci, wiec kolejne wejscie schodzi glebiej', () => {
    const meta = { highBlock: 1_000n, lowBlock: 500n, complete: false };

    expect(planScan(meta, { ...base, maxSpan: 50n })).to.deep.equal([{ head: 499n, floor: 450n }]);
  });

  it('uciety cache na aktualnej glowie ma do zrobienia sam ogon', () => {
    const meta = { highBlock: 1_000n, lowBlock: 500n, complete: false };

    expect(planScan(meta, base)).to.deep.equal([{ head: 499n, floor: 100n }]);
  });
});

describe('scanBackward', () => {
  const LAUNCHPAD = '0x9999999999999999999999999999999999999999';
  const TOKEN = '0x4444444444444444444444444444444444444444';
  const OTHER = '0x5555555555555555555555555555555555555555';

  const boughtLog = (block: bigint, index: number, token = TOKEN) => ({
    eventName: 'Bought',
    address: LAUNCHPAD,
    blockNumber: block,
    logIndex: index,
    transactionHash: HASH(Number(block)),
    args: {
      token,
      buyer: '0x1111111111111111111111111111111111111111',
      ethNet: 1_000n,
      tokensOut: 2_000n,
      ethReserveAfter: 3_000n,
      tokenReserveAfter: 4_000n,
    },
  });

  /** Klient, ktory oddaje logi z zadanych blokow i liczy swoje wywolania. */
  const fakeClient = (byBlock: Record<string, any[]>) => {
    let calls = 0;
    return {
      calls: () => calls,
      getLogs: async ({ address, fromBlock, toBlock }: any) => {
        calls += 1;
        const out: any[] = [];
        for (const [block, logs] of Object.entries(byBlock)) {
          const num = BigInt(block);
          if (num < fromBlock || num > toBlock) continue;
          for (const log of logs) {
            if (log.address.toLowerCase() === String(address).toLowerCase()) out.push(log);
          }
        }
        return out;
      },
    };
  };

  const opts = (over: Record<string, unknown> = {}) => ({
    launchpad: LAUNCHPAD,
    token: TOKEN,
    head: 1_000n,
    floor: 0n,
    window: 100n,
    maxWindows: 20,
    estTs: (block: bigint) => Number(block),
    ...over,
  });

  it('zbiera transakcje tokena z kilku okien', async () => {
    const client = fakeClient({ '950': [boughtLog(950n, 0)], '10': [boughtLog(10n, 0)] });

    const result = await scanBackward(client, opts());

    expect(result.trades.map((entry: any) => entry.block)).to.deep.equal([10n, 950n]);
  });

  it('odrzuca logi innego tokena z tego samego launchpada', async () => {
    const client = fakeClient({ '950': [boughtLog(950n, 0, OTHER)] });

    const result = await scanBackward(client, opts());

    expect(result.trades).to.have.length(0);
  });

  it('przestaje schodzic wstecz, gdy zobaczy Launched', async () => {
    const client = fakeClient({
      '950': [{ eventName: 'Launched', address: LAUNCHPAD, blockNumber: 950n, logIndex: 0, transactionHash: HASH(950), args: { token: TOKEN } }],
      '10': [boughtLog(10n, 0)],
    });

    const result = await scanBackward(client, opts());

    expect(result.launchBlock).to.equal(950n);
    expect(result.trades).to.have.length(0);
    expect(result.complete).to.equal(true);
  });

  it('melduje uciecie, gdy skonczyly sie okna przed dnem', async () => {
    const client = fakeClient({});

    const result = await scanBackward(client, opts({ maxWindows: 2 }));

    expect(result.complete).to.equal(false);
    expect(result.scannedFrom).to.equal(801n);
  });

  it('skanuje tylko zadany przedzial, gdy dno rowna sie glowie', async () => {
    const client = fakeClient({ '1000': [boughtLog(1_000n, 0)] });

    const result = await scanBackward(client, opts({ floor: 1_000n }));

    expect(result.trades).to.have.length(1);
    expect(client.calls()).to.equal(2);
  });

  it('limit RPC w kolejnym oknie konczy skan, ale nie kasuje tego, co juz zebrano', async () => {
    let calls = 0;
    const client = {
      getLogs: async ({ address, fromBlock, toBlock }: any) => {
        calls += 1;
        // Pierwsze okno (dwa zapytania) przechodzi, dalej publiczny RPC odmawia.
        if (calls > 2) throw new Error('over rate limit');
        return String(address).toLowerCase() === LAUNCHPAD.toLowerCase() && fromBlock <= 950n && toBlock >= 950n
          ? [boughtLog(950n, 0)]
          : [];
      },
    };

    const result = await scanBackward(client, opts());

    expect(result.trades).to.have.length(1);
    expect(result.complete).to.equal(false);
    expect(result.scannedFrom).to.equal(901n);
  });

  it('jednorazowa odmowa RPC jest ponawiana, a skan idzie dalej', async () => {
    let calls = 0;
    const client = {
      getLogs: async () => {
        calls += 1;
        if (calls <= 2) throw new Error('over rate limit');
        return [];
      },
    };

    const result = await scanBackward(client, opts({ maxWindows: 2, retryDelayMs: 0 }));

    expect(result.scannedFrom).to.equal(801n);
  });

  it('gdy padnie JUZ PIERWSZE okno, nie melduje pokrycia zadnego bloku', async () => {
    const client = { getLogs: async () => { throw new Error('over rate limit'); } };

    const result = await scanBackward(client, opts());

    // Blok 1000 nie zostal przeczytany, wiec nie wolno go zapisac jako
    // zeskanowany - inaczej transakcja z tego bloku przepadlaby na zawsze.
    expect(result.scannedFrom).to.equal(1_001n);
    expect(result.complete).to.equal(false);
  });

  it('z zadana rownoleglascia zbiera to samo, co okno po oknie', async () => {
    const byBlock = { '950': [boughtLog(950n, 0)], '620': [boughtLog(620n, 0)], '10': [boughtLog(10n, 0)] };

    const kolejno = await scanBackward(fakeClient(byBlock), opts());
    const rownolegle = await scanBackward(fakeClient(byBlock), opts({ concurrency: 4 }));

    expect(rownolegle.trades.map((t: any) => t.block)).to.deep.equal(kolejno.trades.map((t: any) => t.block));
    expect(rownolegle.complete).to.equal(kolejno.complete);
    expect(rownolegle.scannedFrom).to.equal(kolejno.scannedFrom);
  });

  it('naprawde puszcza okna rownolegle, a nie tylko udaje', async () => {
    let inFlight = 0, peak = 0;
    const client = {
      getLogs: async () => {
        inFlight += 1; peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return [];
      },
    };

    await scanBackward(client, opts({ concurrency: 4 }));

    // Cztery okna po dwa zapytania - szczyt ma siegnac osmiu jednoczesnych.
    expect(peak).to.be.greaterThan(2);
  });

  it('sklada salda z Transferow tego tokena', async () => {
    const transfer = {
      address: TOKEN,
      blockNumber: 900n,
      logIndex: 0,
      transactionHash: HASH(900),
      args: {
        from: '0x0000000000000000000000000000000000000000',
        to: '0x1111111111111111111111111111111111111111',
        value: 42n,
      },
    };
    const client = fakeClient({ '900': [transfer] });

    const result = await scanBackward(client, opts());

    expect(result.balances.get('0x1111111111111111111111111111111111111111')).to.equal(42n);
  });
});
