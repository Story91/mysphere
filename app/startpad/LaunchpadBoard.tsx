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
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  LAUNCHPAD_DEPLOY_BLOCK,
  LAUNCHPAD_NETWORKS,
  LAUNCH_STATE,
  LIQUIDITY_VAULT_ADDRESS,
  launchpadAbi,
  liquidityVaultAbi,
  LIVE_WATCH,
  previewTokens,
  setLaunchpadChain,
  type LaunchpadToken,
} from './config';
import { fetchLogos, recallLogos, rememberLogos } from './logos';
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
  mergeAggregates,
  parseAggregate,
  planBoardScan,
  reduceBoardLogs,
  scanIsTrustworthy,
  serializeAggregate,
  shouldKeepUnscanned,
} from './boardScan';
// Jedna, ZMIERZONA rezerwa na gaz i jedna arytmetyka procentow dla obu paneli
// handlu - mini modala na tablicy i panelu na stronie tokena. Dwie kopie tej
// samej liczby wlasnie kosztowaly nas przyciski, ktore wpisywaly zero.
import { fractionOf, GAS_RESERVE_WEI, spendableEth, tapeAmount, totalEarned } from './[address]/detailShared';
import { fetchHolderCounts } from './blockscout';
import LaunchTokenModal from './LaunchTokenModal';
import ShareToken from './ShareToken';
import StartpadFooter from './StartpadFooter';
import { formatUsd, useEthUsd } from './useEthUsd';

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
const NET = ACTIVE_LAUNCHPAD_NETWORK.label;

/**
 * Przelacznik sieci. Zmiana przeladowuje strone (patrz `setLaunchpadChain`) -
 * stan handlu nie ma prawa przezyc zmiany adresow, na ktore patrzy.
 * Do hydratacji renderujemy sam napis; select wchodzi po montazu, zeby
 * kontrolowana wartosc nie klocila sie z HTML-em z serwera.
 */
