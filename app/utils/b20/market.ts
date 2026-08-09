import {
  decodeAbiParameters,
  decodeFunctionResult,
  encodeFunctionData,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';

/**
 * RYNEK B20 - jedyne miejsce, ktore czyta lancuch, zeby zlozyc liste tokenow.
 *
 * ===========================================================================
 * DLACZEGO TA LISTA W OGOLE ISTNIEJE I DLACZEGO NIE JEST PUSTA
 * ===========================================================================
 * Fabryka B20 (precompile 0xB20f...0000) emituje zdarzenie przy kazdym nowym
 * tokenie. Zmierzone na mainnecie 2026-08-08: 504 tokeny w ciagu doby, czyli
 * okolo jednego na trzy minuty. Lista nie czeka na nasz launchpad i nie jest
 * pusta ani jednego dnia.
 *
 * KSZTALT ZDARZENIA ODCZYTANY Z LANCUCHA, NIE PRZEPISANY Z INTERFEJSU. Podpis
 * z base-std NIE zgadza sie z realnym topic0 - realne zdarzenie ma DWA pola
 * indeksowane (token i wariant), a ostatni `bytes` jest pusty dla assetow.
 * Kazda rekonstrukcja z interfejsu minelaby sie z topic0 i dala pusta liste,
 * ktora wygladalaby jak prawda.
 *
 * ===========================================================================
 * TRZY STANY, NIGDY JEDEN - TO JEST NAJWAZNIEJSZA RZECZ W TYM PLIKU
 * ===========================================================================
 * Zmierzone na dobie: 504 tokeny, 416 z pula, 22 kiedykolwiek handlowane.
 * Czyli pula jest prawie zawsze, a RYNEK prawie nigdy. Gdybysmy mieli jeden
 * stan "cena", 96% listy dostaloby "$0.00" - liczbe, ktorej nikt nie zmierzyl.
 *
 *   traded    pula jest, sqrtPriceX96 ROZNI SIE od tego z Initialize
 *             => ktos zrobil swap. Cena jest rynkowa.
 *   listed    pula jest, sqrtPriceX96 IDENTYCZNY co do 160 bitow
 *             => nikt nigdy nie handlowal. Cena jest OFERTOWA, nie rynkowa.
 *   unlisted  puli nie widzimy => nie ma zadnej ceny. Nie zero. Zadnej.
 *
 * Rozroznienie traded/listed jest DARMOWE i wlasne: cena w Uniswap v4 zmienia
 * sie wylacznie przez swap, wiec porownanie biezacego sqrtPriceX96 z tym ze
 * zdarzenia Initialize jest twardym dowodem. Zadnego indeksera, zadnej opinii.
 *
 * ===========================================================================
 * KOSZT JEDNEGO PELNEGO ODCZYTU - ZMIERZONY, NIE OSZACOWANY
 * ===========================================================================
 *   1  eth_blockNumber
 *   5  getLogs B20Created      (43 200 blokow / limit 10 000 na zapytanie)
 *   5  getLogs Launched        (tworca - patrz nizej)
 *   5  getLogs Initialize      (pule, zawezone do currency0 in {ETH, WETH})
 *   2  eth_call multicall3     (~420 pul po 300 na wywolanie)
 *   1  eth_call multicall3     (podaz tokenow, ktore handluja)
 *  ---
 *  19 zapytan, zmierzone 1,8-2,5 s. Przy odswiezaniu co 60 s daje to okolo
 *  27 000 zapytan na dobe w najgorszym razie - publiczne RPC Base przyjmuje to
 *  z zapasem. PRZEGLADARKA NIE DOTYKA RPC ANI RAZU.
 *
 * ===========================================================================
 * CZEGO TU NIE MA I DLACZEGO
 * ===========================================================================
 * WLASNEGO WOLUMENU. Base robi ~108 000 zdarzen Swap na dobe, a publiczne RPC
 * przerywa odpowiedz powyzej ~5 MB. Wolumen jest CYTATEM z GeckoTerminal i jest
 * tak podpisany. Gdy GT nie odpowie, pole jest PUSTE, nigdy zerowe.
 *
 * LICZBY POSIADACZY. Wymaga przeskanowania wszystkich Transfer kazdego tokena.
 * Poza budzetem calkowicie.
 *
 * PLYNNOSCI Z LANCUCHA. StateView.getLiquidity zwraca plynnosc w BIEZACYM
 * ticku i dla 46/60 swiezych pul pokazuje 0 mimo zasianej pozycji. Liczba,
 * ktora klamie w dol, jest gorsza niz jej brak.
 */

/* -------------------------------------------------------------------------- */
/*  ADRESY I TEMATY - kazdy potwierdzony odczytem z mainnetu                   */
/* -------------------------------------------------------------------------- */

/** Precompile fabryki B20. Ten sam adres na kazdej sieci Base. */
const FACTORY: Address = '0xB20f000000000000000000000000000000000000';

/**
 * topic0 zdarzenia tworzenia. ODCZYTANY Z LANCUCHA.
 * B20Created(address indexed token, uint8 indexed variant, string, string, uint8, bytes)
 */
const TOPIC_B20_CREATED: Hex =
  '0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d';

/**
 * Dominujacy launcher B20 na Base. Emituje w tej samej transakcji zdarzenie,
 * ktore niesie TWORCE - a zdarzenie fabryki go nie niesie.
 *
 * Dlaczego tworcy nie da sie wziac z tx.from: 51/60 transakcji idzie przez ten
 * kontrakt, a 5/60 przez EntryPoint ERC-4337, gdzie tx.from to bundler, czyli
 * automat, a nie czlowiek. Zgadywanie dalo by nam kolumne, ktora czasem klamie.
 */
const LAUNCHER: Address = '0xa52ad458ce0282a971ecc71c051a32f28946bb9f';

/** Launched(address indexed token, bytes32 indexed poolId, address indexed creator, ...) */
const TOPIC_LAUNCHED: Hex =
  '0x207384e895174175cc774fe7f7457b37c382f27ebf53d37d5257b862f80eaf9c';

/** Uniswap v4 PoolManager na Base. */
const POOL_MANAGER: Address = '0x498581fF718922c3f8e6A244956aF099B2652b2b';

/** Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, ...) */
const TOPIC_INITIALIZE: Hex =
  '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';

/** StateView v4 - jedyny sposob odczytania slot0 puli bez transient storage. */
const STATE_VIEW: Address = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';

const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

const WETH: Address = '0x4200000000000000000000000000000000000006';
const NATIVE: Address = '0x0000000000000000000000000000000000000000';

const SEL_GET_SLOT0 = '0xc815641c'; // getSlot0(bytes32)
const SEL_TOTAL_SUPPLY = '0x18160ddd'; // totalSupply()
const SEL_SUPPLY_CAP = '0x8f770ad0'; // supplyCap()

/* -------------------------------------------------------------------------- */
/*  OKNO I LIMITY                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Blok na Base trwa 2,000 s, wiec doba to dokladnie 43 200 blokow.
 *
 * DLACZEGO DOBA, A NIE TRZY DNI: kohorta trzydniowa ma ZEROWY wolumen 24 h
 * w calosci (zmierzone). Starsze tokeny nie dodalyby ani jednego wiersza do
 * zakladki, ktora ma znaczenie, a kosztowalyby trzy razy tyle zapytan. "Ostatnie
 * 24 godziny" to tez zdanie, ktore czlowiek rozumie bez tlumaczenia.
 */
const WINDOW_BLOCKS = 43_200n;

/** Twardy limit publicznego RPC Base: -32614 powyzej 10 000 blokow. */
const MAX_LOG_RANGE = 10_000n;

/** Ile odczytow miesci sie w jednym multicall3 bez przekroczenia limitu odpowiedzi. */
const MULTICALL_CHUNK = 300;

/** Twardy limit GeckoTerminal: HTTP 400 powyzej 30 adresow. */
const GT_MAX_ADDRESSES = 30;

const RPCS = [
  process.env.BASE_RPC_URL,
  process.env.CDP_RPC_URL,
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
].filter(Boolean) as string[];

/* -------------------------------------------------------------------------- */
/*  TYPY                                                                       */
/* -------------------------------------------------------------------------- */

export type MarketState = 'traded' | 'listed' | 'unlisted';

export type B20Pool = {
  id: Hex;
  /** Czym wyceniona jest druga strona puli. Obie sa ETH, jedna opakowana. */
  quote: 'ETH' | 'WETH';
  /** ETH za jeden token, policzone z sqrtPriceX96. */
  priceEth: number;
  /** ETH za jeden token w chwili otwarcia puli - z Initialize. */
  launchPriceEth: number;
  /** Ulamek, nie procent. 0.12 znaczy +12% wzgledem ceny otwarcia. */
  moveSinceLaunch: number;
};

export type B20Token = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  variant: 'asset' | 'stablecoin';
  /** Sekundy unix. Za darmo z pola blockTimestamp w logu - zero dodatkowych zapytan. */
  createdAt: number;
  createdBlock: number;
  createdTx: Hex;
  /** null znaczy NIE WIEMY, a nie "nikt". Zdarzenie fabryki tworcy nie niesie. */
  creator: Address | null;
  state: MarketState;
  pool: B20Pool | null;
  /**
   * Cytat z GeckoTerminal. `null` na polu znaczy "GT tego nie podal" - nie zero.
   * Cale pole `null` znaczy, ze o ten token w ogole nie pytalismy.
   */
  quoted: { volume24hUsd: number | null; priceUsd: number | null } | null;
  /** Sufit podazy kontra podaz. `cap === null` znaczy, ze supplyCap() zrewertowal. */
  supply: { total: string; cap: string | null } | null;
};

