import type { Address } from 'viem';
import { arcMainnet, arcTestnet } from '../startpad/arcChain';
import deployedTestnet from '../../deployments/derivativeMarket.5042002.json';
import deployedMainnet from '../../deployments/derivativeMarket.5042.json';

/**
 * KONFIGURACJA MODULU DERYWATOW.
 *
 * ===========================================================================
 * DWIE SKALE USDC I ANI JEDNEGO MIEJSCA, W KTORYM SIE MYLA
 * ===========================================================================
 * Na Arc jednostka NATYWNA (gaz, `msg.value`) to USDC z 18 miejscami, a token
 * ERC-20 USDC pod `0x3600...0000` ma 6. Kolateral tego modulu to WYLACZNIE ten
 * drugi. Stad w calym froncie obowiazuja dokladnie dwie funkcje przeliczajace
 * (`usdc`/`fromUsdc` w `format.ts`) i ani jedno `parseEther` na kwocie
 * depozytu. Ceny, notional i PnL przychodza z kontraktow w WAD (18 miejsc) -
 * te formatujemy `formatEther`, i to jest jedyne ich zastosowanie tutaj.
 *
 * Adresy: domyslnie z `deployments/derivativeMarket.<chainId>.json` (pisze je
 * skrypt wdrozeniowy), NEXT_PUBLIC_* nadpisuje. Dopoki sa zerowe, tablica
 * pokazuje jawny komunikat zamiast udawac pusty rynek.
 *
 * ===========================================================================
 * KTORY ARC
 * ===========================================================================
 * NEXT_PUBLIC_DERIV_CHAIN_ID=5042 przelacza modul na Arc MAINNET; wszystko
 * inne (w tym brak zmiennej) to testnet 5042002. Jeden lancuch na build -
 * rynki, adaptery Pytha i keeper sa per lancuch, a mieszanie ich w jednym
 * widoku to prosta droga do pokazania ceny z testnetu przy pozycji z mainnetu.
 */

export const DERIV_CHAIN = (process.env.NEXT_PUBLIC_DERIV_CHAIN_ID || '').trim() === '5042' ? arcMainnet : arcTestnet;
export const DERIV_IS_MAINNET = DERIV_CHAIN.id === arcMainnet.id;

type DeploymentFile = { oracle?: string; factory?: string; usdc?: string; deployBlock?: number };
const deployment: DeploymentFile = (DERIV_IS_MAINNET ? deployedMainnet : deployedTestnet) as DeploymentFile;
const ZERO = '0x0000000000000000000000000000000000000000';

/**
 * STATYCZNE odwolania do process.env.NEXT_PUBLIC_* - to jedyna forma, ktora
 * webpack/Next.js potrafi podmienic na etapie builda. Wersja przez
 * `process.env[name]` z dynamiczna nazwa NIGDY nie dziala w przegladarce
 * (tam `process.env` po prostu nie istnieje), wiec zawsze spadala na adres
 * zerowy bez wzgledu na to, co ustawiono w Vercelu czy `.env.local`.
 */
export const ORACLE_ADDRESS = ((process.env.NEXT_PUBLIC_DERIV_ORACLE || '').trim() || deployment.oracle || ZERO) as Address;
export const FACTORY_ADDRESS = ((process.env.NEXT_PUBLIC_DERIV_FACTORY || '').trim() || deployment.factory || ZERO) as Address;
export const USDC_ADDRESS = ((process.env.NEXT_PUBLIC_DERIV_USDC || '').trim() ||
  deployment.usdc ||
  '0x3600000000000000000000000000000000000000') as Address;
/** Blok wdrozenia fabryki - od niego skanuje sie zdarzenia; 0 = nie wdrozono. */
export const DERIV_DEPLOY_BLOCK = BigInt(deployment.deployBlock ?? 0);

export const DEPLOYED = FACTORY_ADDRESS !== ZERO;

/** Kolateral ma SZESC miejsc. Nie osiemnascie. */
export const USDC_DECIMALS = 6;

