import type { Address } from 'viem';

/**
 * `null` znaczy NIE UDALO SIE ODCZYTAC, i nigdy nie znaczy zera. Kazde pole
 * ponizej przechodzi przez ten typ, zeby nieudany `eth_call` nie wyladowal
 * na ekranie jako "$0.00" - to jest dokladnie ten blad, ktory tydzien temu
 * wycinalismy z reszty aplikacji.
 */
export type R<T> = T | null;

export type Snapshot = {
  id: bigint;
  symbol: string;
  creator: R<Address>;
  insurance: R<Address>;
  mark: R<bigint>;
  index: R<bigint>;
  quoteReserve: R<bigint>;
  baseReserve: R<bigint>;
  netSize: R<bigint>;
  oi: R<bigint>;
  cap: R<bigint>;
  creatorCap: R<bigint>;
  mature: R<boolean>;
  tradeFeeBps: R<number>;
  liqFeeBps: R<number>;
  fundingInterval: R<number>;
  maxPremiumBps: R<number>;
  lastFundingAt: R<number>;
  cumFunding: R<bigint>;
  maxLeverage: R<number>;
  minMargin: R<bigint>;
  maintenanceBps: R<number>;
  coveredBadDebt: R<bigint>;
  oiMultProbation: R<number>;
  oiMultMature: R<number>;
  probationAge: R<number>;
  probationUpdates: R<number>;
  creatorCapBps: R<number>;
  bond: R<bigint>;
  createdAt: R<number>;
  updateCount: R<number>;
  challenges: R<number>;
  frozen: R<boolean>;
  slashed: R<boolean>;
  feedActive: R<boolean>;
  oraclePrice: R<bigint>;
  oracleUpdatedAt: R<number>;
  twap: R<bigint>;
  paused: R<boolean>;
  insBalance: R<bigint>;
  insRequired: R<bigint>;
  insMinRatioBps: R<number>;
  insTotalOi: R<bigint>;
  /** `oiByMarket(market)` - ile z sumy powyzej stoi za TYM rynkiem. */
  insOiHere: R<bigint>;
  registered: R<boolean>;
  usdcBalance: R<bigint>;
  /* Podzial oplaty - z FeeDistributora, po adresie wzietym z fabryki. */
  feesAddress: R<Address>;
  creatorShareBps: R<number>;
  insuranceShareBps: R<number>;
  feeLockDays: R<number>;
  treasury: R<Address>;
  /**
   * `CHAINLINK_FEED` rynku: adres adaptera Pytha albo zero, gdy indeks idzie z
   * rejestru. `null` = nie udalo sie odczytac, wiec NIE wiemy, skad brac historie.
   */
  indexFeed: R<Address>;
};

export type Position = {
  size: bigint;
  margin: bigint;
  openNotional: bigint;
  entryPrice: bigint;
  funding: bigint;
  pnl: R<bigint>;
  liqPrice: R<bigint>;
  marginRatioBps: R<bigint>;
};

/** Jeden wpis w historii aktywnosci - z realnych logow kontraktu, zero zmyslania. */
export type ActivityItem =
  | { kind: 'opened'; trader: Address; isLong: boolean; notional: bigint; entryPrice: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'closed'; trader: Address; exitNotional: bigint; pnl: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'liquidated'; trader: Address; keeper: Address; payoutUsdc: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'funding'; premium: bigint; perUnit: bigint; block: bigint; txHash: string; at: number }
  | { kind: 'badDebt'; trader: Address; shortfallWad: bigint; coveredUsdc: bigint; block: bigint; txHash: string; at: number };


/** Jeden punkt historii feedu: czas z argumentu zdarzenia `PriceSubmitted`, cena w WAD. */
export type PricePoint = { time: number; price: bigint };