export type BoardSnapshot = {
  ok: true;
  /** Kiedy odczyt sie skonczyl (ms). Sluzy do napisu "read 40 seconds ago". */
  readAt: number;
  headBlock: number;
  fromBlock: number;
  windowHours: number;
  tokens: B20Token[];
  counts: { total: number; traded: number; listed: number; unlisted: number };
  /** Kurs ETH/USD, jedyna rzecz, ktora bierzemy od osob trzecich do przeliczen. */
  ethUsd: number | null;
  /**
   * Co sie NIE udalo w tym przebiegu. Trafia na ekran jako zdanie, zeby czlowiek
   * wiedzial, ktora kolumna jest niepelna - zamiast czytac pustke jako zero.
   */
  notes: string[];
};

export type BoardFailure = {
  ok: false;
  reason: 'rpc-unreachable' | 'rpc-error';
  message: string;
  readAt: number;
};

export type BoardResult = (BoardSnapshot & { stale: boolean }) | BoardFailure;

/* -------------------------------------------------------------------------- */
/*  SUROWY KLIENT JSON-RPC                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Wlasny klient zamiast viem `createPublicClient`.
 *
 * Powod jest jeden i konkretny: viem nie odda pola `blockTimestamp` z logu,
 * bo nie ma go w typie `Log`. Base RPC to pole ZWRACA, i dzieki temu czas
 * utworzenia kazdego z 504 tokenow jest darmowy. Przez viem kosztowalby
 * kilkaset wywolan eth_getBlockByNumber, czyli wiecej niz cala reszta odczytu.
 */
