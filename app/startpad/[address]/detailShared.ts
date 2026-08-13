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

/**
 * Kwota na PASKU ZDARZEN NA ZYWO.
 *
 * Pasek pisal kwoty w ETH i to go zabijalo: typowe kupno na krzywej to
 * 0,00008 ETH, wiec przez tablice jechalo "Buy 0.000 ETH" - liczba, ktora
 * wyglada jak zero i nie mowi nikomu nic. To samo zdarzenie w dolarach brzmi
 * "Buy $0.15": tyle samo prawdy, a widac, ze ktos naprawde cos kupil.
 *
 * Przelaczamy sie na dolary DOPIERO tam, gdzie ETH przestaje cokolwiek
 * pokazywac (ponizej 0,0001, czyli ponizej czterech miejsc po przecinku).
 * Wyzej zostaje ETH, bo to jest waluta tego rynku i przy 0,05 ETH liczba mowi
 * sama za siebie.
 *
 * Bez kursu zostaje ETH - zmyslony dolar bylby gorszy od nieczytelnego eteru.
 */
export function tapeAmount(eth: number, ethUsd: number | null): string {
  if (!Number.isFinite(eth) || eth < 0) return '0';

  const asEth = () => `${eth.toFixed(eth >= 1 ? 2 : 4).replace(/\.?0+$/, '')} ETH`;
  if (ethUsd === null || !Number.isFinite(ethUsd) || ethUsd <= 0) return asEth();
  if (eth >= 0.0001) return asEth();

  const usd = eth * ethUsd;
  if (usd === 0) return '$0.00';
  // Ulamek centa NIE moze pokazac sie jako "$0.00" - to wyglada jak brak
  // transakcji, a transakcja byla.
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

/**
 * CALY zarobek konta w rankingu, nie tylko to, co zostalo do odebrania.
 *
 * Ranking pokazywal wylacznie biezace `claimable`, wiec kto odebral swoje
 * oplaty, spadal z listy do zera - mimo ze zarobil je naprawde. "Top earnings"
 * ma liczyc to, co ZARABIANE, a nie to, co jeszcze lezy nieodebrane.
 *
 * Suma ze zdarzen `FeeAccrued` jest calym zarobkiem, bo skan tablicy siega
 * bloku wdrozenia launchpada. Saldo z lancucha zostaje jako DOL: gdyby ktores
 * okno skanu padlo, suma zdarzen bylaby zanizona, a tego, co lezy do odebrania,
 * ranking zaniżyć nie ma prawa.
 */
export function totalEarned(fromEvents: bigint, claimableNow: bigint): bigint {
  return fromEvents > claimableNow ? fromEvents : claimableNow;
}

/**
 * REZERWA NA GAZ przy klikaniu 25/50/100% i Max.
 *
 * Stalo tu 0,005 ETH, czyli okolo dziewieciu dolarow, i to zamienialo te
 * przyciski w atrapy: przy saldzie 0,0004 ETH rezerwa byla DWUNASTOKROTNIE
 * WIEKSZA NIZ CALE SALDO, wiec `saldo - rezerwa` schodzilo do zera i kazdy
 * procent wpisywal zero.
 *
 * Liczba byla oderwana od sieci, w ktorej stoimy. Zmierzony koszt gazu
 * transakcji launchpada na Base to 0,0000004 ETH - stara rezerwa byla od niego
 * dwanascie tysiecy razy wieksza. Ta zostawia okolo stu transakcji zapasu i
 * dalej jest ulamkiem centa.
 */
export const GAS_RESERVE_WEI = 50_000_000_000_000n;

/**
 * Ile z salda wolno zaproponowac do wydania. Nigdy ponizej zera - saldo
 * mniejsze od rezerwy znaczy "nie ma z czego", a nie "minus".
 */
export function spendableEth(balance: bigint | null | undefined, reserve: bigint): bigint {
  if (typeof balance !== 'bigint') return 0n;
  return balance > reserve ? balance - reserve : 0n;
}

/** Ulamek kwoty, zaokraglony W DOL - nie wolno zaproponowac wiecej, niz jest. */
export function fractionOf(value: bigint, numerator: bigint, denominator: bigint): bigint {
  if (value <= 0n || denominator <= 0n) return 0n;
  return (value * numerator) / denominator;
}

/**
 * BUFOR POSLIZGU - do wyboru przez uzytkownika, w setnych procenta.
 *
 * Stalo tu na sztywno 50 (0,5%) i to bylo za malo o rzad wielkosci. 13 sierpnia
 * 2026 na tokenie SAUSAGES padalo 28% sprzedazy i 15% zakupow: rezerwa krzywej
 * spadala z 0,2136 do 0,0822 ETH w kilkanascie minut, wiec jedna cudza
 * transakcja miedzy odczytem wyceny a wejsciem do bloku wystarczala, zeby
 * minimum przestalo byc osiagalne. Jedna z nieudanych sprzedazy miala minimum
 * 14,8% powyzej tego, co krzywa wtedy placila.
 *
 * Dlatego to jest WYBOR, a nie stala: na krzywej z ruchem zadna jedna liczba
 * nie jest dobra dla wszystkich, a uzytkownik ma prawo wiedziec, na ile
 * gorsza cene sie godzi.
 */
export const SLIPPAGE_OPTIONS = [100, 300, 500] as const;
export const DEFAULT_SLIPPAGE_BPS = 300;

/**
 * Minimum, ktore wolno przyjac przy danej wycenie.
 *
 * Zaokraglamy W DOL, bo minimum ma byc osiagalne, a nie ambitne. Wyjatek:
 * niezerowa wycena nie moze zejsc do zera - kontrakt rewertuje wtedy z
 * `SlippageRequired`, wiec zaokraglony do zera pyl zamienialby male zlecenie
 * w pewny rewert.
 */
export function applySlippage(quoted: bigint, bps: number): bigint {
  if (quoted <= 0n) return 0n;
  const kept = BigInt(Math.max(0, Math.min(10_000, Math.round(bps))));
  const min = (quoted * (10_000n - kept)) / 10_000n;
  return min > 0n ? min : 1n;
}

/**
 * Blad kontraktu -> zdanie dla czlowieka.
 *
 * Goly `execution reverted` nie mowi nikomu nic, a akurat te trzy przypadki
 * maja bardzo konkretne przyczyny i bardzo konkretne wyjscie.
 */
export function tradeErrorMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);

  if (/User rejected|User denied|rejected the request/i.test(raw)) {
    return 'You cancelled the transaction in your wallet.';
  }
  if (/Slippage\(\)/.test(raw)) {
    return 'The price moved before your transaction landed. Check the quote and try again, or raise the slippage setting.';
  }
  if (/TokenTransferFailed\(\)/.test(raw)) {
    return 'The launchpad could not take your tokens, which means the approval did not go through. Approve again and retry.';
  }
  if (/NothingToClaim\(\)/.test(raw)) {
    return 'Nothing to claim right now.';
  }
  if (/DeadlineExpired\(\)/.test(raw)) {
    return 'The transaction sat unsigned for too long. Send it again.';
  }
  if (/insufficient funds/i.test(raw)) {
    return 'Not enough ETH to cover the amount plus gas.';
  }

  return raw.split('\n')[0];
}

/**
 * Jedna strona listy. Uzywane przez zakladke Trades, ktora dotad rosla w dol
 * przyciskiem "Show more" - przy tokenie ze 141 transakcjami rozciagalo to
 * strone na kilka ekranow i psulo przewijanie wszystkiego ponizej.
 *
 * Numer strony poza zakresem NIE jest bledem, tylko wraca do ostatniej
 * istniejacej: lista transakcji zmienia dlugosc pod reka (zdarzenia na zywo,
 * dociagana historia), wiec stan "jestem na stronie 7" musi przezyc to, ze
 * stron zrobilo sie piec.
 */
export function pageSlice<T>(
  items: T[],
  page: number,
  size: number
): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const safe = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  return { rows: items.slice(safe * size, safe * size + size), page: safe, pages };
}

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
