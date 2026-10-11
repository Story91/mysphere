import { formatEther, formatUnits, parseEther, type Address } from 'viem';
import { ACTIVE_LAUNCHPAD_NETWORK, LAUNCHPAD_NETWORKS, type LaunchpadDeployment } from '../config';
import { formatUsd } from '../useEthUsd';

/**
 * Wspolne typy i czysta arytmetyka strony tokena. Wydzielone po to, zeby
 * wykres, taby i panel handlu liczyly cene JEDNYM wzorem - dwa rozne wzory
 * na te sama cene bylyby gorsze niz brak ktorejkolwiek z tych sekcji.
 */

export const WEI = 1_000_000_000_000_000_000n;

/** Cala podaz to zawsze 1e9 tokenow po 18 miejsc - stala T0 kontraktu. */
export const SUPPLY_TOKENS = 1_000_000_000n;
export const SUPPLY_WEI = SUPPLY_TOKENS * WEI;

/**
 * SKALA KRZYWEJ JEST WLASNOSCIA SIECI, NIE STALA MODULU.
 *
 * Stalo tu `R_VIRT_WEI = 0.75e18` i `TARGET_WEI = 3e18` - prawda kazdego
 * wdrozenia az do 2026-08-14, gdy `R_VIRT` stalo sie argumentem konstruktora.
 * Na Arc launchpad zbiera 1000 USDC, wiec strona tokena pisala "61.72 of 3.00
 * USDC - 0 USDC to graduation" przy krzywej przejechanej w szesciu procentach.
 *
 * Wersje z `chainId` sa tu dlatego, ze ten modul dziala TAKZE na serwerze, przy
 * karcie udostepniania: `loadTokenCard` rozpoznaje siec tokena sama i moze to
 * byc siec inna niz domyslna. Stale ponizej zostaja dla kodu klienckiego, gdzie
 * aktywna siec wynika juz z adresu strony.
 */
function scaleOf(chainId: number): bigint {
  const net = LAUNCHPAD_NETWORKS[chainId] ?? ACTIVE_LAUNCHPAD_NETWORK;
  return parseEther(String(net.rVirt));
}

/** Wirtualna rezerwa krzywej danej sieci, w wei. */
export function rVirtWeiFor(chainId: number): bigint {
  return scaleOf(chainId);
}

/** Prog graduacji danej sieci: zawsze czterokrotnosc wirtualnej rezerwy. */
export function targetWeiFor(chainId: number): bigint {
  return scaleOf(chainId) * 4n;
}

/** Cena startowa krzywej danej sieci w wei za caly token: (R_VIRT * 1e18) / T0. */
export function startPriceWeiFor(chainId: number): bigint {
  return (scaleOf(chainId) * WEI) / SUPPLY_WEI;
}

/**
 * Cena spot po transakcji NA WSKAZANEJ SIECI:
 * (R_VIRT + ethReserve) * 1e18 / tokenReserve.
 */
export function priceWeiAfterOn(
  chainId: number,
  ethReserveAfter: bigint,
  tokenReserveAfter: bigint
): bigint {
  if (tokenReserveAfter <= 0n) return 0n;
  return ((scaleOf(chainId) + ethReserveAfter) * WEI) / tokenReserveAfter;
}

const ACTIVE_CHAIN_ID = ACTIVE_LAUNCHPAD_NETWORK.chain.id;

/** R_VIRT aktywnej sieci: wirtualna rezerwa, ktorej krzywa nigdy nie wyplaca. */
export const R_VIRT_WEI = rVirtWeiFor(ACTIVE_CHAIN_ID);

/** Cena startowa krzywej - od tego punktu zaczyna sie wykres. */
export const START_PRICE_WEI = startPriceWeiFor(ACTIVE_CHAIN_ID);

/** Graduacja przy czterokrotnosci R_VIRT (CURVE_TARGET_ETH w config). */
export const TARGET_WEI = targetWeiFor(ACTIVE_CHAIN_ID);

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
  /** Wdrozenie, z ktorego pochodzi token - wszystkie operacje ida do JEGO kontraktow. */
  deployment: LaunchpadDeployment;
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

/* -------------------------------------------------------------------------- */
/*  KTO JEST HOLDEREM - i skad to wiemy                                        */
/* -------------------------------------------------------------------------- */

/**
 * CZY NASZE SALDA SA JUZ PRAWDA, CZY DOPIERO PRZYBLIZENIEM.
 *
 * Do 15 sierpnia 2026 liczba holderow na stronie tokena brala sie z WIEKSZEJ z
 * dwoch liczb: naszej (odtworzonej z transferow) i tej z indeksu Blockscouta.
 * Miala sens, dopoki nasza byla przyblizeniem - salda skladalismy z roznic i
 * przy ucietym skanie wychodzily za male.
 *
 * Od czasu, gdy salda czyta `balanceOf`, jest inaczej: przy KOMPLETNEJ historii
 * nasza mapa jest dokladna co do wei, a Blockscout bywa spozniony o godziny (to
 * on pokazywal „Holders (1)" przy czterech kupujacych na GLIFE). Wtedy branie
 * maksimum nie chroni juz przed zanizeniem, tylko wpuszcza cudze opoznienie na
 * ekran.
 *
 * `exact` znaczy: historia siega bloku startu tokena I mamy z niej salda.
 */