type RpcLog = {
  address: string;
  blockNumber: string;
  blockTimestamp?: string;
  data: string;
  topics: string[];
  transactionHash: string;
};

let rpcIndex = 0;

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  let lastError = '';
  // Kazdy RPC dostaje szanse. Jeden padniety endpoint nie ma prawa zamienic sie
  // w falszywe "nie ma tokenow".
  for (let attempt = 0; attempt < RPCS.length; attempt += 1) {
    const url = RPCS[(rpcIndex + attempt) % RPCS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        lastError = `${url} -> HTTP ${res.status}`;
        continue;
      }
      const json = (await res.json()) as { result?: T; error?: { message?: string } };
      if (json.error) {
        lastError = `${url} -> ${json.error.message ?? 'rpc error'}`;
        continue;
      }
      // Ten endpoint dziala - zacznij od niego nastepnym razem.
      rpcIndex = (rpcIndex + attempt) % RPCS.length;
      return json.result as T;
    } catch (err) {
      lastError = `${url} -> ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  throw new Error(lastError || 'no rpc endpoint answered');
}

const hexBlock = (n: bigint) => `0x${n.toString(16)}`;
const topicAddress = (a: string) => `0x${a.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
const addressFromTopic = (t: string) => `0x${t.slice(26).toLowerCase()}` as Address;

/**
 * getLogs po calym oknie, w kawalkach po 10 000 blokow.
 *
 * Kawalki lecą po piec naraz, a nie wszystkie: przy okolo trzydziestu szybkich
 * zapytaniach pod rzad publiczne RPC Base odpowiada -32016 over rate limit.
 * Piatka zmierzona jako bezpieczna.
 */
async function scanLogs(
  address: Address,
  topics: (string | string[] | null)[],
  fromBlock: bigint,
  toBlock: bigint
): Promise<RpcLog[]> {
  const ranges: [bigint, bigint][] = [];
  for (let b = fromBlock; b <= toBlock; b += MAX_LOG_RANGE) {
    const end = b + MAX_LOG_RANGE - 1n > toBlock ? toBlock : b + MAX_LOG_RANGE - 1n;
    ranges.push([b, end]);
  }
  const out: RpcLog[] = [];
  for (let i = 0; i < ranges.length; i += 5) {
    const batch = ranges.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(([f, t]) =>
        rpcCall<RpcLog[]>('eth_getLogs', [
          { address, topics, fromBlock: hexBlock(f), toBlock: hexBlock(t) },
        ])
      )
    );
    for (const r of results) out.push(...r);
  }
  return out;
}

const MULTICALL_ABI = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const;

async function multicall(
  calls: { target: Address; callData: Hex }[]
): Promise<{ success: boolean; returnData: Hex }[]> {
  const out: { success: boolean; returnData: Hex }[] = [];
  for (let i = 0; i < calls.length; i += MULTICALL_CHUNK) {
    const chunk = calls.slice(i, i + MULTICALL_CHUNK);
    const data = encodeFunctionData({
      abi: MULTICALL_ABI,
      functionName: 'aggregate3',
      args: [chunk.map((c) => ({ target: c.target, allowFailure: true, callData: c.callData }))],
    });
    const raw = await rpcCall<Hex>('eth_call', [{ to: MULTICALL3, data }, 'latest']);
    const decoded = decodeFunctionResult({
      abi: MULTICALL_ABI,
      functionName: 'aggregate3',
      data: raw,
    });
    for (const r of decoded) out.push({ success: r.success, returnData: r.returnData });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  CENA Z sqrtPriceX96                                                        */
/* -------------------------------------------------------------------------- */

const Q96_SQUARED = 2 ** 192;

/**
 * ETH za jeden token, z surowego sqrtPriceX96.
 *
 * W Uniswap v4 sqrtPriceX96 koduje cene currency1 wyrazona w currency0, obie
 * w jednostkach surowych. Adres B20 zaczyna sie od 0xb2, a ETH to 0x00 i WETH
 * to 0x42 - wiec token jest ZAWSZE currency1 i nigdy nie trzeba zgadywac
 * kolejnosci.
 *
 *   rawPrice        = (sqrt / 2^96)^2      surowych tokenow za jedno wei
 *   ethPerToken     = 10^(dec-18) / rawPrice
 *
 * Sprawdzone przeciwko GeckoTerminal na realnym tokenie: 2,2373e-9 ETH przy
 * kursie 1918,95 USD daje 4,293e-6 USD, a GT podaje 4,293499e-6. Zgadza sie
 * do czterech cyfr znaczacych, wiec wzor jest poprawny, a nie tylko wiarygodny.
 *
 * `Number()` na 160-bitowej liczbie gubi kilka ostatnich bitow, ale bledu
 * wzglednego rzedu 1e-16 nie widac w cenie pisanej z czterema cyframi. Do
 * ROZROZNIENIA traded/listed uzywamy bigintow, bo tam licza sie wszystkie bity.
 */
function priceEthFromSqrt(sqrtPriceX96: bigint, decimals: number): number {
  const s = Number(sqrtPriceX96);
  const rawPrice = (s * s) / Q96_SQUARED;
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return 0;
  return 10 ** (decimals - 18) / rawPrice;
}

/* -------------------------------------------------------------------------- */
/*  CYTAT Z GECKOTERMINAL                                                      */
/* -------------------------------------------------------------------------- */

type GtQuote = { volume24hUsd: number | null; priceUsd: number | null };

async function fetchEthUsd(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/base/tokens/${WETH}`,
      {
        headers: { accept: 'application/json;version=20230302' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { attributes?: { price_usd?: string } } };
    const p = Number(json?.data?.attributes?.price_usd);
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

/**
 * Wolumen 24 h dla tokenow, ktore REALNIE handluja.
 *
 * Kandydatow wybieramy sami z lancucha (ruszony sqrtPriceX96), wiec nie marnujemy
 * limitu GT na kilkaset martwych tokenow i nie jestesmy zalezni od tego, czy GT
 * zdazyl cokolwiek zaindeksowac. Zmierzone: GT nie zna swiezego tokena przez
 * pierwsze minuty, ale kazdy z 12 handlowanych w probce znal - bo indeksery
 * reaguja na SWAP, nie na powstanie tokena.
 */
async function fetchQuotes(addresses: Address[]): Promise<Map<string, GtQuote>> {
  const map = new Map<string, GtQuote>();
  for (let i = 0; i < addresses.length; i += GT_MAX_ADDRESSES) {
    const chunk = addresses.slice(i, i + GT_MAX_ADDRESSES);
    try {
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/base/tokens/multi/${chunk.join(',')}`,
        {
          headers: { accept: 'application/json;version=20230302' },
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000),
        }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: {
          attributes?: {
            address?: string;
            price_usd?: string | null;
            volume_usd?: { h24?: string | null };
          };
        }[];
      };
      for (const d of json.data ?? []) {
        const a = d.attributes;
        if (!a?.address) continue;
        const vol = Number(a.volume_usd?.h24);
        const price = Number(a.price_usd);
        map.set(a.address.toLowerCase(), {
          // NaN znaczy "GT nie podal" i musi zostac nullem az do ekranu.
          // Zamiana na zero byla by wymysleniem pomiaru, ktorego nikt nie zrobil.
          volume24hUsd: Number.isFinite(vol) ? vol : null,
          priceUsd: Number.isFinite(price) && price > 0 ? price : null,
        });
      }
    } catch {
      // Cisza jest tu poprawna: brak wpisu w mapie zamieni sie na ekranie
      // w "not quoted", a nie w zero.
    }
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/*  PELNY ODCZYT                                                               */
/* -------------------------------------------------------------------------- */

async function buildSnapshot(): Promise<BoardSnapshot> {
  const notes: string[] = [];

  const headHex = await rpcCall<string>('eth_blockNumber', []);
  const head = BigInt(headHex);
  const from = head > WINDOW_BLOCKS ? head - WINDOW_BLOCKS : 0n;

  const [createdLogs, launchedLogs, initLogs] = await Promise.all([
    scanLogs(FACTORY, [TOPIC_B20_CREATED], from, head),
    scanLogs(LAUNCHER, [TOPIC_LAUNCHED], from, head),
    // Zawezenie do currency0 in {ETH, WETH} scina strumien z ~1955 na dobe do
    // ~550 i nie gubi ani jednej puli B20: adres 0xb2... zawsze sortuje sie
    // wyzej niz 0x00 i 0x42, wiec token jest currency1, a druga strona to ETH.
    scanLogs(
      POOL_MANAGER,
      [TOPIC_INITIALIZE, null, [topicAddress(NATIVE), topicAddress(WETH)]],
      from,
      head
    ),
  ]);

  /* --- tworca: z Launched, bo zdarzenie fabryki go nie niesie --- */
  const creatorByToken = new Map<string, Address>();
  for (const log of launchedLogs) {
    if (log.topics.length < 4) continue;
    creatorByToken.set(addressFromTopic(log.topics[1]), addressFromTopic(log.topics[3]));
  }

  /* --- pule: pierwszy Initialize wygrywa --- */
  // Token moze miec kilka pul. Bierzemy NAJWCZESNIEJSZA, bo to jej cena otwarcia
  // jest cena startowa tokena; pozniejsza pula ma wlasna, juz rynkowa.
  const poolByToken = new Map<string, { id: Hex; initSqrt: bigint; quote: 'ETH' | 'WETH'; block: bigint }>();
  for (const log of initLogs) {
    if (log.topics.length < 4) continue;
    const token = addressFromTopic(log.topics[3]);
    const currency0 = addressFromTopic(log.topics[2]);
    const words = log.data.slice(2).match(/.{64}/g);
    if (!words || words.length < 2) continue;
    // data: fee, tickSpacing, hooks, sqrtPriceX96, tick - sqrt jest przedostatnie
    const initSqrt = BigInt(`0x${words[words.length - 2]}`);
    const block = BigInt(log.blockNumber);
    const existing = poolByToken.get(token);
    if (existing && existing.block <= block) continue;
    poolByToken.set(token, {
      id: log.topics[1] as Hex,
      initSqrt,
      quote: currency0 === NATIVE ? 'ETH' : 'WETH',
      block,
    });
  }

  /* --- metadane prosto ze zdarzenia: name, symbol, decimals za darmo --- */
  type Draft = {
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
    variant: 'asset' | 'stablecoin';
    createdAt: number;
    createdBlock: number;
    createdTx: Hex;
  };
  const drafts: Draft[] = [];
  const seen = new Set<string>();
  for (const log of createdLogs) {
    if (log.topics.length < 3) continue;
    const address = addressFromTopic(log.topics[1]);
    if (seen.has(address)) continue;
    seen.add(address);
    let name = '';
    let symbol = '';
    let decimals = 18;
    try {
      const [n, s, d] = decodeAbiParameters(
        parseAbiParameters('string, string, uint8, bytes'),
        log.data as Hex
      );
      name = n;
      symbol = s;
      decimals = Number(d);
    } catch {
      // Zdarzenie o nieoczekiwanym ksztalcie. Token ISTNIEJE, wiec zostaje na
      // liscie - tylko bez nazwy. Wyrzucenie go byloby ukryciem czegos realnego.
      name = '';
      symbol = '';
    }
    drafts.push({
      address,
      name,
      symbol,
      decimals,
      variant: BigInt(log.topics[2]) === 1n ? 'stablecoin' : 'asset',
      createdAt: log.blockTimestamp ? Number(BigInt(log.blockTimestamp)) : 0,
      createdBlock: Number(BigInt(log.blockNumber)),
      createdTx: log.transactionHash as Hex,
    });
  }
  if (drafts.some((d) => d.createdAt === 0)) {
    notes.push('Some creation times are missing because the node did not return log timestamps.');
  }

  /* --- slot0: biezaca cena, a przez porownanie takze fakt handlu --- */
  const withPool = drafts.filter((d) => poolByToken.has(d.address));
  let slot0Failed = false;
  const nowSqrt = new Map<string, bigint>();
  if (withPool.length > 0) {
    try {
      const results = await multicall(
        withPool.map((d) => ({
          target: STATE_VIEW,
          callData: `${SEL_GET_SLOT0}${poolByToken.get(d.address)!.id.slice(2)}` as Hex,
        }))
      );
      results.forEach((r, i) => {
        if (r.success && r.returnData.length >= 66) {
          nowSqrt.set(withPool[i].address, BigInt(r.returnData.slice(0, 66)));
        }
      });
    } catch {
      slot0Failed = true;
      notes.push(
        'We could not read the pool prices this time, so every token here is shown without one.'
      );
    }
  }

  /* --- zlozenie: trzy stany --- */
  const tokens: B20Token[] = drafts.map((d) => {
    const pool = poolByToken.get(d.address);
    const current = nowSqrt.get(d.address);
    let state: MarketState = 'unlisted';
    let poolOut: B20Pool | null = null;

    if (pool && current !== undefined && current > 0n) {
      // Porownanie na PELNYCH 160 bitach. Cena w v4 rusza sie wylacznie przez
      // swap, wiec rownosc co do bitu jest dowodem, ze nikt nie handlowal.
      const traded = current !== pool.initSqrt;
      state = traded ? 'traded' : 'listed';
      const priceEth = priceEthFromSqrt(current, d.decimals);
      const launchPriceEth = priceEthFromSqrt(pool.initSqrt, d.decimals);
      poolOut = {
        id: pool.id,
        quote: pool.quote,
        priceEth,
        launchPriceEth,
        moveSinceLaunch: launchPriceEth > 0 ? priceEth / launchPriceEth - 1 : 0,
      };
    } else if (pool && slot0Failed) {
      // Pula ISTNIEJE, ale odczyt padl. To nie jest "brak rynku" i nie wolno
      // tego tak nazwac - stan zostaje 'listed', a cena jest nullem.
      state = 'listed';
    }

    return {
      address: d.address,
      name: d.name,
      symbol: d.symbol,
      decimals: d.decimals,
      variant: d.variant,
      createdAt: d.createdAt,
      createdBlock: d.createdBlock,
      createdTx: d.createdTx,
      creator: creatorByToken.get(d.address) ?? null,
      state,
      pool: poolOut,
      quoted: null,
      supply: null,
    };
  });

  /* --- podaz i wolumen tylko dla tych, ktore handluja --- */
  const traded = tokens.filter((t) => t.state === 'traded');
  if (traded.length > 0) {
    try {
      const calls = traded.flatMap((t) => [
        { target: t.address, callData: SEL_TOTAL_SUPPLY as Hex },
        { target: t.address, callData: SEL_SUPPLY_CAP as Hex },
      ]);
      const res = await multicall(calls);
      traded.forEach((t, i) => {
        const total = res[i * 2];
        const cap = res[i * 2 + 1];
        if (total?.success && total.returnData.length >= 66) {
          t.supply = {
            total: BigInt(total.returnData.slice(0, 66)).toString(),
            // supplyCap() rewertuje na czesci tokenow. Rewert to BRAK ODPOWIEDZI,
            // a nie sufit rowny zeru - dlatego null, nie '0'.
            cap:
              cap?.success && cap.returnData.length >= 66
                ? BigInt(cap.returnData.slice(0, 66)).toString()
                : null,
          };
        }
      });
    } catch {
      notes.push('Supply figures could not be read this time.');
    }
  }

  const [ethUsd, quotes] = await Promise.all([
    fetchEthUsd(),
    traded.length > 0 ? fetchQuotes(traded.map((t) => t.address)) : Promise.resolve(new Map()),
  ]);
  for (const t of traded) {
    t.quoted = quotes.get(t.address) ?? { volume24hUsd: null, priceUsd: null };
  }
  if (ethUsd === null) {
    notes.push(
      'GeckoTerminal did not answer, so prices are in ETH only and 24h volume is not quoted.'
    );
  }

  // Najnowsze na gorze. Sortowaniem na ekranie steruje zakladka, ale kolejnosc
  // bazowa musi byc deterministyczna, zeby dwa odczyty tej samej chwili dawaly
  // ten sam ekran.
  tokens.sort((a, b) => b.createdBlock - a.createdBlock || a.address.localeCompare(b.address));

  return {
    ok: true,
    readAt: Date.now(),
    headBlock: Number(head),
    fromBlock: Number(from),
    windowHours: Number(WINDOW_BLOCKS) / 1800,
    tokens,
    counts: {
      total: tokens.length,
      traded: tokens.filter((t) => t.state === 'traded').length,
      listed: tokens.filter((t) => t.state === 'listed').length,
      unlisted: tokens.filter((t) => t.state === 'unlisted').length,
    },
    ethUsd,
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/*  CACHE - JEDEN ODCZYT NA MINUTE NA INSTANCJE, NIE JEDEN NA ODSLONE          */
/* -------------------------------------------------------------------------- */

/** Ile snapshot jest uznawany za swiezy. */
export const BOARD_TTL_MS = 60_000;

/**
 * Po ilu minutach przestajemy podawac stara migawke bez ostrzezenia.
 * Powyzej tego ekran pisze "stale", ale DALEJ pokazuje dane - awaria nie ma
 * prawa zamienic listy w pustke.
 */
export const BOARD_STALE_MS = 5 * 60_000;

let cached: BoardSnapshot | null = null;
let inflight: Promise<BoardSnapshot> | null = null;
let lastFailure: string | null = null;

function refresh(): Promise<BoardSnapshot> {
  if (inflight) return inflight;
  inflight = buildSnapshot()
    .then((snap) => {
      cached = snap;
      lastFailure = null;
      return snap;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Migawka rynku.
 *
 * Zasada: JESLI MAMY COKOLWIEK DOBREGO, ODDAJEMY TO NATYCHMIAST i odswiezamy
 * w tle. Czlowiek nigdy nie czeka na siec, jesli nie musi, a gdy odczyt padnie,
 * na ekranie zostaje ostatnia dobra lista z podpisem, ile ma lat - nigdy zera
 * i nigdy spinner udajacy pustke.
 */
export async function getBoard(): Promise<BoardResult> {
  const now = Date.now();

  if (cached && now - cached.readAt < BOARD_TTL_MS) {
    return { ...cached, stale: false };
  }

  if (cached) {
    // Stara migawka jest lepsza niz czekanie. Odswiezenie leci w tle; jesli
    // padnie, nie ma to wplywu na to, co czlowiek wlasnie widzi.
    void refresh().catch((err: unknown) => {
      lastFailure = err instanceof Error ? err.message : String(err);
    });
    return { ...cached, stale: true };
  }

  try {
    const snap = await refresh();
    return { ...snap, stale: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastFailure = message;
    return {
      ok: false,
      reason: 'rpc-unreachable',
      message,
      readAt: Date.now(),
    };
  }
}

/** Ostatni blad odczytu - do diagnostyki na ekranie, nie do zwyklego uzytku. */
export function lastBoardFailure(): string | null {
  return lastFailure;
}

/**
 * Jeden token po adresie.
 *
 * Idzie przez te sama migawke co lista, wiec strona tokena z okna 24 h nie
 * kosztuje ANI JEDNEGO dodatkowego zapytania. Dla starszego tokena zwraca null,
 * a strona mowi to wprost zamiast udawac, ze token nie istnieje.
 */
export async function getToken(address: string): Promise<
  | { found: true; token: B20Token; snapshot: BoardSnapshot; stale: boolean }
  | { found: false; reason: 'outside-window' | 'unreadable'; message?: string }
> {
  const board = await getBoard();
  if (!board.ok) return { found: false, reason: 'unreadable', message: board.message };
  const wanted = address.toLowerCase();
  const token = board.tokens.find((t) => t.address === wanted);
  if (!token) return { found: false, reason: 'outside-window' };
  const { stale, ...snapshot } = board;
  return { found: true, token, snapshot, stale };
}
