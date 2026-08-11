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
import { formatEther, formatUnits, getAbiItem, maxUint256, parseEther, parseUnits, zeroAddress, type Address } from 'viem';
import { useAccount, useBalance, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  ACTIVE_LAUNCHPAD_NETWORK,
  CURVE_TARGET_ETH,
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
  previewTokens,
  setLaunchpadChain,
  type LaunchpadToken,
} from './config';
import { fetchLogos } from './logos';
import { fetchHolderCounts } from './blockscout';
import LaunchTokenModal from './LaunchTokenModal';
import StartpadFooter from './StartpadFooter';
import { formatUsd, useEthUsd } from './useEthUsd';

const FIELD =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-[14px] text-[#16141b] outline-none transition-colors placeholder:text-black/35 focus:border-[#7c6bda]';

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
    return <span className="text-[11px] font-bold text-black/40">{NET}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-2 pr-1 ${active.pillClass}`}>
      {active.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={active.logo} alt="" className="h-4 w-4 rounded-full" />
      )}
      <select
        value={active.chain.id}
        onChange={(event) => setLaunchpadChain(Number(event.target.value))}
        aria-label="Launchpad network"
        className="bg-transparent text-[11px] font-extrabold outline-none [color:inherit] [&>option]:bg-white [&>option]:text-[#16141b]"
      >
        {Object.values(LAUNCHPAD_NETWORKS).map((net) => (
          <option key={net.chain.id} value={net.chain.id}>
            {net.label}{net.testnet ? ' (testnet)' : ''}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Pastylka aktywnej sieci - sama etykieta, w barwach marki lancucha. */
function NetworkTag() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const net = mounted ? ACTIVE_LAUNCHPAD_NETWORK : null;
  if (!net) return <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/35">{NET}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${net.pillClass}`}>
      {net.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={net.logo} alt="" className="h-3.5 w-3.5 rounded-full" />
      )}
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
  return `${value.toFixed(value >= 1 ? 2 : 3)} ETH`;
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
 * Wirtualna rezerwa krzywej w ETH - stala `R_VIRT` kontraktu. Cena spot po
 * transakcji to (R_VIRT + ethReserve) / tokenReserve, i DOKLADNIE te rezerwy
 * niesie kazdy event `Bought`/`Sold`, wiec historia cen nie wymaga ani jednego
 * dodatkowego odczytu.
 */
const R_VIRT_ETH = 0.75;

function spotPriceFromReserves(ethReserveAfter: bigint, tokenReserveAfter: bigint): number {
  const tokens = Number(formatEther(tokenReserveAfter));
  if (tokens <= 0) return 0;
  return (R_VIRT_ETH + Number(formatEther(ethReserveAfter))) / tokens;
}

function TokenGlyph({ token, large = false }: { token: LaunchpadToken; large?: boolean }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-[16px] font-soft-display font-extrabold text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)] ${large ? 'h-16 w-16 text-[22px]' : 'h-11 w-11 text-[14px]'}`}
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
          <span aria-hidden="true" className="absolute -right-2 -top-3 h-8 w-8 rounded-full bg-white/25" />
          <span aria-hidden="true" className="absolute -bottom-3 -left-2 h-8 w-8 rounded-full bg-black/10" />
        </>
      )}
    </div>
  );
}

function StatePill({ state }: { state: LaunchpadToken['state'] }) {
  const meta = {
    Curve: { label: 'Curve', className: 'bg-[#edeaff] text-[#5f4ec2]' },
    Locked: { label: 'Locked', className: 'bg-[#f4f1ff] text-[#705fd0]' },
    Graduated: { label: 'Graduated', className: 'bg-[#edfff4] text-[#0b9a51]' },
  }[state];
  return <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] ${meta.className}`}>{meta.label}</span>;
}