/**
 * REZERWA NA GAZ, w USDC (6 miejsc). Na Arc gaz i kolateral to JEDNO saldo
 * (docs "EVM differences": natywne USDC i ERC-20 pod 0x3600... to ten sam
 * pieniadz w dwoch skalach). Przycisk "Max", ktory wpisuje cale saldo jako
 * depozyt, zostawia zero na `approve` i `openPosition` i obie transakcje
 * padaja na "insufficient funds". Docs "stable fee": ~0,001 USD za transfer,
 * sufit 20 000 Gwei. 0,05 USDC pokrywa kilkadziesiat transakcji z zapasem
 * i jest nie do zauwazenia przy depozycie.
 */
export const GAS_RESERVE_USDC = 50_000n;

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

export const oracleAbi = [
  { type: 'function', name: 'marketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MIN_BOND_AMOUNT', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'CHALLENGE_BOND', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'getMarket',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'publisher', type: 'address' },
      { name: 'symbol', type: 'string' },
      { name: 'price', type: 'uint256' },
      { name: 'updatedAt', type: 'uint64' },
      { name: 'bond', type: 'uint256' },
      { name: 'slashed', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'marketStats',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'bond', type: 'uint256' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'updateCount', type: 'uint32' },
      { name: 'challengesOpened', type: 'uint32' },
      { name: 'frozen', type: 'bool' },
      { name: 'slashed', type: 'bool' },
    ],
  },
  /* --------------------------------------------------------------------- */
  /*  BARIERKI REJESTRU - to sa liczby, ktore odpowiadaja na pytanie          */
  /*  "co powstrzymuje wydawce ceny przed wpisaniem czegokolwiek".            */
  /*  Bez nich przewodnik musial opisywac te zabezpieczenia JAKOSCIOWO        */
  /*  ("odrzuca zbyt duzy skok"), a jakosciowy opis zabezpieczenia jest       */
  /*  wart tyle, co jego brak.                                               */
  /* --------------------------------------------------------------------- */
  /** Najwiekszy dopuszczalny skok ceny miedzy zgloszeniami, w bps. */
  { type: 'function', name: 'MAX_DEVIATION_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  /** Najkrotszy odstep miedzy zgloszeniami - zapora przed zalewaniem cenami. */
  { type: 'function', name: 'MIN_UPDATE_INTERVAL', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  /** Po tylu sekundach cena jest przeterminowana i rynek przestaje byc aktywny. */
  { type: 'function', name: 'MAX_PRICE_AGE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  /** Ile czasu ma spor od otwarcia do rozstrzygniecia. */
  { type: 'function', name: 'CHALLENGE_WINDOW', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  /** Z ilu obserwacji liczy sie TWAP. */
  { type: 'function', name: 'TWAP_CARDINALITY', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  /** Otwarty spor: kto, za ile, od kiedy i o ktora cene. */
  {
    type: 'function',
    name: 'getChallenge',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'challenger', type: 'address' },
      { name: 'bond', type: 'uint256' },
      { name: 'openedAt', type: 'uint64' },
      { name: 'disputedPrice', type: 'uint256' },
      { name: 'open', type: 'bool' },
    ],
  },
  /** Cena RAZEM ze znacznikiem czasu - swiezosc feedu jest tu informacja o ryzyku. */
  {
    type: 'function',
    name: 'getPrice',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'price', type: 'uint256' },
      { name: 'updatedAt', type: 'uint64' },
    ],
  },
  { type: 'function', name: 'getTwap', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isActive', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'registerMarket',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'string' }, { type: 'uint256' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'topUpBond', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
  {
    type: 'function',
    name: 'submitPrice',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint64' }],
    outputs: [],
  },
  { type: 'function', name: 'challengePrice', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  {
    type: 'event',
    name: 'PriceSubmitted',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ],
  },
] as const;

export const factoryAbi = [
  { type: 'function', name: 'marketCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'marketOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'allMarkets', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'INSURANCE', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'FEES', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'MIN_VIRTUAL_LIQUIDITY', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  /**
   * `isMarket` STOI TUTAJ, A NIE W ABI FUNDUSZU.
   *
   * `InsuranceFund` deklaruje ten podpis tylko po to, zeby ZAWOLAC go na
   * fabryce (`MARKETS.isMarket`) - sam go nie wystawia, wiec odczyt pod adresem
   * funduszu rewertuje. Trzymanie go po stronie funduszu bylo pulapka gotowa
   * wystrzelic przy pierwszym uzyciu.
   */
  { type: 'function', name: 'isMarket', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'createMarket',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
    outputs: [{ type: 'address' }],
  },
] as const;

export const marketAbi = [
  { type: 'function', name: 'ORACLE_MARKET_ID', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'CREATOR', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  /** Adres feedu Chainlink, gdy rynek go ma; adres zerowy znaczy "tylko rejestr". */
  { type: 'function', name: 'CHAINLINK_FEED', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'markPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'indexPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'openInterestNotional', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  /* ---------------------------------------------------------------------- */
  /*  RESZTA POWIERZCHNI RYNKU - dolozona 10 wrzesnia 2026.                   */
  /*                                                                          */
  /*  Front czytal 23 rzeczy, a kontrakt wystawia komplet, ktorego trader     */
  /*  potrzebuje, zeby w ogole wiedziec, na co sie pisze: stawke oplaty,      */
  /*  zegar fundingu, glebokosc vAMM (czyli realny poslizg przed klikiem),    */
  /*  przechyl long/short i to, dlaczego cap OI jest taki, a nie inny.        */
  /*  Kazda z tych liczb jest w kontrakcie od poczatku - brakowalo tylko      */
  /*  drogi do ekranu.                                                        */
  /* ---------------------------------------------------------------------- */
  /** Oplata wejscia i wyjscia, w bps. 30 = 0,30% od notional. */
  { type: 'function', name: 'TRADE_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  /** Kara likwidacyjna w bps - to ona zjada depozyt przy likwidacji. */
  { type: 'function', name: 'LIQUIDATION_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  /** Co ile sekund rozlicza sie funding. Bez tego nie da sie pokazac zegara. */
  { type: 'function', name: 'FUNDING_INTERVAL', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  /** Sufit premii mark/index w bps - ogranicza stawke fundingu. */
  { type: 'function', name: 'MAX_PREMIUM_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  /** Kiedy ostatnio rozliczono funding. Zegar liczy sie z tego plus interwal. */
  { type: 'function', name: 'lastFundingAt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint64' }] },
  /**
   * REZERWY vAMM. Z nich - i tylko z nich - liczy sie POSLIZG przed
   * podpisaniem transakcji. Bez nich interfejs moze pokazac cene mark i udawac,
   * ze wejscie odbedzie sie po niej, co przy plytkim rynku jest nieprawda.
   */
  { type: 'function', name: 'quoteReserve', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'baseReserve', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  /** Ile funding wisi na koncie TERAZ, ze znakiem. Do karty pozycji. */
  { type: 'function', name: 'pendingFunding', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'int256' }] },
  /** Pokryty zly dlug - uczciwosc wymaga, zeby to bylo widoczne. */
  { type: 'function', name: 'coveredBadDebtUsdc', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  /** Mnozniki i progi dojrzewania rynku: skad bierze sie cap OI. */
  { type: 'function', name: 'OI_MULTIPLIER_PROBATION', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'OI_MULTIPLIER_MATURE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'PROBATION_AGE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  { type: 'function', name: 'PROBATION_UPDATES', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  { type: 'function', name: 'CREATOR_OI_CAP_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  /** Zdarzenie rozliczenia fundingu - z niego rysuje sie historia stawki. */
  {
    type: 'event',
    name: 'FundingSettled',
    inputs: [
      { name: 'premium', type: 'int256', indexed: false },
      { name: 'fundingPerUnit', type: 'int256', indexed: false },
      { name: 'cumFunding', type: 'int256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BadDebt',
    inputs: [
      { name: 'trader', type: 'address', indexed: true },
      { name: 'shortfallWad', type: 'uint256', indexed: false },
      { name: 'coveredUsdc', type: 'uint256', indexed: false },
    ],
  },
  { type: 'function', name: 'maxOpenInterest', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'creatorOiCap', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'isMature', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'netSize', stateMutability: 'view', inputs: [], outputs: [{ type: 'int256' }] },
  { type: 'function', name: 'cumFunding', stateMutability: 'view', inputs: [], outputs: [{ type: 'int256' }] },
  { type: 'function', name: 'MAX_LEVERAGE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'MIN_MARGIN_USDC', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MAINTENANCE_MARGIN_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  {
    type: 'function',
    name: 'getPosition',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [
      { name: 'size', type: 'int256' },
      { name: 'margin', type: 'uint256' },
      { name: 'openNotional', type: 'uint256' },
      { name: 'entryPrice', type: 'uint256' },
      { name: 'funding', type: 'int256' },
    ],
  },
  { type: 'function', name: 'unrealizedPnl', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'int256' }] },
  { type: 'function', name: 'marginRatioBps', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'int256' }] },
  { type: 'function', name: 'liquidationPrice', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'openPosition',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'bool' }, { type: 'uint256' }, { type: 'uint8' }],
    outputs: [{ type: 'uint256' }, { type: 'uint256' }],
  },
  { type: 'function', name: 'closePosition', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'liquidate', stateMutability: 'nonpayable', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'settleFunding', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'event',
    name: 'PositionOpened',
    inputs: [
      { name: 'trader', type: 'address', indexed: true },
      { name: 'isLong', type: 'bool', indexed: false },
      { name: 'marginUsdc', type: 'uint256', indexed: false },
      { name: 'notional', type: 'uint256', indexed: false },
      { name: 'size', type: 'uint256', indexed: false },
      { name: 'entryPrice', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PositionClosed',
    inputs: [
      { name: 'trader', type: 'address', indexed: true },
      { name: 'exitNotional', type: 'uint256', indexed: false },
      { name: 'pnl', type: 'int256', indexed: false },
      { name: 'funding', type: 'int256', indexed: false },
      { name: 'payoutUsdc', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Liquidated',
    inputs: [
      { name: 'trader', type: 'address', indexed: true },
      { name: 'keeper', type: 'address', indexed: true },
      { name: 'keeperRewardUsdc', type: 'uint256', indexed: false },
      { name: 'payoutUsdc', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const insuranceAbi = [
  { type: 'function', name: 'balance', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalOi', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'requiredBalance', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'newPositionsPaused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'minRatioBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  /**
   * OTWARTY INTERES TEGO KONKRETNEGO RYNKU. Fundusz trzyma i sume, i rozbicie
   * na rynki - bez tego strona rynku umiala pokazac tylko `totalOi` calego
   * modulu, czyli liczbe, ktora o ogladanym rynku nie mowi nic.
   */
  { type: 'function', name: 'oiByMarket', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'event',
    name: 'ShortfallCovered',
    inputs: [
      { name: 'market', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'balance', type: 'uint256', indexed: false },
    ],
  },
  { type: 'function', name: 'notifyDeposit', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
] as const;

export const feesAbi = [
  /**
   * PODZIAL OPLATY. Bez tych trzech stalych interfejs umial powiedziec tylko,
   * ze udzial tworcy "splywa z opoznieniem", nie podajac ANI JEDNEGO procentu -
   * czyli akurat w miejscu, gdzie mowa o cudzych pieniadzach, byl najbardziej
   * mglisty. 6500/1500 i reszta do skarbca, odblokowanie po LOCK_DAYS.
   */
  { type: 'function', name: 'CREATOR_SHARE_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
  { type: 'function', name: 'INSURANCE_SHARE_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  { type: 'function', name: 'LOCK_DAYS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint32' }] },
  { type: 'function', name: 'TREASURY', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'INSURANCE', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  { type: 'function', name: 'claimableNow', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'lockedTotal', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

export type MarketRow = {
  id: number;
  address: Address;
  symbol: string;
  creator: Address;
  markPrice: bigint;
  indexPrice: bigint;
  openInterest: bigint;
  maxOpenInterest: bigint;
  bond: bigint;
  createdAt: number;
  updateCount: number;
  challengesOpened: number;
  frozen: boolean;
  slashed: boolean;
  mature: boolean;
};