export function holdersAreExact(input: { complete: boolean; knownBalances: number }): boolean {
  return input.complete && input.knownBalances > 0;
}

/** Liczba posiadaczy: przy dokladnych saldach nasza, inaczej wieksza z dwoch. */
export function pickHolderCount(input: { chain: number; index: number | null; exact: boolean }): number {
  if (input.exact) return input.chain;
  return Math.max(input.chain, input.index ?? 0);
}

/**
 * Zrodlo WIERSZY tabeli holderow. Przy dokladnych saldach nasze; inaczej to,
 * ktore widzi wiecej - liczone PO odsianiu sald niedodatnich, bo tylko one sa
 * wierszami.
 */
export function pickHolderRows(input: {
  chain: Array<[string, bigint]>;
  index: Array<[string, bigint]>;
  exact: boolean;
}): Array<[string, bigint]> {
  if (input.exact && input.chain.length > 0) return input.chain;

  /*
   * POKRYCIE Z INDEKSU, KWOTY Z LANCUCHA.
   *
   * Do 16 wrzesnia 2026 przy ucietym skanie oddawalismy CALE wiersze z cudzego
   * indeksu - razem z jego kwotami. Na Arc bylo to widac goly okiem: strona
   * tokena ARPE pokazywala w wierszu `BONDING CURVE` 999,7M (99,96%), podczas
   * gdy lancuch dawal rowno 1 000,0M (100,0000%) i w `balanceOf(launchpad)`,
   * i w `tokenReserve`. Indeksem na Arc jest arc-scan.org - spolecznosciowy
   * i spozniony; komentarz przy `holdersAreExact` sam przed tym ostrzega.
   *
   * Indeks nadal wygrywa tam, gdzie jest lepszy: ZNA WIECEJ ADRESOW niz nasze
   * okno skanu. Ale tam, gdzie mamy wlasny odczyt `balanceOf`, nie ma powodu
   * ufac cudzej kopii - wiec bierzemy z niego pokrycie, a kwoty nadpisujemy
   * swoimi. To jest scisle dokladniejsze od obu zrodel osobno i dziala tak
   * samo na kazdej sieci, nie tylko na Arc.
   */
  const mine = new Map(input.chain);
  const base = input.index.length >= input.chain.length ? input.index : input.chain;
  const merged = base.map(([address, balance]): [string, bigint] => {
    const own = mine.get(address);
    return own === undefined ? [address, balance] : [address, own];
  });

  // Adresy, ktore znamy z lancucha, a ktorych w wybranym zrodle nie ma.
  // Bez tego nasz wlasny, swiezy odczyt wypadlby z tabeli tylko dlatego, ze
  // indeks jeszcze o nim nie wie.
  const seen = new Set(merged.map(([address]) => address));
  for (const row of input.chain) {
    if (!seen.has(row[0])) merged.push(row);
  }
  return merged;
}

/**
 * Cena spot po transakcji na AKTYWNEJ sieci: (R_VIRT + ethReserve) * 1e18 /
 * tokenReserve. Ten sam wzor, co spotPriceWeiPerToken w kontrakcie - liczony
 * z pol ethReserveAfter/tokenReserveAfter, ktore niesie kazdy Bought i Sold.
 *
 * Dla sieci innej niz aktywna jest `priceWeiAfterOn(chainId, ...)`.
 */
export function priceWeiAfter(ethReserveAfter: bigint, tokenReserveAfter: bigint): bigint {
  return priceWeiAfterOn(ACTIVE_CHAIN_ID, ethReserveAfter, tokenReserveAfter);
}

/**
 * Market cap w wei ETH: cena za token razy podaz W OBIEGU, czyli 1e9 minus
 * saldo 0xdEaD. Spalone tokeny nikt juz nie sprzeda, wiec liczenie ich do
 * kapitalizacji zawyzalo ja o tyle, ile spalono (SPHERE: ~7% w paz. 2026).
 */
