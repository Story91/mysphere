import { formatEther, formatUnits, parseEther, type Address } from 'viem';
import { ACTIVE_LAUNCHPAD_NETWORK } from '../config';
import { formatUsd } from '../useEthUsd';

/**
 * Wspolne typy i czysta arytmetyka strony tokena. Wydzielone po to, zeby
 * wykres, taby i panel handlu liczyly cene JEDNYM wzorem - dwa rozne wzory
 * na te sama cene bylyby gorsze niz brak ktorejkolwiek z tych sekcji.
 */

export const WEI = 1_000_000_000_000_000_000n;

/** R_VIRT z CurveLaunchpad: wirtualna rezerwa ETH, stala kontraktu. */
export const R_VIRT_WEI = 750_000_000_000_000_000n;

/** Cala podaz to zawsze 1e9 tokenow po 18 miejsc - stala T0 kontraktu. */
export const SUPPLY_TOKENS = 1_000_000_000n;
export const SUPPLY_WEI = SUPPLY_TOKENS * WEI;

/**
 * Cena startowa krzywej w wei za caly token: (R_VIRT * 1e18) / T0.
 * Wychodzi 7.5e8 wei, czyli 7.5e-10 ETH - od tego punktu zaczyna sie wykres.
 */
export const START_PRICE_WEI = (R_VIRT_WEI * WEI) / SUPPLY_WEI;

/** Graduacja przy DOKLADNIE 3.00 ETH rezerwy (CURVE_TARGET_ETH w config). */
export const TARGET_WEI = 3n * WEI;

/**
 * Tempo blokow AKTYWNEJ sieci - do estymacji czasu bez `getBlock` na kazdy log.
 *
 * Bylo tu twarde 2 (Base). Robinhood robi blok co 0,1 s, wiec ta stala mylila
 * sie tam dwudziestokrotnie: skan historii tokena startowal grubo powyzej jego
 * realnego bloku startu, a czasy na wykresie byly rozciagniete. Wartosc idzie
 * teraz z konfiguracji sieci (patrz `secondsPerBlock` w ../config).
 */
export const SECONDS_PER_BLOCK = ACTIVE_LAUNCHPAD_NETWORK.secondsPerBlock;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const DEAD_ADDRESS = '0x000000000000000000000000000000000000dead';

/**
 * PoolManager v4 z docs/LAUNCHPAD-STAN.md. Sluzy WYLACZNIE jako etykieta
 * wiersza holdera po graduacji - niczego na tym adresie nie wolamy, bo jego
 * ABI nie ma w config.ts.
 */
export const POOL_MANAGER_ADDRESS = '0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408';

export type TradeEntry = {
  /** txHash-logIndex; jedyny klucz odporny na duplikaty z reorganizacji. */
  id: string;
  kind: 'buy' | 'sell';
  account: Address;
  /** ethNet dla kupna, ethOut dla sprzedazy - to samo, co liczy board do wolumenu. */
  eth: bigint;
  tokens: bigint;
  /** Cena PO transakcji, wei za caly token - jedyne pewne zrodlo historii cen. */
  priceWei: bigint;
  ethReserveAfter: bigint;
  block: bigint;
  logIndex: number;
  /** Czas estymowany z numeru bloku; dokladny co do ~2 s, nie co do sekundy. */
  ts: number;
  txHash: `0x${string}` | null;
};

/**
 * Szybkie odczyty stanu tokena - wszystko, co strona pokazuje ZANIM skonczy
 * sie skan logow. Jedno zrodlo dla naglowka, statystyk i panelu handlu.
 */
export type CoreState = {
  token: Address;
  name: string;
  symbol: string;
  decimals: number;
  creator: Address;
  state: 'Curve' | 'Locked' | 'Graduated';
  ethReserve: bigint;
  tokenReserve: bigint;
  startedAt: number;
  /** 0n po graduacji - kontrakt wtedy rewertuje i odczyt ma .catch. */
  spotPriceWei: bigint;
  balance: bigint;
  allowance: bigint;
  poolId: `0x${string}`;
  liquidity: bigint;
  pendingEth: bigint;
  pendingToken: bigint;
  launchClaimable: bigint;
  hookEthClaimable: bigint;
  hookTokenClaimable: bigint;
  vaultEthClaimable: bigint;
  vaultTokenClaimable: bigint;
  /** Nagroda za wywolanie graduate(); null poza stanem Locked. */
  gradCallerReward: bigint | null;
  /**
   * Konfiguracja z launchAdvanced. Starsze wdrozenie nie ma tych odczytow -
   * wtedy known=false i sekcja konfiguracji sie nie pokazuje, zamiast klamac
   * zerami.
   */
  config: {
    known: boolean;
    feeBps: number;
    creatorFeeBps: number;
    receiverCount: number;
    metadataURI: string;
    buybackBps: number;
    pendingBuybackEth: bigint;
    buybackBurned: bigint;
  };
};

export type TokenProfileView = {
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
};

export type HolderRow = {
  address: string;
  balance: bigint;
  /** Procent podazy w setnych - 1234 znaczy 12.34%. */
  pctBps: number;
  badge: 'dev' | 'bonding curve' | 'burned' | 'vault' | 'hook' | 'pool' | null;
};

/**
 * Cena spot po transakcji: (R_VIRT + ethReserve) * 1e18 / tokenReserve.
 * Ten sam wzor, co spotPriceWeiPerToken w kontrakcie - liczony z pol
 * ethReserveAfter/tokenReserveAfter, ktore niesie kazdy Bought i Sold.
 */