function NetworkSwitch() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = ACTIVE_LAUNCHPAD_NETWORK;
  if (!mounted) {
    return <span className="py-2.5 pl-3.5 pr-2 text-[12px] font-bold text-sp-shade/40">{NET}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 py-2.5 pl-3.5 pr-2 ${active.accentTextClass}`}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <select
        value={active.chain.id}
        onChange={(event) => {
          // $SPHERE mieszka NA LISCIE sieci (decyzja wlasciciela 2026-08-31:
          // osobny przycisk rozpychal piguke wyboru) - to nawigacja, nie
          // zmiana lancucha, wiec przechwytujemy przed setLaunchpadChain.
          if (event.target.value === 'sphere') {
            window.location.href = '/startpad/sphere';
            return;
          }
          setLaunchpadChain(Number(event.target.value));
        }}
        aria-label="Launchpad network"
        className="cursor-pointer bg-transparent text-[12px] font-extrabold outline-none [color:inherit] [&>option]:bg-sp-surface [&>option]:text-sp-ink"
      >
        {Object.values(LAUNCHPAD_NETWORKS).map((net) => (
          <option key={net.chain.id} value={net.chain.id}>
            {net.label}
          </option>
        ))}
        <option disabled>──────</option>
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
  if (!net) return <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-sp-shade/35">{NET}</span>;
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

function formatEth(value: number) {
  return `${value.toFixed(value >= 1 ? 2 : 3)} ${NATIVE_SYMBOL}`;
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${meta.className}`}>
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
  const volNote = usdNote(token.volume ?? 0, ethUsd);
  const header = (
    <>
      <TokenGlyph token={token} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-extrabold text-sp-ink">{token.symbol}</span>
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
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sp-shade/8">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, backgroundColor: token.accent }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-sp-shade/45">
          <span className="min-w-0 truncate">{formatEth(token.volume ?? 0)}{volNote ? ` (${volNote})` : ''} vol · {token.holders} holders · {token.age}</span>
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
  const volNote = usdNote(token.volume ?? 0, ethUsd);
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
              <StatePill state={token.state} />
            </div>
            <p className="mt-0.5 truncate text-[12px] text-sp-shade/50">{token.name} · {token.holders} holders · {formatEth(token.volume ?? 0)}{volNote ? ` (${volNote})` : ''} vol · {token.age}</p>
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
function BoardStats({ totalRaised, totalVolume, totalTrades, liveCount, ethUsd }: { totalRaised: number; totalVolume: number; totalTrades: number; liveCount: number; ethUsd: number | null }) {
  const rows = [
    { icon: <CircleDollarSign className="h-4 w-4 text-sp-brand-strong" aria-hidden="true" />, label: 'Curve reserve', value: formatEth(totalRaised), sub: usdNote(totalRaised, ethUsd) },
    { icon: <TrendingUp className="h-4 w-4 text-sp-info" aria-hidden="true" />, label: 'Indexed volume', value: formatEth(totalVolume), sub: usdNote(totalVolume, ethUsd) },
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

function TopLaunches({ tokens, onOpen }: { tokens: BoardToken[]; onOpen: (token: BoardToken) => void }) {
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
    </section>
  );
}

function VolumePanel({ tokens, onOpen }: { tokens: BoardToken[]; onOpen: (token: BoardToken) => void }) {
  const top = [...tokens].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 3);
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
              <span className="text-[12px] font-bold text-sp-ink">{formatEth(token.volume ?? 0)}</span>
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
type MyClaimable = { launch: bigint; hookEth: bigint; vaultEth: bigint };

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
                  <span className="block text-[12px] font-bold text-sp-ink">{formatEth(token.volume ?? 0)}</span>
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
  const volNote = usdNote(token.volume ?? 0, ethUsd);
  const coinCell = (
    <>
      <TokenGlyph token={token} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2"><span className="truncate text-[14px] font-extrabold text-sp-ink">{token.symbol}</span><StatePill state={token.state} />{sample && <SamplePill />}</span>
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
      <div><span className="block text-[14px] font-bold text-sp-ink">{formatEth(token.volume ?? 0)}{volNote && <span className="text-[11px] font-bold text-sp-shade/40"> · {volNote}</span>}</span><span className="mt-1 block text-[11px] text-sp-shade/45">indexed volume</span></div>
      <div className="flex items-center gap-2"><Sparkline prices={token.prices ?? []} /><span className="text-[11px] font-bold text-sp-shade/45">{token.holders} holders</span></div>
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
      {(canBuy ? (['buy', 'sell'] as const) : (['sell'] as const)).map((item) => <button key={item} type="button" onClick={() => setSide(item)} className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-extrabold capitalize ${effectiveSide === item ? 'bg-sp-surface text-soft-primary-deep shadow-sm' : 'text-sp-shade/45'}`}>{item === 'buy' ? `Buy with ${NATIVE_SYMBOL}` : 'Sell token'}</button>)}
    </div>}
    {!canBuy && canSell && <p className="mt-2 text-[11px] leading-[1.4] text-sp-shade/50">Buying is closed, the curve is full. Selling stays open until the pool opens.</p>}
    {!canSell && <p className="mt-5 rounded-xl bg-sp-brand-soft p-3 text-[11px] leading-[1.4] text-sp-shade/55">Curve trading ended at graduation. Swaps happen in the Uniswap v4 pool now.</p>}
    {canSell && (effectiveSide === 'buy' ? <>
      <div className="mt-4 flex items-end justify-between"><span className="text-[12px] font-extrabold text-sp-ink">{NATIVE_SYMBOL} amount</span>{/* SALDO, a nie sama nota o poslizgu. Panel ma przyciski 25/50/100% i Max,
          ktore licza z salda - ale samego salda nie pokazywal, wiec nie bylo od
          czego ich odniesc. Na stronie tokena stoi to od poczatku; tutaj
          brakowalo. */}
        <span className="text-[11px] text-sp-shade/45">{ethBalance ? `Balance ${Number(formatEther(ethBalance.value)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${NATIVE_SYMBOL}` : '0.5% slippage buffer'}</span></div>
      <div className="mt-2 flex gap-2"><div className="relative flex-1"><input inputMode="decimal" value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} className={`${FIELD} pr-14`} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-sp-shade/40">{NATIVE_SYMBOL}</span></div><button type="button" disabled={busy === 'buy'} onClick={onBuy} className="inline-flex items-center gap-2 rounded-xl bg-soft-primary px-4 text-[13px] font-extrabold text-sp-on-brand disabled:opacity-60">{busy === 'buy' ? 'Buying...' : 'Buy'}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button></div>
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

    {token.state === 'Graduated' && <div className="mt-5 rounded-xl bg-sp-brand-soft p-3"><div className="flex items-start gap-2"><Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold text-sp-ink">Live pool with hook</p><p className="mt-1 text-[11px] leading-[1.4] text-sp-shade/55">{details?.poolId && details.poolId !== `0x${'0'.repeat(64)}` ? `Pool ${details.poolId.slice(0, 10)}...` : 'Pool position is loading.'}</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={!details?.pendingEth || busy === 'settle'} onClick={onSettle} className="rounded-lg border border-sp-shade/10 bg-sp-surface px-2 py-2 text-[11px] font-extrabold text-sp-ink disabled:opacity-40">{busy === 'settle' ? 'Settling...' : `Settle ${details ? formatEther(details.pendingEth) : '0'} ${NATIVE_SYMBOL}`}</button><button type="button" disabled={busy === 'harvest'} onClick={onHarvest} className="rounded-lg border border-sp-shade/10 bg-sp-surface px-2 py-2 text-[11px] font-extrabold text-sp-ink disabled:opacity-40">{busy === 'harvest' ? 'Harvesting...' : 'Harvest LP fees'}</button></div></div>}

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
const LOG_WINDOW = ACTIVE_LAUNCHPAD_NETWORK.scanWindow;
const MAX_LOG_WINDOWS = ACTIVE_LAUNCHPAD_NETWORK.maxScanWindows;
/**
 * Najwieksza zaleglosc, ktora wolno nadrobic doliczeniem delty. Powyzej niej
 * jedno zadanie i tak nie zeskanowaloby calego przedzialu, wiec zostalaby
 * dziura - a dziury w sumie addytywnej nie da sie pozniej odroznic od prawdy.
 * Praktycznie nieosiagalne: agregat starszy niz tydzien i tak wygasa.
 */
const MAX_DELTA_SPAN = LOG_WINDOW * BigInt(MAX_LOG_WINDOWS);

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
 * Paleta i sposob liczenia przeniesione do `metadata.ts` - ten sam kolor musi
 * dostac karta udostepniania renderowana na serwerze, a ona nie moze wciagac
 * calej tablicy z wagmi. Wynik jest identyczny, wiec zaden token nie zmienia
 * barwy.
 */
const accentFor = tokenAccent;

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
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  // Startujemy od PUSTEJ tablicy, nie od wierszy przykladowych: pierwszy
  // render pokazywal probki na sekunde, zanim skan dogonil prawde - wygladalo
  // to jak stare dane. Probki wchodza dopiero, gdy UKONCZONY skan nic nie da.
  const [tokens, setTokens] = useState<BoardToken[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
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
      const latest = await readClient.getBlockNumber();

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
       */
      const cached = loadBoardAggregate(ACTIVE_LAUNCHPAD_NETWORK.chain.id, LAUNCHPAD_ADDRESS);
      const cachedAggregate = cached ? parseAggregate(cached.aggregate) : null;
      const plan = planBoardScan({
        cachedLastBlock: cachedAggregate ? (cached?.lastBlock ?? null) : null,
        head: latest,
        deployBlock: LAUNCHPAD_DEPLOY_BLOCK,
        maxSpan: MAX_DELTA_SPAN,
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
          const fromBlock = cursor > scanFloor + LOG_WINDOW ? cursor - LOG_WINDOW : scanFloor;
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
            address: [LAUNCHPAD_ADDRESS as Address, LAUNCH_HOOK_ADDRESS as Address],
            events: [LAUNCHED_EVENT, BOUGHT_EVENT, SOLD_EVENT, HOOK_FEE_SETTLED_EVENT, FEE_ACCRUED_EVENT],
            fromBlock: r.fromBlock,
            toBlock: r.toBlock,
          });
        try {
          return await once();
        } catch {
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
        const response = await fetch(`/api/launchpad/board?chainId=${ACTIVE_LAUNCHPAD_NETWORK.chain.id}`);
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
        setActivityFeed([]);
        // Nie ZRZUCAJ dobrego stanu na mocki przy pustym skanie (chwilowa awaria
        // RPC). Podglad tylko gdy naprawde nic nie mamy.
        setTokens((current) => (current.some((token) => token.live) ? current : previewTokens));
        setTopEarners([]);
        return;
      }

      setActivityFeed(
        // Kopia przed sortowaniem: `feed` nalezy do agregatu, ktory przy
        // nieudanej delcie jest tym samym obiektem, co stan zapamietany.
        [...rawFeed]
          .sort((a, b) => b.order - a.order)
          .slice(0, 24)
          .map((item) => ({ ...item, address: item.token, symbol: launched.get(item.token)?.symbol ?? shortAddress(item.token), accent: accentFor(item.token) }))
      );

      const addresses = [...launched.keys()];
      const states = await readClient.multicall({
        allowFailure: true,
        contracts: addresses.map((token) => ({
          address: LAUNCHPAD_ADDRESS as Address,
          abi: launchpadAbi,
          functionName: 'launchOf' as const,
          args: [token] as const,
        })),
      });

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
        live.push({
          id: token,
          address: token,
          name: meta.name,
          symbol: meta.symbol,
          creator,
          state: LAUNCH_STATE[state] as LaunchpadToken['state'],
          raised: Number(formatEther(ethReserve)),
          target: CURVE_TARGET_ETH,
          holders: buyers.get(token)?.size ?? 0,
          volume: activity.get(token)?.volume ?? 0,
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
        setActivityFeed([]);
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
            const calls = accountKeys.flatMap((acc) => [
              { address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [acc as Address] },
              { address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableEth', args: [acc as Address] },
              { address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [acc as Address] },
            ]);
            const balances = await readClient.multicall({ contracts: calls, allowFailure: true });
            const cell = (i: number) => (balances[i]?.status === 'success' ? (balances[i].result as bigint) : 0n);
            accountKeys.forEach((acc, i) => {
              const claimableNow = cell(i * 3) + cell(i * 3 + 1) + cell(i * 3 + 2);
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

      // Liczba POSIADACZY z Blockscouta - miekki dodatek scalany po fakcie.
      // Z samego RPC nie da sie jej policzyc bez skanu wszystkich transferow;
      // tu przychodzi z indeksu. Gdy Blockscout milczy, zostaje liczba z eventow.
      const liveAddresses = live.filter((t) => t.address).map((t) => t.address as string);
      void fetchHolderCounts(ACTIVE_LAUNCHPAD_NETWORK.chain.id, liveAddresses).then((counts) => {
        if (stale() || Object.keys(counts).length === 0) return;
        setTokens((current) =>
          current.map((t) => {
            const key = t.address?.toLowerCase();
            // MAX z liczba z eventow: Blockscout na Base Sepolii potrafi byc
            // mocno spozniony (pokazuje 12 transferow przy 100+ realnych), wiec
            // nie moze ZANIZAC swiezej liczby odtworzonej z lancucha.
            return key && counts[key] != null ? { ...t, holders: Math.max(t.holders, counts[key]) } : t;
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
  }, [readClient]);

  // MIGAWKA: przy wejsciu pokazujemy od razu ostatni znany stan (z logami)
  // z localStorage, a skan lancucha lecí w tle i aktualizuje. Koniec z pustym
  // ekranem i znikajacymi logami przy kazdym odswiezeniu. Robimy to RAZ.
  const snapshotRestored = useRef(false);
  useEffect(() => {
    if (snapshotRestored.current) return;
    snapshotRestored.current = true;
    const cached = loadSnapshot<BoardToken>(ACTIVE_LAUNCHPAD_NETWORK.chain.id);
    if (cached && cached.length) {
      setTokens(cached);
      setSelectedId((current) => current || cached[0].id);
      setLoadingBoard(false);
      // Mamy tresc z migawki - kolejny loadBoard odswieza CICHO, bez spinnera.
      boardHasContentRef.current = true;
    }
    // Live tape z migawki - pasek pokazuje sie OD RAZU zamiast pusty przez caly
    // skan; skan i subskrypcja nadpisza go sekundy pozniej.
    const cachedFeed = loadFeedSnapshot<ActivityItem>(ACTIVE_LAUNCHPAD_NETWORK.chain.id);
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
    if (real.length) saveSnapshot(ACTIVE_LAUNCHPAD_NETWORK.chain.id, real);
  }, [tokens]);

  // Migawka live tape, zeby przy nastepnym wejsciu pasek byl od razu. Wiersze
  // „pending" do niej NIE ida: transakcja czekajaca na blok jest stanem tej
  // sesji, a nie faktem - po przeladowaniu wisialaby jako wieczne oczekiwanie.
  useEffect(() => {
    const landed = activityFeed.filter((item) => !item.pending);
    if (landed.length) saveFeedSnapshot(ACTIVE_LAUNCHPAD_NETWORK.chain.id, landed);
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
      address: LAUNCHPAD_ADDRESS as Address,
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
          const decoded = log as unknown as { eventName?: string; args?: Record<string, unknown>; transactionHash?: string };
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
              const row: BoardToken = {
                id: token,
                address: token,
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
    switch (tab) {
      case 'new':
        return [...matches].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
      case 'trending': {
        const rows = [...matches].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
        if (animationsOn) {
          // Swiezo handlowany token skacze na gore. Celowo ulotne: sortowanie
          // odswieza sie przy kazdym evencie, a po cichym kwadransie wraca
          // porzadek po wolumenie - bez zadnego timera.
          const now = Date.now();
          const heat = (row: BoardToken) => (row.lastTradeAt && now - row.lastTradeAt < HOT_TRADE_WINDOW_MS ? row.lastTradeAt : 0);
          rows.sort((a, b) => heat(b) - heat(a) || (b.volume ?? 0) - (a.volume ?? 0));
        }
        return rows;
      }
      case 'about':
        return matches.filter((token) => token.state === 'Curve').sort((a, b) => b.raised - a.raised);
      case 'graduated':
        return matches.filter((token) => token.state === 'Graduated');
      default:
        return matches;
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
  const liveCount = tokens.filter((token) => token.state === 'Curve').length;
  const totalRaised = tokens.reduce((sum, token) => sum + token.raised, 0);
  const totalVolume = tokens.reduce((sum, token) => sum + (token.volume ?? 0), 0);
  const totalTrades = tokens.reduce((sum, token) => sum + (token.trades ?? 0), 0);
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
      const [launch, hookEth, vaultEth] = await Promise.all([
        readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [address] }),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableEth', args: [address] }),
        readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [address] }),
      ]);
      setMyClaimable({ launch: launch as bigint, hookEth: hookEth as bigint, vaultEth: vaultEth as bigint });
    } catch {
      setMyClaimable(null);
    }
  }, [address, readClient]);

  useEffect(() => {
    void refreshMyClaimable();
  }, [refreshMyClaimable]);

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
        address ? readClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, LAUNCHPAD_ADDRESS as Address] }) : Promise.resolve(0n),
        selected.state === 'Graduated' ? Promise.resolve(0n) : readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'spotPriceWeiPerToken', args: [token] }),
        address ? readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claimable', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableEth', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimableToken', args: [token, account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableEth', args: [account] }) : Promise.resolve(0n),
        address ? readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimableToken', args: [token, account] }) : Promise.resolve(0n),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingEth', args: [token] }),
        readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'pendingToken', args: [token] }),
        readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'seeded', args: [token] }),
        readClient.readContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'positionOf', args: [token] }),
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
  }, [address, readClient, selected?.address, selected?.state]);

  useEffect(() => {
    void refreshDetails();
  }, [refreshDetails]);

  useEffect(() => {
    setGradReward(null);
    if (!readClient || !selected?.address || selected.state !== 'Locked') return;
    // `.catch` nie jest ozdoba: bez niego chwilowe odbicie RPC staje sie
    // nieobsluzonym odrzuceniem, zamiast po prostu wyczyscic wycene.
    void readClient
      .readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'gradFeeOf', args: [selected.address as Address] })
      .then((quote) => setGradReward(quote[1]))
      .catch(() => setGradReward(null));
  }, [readClient, selected?.address, selected?.state]);

  useEffect(() => {
    setSellQuote(null);
    if (!details || !selected?.address || details.decimals < 0 || sellAmount === '0' || Number(sellAmount) <= 0) return;
    // Flaga anulowania obejmuje odpowiedz W LOCIE: bez niej spozniony `.then`
    // ze starego tokena/kwoty nadpisalby swiezsza wycene po przelaczeniu.
    let cancelled = false;
    try {
      const amount = parseUnits(sellAmount, details.decimals);
      void readClient
        ?.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteSell', args: [selected.address as Address, amount] })
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
  }, [details, readClient, selected?.address, sellAmount]);

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
    if (!(await ensureSepolia())) return;
    setBusy('buy');
    setNotice(null);
    try {
      const quote = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteBuy', args: [selected.address, value] });
      const minTokensOut = (quote[0] * 9950n) / 10_000n;
      const hash = await walletClient.writeContract({
        address: LAUNCHPAD_ADDRESS as Address,
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
        const onchain = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'launchOf', args: [selected.address] });
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
          args: [LAUNCHPAD_ADDRESS as Address, maxUint256],
          chain: LAUNCHPAD_CHAIN,
          account: address,
        });
        await readClient.waitForTransactionReceipt({ hash: approveHash });
      }
      setBusy('sell');
      const quote = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'quoteSell', args: [selected.address as Address, amount] });
      const minEthOut = (quote[0] * 9950n) / 10_000n;
      const hash = await walletClient.writeContract({
        address: LAUNCHPAD_ADDRESS as Address,
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
        const afterSell = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'launchOf', args: [selected.address as Address] });
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
      const hash = await walletClient.writeContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'graduate', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
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
      const hash = await walletClient.writeContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'settle', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
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
      const hash = await walletClient.writeContract({ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'harvest', args: [selected.address as Address], chain: LAUNCHPAD_CHAIN, account: address });
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
        ? { address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claim' as const, args: [] as const }
        : source === 'hookEth'
          ? { address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimEth' as const, args: [] as const }
          : source === 'hookToken'
            ? { address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimToken' as const, args: [selected.address as Address] as const }
            : source === 'vaultEth'
              ? { address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimEth' as const, args: [] as const }
              : { address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimToken' as const, args: [selected.address as Address] as const };
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
    const calls = [
      ...(myClaimable.launch > 0n ? [{ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'claim' as const }] : []),
      ...(myClaimable.hookEth > 0n ? [{ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'claimEth' as const }] : []),
      ...(myClaimable.vaultEth > 0n ? [{ address: LIQUIDITY_VAULT_ADDRESS as Address, abi: liquidityVaultAbi, functionName: 'claimEth' as const }] : []),
    ];
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
    <main className="min-h-screen bg-sp-sunken px-4 pb-24 pt-0 font-soft sm:px-6">
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
              <div className="inline-flex items-stretch overflow-hidden rounded-full border border-sp-shade/10 bg-sp-surface shadow-[0_6px_16px_rgba(124,107,218,0.18)]">
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
                    label: ACTIVE_LAUNCHPAD_NETWORK.label,
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
            </span>
          </div>
          {/* Na telefonie search zdjety - filtry i przelacznik sieci wystarcza,
              a pole zabieralo cala szerokosc pierwszego ekranu. Na sm+ zostaje
              (jest w gornym wierszu obok logo). */}
        </div>

        {notice && <div role="status" aria-live="polite" className={`lp-toast-in fixed right-4 top-4 z-[80] flex max-w-[min(92vw,360px)] items-start gap-2 rounded-xl border px-3.5 py-3 text-[12.5px] shadow-[0_14px_44px_rgba(0,0,0,0.18)] ${notice.kind === 'success' ? 'border-sp-up-line bg-sp-up-soft text-sp-up' : 'border-sp-down-line bg-sp-down-soft text-sp-down-deep'}`}><span className="mt-0.5">{notice.kind === 'success' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}</span><span className="min-w-0 flex-1">{notice.text}</span><button type="button" onClick={() => setNotice(null)} className="ml-1 shrink-0 opacity-50 hover:opacity-100" aria-label="Dismiss"><X className="h-3.5 w-3.5" aria-hidden="true" /></button></div>}
        {(loadingBoard || boardError) && <div className="mb-4 flex items-center gap-2 rounded-xl border border-sp-shade/10 bg-sp-surface px-3.5 py-2.5 text-[11.5px] text-sp-shade/55"><RefreshCw className={`h-3.5 w-3.5 ${loadingBoard ? 'animate-spin text-soft-primary' : 'text-sp-down'}`} aria-hidden="true" /><span suppressHydrationWarning>{loadingBoard ? `Reading Launchpad activity from ${NET}...` : `Live data unavailable. ${boardError}`}</span></div>}

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
          <BoardStats totalRaised={totalRaised} totalVolume={totalVolume} totalTrades={totalTrades} liveCount={liveCount} ethUsd={ethUsd} />
          <TopLaunches tokens={tokens} onOpen={(token) => token.address && router.push(`/startpad/${token.address}`)} />
          <VolumePanel tokens={tokens} onOpen={(token) => token.address && router.push(`/startpad/${token.address}`)} />
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
            <div className="mt-5 flex items-center justify-between border-t border-sp-shade/10 pt-4 text-[11px] text-sp-shade/45"><span>{selected.holders} holders · {selected.trades ?? 0} trades</span><span className="flex items-center gap-2"><button type="button" onClick={() => void navigator.clipboard?.writeText(selected.address ?? selected.id)} className="inline-flex items-center gap-1.5 font-bold hover:text-soft-primary-deep"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy address</button>{selected.address && <button type="button" onClick={() => router.push(`/startpad/${selected.address}`)} className="inline-flex items-center gap-1.5 font-bold text-soft-primary-deep hover:text-soft-primary"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Details</button>}</span></div>
          </section>
        </div>
      )}
    </main>
  );
}
