import type { Address } from 'viem';
import adaptersTestnet from '../../deployments/pythAdapters.5042002.json';
import adaptersMainnet from '../../deployments/pythAdapters.5042.json';
import { DERIV_IS_MAINNET } from './config';

/**
 * ZEWNETRZNE FEEDY INDEKSU - adaptery Pytha wdrozone na Arc testnet.
 *
 * ===========================================================================
 * SKAD TA LISTA
 * ===========================================================================
 * Z `deployments/pythAdapters.5042002.json`, ktory pisze
 * `scripts/derivatives/deploy-pyth-adapter.ts`. Kazdy wpis to
 * PythAggregatorAdapter (contracts/derivatives) udajacy feed Chainlinka, wiec
 * `DerivativeMarket` czyta go bez zmian w kodzie. Adres feedu jest w rynku
 * IMMUTABLE - wybiera sie go raz, przy `createMarket`.
 *
 * ===========================================================================
 * CO ZNACZY ZERO Z ADAPTERA
 * ===========================================================================
 * Pyth to oracle PULL. Cena na lancuchu jest tak swieza, jak ostatni, kto ja
 * wypchnal. Adapter po `maxAge` (3600 s) oddaje 0, a rynek wtedy spada na
 * TWAP wlasnego rejestru - czyli na cene publikowana przez tworce rynku.
 * Stan z 11.09.2026: kontrakt Pytha na Arc (0x2880...) nie przeszedl
 * upgrade'u z 26.08 i odrzuca nowe podpisy Hermesa; BTC/USD ktos tam jeszcze
 * odswieza, wiec adapter BTC czyta z niego. Reszta (ETH, TSLA, XAU, EUR)
 * czyta z NASZEGO PythReceiver (contracts/derivatives/PythReceiver.sol),
 * ktory weryfikuje te same podpisy Hermesa i do ktorego keeper wypycha
 * ceny co 15 min. AAPL, NVDA i SPY nie sa objete kluczem API wlasciciela
 * (Hermes: "not entitled") - dlatego ich tu nie ma. UI i tak MUSI pokazac
 * wiek ceny, a nie tylko nazwe feedu: rynek "na TSLA" ze stęchlym feedem to
 * rynek na cenie tworcy z etykieta TSLA.
 */
export type IndexFeed = {
  /** "AAPL/USD" - tak, jak nazywa go Pyth. */
  symbol: string;
  /** "AAPL" - do nazw rynkow i etykiet. */
  base: string;
  address: Address;
  priceId: `0x${string}`;
  maxAge: number;
  /** Kontrakt, z ktorego adapter czyta: nasz PythReceiver albo (BTC) kontrakt Pytha. */
  pyth: Address;
};

type AdapterFile = {
  chainId: number;
  pyth: string;
  adapters: Record<string, { address: string; priceId: string; maxAge: number; pyth?: string }>;
};

// Ten sam lancuch, co reszta modulu (config.ts). Na mainnecie plik jest
// placeholderem z pusta lista, dopoki wlasciciel nie wdrozy odbiornika i
// adapterow - wtedy UI po prostu nie oferuje parowania z indeksem.
const file = (DERIV_IS_MAINNET ? adaptersMainnet : adaptersTestnet) as AdapterFile;

export const PYTH_ADDRESS = file.pyth as Address;

export const INDEX_FEEDS: IndexFeed[] = Object.entries(file.adapters).map(([symbol, entry]) => ({
  symbol,
  base: symbol.split('/')[0],
  address: entry.address as Address,
  priceId: entry.priceId as `0x${string}`,
  maxAge: entry.maxAge,
  pyth: (entry.pyth ?? file.pyth) as Address,
}));

export const ZERO_FEED = '0x0000000000000000000000000000000000000000' as Address;

export function feedByAddress(address: string | null | undefined): IndexFeed | null {
  if (!address) return null;
  const needle = address.toLowerCase();
  return INDEX_FEEDS.find((f) => f.address.toLowerCase() === needle) ?? null;
}

/** ABI adaptera potrzebne UI: cena i czas publikacji w jednym odczycie. */
export const adapterAbi = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  { type: 'function', name: 'description', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;

/**
 * Wiek ceny prosto z Pytha, bez progu adaptera - zeby powiedziec "15 dni",
 * a nie tylko "stale". Ta sama struktura co `IPythMinimal.Price`.
 */
export const pythAbi = [
  {
    type: 'function',
    name: 'getPriceUnsafe',
    stateMutability: 'view',
    inputs: [{ type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'price', type: 'int64' },
          { name: 'conf', type: 'uint64' },
          { name: 'expo', type: 'int32' },
          { name: 'publishTime', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

/**
 * Zdarzenie, ktore emituje KAZDE wypchniecie ceny - ten sam podpis w naszym
 * PythReceiver i w kontrakcie Pytha (IPythEvents), wiec jeden ABI starcza
 * dla BTC (kontrakt Pytha) i reszty (nasz odbiornik). Wykres rynku z
 * zewnetrznym feedem czyta historie wlasnie stad, bo rejestr
 * PriceOracleRegistry nie dostaje dla takich rynkow zadnych `PriceSubmitted`.
 */
export const pythEventsAbi = [
  {
    type: 'event',
    name: 'PriceFeedUpdate',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'publishTime', type: 'uint64', indexed: false },
      { name: 'price', type: 'int64', indexed: false },
      { name: 'conf', type: 'uint64', indexed: false },
    ],
  },
] as const;

/**
 * Ta sama arytmetyka co `PythAggregatorAdapter._toWad`: Pyth podaje
 * `price * 10^expo`, adapter oddaje 18 miejsc. Poza zakresem adaptera
 * (shift < -18 lub > 36) zwracamy `null` - adapter w tym miejscu rewertuje,
 * wiec i my nie mamy prawa pokazac zadnej liczby.
 */
export function pythToWad(price: bigint, expo: number): bigint | null {
  const shift = 18 + expo;
  if (shift < -18 || shift > 36) return null;
  if (shift >= 0) return price * 10n ** BigInt(shift);
  return price / 10n ** BigInt(-shift);
}

/** Symbol rynku dla tokena sparowanego z indeksem, w limicie 24 znakow rejestru. */
export function pairedMarketSymbol(base: string, tokenSymbol: string): string {
  const clean = tokenSymbol.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${base}/USD · ${clean}`.slice(0, 24);
}