function SamplePill() {
  return <span className="rounded-full bg-black/8 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-black/50">Sample</span>;
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
      <polyline points={points} fill="none" stroke={up ? '#18bd64' : '#c76b12'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
  if (token.state === 'Graduated') return { text: 'Graduated to pool', className: 'text-[#0b9a51]' };
  if (token.state === 'Locked') return { text: 'Awaiting graduation', className: 'text-[#705fd0]' };
  const toGo = Math.max(0, token.target - token.raised);
  return { text: `${toGo.toFixed(2)} ETH to graduation`, className: 'text-[#c76b12]' };
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
          <span className="truncate text-[15px] font-extrabold text-[#16141b]">{token.symbol}</span>
          <StatePill state={token.state} />
          {sample && <SamplePill />}
        </span>
        <span className="mt-1 block truncate text-[12px] text-black/50">{token.name}</span>
      </span>
    </>
  );
  return (
    <div className="relative flex flex-col rounded-[18px] border border-black/10 bg-white p-4 transition-shadow hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
      {animationsOn && <TradeFlash flash={token.flash} rounded="rounded-[18px]" />}
      {/* Wiersz podgladowy jest proba ukladu, nie rynkiem - nic na nim nie klika. */}
      {sample || !token.address ? (
        <div className="flex min-w-0 items-start gap-3">{header}</div>
      ) : (
        <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-3 text-left">{header}</button>
      )}

      <div className="mt-4">
        {/* flex-wrap zamiast truncate: przy duzych sumach "0.462 ETH · $865.01"
            i "2.54 ETH to graduation" nie walcza o jedna linie - status schodzi
            nizej, a cena i USD pokazuja sie w calosci (koniec z "$865..."). */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[17px] font-extrabold text-[#16141b]">{formatEth(token.raised)}{raisedNote && <span className="text-[11px] font-bold text-black/40"> · {raisedNote}</span>}</span>
          <span className={`ml-auto shrink-0 text-[11px] font-extrabold ${status.className}`}>{status.text}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/8">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, backgroundColor: token.accent }} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-black/45">
          <span className="min-w-0 truncate">{formatEth(token.volume ?? 0)}{volNote ? ` (${volNote})` : ''} vol · {token.holders} holders · {token.age}</span>
          <Sparkline prices={token.prices ?? []} />
        </div>
      </div>

      {!sample && (
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onTrade} className="flex-1 rounded-full bg-soft-primary px-3 py-2 text-[12px] font-extrabold text-white">Trade</button>
          {/* Bez adresu "Details" prowadziloby na /startpad/undefined. */}
          {token.address && <button type="button" onClick={onOpen} className="rounded-full border border-black/15 bg-white px-3 py-2 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary">Details</button>}
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
function KingOfTheHill({ token, ethUsd, onTrade, onDetails }: { token: BoardToken; ethUsd: number | null; onTrade: () => void; onDetails: () => void }) {
  const progress = curvePercent(token);
  const toGo = Math.max(0, token.target - token.raised);
  const raisedNote = usdNote(token.raised, ethUsd);
  const volNote = usdNote(token.volume ?? 0, ethUsd);
  return (
    <section className="relative mt-5 overflow-hidden rounded-[20px] border border-soft-primary/30 bg-white p-4 sm:p-5" aria-label="King of the hill">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-soft-primary/[0.08] blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TokenGlyph token={token} large />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-soft-primary-deep">
              <Crown className="h-3.5 w-3.5" aria-hidden="true" /> King of the hill
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[17px] font-extrabold text-[#16141b]">{token.symbol}</span>
              <StatePill state={token.state} />
            </div>
            <p className="mt-0.5 truncate text-[12px] text-black/50">{token.name} · {token.holders} holders · {formatEth(token.volume ?? 0)}{volNote ? ` (${volNote})` : ''} vol · {token.age}</p>
          </div>
        </div>
        <div className="w-full sm:w-[240px]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[15px] font-extrabold text-[#16141b]">{formatEth(token.raised)}{raisedNote && <span className="text-[11px] font-bold text-black/45"> · {raisedNote}</span>}</span>
            <span className="text-[11px] font-extrabold text-[#c76b12]">{toGo.toFixed(2)} ETH to go</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-black/8">
            <div className="h-full rounded-full bg-soft-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onTrade} className="rounded-full bg-soft-primary px-4 py-2.5 text-[12px] font-extrabold text-white">Trade</button>
          {token.address && <button type="button" onClick={onDetails} className="rounded-full border border-black/15 bg-white px-4 py-2.5 text-[12px] font-extrabold text-[#16141b] hover:border-soft-primary">Details</button>}
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
  tone: 'launch' | 'buy' | 'sell' | 'graduate';
  logoUrl?: string;
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
  buy: '#18bd64',
  sell: '#c76b12',
  launch: '#7c6bda',
  graduate: '#0b9a51',
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
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-[9px] font-extrabold text-white ring-1 ring-black/10"
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
    <div className="-mx-4 overflow-x-auto border-b border-black/10 bg-white sm:-mx-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Live Startpad events">
      <div className="flex min-h-[38px] w-max items-center gap-1.5 px-2 py-1.5">
        {items.length ? items.map((event) => (
          <div key={event.id} className="lp-ticker-in flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 bg-white px-2 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <FeedGlyph item={event} />
            <span className="pr-1 text-left leading-tight">
              <span className="block text-[10px] font-bold text-[#16141b]">{event.symbol}</span>
              <span className={`block text-[9px] font-bold ${event.tone === 'sell' ? 'text-[#a34b08]' : event.tone === 'buy' ? 'text-[#0b9a51]' : event.tone === 'graduate' ? 'text-[#0b7a41]' : 'text-[#5f4ec2]'}`}>{event.label}</span>
            </span>
          </div>
        )) : <span className="px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-black/35">Listening for live Startpad events...</span>}
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
    { icon: <CircleDollarSign className="h-4 w-4 text-[#8f45df]" aria-hidden="true" />, label: 'Curve reserve', value: formatEth(totalRaised), sub: usdNote(totalRaised, ethUsd) },
    { icon: <TrendingUp className="h-4 w-4 text-[#24a3ee]" aria-hidden="true" />, label: 'Indexed volume', value: formatEth(totalVolume), sub: usdNote(totalVolume, ethUsd) },
    { icon: <BarChart3 className="h-4 w-4 text-[#18bd64]" aria-hidden="true" />, label: 'Trades', value: totalTrades.toLocaleString('en-US'), sub: null },
    { icon: <Zap className="h-4 w-4 text-soft-primary" aria-hidden="true" />, label: 'Active curves', value: String(liveCount), sub: null },
  ];
  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-[#16141b]">Board stats</h2>
        <NetworkTag />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl bg-[#fafafd] p-3">
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-black/40">{row.icon}{row.label}</span>
            <span className="mt-1.5 block truncate font-soft-display text-[18px] font-extrabold leading-none text-[#111016]">{row.value}</span>
            {row.sub && <span className="mt-1 block truncate text-[10.5px] font-bold text-black/40">{row.sub}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function TopLaunches({ tokens, onOpen }: { tokens: BoardToken[]; onOpen: (token: BoardToken) => void }) {
  const top = [...tokens].sort((a, b) => b.raised - a.raised).slice(0, 3);
  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-[#16141b]">Top launches</h2>
        <TrendingUp className="h-4 w-4 text-[#7c6bda]" aria-hidden="true" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {top.map((token) => {
          const body = (
            <>
              <span className="mx-auto block w-fit transition-transform group-hover:-translate-y-1"><TokenGlyph token={token} large /></span>
              <span className="mt-2 block truncate text-[12px] font-extrabold text-[#16141b]">{token.symbol}</span>
              <span className="mt-1 block truncate text-[11px] text-black/50">{formatEth(token.raised)}</span>
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
    <section className="rounded-[20px] border border-black/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-[#16141b]">Top volume</h2>
        <BarChart3 className="h-4 w-4 text-[#1e9de0]" aria-hidden="true" />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] font-bold uppercase tracking-[0.08em] text-black/40">
        <span>Coin</span><span>Volume</span><span>Trades</span>
      </div>
      <div className="mt-2 divide-y divide-black/10">
        {top.map((token) => {
          const cells = (
            <>
              <span className="flex min-w-0 items-center gap-2"><TokenGlyph token={token} /><span className="truncate text-[12px] font-extrabold text-[#16141b]">{token.symbol}</span></span>
              <span className="text-[12px] font-bold text-[#16141b]">{formatEth(token.volume ?? 0)}</span>
              <span className="text-[12px] font-bold text-black/60">{token.trades ?? 0}</span>
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
 * Tablica tworcow wg zarobkow NALICZONYCH na lancuchu: udzial w oplacie
 * krzywej (wg konfiguracji kazdego tokena) plus `ethToCreator` z rozliczen
 * hooka po graduacji. Naliczone to nie wyplacone - wyplata idzie osobnym
 * claimem, wiec podpis mowi "accrued" i niczego wiecej nie obiecuje.
 */
function TopEarnings({ rows, ethUsd }: { rows: CreatorEarnings[]; ethUsd: number | null }) {
  const explorer = LAUNCHPAD_CHAIN.blockExplorers?.default?.url ?? 'https://sepolia.basescan.org';
  return (
    <section className="rounded-[20px] border border-black/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-extrabold text-[#16141b]">Top earnings</h2>
        <Crown className="h-4 w-4 text-[#d99a1b]" aria-hidden="true" />
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-black/40">Creator-side fees accrued on-chain - protocol share excluded, claims separate</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-[11.5px] leading-[1.5] text-black/45">
          No creator fees indexed yet. Every curve trade and pool swap accrues a creator share that shows up here.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-black/5">
          {rows.map((row, index) => {
            const eth = Number(formatEther(row.totalWei));
            const note = usdNote(eth, ethUsd);
            const first = index === 0;
            return (
              <div key={row.creator} className={`flex items-center gap-2.5 py-2 ${first ? '-mx-2 rounded-xl bg-[#fff8ed] px-2' : ''}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${first ? 'bg-[#f3c58a] text-[#8c4a0b]' : 'bg-black/5 text-black/50'}`}>
                  {first ? <Crown className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <a
                    href={`${explorer}/address/${row.creator}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] font-extrabold text-[#16141b] hover:text-soft-primary-deep"
                  >
                    {shortAddress(row.creator)}
                    <ExternalLink className="h-3 w-3 text-black/30" aria-hidden="true" />
                  </a>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-black/45">
                    <span>{row.tokenCount} {row.tokenCount === 1 ? 'token' : 'tokens'}</span>
                    {row.graduated && <span className="rounded-full bg-[#edfff4] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.05em] text-[#0b9a51]">Graduated</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[12px] font-extrabold text-[#16141b]">{eth.toFixed(4)} ETH</span>
                  {note && <span className="block text-[10.5px] font-bold text-black/40">{note}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 border-t border-black/5 pt-2.5 text-[10.5px] leading-[1.5] text-black/40">
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
    <section className="mt-5 rounded-[20px] border border-black/10 bg-white p-5" aria-label="My tokens">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-extrabold text-[#16141b]">
            <WalletCards className="h-4 w-4 text-soft-primary" aria-hidden="true" /> My tokens
          </h2>
          <p className="mt-1 text-[11px] text-black/45">Launches created by your connected wallet · earnings accrue on-chain</p>
        </div>
        {totalClaimable > 0n && (
          <span className="flex items-center gap-2.5 rounded-full bg-[#f0fff5] py-1.5 pl-3.5 pr-1.5">
            <span className="text-[12px] font-extrabold text-[#08753d]">
              {claimEth.toFixed(4)} ETH claimable{claimNote && <span className="font-bold text-[#08753d]/70"> · {claimNote}</span>}
            </span>
            <button
              type="button"
              disabled={claimBusy}
              onClick={onClaim}
              className="rounded-full bg-[#0b9a51] px-3.5 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-60"
            >
              {claimBusy ? 'Claiming...' : 'Claim'}
            </button>
          </span>
        )}
      </div>
      {tokens.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-[#fafafd] px-4 py-8 text-center">
          <p className="text-[13px] font-bold text-black/50">You have not launched anything yet</p>
          <button type="button" onClick={onLaunch} className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[12px] font-extrabold text-white">
            <Plus className="h-4 w-4" aria-hidden="true" /> Launch
          </button>
        </div>
      ) : (
        <div className="mt-2 divide-y divide-black/5">
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
                      <span className="truncate text-[14px] font-extrabold text-[#16141b]">{token.symbol}</span>
                      <StatePill state={token.state} />
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-black/50">{token.name}</span>
                  </span>
                </button>
                <div className="w-full shrink-0 sm:w-[170px]">
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="font-extrabold text-[#16141b]">{formatEth(token.raised)}</span>
                    <span className="text-black/40">{progress}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/8">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${progress}%`, backgroundColor: token.accent }} />
                  </div>
                </div>
                <div className="w-[92px] shrink-0">
                  <span className="block text-[12px] font-bold text-[#16141b]">{formatEth(token.volume ?? 0)}</span>
                  <span className="block text-[10px] text-black/40">volume</span>
                </div>
                <div className="w-[118px] shrink-0">
                  <span className="block text-[12px] font-extrabold text-[#0b9a51]">{earnedEth.toFixed(4)} ETH</span>
                  <span className="block text-[10px] text-black/40">{earnedNote ? `${earnedNote} accrued` : 'accrued earnings'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(token)}
                  className="ml-auto shrink-0 rounded-full p-2 text-black/40 hover:bg-[#f4f1ff] hover:text-[#5f4ec2]"
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
        <span className="flex flex-wrap items-center gap-2"><span className="truncate text-[14px] font-extrabold text-[#16141b]">{token.symbol}</span><StatePill state={token.state} />{sample && <SamplePill />}</span>
        <span className="mt-1 flex items-center gap-2 truncate text-[12px] text-black/50"><span>{token.name}</span><span aria-hidden="true">•</span><span>{token.age}</span></span>
      </span>
    </>
  );
  return (
    <div className="relative grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_0.9fr_0.8fr_1.1fr_0.8fr_auto] items-center gap-4 border-t border-black/10 px-4 py-3.5 text-left transition-colors hover:bg-[#fff8fc] sm:px-5">
      {animationsOn && <TradeFlash flash={token.flash} rounded="rounded-none" />}
      {sample || !token.address ? (
        <div className="flex min-w-0 items-center gap-3">{coinCell}</div>
      ) : (
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left">{coinCell}</button>
      )}
      <div><span className="block text-[14px] font-extrabold text-[#16141b]">{formatEth(token.raised)}{raisedNote && <span className="text-[11px] font-bold text-black/40"> · {raisedNote}</span>}</span><span className={`mt-1 block text-[11px] font-bold ${status.className}`}>{status.text}</span></div>
      <div><span className="block text-[14px] font-bold text-[#16141b]">{formatEth(token.volume ?? 0)}{volNote && <span className="text-[11px] font-bold text-black/40"> · {volNote}</span>}</span><span className="mt-1 block text-[11px] text-black/45">indexed volume</span></div>
      <div className="flex items-center gap-2"><Sparkline prices={token.prices ?? []} /><span className="text-[11px] font-bold text-black/45">{token.holders} holders</span></div>
      <div><span className="block text-[14px] font-bold text-[#16141b]">{shortAddress(token.creator)}</span><span className="mt-1 block text-[11px] text-black/45">creator</span></div>
      {sample ? (
        <span />
      ) : (
        <span className="flex items-center gap-1.5"><button type="button" onClick={onTrade} className="rounded-full border border-black/15 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] shadow-sm transition-colors hover:border-[#7c6bda] hover:text-[#5f4ec2]">Trade</button>{token.address && <button type="button" onClick={onOpen} className="rounded-full p-2 text-black/40 hover:bg-[#f4f1ff] hover:text-[#5f4ec2]" aria-label={`Open ${token.symbol} details`}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></button>}</span>
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
  const GAS_HEADROOM_WEI = 5_000_000_000_000_000n; // ~0.005 ETH
  const setBuyFraction = (numerator: bigint, denominator: bigint) => {
    if (!ethBalance) return;
    const spendable = ethBalance.value > GAS_HEADROOM_WEI ? ethBalance.value - GAS_HEADROOM_WEI : 0n;
    setBuyAmount(formatEther((spendable * numerator) / denominator));
  };
  const setSellFraction = (numerator: bigint, denominator: bigint) => {
    if (!details) return;
    setSellAmount(formatUnits((details.balance * numerator) / denominator, decimals));
  };
  // ETH pozostaje wartoscia glowna wyceny; dopisek USD znika przy braku kursu.
  const sellQuoteNote = sellQuote === null ? null : usdNote(Number(formatEther(sellQuote)), ethUsd);
  const claimRows = details ? [
    { label: 'Startpad fees (curve)', value: formatEther(details.launchClaimable), amount: details.launchClaimable, source: 'launch' as const },
    { label: 'Hook ETH', value: formatEther(details.hookEthClaimable), amount: details.hookEthClaimable, source: 'hookEth' as const },
    { label: 'Hook token', value: formatUnits(details.hookTokenClaimable, decimals), amount: details.hookTokenClaimable, source: 'hookToken' as const },
    { label: 'Vault ETH', value: formatEther(details.vaultEthClaimable), amount: details.vaultEthClaimable, source: 'vaultEth' as const },
    { label: 'Vault token', value: formatUnits(details.vaultTokenClaimable, decimals), amount: details.vaultTokenClaimable, source: 'vaultToken' as const },
  ] : [];

  // Kupno rewertuje poza stanem Curve (`CurveIsLocked`/`AlreadyGraduated`),
  // a sprzedaz na krzywej dziala takze w Locked - panel odzwierciedla kontrakt,
  // zamiast pozwalac na klik konczacy sie surowym bledem viem.
  const canBuy = token.state === 'Curve';
  const canSell = token.state === 'Curve' || token.state === 'Locked';
  const effectiveSide: TradeSide = side === 'buy' && !canBuy ? 'sell' : side;

  return <>
    {canSell && <div className="mt-5 flex items-center gap-1 rounded-xl bg-[#f4f1ff] p-1">
      {(canBuy ? (['buy', 'sell'] as const) : (['sell'] as const)).map((item) => <button key={item} type="button" onClick={() => setSide(item)} className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-extrabold capitalize ${effectiveSide === item ? 'bg-white text-soft-primary-deep shadow-sm' : 'text-black/45'}`}>{item === 'buy' ? 'Buy with ETH' : 'Sell token'}</button>)}
    </div>}
    {!canBuy && canSell && <p className="mt-2 text-[11px] leading-[1.4] text-black/50">Buying closed — the curve is full. Selling stays open until the pool opens.</p>}
    {!canSell && <p className="mt-5 rounded-xl bg-[#f4f1ff] p-3 text-[11px] leading-[1.4] text-black/55">Curve trading ended at graduation — swaps happen in the Uniswap v4 pool now.</p>}
    {canSell && (effectiveSide === 'buy' ? <>
      <div className="mt-4 flex items-end justify-between"><span className="text-[12px] font-extrabold text-[#16141b]">ETH amount</span><span className="text-[11px] text-black/45">0.5% slippage buffer</span></div>
      <div className="mt-2 flex gap-2"><div className="relative flex-1"><input inputMode="decimal" value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} className={`${FIELD} pr-14`} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-black/40">ETH</span></div><button type="button" disabled={busy === 'buy'} onClick={onBuy} className="inline-flex items-center gap-2 rounded-xl bg-soft-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-60">{busy === 'buy' ? 'Buying...' : 'Buy'}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button></div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(['25', '50', '100'] as const).map((pct) => <button key={pct} type="button" disabled={!ethBalance} onClick={() => setBuyFraction(BigInt(pct), 100n)} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary disabled:opacity-40">{pct}%</button>)}
        <button type="button" disabled={!ethBalance} onClick={() => setBuyFraction(1n, 1n)} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary disabled:opacity-40">Max</button>
      </div>
    </> : <>
      <div className="mt-4 flex items-end justify-between"><span className="text-[12px] font-extrabold text-[#16141b]">Token amount</span><span className="text-[11px] text-black/45">Balance {Number(balance).toFixed(4)}</span></div>
      <div className="mt-2 flex gap-2"><div className="relative flex-1"><input inputMode="decimal" value={sellAmount} onChange={(event) => setSellAmount(event.target.value)} className={`${FIELD} pr-16`} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-extrabold text-black/40">{token.symbol}</span></div><button type="button" disabled={busy === 'sell' || busy === 'approve'} onClick={onSell} className="inline-flex items-center gap-2 rounded-xl bg-[#16141b] px-4 text-[13px] font-extrabold text-white disabled:opacity-60">{busy === 'approve' ? 'Approving...' : busy === 'sell' ? 'Selling...' : 'Sell'}<ArrowDownToLine className="h-4 w-4" aria-hidden="true" /></button></div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(['25', '50', '100'] as const).map((pct) => <button key={pct} type="button" disabled={!details || details.balance === 0n} onClick={() => setSellFraction(BigInt(pct), 100n)} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary disabled:opacity-40">{pct}%</button>)}
        <button type="button" disabled={!details || details.balance === 0n} onClick={() => setSellFraction(1n, 1n)} className="rounded-full border border-black/10 px-2.5 py-1 text-[10.5px] font-bold text-black/60 hover:border-soft-primary disabled:opacity-40">Max</button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-black/45"><span>Estimated output</span><span className="font-extrabold text-[#16141b]">{sellQuote === null ? '--' : `${formatEther(sellQuote)} ETH`}{sellQuoteNote && <span className="font-bold text-black/45"> · {sellQuoteNote}</span>}</span></div>
    </>)}

    {token.state === 'Locked' && <div className="mt-5 rounded-xl border border-[#f3c58a] bg-[#fff8ed] p-3"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#c76b12]" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold text-[#8c4a0b]">Ready for graduation</p><p className="mt-1 text-[11px] leading-[1.4] text-black/55">Anyone can open the pool. Caller reward: {gradReward === null ? '--' : `${formatEther(gradReward)} ETH`}.</p></div><button type="button" disabled={busy === 'graduate'} onClick={onGraduate} className="rounded-full bg-[#c76b12] px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50">{busy === 'graduate' ? 'Opening...' : 'Graduate'}</button></div></div>}

    {token.state === 'Graduated' && <div className="mt-5 rounded-xl bg-[#f4f1ff] p-3"><div className="flex items-start gap-2"><Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold text-[#16141b]">Live pool with hook</p><p className="mt-1 text-[11px] leading-[1.4] text-black/55">{details?.poolId && details.poolId !== `0x${'0'.repeat(64)}` ? `Pool ${details.poolId.slice(0, 10)}...` : 'Pool position is loading.'}</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={!details?.pendingEth || busy === 'settle'} onClick={onSettle} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-[11px] font-extrabold text-[#16141b] disabled:opacity-40">{busy === 'settle' ? 'Settling...' : `Settle ${details ? formatEther(details.pendingEth) : '0'} ETH`}</button><button type="button" disabled={busy === 'harvest'} onClick={onHarvest} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-[11px] font-extrabold text-[#16141b] disabled:opacity-40">{busy === 'harvest' ? 'Harvesting...' : 'Harvest LP fees'}</button></div></div>}

    {isConnected && details && <div className="mt-5 border-t border-black/10 pt-4"><div className="flex items-center justify-between"><span className="text-[12px] font-extrabold text-[#16141b]">Available claims</span><CheckCircle2 className="h-4 w-4 text-[#18bd64]" aria-hidden="true" /></div><div className="mt-2 space-y-1.5">{claimRows.map((row) => <div key={row.label} className="flex items-center justify-between gap-2 text-[11px]"><span className="text-black/50">{row.label}</span><span className="flex items-center gap-2 font-extrabold text-[#16141b]"><span>{row.value}</span><button type="button" disabled={row.amount === 0n} onClick={() => onClaim(row.source)} className="rounded-full border border-black/10 px-2 py-1 text-[10px] text-soft-primary-deep disabled:opacity-30">Claim</button></span></div>)}</div></div>}
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

const LAUNCHED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Launched' });
const BOUGHT_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Bought' });
const SOLD_EVENT = getAbiItem({ abi: launchpadAbi, name: 'Sold' });
// Rozliczenia oplat puli po graduacji emituje HOOK, nie launchpad - stad
// drugi adres w skanie. Tablicy zarobkow wystarczy pole `ethToCreator`.
const HOOK_FEE_SETTLED_EVENT = getAbiItem({ abi: hookAbi, name: 'HookFeeSettled' });
// Kazde naliczenie co do wei per ODBIORCA - jedyne zrodlo, ktore rozlicza
// takze splity miedzy odbiorcow fee. kind 1 = strona tworcy oplaty handlowej.
const FEE_ACCRUED_EVENT = getAbiItem({ abi: launchpadAbi, name: 'FeeAccrued' });

const ACCENTS = ['#8b78e6', '#5fa78c', '#d78a55', '#5b8bd9', '#d9628a', '#4fa3a8'];

function accentFor(token: string) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
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
  // Domyslnie wlaczone; wybor uzytkownika przezywa odswiezenie strony.
  // Odczyt w efekcie, nie w inicjalizatorze - localStorage nie istnieje na
  // serwerze, a rozjazd SSR/klient konczy sie bledem hydratacji.
  const [animationsOn, setAnimationsOn] = useState(true);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  // `true` od pierwszego renderu: zanim efekt odpali skan, rynek ma pokazywac
  // szkielet, a nie pusty stan ani probki.
  const [loadingBoard, setLoadingBoard] = useState(true);
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

  useEffect(() => {
    try {
      if (window.localStorage.getItem('launchpad-animations') === '0') setAnimationsOn(false);
    } catch {
      // Prywatny tryb przegladarki potrafi rzucac na localStorage - wtedy
      // zostaje domyslne "wlaczone" i nic wiecej sie nie dzieje.
    }
  }, []);

  const toggleAnimations = () => {
    setAnimationsOn((current) => {
      const next = !current;
      try {
        window.localStorage.setItem('launchpad-animations', next ? '1' : '0');
      } catch {
        // Brak zapisu znaczy tylko tyle, ze wybor nie przezyje odswiezenia.
      }
      return next;
    });
  };

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
    setLoadingBoard(true);
    setBoardError(null);
    try {
      const latest = await readClient.getBlockNumber();
      const launched = new Map<Address, { name: string; symbol: string; creator: Address; startedAt: number }>();
      const buyers = new Map<Address, Set<Address>>();
      const activity = new Map<Address, { volume: number; trades: number }>();
      // Surowce tablicy zarobkow. Wei w bigint - na number przechodzimy
      // dopiero przy wyswietlaniu.
      const hookCreatorEth = new Map<Address, bigint>();
      // FeeAccrued kind 1: dokladne naliczenia strony tworcy per ODBIORCA
      // per token. Klucz lowercase; accountDisplay trzyma forme z checksumem.
      const creatorSideEarned = new Map<string, Map<Address, bigint>>();
      const accountDisplay = new Map<string, Address>();
      // Okna ida od NAJNOWSZEGO wstecz, wiec kolejnosc napotkania nie jest
      // chronologia - kazdy wpis niesie klucz (blok, logIndex) do posortowania.
      const priceEntries = new Map<Address, Array<{ order: number; price: number }>>();
      // Ten sam klucz (blok, logIndex) co przy cenach: okna ida od najnowszego
      // wstecz, ale WEWNATRZ okna logi sa od najstarszego - bez sortowania
      // tasma pokazywalaby najstarsze wpisy najnowszego okna jako "najswiezsze".
      const rawFeed: Array<{ id: string; token: Address; label: string; tone: ActivityItem['tone']; order: number }> = [];
      const orderOf = (log: { blockNumber: bigint | null; logIndex: number | null }) =>
        Number(log.blockNumber ?? 0n) * 10_000 + Number(log.logIndex ?? 0);

      const pushPrice = (token: Address, log: { blockNumber: bigint | null; logIndex: number | null }, ethReserveAfter?: bigint, tokenReserveAfter?: bigint) => {
        if (ethReserveAfter === undefined || tokenReserveAfter === undefined || tokenReserveAfter <= 0n) return;
        const list = priceEntries.get(token) ?? [];
        list.push({
          order: Number(log.blockNumber ?? 0n) * 10_000 + Number(log.logIndex ?? 0),
          price: spotPriceFromReserves(ethReserveAfter, tokenReserveAfter),
        });
        priceEntries.set(token, list);
      };

      let toBlock = latest;
      for (let window = 0; window < MAX_LOG_WINDOWS && toBlock >= LAUNCHPAD_DEPLOY_BLOCK; window += 1) {
        const fromBlock = toBlock > LAUNCHPAD_DEPLOY_BLOCK + LOG_WINDOW ? toBlock - LOG_WINDOW : LAUNCHPAD_DEPLOY_BLOCK;
        // Dwa adresy w jednym strzale: launchpad emituje handel na krzywej,
        // hook rozliczenia oplat puli. Osobny skan hooka w tych samych oknach
        // podwoilby liczbe requestow do publicznego RPC.
        const logs = await readClient.getLogs({
          address: [LAUNCHPAD_ADDRESS as Address, LAUNCH_HOOK_ADDRESS as Address],
          events: [LAUNCHED_EVENT, BOUGHT_EVENT, SOLD_EVENT, HOOK_FEE_SETTLED_EVENT, FEE_ACCRUED_EVENT],
          fromBlock,
          toBlock,
        });
        for (const log of logs) {
          const token = log.args.token as Address | undefined;
          if (!token) continue;
          if (log.eventName === 'Launched') {
            launched.set(token, {
              name: log.args.name as string,
              symbol: log.args.symbol as string,
              creator: log.args.creator as Address,
              startedAt: Number(log.args.startedAt ?? 0),
            });
            rawFeed.push({ id: `${log.transactionHash}-launch`, token, label: 'Launched', tone: 'launch', order: orderOf(log) });
          } else if (log.eventName === 'Bought') {
            const set = buyers.get(token) ?? new Set<Address>();
            set.add(log.args.buyer as Address);
            buyers.set(token, set);
            const ethNet = Number(formatEther(log.args.ethNet as bigint));
            const current = activity.get(token) ?? { volume: 0, trades: 0 };
            activity.set(token, { volume: current.volume + ethNet, trades: current.trades + 1 });
            pushPrice(token, log, log.args.ethReserveAfter as bigint | undefined, log.args.tokenReserveAfter as bigint | undefined);
            rawFeed.push({ id: `${log.transactionHash}-buy`, token, label: `Buy ${formatEth(ethNet)}`, tone: 'buy', order: orderOf(log) });
          } else if (log.eventName === 'Sold') {
            const set = buyers.get(token) ?? new Set<Address>();
            set.add(log.args.seller as Address);
            buyers.set(token, set);
            const ethOut = Number(formatEther(log.args.ethOut as bigint));
            const current = activity.get(token) ?? { volume: 0, trades: 0 };
            activity.set(token, { volume: current.volume + ethOut, trades: current.trades + 1 });
            pushPrice(token, log, log.args.ethReserveAfter as bigint | undefined, log.args.tokenReserveAfter as bigint | undefined);
            rawFeed.push({ id: `${log.transactionHash}-sell`, token, label: `Sell ${formatEth(ethOut)}`, tone: 'sell', order: orderOf(log) });
          } else if (log.eventName === 'HookFeeSettled') {
            // Hook rozlicza tworcy jego czesc oplat puli JUZ PO potraceniu
            // auto-buybacku (buyback schodzi wylacznie z dzialki tworcy),
            // wiec ethToCreator sumujemy wprost - bez odtwarzania podzialu.
            const ethToCreator = log.args.ethToCreator as bigint | undefined;
            if (ethToCreator) hookCreatorEth.set(token, (hookCreatorEth.get(token) ?? 0n) + ethToCreator);
          } else if (log.eventName === 'FeeAccrued') {
            // kind 1 = strona TWORCY oplaty handlowej, per faktyczny ODBIORCA.
            // To rozlicza splity miedzy odbiorcow co do wei - w przeciwienstwie
            // do mnozenia feeEth przez konfiguracje, ktore przypisywalo cala
            // dzialke tworcy jego adresowi.
            const kind = Number(log.args.kind ?? 255);
            const accountAddr = log.args.account as Address | undefined;
            const amount = log.args.amount as bigint | undefined;
            if (kind === 1 && accountAddr && amount) {
              const accountKey = accountAddr.toLowerCase();
              accountDisplay.set(accountKey, accountAddr);
              const perToken = creatorSideEarned.get(accountKey) ?? new Map<Address, bigint>();
              perToken.set(token, (perToken.get(token) ?? 0n) + amount);
              creatorSideEarned.set(accountKey, perToken);
            }
          }
        }
        if (fromBlock === LAUNCHPAD_DEPLOY_BLOCK) break;
        toBlock = fromBlock - 1n;
      }

      // Petla mogla skonczyc sie z powodu SUFITU OKIEN, a nie dojscia do bloku
      // wdrozenia. Wtedy starsze starty sa poza skanem i musimy to POWIEDZIEC -
      // cicho zniknely token wyglada jak skasowany, a jest tylko nieodczytany.
      setScanTruncated(toBlock >= LAUNCHPAD_DEPLOY_BLOCK);

      if (launched.size === 0) {
        setActivityFeed([]);
        setTokens(previewTokens);
        setTopEarners([]);
        return;
      }

      setActivityFeed(
        rawFeed
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
        setTokens(previewTokens);
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
      // Do tablicy wchodza tylko konta z niezerowym naliczeniem - wiersz
      // "0.0000 ETH" niczego by nie mowil i tylko udawal ranking.
      setTopEarners(
        [...earningsByAccount.values()]
          .map((entry) => ({ ...entry, tokenCount: entry.tokens.size }))
          .sort((a, b) => (b.totalWei > a.totalWei ? 1 : b.totalWei < a.totalWei ? -1 : 0))
          .slice(0, 5)
      );
      live.sort((a, b) => b.raised - a.raised);
      setTokens(live);
      setSelectedId((current) => (live.some((token) => token.id === current) ? current : live[0].id));

      // Liczba POSIADACZY z Blockscouta - miekki dodatek scalany po fakcie.
      // Z samego RPC nie da sie jej policzyc bez skanu wszystkich transferow;
      // tu przychodzi z indeksu. Gdy Blockscout milczy, zostaje liczba z eventow.
      const liveAddresses = live.filter((t) => t.address).map((t) => t.address as string);
      void fetchHolderCounts(ACTIVE_LAUNCHPAD_NETWORK.chain.id, liveAddresses).then((counts) => {
        if (Object.keys(counts).length === 0) return;
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

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

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
      poll: true,
      pollingInterval: 8_000,
      // Bez tego viem wypisuje kazde odbicie publicznego RPC do konsoli. Zywy
      // podglad jest DODATKIEM - tablica ma juz dane z `loadBoard`, wiec cicha
      // przerwa w subskrypcji jest wlasciwym zachowaniem, a nie awaria.
      onError: () => {},
      onLogs: (logs) => {
        const fresh: ActivityItem[] = [];

        for (const log of logs) {
          const decoded = log as unknown as { eventName?: string; args?: Record<string, unknown>; transactionHash?: string };
          const token = decoded.args?.token as Address | undefined;
          const eventName = decoded.eventName;
          if (!token || !eventName) continue;
          const id = `${decoded.transactionHash ?? ''}-${eventName}-${String(log.logIndex ?? 0)}`;

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
            label: `${isBuy ? 'Buy' : 'Sell'} ${eth === undefined ? '' : formatEth(Number(formatEther(eth)))}`.trim(),
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
          return [...unique.reverse(), ...current].slice(0, 24);
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

    void fetchLogos(ACTIVE_LAUNCHPAD_NETWORK.chain.id).then((logos) => {
      if (cancelled || Object.keys(logos).length === 0) return;
      setTokens((current) =>
        current.map((row) => {
          const url = row.address ? logos[row.address.toLowerCase()] : undefined;
          return url && url !== row.logoUrl ? { ...row, logoUrl: url } : row;
        })
      );
    });

    return () => {
      cancelled = true;
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
      const known = event.address ? byAddress.get(event.address.toLowerCase()) : undefined;
      if (!known) return event;
      return {
        ...event,
        logoUrl: known.logoUrl ?? event.logoUrl,
        // Zywy feed wpisuje skrocony adres zamiast symbolu - gdy token jest
        // juz na tablicy, pokazujemy jego prawdziwy ticker.
        symbol: event.symbol.startsWith('0x') ? known.symbol : event.symbol,
      };
    });
  }, [activityFeed, tokens]);

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
      setNotice({ kind: 'error', text: 'Enter an ETH amount greater than zero, written as a decimal number.' });
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
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The buy transaction reverted.');
      // launchOf: [creator, state, ethReserve, tokenReserve, startedAt, launchId]
      const onchain = await readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName: 'launchOf', args: [selected.address] });
      const [, state, ethReserve] = onchain;
      setTokens((current) =>
        current.map((token) =>
          token.id === selected.id
            ? { ...token, raised: Number(formatEther(ethReserve)), state: (LAUNCH_STATE[state] as LaunchpadToken['state']) ?? token.state }
            : token,
        ),
      );
      setNotice({ kind: 'success', text: `Buy confirmed. ${hash.slice(0, 10)}...` });
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
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The sell transaction reverted.');
      setSellAmount('0');
      setNotice({ kind: 'success', text: `Sell confirmed. ${hash.slice(0, 10)}...` });
      await refreshDetails();
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
      await loadBoard();
      await refreshDetails();
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
    <main className="min-h-screen bg-[#fcfcfd] px-4 pb-24 pt-0 font-soft sm:px-6">
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
        @media (prefers-reduced-motion: reduce) {
          .lp-flash-buy, .lp-flash-sell, .lp-ticker-in { animation: none; }
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
          <div className="relative flex items-center gap-4">
            <h1 className="shrink-0 text-[20px] font-extrabold tracking-tight text-[#16141b]">
              Start<span className="text-soft-primary">Pad</span>
            </h1>
            <label className="relative hidden min-w-0 flex-1 max-w-[560px] sm:block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${FIELD} rounded-full bg-[#f3f3f5] pl-10`} placeholder="Search coins, creators" aria-label="Search coins and creators" />
            </label>
            <span className="ml-auto flex items-center gap-2">
              <NetworkSwitch />
              <button type="button" onClick={() => setLaunchOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-soft-primary px-4 py-2.5 text-[13px] font-extrabold text-white shadow-[0_6px_16px_rgba(124,107,218,0.22)] transition-transform active:scale-[0.97]"><Plus className="h-4 w-4" aria-hidden="true" /> Launch</button>
            </span>
          </div>
          {/* Na telefonie search zdjety - filtry i przelacznik sieci wystarcza,
              a pole zabieralo cala szerokosc pierwszego ekranu. Na sm+ zostaje
              (jest w gornym wierszu obok logo). */}
        </div>

        {notice && <div className={`mb-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[12.5px] ${notice.kind === 'success' ? 'border-[#9de7bb] bg-[#f0fff5] text-[#08753d]' : 'border-[#f3c58a] bg-[#fff8ed] text-[#a34b08]'}`}><span className="mt-0.5">{notice.kind === 'success' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}</span><span>{notice.text}</span></div>}
        {(loadingBoard || boardError) && <div className="mb-4 flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-[11.5px] text-black/55"><RefreshCw className={`h-3.5 w-3.5 ${loadingBoard ? 'animate-spin text-soft-primary' : 'text-[#c76b12]'}`} aria-hidden="true" /><span suppressHydrationWarning>{loadingBoard ? `Reading Launchpad activity from ${NET}...` : `Live data unavailable. ${boardError}`}</span></div>}

        {/* Rynek na CALA szerokosc - Live tape zjechal na gorny ticker, wiec nie
            ma juz prawej kolumny; grid tokenow wypelnia caly ekran. */}
        <div className="min-w-0">
            {/* Belka rynku: FILTRY zamiast tytulu/podtytulu - oszczedza pionowe
                miejsce. Tytul "Startpad market" i opisowa gadka wylecialy; ich
                miejsce zajmuja filtry, ktore i tak sa najwazniejsze. */}
            <section className="overflow-hidden rounded-[20px] border border-black/10 bg-white" aria-label="Startpad market">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  {/* Mobile: jeden przycisk-dropdown. */}
                  <select value={tab} onChange={(event) => setTab(event.target.value as BoardTab)} aria-label="Sort launches" className="rounded-full border border-black/10 bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#16141b] outline-none sm:hidden">
                    {([['new', 'New'], ['trending', 'Trending'], ['about', 'About to graduate'], ['graduated', 'Graduated'], ['all', 'All']] as const).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {/* Desktop: chipy inline. */}
                  <div className="hidden flex-wrap items-center gap-2 sm:flex" role="tablist" aria-label="Sort launches">
                    {([['new', 'New'], ['trending', 'Trending'], ['about', 'About to graduate'], ['graduated', 'Graduated'], ['all', 'All']] as const).map(([value, label]) => (
                      <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-extrabold transition-colors ${tab === value ? 'border-soft-primary bg-soft-primary text-white' : 'border-black/10 bg-white text-[#16141b] hover:border-soft-primary'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  {/* Na telefonie tylko ikonka (napis wypychal rzad do drugiej
                      linii); od sm pelny tekst. */}
                  <button type="button" onClick={toggleAnimations} aria-pressed={animationsOn} aria-label={animationsOn ? 'Animations on' : 'Animations off'} title={animationsOn ? 'Animations on' : 'Animations off'} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-extrabold transition-colors sm:px-3 ${animationsOn ? 'border-soft-primary/40 bg-soft-primary/10 text-soft-primary-deep' : 'border-black/10 bg-white text-black/45'}`}>
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{animationsOn ? 'Animations on' : 'Animations off'}</span>
                  </button>
                  <span className="inline-flex overflow-hidden rounded-full border border-black/10" role="tablist" aria-label="Market layout">
                    {(['grid', 'table'] as const).map((mode) => (
                      <button key={mode} type="button" role="tab" aria-selected={view === mode} onClick={() => setView(mode)} className={`px-3 py-1.5 text-[11px] font-extrabold capitalize transition-colors ${view === mode ? 'bg-soft-primary text-white' : 'bg-white text-[#16141b] hover:text-soft-primary-deep'}`}>{mode}</button>
                    ))}
                  </span>
                  <span className="hidden items-center gap-1.5 rounded-full bg-soft-info-soft px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-soft-info sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#18bd64]" /> Testnet</span>
                </span>
              </div>
              {view === 'grid' ? (
                <div className="border-t border-black/10 p-4 sm:p-5">
                  {tokens.length === 0 && loadingBoard ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-hidden="true">
                      {Array.from({ length: 6 }, (_, index) => (
                        <div key={index} className="animate-pulse rounded-[18px] border border-black/10 bg-white p-4">
                          <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-[16px] bg-black/8" /><span className="h-4 w-24 rounded bg-black/8" /></div>
                          <div className="mt-5 h-4 w-32 rounded bg-black/8" />
                          <div className="mt-3 h-1.5 w-full rounded-full bg-black/8" />
                          <div className="mt-4 h-8 w-full rounded-full bg-black/8" />
                        </div>
                      ))}
                    </div>
                  ) : visibleTokens.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {pagedTokens.map((token) => <LaunchCard key={token.id} token={token} animationsOn={animationsOn} ethUsd={ethUsd} onTrade={() => selectToken(token.id, true)} onOpen={() => token.address && router.push(`/startpad/${token.address}`)} />)}
                    </div>
                  ) : (
                    <div className="py-14 text-center text-[13px] text-black/50">No launches in this view.</div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_0.9fr_0.8fr_1.1fr_0.8fr_auto] gap-4 border-y border-black/10 bg-[#fafafd] px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.08em] text-black/45 sm:px-5"><span>Coin</span><span>Curve</span><span>Indexed vol</span><span>Momentum</span><span>Creator</span><span /></div>
                  {tokens.length === 0 && loadingBoard ? <div suppressHydrationWarning className="px-5 py-14 text-center text-[13px] text-black/45">Reading launches from {NET}...</div> : visibleTokens.length > 0 ? pagedTokens.map((token) => <LaunchTableRow key={token.id} token={token} animationsOn={animationsOn} ethUsd={ethUsd} onTrade={() => selectToken(token.id, true)} onOpen={() => token.address && router.push(`/startpad/${token.address}`)} />) : <div className="px-5 py-14 text-center text-[13px] text-black/50">No launches in this view.</div>}
                </div>
              )}
              {/* Przelacznik stron - rynek pokazuje 8 naraz, reszta na kolejnych
                  stronach; okienko nie renderuje wszystkiego na raz. */}
              {visibleTokens.length > BOARD_PAGE && (
                <div className="flex items-center justify-between gap-3 border-t border-black/10 px-4 py-3 sm:px-5">
                  <span className="text-[11px] text-black/45">
                    {safePage * BOARD_PAGE + 1}–{Math.min((safePage + 1) * BOARD_PAGE, visibleTokens.length)} of {visibleTokens.length}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button type="button" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-extrabold text-[#16141b] hover:border-soft-primary disabled:opacity-40">Prev</button>
                    <span className="px-1 text-[11px] font-bold text-black/45">{safePage + 1}/{pageCount}</span>
                    <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-extrabold text-[#16141b] hover:border-soft-primary disabled:opacity-40">Next</button>
                  </span>
                </div>
              )}
              <div className="border-t border-black/10 px-4 py-3 text-[11px] text-black/40 sm:px-5">{showingPreview ? 'Sample rows are placeholders and cannot be traded. They disappear with the first real launch.' : 'Every row is reconstructed from Startpad events and current onchain state.'}</div>
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
          // `startedAt` dopisujemy tutaj, bo kontrakt modalu oddaje czysty
          // `LaunchpadToken` - bez tego swiezy start ladowalby na koncu "New".
          setTokens((current) => [{ ...token, startedAt: Math.floor(Date.now() / 1000), prices: [] }, ...current.filter((existing) => existing.live)]);
          setSelectedId(token.id);
          setLaunchOpen(false);
          void loadBoard();
        }}
      />

      {tradeOpen && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#16141b]/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTradeOpen(false); }}>
          <section className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto rounded-[22px] border border-black/10 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)]" role="dialog" aria-modal="true" aria-label="Trade token">
            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-soft-primary-deep">Curve trade</p><h2 className="mt-1 text-[21px] font-extrabold text-[#16141b]">{selected.symbol} market</h2></div><button type="button" onClick={() => setTradeOpen(false)} className="rounded-full p-2 text-black/40 hover:bg-black/5 hover:text-[#16141b]" aria-label="Close dialog"><X className="h-5 w-5" aria-hidden="true" /></button></div>
            <div className="mt-5 flex items-center gap-3"><TokenGlyph token={selected} large /><div><div className="flex items-center gap-2"><span className="text-[16px] font-extrabold text-[#16141b]">{selected.symbol}</span><StatePill state={selected.state} /></div><p className="mt-1 text-[12px] text-black/45">{selected.name} · {curvePercent(selected)}% of curve</p></div></div>
            {selected.live ? <TradePanel token={selected} details={details} side={tradeSide} setSide={setTradeSide} buyAmount={buyAmount} setBuyAmount={setBuyAmount} sellAmount={sellAmount} setSellAmount={setSellAmount} sellQuote={sellQuote} gradReward={gradReward} busy={busy} ethUsd={ethUsd} onBuy={buy} onSell={sell} onGraduate={graduate} onSettle={settle} onHarvest={harvest} onClaim={claim} isConnected={isConnected} /> : <div className="mt-5 flex items-start gap-2 rounded-xl bg-[#f5f5f7] p-3 text-[11.5px] leading-[1.45] text-black/55"><WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-soft-primary" aria-hidden="true" /><span>This is a sample row. Launch a token to activate the live trade panel.</span></div>}
            <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-4 text-[11px] text-black/45"><span>{selected.holders} holders · {selected.trades ?? 0} trades</span><span className="flex items-center gap-2"><button type="button" onClick={() => void navigator.clipboard?.writeText(selected.address ?? selected.id)} className="inline-flex items-center gap-1.5 font-bold hover:text-soft-primary-deep"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy address</button>{selected.address && <button type="button" onClick={() => router.push(`/startpad/${selected.address}`)} className="inline-flex items-center gap-1.5 font-bold text-soft-primary-deep hover:text-soft-primary"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Details</button>}</span></div>
          </section>
        </div>
      )}
    </main>
  );
}
