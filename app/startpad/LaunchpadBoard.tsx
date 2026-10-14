'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  Crown,
  ExternalLink,
  GraduationCap,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { formatEther, formatUnits, getAbiItem, getAddress, maxUint256, parseEther, parseUnits, zeroAddress, type Address } from 'viem';
import { useAccount, useBalance, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  NATIVE_SYMBOL,
  ACTIVE_LAUNCHPAD_NETWORK,
  CURVE_TARGET_ETH,
  R_VIRT_NATIVE,
  erc20Abi,
  hookAbi,
  LAUNCH_HOOK_ADDRESS,
  LAUNCH_HOOK_ADDRESSES,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_ADDRESSES,
  LAUNCHPAD_DEPLOYMENTS,
  LIQUIDITY_VAULT_ADDRESSES,
  deploymentOrOldest,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_DEPLOY_BLOCK,
  LAUNCHPAD_NETWORKS,
  DEFAULT_LAUNCHPAD_CHAIN_ID,
  type LaunchpadNetwork,
  LAUNCH_STATE,
  LIQUIDITY_VAULT_ADDRESS,
  launchpadAbi,
  liquidityVaultAbi,
  LIVE_WATCH,
  previewTokens,
  setLaunchpadChain,
  setLaunchpadMarket,
  MARKET_QUERY,
  ACTIVE_MARKET_ID,
  STATE_VIEW_ADDRESS,
  type LaunchpadToken,
  ETH_USDC_POOL,
  PERP_ZAP_ADDRESS,
  QUOTE_ASSET,
  perpZapAbi,
} from './config';
import { fetchPerpPoolKey } from './perpZap';
import { fetchLogos, recallLogos, rememberLogos } from './logos';
import { SPHERE_TOKEN_ADDRESS } from './sphere/sphereConfig';
import { tokenAccent } from './metadata';
import { browserStorage, flushPendingProfiles, postProfileWithRetry, sendTokenProfile } from './profileSync';
import {
  loadBoardAggregate,
  loadFeedSnapshot,
  loadSnapshot,
  saveBoardAggregate,
  saveFeedSnapshot,
  saveSnapshot,
} from './snapshot';
import {
  applySwapLogs,
  applyTransferLogs,
  BURN_SINK,
  holderCount,
  logRangeLimitFrom,
  mergeAggregates,
  parseAggregate,
  parseExtras,
  planBoardScan,
  planExtrasScan,
  poolVolumeEth,
  reduceBoardLogs,
  scanIsTrustworthy,
  serializeAggregate,
  serializeExtras,
  shouldKeepUnscanned,
  type TokenExtras,
} from './boardScan';
// Agregat wspolny dla wszystkich urzadzen - patrz naglowek `boardStats`.
import { fetchBoardStats, pickAggregateBase } from './boardStats';
// Jedna, ZMIERZONA rezerwa na gaz i jedna arytmetyka procentow dla obu paneli
// handlu - mini modala na tablicy i panelu na stronie tokena. Dwie kopie tej
// samej liczby wlasnie kosztowaly nas przyciski, ktore wpisywaly zero.
import { DEAD_ADDRESS, DEFAULT_SLIPPAGE_BPS, fractionOf, GAS_RESERVE_WEI, spendableEth, tapeAmount, totalEarned } from './[address]/detailShared';
import { fetchTokenCountersBatch, indexLooksCaughtUp } from './blockscout';
// Ta sama arytmetyka ceny puli, co na stronie tokena - jedna kopia, zeby karta
// i strona nie mogly pokazac dwoch roznych cen tego samego tokena.
import { poolPriceWeiFromSqrt, stateViewAbi } from './[address]/poolPrice';
import { POOL_SWAP_EVENT } from './[address]/poolSwaps';
import LaunchTokenModal from './LaunchTokenModal';
import ShareToken from './ShareToken';
import StartpadFooter from './StartpadFooter';
import { LifecycleGuide, STATE_HINT } from './LifecycleGuide';
import { formatUsd, useEthUsd } from './useEthUsd';
import { displayTradeMessage, txHashFromFeedId } from './[address]/tradeMessage';
import { useTradeMessages } from './[address]/useTradeMessages';

const FIELD =
  'w-full rounded-xl border border-sp-shade/10 bg-sp-surface px-3.5 py-3 text-[14px] text-sp-ink outline-none transition-colors placeholder:text-sp-shade/35 focus:border-sp-brand';

/**
 * `parseEther` rzuca na wszystkim, co nie jest zapisem dziesietnym - a
 * `Number()` przyjmuje `1e3` i `0x10`, wiec sam nie wystarczy jako straznik.
 * Bez tego wpisanie `1e3` w pole ilosci wywalaloby RENDER, nie transakcje.
 */
function toWei(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  try {
    return parseEther(trimmed);
  } catch {
    return null;
  }
}

/**
 * Etykieta aktywnej sieci. SSR zawsze renderuje siec domyslna (modul nie widzi
 * localStorage), wiec kazde miejsce, ktore ja POKAZUJE, dostaje
 * `suppressHydrationWarning` - po stronie klienta etykieta moze byc inna
 * i to jest oczekiwane, a nie blad hydratacji.
 */
// Czym placi okno kupna na tablicy: na rynku perpa z zapem ETH (PerpBuyZap), inaczej waluta rynku.
const BUY_SYMBOL = QUOTE_ASSET && PERP_ZAP_ADDRESS ? 'ETH' : NATIVE_SYMBOL;
const NET = ACTIVE_LAUNCHPAD_NETWORK.label;

/**
 * Przelacznik sieci. Zmiana przeladowuje strone (patrz `setLaunchpadChain`) -
 * stan handlu nie ma prawa przezyc zmiany adresow, na ktore patrzy.
 * Do hydratacji renderujemy sam napis; select wchodzi po montazu, zeby
 * kontrolowana wartosc nie klocila sie z HTML-em z serwera.
 */
/**
 * Klucz migawek tablicy w localStorage: siec, a na rynku Q siec + rynek.
 * Sam chainId wczytywal na tablicy ETH2xL wiersze z tablicy ETH tej sieci.
 */
const BOARD_CACHE_KEY: number | string = ACTIVE_MARKET_ID
  ? `${ACTIVE_LAUNCHPAD_NETWORK.chain.id}-${ACTIVE_MARKET_ID}`
  : ACTIVE_LAUNCHPAD_NETWORK.chain.id;

function NetworkSwitch() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = ACTIVE_LAUNCHPAD_NETWORK;
  if (!mounted) {
    return <span suppressHydrationWarning className="py-2.5 pl-3.5 pr-2 text-[12px] font-bold text-sp-shade/40">{NET}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 py-2.5 pl-3.5 pr-2 ${active.accentTextClass}`}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <select
        value={active.marketId ? `${active.chain.id}:${active.marketId}` : active.chain.id}
        onChange={(event) => {
          // $SPHERE mieszka NA LISCIE sieci (decyzja wlasciciela 2026-08-31:
          // osobny przycisk rozpychal piguke wyboru) - to nawigacja, nie
          // zmiana lancucha, wiec przechwytujemy przed setLaunchpadChain.
          if (event.target.value === 'sphere') {
            window.location.href = '/startpad/sphere';
            return;
          }
          // Wszystkie rynki perpow w jednym widoku (jak w aplikacji Flash).
          if (event.target.value === 'perps') {
            window.location.href = '/startpad/perps';
            return;
          }
          // Calls: kupna z wiadomoscia jako prognozy z wynikiem, wszystkie rynki.
          if (event.target.value === 'calls') {
            window.location.href = '/calls';
            return;
          }
          // Rynek Q na sieci ("8453:eth2xl") - osobna tablica z para mem/perp.
          const [chainPart, marketPart] = event.target.value.split(':');
          if (marketPart) {
            setLaunchpadMarket(Number(chainPart), marketPart);
            return;
          }
          if (Number(chainPart) === active.chain.id && active.marketId) {
            setLaunchpadMarket(active.chain.id, null);
            return;
          }
          setLaunchpadChain(Number(chainPart));
        }}
        aria-label="Launchpad network"
        className="cursor-pointer bg-transparent text-[12px] font-extrabold outline-none [color:inherit] [&>option]:bg-sp-surface [&>option]:text-sp-ink"
      >
        {/* Testnety schowane (decyzja wlasciciela 16.09.2026: Arc i Base maja
            mainnet, sepolia/Arc testnet tylko mylily). Aktywny testnet zostaje
            na liscie, zeby `value` selecta nie wskazywal na nieistniejaca opcje
            u kogos, kto ma go zapamietanego w localStorage - wtedy moze
            przelaczyc sie z niego na mainnet. */}
        {Object.values(LAUNCHPAD_NETWORKS)
          .filter((net) => !net.testnet || net.chain.id === active.chain.id)
          .flatMap((net) => [
            <option key={net.chain.id} value={net.chain.id}>
              {net.label}
            </option>,
            // Rynki perpow maja wspolny widok "Perp memes" (pozycja nizej). Na
            // liscie zostaje tylko AKTYWNY rynek, zeby `value` selecta nie
            // wskazywal na nieistniejaca opcje, gdy ktos jest na tablicy perpa.
            ...(net.markets ?? [])
              .filter((m) => net.chain.id === active.chain.id && m.id === active.marketId)
              .map((m) => (
                <option key={`${net.chain.id}:${m.id}`} value={`${net.chain.id}:${m.id}`}>
                  {`${net.label} · ${m.label}`}
                </option>
              )),
          ])}
        <option disabled>──────</option>
        {Object.values(LAUNCHPAD_NETWORKS).some((net) => (net.markets?.length ?? 0) > 0 && !net.testnet) && (
          <option value="perps">⚡ Perp memes</option>
        )}
        <option value="calls">📣 Calls</option>
        <option value="sphere">✦ $SPHERE</option>
      </select>
    </span>
  );
}

/** Pastylka aktywnej sieci - sama etykieta, w barwach marki lancucha. */
function NetworkTag() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const net = mounted ? ACTIVE_LAUNCHPAD_NETWORK : null;
  if (!net) return <span suppressHydrationWarning className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/35">{NET}</span>;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${net.pillClass}`}>
      {net.label}
    </span>
  );
}

type BoardTab = 'new' | 'trending' | 'about' | 'graduated' | 'all';
type TradeSide = 'buy' | 'sell';
type BusyAction = 'buy' | 'approve' | 'sell' | 'graduate' | 'settle' | 'harvest' | 'claim';

/**
 * Wiersz tablicy. Rozszerza typ z `config.ts` o pola, ktore zyja TYLKO w tym
 * widoku: `startedAt` do sortowania "New", historie cen do sparkline'a i stan
 * blysku po transakcji. `config.ts` jest nietykalny, wiec rozszerzenie stoi tu.
 */
/**
 * ATRAPY NIE LICZA SIE DO SUM SIECI.
 *
 * `previewTokens` zostaja na kazdej sieci az do pierwszego prawdziwego launchu
 * - pusty board wygladalby jak zepsuta strona. Plakietka SAMPLE i zdanie pod
 * siatka mowia wprost, ze nie da sie nimi handlowac.
 *
 * ALE ich liczby nie maja prawa wchodzic do `BoardStats`. 16.09.2026, w dniu
 * wejscia na Arc, board pokazywal "CURVE RESERVE 15 433,50 USDC" i "ACTIVE
 * CURVES 2" na sieci, gdzie nie bylo ANI JEDNEJ krzywej - bo sumy lecialy po
 * calej tablicy `tokens`, nie po `live`. Plakietka przy wierszu nie ratuje
 * liczby w naglowku: tam nie ma czego oznaczyc, wiec tam po prostu nie wolno
 * tego dodawac. Stad `liveTokens` nizej.
 */
type BoardToken = LaunchpadToken & {
  /** Sekundy uniksowe z eventu `Launched` - podstawa sortowania "New". */
  startedAt?: number;
  /** Ostatnie ceny spot w ETH/token, chronologicznie, maks 12 pozycji. */
  prices?: number[];
  /** Kiedy ostatnio handlowano (ms) - "goracy" token skacze w Trending. */
  lastTradeAt?: number;
  /** Nowy `seq` restartuje animacje blysku; pola nie trzeba czyscic. */
  flash?: { tone: 'buy' | 'sell'; seq: number };
  /**
   * Zarobki NALICZONE tworcy z tego jednego tokena (wei). Ta sama liczba,
   * ktora Top earnings sumuje per tworca - tu trzymana per token, zeby sekcja
   * "My tokens" nie musiala liczyc niczego od nowa.
   */
  creatorAccruedWei?: bigint;
  /**
   * ===================================================================
   * LICZBA POD SLOWEM MUSI BYC TA, KTORA TO SLOWO NAZYWA
   * ===================================================================
   * `holders` z `LaunchpadToken` bylo do 10 wrzesnia 2026 liczba KONT
   * HANDLUJACYCH NA KRZYWEJ, wystawiona pod nazwa posiadaczy. Rozdzielamy to
   * na dwa pola o dwoch roznych nazwach, bo to sa dwie rozne wielkosci:
   *
   *   `traders`     - ile kont handlowalo na krzywej (to, co bylo);
   *   `holderCount` - ile adresow ma DZIS dodatnie saldo (to, co obiecywalismy).
   *
   * `holderCount === null` znaczy "jeszcze nie policzone" i wtedy karta ma
   * pokazac `traders` POD SLOWEM "traders" - nigdy jednej liczby pod druga
   * nazwa. Pole `holders` z typu bazowego zostaje jako to, co idzie na ekran.
   */
  traders?: number;
  holderCount?: number | null;
  /**
   * Wolumen puli po graduacji (ETH), suma `|amount0|` swapow. `null` = zakres
   * jeszcze niepoliczony, wiec karta mowi "curve vol", a nie "vol".
   */
  poolVolume?: number | null;
  /** Cena z `slot0` puli (ETH za token). Po graduacji to JEDYNA zywa cena. */
  poolPrice?: number;
  /** Kapitalizacja w ETH: cena puli razy calkowita podaz. */
  marketCapEth?: number;
};

/**
 * Wiersz tablicy "Top earnings". Kwota w wei (bigint), bo to suma surowych
 * pol eventow - na number przechodzimy dopiero przy formatowaniu, zeby nie
 * gubic precyzji po drodze.
 */
type CreatorEarnings = {
  creator: Address;
  totalWei: bigint;
  tokenCount: number;
  graduated: boolean;
};

type TokenDetails = {
  decimals: number;
  balance: bigint;
  allowance: bigint;
  spotPrice: bigint;
  launchClaimable: bigint;
  hookEthClaimable: bigint;
  hookTokenClaimable: bigint;
  vaultEthClaimable: bigint;
  vaultTokenClaimable: bigint;
  pendingEth: bigint;
  pendingToken: bigint;
  seeded: boolean;
  poolId: `0x${string}`;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
};

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function curvePercent(token: LaunchpadToken) {
  return Math.min(100, Math.round((token.raised / token.target) * 100));
}

/**
 * Kwota z jednostka. `symbol` podaje sie JAWNIE wszedzie, co renderuje sie
 * w SSR - bo `NATIVE_SYMBOL` jest policzony przy imporcie i na kliencie jest
 * juz inny niz na serwerze. Domysl zostaje dla miejsc, ktore i tak pojawiaja
 * sie dopiero po zaladowaniu danych, czyli po montazu.
 */
function formatEth(value: number, symbol: string = NATIVE_SYMBOL) {
  return `${value.toFixed(value >= 1 ? 2 : 3)} ${symbol}`;
}

/**
 * Dopisek USD obok kwoty ETH. ETH jest zawsze wartoscia glowna, USD tylko
 * echem - dlatego null (brak kursu albo zero) znaczy "nic nie dopisuj",
 * a nie "$0.00", ktore wygladaloby jak prawdziwa wycena.
 */
function usdNote(eth: number, ethUsd: number | null): string | null {
  if (ethUsd === null || !Number.isFinite(eth) || eth <= 0) return null;
  return formatUsd(eth * ethUsd);
}

/**
 * Wirtualna rezerwa krzywej AKTYWNEJ sieci. Cena spot po transakcji to
 * (R_VIRT + ethReserve) / tokenReserve, i DOKLADNIE te rezerwy niesie kazdy
 * event `Bought`/`Sold`, wiec historia cen nie wymaga ani jednego dodatkowego
 * odczytu.
 *
 * Stalo tu `0.75` - prawda kazdego wdrozenia az do 2026-08-14, gdy skala stala
 * sie argumentem konstruktora. Na Arc (R_VIRT = 250) ta stala zanizala kazda
 * cene i kazda kapitalizacje o ponad dwiescie jednostek wirtualnej rezerwy.
 */
function spotPriceFromReserves(ethReserveAfter: bigint, tokenReserveAfter: bigint): number {
  const tokens = Number(formatEther(tokenReserveAfter));
  if (tokens <= 0) return 0;
  return (R_VIRT_NATIVE + Number(formatEther(ethReserveAfter))) / tokens;
}

/**
 * ZNAK GRADUACJI.
 *
 * Token po graduacji to jedyny token na tablicy, ktoremu sie UDALO: krzywa
 * zebrala cala kwote, plynnosc poszla do puli, a pozycja LP zostaje tam na
 * zawsze. Wczesniej roznil sie od reszty jedna szara pastylka i przez to
 * wygladal jak kazdy inny wiersz.
 *
 * Znak siedzi na GLIFIE, a nie w wierszu, bo glif jest jedynym elementem
 * rysowanym we wszystkich trzech ukladach (lista, karta, panel) - jedna zmiana
 * i graduacja widac wszedzie tak samo.
 */
function TokenGlyph({ token, large = false }: { token: LaunchpadToken; large?: boolean }) {
  const graduated = token.state === 'Graduated';
  const glyph = (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[16px] font-soft-display font-extrabold text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)] ${large ? 'h-16 w-16 text-[22px]' : 'h-11 w-11 text-[14px]'} ${graduated ? 'ring-2 ring-sp-up' : ''}`}
      style={{ backgroundColor: token.accent }}
    >
      {token.logoUrl ? (
        // Logo pochodzi od obcego tworcy, wiec traktujemy je jak tresc
        // niezaufana: `metadata.ts` przepuszcza wylacznie https oraz ipfs,
        // a gdy obrazek nie wstanie, zostaje inicjal - nigdy pusta dziura.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={token.logoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : (
        <>
          <span className="relative z-10">{token.symbol.slice(0, 2)}</span>
          {/* Te dwa kolka leza NA kolorze tokena, ktory jest jego tozsamoscia i
              nie zmienia sie z motywem sieci. Wiec i one nie moga: biel i czern
              sa tu swiatlem i cieniem na tej samej powierzchni, a nie tlem
              interfejsu. Podmiana na zmienne motywu zgasilaby glif na czarnym. */}
          <span aria-hidden="true" className="absolute -right-2 -top-3 h-8 w-8 rounded-full bg-white/25" />
          <span aria-hidden="true" className="absolute -bottom-3 -left-2 h-8 w-8 rounded-full bg-black/10" />
        </>
      )}
    </div>
  );

  if (!graduated) return glyph;

  return (
    <div className={`relative shrink-0 ${large ? 'h-16 w-16' : 'h-11 w-11'}`}>
      {glyph}
      <span
        aria-hidden="true"
        className={`absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-sp-up text-white shadow-[0_2px_6px_rgba(0,0,0,0.18)] ${large ? 'h-6 w-6' : 'h-5 w-5'}`}
      >
        <GraduationCap className={large ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
      </span>
    </div>
  );
}

function StatePill({ state }: { state: LaunchpadToken['state'] }) {
  const meta = {
    Curve: { label: 'Curve', className: 'bg-sp-brand-soft text-sp-brand-deep' },
    Locked: { label: 'Locked', className: 'bg-sp-brand-soft text-sp-brand-deep' },
    Graduated: { label: 'Graduated', className: 'bg-sp-up-soft text-sp-up' },
  }[state];
  return (
    <span title={STATE_HINT[state]} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${meta.className}`}>
      {state === 'Graduated' && <GraduationCap className="h-3 w-3" aria-hidden="true" />}
      {meta.label}
    </span>
  );
}

function SamplePill() {
  return <span className="rounded-full bg-sp-shade/8 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/50">Sample</span>;
}

/**
 * Mini-wykres z PRAWDZIWYCH cen po kolejnych transakcjach tokena. Gdy danych
 * jest mniej niz dwie, nie rysujemy nic - zmyslony pasek wygladalby jak rynek,
 * ktorego nie ma.
 */
function Sparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min;
  const up = prices[prices.length - 1] >= prices[0];
  const points = prices
    .map((price, index) => {
      const x = (index / (prices.length - 1)) * 60;
      const y = range === 0 ? 14 : 26 - ((price - min) / range) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 60 28" className="h-7 w-16 shrink-0" aria-hidden="true">
      {/* Kolor klasa, nie atrybutem: `stroke="#18bd64"` nie zna motywu sieci,
          a regula CSS z Tailwinda bije atrybut prezentacyjny. */}
      <polyline points={points} fill="none" className={up ? 'stroke-sp-up-vivid' : 'stroke-sp-down'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Blysk po transakcji - nakladka z wlasnym `key`, zeby nowy seq restartowal animacje. */
function TradeFlash({ flash, rounded }: { flash: BoardToken['flash']; rounded: string }) {
  if (!flash) return null;
  return (
    <span
      key={flash.seq}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-10 ${rounded} ${flash.tone === 'buy' ? 'lp-flash-buy' : 'lp-flash-sell'}`}
    />
  );
}

function curveStatusLabel(token: LaunchpadToken) {
  if (token.state === 'Graduated') return { text: 'Graduated to pool', className: 'text-sp-up' };
  if (token.state === 'Locked') return { text: 'Awaiting graduation', className: 'text-sp-brand-deep' };
  const toGo = Math.max(0, token.target - token.raised);
  return { text: `${toGo.toFixed(2)} ${NATIVE_SYMBOL} to graduation`, className: 'text-sp-down' };
}

/** Czy wiersz boardu to token pada. Adres, nie symbol - symbol moze podrobic kazdy launch. */
function isSphereRow(token: { address?: string | null }): boolean {
  return Boolean(SPHERE_TOKEN_ADDRESS && token.address && token.address.toLowerCase() === SPHERE_TOKEN_ADDRESS.toLowerCase());
}

/**
 * Plakietka tokena pada. Widoczna przy symbolu na karcie i w tabeli - razem
 * z przypieciem na gorze listy to jedyne wyroznienie, jakie SPHERE dostaje;
 * dane rynkowe liczone sa identycznie jak dla kazdego innego tokena.
 */
/** Znaczek wersji wdrozenia - tylko od v2; tokeny z pierwszego wdrozenia nie maja zadnego. */
function VersionPill({ version }: { version?: number }) {
  if (!version || version < 2) return null;
  return (
    <span className="rounded-full bg-sp-shade/8 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-sp-shade/55">
      v{version}
    </span>
  );
}

function SpherePill() {
  return (
    <span className="rounded-full bg-sp-brand/10 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.08em] text-sp-brand">
      ✦ pad token
    </span>
  );
}

/**
 * Kafel rynku. Uklad kart jest tu ZAMIAST gestej tabeli, ktora ma dzis kazdy
 * launchpad - ta sama informacja, ale czytana wzrokiem, a nie skanowana
 * kolumnami. Tabela zostaje jako druga zakladka dla kogos, kto porownuje
 * dziesiatki pozycji naraz.
 */
function LaunchCard({
  token,
  animationsOn,
  ethUsd,
  onTrade,
  onOpen,
}: {
  token: BoardToken;
  animationsOn: boolean;
  ethUsd: number | null;
  onTrade: () => void;
  /** Klik w nazwe/symbol = strona tokena. Nie ma juz samego "zaznaczenia". */
  onOpen: () => void;
}) {
  const progress = curvePercent(token);
  const status = curveStatusLabel(token);
  const sample = !token.live;
  const raisedNote = usdNote(token.raised, ethUsd);
  const vol = volumeParts(token);
  const volNote = usdNote(vol.eth, ethUsd);
  const header = (
    <>
      <TokenGlyph token={token} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-extrabold text-sp-ink">{token.symbol}</span>
          <VersionPill version={token.version} />
          {isSphereRow(token) && <SpherePill />}
          <StatePill state={token.state} />
          {sample && <SamplePill />}
        </span>
        <span className="mt-1 block truncate text-[12px] text-sp-shade/50">{token.name}</span>
      </span>
    </>
  );
  return (
    <div className="relative flex flex-col rounded-[18px] border border-sp-shade/10 bg-sp-surface p-4 transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
      {animationsOn && <TradeFlash flash={token.flash} rounded="rounded-[18px]" />}
      {/* Udostepnianie siedzi NAD blyskiem transakcji (z-20 wobec z-10), inaczej
          nakladka animacji przechwytywalaby klikniecie tuz po czyimś kupnie -
          czyli dokladnie w chwili, w ktorej ktos chce sie tym pochwalic.
          `pr-9` w naglowku robi mu miejsce, zeby dlugi symbol z plakietka stanu
          nie wjezdzal pod przycisk. */}
      {!sample && token.address && (
        <ShareToken
          className="absolute right-3 top-3 z-20"
          address={token.address}
          chainId={LAUNCHPAD_CHAIN.id}
          symbol={token.symbol}
          raised={token.raised}
          target={token.target}
          state={token.state}
          priceEth={token.lastPrice}
        />
      )}
      {/* Wiersz podgladowy jest proba ukladu, nie rynkiem - nic na nim nie klika. */}
      {sample || !token.address ? (
        <div className="flex min-w-0 items-start gap-3 pr-10">{header}</div>
      ) : (
        <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-3 pr-10 text-left">{header}</button>
      )}

      <div className="mt-4">
        {/* flex-wrap zamiast truncate: przy duzych sumach "0.462 ETH · $865.01"
            i `2.54 ${NATIVE_SYMBOL} to graduation` nie walcza o jedna linie - status schodzi
            nizej, a cena i USD pokazuja sie w calosci (koniec z "$865..."). */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[17px] font-extrabold text-sp-ink">{formatEth(token.raised)}{raisedNote && <span className="text-[11px] font-bold text-sp-shade/40"> · {raisedNote}</span>}</span>
          <span className={`ml-auto shrink-0 text-[11px] font-extrabold ${status.className}`}>{status.text}</span>
        </div>
        {/* Po graduacji liczba wyzej to ZBIORKA, ktora sie domknela - stala
            historyczna, nie kurs. Kapitalizacja z ceny puli jest tym, czego tu
            szuka wzrok, wiec stoi osobno i pod wlasna nazwa. */}
        {token.marketCapEth != null && (
          <div className="mt-1 text-[11px] text-sp-shade/45">
            <span className="font-bold text-sp-ink">{formatEth(token.marketCapEth)}</span>
            {usdNote(token.marketCapEth, ethUsd) ? ` (${usdNote(token.marketCapEth, ethUsd)})` : ''} market cap
          </div>
        )}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sp-shade/8">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, backgroundColor: token.accent }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-sp-shade/45">
          <span className="min-w-0 truncate">{formatEth(vol.eth)}{volNote ? ` (${volNote})` : ''} {vol.label} · {peopleNote(token)} · {token.age}</span>
          <Sparkline prices={token.prices ?? []} />
        </div>
      </div>

      {!sample && (
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onTrade} className="flex-1 rounded-full bg-soft-primary px-3 py-2 text-[12px] font-extrabold text-sp-on-brand">Trade</button>
          {/* Bez adresu "Details" prowadziloby na /startpad/undefined. */}
          {token.address && <button type="button" onClick={onOpen} className="rounded-full border border-sp-shade/15 bg-sp-surface px-3 py-2 text-[12px] font-extrabold text-sp-ink hover:border-soft-primary">Details</button>}
        </div>
      )}
    </div>
  );
}

/**
 * Krol wzgorza: zywy token na krzywej z najwyzsza rezerwa, czyli najblizszy
 * graduacji. Jedna wyrozniona karta zamiast rownorzednej siatki - lider ma byc
 * widoczny od progu, jak na kazdym wspolczesnym launchpadzie.
 */
/**
 * PASEK PROMOCYJNY W NAGLOWKU - miejsce, ktore docelowo bedzie sponsorowane.
 *
 * ===========================================================================
 * DLACZEGO STOI TU KING OF THE HILL, A NIE PUSTE MIEJSCE NA REKLAME
 * ===========================================================================
 * Puste miejsce reklamowe uczy oko, ze w tym pasie nie ma nic ciekawego -
 * i kiedy w koncu wejdzie tam platny wpis, nikt go juz nie zobaczy. Slot,
 * ktory od pierwszego dnia pokazuje NAJMOCNIEJSZY token rynku, buduje sobie
 * uwage, ktora sponsor pozniej przejmie.
 *
 * Wejscie sponsora nie wymaga ruszania tablicy: wystarczy podac tu inne
 * `label` i `href`. Dlatego to jest osobny komponent, a nie wstawka w naglowku.
 *
 * ===========================================================================
 * DLACZEGO NIE MIGA
 * ===========================================================================
 * Pas reklamowy, ktory pulsuje przy kazdym ekranie, po minucie staje sie
 * szumem omijanym wzrokiem - a przy `prefers-reduced-motion` ruszac sie po
 * prostu nie moze. Wyroznia go wiec kolor i obwodka marki, a rusza sie jedynie
 * kropka "na zywo", i tylko gdy uzytkownik na ruch pozwala.
 */
function BoardPromo({ token, onOpen }: { token: BoardToken | null; onOpen: () => void }) {
  if (!token) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`King of the hill: ${token.symbol}. Open the coin.`}
      className="group hidden min-w-0 shrink items-center gap-2.5 rounded-full border border-soft-primary/30 bg-gradient-to-r from-soft-primary/[0.14] via-soft-primary/[0.06] to-transparent px-3.5 py-2 text-left transition-[border-color,transform] [transition-duration:var(--dur-press)] ease-out-strong hover:border-soft-primary active:scale-[0.98] lg:inline-flex"
    >
      <Crown className="h-3.5 w-3.5 shrink-0 text-soft-primary-deep" aria-hidden="true" />
      <span className="shrink-0 text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-soft-primary-deep">
        King of the hill
      </span>
      <span aria-hidden="true" className="h-3 w-px shrink-0 bg-soft-primary/25" />
      {/* Wlasny, maly znaczek zamiast `TokenGlyph`: tamten ma 44 px i rozsadzilby
          pasek wysoki na 36. */}
      {token.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={token.logoUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-5 w-5 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8px] font-extrabold text-white"
          style={{ background: token.accent }}
        >
          {token.symbol.slice(0, 2)}
        </span>
      )}
      <span className="min-w-0 truncate text-[12.5px] font-extrabold text-sp-ink">{token.symbol}</span>
      <span className="shrink-0 text-[12px] font-bold tabular-nums text-sp-shade/55">
        {/* `formatEth` dokleja juz jednostke sieci - drugie "ETH" dawalo
            "0.069 ETH ETH", a na Arc doklejaloby eter do cudzej waluty. */}
        {formatEth(token.raised)}
      </span>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-soft-primary motion-safe:animate-pulse"
      />
    </button>
  );
}

function KingOfTheHill({ token, ethUsd, onTrade, onDetails }: { token: BoardToken; ethUsd: number | null; onTrade: () => void; onDetails: () => void }) {
  const progress = curvePercent(token);
  const toGo = Math.max(0, token.target - token.raised);
  const raisedNote = usdNote(token.raised, ethUsd);
  const vol = volumeParts(token);
  const volNote = usdNote(vol.eth, ethUsd);
  return (
    <section className="relative mt-5 overflow-hidden rounded-[20px] border border-soft-primary/30 bg-sp-surface p-4 sm:p-5" aria-label="King of the hill">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-soft-primary/[0.08] blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TokenGlyph token={token} large />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-soft-primary-deep">
              <Crown className="h-3.5 w-3.5" aria-hidden="true" /> King of the hill
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[17px] font-extrabold text-sp-ink">{token.symbol}</span>
              <VersionPill version={token.version} />
              <StatePill state={token.state} />
            </div>
            <p className="mt-0.5 truncate text-[12px] text-sp-shade/50">{token.name} · {peopleNote(token)} · {formatEth(vol.eth)}{volNote ? ` (${volNote})` : ''} {vol.label} · {token.age}</p>
          </div>
        </div>
        <div className="w-full sm:w-[240px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[15px] font-extrabold text-sp-ink">{formatEth(token.raised)}{raisedNote && <span className="text-[11px] font-bold text-sp-shade/45"> · {raisedNote}</span>}</span>
            <span className="text-[11px] font-extrabold text-sp-down">{toGo.toFixed(2)} {NATIVE_SYMBOL} to go</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sp-shade/8">
            <div className="h-full rounded-full bg-soft-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onTrade} className="rounded-full bg-soft-primary px-4 py-2.5 text-[12px] font-extrabold text-sp-on-brand">Trade</button>
          {token.address && <button type="button" onClick={onDetails} className="rounded-full border border-sp-shade/15 bg-sp-surface px-4 py-2.5 text-[12px] font-extrabold text-sp-ink hover:border-soft-primary">Details</button>}
        </div>
      </div>
    </section>
  );
}

type ActivityItem = {
  id: string;
  /** Adres tokena - klucz do doklejenia logo i symbolu z tablicy rynku. */
  address?: string;
  symbol: string;
  accent: string;
  label: string;
  /**
   * Kwota zdarzenia w ETH. Pasek formatuje ja PRZY RENDERZE, bo kurs ETH/USD
   * dochodzi asynchronicznie - gdyby napis powstawal przy skanie, pierwszy
   * przebieg zapisalby na stale kwoty w ETH, mimo ze kurs zaraz bedzie znany.
   */
  eth?: number;
  tone: 'launch' | 'buy' | 'sell' | 'graduate';
  logoUrl?: string;
  /**
   * Transakcja PODPISANA, ale jeszcze niewykopana.
   *
   * Wlasne kupno pojawialo sie na tasmie dopiero razem z cudzymi - po paragonie
   * i po tym, jak subskrypcja zobaczyla zdarzenie. Miedzy podpisem a blokiem
   * pasek nie wiedzial o niej nic, choc to jedyna transakcja, o ktorej wiemy
   * NA PEWNO. Wiersz w tym stanie jest przygaszony i znika, gdy przychodzi
   * prawdziwe zdarzenie z tego samego hasza.
   */
  pending?: boolean;
  /** Hasz wlasnej transakcji - po nim rozpoznajemy jej zdarzenie. */
  txHash?: string;
  /**
   * Skad wziety. `pool` = swap w puli v4, czyli wiersz, ktorego skan tablicy
   * NIE UMIE odtworzyc (skanuje launchpad, a ten milczy po graduacji).
   * `loadBoard` podmienia cala tasme na wynik skanu, wiec bez tego znacznika
   * kazde odswiezenie kasowalo swiezo zlapane transakcje z puli - pojawialy
   * sie na chwile i znikaly.
   */
  source?: 'pool';
};

/**
 * Ciemniejszy odcien akcentu do gradientu glifu. Akcenty sa zawsze zapisem
 * #rrggbb (patrz ACCENTS), wiec proste skalowanie kanalow wystarcza - a przy
 * nietypowym wejsciu oddajemy kolor bez zmian zamiast produkowac smieci.
 */
function darkenAccent(hex: string, factor = 0.55): string {
  const raw = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return hex;
  const channel = (offset: number) =>
    Math.round(parseInt(raw.slice(offset, offset + 2), 16) * factor)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

const FEED_TONE_DOT: Record<ActivityItem['tone'], string> = {
  buy: 'rgb(var(--sp-up-vivid))',
  sell: 'rgb(var(--sp-down))',
  launch: 'rgb(var(--sp-brand))',
  graduate: 'rgb(var(--sp-up))',
};

/**
 * Glif tasmy zdarzen: logo tokena, gdy je znamy, inaczej kolko z gradientem
 * akcentu i inicjalem symbolu. Kierunek buy/sell siedzi w malej kropce na
 * rogu - kolor glifu nalezy do TOKENA, nie do kierunku transakcji.
 */
function FeedGlyph({ item }: { item: ActivityItem }) {
  return (
    <span className="relative h-7 w-7 shrink-0" aria-hidden="true">
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[9px] font-extrabold text-white ring-1 ring-sp-shade/10"
        style={{ background: `linear-gradient(135deg, ${item.accent}, ${darkenAccent(item.accent)})` }}
      >
        {item.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.logoUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
        ) : (
          // Symbol z zywego feedu bywa skroconym adresem - inicjal "0" nic by
          // nie mowil, wiec przedrostek 0x schodzi przed wyborem litery.
          item.symbol.replace(/^0x/i, '').slice(0, 1).toUpperCase()
        )}
      </span>
      <span
        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
        style={{ backgroundColor: FEED_TONE_DOT[item.tone] }}
      />
    </span>
  );
}


function ActivityTicker({ events }: { events: ActivityItem[] }) {
  // NIE marquee: pasek STOI z ostatnimi 20 zdarzeniami. Ruch pojawia sie tylko
  // gdy dochodzi nowe zdarzenie - swiezy wpis (nowy key) wjezdza z lewej
  // (`lp-ticker-in`), a istniejace chipy zostaja (ten sam key = brak reanimacji).
  // overflow-x-auto: gdy sie nie miesci, mozna przewinac recznie.
  const items = events.slice(0, 20);
  const messages = useTradeMessages(items.map((event) => txHashFromFeedId(event.id)));
  return (
    <div className="-mx-4 overflow-x-auto border-b border-sp-shade/10 bg-sp-surface sm:-mx-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Live Startpad events">
      <div className="flex min-h-[38px] w-max items-center gap-1.5 px-2 py-1.5">
        {items.length ? items.map((event) => (
          // Wiersz „pending" to TWOJA podpisana transakcja przed blokiem:
          // przerywana obwodka i pulsowanie mowia, ze jeszcze nie wyladowala,
          // zamiast udawac zdarzenie, ktorego lancuch jeszcze nie potwierdzil.
          <div
            key={event.id}
            className={`lp-ticker-in flex shrink-0 items-center gap-1.5 rounded-full border bg-sp-surface px-2 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.05)] ${event.pending ? 'animate-pulse border-dashed border-sp-brand/40' : 'border-sp-shade/10'}`}
          >
            <FeedGlyph item={event} />
            <span className="pr-1 text-left leading-tight">
              <span className="block text-[10px] font-bold text-sp-ink">{event.symbol}</span>
              <span className={`block text-[9px] font-bold ${event.tone === 'sell' ? 'text-sp-down-deep' : event.tone === 'buy' ? 'text-sp-up' : event.tone === 'graduate' ? 'text-sp-up' : 'text-sp-brand-deep'}`}>
                {event.pending ? `${event.label} · pending` : event.label}
              </span>
              {(() => {
                const hash = txHashFromFeedId(event.id);
                const text = hash ? messages.get(hash) : undefined;
                return text ? (
                  <span className="block max-w-[180px] truncate text-[9.5px] font-semibold italic text-sp-shade/60" title={displayTradeMessage(text)}>
                    “{displayTradeMessage(text)}”
                  </span>
                ) : null;
              })()}
            </span>
          </div>
        )) : <span className="px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/35">Listening for live Startpad events...</span>}
      </div>
    </div>
  );
}

/**
 * Jedna zwarta karta zamiast dwoch duzych kafli - te same liczby, mniej
 * pikseli. Zadna informacja z poprzedniego naglowka nie znika.
 */
function BoardStats({ totalRaised, totalVolume, totalTrades, liveCount, ethUsd, symbol }: { totalRaised: number; totalVolume: number; totalTrades: number; liveCount: number; ethUsd: number | null; symbol: string }) {
  const rows = [
    { icon: <CircleDollarSign className="h-4 w-4 text-sp-brand-strong" aria-hidden="true" />, label: 'Curve reserve', value: formatEth(totalRaised, symbol), sub: usdNote(totalRaised, ethUsd) },
    { icon: <TrendingUp className="h-4 w-4 text-sp-info" aria-hidden="true" />, label: 'Indexed volume', value: formatEth(totalVolume, symbol), sub: usdNote(totalVolume, ethUsd) },
    { icon: <BarChart3 className="h-4 w-4 text-sp-up-vivid" aria-hidden="true" />, label: 'Trades', value: totalTrades.toLocaleString('en-US'), sub: null },
    { icon: <Zap className="h-4 w-4 text-soft-primary" aria-hidden="true" />, label: 'Active curves', value: String(liveCount), sub: null },
  ];
  return (
    <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-sp-ink">Board stats</h2>
        <NetworkTag />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl bg-sp-sunken p-3">
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-sp-shade/40">{row.icon}{row.label}</span>
            <span className="mt-1.5 block truncate font-soft-display text-[18px] font-extrabold leading-none text-sp-ink">{row.value}</span>
            {row.sub && <span className="mt-1 block truncate text-[10.5px] font-bold text-sp-shade/40">{row.sub}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function TopLaunches({ tokens, onOpen, sample }: { tokens: BoardToken[]; onOpen: (token: BoardToken) => void; sample: boolean }) {
  const top = [...tokens].sort((a, b) => b.raised - a.raised).slice(0, 3);
  return (
    <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-sp-ink">Top launches</h2>
        <TrendingUp className="h-4 w-4 text-sp-brand" aria-hidden="true" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {top.map((token) => {
          const body = (
            <>
              <span className="mx-auto block w-fit transition-transform group-hover:-translate-y-1"><TokenGlyph token={token} large /></span>
              <span className="mt-2 block truncate text-[12px] font-extrabold text-sp-ink">{token.symbol}</span>
              <span className="mt-1 block truncate text-[11px] text-sp-shade/50">{formatEth(token.raised)}</span>
            </>
          );
          // Wiersze przykladowe nie maja adresu - nie ma dokad nawigowac.
          return token.address ? (
            <button key={token.id} type="button" onClick={() => onOpen(token)} className="group min-w-0 text-center">{body}</button>
          ) : (
            <div key={token.id} className="min-w-0 text-center">{body}</div>
          );
        })}
      </div>
      {sample && (
        <p className="mt-3 border-t border-sp-shade/10 pt-3 text-[11px] text-sp-shade/40">
          Sample rows - they disappear with the first real launch.
        </p>
      )}
    </section>
  );
}

function VolumePanel({ tokens, onOpen, sample }: { tokens: BoardToken[]; onOpen: (token: BoardToken) => void; sample: boolean }) {
  const top = [...tokens].sort((a, b) => volumeParts(b).eth - volumeParts(a).eth).slice(0, 3);
  const rowClass = 'grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 py-2 text-left';
  return (
    <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-sp-ink">Top volume</h2>
        <BarChart3 className="h-4 w-4 text-sp-info" aria-hidden="true" />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40">
        <span>Coin</span><span>Volume</span><span>Trades</span>
      </div>
      <div className="mt-2 divide-y divide-sp-shade/10">
        {top.map((token) => {
          const cells = (
            <>
              <span className="flex min-w-0 items-center gap-2"><TokenGlyph token={token} /><span className="truncate text-[12px] font-extrabold text-sp-ink">{token.symbol}</span></span>
              <span className="text-[12px] font-bold text-sp-ink">{formatEth(volumeParts(token).eth)}</span>
              <span className="text-[12px] font-bold text-sp-shade/60">{token.trades ?? 0}</span>
            </>
          );
          // Wiersze przykladowe nie maja adresu - nie ma dokad nawigowac.
          return token.address ? (
            <button key={token.id} type="button" onClick={() => onOpen(token)} className={rowClass}>{cells}</button>
          ) : (
            <div key={token.id} className={rowClass}>{cells}</div>
          );
        })}
      </div>
      {sample && (
        <p className="mt-3 border-t border-sp-shade/10 pt-3 text-[11px] text-sp-shade/40">
          Sample rows - they disappear with the first real launch.
        </p>
      )}
    </section>
  );
}

/**
 * Tablica tworcow wg DOKLADNEGO salda do odebrania z lancucha: claimable()
 * launchpada (udzial w oplacie krzywej) + hook.claimableEth (ethToCreator po
 * graduacji) + vault.claimableEth - suma per adres, ta sama liczba co przycisk
 * Claim. Nie liczymy z eventow, bo skan siega tylko okno wstecz i zanizal.
 * "Claimable now": po odebraniu saldo spada, wiec podpis nie obiecuje sumy-zawsze.
 */
function TopEarnings({ rows, ethUsd }: { rows: CreatorEarnings[]; ethUsd: number | null }) {
  const explorer = LAUNCHPAD_CHAIN.blockExplorers?.default?.url ?? 'https://sepolia.basescan.org';
  return (
    <section className="rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-sp-ink">Top earnings</h2>
        <Crown className="h-4 w-4 text-[#d99a1b]" aria-hidden="true" />
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sp-shade/40">Creator-side fees claimable on-chain now - curve + pool + vault, protocol share excluded</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-[11.5px] leading-[1.5] text-sp-shade/45">
          No creator fees indexed yet. Every curve trade and pool swap accrues a creator share that shows up here.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-sp-shade/5">
          {rows.map((row, index) => {
            const eth = Number(formatEther(row.totalWei));
            const note = usdNote(eth, ethUsd);
            const first = index === 0;
            return (
              <div key={row.creator} className={`flex items-center gap-2.5 py-2 ${first ? '-mx-2 rounded-xl bg-sp-down-soft px-2' : ''}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${first ? 'bg-sp-down-line text-sp-down-deep' : 'bg-sp-shade/5 text-sp-shade/50'}`}>
                  {first ? <Crown className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <a
                    href={`${explorer}/address/${row.creator}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-extrabold text-sp-ink hover:text-soft-primary-deep"
                  >
                    {shortAddress(row.creator)}
                    <ExternalLink className="h-3 w-3 text-sp-shade/30" aria-hidden="true" />
                  </a>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-sp-shade/45">
                    <span>{row.tokenCount} {row.tokenCount === 1 ? 'token' : 'tokens'}</span>
                    {row.graduated && <span className="rounded-full bg-sp-up-soft px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.05em] text-sp-up">Graduated</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] font-extrabold text-sp-ink">{eth.toFixed(4)} {NATIVE_SYMBOL}</span>
                  {note && <span className="block text-[10.5px] font-bold text-sp-shade/40">{note}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 border-t border-sp-shade/5 pt-2.5 text-[10.5px] leading-[1.5] text-sp-shade/40">
        Curve fees split per each token&apos;s own config; pool fees settle through the hook. Auto-buybacks come out of the creator&apos;s share only.
      </p>
    </section>
  );
}

/** Salda do wyplaty podlaczonego portfela - trzy zrodla, kazde per KONTO. */
/**
 * Sumy po WSZYSTKICH wdrozeniach sieci (stare tez trzyma nieodebrane saldo) +
 * lista niezerowych zrodel do wyplaty - jedno na kontrakt.
 */
type ClaimSource = { address: Address; kind: 'launch' | 'hook' | 'vault' };
type MyClaimable = { launch: bigint; hookEth: bigint; vaultEth: bigint; sources?: ClaimSource[] };

/**
 * Portfel tworcy: tokeny wystartowane z podlaczonego adresu. Zarobki sa per
 * token (naliczenia z loadBoard, te same co w Top earnings), ale wyplata jest
 * per KONTO - launchpad, hook i vault prowadza jedno saldo ETH na adres -
 * dlatego Claim stoi w naglowku sekcji, a nie przy wierszach.
 */
function MyTokensPanel({
  tokens,
  claimable,
  claimBusy,
  ethUsd,
  onClaim,
  onOpen,
  onLaunch,
}: {
  tokens: BoardToken[];
  claimable: MyClaimable | null;
  claimBusy: boolean;
  ethUsd: number | null;
  onClaim: () => void;
  onOpen: (token: BoardToken) => void;
  onLaunch: () => void;
}) {
  const totalClaimable = claimable ? claimable.launch + claimable.hookEth + claimable.vaultEth : 0n;
  const claimEth = Number(formatEther(totalClaimable));
  const claimNote = usdNote(claimEth, ethUsd);
  return (
    <section className="mt-5 rounded-[20px] border border-sp-shade/10 bg-sp-surface p-5" aria-label="My tokens">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-sp-ink">
            <WalletCards className="h-4 w-4 text-soft-primary" aria-hidden="true" /> My tokens
          </h2>
          <p className="mt-1 text-[11px] text-sp-shade/45">Launches created by your connected wallet · earnings accrue on-chain</p>
        </div>
        {totalClaimable > 0n && (
          <span className="flex items-center gap-2.5 rounded-full bg-sp-up-soft py-1.5 pl-3.5 pr-1.5">
            <span className="text-[12px] font-extrabold text-sp-up">
              {claimEth.toFixed(4)} {NATIVE_SYMBOL} claimable{claimNote && <span className="font-bold text-sp-up/70"> · {claimNote}</span>}
            </span>
            <button
              type="button"
              disabled={claimBusy}
              onClick={onClaim}
              className="rounded-full bg-sp-up px-3.5 py-1.5 text-[11px] font-extrabold text-sp-on-brand disabled:opacity-60"
            >
              {claimBusy ? 'Claiming...' : 'Claim'}
            </button>
          </span>
        )}
      </div>
      {tokens.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-sp-sunken px-4 py-8 text-center">
          <p className="text-[13px] font-bold text-sp-shade/50">You have not launched anything yet</p>
          <button type="button" onClick={onLaunch} className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[12px] font-extrabold text-sp-on-brand">
            <Plus className="h-4 w-4" aria-hidden="true" /> Launch
          </button>
        </div>
      ) : (
        <div className="mt-2 divide-y divide-sp-shade/5">
          {tokens.map((token) => {
            const progress = curvePercent(token);
            const earnedEth = Number(formatEther(token.creatorAccruedWei ?? 0n));
            const earnedNote = usdNote(earnedEth, ethUsd);
            return (
              <div key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:flex-nowrap">
                <button type="button" onClick={() => onOpen(token)} className="flex min-w-0 flex-1 basis-[220px] items-center gap-3 text-left">
                  <TokenGlyph token={token} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-extrabold text-sp-ink">{token.symbol}</span>
                      <StatePill state={token.state} />
                      {/* Logo jako data-URL = zyje tylko w localStorage tego
                          urzadzenia, Blob go jeszcze nie przejal. Bez tej
                          plakietki tworca nie mial JAK zauwazyc, ze wszyscy
                          inni widza pusty glif. */}
                      {token.logoUrl?.startsWith('data:') && (
                        <span
                          className="rounded-full bg-sp-down-soft px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-sp-down-deep"
                          title="The logo has not reached the server yet. Sign in with your wallet and it will publish itself on your next visit."
                        >
                          Logo not public yet
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-sp-shade/50">{token.name}</span>
                  </span>
                </button>
                <div className="w-full shrink-0 sm:w-[170px]">
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="font-extrabold text-sp-ink">{formatEth(token.raised)}</span>
                    <span className="text-sp-shade/40">{progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sp-shade/8">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, backgroundColor: token.accent }} />
                  </div>
                </div>
                <div className="w-[92px] shrink-0">
                  <span className="block text-[12px] font-bold text-sp-ink">{formatEth(volumeParts(token).eth)}</span>
                  <span className="block text-[10px] text-sp-shade/40">volume</span>
                </div>
                <div className="w-[118px] shrink-0">
                  <span className="block text-[12px] font-extrabold text-sp-up">{earnedEth.toFixed(4)} {NATIVE_SYMBOL}</span>
                  <span className="block text-[10px] text-sp-shade/40">{earnedNote ? `${earnedNote} accrued` : 'accrued earnings'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(token)}
                  className="ml-auto shrink-0 rounded-full p-2 text-sp-shade/40 hover:bg-sp-brand-soft hover:text-sp-brand-deep"
                  aria-label={`Open ${token.symbol} page`}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LaunchTableRow({
  token,
  animationsOn,
  ethUsd,
  onTrade,
  onOpen,
}: {
  token: BoardToken;
  animationsOn: boolean;
  ethUsd: number | null;
  onTrade: () => void;
  /** Klik w nazwe/symbol = strona tokena. Nie ma juz samego "zaznaczenia". */
  onOpen: () => void;
}) {
  const status = curveStatusLabel(token);
  const sample = !token.live;
  const raisedNote = usdNote(token.raised, ethUsd);
  const vol = volumeParts(token);
  const volNote = usdNote(vol.eth, ethUsd);
  const coinCell = (
    <>
      <TokenGlyph token={token} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2"><span className="truncate text-[14px] font-extrabold text-sp-ink">{token.symbol}</span><VersionPill version={token.version} />{isSphereRow(token) && <SpherePill />}<StatePill state={token.state} />{sample && <SamplePill />}</span>
        <span className="mt-1 flex items-center gap-2 truncate text-[12px] text-sp-shade/50"><span>{token.name}</span><span aria-hidden="true">•</span><span>{token.age}</span></span>
      </span>
    </>
  );
  return (
    <div className="relative grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_0.9fr_0.8fr_1.1fr_0.8fr_auto] items-center gap-4 border-t border-sp-shade/10 px-4 py-3.5 text-left transition-colors hover:bg-sp-hover sm:px-5">
      {animationsOn && <TradeFlash flash={token.flash} rounded="rounded-none" />}
      {sample || !token.address ? (
        <div className="flex min-w-0 items-center gap-3">{coinCell}</div>
      ) : (
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left">{coinCell}</button>
      )}
      <div><span className="block text-[14px] font-extrabold text-sp-ink">{formatEth(token.raised)}{raisedNote && <span className="text-[11px] font-bold text-sp-shade/40"> · {raisedNote}</span>}</span><span className={`mt-1 block text-[11px] font-bold ${status.className}`}>{status.text}</span></div>
      <div><span className="block text-[14px] font-bold text-sp-ink">{formatEth(vol.eth)}{volNote && <span className="text-[11px] font-bold text-sp-shade/40"> · {volNote}</span>}</span><span className="mt-1 block text-[11px] text-sp-shade/45">{vol.label === 'vol' ? 'indexed volume' : 'curve volume'}</span></div>
      <div className="flex items-center gap-2"><Sparkline prices={token.prices ?? []} /><span className="text-[11px] font-bold text-sp-shade/45">{peopleNote(token)}</span></div>
      <div><span className="block text-[14px] font-bold text-sp-ink">{shortAddress(token.creator)}</span><span className="mt-1 block text-[11px] text-sp-shade/45">creator</span></div>
      {sample ? (
        <span />
      ) : (
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={onTrade} className="rounded-full border border-sp-shade/15 bg-sp-surface px-3.5 py-2 text-[12px] font-extrabold text-sp-ink shadow-sm transition-colors hover:border-sp-brand hover:text-sp-brand-deep">Trade</button>
          {token.address && (
            <ShareToken
              address={token.address}
              chainId={LAUNCHPAD_CHAIN.id}
              symbol={token.symbol}
              raised={token.raised}
              target={token.target}
              state={token.state}
              priceEth={token.lastPrice}
            />
          )}
          {token.address && <button type="button" onClick={onOpen} className="rounded-full p-2 text-sp-shade/40 hover:bg-sp-brand-soft hover:text-sp-brand-deep" aria-label={`Open ${token.symbol} details`}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></button>}
        </span>
      )}
    </div>
  );
}

function TradePanel({
  token,
  details,
  side,
  setSide,
  buyAmount,
  setBuyAmount,
  sellAmount,
  setSellAmount,
  sellQuote,
  gradReward,
  busy,
  ethUsd,
  onBuy,
  onSell,
  onGraduate,
  onSettle,
  onHarvest,
  onClaim,
  isConnected,
}: {
  token: LaunchpadToken;
  details: TokenDetails | null;
  side: TradeSide;
  setSide: (side: TradeSide) => void;
  buyAmount: string;
  setBuyAmount: (value: string) => void;
  sellAmount: string;
  setSellAmount: (value: string) => void;
  sellQuote: bigint | null;
  gradReward: bigint | null;
  busy: BusyAction | null;
  ethUsd: number | null;
  onBuy: () => void;
  onSell: () => void;
  onGraduate: () => void;
  onSettle: () => void;
  onHarvest: () => void;
  onClaim: (source: 'launch' | 'hookEth' | 'hookToken' | 'vaultEth' | 'vaultToken') => void;
  isConnected: boolean;
}) {
  const decimals = details?.decimals ?? 18;
  const balance = details ? formatUnits(details.balance, decimals) : '0';

  // Saldo ETH portfela do procentow i Max po stronie kupna. Zostawiamy trocheе
  // na gaz przy Max - inaczej Max = calosc i transakcja nie ma z czego zaplacic.
  const { address: walletAddress } = useAccount();
  const { data: ethBalance } = useBalance({ address: walletAddress, chainId: LAUNCHPAD_CHAIN.id });
  /**
   * Ile ETH zostaje po rezerwie na gaz. Stalo tu 0,005 ETH i przy saldzie
   * 0,0004 ETH rezerwa byla wieksza niz cale saldo - kazdy procent wpisywal
   * wtedy ZERO i przyciski wygladaly na zepsute. Uzasadnienie nowej wartosci
   * przy `GAS_RESERVE_WEI`.
   */
  const spendable = spendableEth(ethBalance?.value, GAS_RESERVE_WEI);
  const setBuyFraction = (numerator: bigint, denominator: bigint) => {
    if (spendable <= 0n) return;
    setBuyAmount(formatEther(fractionOf(spendable, numerator, denominator)));
  };
  const setSellFraction = (numerator: bigint, denominator: bigint) => {
    if (!details || details.balance <= 0n) return;
    setSellAmount(formatUnits(fractionOf(details.balance, numerator, denominator), decimals));
  };
  // ETH pozostaje wartoscia glowna wyceny; dopisek USD znika przy braku kursu.
  const sellQuoteNote = sellQuote === null ? null : usdNote(Number(formatEther(sellQuote)), ethUsd);
  const claimRows = details ? [
    { label: 'Startpad fees (curve)', value: formatEther(details.launchClaimable), amount: details.launchClaimable, source: 'launch' as const },
    { label: `Hook ${NATIVE_SYMBOL}`, value: formatEther(details.hookEthClaimable), amount: details.hookEthClaimable, source: 'hookEth' as const },
    { label: 'Hook token', value: formatUnits(details.hookTokenClaimable, decimals), amount: details.hookTokenClaimable, source: 'hookToken' as const },
    { label: `Vault ${NATIVE_SYMBOL}`, value: formatEther(details.vaultEthClaimable), amount: details.vaultEthClaimable, source: 'vaultEth' as const },
    { label: 'Vault token', value: formatUnits(details.vaultTokenClaimable, decimals), amount: details.vaultTokenClaimable, source: 'vaultToken' as const },
  ] : [];

  // Kupno rewertuje poza stanem Curve (`CurveIsLocked`/`AlreadyGraduated`),
  // a sprzedaz na krzywej dziala takze w Locked - panel odzwierciedla kontrakt,
  // zamiast pozwalac na klik konczacy sie surowym bledem viem.
  const canBuy = token.state === 'Curve';
  const canSell = token.state === 'Curve' || token.state === 'Locked';
  const effectiveSide: TradeSide = side === 'buy' && !canBuy ? 'sell' : side;

  return <>
    {canSell && <div className="mt-5 flex items-center gap-1 rounded-xl bg-sp-brand-soft p-1">
      {(canBuy ? (['buy', 'sell'] as const) : (['sell'] as const)).map((item) => <button key={item} type="button" onClick={() => setSide(item)} className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-extrabold capitalize ${effectiveSide === item ? 'bg-sp-surface text-soft-primary-deep shadow-sm' : 'text-sp-shade/45'}`}>{item === 'buy' ? `Buy with ${BUY_SYMBOL}` : 'Sell token'}</button>)}
    </div>}
    {!canBuy && canSell && <p className="mt-2 text-[11px] leading-[1.4] text-sp-shade/50">Buying is closed, the curve is full. Selling stays open until the pool opens.</p>}
    {!canSell && <p className="mt-5 rounded-xl bg-sp-brand-soft p-3 text-[11px] leading-[1.4] text-sp-shade/55">Curve trading ended at graduation. Swaps happen in the Uniswap v4 pool now.</p>}
    {canSell && (effectiveSide === 'buy' ? <>
      <div className="mt-4 flex items-end justify-between"><span className="text-[12px] font-extrabold text-sp-ink">{BUY_SYMBOL} amount</span>{/* SALDO, a nie sama nota o poslizgu. Panel ma przyciski 25/50/100% i Max,
          ktore licza z salda - ale samego salda nie pokazywal, wiec nie bylo od
          czego ich odniesc. Na stronie tokena stoi to od poczatku; tutaj
          brakowalo. */}
        <span className="text-[11px] text-sp-shade/45">{ethBalance ? `Balance ${Number(formatEther(ethBalance.value)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${BUY_SYMBOL}` : `${(DEFAULT_SLIPPAGE_BPS / 100).toFixed(1)}% slippage buffer`}</span></div>
      <div className="mt-2 flex gap-2"><div className="relative flex-1"><input inputMode="decimal" value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} className={`${FIELD} pr-14`} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-sp-shade/40">{BUY_SYMBOL}</span></div><button type="button" disabled={busy === 'buy'} onClick={onBuy} className="inline-flex items-center gap-2 rounded-xl bg-soft-primary px-4 text-[13px] font-extrabold text-sp-on-brand disabled:opacity-60">{busy === 'buy' ? 'Buying...' : 'Buy'}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button></div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(['25', '50', '100'] as const).map((pct) => <button key={pct} type="button" disabled={spendable <= 0n} onClick={() => setBuyFraction(BigInt(pct), 100n)} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">{pct}%</button>)}
        <button type="button" disabled={spendable <= 0n} onClick={() => setBuyFraction(1n, 1n)} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">Max</button>
      </div>
    </> : <>
      <div className="mt-4 flex items-end justify-between"><span className="text-[12px] font-extrabold text-sp-ink">Token amount</span><span className="text-[11px] text-sp-shade/45">Balance {Number(balance).toFixed(4)}</span></div>
      <div className="mt-2 flex gap-2"><div className="relative flex-1"><input inputMode="decimal" value={sellAmount} onChange={(event) => setSellAmount(event.target.value)} className={`${FIELD} pr-16`} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-extrabold text-sp-shade/40">{token.symbol}</span></div><button type="button" disabled={busy === 'sell' || busy === 'approve'} onClick={onSell} className="inline-flex items-center gap-2 rounded-xl bg-sp-ink px-4 text-[13px] font-extrabold text-white disabled:opacity-60">{busy === 'approve' ? 'Approving...' : busy === 'sell' ? 'Selling...' : 'Sell'}<ArrowDownToLine className="h-4 w-4" aria-hidden="true" /></button></div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(['25', '50', '100'] as const).map((pct) => <button key={pct} type="button" disabled={!details || details.balance === 0n} onClick={() => setSellFraction(BigInt(pct), 100n)} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">{pct}%</button>)}
        <button type="button" disabled={!details || details.balance === 0n} onClick={() => setSellFraction(1n, 1n)} className="rounded-full border border-sp-shade/10 px-2.5 py-1 text-[10.5px] font-bold text-sp-shade/60 hover:border-soft-primary disabled:opacity-40">Max</button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-sp-shade/45"><span>Estimated output</span><span className="font-extrabold text-sp-ink">{sellQuote === null ? '--' : `${formatEther(sellQuote)} ${NATIVE_SYMBOL}`}{sellQuoteNote && <span className="font-bold text-sp-shade/45"> · {sellQuoteNote}</span>}</span></div>
    </>)}

    {token.state === 'Locked' && <div className="mt-5 rounded-xl border border-sp-down-line bg-sp-down-soft p-3"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sp-down" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold text-sp-down-deep">Ready for graduation</p><p className="mt-1 text-[11px] leading-[1.4] text-sp-shade/55">Anyone can open the pool. Caller reward: {gradReward === null ? '--' : `${formatEther(gradReward)} ${NATIVE_SYMBOL}`}.</p></div><button type="button" disabled={busy === 'graduate'} onClick={onGraduate} className="rounded-full bg-sp-down px-3 py-2 text-[11px] font-extrabold text-sp-on-brand disabled:opacity-50">{busy === 'graduate' ? 'Opening...' : 'Graduate'}</button></div></div>}

    {token.state === 'Graduated' && <div className="mt-5 rounded-xl bg-sp-brand-soft p-3"><div className="flex items-start gap-2"><Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold text-sp-ink">Live pool with hook</p><p className="mt-1 text-[11px] leading-[1.4] text-sp-shade/55">{details?.poolId && details.poolId !== `0x${'0'.repeat(64)}` ? `Pool ${details.poolId.slice(0, 10)}...` : 'Pool position is loading.'}</p></div></div><p className="mt-2 text-[10.5px] leading-[1.4] text-sp-shade/45">Settle books the hook&apos;s swap fees into claimable balances; Harvest pulls the pool fees the locked position earned. Both are open to anyone and pay the caller nothing.</p><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={(!details?.pendingEth && !details?.pendingToken) || busy === 'settle'} onClick={onSettle} className="rounded-lg border border-sp-shade/10 bg-sp-surface px-2 py-2 text-[11px] font-extrabold text-sp-ink disabled:opacity-40">{busy === 'settle' ? 'Settling...' : details && details.pendingEth === 0n && details.pendingToken > 0n ? 'Settle token fees' : `Settle ${details ? formatEther(details.pendingEth) : '0'} ${NATIVE_SYMBOL}`}</button><button type="button" disabled={busy === 'harvest'} onClick={onHarvest} className="rounded-lg border border-sp-shade/10 bg-sp-surface px-2 py-2 text-[11px] font-extrabold text-sp-ink disabled:opacity-40">{busy === 'harvest' ? 'Harvesting...' : 'Harvest LP fees'}</button></div></div>}

    {isConnected && details && <div className="mt-5 border-t border-sp-shade/10 pt-4"><div className="flex items-center justify-between"><span className="text-[12px] font-extrabold text-sp-ink">Available claims</span><CheckCircle2 className="h-4 w-4 text-sp-up-vivid" aria-hidden="true" /></div><div className="mt-2 space-y-1.5">{claimRows.map((row) => <div key={row.label} className="flex items-center justify-between gap-2 text-[11px]"><span className="text-sp-shade/50">{row.label}</span><span className="flex items-center gap-2 font-extrabold text-sp-ink"><span>{row.value}</span><button type="button" disabled={row.amount === 0n} onClick={() => onClaim(row.source)} className="rounded-full border border-sp-shade/10 px-2 py-1 text-[10px] text-soft-primary-deep disabled:opacity-30">Claim</button></span></div>)}</div></div>}
  </>;
}

/* -------------------------------------------------------------------------- */
/*  ODCZYT TABLICY Z LANCUCHA                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ile blokow bierzemy w jednym `getLogs`. Publiczne RPC Base Sepolia potrafi
 * odrzucic szerszy zakres, wiec skanujemy WSTECZ oknami, a nie jednym strzalem
 * od bloku wdrozenia.
 */
// Rozmiar okna i sufit okien sa PER-SIEC: Base Sepolia tnie getLogs na 2000
// blokach (male okno, wiele okien), Robinhood przyjmuje 200k na strzal (duze
// okno, kilka okien - inaczej skan nie siegal bloku wdrozenia i tablica
// pokazywala mocki). Patrz LAUNCHPAD_NETWORKS w config.ts.
/**
 * Okno skanu ZACZYNA sie na wartosci z konfiguracji, ale nie musi na niej
 * zostac - patrz `logRangeLimitFrom` w `boardScan`. 10 wrzesnia 2026 kazde
 * okno na Base wracalo z 413 "limited to a 2,000 range", bo konfiguracja
 * niesie pomiar z 13 sierpnia, a Base zaciesnil limit po tej dacie. Zamiast
 * przepisywac liczbe (i przegapic kolejna zmiane), czytamy limit z bledu i
 * pamietamy go NA CZAS SESJI.
 *
 * `let`, a nie `const`: to jest zmierzona wlasnosc endpointu, do ktorego
 * akurat mowimy, a nie stala programu.
 */
let logWindow = ACTIVE_LAUNCHPAD_NETWORK.scanWindow;
const MAX_LOG_WINDOWS = ACTIVE_LAUNCHPAD_NETWORK.maxScanWindows;

/**
 * Zwez okno, jesli TEN blad mowi o limicie zakresu. Oddaje `true`, gdy okno
 * sie zmienilo - wolajacy wie wtedy, ze warto policzyc zakresy od nowa.
 *
 * Nigdy nie POSZERZAMY: limit endpointu poznajemy wylacznie przez odmowe, a
 * odmowy nie ma, dopoki pytamy w granicach. Powrot do szerszego okna nalezy do
 * kolejnego wejscia na strone, gdzie `logWindow` startuje od konfiguracji.
 */
function narrowLogWindow(error: unknown): boolean {
  const limit = logRangeLimitFrom(error);
  if (limit === null || limit >= logWindow) return false;
  logWindow = limit;
  return true;
}
/**
 * Najwieksza zaleglosc, ktora wolno nadrobic doliczeniem delty. Powyzej niej
 * jedno zadanie i tak nie zeskanowaloby calego przedzialu, wiec zostalaby
 * dziura - a dziury w sumie addytywnej nie da sie pozniej odroznic od prawdy.
 * Praktycznie nieosiagalne: agregat starszy niz tydzien i tak wygasa.
 */
const maxDeltaSpan = () => logWindow * BigInt(MAX_LOG_WINDOWS);

const LAUNCHED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Launched' });
const BOUGHT_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Bought' });
const SOLD_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Sold' });
// Rozliczenia oplat puli po graduacji emituje HOOK, nie launchpad - stad
// drugi adres w skanie. Tablicy zarobkow wystarczy pole `ethToCreator`.
const HOOK_FEE_SETTLED_EVENT = getAbiItem({ abi: hookAbi, name: 'HookFeeSettled' });
// Kazde naliczenie co do wei per ODBIORCA - jedyne zrodlo, ktore rozlicza
// takze splity miedzy odbiorcow fee. kind 1 = strona tworcy oplaty handlowej.
const FEE_ACCRUED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'FeeAccrued' });

/**
 * `Transfer` tokena i `Swap` puli - dwa zrodla, ktorych krzywa nie ma.
 *
 * `Transfer` bierzemy z ABI ERC-20, bo B20 emituje standardowe zdarzenie pod
 * swoim wlasnym adresem (zmierzone: 6 063 logow dla $SPHERE miedzy blokiem
 * startu a glowa). `Swap` jest ten sam, co na stronie tokena - importowany
 * stamtad, zeby nie istnialy dwie definicje tego samego zdarzenia.
 */
const TRANSFER_EVENT = getAbiItem({ abi: erc20Abi, name: 'Transfer' });

/**
 * `totalSupply` osobno, bo `erc20Abi` z `config.ts` go nie ma, a config jest
 * nietykalny. Kapitalizacja to cena razy podaz, wiec bez tego odczytu byla
 * niepoliczalna - a zgadnieta podaz (np. "zawsze miliard") to dokladnie ten
 * rodzaj liczby, ktorej ta zmiana ma sie pozbyc.
 */
const totalSupplyAbi = [
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

/**
 * ===========================================================================
 * BUDZET ZAPYTAN NA DOLICZENIE POSIADACZY I WOLUMENU PULI
 * ===========================================================================
 * Jedno `eth_getLogs` przyjmuje TABLICE adresow, a filtr po temacie przyjmuje
 * tablice wartosci. Dlatego okno kosztuje DWA zapytania niezaleznie od tego,
 * ile tokenow jest na tablicy: jedno po `Transfer` wszystkich tokenow naraz i
 * jedno po `Swap` wszystkich pul naraz. To jest cala roznica wobec naiwnego
 * "po zapytaniu na token", ktore przy czterdziestu tokenach byloby osiemdziesiat
 * zapytan na okno i zabiloby publiczny RPC.
 *
 * Sufit okien NA WEJSCIE jest osobny i niski. Pelna historia $SPHERE to 187
 * okien po 2 000 blokow - za duzo na jedno wejscie, ale znacznik postepu lezy
 * w `localStorage`, wiec kolejne wejscia dokladaja tylko nowe bloki i po
 * kilku wizytach zakres sie domyka. Dopoki sie nie domknie, `complete` jest
 * `false` i karta pokazuje liczby krzywej POD ICH WLASNA NAZWA - nigdy polowy
 * prawdy pod nazwa calosci.
 */
const EXTRAS_MAX_WINDOWS_PER_VISIT = 150;
const EXTRAS_CONCURRENCY = 2;
const EXTRAS_KEY = (chainId: number, launchpad: string) =>
  `startpad.extras.v1.${chainId}.${launchpad.toLowerCase()}`;

function loadExtras(chainId: number, launchpad: string): TokenExtras | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(EXTRAS_KEY(chainId, launchpad));
    return raw ? parseExtras(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveExtras(chainId: number, launchpad: string, extras: TokenExtras): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXTRAS_KEY(chainId, launchpad), JSON.stringify(serializeExtras(extras)));
  } catch {
    // Brak miejsca albo tryb prywatny - wtedy po prostu liczymy od nowa przy
    // kolejnym wejsciu. Nic sie nie psuje, jest tylko wolniej.
  }
}

/**
 * Paleta i sposob liczenia przeniesione do `metadata.ts` - ten sam kolor musi
 * dostac karta udostepniania renderowana na serwerze, a ona nie moze wciagac
 * calej tablicy z wagmi. Wynik jest identyczny, wiec zaden token nie zmienia
 * barwy.
 */
const accentFor = tokenAccent;

/* ========================================================================== */
/*  PODPISY, KTORE MOWIA TO, CO LICZBA NAPRAWDE ZNACZY                        */
/* ========================================================================== */

/**
 * Liczba ludzi plus slowo, ktore ja nazywa.
 *
 * Dopoki `holderCount` jest `null`, jedyne, co wiemy, to ile kont handlowalo na
 * krzywej - i dokladnie tak to piszemy. Zaden token nie dostaje slowa "holders"
 * przy liczbie, ktora posiadaczy nie liczy.
 */
function peopleNote(token: BoardToken): string {
  if (token.holderCount != null) return `${token.holderCount} holders`;
  return `${token.traders ?? token.holders} traders`;
}

/**
 * Wolumen plus slowo, ktore mowi, CO obejmuje.
 *
 * Po graduacji handel przenosi sie do puli, wiec sam wolumen krzywej opisuje
 * juz tylko przeszlosc. Gdy mamy policzony wolumen puli, sumujemy oba i
 * podpisujemy "vol"; gdy jeszcze nie mamy, a token JEST po graduacji, podpis
 * brzmi "curve vol" - bo tyle wtedy naprawde wiemy.
 */
function volumeParts(token: BoardToken): { eth: number; label: string } {
  const curve = token.volume ?? 0;
  if (token.poolVolume != null) return { eth: curve + token.poolVolume, label: 'vol' };
  return { eth: curve, label: token.state === 'Graduated' ? 'curve vol' : 'vol' };
}

function formatAge(startedAt: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - startedAt);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86_400)} d`;
}

/** Jak dlugo po transakcji token liczy sie jako "goracy" w Trending. */
const HOT_TRADE_WINDOW_MS = 90_000;

export default function LaunchpadBoard() {
  /*
   * SIEC JAKO STAN, NIE STALA MODULU - dla wszystkiego, co trafia do HTML.
   *
   * `ACTIVE_LAUNCHPAD_NETWORK` liczy sie przy imporcie, wiec na serwerze jest
   * bazowa, a na kliencie juz wybrana. Dla WEZLOW TEKSTOWYCH ratuje to
   * `suppressHydrationWarning`, ale dla ATRYBUTOW nie ma takiego ratunku:
   * `aria-label` ShareTokena szedl jako "Share Base B20" z serwera i
   * "Share Arc" z klienta, i React zglaszal to przy kazdym wejsciu.
   *
   * Ten sam wzorzec, co w `StartpadFooter` i `LifecycleGuide`: przed montazem
   * siec domyslna (zgodnie z SSR), po montazu wybrana.
   */
  const [netState, setNetState] = useState<LaunchpadNetwork>(
    () => LAUNCHPAD_NETWORKS[DEFAULT_LAUNCHPAD_CHAIN_ID]
  );
  useEffect(() => setNetState(ACTIVE_LAUNCHPAD_NETWORK), []);

  // Rynek perpa zostaje w module po nawigacji klienckiej (np. mem z Perps ->
  // "Startpad" w menu). Sam `/startpad` bez `?m=` to zawsze rynek ETH sieci,
  // wiec module trzeba przeliczyc pelnym przeladowaniem.
  useEffect(() => {
    if (!ACTIVE_MARKET_ID) return;
    if (new URLSearchParams(window.location.search).get('m') !== null) return;
    setLaunchpadMarket(ACTIVE_LAUNCHPAD_NETWORK.chain.id, null);
  }, []);

  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  // Startujemy od PUSTEJ tablicy, nie od wierszy przykladowych: pierwszy
  // render pokazywal probki na sekunde, zanim skan dogonil prawde - wygladalo
  // to jak stare dane. Probki wchodza dopiero, gdy UKONCZONY skan nic nie da.
  const [tokens, setTokens] = useState<BoardToken[]>([]);

  /**
   * Aktualna lista tokenow w refie. Subskrypcje (`onLogs`) zyja w domknieciu
   * z chwili zalozenia, wiec czytanie z nich `tokens` dawaloby stan sprzed
   * zaladowania tablicy - stad wiersze z puli pokazywaly `0xb200...2476`
   * zamiast `SPHERE`.
   */
  const tokensRef = useRef<BoardToken[]>([]);
  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  const symbolOf = useCallback(
    (address: string) =>
      tokensRef.current.find((row) => row.address?.toLowerCase() === address.toLowerCase())?.symbol ??
      shortAddress(address),
    []
  );
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);

  /**
   * Podmiana tasmy z zachowaniem wierszy, ktorych skan nie zna. Wiersze z puli
   * ida na przod: trafiaja tu wylacznie z subskrypcji na zywo, wiec w chwili
   * podmiany sa najswiezszym, co mamy.
   */
  const replaceFeed = useCallback((next: ActivityItem[]) => {
    setActivityFeed((current) => {
      const fromPool = current.filter((item) => item.source === 'pool');
      if (fromPool.length === 0) return next.slice(0, 24);
      const seen = new Set(fromPool.map((item) => item.id));
      return [...fromPool, ...next.filter((item) => !seen.has(item.id))].slice(0, 24);
    });
  }, []);
  const [topEarners, setTopEarners] = useState<CreatorEarnings[]>([]);
  // Kurs ETH/USD do dopiskow. Null przy braku danych - wtedy dopiski znikaja,
  // a ETH zostaje jedyna (i zawsze prawdziwa) wartoscia na ekranie.
  const { usd: ethUsd } = useEthUsd();
  const [tab, setTab] = useState<BoardTab>('trending');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [buyAmount, setBuyAmount] = useState('0.05');
  const [launchOpen, setLaunchOpen] = useState(false);
  // `?launch=1` - wejscie z widoku "Perp memes" z wybranym perpem: modal startu
  // otwiera sie od razu, juz w kontekscie tego rynku (`?m=`).
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('launch') !== '1') return;
      setLaunchOpen(true);
      url.searchParams.delete('launch');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // Zepsuty adres - modal zostaje zamkniety.
    }
  }, []);
  const [tradeOpen, setTradeOpen] = useState(false);
  // Animacje handlu sa ZAWSZE wlaczone - i tak byly caly czas, a przelacznik
  // tylko zajmowal miejsce w pasku. Stala, zeby karty dalej dostawaly prop.
  const animationsOn = true;
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // `true` od pierwszego renderu: zanim efekt odpali skan, rynek ma pokazywac
  // szkielet, a nie pusty stan ani probki.
  const [loadingBoard, setLoadingBoard] = useState(true);
  // Spinner "Reading Launchpad activity" tylko na ZIMNYM starcie. Gdy tablica
  // ma juz tresc, kolejne loadBoard (po tradzie/starcie) odswiezaja CICHO - bez
  // migania belka, ktora sprawiala wrazenie ciaglego przeladowania.
  const boardHasContentRef = useRef(false);
  // Zabezpieczenie przed WYSCIGIEM nakladajacych sie loadBoard (mount + cichy
  // po tradzie): kazdy przebieg dostaje numer; starszy nie nadpisuje stanu, gdy
  // w miedzyczasie ruszyl nowszy.
  const loadBoardSeq = useRef(0);
  const [boardError, setBoardError] = useState<string | null>(null);
  // Skan logow doszedl do sufitu okien zanim siegnal bloku wdrozenia -
  // najstarsze starty moga byc poza widokiem i trzeba to nazwac w UI.
  const [scanTruncated, setScanTruncated] = useState(false);
  const [tradeSide, setTradeSide] = useState<TradeSide>('buy');
  const [sellAmount, setSellAmount] = useState('0');
  const [sellQuote, setSellQuote] = useState<bigint | null>(null);
  const [details, setDetails] = useState<TokenDetails | null>(null);
  const [gradReward, setGradReward] = useState<bigint | null>(null);
  // Salda do wyplaty podlaczonego portfela - jedno saldo ETH per adres w
  // launchpadzie, hooku i vaulcie. Null znaczy "brak odczytu", nie zero.
  const [myClaimable, setMyClaimable] = useState<MyClaimable | null>(null);
  // Licznik blyskow. `Date.now()` nie wystarcza: dwa eventy w tej samej
  // milisekundzie daloby ten sam `key` i animacja by sie nie zrestartowala.
  const flashSeq = useRef(0);

  // Toast potwierdzenia sam znika: sukces po 4 s, blad po 7 s. Reczne
  // zamkniecie (X) tez dziala.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.kind === 'success' ? 4000 : 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Odczyty tablicy sa PRZYPIETE do sieci launchpada. Bez tego tablica gasnie,
  // gdy portfel stoi na innym lancuchu - a to jest widok publiczny i ma sie
  // pokazac takze bez portfela.
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });

  /**
   * Odtwarza tablice z lancucha: `Launched` daje liste tokenow, `Bought` -
   * unikalnych kupujacych, a `launchOf` aktualny stan i rezerwe. Zaden
   * zewnetrzny indekser nie widzi tych tokenow przed awansem, wiec to jest
   * jedyne zrodlo. Z tych samych eventow spisujemy historie cen: rezerwy PO
   * transakcji daja dokladna cene spot, bez ani jednego dodatkowego odczytu.
   */
  const loadBoard = useCallback(async () => {
    if (!readClient) return;
    const runId = ++loadBoardSeq.current;
    const stale = () => runId !== loadBoardSeq.current;
    if (!boardHasContentRef.current) setLoadingBoard(true);
    setBoardError(null);
    try {
      /**
       * SKAN ZACZYNA SIE TAM, GDZIE SKONCZYL POPRZEDNI.
       *
       * Do 15 sierpnia 2026 kazde wejscie na tablice skanowalo lancuch od glowy
       * az do bloku wdrozenia launchpada. Ten koszt rosl z kazda doba Base
       * (~4,5 okna na dobe przy oknie 9500) i mial twardy koniec: po ~16,6 dnia
       * od wdrozenia skan przestawal miescic sie w suficie okien, przestawal
       * siegac startu, a najstarsze tokeny tracily wolumen, ceny i wykresy.
       *
       * Agregat z poprzedniej wizyty niesie blok, do ktorego jest policzony,
       * wiec teraz dokladamy TYLKO nowe bloki. Zapisujemy go wylacznie wtedy,
       * gdy pokrycie jest ciagle od bloku wdrozenia - dzieki temu `lastBlock`
       * zawsze znaczy "policzone od poczatku do tego bloku", a nie "policzone
       * cokolwiek".
       *
       * ===================================================================
       * AGREGAT MA DWA ZRODLA, BO JEDNO NIE WYSTARCZALO
       * ===================================================================
       * Zapamietany agregat lezal WYLACZNIE w `localStorage`. Dla kogos, kto
       * wchodzil z drugiego urzadzenia, ta pamiec byla pusta - i akapit wyzej
       * opisywal wtedy jego wejscie co do slowa: pelny skan od bloku
       * wdrozenia, z sufitem okien, ktory lancuchy juz przerosly. Zglaszane
       * jako "z innego urzadzenia pobiera dane od nowa".
       *
       * Drugim zrodlem jest `/api/launchpad/board/stats`: ten sam agregat,
       * liczony raz po stronie serwera i wspolny dla wszystkich urzadzen.
       * Bierzemy ten, ktory siega WYZEJ - nigdy oba naraz, bo oba znacza
       * "policzone od bloku wdrozenia", wiec ich zlozenie policzyloby wolumen
       * podwojnie (patrz `pickAggregateBase`).
       *
       * Zapytanie leci ROWNOLEGLE z odczytem glowy lancucha: to sa dwie
       * niezalezne rzeczy, a szeregowanie ich dokladaloby cala runde do
       * czasu, ktory ta zmiana ma skracac.
       */
      const cached = loadBoardAggregate(ACTIVE_LAUNCHPAD_NETWORK.chain.id, LAUNCHPAD_ADDRESS);
      const localAggregate = cached ? parseAggregate(cached.aggregate) : null;

      const [latest, serverStats] = await Promise.all([
        readClient.getBlockNumber(),
        fetchBoardStats(ACTIVE_LAUNCHPAD_NETWORK.chain.id),
      ]);

      const base = pickAggregateBase(
        localAggregate && cached ? { aggregate: localAggregate, lastBlock: cached.lastBlock } : null,
        serverStats,
        latest
      );
      const cachedAggregate = base?.aggregate ?? null;

      /**
       * ILE BLOKOW WOLNO NAM WZIAC - PYTAMY, ZANIM ZBUDUJEMY OKNA.
       *
       * Jedno zapytanie na adres ZEROWY: kontraktu tam nie ma, wiec odpowiedz
       * jest pusta natychmiast i nic nie kosztuje po stronie indeksu - ale
       * sprawdzenie ROZMIARU ZAKRESU dzieje sie po stronie RPC przed
       * wyszukiwaniem, wiec limit poznajemy tak samo dobrze, jak prawdziwym
       * zapytaniem. Odpowiedz idzie do `logWindow` i dopiero potem liczymy
       * okna - inaczej zbudowalibysmy 90 okien po 9 500 blokow, z ktorych
       * kazde odbiloby sie bledem, tak jak odbijalo sie 10 wrzesnia 2026.
       */
      try {
        await readClient.getLogs({ address: zeroAddress, fromBlock: latest > logWindow ? latest - logWindow : 0n, toBlock: latest });
      } catch (error) {
        narrowLogWindow(error);
      }

      const plan = planBoardScan({
        cachedLastBlock: base?.lastBlock ?? null,
        head: latest,
        deployBlock: LAUNCHPAD_DEPLOY_BLOCK,
        maxSpan: maxDeltaSpan(),
      });
      const resumable = plan.resume;
      const scanFloor = plan.floor;

      // Wszystkie okna [fromBlock,toBlock] liczymy Z GORY, potem strzelamy
      // ROWNOLEGLE w puli po 6. Okna sa niezalezne, a przetwarzanie i tak
      // sortuje po (blok, logIndex), wiec kolejnosc pobrania nie ma znaczenia.
      // Zamiana ~64 sekwencyjnych RTT na ~ceil(N/6) rownoleglych scina zimny
      // skan z ~13-30s do ~2-4s - to byla glowna przyczyna zacinania tablicy.
      const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
      {
        let cursor = latest;
        for (let window = 0; window < MAX_LOG_WINDOWS && cursor >= scanFloor; window += 1) {
          const fromBlock = cursor > scanFloor + logWindow ? cursor - logWindow : scanFloor;
          ranges.push({ fromBlock, toBlock: cursor });
          if (fromBlock === scanFloor) break;
          cursor = fromBlock - 1n;
        }
      }
      // Dwa adresy w jednym strzale: launchpad emituje handel na krzywej, hook
      // rozliczenia oplat puli. Blad jednego okna nie wywala calego skanu.
      //
      // ALE MUSI GO ODNOTOWAC. Do 13 sierpnia 2026 padniete okno oddawalo tu
      // pusta liste i przez to bylo NIEODROZNIALNE od okna bez zdarzen. Skan
      // konczyl sie jako kompletny, a regula scalania nizej wyrzucala z tablicy
      // tokeny, ktorych `Launched` byl akurat w tej dziurze - znikaly ludziom z
      // ekranu przy zywszym ruchu. Brak danych nie jest danymi.
      let failedWindows = 0;
      const scanOne = async (r: { fromBlock: bigint; toBlock: bigint }) => {
        const once = () =>
          readClient.getLogs({
            // Wszystkie wdrozenia sieci naraz - zdarzenia maja to samo ABI,
            // a `log.address` mowi potem, z ktorego wdrozenia jest token.
            address: [...LAUNCHPAD_ADDRESSES, ...LAUNCH_HOOK_ADDRESSES] as Address[],
            events: [LAUNCHED_EVENT, BOUGHT_EVENT, SOLD_EVENT, HOOK_FEE_SETTLED_EVENT, FEE_ACCRUED_EVENT],
            fromBlock: r.fromBlock,
            toBlock: r.toBlock,
          });
        try {
          return await once();
        } catch (error) {
          // Blad o ZAKRESIE zapamietujemy na przyszle wejscia (sonda wyzej
          // mogla go przegapic, gdy RPC odpowiada rozne rzeczy pod obciazeniem).
          // Tego okna to juz nie uratuje - jest zbudowane na starej szerokosci -
          // wiec liczy sie jako padniete i skan nie bedzie wiarygodny.
          narrowLogWindow(error);
          // Jedna proba ponowna: burst zapytan potrafi zebrac 429 z publicznego
          // RPC, ale po chwili przechodzi.
          try {
            return await once();
          } catch {
            failedWindows += 1;
            return [];
          }
        }
      };
      type ScanLog = {
        eventName?: string;
        address?: string;
        args: Record<string, unknown>;
        transactionHash?: string;
        blockNumber: bigint | null;
        logIndex: number | null;
      };
      const SCAN_CONCURRENCY = 4;
      const allLogs: ScanLog[] = [];
      for (let i = 0; i < ranges.length; i += SCAN_CONCURRENCY) {
        const batch = (await Promise.all(ranges.slice(i, i + SCAN_CONCURRENCY).map(scanOne))) as unknown as ScanLog[][];
        for (const logs of batch) for (const log of logs) allLogs.push(log);
      }
      // Logi -> agregat. Ta sama redukcja, co wczesniej stala tutaj w petli,
      // tylko wyjeta do `boardScan`, zeby dalo sie ja przetestowac i zeby
      // wynik dalo sie DOSUMOWAC do zapamietanego.
      const scannedAggregate = reduceBoardLogs(allLogs, {
        ethOf: (wei) => Number(formatEther(wei)),
        priceOf: spotPriceFromReserves,
      });

      /**
       * Delte doklejamy TYLKO w calosci. Padniete okno znaczy dziure w
       * przedziale, a dziura w sumie addytywnej jest nie do odkrecenia: zostaje
       * w wolumenie na zawsze i nikt jej pozniej nie odrozni od prawdy. Wtedy
       * pokazujemy to, co pewne (agregat sprzed), i probujemy ponownie przy
       * kolejnym wejsciu.
       */
      const deltaComplete = failedWindows === 0;
      const aggregate =
        resumable && cachedAggregate
          ? deltaComplete
            ? mergeAggregates(cachedAggregate, scannedAggregate)
            : cachedAggregate
          : scannedAggregate;

      // Pokrycie: przy skanie roznicowym dno siega bloku wdrozenia przez
      // zapamietany agregat, bo inaczej nie zostalby zapisany.
      const lowestScanned = resumable
        ? LAUNCHPAD_DEPLOY_BLOCK
        : ranges.length
          ? ranges[ranges.length - 1].fromBlock
          : latest;
      // Wiarygodny = zszedl do bloku wdrozenia I ZADNE okno nie padlo. Dopiero
      // taki skan ma prawo rozstrzygac, ze tokena nie ma.
      const trustworthy = scanIsTrustworthy({ failedWindows, lowestScanned, deployBlock: LAUNCHPAD_DEPLOY_BLOCK });

      // Zapis WYLACZNIE przy ciaglym pokryciu od bloku wdrozenia - tylko wtedy
      // `lastBlock` znaczy "policzone od poczatku do tego bloku".
      if (trustworthy) {
        saveBoardAggregate(ACTIVE_LAUNCHPAD_NETWORK.chain.id, LAUNCHPAD_ADDRESS, {
          lastBlock: latest,
          aggregate: serializeAggregate(aggregate),
        });
      }

      const { launched, buyers, activity, hookCreatorEth, creatorSideEarned, accountDisplay, priceEntries } = aggregate;
      const rawFeed = aggregate.feed;

      // ===== TOZSAMOSCI Z BAZY, NIE Z TEGO SKANU =====
      // Lista startow przychodzi z /api/launchpad/board, gdzie jest ZAPISANA.
      // Skan z przegladarki dowozi tylko to, co zobaczyl w swoich oknach, a
      // najstarszy token lezy w najglebszym z nich - to on znikal z tablicy,
      // gdy okno padlo na limicie publicznego RPC. Baza tego nie gubi, bo raz
      // zapisany token z niej nie wypada.
      //
      // Doklejamy WYLACZNIE brakujace: gdy skan zobaczyl `Launched`, jego dane
      // sa swiezsze i zostaja.
      try {
        const response = await fetch(`/api/launchpad/board?chainId=${ACTIVE_LAUNCHPAD_NETWORK.chain.id}${MARKET_QUERY}`);
        if (response.ok) {
          const body = (await response.json()) as {
            ok?: boolean;
            tokens?: Array<{ address?: string; name?: string; symbol?: string; creator?: string; startedAt?: number }>;
          };
          if (body?.ok && Array.isArray(body.tokens)) {
            // Mapa jest kluczowana adresem Z LOGOW, czyli w checksumie
            // (`0xB200...`), a baza trzyma male litery. Porownanie wprost dawalo
            // DWA klucze na jeden token i tablica pokazywala go dwa razy: raz z
            // wolumenem ze skanu, raz z zerami z bazy. Porownujemy wiec po
            // malych literach, a wstawiamy w checksumie - tak jak reszta mapy.
            const known = new Set([...launched.keys()].map((key) => key.toLowerCase()));
            for (const entry of body.tokens) {
              const raw = entry.address ?? '';
              if (!/^0x[0-9a-fA-F]{40}$/.test(raw) || known.has(raw.toLowerCase())) continue;
              const address = getAddress(raw) as Address;
              known.add(raw.toLowerCase());
              launched.set(address, {
                name: entry.name ?? '',
                symbol: entry.symbol ?? '',
                creator: (entry.creator ?? '0x0000000000000000000000000000000000000000') as Address,
                startedAt: Number(entry.startedAt ?? 0),
              });
            }
          }
        }
      } catch {
        // Indeks niedostepny - zostaje sam skan, czyli stan sprzed tej zmiany.
      }

      // Skan mogl uciac historie na SUFICIE OKIEN zamiast dojsc do bloku
      // wdrozenia (`trustworthy` policzone wyzej) - ale przy scalaniu ponizej
      // zachowujemy wiersze spoza skanu, wiec cicho niezeskanowany token juz
      // nie znika z tablicy.
      if (stale()) return;
      setScanTruncated(!trustworthy);

      if (launched.size === 0) {
        replaceFeed([]);
        // Nie ZRZUCAJ dobrego stanu na mocki przy pustym skanie (chwilowa awaria
        // RPC). Podglad tylko gdy naprawde nic nie mamy.
        setTokens((current) => (current.some((token) => token.live) ? current : previewTokens));
        setTopEarners([]);
        return;
      }

      replaceFeed(
        // Kopia przed sortowaniem: `feed` nalezy do agregatu, ktory przy
        // nieudanej delcie jest tym samym obiektem, co stan zapamietany.
        [...rawFeed]
          .sort((a, b) => b.order - a.order)
          .slice(0, 24)
          .map((item) => ({ ...item, address: item.token, symbol: launched.get(item.token)?.symbol ?? shortAddress(item.token), accent: accentFor(item.token) }))
      );

      // Kazdy token rozmawia z wdrozeniem, z ktorego pochodzi. Wpis z indeksu
      // serwera albo ze starego agregatu nie zna swojego launchpada - wtedy
      // pytamy WSZYSTKIE (najnowsze pierwsze) i bierzemy ten, ktory go zna.
      const addresses = [...launched.keys()];
      const probes = addresses.flatMap((token) => {
        const known = launched.get(token)?.launchpad;
        const deps = known ? [deploymentOrOldest(known)] : LAUNCHPAD_DEPLOYMENTS;
        return deps.map((dep) => ({ token, dep }));
      });
      const probeResults = await readClient.multicall({
        allowFailure: true,
        contracts: probes.map(({ token, dep }) => ({
          address: dep.launchpad as Address,
          abi: launchpadAbi,
          functionName: 'launchOf' as const,
          args: [token] as const,
        })),
      });
      const resolved = new Map<Address, { dep: (typeof LAUNCHPAD_DEPLOYMENTS)[number]; result: (typeof probeResults)[number] }>();
      probes.forEach(({ token, dep }, i) => {
        if (resolved.has(token)) return;
        const r = probeResults[i];
        if (r?.status !== 'success') return;
        if (Number((r.result as readonly unknown[])[1]) === 0) return;
        resolved.set(token, { dep, result: r });
        const meta = launched.get(token);
        if (meta && !meta.launchpad) launched.set(token, { ...meta, launchpad: dep.launchpad as Address });
      });
      const depOf = (token: Address) => resolved.get(token)?.dep ?? deploymentOrOldest(launched.get(token)?.launchpad);
      const states = addresses.map((token) => resolved.get(token)?.result);

      // token -> (tworca, czy graduowany) - potrzebne do przypisania oplat
      // hooka wlasciwemu kontu w tablicy zarobkow.
      const tokenMeta = new Map<Address, { creator: Address; graduated: boolean }>();
      const live: BoardToken[] = [];
      addresses.forEach((token, index) => {
        const result = states[index];
        const meta = launched.get(token);
        if (!meta || result?.status !== 'success') return;
        const [creator, state, ethReserve, , startedAt] = result.result as readonly [
          Address,
          number,
          bigint,
          bigint,
          number,
          `0x${string}`,
        ];
        // Stan 0 znaczy "launchpad nie zna tego adresu". Zdarzenie z innego
        // wdrozenia pod tym samym adresem tablicy nie ma prawa tu wejsc.
        if (state === 0) return;
        tokenMeta.set(token, { creator, graduated: LAUNCH_STATE[state] === 'Graduated' });

        // Zarobki NALICZONE tworcy z JEGO wlasnego tokena: dokladne wpisy
        // FeeAccrued (kind 1) na jego adres + ethToCreator z rozliczen hooka.
        // Gdy tworca skierowal czesc oplat do innych odbiorcow, ich czesc
        // tu NIE wchodzi - to sa "twoje zarobki", nie "zarobki wszystkich".
        // To accrual, nie wyplata - wyplata idzie osobnym claimem.
        const creatorWei =
          (hookCreatorEth.get(token) ?? 0n) +
          (creatorSideEarned.get(creator.toLowerCase())?.get(token) ?? 0n);

        const history = (priceEntries.get(token) ?? [])
          .sort((a, b) => a.order - b.order)
          .map((entry) => entry.price)
          .slice(-12);
        const dep = depOf(token);
        live.push({
          id: token,
          address: token,
          launchpad: dep.launchpad,
          version: dep.version,
          name: meta.name,
          symbol: meta.symbol,
          creator,
          state: LAUNCH_STATE[state] as LaunchpadToken['state'],
          // `graduate()` ZERUJE obie rezerwy w kontrakcie (CurveLaunchpad:
          // l.ethReserve = 0), wiec surowy odczyt kaze tokenowi, ktory wlasnie
          // przeszedl cala droge, pokazac "0 ETH" i pusty pasek. Dokladnie to
          // stalo sie SPHERE'owi, przypietemu na gorze tablicy.
          //
          // Po graduacji zbiorka jest z definicji domknieta, wiec pokazujemy
          // prog - tak jak robi to kazdy launchpad, u ktorego pasek po
          // graduacji stoi na 100%, a nie wraca do zera. Zastrzezenie, ktore
          // trzeba znac: jesli ktos sprzedawal w stanie Locked, realna rezerwa
          // w chwili awansu byla nizsza, a dokladna liczba stoi w zdarzeniu
          // `Graduated` (ethToPool + gradFee) i tylko tam.
          raised:
            LAUNCH_STATE[state] === 'Graduated' ? CURVE_TARGET_ETH : Number(formatEther(ethReserve)),
          target: CURVE_TARGET_ETH,
          // `holders` to POLE WYSWIETLANE. Dopoki nie policzymy sald, siedzi w
          // nim liczba handlujacych na krzywej - i karta nazywa ja "traders",
          // bo `holderCount` jest wtedy `null`. Patrz `BoardToken`.
          holders: buyers.get(token)?.size ?? 0,
          traders: buyers.get(token)?.size ?? 0,
          holderCount: null,
          volume: activity.get(token)?.volume ?? 0,
          poolVolume: null,
          trades: activity.get(token)?.trades ?? 0,
          lastPrice: history[history.length - 1] ?? 0,
          age: formatAge(Number(startedAt)),
          accent: accentFor(token),
          live: true,
          startedAt: Number(startedAt),
          prices: history,
          creatorAccruedWei: creatorWei,
        });
      });

      if (live.length === 0) {
        replaceFeed([]);
        setTokens((current) => (current.some((token) => token.live) ? current : previewTokens));
        setTopEarners([]);
        return;
      }
      // Tablica zarobkow per KONTO (nie per tworca tokena): FeeAccrued kind 1
      // trafia do faktycznych odbiorcow (splity!), a ethToCreator z hooka do
      // tworcy tokena. Dzieki temu liczby zgadzaja sie co do wei z tym, co
      // kontrakt naprawde naliczyl kazdemu adresowi.
      const earningsByAccount = new Map<string, CreatorEarnings & { tokens: Set<Address> }>();
      const addEarned = (accountKey: string, display: Address, token: Address, wei: bigint) => {
        if (wei <= 0n) return;
        const entry =
          earningsByAccount.get(accountKey) ??
          ({ creator: display, totalWei: 0n, tokenCount: 0, graduated: false, tokens: new Set<Address>() } as CreatorEarnings & { tokens: Set<Address> });
        entry.totalWei += wei;
        entry.tokens.add(token);
        if (tokenMeta.get(token)?.graduated) entry.graduated = true;
        earningsByAccount.set(accountKey, entry);
      };
      for (const [accountKey, perToken] of creatorSideEarned) {
        for (const [token, wei] of perToken) {
          if (!tokenMeta.has(token)) continue;
          addEarned(accountKey, accountDisplay.get(accountKey) ?? (accountKey as Address), token, wei);
        }
      }
      for (const [token, wei] of hookCreatorEth) {
        const meta = tokenMeta.get(token);
        if (meta) addEarned(meta.creator.toLowerCase(), meta.creator, token, wei);
      }
      // Ranking Top earnings: NAJPIERW z event-sumy (natychmiast, bez RPC),
      // potem doprecyzowany dokladnym saldem z kontraktu W TLE. Do tablicy
      // wchodza tylko konta z niezerowym saldem.
      const rankTopEarners = (m: typeof earningsByAccount) =>
        [...m.values()]
          .map((entry) => ({ ...entry, tokenCount: entry.tokens.size }))
          .filter((entry) => entry.totalWei > 0n)
          .sort((a, b) => (b.totalWei > a.totalWei ? 1 : b.totalWei < a.totalWei ? -1 : 0))
          .slice(0, 5);
      if (!stale()) setTopEarners(rankTopEarners(earningsByAccount));
      const accountKeys = [...earningsByAccount.keys()];
      if (accountKeys.length > 0) {
        // DOKLADNE saldo = claimable() + hook + vault per adres (jeden multicall3):
        // ta sama liczba co przycisk Claim, z vaultem po graduacji. Skan siega
        // tylko ~okno wstecz, wiec sama event-suma zanizala ranking. Liczymy to
        // W TLE, zeby nie blokowac pierwszego renderu tablicy.
        void (async () => {
          try {
            // Trzy salda NA KAZDE wdrozenie - stare tez trzyma nieodebrane oplaty.
            const perAccount = LAUNCHPAD_DEPLOYMENTS.length * 3;
            const calls = accountKeys.flatMap((acc) =>
              LAUNCHPAD_DEPLOYMENTS.flatMap((d) => [
                { address: d.launchpad as Address, abi: launchpadAbi, functionName: 'claimable', args: [acc as Address] },
                { address: d.hook as Address, abi: hookAbi, functionName: 'claimableEth', args: [acc as Address] },
                { address: d.vault as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [acc as Address] },
              ])
            );
            const balances = await readClient.multicall({ contracts: calls, allowFailure: true });
            const cell = (i: number) => (balances[i]?.status === 'success' ? (balances[i].result as bigint) : 0n);
            accountKeys.forEach((acc, i) => {
              let claimableNow = 0n;
              for (let k = 0; k < perAccount; k++) claimableNow += cell(i * perAccount + k);
              const entry = earningsByAccount.get(acc);
              // NIE nadpisujemy suma do odebrania - patrz `totalEarned`. Kto
              // odebral swoje oplaty, spadal przez to z rankingu do zera.
              if (entry) entry.totalWei = totalEarned(entry.totalWei, claimableNow);
            });
            if (!stale()) setTopEarners(rankTopEarners(earningsByAccount));
          } catch {
            // Multicall padl - zostaje ranking z event-sumy, juz pokazany.
          }
        })();
      }
      live.sort((a, b) => b.raised - a.raised);
      // Swiezy skan NIE zna logo (logo zyje w Blobie, dochodzi ponizej async).
      // Bez przeniesienia logo ze STANU POPRZEDNIEGO (migawka/poprzedni skan)
      // logo migalyby: sa -> setTokens(live) je gubi -> fetchLogos wraca.
      // Przenosimy je po adresie, zeby nigdy nie znikaly.
      if (stale()) return;
      // Logo: ze STANU POPRZEDNIEGO (po adresie), a jak tam brak - z TRWALEJ
      // pamieci (localStorage). Raz zobaczone logo juz nie zniknie.
      const remembered = recallLogos(ACTIVE_LAUNCHPAD_NETWORK.chain.id);
      const nowSec = Math.floor(Date.now() / 1000);
      setTokens((current) => {
        const logoByAddr = new Map<string, string | undefined>();
        for (const token of current) if (token.address) logoByAddr.set(token.address.toLowerCase(), token.logoUrl);
        const scanned = new Set<string>();
        const merged = live.map((token) => {
          const key = token.address?.toLowerCase();
          if (key) scanned.add(key);
          const logo = token.logoUrl ?? (key ? logoByAddr.get(key) ?? remembered[key] : undefined);
          return logo && !token.logoUrl ? { ...token, logoUrl: logo } : token;
        });
        // Wiersz spoza skanu zostaje, dopoki skanowi nie mozna zaufac - patrz
        // `boardScan`. Wyrzucamy dopiero przy skanie kompletnym, bo wtedy
        // nieobecnosc tokena znaczy cos realnego: pochodzi z MARTWEGO wdrozenia
        // i zaden skan go juz nie odda.
        const kept = current.filter((t) => shouldKeepUnscanned(t, { now: nowSec, scanned, trustworthy }));
        return [...merged, ...kept];
      });
      boardHasContentRef.current = true;
      // Zaznaczenie: trzymaj biezacy wybor (moze byc wierszem "kept"), a domysl
      // ustaw tylko gdy nic nie wybrano - inaczej klikniety token spoza skanu
      // gubilby zaznaczenie po kazdym cichym odswiezeniu.
      setSelectedId((current) => current || live[0].id);

      const liveAddresses = live.filter((t) => t.address).map((t) => t.address as string);

      /* ================================================================== */
      /*  CENA I KAPITALIZACJA PO GRADUACJI                                  */
      /* ================================================================== */
      /**
       * Karta tokena po graduacji pokazywala ostatnia cene KRZYWEJ - liczbe z
       * chwili, w ktorej token przestal na niej handlowac. Ta sama martwa cena
       * szla do `ShareToken`, wiec kazda karta udostepniania publikowala kurs
       * sprzed graduacji.
       *
       * Zywa cena jest w `slot0` puli i czyta sie ja przez `StateView` - to ta
       * sama sciezka, ktora ma juz strona tokena (`poolPrice.ts`), wiec obie
       * pokazuja teraz jedna liczbe zamiast dwoch.
       *
       * KOSZT: `positionOf` po poolId i `getSlot0` po cene ida MULTICALLEM, po
       * jednym na rundę niezaleznie od liczby tokenow po graduacji. Podaz
       * (`totalSupply`) dolaczamy do tego samego multicalla. Trzy zapytania na
       * odswiezenie tablicy, nie trzy na token.
       */
      const graduatedTokens = live
        .filter((t) => t.state === 'Graduated' && t.address)
        .map((t) => t.address as Address);
      // token(lowercase) -> poolId(lowercase); zywe zrodlo dla skanu swapow.
      const tokenOfPool = new Map<string, string>();
      // token(lowercase) -> podaz z lancucha. Sluzy DWOM rzeczom: kapitalizacji
      // i dowodowi kompletnosci sald (`supplyReconciles`) - ten sam odczyt.
      const supplyByToken = new Map<string, bigint>();
      if (graduatedTokens.length && STATE_VIEW_ADDRESS) {
        try {
          const positions = await readClient.multicall({
            allowFailure: true,
            contracts: graduatedTokens.map((token) => ({
              address: depOf(token).vault as Address,
              abi: liquidityVaultAbi,
              functionName: 'positionOf' as const,
              args: [token] as const,
            })),
          });
          const poolIds = graduatedTokens.map((token, index) => {
            const result = positions[index];
            if (result?.status !== 'success') return null;
            const poolId = (result.result as readonly [`0x${string}`, bigint, number, number])[0];
            // Pusty poolId znaczy "pula jeszcze nie zalozona" - nie ma o co pytac.
            if (!/^0x[0-9a-fA-F]{64}$/.test(poolId) || /^0x0+$/.test(poolId)) return null;
            tokenOfPool.set(poolId.toLowerCase(), token.toLowerCase());
            return poolId;
          });

          const withPool = graduatedTokens.map((token, index) => ({ token, poolId: poolIds[index] })).filter((e) => e.poolId);
          if (withPool.length) {
            const [slots, supplies, burned] = await Promise.all([
              readClient.multicall({
                allowFailure: true,
                contracts: withPool.map((entry) => ({
                  address: STATE_VIEW_ADDRESS as Address,
                  abi: stateViewAbi,
                  functionName: 'getSlot0' as const,
                  args: [entry.poolId as `0x${string}`] as const,
                })),
              }),
              readClient.multicall({
                allowFailure: true,
                contracts: withPool.map((entry) => ({
                  address: entry.token,
                  abi: totalSupplyAbi,
                  functionName: 'totalSupply' as const,
                })),
              }),
              // Saldo 0xdEaD - kapitalizacja liczy sie od podazy w obiegu, ta
              // sama regula co wykres i karta statystyk na stronie tokena.
              readClient.multicall({
                allowFailure: true,
                contracts: withPool.map((entry) => ({
                  address: entry.token,
                  abi: erc20Abi,
                  functionName: 'balanceOf' as const,
                  args: [DEAD_ADDRESS as Address] as const,
                })),
              }),
            ]);
            const priceByToken = new Map<string, { price: number; mcap?: number }>();
            withPool.forEach((entry, index) => {
              const slot = slots[index];
              if (slot?.status !== 'success') return;
              const sqrt = (slot.result as readonly [bigint, number, number, number])[0];
              // Dziesietnosc B20 to 18 - ta sama, ktorej uzywa cala reszta
              // tablicy przy `formatEther`.
              const priceWei = poolPriceWeiFromSqrt(sqrt, 18);
              if (priceWei <= 0n) return;
              const price = Number(formatEther(priceWei));
              const supply = supplies[index];
              let mcap: number | undefined;
              if (supply?.status === 'success') {
                const total = supply.result as bigint;
                supplyByToken.set(entry.token.toLowerCase(), total);
                const dead = burned[index]?.status === 'success' ? (burned[index].result as bigint) : 0n;
                const circulating = total > dead ? total - dead : total;
                mcap = price * Number(formatEther(circulating));
              }
              priceByToken.set(entry.token.toLowerCase(), { price, mcap });
            });
            if (!stale() && priceByToken.size) {
              setTokens((current) =>
                current.map((t) => {
                  const hit = t.address ? priceByToken.get(t.address.toLowerCase()) : undefined;
                  if (!hit) return t;
                  // `lastPrice` idzie takze do karty udostepniania, wiec to ono
                  // musi byc cena zywa, a nie ostatni punkt krzywej.
                  return { ...t, poolPrice: hit.price, lastPrice: hit.price, marketCapEth: hit.mcap };
                })
              );
            }
          }
        } catch {
          // Pula moze jeszcze nie istniec, a StateView potrafi zarewertowac.
          // Jedno i drugie znaczy tyle samo: zostajemy przy tym, co juz jest.
        }
      }

      /* ================================================================== */
      /*  POSIADACZE I WOLUMEN PULI - doliczane oknami, w tle                */
      /* ================================================================== */
      /**
       * Dwa skany po oknach, po JEDNYM zapytaniu na okno kazdy (patrz
       * `EXTRAS_WINDOW`): `Transfer` po tablicy wszystkich adresow tokenow i
       * `Swap` PoolManagera po tablicy wszystkich poolId. Wynik jest addytywny,
       * wiec znacznik postepu w `localStorage` pozwala kolejnym wejsciom
       * dokladac same nowe bloki.
       *
       * Leci PO ustawieniu wierszy i bez `await` na zewnatrz, bo to jest
       * uzupelnienie, a nie warunek pokazania tablicy: gdy padnie, karta
       * zostaje przy liczbach krzywej pod ich wlasna nazwa.
       */
      void (async () => {
        /**
         * TYLKO TOKENY PO GRADUACJI - i to jest wybor, nie oszczednosc na
         * skroty.
         *
         * Zakres do przeskanowania liczy sie od NAJSTARSZEGO objetego tokena.
         * Wziecie wszystkich tokenow cofneloby dno do bloku wdrozenia
         * launchpada, czyli o 1,28 mln blokow (zmierzone 10 wrzesnia 2026) -
         * 640 okien po 2 000, ktorych publiczny RPC nie odda ani dzis, ani za
         * miesiac. Tokeny na krzywej i tak nie potrzebuja tej pracy: cala ich
         * historia to `Bought`/`Sold`, ktore glowny skan juz ma.
         *
         * Problem jest wylacznie po graduacji, bo tam handel wychodzi poza
         * krzywa - i dokladnie tam ten skan siega. Dla $SPHERE dno to blok
         * jego startu, czyli 187 okien zamiast 640, i tylko przy pierwszym
         * wejsciu.
         *
         * Reszta tokenow dostaje uczciwy podpis ("traders", "curve vol"), a nie
         * zgadnieta liczbe.
         */
        if (!graduatedTokens.length) return;
        const wanted = graduatedTokens.map((t) => t.toLowerCase());

        /**
         * DNO SKANU: NAJWCZESNIEJSZY START WSROD OBJETYCH TOKENOW.
         *
         * Dwa zrodla, bierzemy NIZSZE, bo za nisko kosztuje kilka okien, a za
         * wysoko kosztuje poprawnosc:
         *
         *   1. `order` z agregatu (`blok * 10 000 + logIndex`) - dokladny, ale
         *      jest tylko wtedy, gdy glowny skan zszedl do zdarzen tokena;
         *   2. `startedAt` z kontraktu przeliczony tempem blokow sieci - zawsze
         *      dostepny, ale to SZACUNEK, wiec z zapasem: polowa wiecej blokow,
         *      niz wychodzi z rachunku, plus staly bufor. Zapas jest po to, zeby
         *      dryf czasu blokow nie ucial nam pierwszych transferow.
         *
         * Szacunek nie musi byc trafiony, bo nie on rozstrzyga o zaufaniu -
         * rozstrzyga `supplyReconciles`, ktory porownuje odtworzona emisje z
         * `totalSupply` z lancucha. Za wysokie dno po prostu nie przejdzie tego
         * testu i karta zostanie przy podpisach krzywej.
         */
        let floor = LAUNCHPAD_DEPLOY_BLOCK;
        {
          const nowSeconds = Math.floor(Date.now() / 1000);
          const perBlock = ACTIVE_LAUNCHPAD_NETWORK.secondsPerBlock;
          const candidates = graduatedTokens
            .map((token) => {
              const orders = [
                ...(priceEntries.get(token) ?? []).map((p) => p.order),
                ...rawFeed.filter((entry) => entry.token === token).map((entry) => entry.order),
              ];
              const fromOrder = orders.length ? BigInt(Math.floor(Math.min(...orders) / 10_000)) : null;

              const startedAt = live.find((row) => row.address === token)?.startedAt ?? 0;
              let fromClock: bigint | null = null;
              if (startedAt > 0 && startedAt < nowSeconds && perBlock > 0) {
                const blocksBack = BigInt(Math.ceil(((nowSeconds - startedAt) / perBlock) * 1.5)) + 10_000n;
                fromClock = latest > blocksBack ? latest - blocksBack : 0n;
              }

              const both = [fromOrder, fromClock].filter((b): b is bigint => b !== null && b > 0n);
              return both.length ? both.reduce((min, block) => (block < min ? block : min)) : null;
            })
            .filter((block): block is bigint => block !== null);
          if (candidates.length) {
            const earliest = candidates.reduce((min, block) => (block < min ? block : min));
            if (earliest > floor) floor = earliest;
          }
          /**
           * DNO ZAOKRAGLAMY W DOL DO SIATKI - inaczej wznowienie nie dziala.
           *
           * Skladnik zegarowy liczy sie od `Date.now()`, wiec przy KAZDYM
           * wejsciu wychodzi o kilkadziesiat blokow nizej niz poprzednio.
           * `planExtrasScan` widzi wtedy migawke zaczynajaca sie WYZEJ niz
           * biezace dno i - slusznie - odrzuca ja jako niepelna. Efekt byl
           * taki, ze skan zaczynal od zera przy kazdym odswiezeniu i nigdy nie
           * dochodzil do glowy (zmierzone: dno 50 552 013, potem 50 551 982,
           * potem 50 551 909 - trzy restarty pod rzad).
           *
           * Na siatce co 100 000 blokow dno stoi w miejscu przez kilka dni, a
           * gdy w koncu zeskoczy o krok, kosztuje to jedno przeliczenie od nowa
           * - nigdy poprawnosc, bo ta i tak jest sprawdzana `supplyReconciles`.
           */
          const GRID = 100_000n;
          floor = (floor / GRID) * GRID;
          if (floor < LAUNCHPAD_DEPLOY_BLOCK) floor = LAUNCHPAD_DEPLOY_BLOCK;
        }

        const cachedExtras = loadExtras(ACTIVE_LAUNCHPAD_NETWORK.chain.id, LAUNCHPAD_ADDRESS);
        const { from, base: extras } = planExtrasScan({ cached: cachedExtras, head: latest, floor, tokens: wanted });

        const poolIds = [...tokenOfPool.keys()] as `0x${string}`[];
        const window = logWindow;

        // Okna liczymy z gory i strzelamy partiami, tak jak glowny skan. Kazde
        // okno to DWA zapytania niezaleznie od liczby tokenow: jedno po
        // `Transfer` calej listy adresow, jedno po `Swap` calej listy pul.
        const ranges: Array<{ from: bigint; to: bigint }> = [];
        for (let cursor = from; cursor <= latest && ranges.length < EXTRAS_MAX_WINDOWS_PER_VISIT; ) {
          const to = cursor + window - 1n < latest ? cursor + window - 1n : latest;
          ranges.push({ from: cursor, to });
          cursor = to + 1n;
        }

        let failed = false;
        for (let i = 0; i < ranges.length && !failed; i += EXTRAS_CONCURRENCY) {
          const batch = ranges.slice(i, i + EXTRAS_CONCURRENCY);
          const results = await Promise.all(
            batch.map(async (range) => {
              /**
               * PONAWIAMY Z ODCZEKANIEM, bo publiczny RPC odbija 429 przy
               * serii, a nie dlatego, ze danych nie ma. Bez tego skan urywal sie
               * po ~11 oknach z 285 i nie mial szans domknac zakresu - a
               * niedomkniety zakres to brak liczby, nie zla liczba, wiec objawem
               * bylo wieczne "traders" zamiast "holders".
               *
               * Ponawiamy TO SAMO okno: pominiecie go zrobiloby dziure w sumie
               * addytywnej, ktorej pozniej nikt nie odrozni od prawdy.
               */
              for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                  return await Promise.all([
                    readClient.getLogs({ address: graduatedTokens, event: TRANSFER_EVENT, fromBlock: range.from, toBlock: range.to }),
                    poolIds.length
                      ? readClient.getLogs({
                          address: ACTIVE_LAUNCHPAD_NETWORK.poolManager as Address,
                          event: POOL_SWAP_EVENT,
                          args: { id: poolIds },
                          fromBlock: range.from,
                          toBlock: range.to,
                        })
                      : Promise.resolve([]),
                  ]);
                } catch (error) {
                  // Blad o zakresie nie minie po odczekaniu - okno jest po
                  // prostu za szerokie. Zapamietujemy limit i konczymy; wezsze
                  // okna zbuduje kolejne wejscie.
                  if (narrowLogWindow(error)) return null;
                  await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
                }
              }
              return null;
            })
          );

          for (let j = 0; j < results.length; j += 1) {
            const result = results[j];
            if (!result) {
              // Padniete okno to DZIURA w sumie addytywnej, ktorej nikt pozniej
              // nie odrozni od prawdy. Urywamy na NIM, zapisujemy tylko ciagly
              // poczatek, a reszte dolozy kolejne wejscie.
              failed = true;
              break;
            }
            const [transfers, swaps] = result;
            applyTransferLogs(
              extras,
              transfers.map((log) => ({
                address: log.address,
                from: log.args.from as string | undefined,
                to: log.args.to as string | undefined,
                value: log.args.value as bigint | undefined,
              }))
            );
            applySwapLogs(
              extras,
              (swaps as Array<{ args: Record<string, unknown> }>).map((log) => ({
                poolId: log.args.id as string | undefined,
                amount0: log.args.amount0 as bigint | undefined,
              })),
              tokenOfPool
            );
            extras.lastBlock = batch[j].to;
          }
        }

        // `complete` znaczy: zakres jest ciagly od `fromBlock` AZ DO glowy.
        // Dopiero wtedy salda sa saldami, a nie ich fragmentem.
        extras.complete = !failed && extras.lastBlock >= latest;
        saveExtras(ACTIVE_LAUNCHPAD_NETWORK.chain.id, LAUNCHPAD_ADDRESS, extras);
        if (stale() || !extras.complete) return;

        // PoolManager trzyma plynnosc puli, wiec ma saldo - ale rynek nie jest
        // swoim wlasnym uczestnikiem. Wyrzucamy go z liczenia.
        // Salda, ktore istnieja, ale nie naleza do zadnego czlowieka: plynnosc
        // puli, skarbiec, hook i adres bez klucza (`0x...dead` - tam na $SPHERE
        // lezy 59 mln tokenow, ktorych nikt juz nie ruszy).
        const exclude = [ACTIVE_LAUNCHPAD_NETWORK.poolManager, ...LIQUIDITY_VAULT_ADDRESSES, ...LAUNCH_HOOK_ADDRESSES, BURN_SINK];
        setTokens((current) =>
          current.map((t) => {
            if (!t.address) return t;
            const count = holderCount(extras, t.address, { exclude, totalSupply: supplyByToken.get(t.address.toLowerCase()) });
            // Wolumen puli bierze sie z TEGO SAMEGO zakresu blokow, co salda, a
            // pula powstaje pozniej niz token. Dowod z podazy (zaszyty w
            // `holderCount`) obejmuje wiec i ja: gdy on nie przechodzi, wolumen
            // tez nie ma prawa isc na ekran.
            const pool = count === null ? null : poolVolumeEth(extras, t.address);
            return { ...t, holderCount: count, holders: count ?? t.holders, poolVolume: pool };
          })
        );
      })();

      /**
       * INDEKS JAKO DRUGIE ZDANIE, NIE JAKO `Math.max`.
       *
       * Blockscout bywa szybszy niz nasz skan okien, wiec zostaje - ale tylko
       * wtedy, gdy sam pokazuje, ze nadaza (`indexLooksCaughtUp`, patrz
       * `blockscout.ts`). Dla $SPHERE tego dnia NIE nadazal: oddawal osiem
       * posiadaczy i zero transferow przy 6 063 policzonych z logow. Stara
       * regula `Math.max` ratowala przed pokazaniem tej osemki, ale kosztem
       * pokazania czterdziestki - czyli liczby handlujacych na krzywej pod
       * nazwa posiadaczy. Zadna z tych dwoch liczb nie byla liczba posiadaczy.
       */
      void fetchTokenCountersBatch(ACTIVE_LAUNCHPAD_NETWORK.chain.id, liveAddresses).then((counters) => {
        if (stale() || Object.keys(counters).length === 0) return;
        setTokens((current) =>
          current.map((t) => {
            const key = t.address?.toLowerCase();
            if (!key) return t;
            // Skan lancucha jest zrodlem PEWNIEJSZYM - gdy juz policzyl, indeks
            // nie ma go po co nadpisywac.
            if (t.holderCount != null) return t;
            if (!indexLooksCaughtUp(counters[key], t.trades ?? 0)) return t;
            const holders = counters[key].holders as number;
            return { ...t, holderCount: holders, holders };
          })
        );
      });
    } catch (error) {
      // Tablica podgladowa zostaje na ekranie - pusty widok wygladalby jak
      // "nikt jeszcze nic nie wystartowal", a to jest awaria odczytu.
      setBoardError(error instanceof Error ? error.message.split('\n')[0] : String(error));
    } finally {
      setLoadingBoard(false);
    }
    // `replaceFeed` jest stabilne (useCallback z pusta lista), wiec nie
    // przeladowuje tablicy - stoi tu, bo lint ma racje, ze jest uzywane.
  }, [readClient, replaceFeed]);

  // MIGAWKA: przy wejsciu pokazujemy od razu ostatni znany stan (z logami)
  // z localStorage, a skan lancucha lecí w tle i aktualizuje. Koniec z pustym
  // ekranem i znikajacymi logami przy kazdym odswiezeniu. Robimy to RAZ.
  const snapshotRestored = useRef(false);
  useEffect(() => {
    if (snapshotRestored.current) return;
    snapshotRestored.current = true;
    const cached = loadSnapshot<BoardToken>(BOARD_CACHE_KEY);
    if (cached && cached.length) {
      setTokens(cached);
      setSelectedId((current) => current || cached[0].id);
      setLoadingBoard(false);
      // Mamy tresc z migawki - kolejny loadBoard odswieza CICHO, bez spinnera.
      boardHasContentRef.current = true;
    }
    // Live tape z migawki - pasek pokazuje sie OD RAZU zamiast pusty przez caly
    // skan; skan i subskrypcja nadpisza go sekundy pozniej.
    const cachedFeed = loadFeedSnapshot<ActivityItem>(BOARD_CACHE_KEY);
    if (cachedFeed && cachedFeed.length) setActivityFeed(cachedFeed);
  }, []);

  // Dogranie zaleglych profili (logo/opis), ktorych start nie zdolal wyslac -
  // brak sesji SIWE albo wyscig z RPC zostawialy logo tylko w localStorage
  // tworcy. Kolejka trzyma takie wpisy, a kazde wejscie na tablice probuje je
  // dopchnac na serwer. Po sukcesie mapa logo z Bloba wchodzi z pominieciem
  // cache, zeby data-URL zszedl z ekranu od razu, nie po TTL.
  useEffect(() => {
    const chainId = ACTIVE_LAUNCHPAD_NETWORK.chain.id;
    void flushPendingProfiles(browserStorage(), chainId, Date.now(), (entry) =>
      postProfileWithRetry(() => sendTokenProfile(entry), { expectLogo: entry.logoUrl !== null, attempts: 2 })
    ).then(({ saved }) => {
      if (saved === 0) return;
      void fetchLogos(chainId, { bust: true }).then((logos) => {
        setTokens((current) =>
          current.map((row) => {
            const url = row.address ? logos[row.address.toLowerCase()] : undefined;
            return url && url !== row.logoUrl ? { ...row, logoUrl: url } : row;
          })
        );
      });
    });
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  // Zapis migawki przy kazdej zmianie realnych (nie-podgladowych) tokenow -
  // lapie tez logo scalone z Bloba, wiec po reloadzie sa od razu.
  useEffect(() => {
    const real = tokens.filter((token) => token.live);
    if (real.length) saveSnapshot(BOARD_CACHE_KEY, real);
  }, [tokens]);

  // Migawka live tape, zeby przy nastepnym wejsciu pasek byl od razu. Wiersze
  // „pending" do niej NIE ida: transakcja czekajaca na blok jest stanem tej
  // sesji, a nie faktem - po przeladowaniu wisialaby jako wieczne oczekiwanie.
  useEffect(() => {
    const landed = activityFeed.filter((item) => !item.pending);
    if (landed.length) saveFeedSnapshot(BOARD_CACHE_KEY, landed);
  }, [activityFeed]);

  /**
   * NA ZYWO. `loadBoard` przemiata cala historie w oknach po 1900 blokow i
   * trwa sekundy - wolanie go co kilka sekund byloby marnotrawstwem i tak
   * czy owak spoznialoby sie o caly przebieg.
   *
   * Tu jest odwrotnie: subskrypcja dokłada POJEDYNCZE zdarzenia do stanu,
   * ktory juz jest na ekranie. Rezerwa nie jest doliczana po naszej stronie -
   * bierzemy `ethReserveAfter` PROSTO ZE ZDARZENIA, wiec liczba na ekranie
   * pochodzi z lancucha, a nie z naszej arytmetyki, ktora moglaby sie z nim
   * rozjechac.
   *
   * `poll: true` jest konieczne: publiczny RPC Base Sepolia nie utrzymuje
   * filtrow, wiec `eth_newFilter` gasnie i subskrypcja po cichu przestaje
   * cokolwiek oddawac.
   */
  useEffect(() => {
    if (!readClient) return;

    const unwatch = readClient.watchContractEvent({
      // Wszystkie wdrozenia - stare dalej handluja krzywymi, ktore nie awansowaly.
      address: LAUNCHPAD_ADDRESSES as Address[],
      abi: launchpadAbi,
      // Tempo idzie z konfiguracji sieci (patrz `liveWatchFor`): raz na blok,
      // gdy stoimy na wlasnym RPC, osiem sekund na publicznym.
      poll: LIVE_WATCH.poll,
      pollingInterval: LIVE_WATCH.pollingInterval,
      // Bez tego viem wypisuje kazde odbicie publicznego RPC do konsoli. Zywy
      // podglad jest DODATKIEM - tablica ma juz dane z `loadBoard`, wiec cicha
      // przerwa w subskrypcji jest wlasciwym zachowaniem, a nie awaria.
      onError: () => {},
      onLogs: (logs) => {
        const fresh: ActivityItem[] = [];
        /** Hasze transakcji z tej paczki - po nich znika wiersz „pending". */
        const freshHashes: string[] = [];

        for (const log of logs) {
          const decoded = log as unknown as { eventName?: string; args?: Record<string, unknown>; transactionHash?: string; address?: string };
          const token = decoded.args?.token as Address | undefined;
          const eventName = decoded.eventName;
          if (!token || !eventName) continue;
          const id = `${decoded.transactionHash ?? ''}-${eventName}-${String(log.logIndex ?? 0)}`;
          if (decoded.transactionHash) freshHashes.push(decoded.transactionHash);

          if (eventName === 'Launched') {
            const symbol = (decoded.args?.symbol as string) ?? shortAddress(token);
            fresh.push({ id, address: token, symbol, accent: accentFor(token), label: 'Launched', tone: 'launch' });
            setTokens((current) => {
              if (current.some((row) => row.address?.toLowerCase() === token.toLowerCase())) return current;
              const dep = deploymentOrOldest(decoded.address);
              const row: BoardToken = {
                id: token,
                address: token,
                launchpad: dep.launchpad,
                version: dep.version,
                name: (decoded.args?.name as string) ?? symbol,
                symbol,
                creator: (decoded.args?.creator as string) ?? '',
                state: 'Curve',
                raised: 0,
                target: CURVE_TARGET_ETH,
                holders: 0,
                age: 'just now',
                accent: accentFor(token),
                live: true,
                volume: 0,
                trades: 0,
                // Event niesie `startedAt`, ale tutaj wystarczy zegar - blok
                // wlasnie sie pojawil, a dokladna wartosc przyjdzie z loadBoard.
                startedAt: Math.floor(Date.now() / 1000),
                prices: [],
              };
              // Wiersze podgladowe znikaja przy pierwszym prawdziwym starcie -
              // mieszanie ich z zywymi danymi bylo by mylace.
              const withoutPreview = current.filter((existing) => existing.live);
              return [row, ...withoutPreview];
            });
            continue;
          }

          if (eventName === 'CurveLocked' || eventName === 'Graduated') {
            const graduated = eventName === 'Graduated';
            fresh.push({
              id,
              address: token,
              symbol: shortAddress(token),
              accent: accentFor(token),
              label: graduated ? 'Graduated' : 'Curve closed',
              tone: 'graduate',
            });
            // Stan tokena zmienia sie TU, a nie przy nastepnym przeladowaniu
            // tablicy. Bez tego wiersz nadal zapraszal do kupna, ktore juz
            // rewertuje.
            setTokens((current) =>
              current.map((row) =>
                row.address?.toLowerCase() === token.toLowerCase()
                  ? { ...row, state: graduated ? 'Graduated' : 'Locked' }
                  : row
              )
            );
            continue;
          }

          if (eventName !== 'Bought' && eventName !== 'Sold') continue;

          const isBuy = eventName === 'Bought';
          const eth = (isBuy ? decoded.args?.ethNet : decoded.args?.ethOut) as bigint | undefined;
          const reserveAfter = decoded.args?.ethReserveAfter as bigint | undefined;
          const tokenReserveAfter = decoded.args?.tokenReserveAfter as bigint | undefined;
          const price = reserveAfter !== undefined && tokenReserveAfter !== undefined && tokenReserveAfter > 0n
            ? spotPriceFromReserves(reserveAfter, tokenReserveAfter)
            : null;
          fresh.push({
            id,
            address: token,
            symbol: shortAddress(token),
            accent: accentFor(token),
            label: isBuy ? 'Buy' : 'Sell',
            eth: eth === undefined ? undefined : Number(formatEther(eth)),
            tone: isBuy ? 'buy' : 'sell',
          });

          flashSeq.current += 1;
          const seq = flashSeq.current;
          setTokens((current) =>
            current.map((row) => {
              if (row.address?.toLowerCase() !== token.toLowerCase()) return row;
              return {
                ...row,
                raised: reserveAfter === undefined ? row.raised : Number(formatEther(reserveAfter)),
                trades: (row.trades ?? 0) + 1,
                volume: (row.volume ?? 0) + (eth === undefined ? 0 : Number(formatEther(eth))),
                prices: price === null ? row.prices : [...(row.prices ?? []), price].slice(-12),
                lastPrice: price ?? row.lastPrice,
                lastTradeAt: Date.now(),
                // Blysk wygasa po stronie CSS; pola nie czyscimy, bo kolejny
                // seq i tak restartuje animacje od zera.
                flash: { tone: isBuy ? 'buy' : 'sell', seq },
              };
            })
          );
        }

        if (fresh.length === 0) return;
        setActivityFeed((current) => {
          // Ten sam log potrafi przyjsc dwa razy przy reorganizacji lancucha.
          const seen = new Set(current.map((item) => item.id));
          const unique = fresh.filter((item) => !seen.has(item.id));
          if (unique.length === 0) return current;
          // Wlasna transakcja czeka tu juz jako wiersz „pending". Teraz przyszlo
          // jej prawdziwe zdarzenie, wiec podmieniamy jedno na drugie zamiast
          // pokazywac te sama transakcje dwa razy.
          const landed = new Set(freshHashes);
          const withoutPending = current.filter((item) => !(item.pending && item.txHash && landed.has(item.txHash)));
          return [...unique.reverse(), ...withoutPending].slice(0, 24);
        });
      },
    });

    return () => {
      unwatch();
    };
  }, [readClient]);

  /**
   * NA ZYWO PO GRADUACJI.
   *
   * Watcher wyzej sluchał WYLACZNIE launchpada, a launchpad milknie w chwili
   * graduacji - dalszy handel dzieje sie w PoolManagerze. Skutek: token,
   * ktoremu sie udalo, znikal z tasmy zdarzen na zawsze. $SPHERE mial 10.09.2026
   * ponad 2 500 swapow w puli i ani jednego wiersza na zywym pasku, wiec
   * wygladal na martwy dokladnie wtedy, gdy byl najbardziej zywy.
   *
   * Tu nadrabiamy ten kawalek: dla zgraduowanych wierszy czytamy poolId ze
   * skarbca (`positionOf`), a potem jeden watcher obejmuje wszystkie te pule
   * naraz - viem robi z tablicy tematow filtr "albo-albo", wiec to jedna
   * subskrypcja, nie jedna na token.
   */
  const graduatedKey = useMemo(
    () =>
      tokens
        .filter((row) => row.state === 'Graduated' && row.address)
        // Adres tokena + jego launchpad: pozycja LP siedzi w vaulcie TEGO wdrozenia.
        .map((row) => `${(row.address as string).toLowerCase()}@${row.launchpad ?? ''}`)
        .sort()
        .join(','),
    [tokens]
  );

  const [gradPools, setGradPools] = useState<Array<{ token: Address; poolId: `0x${string}` }>>([]);

  useEffect(() => {
    if (!readClient || !graduatedKey || !LIQUIDITY_VAULT_ADDRESS) {
      setGradPools([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const out: Array<{ token: Address; poolId: `0x${string}` }> = [];
      for (const entry of graduatedKey.split(',')) {
        const [address, launchpad] = entry.split('@') as [Address, string];
        try {
          const position = (await readClient.readContract({
            address: deploymentOrOldest(launchpad).vault as Address,
            abi: liquidityVaultAbi,
            functionName: 'positionOf',
            args: [address],
          })) as readonly [`0x${string}`, bigint, number, number];
          const poolId = position[0];
          if (/^0x[0-9a-fA-F]{64}$/.test(poolId) && !/^0x0+$/.test(poolId)) out.push({ token: address, poolId });
        } catch {
          // Token spoza tego wdrozenia albo lag wezla - nastepne odswiezenie
          // tablicy sprobuje jeszcze raz.
        }
      }
      if (!cancelled) setGradPools(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [readClient, graduatedKey]);

  /**
   * ZASIEW TASMY Z PULI. Subskrypcja nizej lapie tylko to, co wydarzy sie przy
   * otwartej stronie - po odswiezeniu tasma znowu nie mialaby ani jednego
   * wiersza zgraduowanego tokena i ten wygladalby na martwy, mimo ze pula
   * chodzi. Dociagamy wiec ostatnie swapy z tej samej trasy, z ktorej korzysta
   * strona tokena; odpowiedz jest w cache'u brzegowym, wiec to jedno zapytanie
   * na wielu ogladajacych.
   */
  useEffect(() => {
    if (gradPools.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const entry of gradPools) {
        try {
          const query = new URLSearchParams({
            chainId: String(ACTIVE_LAUNCHPAD_NETWORK.chain.id),
            poolId: entry.poolId,
            decimals: '18',
            fromBlock: '0',
          });
          const response = await fetch(`/api/launchpad/pool-swaps?${query.toString()}`, {
            signal: AbortSignal.timeout(15_000),
          });
          if (!response.ok || cancelled) continue;
          const data = (await response.json()) as { swaps?: string[] };
          const rows = Array.isArray(data.swaps) ? data.swaps.slice(-12) : [];
          if (cancelled || rows.length === 0) continue;
          const fresh: ActivityItem[] = [];
          for (const row of rows.reverse()) {
            // Kodowanie wspolne z historia krzywej: kind|account|eth|...|logIndex|ts|txHash
            const parts = row.split('|');
            if (parts.length < 10) continue;
            const isBuy = parts[0] === 'b';
            fresh.push({
              id: `${parts[9]}-swap-${parts[7]}`,
              address: entry.token,
              symbol: symbolOf(entry.token),
              accent: accentFor(entry.token),
              label: isBuy ? 'Pool buy' : 'Pool sell',
              eth: Number(formatEther(BigInt(parts[2]))),
              tone: isBuy ? 'buy' : 'sell',
              source: 'pool',
            });
          }
          if (fresh.length === 0) continue;
          setActivityFeed((current) => {
            const seen = new Set(current.map((item) => item.id));
            const unique = fresh.filter((item) => !seen.has(item.id));
            return unique.length === 0 ? current : [...unique, ...current].slice(0, 24);
          });
        } catch {
          // Zasiew jest wygoda, nie warunkiem - subskrypcja nizej dziala tak czy tak.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gradPools, symbolOf]);

  useEffect(() => {
    if (!readClient || gradPools.length === 0) return;
    const byPool = new Map(gradPools.map((entry) => [entry.poolId.toLowerCase(), entry.token]));

    const unwatch = readClient.watchEvent({
      address: ACTIVE_LAUNCHPAD_NETWORK.poolManager,
      event: POOL_SWAP_EVENT,
      args: { id: gradPools.map((entry) => entry.poolId) },
      poll: LIVE_WATCH.poll,
      pollingInterval: LIVE_WATCH.pollingInterval,
      onError: () => {},
      onLogs: (logs) => {
        const fresh: ActivityItem[] = [];
        for (const log of logs) {
          const args = (log as unknown as { args?: Record<string, unknown> }).args ?? {};
          const token = byPool.get(String(args.id ?? '').toLowerCase());
          const amount0 = args.amount0 as bigint | undefined;
          const sqrtPriceX96 = args.sqrtPriceX96 as bigint | undefined;
          if (!token || amount0 === undefined) continue;

          // Znaki delt sa z perspektywy swapujacego (zweryfikowane na zywym
          // auto-burnie): amount0 < 0 = zaplacil ETH, czyli KUPIL token.
          const isBuy = amount0 < 0n;
          const eth = Number(formatEther(amount0 < 0n ? -amount0 : amount0));
          const price =
            sqrtPriceX96 === undefined ? null : Number(formatEther(poolPriceWeiFromSqrt(sqrtPriceX96, 18)));

          fresh.push({
            id: `${(log as unknown as { transactionHash?: string }).transactionHash ?? ''}-swap-${String((log as unknown as { logIndex?: number }).logIndex ?? 0)}`,
            address: token,
            symbol: symbolOf(token),
            accent: accentFor(token),
            // Etykieta mowi, ze to juz pula, a nie krzywa - inaczej dwa rozne
            // rynki wygladalyby na tasmie identycznie.
            label: isBuy ? 'Pool buy' : 'Pool sell',
            eth,
            tone: isBuy ? 'buy' : 'sell',
            source: 'pool',
          });

          flashSeq.current += 1;
          const seq = flashSeq.current;
          setTokens((current) =>
            current.map((row) => {
              if (row.address?.toLowerCase() !== token.toLowerCase()) return row;
              return {
                ...row,
                trades: (row.trades ?? 0) + 1,
                volume: (row.volume ?? 0) + eth,
                prices: price === null ? row.prices : [...(row.prices ?? []), price].slice(-12),
                lastPrice: price ?? row.lastPrice,
                lastTradeAt: Date.now(),
                flash: { tone: isBuy ? 'buy' : 'sell', seq },
              };
            })
          );
        }

        if (fresh.length === 0) return;
        setActivityFeed((current) => {
          const seen = new Set(current.map((item) => item.id));
          const unique = fresh.filter((item) => !seen.has(item.id));
          if (unique.length === 0) return current;
          return [...unique.reverse(), ...current].slice(0, 24);
        });
      },
    });

    return () => {
      unwatch();
    };
  }, [readClient, gradPools, symbolOf]);

  /**
   * Logo tokenow z VERCEL BLOB (przez /api/startpad/logos), NIE z Firestore.
   * Firestore trzymal logo jako data-URL i egress zabijal darmowy limit; teraz
   * obrazki zyja na CDN Bloba, a to jest tylko mapa token->URL. Brak logo nie
   * jest bledem - tablica dziala bez ani jednego.
   */
  useEffect(() => {
    const hasAny = tokens.some((token) => token.address);
    if (!hasAny) return;
    let cancelled = false;
    const chainId = ACTIVE_LAUNCHPAD_NETWORK.chain.id;

    const apply = (logos: Record<string, string>) => {
      if (cancelled || Object.keys(logos).length === 0) return;
      setTokens((current) =>
        current.map((row) => {
          const url = row.address ? logos[row.address.toLowerCase()] : undefined;
          return url && url !== row.logoUrl ? { ...row, logoUrl: url } : row;
        })
      );
    };

    // 1) Natychmiast z TRWALEJ pamieci - znane logo bez czekania na siec.
    const remembered = recallLogos(chainId);
    apply(remembered);
    // 2) Sa adresy BEZ logo? Ktos mogl przed chwila je dodac - pomijamy 60s
    //    cache, i probujemy jeszcze raz po 15s (Blob bywa spozniony). Gdy logo
    //    nigdy nie dojdzie (upload bez sesji SIWE), po jednej probie odpuszczamy.
    const missing = tokens.some((t) => t.address && !t.logoUrl && !remembered[t.address.toLowerCase()]);
    void fetchLogos(chainId, missing ? { bust: true } : undefined).then(apply);
    const retry = missing ? setTimeout(() => void fetchLogos(chainId, { bust: true }).then(apply), 15_000) : undefined;

    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
    };
    // Zalezy od zestawu adresow, nie od calej tablicy - inaczej wlasny setTokens
    // wywolywalby ten efekt w kolko.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens.map((token) => token.address ?? '').join(',')]);

  /**
   * Zakladki sortujace zamiast filtrow. Kazda oddaje NOWA tablice, wiec
   * `sort` nigdy nie przestawia stanu w miejscu.
   */
  const visibleTokens = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = tokens.filter((token) => !normalized || `${token.name} ${token.symbol} ${token.creator}`.toLowerCase().includes(normalized));
    // Token pada jest przypiety na gorze KAZDEJ zakladki - bez tego "New"
    // zatopiloby go pod kolejnymi launchami. To jedyna ingerencja: dane
    // rynkowe i sortowanie reszty listy zostaja nietkniete, a wyszukiwarka
    // dziala normalnie (jesli fraza go nie lapie, nie ma go wcale).
    const pinSphere = (rows: BoardToken[]) => {
      const i = rows.findIndex(isSphereRow);
      if (i <= 0) return rows;
      const [sphere] = rows.splice(i, 1);
      rows.unshift(sphere);
      return rows;
    };
    switch (tab) {
      case 'new':
        return pinSphere([...matches].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)));
      case 'trending': {
        const rows = [...matches].sort((a, b) => volumeParts(b).eth - volumeParts(a).eth);
        if (animationsOn) {
          // Swiezo handlowany token skacze na gore. Celowo ulotne: sortowanie
          // odswieza sie przy kazdym evencie, a po cichym kwadransie wraca
          // porzadek po wolumenie - bez zadnego timera.
          const now = Date.now();
          const heat = (row: BoardToken) => (row.lastTradeAt && now - row.lastTradeAt < HOT_TRADE_WINDOW_MS ? row.lastTradeAt : 0);
          rows.sort((a, b) => heat(b) - heat(a) || volumeParts(b).eth - volumeParts(a).eth);
        }
        return pinSphere(rows);
      }
      case 'about':
        // Locked to token, ktory ma krzywa DOMKNIETA i czeka juz tylko na
        // `graduate()` - czyli najblizszy awansu ze wszystkich. Filtr bral
        // sam stan Curve, wiec taki token nie pojawial sie ani tutaj, ani w
        // "Graduated", i znikal z tablicy poza zakladki New/Trending/All.
        return pinSphere(
          matches
            .filter((token) => token.state === 'Curve' || token.state === 'Locked')
            .sort((a, b) => Number(b.state === 'Locked') - Number(a.state === 'Locked') || b.raised - a.raised)
        );
      case 'graduated':
        return pinSphere(matches.filter((token) => token.state === 'Graduated'));
      default:
        return pinSphere([...matches]);
    }
  }, [animationsOn, query, tab, tokens]);

  // Strona rynku pokazuje 8 pozycji naraz + przelacznik stron - okienko nie
  // renderuje kilkudziesieciu wierszy naraz. Reset strony przy zmianie
  // filtra/wyszukiwania/widoku, zeby nie utknac na pustej stronie.
  const BOARD_PAGE = 8;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(visibleTokens.length / BOARD_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedTokens = visibleTokens.slice(safePage * BOARD_PAGE, safePage * BOARD_PAGE + BOARD_PAGE);
  useEffect(() => {
    setPage(0);
  }, [tab, query, view]);

  const selected = tokens.find((token) => token.id === selectedId) ?? visibleTokens[0] ?? tokens[0];
  const onSepolia = chainId === LAUNCHPAD_CHAIN.id;
  /*
   * SUMY LICZA SIE TYLKO Z ZYWYCH WIERSZY - patrz komentarz przy imporcie
   * `previewTokens`. Atrapa moze stac w siatce z plakietka SAMPLE, ale nie ma
   * prawa dolozyc sie do liczby, ktora naglowek podaje jako stan calej sieci.
   * Przy pustym boardzie daje to uczciwe zera zamiast zmyslonych 15 433 USDC.
   */
  const liveTokens = tokens.filter((token) => token.live);
  const liveCount = liveTokens.filter((token) => token.state === 'Curve').length;
  const totalRaised = liveTokens.reduce((sum, token) => sum + token.raised, 0);
  // Suma tego, co karty naprawde pokazuja: krzywa plus pula tam, gdzie pula
  // jest juz policzona. Sumowanie samych krzywych dawaloby naglowek nizszy niz
  // wiersze pod nim.
  const totalVolume = liveTokens.reduce((sum, token) => sum + volumeParts(token).eth, 0);
  const totalTrades = liveTokens.reduce((sum, token) => sum + (token.trades ?? 0), 0);
  const showingPreview = !tokens.some((token) => token.live);

  // Krol wzgorza istnieje tylko wsrod ZYWYCH krzywych - wiersz podgladowy na
  // tronie wygladalby jak prawdziwy lider rynku, ktorego nie ma.
  const kingToken = useMemo(() => {
    const curveTokens = tokens.filter((token) => token.live && token.state === 'Curve');
    if (curveTokens.length === 0) return null;
    return curveTokens.reduce((best, token) => (token.raised > best.raised ? token : best));
  }, [tokens]);

  // Tokeny wystartowane z podlaczonego portfela - sekcja "My tokens" widzi
  // tylko zywe wiersze, bo probki nie maja prawdziwego tworcy.
  const myTokens = useMemo(() => {
    if (!address) return [];
    const mine = address.toLowerCase();
    return tokens.filter((token) => token.live && token.creator.toLowerCase() === mine);
  }, [address, tokens]);

  // Tasma zdarzen zna tylko adres tokena; logo i czytelny symbol doklejamy
  // z tablicy rynku przy renderze, wiec pozniejsze dociagniecie profili
  // (Firestore) samo poprawia juz wyswietlone wpisy.
  const feedEvents = useMemo(() => {
    const byAddress = new Map<string, BoardToken>();
    for (const token of tokens) {
      if (token.address) byAddress.set(token.address.toLowerCase(), token);
    }
    return activityFeed.map((event) => {
      // Kwota doklejana TUTAJ, nie przy skanie - kurs ETH/USD dochodzi
      // asynchronicznie i pasek ma pokazac dolary, gdy tylko sa znane.
      const label = event.eth === undefined ? event.label : `${event.label} ${tapeAmount(event.eth, ethUsd, NATIVE_SYMBOL)}`;
      const known = event.address ? byAddress.get(event.address.toLowerCase()) : undefined;
      if (!known) return { ...event, label };
      return {
        ...event,
        label,
        logoUrl: known.logoUrl ?? event.logoUrl,
        // Zywy feed wpisuje skrocony adres zamiast symbolu - gdy token jest
        // juz na tablicy, pokazujemy jego prawdziwy ticker.
        symbol: event.symbol.startsWith('0x') ? known.symbol : event.symbol,
      };
    });
  }, [activityFeed, tokens, ethUsd]);

  /**
   * Trzy odczyty saldo-do-wyplaty dla podlaczonego adresu. Wzorzec z
   * `refreshDetails`: rownolegle ready, a kazdy blad czysci stan zamiast
   * zostawiac stara liczbe udajaca aktualna.
   */
  const refreshMyClaimable = useCallback(async () => {
    if (!readClient || !address) {
      setMyClaimable(null);
      return;
    }
    try {
      const sums: MyClaimable = { launch: 0n, hookEth: 0n, vaultEth: 0n, sources: [] };
      for (const d of LAUNCHPAD_DEPLOYMENTS) {
        const [launch, hookEth, vaultEth] = (await Promise.all([
          readClient.readContract({ address: d.launchpad as Address, abi: launchpadAbi, functionName: 'claimable', args: [address] }),
          readClient.readContract({ address: d.hook as Address, abi: hookAbi, functionName: 'claimableEth', args: [address] }),
          readClient.readContract({ address: d.vault as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [address] }),
        ])) as [bigint, bigint, bigint];
        sums.launch += launch;
        sums.hookEth += hookEth;
        sums.vaultEth += vaultEth;
        if (launch > 0n) sums.sources!.push({ address: d.launchpad as Address, kind: 'launch' });
        if (hookEth > 0n) sums.sources!.push({ address: d.hook as Address, kind: 'hook' });
        if (vaultEth > 0n) sums.sources!.push({ address: d.vault as Address, kind: 'vault' });
      }
      setMyClaimable(sums);
    } catch {
      setMyClaimable(null);
    }
  }, [address, readClient]);

  useEffect(() => {
    void refreshMyClaimable();
  }, [refreshMyClaimable]);

  /** Wdrozenie wybranego tokena - kazda operacja na nim idzie do JEGO kontraktow. */
  const selDep = useMemo(() => deploymentOrOldest(selected?.launchpad), [selected?.launchpad]);

  const refreshDetails = useCallback(async () => {
    if (!readClient || !selected?.address) {
      setDetails(null);
      setSellQuote(null);
      return;
    }
    const token = selected.address as Address;
    const account = address ?? zeroAddress;
    try {
      const [decimals, balance, allowance, spotPrice, launchClaimable, hookEthClaimable, hookTokenClaimable, vaultEthClaimable, vaultTokenClaimable, pendingEth, pendingToken, seeded, position] = await Promise.all([
        readClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
        address ? readClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, selDep.launchpad as Address] }) : Promise.resolve(0n),
        selected.state === 'Graduated' ? Promise.resolve(0n) : readClient.readContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'spotPriceWeiPerToken', args: [token] }),
        address ? readClient.readContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'claimable', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: selDep.hook as Address, abi: hookAbi, functionName: 'claimableEth', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: selDep.hook as Address, abi: hookAbi, functionName: 'claimableToken', args: [token, account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: selDep.vault as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: selDep.vault as Address, abi: liquidityVaultAbi, functionName: 'claimableToken', args: [token, account] }) : Promise.resolve(0n),
        readClient.readContract({ address: selDep.hook as Address, abi: hookAbi, functionName: 'pendingEth', args: [token] }),
        readClient.readContract({ address: selDep.hook as Address, abi: hookAbi, functionName: 'pendingToken', args: [token] }),
        readClient.readContract({ address: selDep.vault as Address, abi: liquidityVaultAbi, functionName: 'seeded', args: [token] }),
        readClient.readContract({ address: selDep.vault as Address, abi: liquidityVaultAbi, functionName: 'positionOf', args: [token] }),
      ] as const);
      const positionTuple = position as readonly [`0x${string}`, bigint, number, number];
      setDetails({
        decimals: Number(decimals),
        balance: balance as bigint,
        allowance: allowance as bigint,
        spotPrice: spotPrice as bigint,
        launchClaimable: launchClaimable as bigint,
        hookEthClaimable: hookEthClaimable as bigint,
        hookTokenClaimable: hookTokenClaimable as bigint,
        vaultEthClaimable: vaultEthClaimable as bigint,
        vaultTokenClaimable: vaultTokenClaimable as bigint,
        pendingEth: pendingEth as bigint,
        pendingToken: pendingToken as bigint,
        seeded: Boolean(seeded),
        poolId: positionTuple[0],
        liquidity: positionTuple[1],
        tickLower: Number(positionTuple[2]),
        tickUpper: Number(positionTuple[3]),
      });
    } catch {
      setDetails(null);
    }
  }, [address, readClient, selected?.address, selected?.state, selDep]);

  useEffect(() => {
    void refreshDetails();
  }, [refreshDetails]);

  useEffect(() => {
    setGradReward(null);
    if (!readClient || !selected?.address || selected.state !== 'Locked') return;
    // `.catch` nie jest ozdoba: bez niego chwilowe odbicie RPC staje sie
    // nieobsluzonym odrzuceniem, zamiast po prostu wyczyscic wycene.
    void readClient
      .readContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'gradFeeOf', args: [selected.address as Address] })
      .then((quote) => setGradReward(quote[1]))
      .catch(() => setGradReward(null));
  }, [readClient, selected?.address, selected?.state, selDep]);

  useEffect(() => {
    setSellQuote(null);
    if (!details || !selected?.address || details.decimals < 0 || sellAmount === '0' || Number(sellAmount) <= 0) return;
    // Flaga anulowania obejmuje odpowiedz W LOCIE: bez niej spozniony `.then`
    // ze starego tokena/kwoty nadpisalby swiezsza wycene po przelaczeniu.
    let cancelled = false;
    try {
      const amount = parseUnits(sellAmount, details.decimals);
      void readClient
        ?.readContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'quoteSell', args: [selected.address as Address, amount] })
        .then((quote) => {
          if (!cancelled) setSellQuote(quote[0]);
        })
        .catch(() => {
          if (!cancelled) setSellQuote(null);
        });
    } catch {
      setSellQuote(null);
    }
    return () => {
      cancelled = true;
    };
  }, [details, readClient, selected?.address, sellAmount, selDep]);

  // Klik w nazwe nawiguje na strone tokena, wiec "zaznaczenie" istnieje juz
  // tylko jako otwarcie modala handlu - stad parametr openTrade bez wartosci
  // domyslnej: kazde wywolanie mowi wprost, po co zaznacza.
  const selectToken = (id: string, openTrade: boolean) => {
    setSelectedId(id);
    setTradeOpen(openTrade);
  };

  // Escape zamyka modal handlu - ten sam wzorzec, co w LaunchTokenModal.
  useEffect(() => {
    if (!tradeOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTradeOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tradeOpen]);

  const ensureSepolia = async () => {
    if (onSepolia) return true;
    try {
      await switchChainAsync({ chainId: LAUNCHPAD_CHAIN.id });
      return true;
    } catch {
      setNotice({ kind: 'error', text: `Switch to ${NET} was cancelled. Nothing was sent.` });
      return false;
    }
  };

  /**
   * WLASNA TRANSAKCJA NA TASMIE OD RAZU PO PODPISANIU.
   *
   * Pasek zdarzen pokazywal cudze transakcje szybciej niz twoje wlasne: cudze
   * przychodzily z subskrypcji, a twoja czekala na paragon i dopiero potem na
   * zdarzenie. Miedzy podpisem a blokiem tasma milczala akurat o tej jednej
   * transakcji, o ktorej wiadomo NA PEWNO, ze istnieje.
   *
   * Wiersz jest przygaszony i znika, gdy przyjdzie prawdziwe zdarzenie z tego
   * samego hasza (patrz `freshHashes`) albo gdy transakcja odpadnie.
   */
  const pushPendingTrade = useCallback(
    (input: { hash: string; token: LaunchpadToken; side: 'buy' | 'sell'; eth?: number }) => {
      setActivityFeed((current) =>
        [
          {
            id: `${input.hash}-pending`,
            address: input.token.address,
            symbol: input.token.symbol,
            accent: input.token.accent,
            label: input.side === 'buy' ? 'Buy' : 'Sell',
            eth: input.eth,
            tone: input.side,
            pending: true,
            txHash: input.hash,
          } as ActivityItem,
          ...current,
        ].slice(0, 24)
      );
    },
    []
  );

  const dropPendingTrade = useCallback((hash: string) => {
    setActivityFeed((current) => current.filter((item) => item.txHash !== hash));
  }, []);

  const buy = async () => {
    if (!selected?.address || !address || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Launch a live token first. Preview rows are not connected to chain data.' });
      return;
    }
    // `toWei`, a nie `parseEther`: `Number('1e3')` jest skonczone i dodatnie,
    // ale `parseEther('1e3')` rzuca - a rzucalo POZA `try`, wiec klikniecie
    // konczylo sie nieobsluzonym odrzuceniem, bez komunikatu i bez zdjecia
    // stanu zajetosci.
    const value = toWei(buyAmount);
    if (value === null || value === 0n) {
      setNotice({ kind: 'error', text: `Enter an ${NATIVE_SYMBOL} amount greater than zero, written as a decimal number.` });
      return;
    }
    if (QUOTE_ASSET && !PERP_ZAP_ADDRESS) {
      setNotice({ kind: 'error', text: `This market trades in ${NATIVE_SYMBOL}. Open the token page to buy with ${NATIVE_SYMBOL}.` });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('buy');
    setNotice(null);
    try {
      // RYNEK PERPA: okno tablicy kupuje za ETH przez PerpBuyZap (ETH -> USDC ->
      // perp -> buyFor). 11.10.2026 wysylalo tu ETH starym `buy` do launchpada
      // Q, ktory przyjmuje tylko perpa - kazde kupno rewertowalo.
      if (QUOTE_ASSET && PERP_ZAP_ADDRESS) {
        const perpPool = await fetchPerpPoolKey(LAUNCHPAD_CHAIN.id, QUOTE_ASSET.address);
        if (!perpPool) throw new Error(`The ETH route to ${NATIVE_SYMBOL} is unavailable right now. Try again in a moment.`);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
        const zapCall = { address: PERP_ZAP_ADDRESS, abi: perpZapAbi, functionName: 'buyWithEth' as const, value, account: address };
        const route = [selDep.launchpad as Address, selected.address as Address, ETH_USDC_POOL, perpPool] as const;
        const { result } = await readClient.simulateContract({ ...zapCall, args: [...route, 1n, 1n, deadline, address] });
        const minPerp = (result[0] * BigInt(10_000 - DEFAULT_SLIPPAGE_BPS)) / 10_000n;
        const minTokens = (result[1] * BigInt(10_000 - DEFAULT_SLIPPAGE_BPS)) / 10_000n;
        const args = [...route, minPerp > 0n ? minPerp : 1n, minTokens > 0n ? minTokens : 1n, deadline, address] as const;
        const gas = await readClient.estimateContractGas({ ...zapCall, args }).catch(() => undefined);
        const zapHash = await walletClient.writeContract({ ...zapCall, args, chain: LAUNCHPAD_CHAIN, ...(gas ? { gas: (gas * 120n) / 100n } : {}) });
        pushPendingTrade({ hash: zapHash, token: selected, side: 'buy', eth: Number(formatEther(result[0])) });
        const zapReceipt = await readClient.waitForTransactionReceipt({ hash: zapHash });
        if (zapReceipt.status !== 'success') {
          dropPendingTrade(zapHash);
          throw new Error('The buy transaction reverted.');
        }
        setNotice({ kind: 'success', text: `Bought with ETH. ${zapHash.slice(0, 10)}...` });
        setTradeOpen(false);
        void loadBoard();
        return;
      }
      const quote = await readClient.readContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'quoteBuy', args: [selected.address, value] });
      // Ten sam bufor, co na stronie tokena. Stalo tu 0,5% na sztywno, czyli
      // dokladnie ta wartosc, ktora 13 sierpnia wywalala co czwarta transakcje
      // na ruchliwej krzywej (uzasadnienie przy DEFAULT_SLIPPAGE_BPS).
      const minTokensOut = (quote[0] * BigInt(10_000 - DEFAULT_SLIPPAGE_BPS)) / 10_000n;
      const hash = await walletClient.writeContract({
        address: selDep.launchpad as Address,
        abi: launchpadAbi,
        functionName: 'buy',
        args: [selected.address, minTokensOut, BigInt(Math.floor(Date.now() / 1000) + 900)],
        value,
        chain: LAUNCHPAD_CHAIN,
        account: address,
      });
      // Podpisane - na tasme idzie od razu, jeszcze przed blokiem.
      pushPendingTrade({ hash, token: selected, side: 'buy', eth: Number(formatEther(value)) });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        dropPendingTrade(hash);
        throw new Error('The buy transaction reverted.');
      }
      // Kupno POTWIERDZONE. Sukces i zamkniecie NAJPIERW - zaden pozniejszy
      // odczyt nie moze wywrocic potwierdzonej transakcji w blad (to prowadzilo
      // do ponownego, podwojnego kupna). Blad writeContract/receipt (catch)
      // zostawia okno otwarte do ponowienia.
      setNotice({ kind: 'success', text: `Buy confirmed. ${hash.slice(0, 10)}...` });
      setTradeOpen(false);
      // Optymistyczny update wiersza (natychmiast) w try - hiccup odczytu nic nie
      // psuje. Cichy loadBoard w tle pogodzi zarobki/holderow/rezerwy.
      try {
        const onchain = await readClient.readContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'launchOf', args: [selected.address] });
        const [, state, ethReserve] = onchain;
        setTokens((current) =>
          current.map((token) =>
            token.id === selected.id
              ? { ...token, raised: Number(formatEther(ethReserve)), state: (LAUNCH_STATE[state] as LaunchpadToken['state']) ?? token.state }
              : token,
          ),
        );
      } catch {
        // Odczyt po receipt sie nie udal - loadBoard/subskrypcja pogodza stan.
      }
      void loadBoard();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const sell = async () => {
    if (!selected?.address || !address || !walletClient || !readClient || !details) {
      setNotice({ kind: 'error', text: 'Connect a wallet and select a live token first.' });
      return;
    }
    let amount: bigint;
    try {
      amount = parseUnits(sellAmount, details.decimals);
    } catch {
      setNotice({ kind: 'error', text: 'Enter a valid token amount.' });
      return;
    }
    if (amount <= 0n || amount > details.balance) {
      setNotice({ kind: 'error', text: 'The sell amount is larger than your token balance.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('approve');
    setNotice(null);
    try {
      if (details.allowance < amount) {
        const approveHash = await walletClient.writeContract({
          address: selected.address as Address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [selDep.launchpad as Address, maxUint256],
          chain: LAUNCHPAD_CHAIN,
          account: address,
        });
        await readClient.waitForTransactionReceipt({ hash: approveHash });
      }
      setBusy('sell');
      const quote = await readClient.readContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'quoteSell', args: [selected.address as Address, amount] });
      const minEthOut = (quote[0] * BigInt(10_000 - DEFAULT_SLIPPAGE_BPS)) / 10_000n;
      const hash = await walletClient.writeContract({
        address: selDep.launchpad as Address,
        abi: launchpadAbi,
        functionName: 'sell',
        args: [selected.address as Address, amount, minEthOut, BigInt(Math.floor(Date.now() / 1000) + 900)],
        chain: LAUNCHPAD_CHAIN,
        account: address,
      });
      // Podpisane - na tasme idzie od razu. Kwota z wyceny, bo sprzedaz podaje
      // tokeny, a tasma mowi w pieniadzu sieci.
      pushPendingTrade({ hash, token: selected, side: 'sell', eth: Number(formatEther(minEthOut)) });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        dropPendingTrade(hash);
        throw new Error('The sell transaction reverted.');
      }
      setSellAmount('0');
      // Sukces i zamkniecie NAJPIERW - potwierdzonego sella zaden pozniejszy
      // odczyt nie moze wywrocic w blad.
      setNotice({ kind: 'success', text: `Sell confirmed. ${hash.slice(0, 10)}...` });
      setTradeOpen(false);
      // Optymistyczny update wiersza w try; cichy loadBoard w tle pogodzi reszte.
      try {
        await refreshDetails();
        const afterSell = await readClient.readContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'launchOf', args: [selected.address as Address] });
        const [, sellState, sellReserve] = afterSell;
        setTokens((current) =>
          current.map((token) =>
            token.id === selected.id
              ? { ...token, raised: Number(formatEther(sellReserve)), state: (LAUNCH_STATE[sellState] as LaunchpadToken['state']) ?? token.state }
              : token,
          ),
        );
      } catch {
        // Odczyty po receipt sie nie udaly - loadBoard/subskrypcja pogodza.
      }
      void loadBoard();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const graduate = async () => {
    if (!selected?.address || !address || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet before graduating this token.' });
      return;
    }
    if (selected.state !== 'Locked') {
      setNotice({ kind: 'error', text: 'Only a locked curve can be graduated.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('graduate');
    setNotice(null);
    try {
      const hash = await walletClient.writeContract({ address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'graduate', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The graduation transaction reverted.');
      setNotice({ kind: 'success', text: `Pool opened. ${hash.slice(0, 10)}...` });
      // Optymistycznie: krzywa graduowala -> stan Graduated od razu; cichy
      // loadBoard w tle pogodzi rezerwy/zarobki.
      setTokens((current) =>
        current.map((token) => (token.id === selected.id ? { ...token, state: 'Graduated' } : token)),
      );
      try { await refreshDetails(); } catch {}
      void loadBoard();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const settle = async () => {
    if (!selected?.address || !address || !walletClient || !readClient) return setNotice({ kind: 'error', text: 'Connect a wallet before settling fees.' });
    if (!(await ensureSepolia())) return;
    setBusy('settle');
    try {
      const hash = await walletClient.writeContract({ address: selDep.hook as Address, abi: hookAbi, functionName: 'settle', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Hook fees settled. ${hash.slice(0, 10)}...` });
      await refreshDetails();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const harvest = async () => {
    if (!selected?.address || !address || !walletClient || !readClient) return setNotice({ kind: 'error', text: 'Connect a wallet before harvesting fees.' });
    if (!(await ensureSepolia())) return;
    setBusy('harvest');
    try {
      const hash = await walletClient.writeContract({ address: selDep.vault as Address, abi: liquidityVaultAbi, functionName: 'harvest', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Pool fees harvested. ${hash.slice(0, 10)}...` });
      await refreshDetails();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const claim = async (source: 'launch' | 'hookEth' | 'hookToken' | 'vaultEth' | 'vaultToken') => {
    if (!address || !walletClient || !readClient || !selected?.address) {
      setNotice({ kind: 'error', text: 'Connect a wallet before claiming.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('claim');
    try {
      const transaction = source === 'launch'
        ? { address: selDep.launchpad as Address, abi: launchpadAbi, functionName: 'claim' as const, args: [] as const }
        : source === 'hookEth'
          ? { address: selDep.hook as Address, abi: hookAbi, functionName: 'claimEth' as const, args: [] as const }
          : source === 'hookToken'
            ? { address: selDep.hook as Address, abi: hookAbi, functionName: 'claimToken' as const, args: [selected.address as Address] as const }
            : source === 'vaultEth'
              ? { address: selDep.vault as Address, abi: liquidityVaultAbi, functionName: 'claimEth' as const, args: [] as const }
              : { address: selDep.vault as Address, abi: liquidityVaultAbi, functionName: 'claimToken' as const, args: [selected.address as Address] as const };
      const hash = await walletClient.writeContract({ ...transaction, chain: LAUNCHPAD_CHAIN, account: address } as any);
      await readClient.waitForTransactionReceipt({ hash });
      setNotice({ kind: 'success', text: `Claim confirmed. ${hash.slice(0, 10)}...` });
      await refreshDetails();
      await refreshMyClaimable();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Wyplata sekcji "My tokens": po kolei kazde niezerowe zrodlo (launchpad,
   * hook, vault). Trzy oddzielne kontrakty nie maja wspolnego multicalla,
   * wiec portfel poprosi o podpis raz na zrodlo - w zamian jeden przycisk
   * oproznia wszystko. Wzorzec transakcji ten sam co w `claim` wyzej.
   */
  const claimAllMine = async () => {
    if (!address || !walletClient || !readClient || !myClaimable) {
      setNotice({ kind: 'error', text: 'Connect a wallet before claiming.' });
      return;
    }
    const calls = (myClaimable.sources ?? []).map((source) =>
      source.kind === 'launch'
        ? { address: source.address, abi: launchpadAbi, functionName: 'claim' as const }
        : source.kind === 'hook'
          ? { address: source.address, abi: hookAbi, functionName: 'claimEth' as const }
          : { address: source.address, abi: liquidityVaultAbi, functionName: 'claimEth' as const }
    );
    if (calls.length === 0) {
      setNotice({ kind: 'error', text: 'Nothing to claim right now.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy('claim');
    setNotice(null);
    try {
      for (const call of calls) {
        const hash = await walletClient.writeContract({ ...call, args: [], chain: LAUNCHPAD_CHAIN, account: address } as any);
        await readClient.waitForTransactionReceipt({ hash });
      }
      setNotice({ kind: 'success', text: `Claim confirmed across ${calls.length} ${calls.length === 1 ? 'source' : 'sources'}.` });
      await refreshMyClaimable();
      await refreshDetails();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="board min-h-screen bg-sp-sunken px-4 pb-24 pt-0 font-soft sm:px-6">
      {/* Blysk kart zyje razem z tym widokiem - globals.css jest poza zakresem
          tego komponentu, a te trzy reguly nie przydadza sie nigdzie indziej.
          `forwards` zostawia nakladke przezroczysta po wygasnieciu, wiec nie
          trzeba jej zdejmowac ze stanu. */}
      <style>{`
        .lp-flash-buy { animation: lp-flash-buy 0.9s ease-out forwards; }
        .lp-flash-sell { animation: lp-flash-sell 0.9s ease-out forwards; }
        @keyframes lp-flash-buy {
          0% { box-shadow: 0 0 0 2px rgba(24, 189, 100, 0.65), 0 8px 28px rgba(24, 189, 100, 0.3); }
          100% { box-shadow: 0 0 0 2px rgba(24, 189, 100, 0), 0 8px 28px rgba(24, 189, 100, 0); }
        }
        @keyframes lp-flash-sell {
          0% { box-shadow: 0 0 0 2px rgba(199, 107, 18, 0.6), 0 8px 28px rgba(199, 107, 18, 0.3); }
          100% { box-shadow: 0 0 0 2px rgba(199, 107, 18, 0), 0 8px 28px rgba(199, 107, 18, 0); }
        }
        /* Nowy wpis na tasmie zdarzen wjezdza z lewej. Animacja gra RAZ, przy
           montowaniu chipa - istniejace chipy (ten sam key) sie nie re-animuja,
           wiec pasek rusza sie tylko przy realnie nowym zdarzeniu. */
        .lp-ticker-in { animation: lp-ticker-in 0.35s ease-out; }
        @keyframes lp-ticker-in {
          0% { opacity: 0; transform: translateX(-14px); }
          100% { opacity: 1; transform: none; }
        }
        /* Toast potwierdzenia wjezdza z prawej gory i sam znika. */
        .lp-toast-in { animation: lp-toast-in 0.25s ease-out; }
        @keyframes lp-toast-in {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-flash-buy, .lp-flash-sell, .lp-ticker-in, .lp-toast-in { animation: none; }
        }
      `}</style>
      <div className="mx-auto w-full max-w-[1760px]">
        {/* Live tape jako cienki, latajacy pasek pod nawigacja - na WSZYSTKICH
            ekranach (wczesniej tylko mobile). Zastapil prawa kolumne, dzieki
            czemu rynek ma cala szerokosc. */}
        <div>
          <ActivityTicker events={feedEvents} />
        </div>

        {/* Naglowek: StartPad po lewej, wyszukiwarka (rosnie) w srodku,
            przelacznik sieci + Launch po prawej. Na telefonie wyszukiwarka
            schodzi pod spod, gorny wiersz trzyma napis i przyciski. */}
        <div className="relative overflow-hidden py-5 sm:py-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-soft-primary/[0.06] blur-3xl" />
          {/* `flex-wrap` jest tu ZABEZPIECZENIEM, nie ozdoba: sekcja ma
              `overflow-hidden`, wiec cokolwiek nie zmiesci sie w wierszu,
              zostaje UCIETE bez sladu. Na telefonie tytul plus pigulka z
              najdluzsza etykieta sieci ("Base B20 Sepolia") przekraczaja
              szerokosc ekranu - wtedy pigulka schodzi do drugiego wiersza
              zamiast wystawac poza kadr. */}
          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3">
            <h1 className="shrink-0 text-[20px] font-extrabold tracking-tight text-sp-ink">
              Start<span className="text-soft-primary">Pad</span>
            </h1>
            <label className="relative hidden min-w-0 flex-1 max-w-[560px] sm:block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sp-shade/40" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${FIELD} rounded-full bg-sp-sunken pl-10`} placeholder="Search coins, creators" aria-label="Search coins and creators" />
            </label>
            {/* Slot promocyjny miedzy wyszukiwarka a kontrolkami. Tylko od `lg`:
                na wezszym ekranie naglowek i tak zawija sie do dwoch wierszy,
                a trzeci element robilby z niego trzy. */}
            <BoardPromo
              token={kingToken}
              onOpen={() => {
                if (kingToken?.address) router.push(`/startpad/${kingToken.address}`);
              }}
            />

            <span className="ml-auto flex items-center gap-2">
              {/* Split-button: selektor sieci + Launch w JEDNYM pillu - spojna
                  kontrolka zamiast dwoch osobnych, ktore sie gryzly. */}
              {/* Swiecaca ramka z plynacym gradientem - ludzie nie widzieli, ze
                  siec (Base B20 / RobinHood / Arc) da sie tu zmienic. Gradient
                  siedzi w tle wrappera o 1,5 px paddingu, srodek zakrywa go
                  wlasnym tlem; do tego miekka poswiata. */}
              <div className="animate-border-flow rounded-full bg-[linear-gradient(90deg,#ff00a8,#7c3aed,#00ffd1,#ff00a8)] bg-[length:300%_100%] p-[1.5px] shadow-[0_0_18px_rgba(124,58,237,0.45)]">
              <div className="inline-flex items-stretch overflow-hidden rounded-full bg-sp-surface">
                <NetworkSwitch />
                <span aria-hidden="true" className="my-1.5 w-px self-stretch bg-sp-shade/10" />
                {/* Udostepnianie CALEGO rynku tej sieci. Ma sens dopiero odkad
                    przelacznik dopisuje `?c=` do adresu - wczesniej wszystkie
                    trzy rynki mialy ten sam link i odbiorca ladowal na swoim. */}
                <ShareToken
                  address={ACTIVE_LAUNCHPAD_NETWORK.launchpad}
                  chainId={ACTIVE_LAUNCHPAD_NETWORK.chain.id}
                  symbol=""
                  raised={0}
                  target={0}
                  state="Curve"
                  board={{
                    label: netState.label,
                    tokens: tokens.filter((token) => token.live).length,
                  }}
                  // Wewnetrzny przycisk ma wlasny, maly padding - bez tego
                  // opakowania siedzial przy GORNEJ krawedzi paska zamiast na
                  // jego srodku, bo `items-stretch` rozciaga go na cala
                  // wysokosc, a on rysuje sie od gory.
                  className="inline-flex items-center px-2"
                />
                <span aria-hidden="true" className="my-1.5 w-px self-stretch bg-sp-shade/10" />
                                {/* Na telefonie zostaje sam plus. Napis "Launch" to okolo 50 px,
                    ktore na waskim ekranie decyduja o tym, czy cala pigulka
                    miesci sie w wierszu - a plus obok przelacznika sieci czyta
                    sie jednoznacznie. `aria-label` niesie pelna nazwe, wiec
                    czytnik ekranu nie traci nic. */}
                <button
                  type="button"
                  onClick={() => setLaunchOpen(true)}
                  aria-label="Launch a coin"
                  className="inline-flex items-center gap-2 bg-soft-primary px-3.5 text-[13px] font-extrabold text-sp-on-brand transition-[background-color,transform] hover:bg-soft-primary-deep active:scale-[0.98] sm:px-4"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Launch</span>
                </button>
              </div>
              </div>
            </span>
          </div>
          {/* Na telefonie search zdjety - filtry i przelacznik sieci wystarcza,
              a pole zabieralo cala szerokosc pierwszego ekranu. Na sm+ zostaje
              (jest w gornym wierszu obok logo). */}
        </div>

        {notice && <div role="status" aria-live="polite" className={`lp-toast-in fixed right-4 top-4 z-[80] flex max-w-[min(92vw,360px)] items-start gap-2 rounded-xl border px-3.5 py-3 text-[12.5px] shadow-[0_14px_44px_rgba(0,0,0,0.18)] ${notice.kind === 'success' ? 'border-sp-up-line bg-sp-up-soft text-sp-up' : 'border-sp-down-line bg-sp-down-soft text-sp-down-deep'}`}><span className="mt-0.5">{notice.kind === 'success' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}</span><span className="min-w-0 flex-1">{notice.text}</span><button type="button" onClick={() => setNotice(null)} className="ml-1 shrink-0 opacity-50 hover:opacity-100" aria-label="Dismiss"><X className="h-3.5 w-3.5" aria-hidden="true" /></button></div>}
        {(loadingBoard || boardError) && <div className="mb-4 flex items-center gap-2 rounded-xl border border-sp-shade/10 bg-sp-surface px-3.5 py-2.5 text-[11.5px] text-sp-shade/55"><RefreshCw className={`h-3.5 w-3.5 ${loadingBoard ? 'animate-spin text-soft-primary' : 'text-sp-down'}`} aria-hidden="true" /><span suppressHydrationWarning>{loadingBoard ? `Reading Launchpad activity from ${NET}...` : `Live data unavailable. ${boardError}`}</span></div>}

        {/* Przewodnik po cyklu zycia NAD rynkiem, zwiniety. Slowa "Curve",
            "Locked" i "Graduated" stoja na kazdej karcie i do 9 wrzesnia 2026
            nie mialy w calym interfejsie ani jednego zdania wyjasnienia -
            jedyny opis lezal w stopce i na /Docs, do ktorego stad nie bylo
            odnosnika. Zwiniety `details` zajmuje jeden wiersz. */}
        <LifecycleGuide className="mb-4" />

        {/* Rynek na CALA szerokosc - Live tape zjechal na gorny ticker, wiec nie
            ma juz prawej kolumny; grid tokenow wypelnia caly ekran. */}
        <div className="min-w-0">
            {/* Belka rynku: FILTRY zamiast tytulu/podtytulu - oszczedza pionowe
                miejsce. Tytul "Startpad market" i opisowa gadka wylecialy; ich
                miejsce zajmuja filtry, ktore i tak sa najwazniejsze. */}
            <section className="overflow-hidden rounded-[20px] border border-sp-shade/10 bg-sp-surface" aria-label="Startpad market">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  {/* Mobile: jeden przycisk-dropdown. */}
                  <select value={tab} onChange={(event) => setTab(event.target.value as BoardTab)} aria-label="Sort launches" className="rounded-full border border-sp-shade/10 bg-sp-surface px-3.5 py-2 text-[12px] font-extrabold text-sp-ink outline-none sm:hidden">
                    {([['new', 'New'], ['trending', 'Trending'], ['about', 'About to graduate'], ['graduated', 'Graduated'], ['all', 'All']] as const).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {/* Desktop: chipy inline. */}
                  <div className="hidden flex-wrap items-center gap-2 sm:flex" role="tablist" aria-label="Sort launches">
                    {([['new', 'New'], ['trending', 'Trending'], ['about', 'About to graduate'], ['graduated', 'Graduated'], ['all', 'All']] as const).map(([value, label]) => (
                      <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-extrabold transition-colors ${tab === value ? 'border-soft-primary bg-soft-primary text-sp-on-brand' : 'border-sp-shade/10 bg-sp-surface text-sp-ink hover:border-soft-primary'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex overflow-hidden rounded-full border border-sp-shade/10" role="tablist" aria-label="Market layout">
                    {(['grid', 'table'] as const).map((mode) => (
                      <button key={mode} type="button" role="tab" aria-selected={view === mode} onClick={() => setView(mode)} className={`px-3 py-1.5 text-[11px] font-extrabold capitalize transition-colors ${view === mode ? 'bg-soft-primary text-sp-on-brand' : 'bg-sp-surface text-sp-ink hover:text-soft-primary-deep'}`}>{mode}</button>
                    ))}
                  </span>
                </span>
              </div>
              {view === 'grid' ? (
                <div className="border-t border-sp-shade/10 p-4 sm:p-5">
                  {tokens.length === 0 && loadingBoard ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => (
                        <div key={index} className="animate-pulse rounded-[18px] border border-sp-shade/10 bg-sp-surface p-4">
                          <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-[16px] bg-sp-shade/8" /><span className="h-4 w-24 rounded bg-sp-shade/8" /></div>
                          <div className="mt-5 h-4 w-32 rounded bg-sp-shade/8" />
                          <div className="mt-3 h-1.5 w-full rounded-full bg-sp-shade/8" />
                          <div className="mt-4 h-8 w-full rounded-full bg-sp-shade/8" />
                        </div>
                      ))}
                    </div>
                  ) : visibleTokens.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {pagedTokens.map((token) => <LaunchCard key={token.id} token={token} animationsOn={animationsOn} ethUsd={ethUsd} onTrade={() => selectToken(token.id, true)} onOpen={() => token.address && router.push(`/startpad/${token.address}`)} />)}
                    </div>
                  ) : (
                    <div className="py-14 text-center text-[13px] text-sp-shade/50">No launches in this view.</div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_0.9fr_0.8fr_1.1fr_0.8fr_auto] gap-4 border-y border-sp-shade/10 bg-sp-sunken px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/45 sm:px-5"><span>Coin</span><span>Curve</span><span>Indexed vol</span><span>Momentum</span><span>Creator</span><span /></div>
                  {tokens.length === 0 && loadingBoard ? <div suppressHydrationWarning className="px-5 py-14 text-center text-[13px] text-sp-shade/45">Reading launches from {NET}...</div> : visibleTokens.length > 0 ? pagedTokens.map((token) => <LaunchTableRow key={token.id} token={token} animationsOn={animationsOn} ethUsd={ethUsd} onTrade={() => selectToken(token.id, true)} onOpen={() => token.address && router.push(`/startpad/${token.address}`)} />) : <div className="px-5 py-14 text-center text-[13px] text-sp-shade/50">No launches in this view.</div>}
                </div>
              )}
              {/* Przelacznik stron - rynek pokazuje 8 naraz, reszta na kolejnych
                  stronach; okienko nie renderuje wszystkiego na raz. */}
              {visibleTokens.length > BOARD_PAGE && (
                <div className="flex items-center justify-between gap-3 border-t border-sp-shade/10 px-4 py-3 sm:px-5">
                  <span className="text-[11px] text-sp-shade/45">
                    {safePage * BOARD_PAGE + 1}–{Math.min((safePage + 1) * BOARD_PAGE, visibleTokens.length)} of {visibleTokens.length}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button type="button" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-full border border-sp-shade/10 px-3 py-1.5 text-[11px] font-extrabold text-sp-ink hover:border-soft-primary disabled:opacity-40">Prev</button>
                    <span className="px-1 text-[11px] font-bold text-sp-shade/45">{safePage + 1}/{pageCount}</span>
                    <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="rounded-full border border-sp-shade/10 px-3 py-1.5 text-[11px] font-extrabold text-sp-ink hover:border-soft-primary disabled:opacity-40">Next</button>
                  </span>
                </div>
              )}
              <div className="border-t border-sp-shade/10 px-4 py-3 text-[11px] text-sp-shade/40 sm:px-5">{showingPreview ? 'Sample rows are placeholders and cannot be traded. They disappear with the first real launch.' : 'Every row is reconstructed from Startpad events and current onchain state.'}</div>
            </section>
        </div>

        {/* Pod rynkiem, na CALA szerokosc: King (wyroznienie), potem panele 2x2,
            potem My tokens. */}
        {kingToken && (
          <KingOfTheHill
            token={kingToken}
            ethUsd={ethUsd}
            onTrade={() => selectToken(kingToken.id, true)}
            onDetails={() => kingToken.address && router.push(`/startpad/${kingToken.address}`)}
          />
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <BoardStats symbol={netState.quote?.symbol ?? netState.chain.nativeCurrency.symbol} totalRaised={totalRaised} totalVolume={totalVolume} totalTrades={totalTrades} liveCount={liveCount} ethUsd={ethUsd} />
          <TopLaunches sample={showingPreview} tokens={tokens} onOpen={(token) => token.address && router.push(`/startpad/${token.address}`)} />
          <VolumePanel sample={showingPreview} tokens={tokens} onOpen={(token) => token.address && router.push(`/startpad/${token.address}`)} />
          <TopEarnings rows={topEarners} ethUsd={ethUsd} />
        </div>

        {isConnected && address && (
          <MyTokensPanel
            tokens={myTokens}
            claimable={myClaimable}
            claimBusy={busy === 'claim'}
            ethUsd={ethUsd}
            onClaim={() => void claimAllMine()}
            onOpen={(token) => token.address && router.push(`/startpad/${token.address}`)}
            onLaunch={() => setLaunchOpen(true)}
          />
        )}

        <StartpadFooter />
      </div>

      <LaunchTokenModal
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        onLaunched={(token) => {
          // Trwale zapamietaj swieze logo (data-URL) po adresie - przezyje re-skan
          // i reload, zanim (i gdyby w ogole) Blob je przejmie.
          if (token.logoUrl && token.address) rememberLogos(ACTIVE_LAUNCHPAD_NETWORK.chain.id, { [token.address]: token.logoUrl });
          // `startedAt` dopisujemy tutaj, bo kontrakt modalu oddaje czysty
          // `LaunchpadToken` - bez tego swiezy start ladowalby na koncu "New".
          setTokens((current) => [{ ...token, startedAt: Math.floor(Date.now() / 1000), prices: [] }, ...current.filter((existing) => existing.live)]);
          setSelectedId(token.id);
          setLaunchOpen(false);
          void loadBoard();
        }}
      />

      {tradeOpen && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-sp-ink/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTradeOpen(false); }}>
          <section className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-[22px] border border-sp-shade/10 bg-sp-surface p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]" role="dialog" aria-modal="true" aria-label="Trade token">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-soft-primary-deep">Curve trade</p><h2 className="mt-1 text-[21px] font-extrabold text-sp-ink">{selected.symbol} market</h2></div><button type="button" onClick={() => setTradeOpen(false)} className="rounded-full p-2 text-sp-shade/40 hover:bg-sp-shade/5 hover:text-sp-ink" aria-label="Close dialog"><X className="h-5 w-5" aria-hidden="true" /></button></div>
            <div className="mt-5 flex items-center gap-3"><TokenGlyph token={selected} large /><div><div className="flex items-center gap-2"><span className="text-[16px] font-extrabold text-sp-ink">{selected.symbol}</span><StatePill state={selected.state} /></div><p className="mt-1 text-[12px] text-sp-shade/45">{selected.name} · {curvePercent(selected)}% of curve</p></div></div>
            {selected.live ? <TradePanel token={selected} details={details} side={tradeSide} setSide={setTradeSide} buyAmount={buyAmount} setBuyAmount={setBuyAmount} sellAmount={sellAmount} setSellAmount={setSellAmount} sellQuote={sellQuote} gradReward={gradReward} busy={busy} ethUsd={ethUsd} onBuy={buy} onSell={sell} onGraduate={graduate} onSettle={settle} onHarvest={harvest} onClaim={claim} isConnected={isConnected} /> : <div className="mt-5 flex items-start gap-2 rounded-xl bg-sp-sunken p-3 text-[11.5px] leading-[1.45] text-sp-shade/55"><WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" /><span>This is a sample row. Launch a token to activate the live trade panel.</span></div>}
            <div className="mt-5 flex items-center justify-between border-t border-sp-shade/10 pt-4 text-[11px] text-sp-shade/45"><span>{peopleNote(selected)} · {selected.trades ?? 0} curve trades</span><span className="flex items-center gap-2"><button type="button" onClick={() => void navigator.clipboard?.writeText(selected.address ?? selected.id)} className="inline-flex items-center gap-1.5 font-bold hover:text-soft-primary-deep"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy address</button>{selected.address && <button type="button" onClick={() => router.push(`/startpad/${selected.address}`)} className="inline-flex items-center gap-1.5 font-bold text-soft-primary-deep hover:text-soft-primary"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Details</button>}</span></div>
          </section>
        </div>
      )}
    </main>
  );
}