export function priceWeiAfter(ethReserveAfter: bigint, tokenReserveAfter: bigint): bigint {
  if (tokenReserveAfter <= 0n) return 0n;
  return ((R_VIRT_WEI + ethReserveAfter) * WEI) / tokenReserveAfter;
}

/** Market cap w wei ETH: cena za token razy cala podaz (1e9 tokenow). */
export function mcapWei(priceWei: bigint): bigint {
  return priceWei * SUPPLY_TOKENS;
}

/** Wei za token -> liczba w ETH. Do WIDOKU i wykresu; nigdy do transakcji. */
export function priceToNumber(priceWei: bigint): number {
  return Number(priceWei) / 1e18;
}

export type PricePoint = { ts: number; price: number };

/**
 * Punkty cenowe do wykresu: start krzywej + kazda transakcja + syntetyczny
 * punkt "teraz" z ostatnia cena, zeby swieza krzywa nie wygladala na martwa.
 * Czas NIE MOZE sie cofac (estymacja z blokow vs dokladny startedAt), wiec
 * kazdy kolejny punkt jest dociagany do poprzedniego.
 */
export function toPricePoints(
  trades: TradeEntry[],
  startedAt: number,
  mode: 'price' | 'mcap',
  nowTs: number
): PricePoint[] {
  const scale = mode === 'mcap' ? Number(SUPPLY_TOKENS) : 1;
  const points: PricePoint[] = [{ ts: startedAt, price: priceToNumber(START_PRICE_WEI) * scale }];
  let last = startedAt;
  for (const trade of trades) {
    const ts = Math.max(trade.ts, last);
    last = ts;
    points.push({ ts, price: priceToNumber(trade.priceWei) * scale });
  }
  if (nowTs > last) points.push({ ts: nowTs, price: points[points.length - 1].price });
  return points;
}

export type Candle = { time: number; open: number; high: number; low: number; close: number };

/**
 * OHLC z punktow cenowych. Open swiecy to close poprzedniej - jak na kazdym
 * wykresie gieldowym; puste kubelki sa pomijane, lightweight-charts sam
 * zostawia w tym miejscu przerwe.
 */
export function buildCandles(points: PricePoint[], intervalSec: number): Candle[] {
  const candles: Candle[] = [];
  for (const point of points) {
    const bucket = Math.floor(point.ts / intervalSec) * intervalSec;
    const last = candles[candles.length - 1];
    if (!last || bucket > last.time) {
      const open = last ? last.close : point.price;
      candles.push({
        time: bucket,
        open,
        high: Math.max(open, point.price),
        low: Math.min(open, point.price),
        close: point.price,
      });
    } else {
      last.high = Math.max(last.high, point.price);
      last.low = Math.min(last.low, point.price);
      last.close = point.price;
    }
  }
  return candles;
}

/** Linia schodkowa: jeden punkt na sekunde, ostatnia cena wygrywa. */
export function buildLine(points: PricePoint[]): { time: number; value: number }[] {
  const out: { time: number; value: number }[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && last.time === point.ts) last.value = point.price;
    else if (!last || point.ts > last.time) out.push({ time: point.ts, value: point.price });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  FORMATOWANIE - wylacznie warstwa widoku                                    */
/* -------------------------------------------------------------------------- */

export function short(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

/**
 * Ceny na krzywej zaczynaja od 7.5e-10 ETH - staly format dziesietny dawalby
 * sciane zer, a sam wykladniczy jest nieczytelny przy mcap rzedu kilku ETH.
 * Stad progi.
 */
export function fmtPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  if (value >= 0.000001) return value.toFixed(8);
  // Ceny tokenow z krzywej sa rzedu 1e-9 ETH. `toExponential` dawal tu "1.96e-9"
  // - notacja naukowa, ktora wyglada jak blad, a nie jak cena. Zamiast tego
  // pelny zapis dziesietny z 3 cyframi znaczacymi (uzytkownik woli dlugi, ale
  // czytelny). `toLocaleString` NIE uzywa notacji naukowej.
  return value.toLocaleString('en-US', { maximumSignificantDigits: 3, useGrouping: false });
}

/**
 * Cena w USD dla malych wartosci. `formatUsd` scina wszystko ponizej centa do
 * "<$0.01", a cena tokena jest zwykle duzo mniejsza - wiec tutaj pokazujemy
 * pelny zapis dziesietny z 3 cyframi znaczacymi, spojnie z `fmtPrice`.
 */
export function fmtUsdPrice(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '--';
  if (usd >= 0.01) return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${usd.toLocaleString('en-US', { maximumSignificantDigits: 3, useGrouping: false })}`;
}

export function fmtEth(value: bigint, maxFractionDigits = 5): string {
  return Number(formatEther(value)).toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits });
}

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

export function fmtTokens(value: bigint, decimals: number): string {
  return COMPACT.format(Number(formatUnits(value, decimals)));
}

/**
 * Dopisek USD do kwoty w wei. Null przy nieznanym kursie - kontrakt UI kaze
 * wtedy POMINAC dopisek, a nie pokazywac zero czy kreske obok kwoty w ETH.
 */
export function usdSuffix(wei: bigint, ethUsd: number | null): string | null {
  if (ethUsd === null) return null;
  return formatUsd(Number(formatEther(wei)) * ethUsd);
}

export function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

/**
 * `parseEther` rzuca na wszystkim, co nie jest zapisem dziesietnym - a
 * `Number()` przyjmuje `1e3` i `0x10`, wiec sam nie wystarczy jako straznik.
 * Ten sam wzorzec, co w LaunchpadBoard.
 */
export function toWei(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  try {
    return parseEther(trimmed);
  } catch {
    return null;
  }
}

export function isAddressParam(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}