export function mcapWei(priceWei: bigint, burnedWei: bigint = 0n): bigint {
  const burnedTokens = burnedWei / WEI;
  const circulating = SUPPLY_TOKENS > burnedTokens ? SUPPLY_TOKENS - burnedTokens : SUPPLY_TOKENS;
  return priceWei * circulating;
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
  /**
   * Mnoznik ceny jednego tokena. 1 = wykres ceny. Cala podaz = kapitalizacja
   * w ETH. Cala podaz razy kurs ETH/USD = kapitalizacja w dolarach.
   *
   * Stalo tu wczesniej `mode: 'price' | 'mcap'`, a mnoznik powstawal w srodku.
   * Kapitalizacji nie dalo sie przez to pokazac w dolarach, mimo ze kurs byl
   * o dwie linijki wyzej - a kapitalizacja w ETH nie mowi nikomu nic.
   */
  scale: number,
  nowTs: number
): PricePoint[] {
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
/**
 * Swiece z punktow cenowych, Z WYPELNIENIEM PUSTYCH OKRESOW.
 *
 * lightweight-charts rozstawia slupki po INDEKSIE, nie po czasie: dwie swiece
 * obok siebie wygladaja na sasiednie minuty takze wtedy, gdy dzieli je szesc
 * godzin ciszy. Do 10.09.2026 budowalismy swiece wylacznie tam, gdzie byla
 * transakcja, wiec wykres sciskal noc do jednego slupka i klamal o tempie
 * handlu - obok DexScreenera, ktory rysuje kazdy okres, wygladalo to na
 * zepsute. Puste okresy dostaja teraz plaska swiece na ostatniej cenie, czyli
 * dokladnie to, co robi kazda gielda.
 */
export function buildCandles(points: PricePoint[], intervalSec: number): Candle[] {
  const candles: Candle[] = [];
  // Sufit na wypadek starego rynku ogladanego w 1m (20 000 swiec to ~14 dni
  // minutowych). Powyzej i tak trzeba zmienic interwal, zeby cokolwiek zobaczyc.
  const MAX_CANDLES = 20_000;
  for (const point of points) {
    const bucket = Math.floor(point.ts / intervalSec) * intervalSec;
    const last = candles[candles.length - 1];
    if (!last) {
      candles.push({ time: bucket, open: point.price, high: point.price, low: point.price, close: point.price });
      continue;
    }
    if (bucket > last.time) {
      for (let t = last.time + intervalSec; t < bucket && candles.length < MAX_CANDLES; t += intervalSec) {
        const close = candles[candles.length - 1].close;
        candles.push({ time: t, open: close, high: close, low: close, close });
      }
      const open = candles[candles.length - 1].close;
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
/**
 * Jednostki, dla ktorych wolno przeliczyc kwote na dolary.
 *
 * Kurs, ktorym dysponuje tablica, to kurs ETH/USD. Uzycie go do jednostki
 * INNEJ SIECI (Arc, Robinhood) byloby klamstwem o pieniadzach, a nie wygoda -
 * pokazywaloby cudza walute wycenie etheru. Sieci rozliczane w dolarach maja
 * kurs 1 i tam dolar jest po prostu prawda.
 */
const PRICEABLE = /^(ETH|WETH|USDC|USDT|USD)$/i;

export function tapeAmount(amount: number, usdRate: number | null, symbol: string): string {
  if (!Number.isFinite(amount) || amount < 0) return '0';

  // Symbol dokleja TA funkcja i tylko ona. `formatEth` w tablicy robi to samo,
  // wiec sklejenie obu dawalo "0.069 ETH ETH".
  const native = () => `${amount.toFixed(amount >= 1 ? 2 : 4).replace(/\.?0+$/, '')} ${symbol}`;

  if (usdRate === null || !Number.isFinite(usdRate) || usdRate <= 0) return native();
  if (!PRICEABLE.test(symbol)) return native();

  const usd = amount * usdRate;
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
  // Bledy CYKLU ZYCIA. Bez nich kupujacy, ktory trafil w 5-minutowe okno
  // startowe, dostawal goly napis "WindowCap()" i nie mial jak zgadnac, ze
  // to limit na portfel, a nie awaria.
  if (/WindowCap\(\)/.test(raw)) {
    return 'This launch caps how much one wallet can buy in the first 5 minutes, and you have reached that cap. Buy a smaller amount, or wait for the window to close.';
  }
  if (/CurveIsLocked\(\)/.test(raw)) {
    return 'The curve is full, so buying is closed. Selling still works, and anyone can open the Uniswap v4 pool.';
  }
  if (/AlreadyGraduated\(\)/.test(raw)) {
    return 'This token has graduated. The curve is closed for good and trading now happens in its Uniswap v4 pool.';
  }
  if (/NotLocked\(\)/.test(raw)) {
    return 'The curve has not filled yet, so there is nothing to graduate.';
  }
  if (/ReserveTooSmallToGraduate\(\)/.test(raw)) {
    return 'Too little is left in the reserve to open a pool with, so this curve cannot graduate. Selling stays open.';
  }
  if (/BuyTooLarge\(\)/.test(raw)) {
    return 'That is above the per-transaction buy limit. Split it into smaller buys.';
  }
  if (/DustTrade\(\)/.test(raw)) {
    return 'That amount is too small to move the curve at all. Try a larger one.';
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
