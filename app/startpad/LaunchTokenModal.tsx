'use client';

/**
 * Modal startu tokena - wydzielony z LaunchpadBoard jako osobny komponent.
 *
 * Zalozenie podzialu: board podpina go przez { open, onClose, onLaunched } i o
 * srodku nie wie nic. Caly stan formularza, wykrywanie wersji kontraktu i sama
 * transakcja startu mieszkaja TUTAJ - rownolegle zmiany w boardzie nie moga
 * zepsuc formularza i odwrotnie.
 *
 * Walidacja i budowa argumentow `launchAdvanced` sa przeniesione 1:1 z
 * LaunchpadBoard.launch() - ta sciezka jest zweryfikowana na lancuchu, wiec
 * zmieniona jest wylacznie prezentacja: dwa tryby (Quick launch / Creator
 * setup), walidacja przy polu, podglad karty boardu i stopka z powodem
 * zablokowania przycisku.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  ImagePlus,
  Layers3,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { decodeEventLog, encodeEventTopics, formatEther, parseEther, type Address } from 'viem';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import {
  CURVE_TARGET_ETH,
  LAUNCH_HOOK_ADDRESS,
  LAUNCHPAD_ADDRESS,
  LAUNCHPAD_CHAIN,
  hookAbi,
  launchpadAbi,
  type LaunchpadToken,
} from './config';
import { formatUsd, useEthUsd } from './useEthUsd';
import { resolveMediaUrl } from './metadata';
import { resizeImageFile } from './logoUpload';

const FIELD =
  'w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-[14px] text-[#16141b] outline-none transition-colors placeholder:text-black/35 focus:border-[#7c6bda]';
const LABEL = 'mb-1.5 block text-[12px] font-extrabold text-[#16141b]';
const HINT = 'mt-1 block text-[11px] leading-[1.4] text-black/45';
const FIELD_ERROR = 'mt-1 block text-[11px] font-bold leading-[1.4] text-[#b02a5c]';
const CHIP =
  'rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10.5px] font-bold text-black/60 transition-colors hover:border-soft-primary';

/**
 * Sufity sa TYMI SAMYMI liczbami, co w `CurveLaunchpad`. Interfejs czyta je z
 * lancucha po otwarciu modala i dopiero gdy odczyt nie wyjdzie, spada na te
 * wartosci - zeby formularz nie obiecywal konfiguracji, ktorej kontrakt
 * odrzuci.
 */
const FALLBACK_MAX_FEE_BPS = 100;
/**
 * Ile z oplaty wolno oddac tworcy. Reszta nalezy do protokolu i tego NIE
 * pilnuje formularz - pilnuje kontrakt (`MAX_CREATOR_SHARE_BPS`). Tutaj jest
 * po to, zeby suwak nie proponowal wartosci, ktora i tak odpadnie.
 */
// 7000 od wdrozenia 2026-08 (70% dla tworcy, jak PONS) - liczba wiazaca i tak
// przychodzi z lancucha; fallback ma tylko nie obiecywac wiecej niz kontrakt.
const FALLBACK_MAX_CREATOR_SHARE_BPS = 7000;
const FALLBACK_MAX_RECIPIENTS = 8;
/** `WINDOW_ADDR_CAP` w calych tokenach: 16 000 000 z podazy 1 000 000 000. */
const FALLBACK_WINDOW_CAP_TOKENS = 16_000_000;
const TOTAL_SUPPLY_TOKENS = 1_000_000_000;
/** `LAUNCH_WINDOW` to 300 sekund; tu tylko jego nazwa dla czlowieka. */
const LAUNCH_WINDOW_LABEL = '5 minutes';
/**
 * Kolor karty podgladu. Prawdziwy akcent liczy sie z ADRESU tokena, a ten
 * istnieje dopiero po transakcji - wiec podglad dostaje pierwszy kolor palety
 * i nie udaje, ze zna przyszly.
 */
const PREVIEW_ACCENT = '#8b78e6';

/** Paleta i skrot 1:1 z LaunchpadBoard - swiezy wiersz musi wygladac tak samo. */
const ACCENTS = ['#8b78e6', '#5fa78c', '#d78a55', '#5b8bd9', '#d9628a', '#4fa3a8'];

function accentFor(token: string) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

function shortAddress(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

/**
 * Wiersz DODANY do listy odbiorcow oplat. Udzial "you" nie jest osobnym
 * wierszem stanu - liczy sie zawsze jako reszta do 100%, wiec nie umie sie
 * rozjechac z suma.
 */
type AddedReceiver = { account: string; share: number };

/**
 * Konfiguracja startu w postaci, ktora da sie podac do `launchAdvanced` bez
 * dalszej interpretacji. `null` znaczy: formularz nie przechodzi walidacji.
 */
type AdvancedArgs = {
  feeBps: number;
  creatorFeeBps: number;
  buybackBps: number;
  windowCap: bigint;
  accounts: Address[];
  shares: number[];
  metadataURI: string;
  preBuyWei: bigint;
};

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Metadane ida NA LANCUCH jako `string`, wiec kazdy znak kosztuje gaz. Gdy
 * tworca poda wlasny URI, uzywamy go bez zmian; gdy poda tylko opis i obrazek,
 * skladamy z tego maly `data:` URI, ktory czyta sie bez naszego backendu.
 *
 * `links` to NASZE rozszerzenie tego payloadu. `parseMetadataUri` czyta dzis
 * tylko `image` i `description`, wiec nieznane pole niczego nie psuje - a
 * strona tokena moze je podniesc, kiedy bedzie gotowa.
 */
function buildMetadataUri(
  explicit: string,
  name: string,
  description: string,
  image: string,
  links: Record<string, string>,
) {
  const trimmed = explicit.trim();
  if (trimmed) return trimmed;
  const desc = description.trim();
  const img = image.trim();
  const linkEntries = Object.entries(links)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value !== '');
  if (!desc && !img && linkEntries.length === 0) return '';
  const payload: Record<string, unknown> = { name: name.trim() };
  if (desc) payload.description = desc;
  if (img) payload.image = img;
  if (linkEntries.length > 0) payload.links = Object.fromEntries(linkEntries);
  return `data:application/json;base64,${toBase64(JSON.stringify(payload))}`;
}

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

function isAddressLike(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function isHttpsLink(value: string) {
  return /^https:\/\/\S+$/i.test(value.trim());
}

type LinkFields = { website: string; x: string; telegram: string };

type LaunchedResult = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  hash: string;
  preBuyWei: bigint;
};

/* -------------------------------------------------------------------------- */
/*  PODKOMPONENTY PREZENTACJI                                                  */
/* -------------------------------------------------------------------------- */

function CurvePill() {
  return (
    <span className="rounded-full bg-[#edeaff] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#5f4ec2]">
      Curve
    </span>
  );
}

/**
 * Karta tokena tak, jak wyglada na boardzie - zeby tworca widzial efekt ZANIM
 * zaplaci za gaz. To podglad, nie obietnica: kolor akcentu bedzie inny (liczy
 * sie z adresu), a rezerwa startowa zalezy od pre-buya.
 */
function BoardPreviewCard({
  name,
  symbol,
  imageUrl,
  raised,
  hasPreBuy,
}: {
  name: string;
  symbol: string;
  imageUrl: string | null;
  raised: number;
  hasPreBuy: boolean;
}) {
  const progress = Math.min(100, Math.round((raised / CURVE_TARGET_ETH) * 100));
  return (
    <div className="rounded-[18px] border border-black/10 bg-white p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-black/40">Board preview</p>
      <div className="mt-3 flex items-start gap-3">
        <div
          className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[16px] font-soft-display text-[14px] font-extrabold text-white shadow-[0_4px_12px_rgba(0,0,0,0.12)]"
          style={{ backgroundColor: PREVIEW_ACCENT }}
        >
          {imageUrl ? (
            // Obrazek przeszedl przez resolveMediaUrl (tylko https/ipfs), a gdy
            // nie wstanie, pod spodem i tak zostaje inicjal na tle akcentu.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
          ) : (
            <>
              <span className="relative z-10">{(symbol || '??').slice(0, 2)}</span>
              <span aria-hidden="true" className="absolute -right-2 -top-3 h-8 w-8 rounded-full bg-white/25" />
              <span aria-hidden="true" className="absolute -bottom-3 -left-2 h-8 w-8 rounded-full bg-black/10" />
            </>
          )}
        </div>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-extrabold text-[#16141b]">{symbol || 'TICKER'}</span>
            <CurvePill />
          </span>
          <span className="mt-1 block truncate text-[12px] text-black/50">{name || 'Your token name'}</span>
        </span>
      </div>
      <div className="mt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-extrabold text-[#16141b]">{raised.toFixed(raised >= 1 ? 2 : 3)} ETH</span>
          <span className="text-[11px] font-extrabold text-[#12a451]">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/8">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${progress}%`, backgroundColor: PREVIEW_ACCENT }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-black/45">
          <span>{hasPreBuy ? 'You are holder #1' : 'No holders yet'}</span>
          <span>just now</span>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[13px] font-extrabold text-[#16141b]">
          {icon}
          {title}
        </h3>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  MODAL                                                                      */
/* -------------------------------------------------------------------------- */

export default function LaunchTokenModal({
  open,
  onClose,
  onLaunched,
}: {
  open: boolean;
  onClose: () => void;
  onLaunched: (token: LaunchpadToken) => void;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  // Odczyty przypiete do sieci launchpada - modal ma wykrywac wersje kontraktu
  // takze wtedy, gdy portfel stoi na innym lancuchu.
  const readClient = usePublicClient({ chainId: LAUNCHPAD_CHAIN.id });

  const [mode, setMode] = useState<'quick' | 'creator'>('quick');
  const [phase, setPhase] = useState<'form' | 'success'>('form');
  const [launched, setLaunched] = useState<LaunchedResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [launchName, setLaunchName] = useState('');
  const [launchSymbol, setLaunchSymbol] = useState('');
  const [launchImage, setLaunchImage] = useState('');
  const [launchDescription, setLaunchDescription] = useState('');
  const [launchMetadataUri, setLaunchMetadataUri] = useState('');
  const [links, setLinks] = useState<LinkFields>({ website: '', x: '', telegram: '' });
  const [linksOpen, setLinksOpen] = useState(false);
  const [launchFeePct, setLaunchFeePct] = useState('1');
  // Start od sufitu z fallbacku, nie od zaszytej liczby - odczyt z lancucha i
  // tak nadpisze te wartosc, a stary hardkod '60' klamal po podniesieniu limitu.
  const [creatorSharePct, setCreatorSharePct] = useState(String(FALLBACK_MAX_CREATOR_SHARE_BPS / 100));
  const [buybackPct, setBuybackPct] = useState('0');
  const [sniperCapTokens, setSniperCapTokens] = useState(String(FALLBACK_WINDOW_CAP_TOKENS));
  // Kontrakt v3 przyjmuje windowCap az do T0; wylaczenie ochrony znaczy
  // "wyslij dokladnie T0", a nie "pomin pole".
  const [sniperOn, setSniperOn] = useState(true);
  const [preBuyEth, setPreBuyEth] = useState('0');
  const [addedReceivers, setAddedReceivers] = useState<AddedReceiver[]>([]);
  const [receiverDraft, setReceiverDraft] = useState({ account: '', share: '' });
  const [receiverDraftError, setReceiverDraftError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Logo jest WYMAGANE: albo plik z uploadu (data URL po zmniejszeniu), albo
  // URL, ktory realnie zaladowal sie jako obrazek. Data URL nigdy nie idzie
  // na lancuch - zyje tylko w profilu Firestore.
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoFileError, setLogoFileError] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoDragOver, setLogoDragOver] = useState(false);
  // Cykl zycia URL-a logo: probujemy go ZALADOWAC jak przegladarka odbiorcy.
  const [urlStatus, setUrlStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  // Zapis profilu po starcie moze odpasc (np. brak sesji SIWE) i NIE moze
  // uniewaznic sukcesu startu - stad osobna, nieblokujaca notka.
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  // `null` = jeszcze nie sprawdzone. `false` = wdrozony launchpad zna tylko
  // stare ABI i rozszerzonego startu NIE WOLNO pokazac jako dzialajacego.
  const [advancedSupported, setAdvancedSupported] = useState<boolean | null>(null);
  const [limits, setLimits] = useState({
    maxFeeBps: FALLBACK_MAX_FEE_BPS,
    maxCreatorShareBps: FALLBACK_MAX_CREATOR_SHARE_BPS,
    maxRecipients: FALLBACK_MAX_RECIPIENTS,
    windowCapTokens: FALLBACK_WINDOW_CAP_TOKENS,
  });
  // Stale krzywej sluza WYLACZNIE do podgladu pre-buya. Liczba wiazaca jest
  // zawsze ta z lancucha - tu pokazujemy szacunek, nie obietnice.
  const [curve, setCurve] = useState({ t0: TOTAL_SUPPLY_TOKENS, rVirt: 0.75 });
  // T0 w wei - dokladna wartosc windowCap przy wylaczonej ochronie. Porownania
  // robimy na bigintach, zeby float nie zgubil koncowki i nie odbil sie na
  // lancuchu o jeden wei.
  const [t0Wei, setT0Wei] = useState<bigint>(parseEther(String(TOTAL_SUPPLY_TOKENS)));
  // Oplata puli po graduacji nalezy do HOOKA i jest ustalona przy jego
  // wdrozeniu - tworca jej nie wybiera. Czytamy ja, zeby estymator nie
  // zgadywal, ile z niej zostaje tworcy.
  const [hookSplit, setHookSplit] = useState({ feeBps: 100, protocolShareBps: 3000 });

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const onSepolia = chainId === LAUNCHPAD_CHAIN.id;

  // Kurs ETH/USD to wylacznie DOPISEK do kwot w ETH. Przy braku kursu dopisek
  // znika w calosci - formularz nigdy nie czeka na zewnetrzne API.
  const { usd: ethUsd } = useEthUsd();
  const usdSuffix = (eth: number) => (ethUsd === null || !Number.isFinite(eth) ? '' : ` · ${formatUsd(eth * ethUsd)}`);

  /**
   * Czy pod `LAUNCHPAD_ADDRESS` stoi wersja znajaca `launchAdvanced`.
   *
   * Sprawdzamy to ODCZYTEM `MAX_BUYBACK_BPS` - stalej, ktora pojawila sie
   * razem z rozszerzonym startem. Na starszym wdrozeniu ten odczyt odpada,
   * bo pod tym selektorem nie ma kodu. To jedyna uczciwa droga: samo ABI po
   * naszej stronie nie mowi nic o tym, co naprawde jest w lancuchu, a wyslanie
   * `launchAdvanced` "na probe" kosztowaloby tworce gaz za rewert.
   */
  useEffect(() => {
    // Gate na `open`: modal bywa zamontowany na stale, a odczyty maja sens
    // dopiero, gdy ktos formularz naprawde otworzyl. Wynik nie znika miedzy
    // otwarciami, wiec sprawdzamy raz.
    if (!open || !readClient || advancedSupported !== null) return;
    let cancelled = false;
    const read = (
      functionName:
        | 'MAX_BUYBACK_BPS'
        | 'MAX_FEE_BPS'
        | 'MAX_CREATOR_SHARE_BPS'
        | 'MAX_FEE_RECIPIENTS'
        | 'WINDOW_ADDR_CAP'
        | 'T0'
        | 'R_VIRT',
    ) => readClient.readContract({ address: LAUNCHPAD_ADDRESS as Address, abi: launchpadAbi, functionName });

    void (async () => {
      try {
        const [t0, rVirt] = await Promise.all([read('T0'), read('R_VIRT')]);
        if (!cancelled) {
          setCurve({ t0: Number(formatEther(t0 as bigint)), rVirt: Number(formatEther(rVirt as bigint)) });
          setT0Wei(t0 as bigint);
        }
      } catch {
        // Stare wdrozenie tez ma te stale; gdy odczyt padnie, zostaja domyslne.
      }
      try {
        const [feeBps, protocolShareBps] = await Promise.all([
          readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'HOOK_FEE_BPS' }),
          readClient.readContract({ address: LAUNCH_HOOK_ADDRESS as Address, abi: hookAbi, functionName: 'PROTOCOL_SHARE_BPS' }),
        ]);
        if (!cancelled) setHookSplit({ feeBps: Number(feeBps), protocolShareBps: Number(protocolShareBps) });
      } catch {
        // Podglad oplaty puli jest dodatkiem; brak odczytu go nie uniewaznia.
      }
      // "Stare wdrozenie" wolno orzec WYLACZNIE, gdy lancuch odpowiedzial i nie
      // mial kodu pod selektorem. Chwilowy blad RPC nie jest dowodem niczego -
      // orzeczenie `false` po nim degradowaloby Quick launch do golego
      // `launch()` i PO CICHU gubilo metadane oraz konfiguracje tworcy.
      const missingSelector = (error: unknown) => {
        const text = error instanceof Error
          ? `${error.name} ${error.message} ${(error as { details?: string }).details ?? ''}`
          : String(error);
        return /returned no data|zero data|execution reverted|reverted/i.test(text);
      };
      try {
        let probed = false;
        for (let attempt = 0; attempt < 3 && !probed && !cancelled; attempt += 1) {
          try {
            await read('MAX_BUYBACK_BPS');
            probed = true;
          } catch (error) {
            if (missingSelector(error)) {
              if (!cancelled) setAdvancedSupported(false);
              return;
            }
            if (attempt === 2) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }
        if (!probed || cancelled) return;
        const [maxFee, maxCreatorShare, maxRecipients, windowCap] = await Promise.all([
          read('MAX_FEE_BPS'),
          // Podloga protokolu pojawila sie razem z rozszerzonym startem, wiec
          // na starszej wersji ten odczyt nie istnieje - stad `catch`.
          read('MAX_CREATOR_SHARE_BPS').catch(() => FALLBACK_MAX_CREATOR_SHARE_BPS),
          read('MAX_FEE_RECIPIENTS'),
          read('WINDOW_ADDR_CAP'),
        ]);
        if (cancelled) return;
        const capTokens = Math.floor(Number(formatEther(windowCap as bigint)));
        setLimits({
          maxFeeBps: Number(maxFee),
          maxCreatorShareBps: Number(maxCreatorShare),
          maxRecipients: Number(maxRecipients),
          windowCapTokens: capTokens,
        });
        setLaunchFeePct((Number(maxFee) / 100).toString());
        setCreatorSharePct((Number(maxCreatorShare) / 100).toString());
        setSniperCapTokens(String(capTokens));
        setAdvancedSupported(true);
      } catch {
        // Blad transportu po trzech probach: zostaje `null` ("sprawdzam..."),
        // a nastepne otwarcie modalu ponawia sonde. Nigdy nie klamiemy `false`.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, readClient, advancedSupported]);

  /**
   * URL logo sprawdzamy tak, jak sprawdzi go przegladarka odbiorcy: probujac
   * ZALADOWAC obrazek. Sam ksztalt adresu nie mowi nic o tym, czy pod nim jest
   * grafika - a URL, ktory nie przechodzi, ma znaczyc "brak logo", nie "moze
   * sie uda".
   */
  useEffect(() => {
    const trimmed = launchImage.trim();
    if (trimmed === '') {
      setUrlStatus('idle');
      return;
    }
    const resolved = resolveMediaUrl(trimmed);
    // data: wklejone w pole URL odrzucamy - upload ma wlasna sciezke z limitem
    // rozmiaru i walidacja typu.
    if (resolved === null || trimmed.startsWith('data:')) {
      setUrlStatus('invalid');
      return;
    }
    setUrlStatus('checking');
    let finished = false;
    let timeout = 0;
    // Debounce: probe dopiero, gdy uzytkownik przestal pisac - inaczej kazda
    // litera adresu odpalalaby pobranie obrazka.
    const debounce = window.setTimeout(() => {
      const probe = new Image();
      const finish = (ok: boolean) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        setUrlStatus(ok ? 'valid' : 'invalid');
      };
      timeout = window.setTimeout(() => finish(false), 5000);
      probe.onload = () => finish(true);
      probe.onerror = () => finish(false);
      probe.referrerPolicy = 'no-referrer';
      probe.src = resolved;
    }, 450);
    return () => {
      finished = true;
      window.clearTimeout(debounce);
      window.clearTimeout(timeout);
    };
  }, [launchImage]);

  /**
   * Ta sama walidacja, co w `_launch`, tylko wykonana ZANIM tworca zaplaci za
   * gaz. Gdy cokolwiek sie nie zgadza, zwracamy powod po ludzku zamiast
   * pozwolic kontraktowi odbic transakcje golym `InvalidFeeConfig`.
   */
  const advanced = useMemo<{ args: AdvancedArgs | null; error: string | null }>(() => {
    const fail = (error: string) => ({ args: null, error });

    const feePct = Number(launchFeePct);
    if (!Number.isFinite(feePct) || feePct < 0) return fail('Trading fee must be a number.');
    const feeBps = Math.round(feePct * 100);
    if (feeBps > limits.maxFeeBps) {
      return fail(`Trading fee is capped at ${(limits.maxFeeBps / 100).toFixed(2)}% until the higher cap is audited.`);
    }

    const maxCreatorPct = limits.maxCreatorShareBps / 100;
    const creatorPct = Number(creatorSharePct);
    if (!Number.isFinite(creatorPct) || creatorPct < 0 || creatorPct > maxCreatorPct) {
      return fail(`Creator split must be between 0 and ${maxCreatorPct}%. The rest belongs to the protocol.`);
    }
    // Zaokraglenie W DOL. W gore potrafiloby przekroczyc podloge protokolu o
    // jeden punkt bazowy i wywalic transakcje na `InvalidFeeConfig`.
    const creatorFeeBps = Math.min(feeBps, Math.floor((feeBps * creatorPct) / 100));

    const buyPct = Number(buybackPct);
    if (!Number.isFinite(buyPct) || buyPct < 0 || buyPct > 100) return fail('Auto-buyback must be between 0 and 100%.');
    const buybackBps = Math.round(buyPct * 100);

    const preBuyWei = preBuyEth.trim() === '' || Number(preBuyEth) === 0 ? 0n : toWei(preBuyEth);
    if (preBuyWei === null) return fail('Pre-buy must be zero or more ETH, written as a decimal number.');

    // Ile tokenow kupi pre-buy po cenie startowej (ethReserve=0). Ta sama
    // formula, co podglad; sluzy do sprawdzenia, czy pre-buy zmiesci sie pod
    // capem snajperskim, zanim tworca zaplaci za gaz.
    const preBuyEthNum = Number(preBuyEth) || 0;
    const preBuyNet = preBuyEthNum * (1 - feeBps / 10_000);
    const preBuyTokens = preBuyNet > 0 ? (curve.t0 * preBuyNet) / (curve.rVirt + preBuyNet) : 0;

    // Kontrakt v3 przyjmuje windowCap az do T0 - cap rowny podazy krzywej
    // znaczy "ochrona wylaczona".
    //
    // OCHRONA SNAJPERSKA OBEJMUJE TWORCE: `_buy` liczy cap takze dla pre-buya
    // (CurveLaunchpad.sol, "Obejmuje tworce"). Dlatego:
    //  - Quick launch NIE ustawia capa (T0) - to sciezka "po prostu wypusc",
    //    a pre-buy 0.1 ETH to ~116M tokenow, wiec domyslny cap 16M cofalby
    //    kazdy start z realnym pre-buyem. Konfiguracja snajpera zyje w Creator
    //    setup, gdzie jest widoczna i mozna ja dostroic do pre-buya.
    //  - Creator setup respektuje przelacznik, ale gdy pre-buy przekracza cap,
    //    odmawiamy TU z jasnym powodem zamiast pozwolic na goly rewert WindowCap.
    const sniperActive = mode === 'creator' && sniperOn;
    let windowCap: bigint;
    if (!sniperActive) {
      windowCap = t0Wei;
    } else {
      const parsedCap = toWei(sniperCapTokens);
      if (parsedCap === null || parsedCap <= 0n) return fail('Per-wallet cap must be a positive number of tokens.');
      if (parsedCap > t0Wei) {
        return fail(`Per-wallet cap cannot exceed ${curve.t0.toLocaleString('en-US')} tokens.`);
      }
      // Bez marginesu: nasz estymat jest ZAWYZONY wzgledem kontraktu (kontrakt
      // zaokragla oplate w gore -> mniej tokenow), wiec estymat <= cap gwarantuje
      // realny wynik <= cap. Margines 2% falszywie blokowal pre-buy tuz pod capem.
      if (preBuyTokens > 0 && preBuyTokens > Number(formatEther(parsedCap))) {
        return fail(
          `Your ${preBuyEthNum} ETH pre-buy is about ${Math.round(preBuyTokens).toLocaleString('en-US')} tokens, ` +
            `above the ${Number(formatEther(parsedCap)).toLocaleString('en-US')} per-wallet cap. ` +
            `Raise the cap or lower the pre-buy; the cap applies to you too for the first 5 minutes.`
        );
      }
      windowCap = parsedCap;
    }

    // Lista do wyslania: "you" z reszta procentow ZAWSZE pierwsze, potem
    // wiersze dodane przyciskiem Add. Gdy dodani zjedli cale 100%, wiersza
    // "you" nie wysylamy - udzial 0 bps kontrakt odrzuca.
    const accounts: Address[] = [];
    const shares: number[] = [];
    let addedBps = 0;
    for (const row of addedReceivers) {
      if (!isAddressLike(row.account)) return fail('Every fee receiver needs a valid address.');
      const shareBps = Math.round(row.share * 100);
      if (shareBps <= 0) return fail('Every fee receiver needs a share above zero.');
      addedBps += shareBps;
    }
    if (addedBps > 10_000) return fail('Fee receiver shares cannot exceed 100% in total.');
    const youBps = 10_000 - addedBps;
    if (youBps > 0) {
      if (!address) return fail('Connect a wallet - your remaining share needs an address.');
      accounts.push(address as Address);
      shares.push(youBps);
    }
    for (const row of addedReceivers) {
      accounts.push(row.account.trim() as Address);
      shares.push(Math.round(row.share * 100));
    }
    if (accounts.length === 0) return fail('Add at least one fee receiver.');
    if (accounts.length > limits.maxRecipients) return fail(`At most ${limits.maxRecipients} fee receivers.`);
    // Suma jest z konstrukcji 10 000, ale zaokraglenia domykamy jak dawniej -
    // kontrakt wymaga DOKLADNIE 10 000 bps, a "33.33 + 33.33 + 33.34" potrafi
    // sie rozjechac o punkt bazowy.
    const drift = 10_000 - shares.reduce((sum, value) => sum + value, 0);
    if (Math.abs(drift) > accounts.length) return fail('Fee receiver shares must add up to 100%.');
    shares[shares.length - 1] += drift;
    if (shares[shares.length - 1] <= 0) return fail('Fee receiver shares must add up to 100%.');

    return {
      args: {
        feeBps,
        creatorFeeBps,
        buybackBps,
        windowCap,
        accounts,
        shares,
        // Na lancuch idzie WYLACZNIE URL, ktory realnie zaladowal sie jako
        // obrazek. Data URL z uploadu zostaje w profilu Firestore - na
        // lancuchu kosztowalby gaz za kazdy znak base64.
        metadataURI: buildMetadataUri(
          launchMetadataUri,
          launchName,
          launchDescription,
          urlStatus === 'valid' ? launchImage : '',
          links,
        ),
        preBuyWei,
      },
      error: null,
    };
  }, [
    address,
    addedReceivers,
    buybackPct,
    creatorSharePct,
    curve.t0,
    curve.rVirt,
    launchDescription,
    launchFeePct,
    launchImage,
    launchMetadataUri,
    launchName,
    limits,
    links,
    mode,
    preBuyEth,
    sniperCapTokens,
    sniperOn,
    t0Wei,
    urlStatus,
  ]);

  /**
   * Ile tworca zarobi, gdy rynek zrobi dany wolumen. Noga krzywej jest pewna
   * co do wzoru (`_accrueFee`). Noga puli jest liczona PO auto-buybacku, bo
   * buyback schodzi WYLACZNIE z dzialki tworcy - protokol bierze swoja czesc
   * w calosci niezaleznie od suwaka, wiec pokazywanie kwoty "przed buybackiem"
   * zawyzaloby zarobek dokladnie o to, co tworca sam oddal na skup i spalenie.
   */
  const estimate = useMemo(() => {
    // Liczymy WPROST z pol, a NIE z `advanced.args`. Inaczej dowolne
    // niepowodzenie walidacji (np. pre-buy ponad sniper cap) zerowalo zarobki
    // na krzywej - a krzywa zalezy TYLKO od oplaty i udzialu tworcy, nie od
    // pre-buya. To byl bug "0 ETH on curve przy wlaczonym sniperze".
    const feeBps = Math.round((Number(launchFeePct) || 0) * 100);
    const creatorPct = Math.max(0, Math.min(limits.maxCreatorShareBps / 100, Number(creatorSharePct) || 0));
    const creatorFeeBps = Math.min(feeBps, Math.floor((feeBps * creatorPct) / 100));
    const buybackBps = Math.round((Number(buybackPct) || 0) * 100);
    const poolCreatorBps =
      ((hookSplit.feeBps * (10_000 - hookSplit.protocolShareBps)) / 10_000) * (1 - buybackBps / 10_000);
    return [10, 100, 1_000].map((volume) => ({
      volume,
      curve: (volume * creatorFeeBps) / 10_000,
      pool: (volume * poolCreatorBps) / 10_000,
    }));
  }, [launchFeePct, creatorSharePct, buybackPct, limits.maxCreatorShareBps, hookSplit]);

  /** Podglad dev-buya po cenie startowej krzywej. Szacunek, nie gwarancja. */
  const preBuyPreview = useMemo(() => {
    const eth = Number(preBuyEth);
    if (!Number.isFinite(eth) || eth <= 0) return null;
    const feeBps = advanced.args?.feeBps ?? limits.maxFeeBps;
    const net = eth * (1 - feeBps / 10_000);
    const tokens = (curve.t0 * net) / (curve.rVirt + net);
    return { tokens, share: (tokens / curve.t0) * 100 };
  }, [advanced.args, curve, limits.maxFeeBps, preBuyEth]);

  /* ------------------------------------------------------------------ */
  /*  WALIDACJA PRZY POLU - prezentacja; brama pozostaje w `advanced`     */
  /* ------------------------------------------------------------------ */

  // Podglad: upload wygrywa z URL-em, bo to on pojdzie do profilu tokena.
  const previewImage = logoDataUrl ?? (urlStatus === 'valid' ? resolveMediaUrl(launchImage) : null);
  const hasLogo = logoDataUrl !== null || urlStatus === 'valid';
  const nameError = launchName.trim() === '' ? 'Name is required.' : null;
  const symbolError = launchSymbol.trim() === '' ? 'Ticker is required.' : null;
  // Obrazek trafia do NIEZMIENNEGO metadataURI - literowka zostalaby na
  // zawsze, wiec zly zapis blokuje start zamiast po cichu przejsc.
  const imageError =
    launchImage.trim() !== '' && (resolveMediaUrl(launchImage) === null || launchImage.trim().startsWith('data:'))
      ? 'Use an https:// or ipfs:// link. Anything else will not render.'
      : urlStatus === 'invalid'
        ? 'This link did not load as an image within 5 seconds.'
        : null;
  const linkErrors: Partial<Record<keyof LinkFields, string>> = {};
  (Object.keys(links) as Array<keyof LinkFields>).forEach((key) => {
    if (links[key].trim() !== '' && !isHttpsLink(links[key])) linkErrors[key] = 'Must start with https://';
  });
  const anyLinkError = Object.values(linkErrors).length > 0 ? 'Social links must start with https://.' : null;
  const preBuyError =
    preBuyEth.trim() !== '' && Number(preBuyEth) !== 0 && toWei(preBuyEth) === null
      ? 'Write the amount as a plain decimal number, e.g. 0.05.'
      : null;

  const feeBpsNow = Math.round((Number(launchFeePct) || 0) * 100);
  const creatorPctNow = Math.max(0, Math.min(limits.maxCreatorShareBps / 100, Number(creatorSharePct) || 0));
  const protocolFloorPct = 100 - limits.maxCreatorShareBps / 100;
  // Udzial "you" jest RESZTA po dodanych wierszach, nie osobnym polem - wiec
  // suma nie umie odjechac od 100%, dopoki Add pilnuje sufitu.
  const addedShareBps = addedReceivers.reduce((sum, row) => sum + Math.round(row.share * 100), 0);
  const youShareBps = Math.max(0, 10_000 - addedShareBps);
  const receiverTotalPct = (addedShareBps + youShareBps) / 100;
  const receiverTotalOk = Math.round(receiverTotalPct * 100) === 10_000;

  // Jeden pasek = 100% oplaty puli: [protokol staly][ty][buyback]. Buyback
  // schodzi WYLACZNIE z dzialki tworcy, wiec suwak NA ZYWO zweza segment "ty",
  // a segment protokolu stoi w miejscu.
  const protocolPoolPct = hookSplit.protocolShareBps / 100;
  const creatorPoolSlicePct = 100 - protocolPoolPct;
  const buybackShare = Math.max(0, Math.min(100, Number(buybackPct) || 0));
  const buybackPoolPct = (creatorPoolSlicePct * buybackShare) / 100;
  const youPoolPct = creatorPoolSlicePct - buybackPoolPct;
  const fmtPct = (value: number) => (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1));

  const previewRaised = useMemo(() => {
    const eth = Number(preBuyEth);
    if (!Number.isFinite(eth) || eth <= 0) return 0;
    const feeBps = advanced.args?.feeBps ?? limits.maxFeeBps;
    return eth * (1 - feeBps / 10_000);
  }, [advanced.args, limits.maxFeeBps, preBuyEth]);

  /**
   * Jeden powod zablokowania przycisku, w kolejnosci od najbardziej
   * podstawowego. Przycisk bez wyjasnienia "dlaczego szary" to byla jedna z
   * glownych skarg na stary formularz.
   */
  const disabledReason = !isConnected
    ? 'Connect a wallet from the main navigation to launch.'
    : advancedSupported === null
      ? 'Checking what the deployed launchpad supports...'
      : nameError
        ? 'Add a token name.'
        : symbolError
          ? 'Add a ticker symbol.'
          : !hasLogo
            ? logoBusy
              ? 'Processing the logo...'
              : urlStatus === 'checking'
                ? 'Checking the logo URL...'
                : 'Add a logo first.'
            : imageError ?? anyLinkError ?? preBuyError ?? (advancedSupported === true ? advanced.error : null);

  const ensureSepolia = async () => {
    if (onSepolia) return true;
    try {
      await switchChainAsync({ chainId: LAUNCHPAD_CHAIN.id });
      return true;
    } catch {
      setNotice({ kind: 'error', text: `Switch to ${LAUNCHPAD_CHAIN.name} was cancelled. Nothing was sent.` });
      return false;
    }
  };

  const resetForm = () => {
    setLaunchName('');
    setLaunchSymbol('');
    setLaunchImage('');
    setLaunchDescription('');
    setLaunchMetadataUri('');
    setLinks({ website: '', x: '', telegram: '' });
    setLinksOpen(false);
    setPreBuyEth('0');
    setBuybackPct('0');
    setLaunchFeePct((limits.maxFeeBps / 100).toString());
    setCreatorSharePct((limits.maxCreatorShareBps / 100).toString());
    setSniperCapTokens(String(limits.windowCapTokens));
    setSniperOn(true);
    setAddedReceivers([]);
    setReceiverDraft({ account: '', share: '' });
    setReceiverDraftError(null);
    setLogoDataUrl(null);
    setLogoFileError(null);
    setProfileNotice(null);
    setTouched({});
    setNotice(null);
    setMode('quick');
  };

  const handleClose = () => {
    if (busy) return;
    if (phase === 'success') {
      resetForm();
      setPhase('form');
      setLaunched(null);
    }
    onClose();
  };

  // Escape zamyka jak klik w tlo - ale nie w trakcie wysylania transakcji,
  // zeby przypadkowy klawisz nie schowal stanu "Launching...".
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, phase]);

  /** Plik -> data URL przez resizeImageFile; blad pokazujemy przy polu. */
  const handleLogoFile = async (file: File | null | undefined) => {
    if (!file) return;
    setLogoFileError(null);
    setLogoBusy(true);
    try {
      setLogoDataUrl(await resizeImageFile(file));
    } catch (error) {
      setLogoFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setLogoBusy(false);
    }
  };

  /**
   * Add waliduje wiersz roboczy PRZED dodaniem - lista nizej trzyma juz tylko
   * czyste wpisy, a udzial "you" sam kurczy sie o to, co oddali inni.
   */
  const addReceiver = () => {
    const account = receiverDraft.account.trim();
    if (!isAddressLike(account)) {
      setReceiverDraftError('Enter a full 0x address.');
      return;
    }
    const duplicate =
      addedReceivers.some((row) => row.account.toLowerCase() === account.toLowerCase()) ||
      (address !== undefined && account.toLowerCase() === address.toLowerCase());
    if (duplicate) {
      setReceiverDraftError('This address is already on the list.');
      return;
    }
    const share = Number(receiverDraft.share);
    const shareBps = Math.round(share * 100);
    if (!Number.isFinite(share) || share <= 0 || shareBps <= 0) {
      setReceiverDraftError('Share must be above zero.');
      return;
    }
    const currentBps = addedReceivers.reduce((sum, row) => sum + Math.round(row.share * 100), 0);
    if (currentBps + shareBps > 10_000) {
      setReceiverDraftError('Shares cannot exceed 100% in total.');
      return;
    }
    // Wiersz "you" liczy sie do limitu odbiorcow tylko, gdy cos mu zostaje.
    const nextCount = addedReceivers.length + 1 + (currentBps + shareBps < 10_000 ? 1 : 0);
    if (nextCount > limits.maxRecipients) {
      setReceiverDraftError(`At most ${limits.maxRecipients} fee receivers.`);
      return;
    }
    setAddedReceivers((rows) => [...rows, { account, share }]);
    setReceiverDraft({ account: '', share: '' });
    setReceiverDraftError(null);
  };

  const launch = async () => {
    if (!address || !walletClient || !readClient) {
      setNotice({ kind: 'error', text: 'Connect a wallet first.' });
      return;
    }
    if (!launchName.trim() || !launchSymbol.trim()) {
      setNotice({ kind: 'error', text: 'Add a name and symbol before launching.' });
      return;
    }
    // Inaczej niz w starym formularzu nie ma tu przelacznika "advanced open":
    // gdy wdrozony kontrakt zna `launchAdvanced`, uzywamy go ZAWSZE - takze
    // przy szybkim starcie - bo tylko ta sciezka niesie metadataURI. Domyslne
    // wartosci pol daja dokladnie konfiguracje, ktora `launch()` przyjalby sam.
    const useAdvanced = advancedSupported === true;
    if (useAdvanced && advanced.error) {
      setNotice({ kind: 'error', text: advanced.error });
      return;
    }
    const preBuyWei = preBuyEth.trim() === '' || Number(preBuyEth) === 0 ? 0n : toWei(preBuyEth);
    if (preBuyWei === null) {
      setNotice({ kind: 'error', text: 'Pre-buy must be zero or more ETH, written as a decimal number.' });
      return;
    }
    if (!(await ensureSepolia())) return;
    setBusy(true);
    setNotice(null);
    try {
      const name = launchName.trim();
      const symbol = launchSymbol.trim().toUpperCase();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      // Pre-buy jedzie TA SAMA transakcja, co start, wiec miedzy stworzeniem
      // krzywej a tym kupnem nie da sie wcisnac cudzej wymiany. Krzywa startowa
      // jest deterministyczna, wiec `1` spelnia wymog `SlippageRequired`, nie
      // udajac przy tym ochrony, ktorej ten jeden przypadek nie potrzebuje.
      const minTokensOut = preBuyWei > 0n ? 1n : 0n;
      const hash = useAdvanced && advanced.args
        ? await walletClient.writeContract({
            address: LAUNCHPAD_ADDRESS as Address,
            abi: launchpadAbi,
            functionName: 'launchAdvanced',
            args: [
              name,
              symbol,
              minTokensOut,
              deadline,
              advanced.args.feeBps,
              advanced.args.creatorFeeBps,
              advanced.args.buybackBps,
              advanced.args.windowCap,
              advanced.args.accounts,
              advanced.args.shares,
              advanced.args.metadataURI,
            ],
            value: preBuyWei,
            chain: LAUNCHPAD_CHAIN,
            account: address,
          })
        : await walletClient.writeContract({
            address: LAUNCHPAD_ADDRESS as Address,
            abi: launchpadAbi,
            functionName: 'launch',
            args: [name, symbol, minTokensOut, deadline],
            value: preBuyWei,
            chain: LAUNCHPAD_CHAIN,
            account: address,
          });
      const receipt = await readClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The launch transaction reverted.');
      // Dev-buy emituje takze `Bought` i `FeeAccrued` z tego samego adresu,
      // wiec pierwszy log launchpada nie musi byc `Launched`. Szukamy po temacie.
      const launchedTopic = encodeEventTopics({ abi: launchpadAbi, eventName: 'Launched' })[0];
      const log = receipt.logs.find(
        (entry) => entry.address.toLowerCase() === LAUNCHPAD_ADDRESS.toLowerCase() && entry.topics[0] === launchedTopic,
      );
      if (!log) throw new Error('Launch confirmed, but its event was not readable yet.');
      const decoded = decodeEventLog({ abi: launchpadAbi, eventName: 'Launched', data: log.data, topics: log.topics });
      const tokenAddress = decoded.args.token as `0x${string}`;
      const newToken: LaunchpadToken = {
        id: tokenAddress,
        address: tokenAddress,
        name: decoded.args.name as string,
        symbol: decoded.args.symbol as string,
        // Pelny adres, nie skrocony - skracaniem zajmuje sie warstwa widoku,
        // a podwojne skrocenie dawaloby smiec.
        creator: address,
        state: 'Curve',
        raised: 0,
        target: CURVE_TARGET_ETH,
        holders: 0,
        age: 'just now',
        accent: accentFor(tokenAddress),
        live: true,
      };
      // Board dostaje wiersz OD RAZU po potwierdzeniu - nawet gdy tworca
      // zamknie modal, nie czekajac na ekran sukcesu.
      onLaunched(newToken);
      // Logo i opis ida do profilu Firestore OSOBNYM zadaniem - start juz sie
      // udal i zaden blad zapisu nie ma prawa go cofnac ani przykryc ekranu
      // sukcesu. Brak sesji SIWE (401/403) to normalny przypadek, nie awaria.
      const profileLogoUrl = logoDataUrl ?? (urlStatus === 'valid' ? launchImage.trim() : null);
      if (profileLogoUrl !== null || launchDescription.trim() !== '') {
        void fetch('/api/launchpad/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: tokenAddress,
            logoUrl: profileLogoUrl,
            description: launchDescription.trim(),
          }),
        })
          .then((response) => {
            if (response.status === 401 || response.status === 403) {
              setProfileNotice('Sign in on the token page to attach the logo.');
            } else if (!response.ok) {
              setProfileNotice('The logo was not attached. You can add it on the token page.');
            }
          })
          .catch(() => {
            setProfileNotice('The logo was not attached. You can add it on the token page.');
          });
      }
      setLaunched({
        address: tokenAddress,
        name: newToken.name,
        symbol: newToken.symbol,
        hash,
        preBuyWei,
      });
      setPhase('success');
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message.split('\n')[0] : String(error) });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const markTouched = (field: string) => setTouched((current) => ({ ...current, [field]: true }));
  const showError = (field: string, error: string | null) => (touched[field] && error ? error : null);

  // Chipy zostaja przy malych wartosciach + domyslnej z lancucha; sufit pola
  // to od v3 cale T0, nie 16M.
  const capChips = [1_000_000, 4_000_000, 8_000_000, limits.windowCapTokens].filter(
    (value, index, all) => value <= curve.t0 && all.indexOf(value) === index,
  );
  const feePresets = [25, 50, 75, 100].filter((bps) => bps <= limits.maxFeeBps);
  const setFeeBps = (bps: number) => {
    // Dolny prog 0.1% jest przeniesiony ze starego suwaka - formularz nigdy
    // nie proponowal oplaty ponizej niego.
    const clamped = Math.min(limits.maxFeeBps, Math.max(10, bps));
    setLaunchFeePct((clamped / 100).toString());
  };

  const summaryText =
    advancedSupported === true
      ? `Fee ${(feeBpsNow / 100).toFixed(2)}% · you keep ${creatorPctNow.toFixed(0)}% of it · ${
          isConnected ? (onSepolia ? `${LAUNCHPAD_CHAIN.name} ready` : `Wallet will switch to ${LAUNCHPAD_CHAIN.name}`) : 'Wallet not connected'
        }`
      : `Protocol default fees · ${
          isConnected ? (onSepolia ? `${LAUNCHPAD_CHAIN.name} ready` : `Wallet will switch to ${LAUNCHPAD_CHAIN.name}`) : 'Wallet not connected'
        }`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-[#16141b]/35 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Launch a token"
        className="flex h-full max-h-full w-full flex-col overflow-hidden bg-white font-soft shadow-[0_24px_80px_rgba(0,0,0,0.2)] sm:h-auto sm:max-h-[90vh] sm:max-w-[880px] sm:rounded-[22px] sm:border sm:border-black/10"
      >
        {/* ------------------------------ NAGLOWEK ------------------------------ */}
        <header className="shrink-0 border-b border-black/10 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-soft-primary-deep">
                {phase === 'success' ? 'Launch confirmed' : 'New launch'}
              </p>
              <h2 className="mt-1 text-[21px] font-extrabold text-[#16141b]">
                {phase === 'success' ? 'Your token is live.' : 'Put an idea on curve.'}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full p-2 text-black/40 hover:bg-black/5 hover:text-[#16141b]"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {phase === 'form' && (
            <div className="mt-4 flex items-center gap-1 rounded-xl bg-[#f4f1ff] p-1" role="tablist" aria-label="Launch mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'quick'}
                onClick={() => setMode('quick')}
                className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-extrabold ${
                  mode === 'quick' ? 'bg-white text-soft-primary-deep shadow-sm' : 'text-black/45'
                }`}
              >
                <Zap className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                Quick launch
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'creator'}
                onClick={() => setMode('creator')}
                className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-extrabold ${
                  mode === 'creator' ? 'bg-white text-soft-primary-deep shadow-sm' : 'text-black/45'
                }`}
              >
                <Layers3 className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                Creator setup
                {advancedSupported === false && (
                  <span className="ml-1.5 rounded-full bg-[#d78a55]/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.05em] text-[#a35c1a]">
                    legacy
                  </span>
                )}
              </button>
            </div>
          )}
        </header>

        {/* -------------------------------- TRESC ------------------------------- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {/* ZLA SIEC W PORTFELU. Klik "Launch" i tak przelacza automatycznie
              (ensureSepolia -> switchChainAsync), ale przy dwoch sieciach lepiej
              POWIEDZIEC to wyraznie, niz liczyc, ze podpowie o tym jedna linijka
              w podsumowaniu. Mowimy tez, jak zmienic SAM launchpad na inna siec
              (przelacznik obok Launch), zeby nie mylic "sieci portfela" z
              "sieci launchpada". */}
          {phase === 'form' && isConnected && !onSepolia && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#f3c58a] bg-[#fff8ed] px-3.5 py-3">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[#c76b12]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-extrabold text-[#8c4a0b]">Your wallet is on another network</p>
                <p className="mt-0.5 text-[11.5px] leading-[1.45] text-[#a34b08]">
                  Startpad is set to <span className="font-bold">{LAUNCHPAD_CHAIN.name}</span>. Clicking
                  Launch will ask your wallet to switch there, approve it when it pops up. To point
                  Startpad at a different network instead, use the network switch next to the Launch
                  button.
                </p>
              </div>
            </div>
          )}
          {phase === 'success' && launched ? (
            <div className="mx-auto flex max-w-[420px] flex-col items-center py-6 text-center">
              <CheckCircle2 className="h-14 w-14 text-[#18bd64]" aria-hidden="true" />
              <h3 className="mt-4 text-[22px] font-extrabold text-[#16141b]">{launched.symbol} is live on the curve</h3>
              <p className="mt-1 text-[13px] text-black/50">
                {launched.name}
                {launched.preBuyWei > 0n
                  ? ` · your ${formatEther(launched.preBuyWei)} ETH${usdSuffix(Number(formatEther(launched.preBuyWei)))} pre-buy filled in the same transaction`
                  : ''}
              </p>
              <div className="mt-5 flex w-full items-center justify-between gap-2 rounded-xl border border-black/10 bg-[#fbfbfd] px-3.5 py-3">
                <span className="truncate font-mono text-[12px] text-[#16141b]">{shortAddress(launched.address)}</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(launched.address);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-extrabold text-[#16141b] hover:border-soft-primary"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#12a451]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy CA'}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-black/40">Tx {launched.hash.slice(0, 10)}...</p>
              {profileNotice && (
                <p className="mt-3 w-full rounded-xl border border-[#f3c58a] bg-[#fff8ed] px-3.5 py-2.5 text-left text-[12px] leading-[1.45] text-[#a34b08]">
                  {profileNotice}
                </p>
              )}
              <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row">
                <Link
                  href={`/startpad/${launched.address}`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-soft-primary px-4 py-3 text-[13px] font-extrabold text-white"
                >
                  View token page
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setPhase('form');
                    setLaunched(null);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-4 py-3 text-[13px] font-extrabold text-[#16141b] hover:border-soft-primary"
                >
                  Launch another
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
              {/* ------------------------- KOLUMNA FORMULARZA ------------------------ */}
              <div className="min-w-0">
                {/* Podglad na telefonie idzie NAD formularzem - prawej szyny tam nie ma. */}
                <div className="mb-4 lg:hidden">
                  <BoardPreviewCard
                    name={launchName}
                    symbol={launchSymbol}
                    imageUrl={previewImage}
                    raised={previewRaised}
                    hasPreBuy={previewRaised > 0}
                  />
                </div>

                {mode === 'quick' ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className={LABEL}>Name</span>
                        <input
                          value={launchName}
                          onChange={(event) => setLaunchName(event.target.value)}
                          onBlur={() => markTouched('name')}
                          className={FIELD}
                          placeholder="Lumen Commons"
                        />
                        {showError('name', nameError) && <span className={FIELD_ERROR}>{nameError}</span>}
                      </label>
                      <label className="block">
                        <span className={LABEL}>Ticker</span>
                        <input
                          value={launchSymbol}
                          onChange={(event) => setLaunchSymbol(event.target.value.toUpperCase().slice(0, 10))}
                          onBlur={() => markTouched('symbol')}
                          className={`${FIELD} uppercase`}
                          placeholder="LUMEN"
                        />
                        {showError('symbol', symbolError) ? (
                          <span className={FIELD_ERROR}>{symbolError}</span>
                        ) : (
                          <span className={HINT}>Up to 10 characters, saved in caps.</span>
                        )}
                      </label>
                    </div>

                    <div>
                      <span className={LABEL}>Logo (required)</span>
                      {/* Dropzone jako button: klawiatura i czytnik dostaja to
                          samo wejscie, co mysz z przeciaganiem. */}
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setLogoDragOver(true);
                        }}
                        onDragLeave={() => setLogoDragOver(false)}
                        onDrop={(event) => {
                          event.preventDefault();
                          setLogoDragOver(false);
                          void handleLogoFile(event.dataTransfer.files?.[0]);
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-left transition-colors ${
                          logoDragOver ? 'border-soft-primary bg-soft-primary/[0.06]' : 'border-black/15 bg-white hover:border-soft-primary'
                        }`}
                      >
                        {logoDataUrl ? (
                          // Data URL powstal u nas z resizeImageFile - to nasz
                          // wlasny raster, nie cudzy adres.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={logoDataUrl} alt="Token logo preview" className="h-11 w-11 shrink-0 rounded-[14px] object-cover" />
                        ) : (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#f4f1ff] text-soft-primary">
                            <ImagePlus className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-extrabold text-[#16141b]">
                            {logoBusy ? 'Processing image...' : logoDataUrl ? 'Logo ready, click to replace' : 'Drop an image or click to browse'}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-black/45">PNG, JPEG or WebP, resized to 256 px.</span>
                        </span>
                      </button>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          void handleLogoFile(event.target.files?.[0]);
                          // Ten sam plik wybrany drugi raz ma znow odpalic
                          // onChange - bez zerowania input go polknie.
                          event.target.value = '';
                        }}
                      />
                      {logoDataUrl && (
                        <button type="button" onClick={() => setLogoDataUrl(null)} className="mt-1.5 text-[11px] font-extrabold text-[#8d2748]">
                          Remove uploaded logo
                        </button>
                      )}
                      {logoFileError ? (
                        <span className={FIELD_ERROR}>{logoFileError}</span>
                      ) : (
                        <span className={HINT}>Uploads live in the token profile on this site. Paste a URL below to also store it onchain.</span>
                      )}
                    </div>

                    <label className="block">
                      <span className={LABEL}>Logo URL (alternative)</span>
                      <input
                        value={launchImage}
                        onChange={(event) => setLaunchImage(event.target.value)}
                        className={FIELD}
                        placeholder="https://... or ipfs://..."
                      />
                      {imageError ? (
                        <span className={FIELD_ERROR}>{imageError}</span>
                      ) : urlStatus === 'checking' ? (
                        <span className={HINT}>Loading the image to make sure it renders...</span>
                      ) : urlStatus === 'valid' ? (
                        <span className="mt-1 block text-[11px] font-bold text-[#0b9a51]">
                          Image loads. It is stored onchain forever; ipfs:// links cannot be swapped out later.
                        </span>
                      ) : (
                        <span className={HINT}>Stored onchain forever. An ipfs:// link cannot be swapped out later.</span>
                      )}
                    </label>

                    <label className="block">
                      <span className={LABEL}>Description</span>
                      <textarea
                        rows={3}
                        value={launchDescription}
                        onChange={(event) => setLaunchDescription(event.target.value)}
                        className={FIELD}
                        placeholder="What is this token for?"
                      />
                      <span className={HINT}>The token page shows the first 280 characters.</span>
                    </label>

                    {/* Socjale sa zwijane: wiekszosc startow ich nie ma i nie
                        powinny wydluzac podstawowej sciezki. */}
                    <div className="rounded-2xl border border-black/10 bg-[#fbfbfd]">
                      <button
                        type="button"
                        onClick={() => setLinksOpen((current) => !current)}
                        aria-expanded={linksOpen}
                        className="flex w-full items-center justify-between px-3.5 py-3 text-[12.5px] font-extrabold text-[#16141b]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Globe className="h-4 w-4 text-soft-primary" aria-hidden="true" />
                          Website &amp; socials
                          <span className="text-[10.5px] font-bold text-black/35">optional</span>
                        </span>
                        <span className="text-[11px] font-bold text-black/45">{linksOpen ? 'Hide' : 'Add'}</span>
                      </button>
                      {linksOpen && (
                        <div className="space-y-3 border-t border-black/10 px-3.5 py-3.5">
                          {(
                            [
                              ['website', 'Website', 'https://yourproject.xyz'],
                              ['x', 'X profile', 'https://x.com/yourproject'],
                              ['telegram', 'Telegram', 'https://t.me/yourproject'],
                            ] as Array<[keyof LinkFields, string, string]>
                          ).map(([key, label, placeholder]) => (
                            <label key={key} className="block">
                              <span className={LABEL}>{label}</span>
                              <input
                                value={links[key]}
                                onChange={(event) => setLinks((current) => ({ ...current, [key]: event.target.value }))}
                                className={FIELD}
                                placeholder={placeholder}
                              />
                              {linkErrors[key] && <span className={FIELD_ERROR}>{linkErrors[key]}</span>}
                            </label>
                          ))}
                          <p className={HINT}>Links ride along in the onchain metadata, so they survive without our backend.</p>
                        </div>
                      )}
                    </div>

                    {/* Pre-buy jako osobny KROK, nie pole schowane w siatce -
                        to jedyna decyzja o pieniadzach na szybkiej sciezce. */}
                    <div className="rounded-2xl border border-soft-primary/25 bg-soft-primary/[0.05] p-4">
                      <p className="flex items-center gap-2 text-[13px] font-extrabold text-[#16141b]">
                        <Zap className="h-4 w-4 text-soft-primary" aria-hidden="true" />
                        Pre-buy: how much do you buy as the first buyer?
                      </p>
                      <div className="mt-3 flex gap-2">
                        <div className="relative flex-1">
                          <input
                            inputMode="decimal"
                            value={preBuyEth}
                            onChange={(event) => setPreBuyEth(event.target.value)}
                            className={`${FIELD} pr-14`}
                            placeholder="0"
                            aria-label="Pre-buy amount in ETH"
                          />
                          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-extrabold text-black/40">
                            ETH
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {['0', '0.01', '0.05', '0.1'].map((amount) => (
                          <button key={amount} type="button" onClick={() => setPreBuyEth(amount)} className={CHIP}>
                            {amount === '0' ? 'None' : `${amount} ETH`}
                          </button>
                        ))}
                      </div>
                      {preBuyError ? (
                        <span className={FIELD_ERROR}>{preBuyError}</span>
                      ) : (
                        <p className="mt-2 text-[12px] font-bold text-[#16141b]">
                          {preBuyPreview
                            ? `≈ ${preBuyPreview.tokens.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${launchSymbol || 'tokens'} · ${preBuyPreview.share.toFixed(2)}% of supply · for ${Number(preBuyEth)} ETH${usdSuffix(Number(preBuyEth))}`
                            : 'No pre-buy. The curve opens to everyone at the same price.'}
                        </p>
                      )}
                      <p className={HINT}>
                        Atomic: the pre-buy fills in the SAME transaction that creates the token, so no sniper can front-run
                        you. Same curve, same fee and same wallet cap as everyone else; you get no free supply.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {advancedSupported === null && (
                      <p className="text-[11.5px] text-black/50">Checking what the deployed launchpad supports...</p>
                    )}
                    {advancedSupported === false && (
                      <div className="flex items-start gap-2 rounded-xl bg-[#d78a55]/12 p-3 text-[11.5px] leading-[1.45] text-[#7a4a1d]">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          The launchpad at this address predates advanced config, so these fields cannot be sent yet. Your
                          launch will use the default fee and cap until the new version is deployed.
                        </span>
                      </div>
                    )}

                    <fieldset disabled={advancedSupported !== true} className="space-y-4 disabled:opacity-55">
                      <SectionCard
                        icon={<CircleDollarSign className="h-4 w-4 text-soft-primary" aria-hidden="true" />}
                        title="Curve fee split"
                        aside={
                          <span className="font-soft-display text-[18px] font-extrabold text-soft-primary-deep">
                            {(feeBpsNow / 100).toFixed(2)}%
                          </span>
                        }
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex overflow-hidden rounded-full border border-black/10" role="group" aria-label="Fee presets">
                            {feePresets.map((bps) => (
                              <button
                                key={bps}
                                type="button"
                                onClick={() => setFeeBps(bps)}
                                className={`px-3 py-1.5 text-[11px] font-extrabold transition-colors ${
                                  feeBpsNow === bps ? 'bg-soft-primary text-white' : 'bg-white text-[#16141b] hover:text-soft-primary-deep'
                                }`}
                              >
                                {(bps / 100).toFixed(2)}%
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setFeeBps(feeBpsNow - 5)}
                              className="rounded-full border border-black/10 p-1.5 text-black/50 hover:border-soft-primary"
                              aria-label="Decrease fee by 0.05%"
                            >
                              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setFeeBps(feeBpsNow + 5)}
                              className="rounded-full border border-black/10 p-1.5 text-black/50 hover:border-soft-primary"
                              aria-label="Increase fee by 0.05%"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        <span className={HINT}>
                          Paid by traders on every buy AND every sell. Capped at {(limits.maxFeeBps / 100).toFixed(2)}%, the
                          same rate Clanker and PONS charge. Fixed forever once launched.
                        </span>

                        <div className="mt-4">
                          <div className="flex items-center justify-between">
                            <span className={LABEL}>Your share of that fee</span>
                            <span className="text-[12px] font-extrabold text-[#16141b]">{creatorPctNow.toFixed(0)}%</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={limits.maxCreatorShareBps / 100}
                            step={5}
                            value={creatorSharePct}
                            onChange={(event) => setCreatorSharePct(event.target.value)}
                            className="w-full accent-[#7c6bda]"
                            aria-label="Creator share of the trading fee"
                          />
                          {/* Pasek podzialu: fiolet = tworca, szary = protokol.
                              Kreska pokazuje podloge, ktorej suwak nie przekroczy. */}
                          <div className="relative mt-1 h-3 w-full overflow-hidden rounded-full bg-black/15">
                            <div
                              className="absolute inset-y-0 left-0 rounded-l-full bg-soft-primary transition-[width]"
                              style={{ width: `${creatorPctNow}%` }}
                              aria-hidden="true"
                            />
                            <div
                              className="absolute inset-y-0 w-0 border-l-2 border-dashed border-black/35"
                              style={{ left: `${limits.maxCreatorShareBps / 100}%` }}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold">
                            <span className="text-soft-primary-deep">You {creatorPctNow.toFixed(0)}%</span>
                            <span className="text-black/50">Protocol {(100 - creatorPctNow).toFixed(0)}%</span>
                          </div>
                          <span className={HINT}>
                            {protocolFloorPct.toFixed(0)}% floor belongs to the protocol, enforced by the contract, not this
                            form. The curve has no buyback; that lives in the pool split below.
                          </span>
                        </div>
                      </SectionCard>

                      <SectionCard
                        icon={<CircleDollarSign className="h-4 w-4 text-[#12a451]" aria-hidden="true" />}
                        title="Fee receivers"
                        aside={
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-extrabold ${
                              receiverTotalOk ? 'bg-[#edfff4] text-[#0b9a51]' : 'bg-[#d9628a]/12 text-[#8d2748]'
                            }`}
                          >
                            {receiverTotalOk && <Check className="h-3 w-3" aria-hidden="true" />}
                            Total: {receiverTotalPct.toLocaleString('en-US', { maximumFractionDigits: 2 })}% / 100%
                          </span>
                        }
                      >
                        {/* Wiersz roboczy: szeroki adres, waski procent. Add
                            waliduje ZANIM cokolwiek trafi na liste ponizej. */}
                        <div className="flex items-center gap-2">
                          <input
                            value={receiverDraft.account}
                            onChange={(event) => setReceiverDraft((draft) => ({ ...draft, account: event.target.value }))}
                            className={`${FIELD} min-w-0 flex-1 font-mono text-[13px]`}
                            placeholder="0x..."
                            aria-label="New receiver address"
                          />
                          <input
                            inputMode="decimal"
                            value={receiverDraft.share}
                            onChange={(event) => setReceiverDraft((draft) => ({ ...draft, share: event.target.value }))}
                            className={`${FIELD} w-20 text-right`}
                            placeholder="10"
                            aria-label="New receiver share in percent"
                          />
                          <span className="text-[12px] font-bold text-black/40">%</span>
                          <button
                            type="button"
                            onClick={addReceiver}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/15 bg-white px-3 py-2 text-[11px] font-extrabold text-soft-primary-deep hover:border-soft-primary"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                          </button>
                        </div>
                        {receiverDraftError && <span className={FIELD_ERROR}>{receiverDraftError}</span>}

                        <ul className="mt-3 space-y-1.5">
                          {youShareBps > 0 && (
                            <li className="flex items-center justify-between rounded-xl bg-[#fbfbfd] px-3 py-2 text-[12px]">
                              <span className="min-w-0 truncate font-bold text-[#16141b]">
                                You{' '}
                                <span className="font-mono text-[11px] font-normal text-black/45">
                                  {address ? shortAddress(address) : 'connected wallet'}
                                </span>
                              </span>
                              <span className="ml-2 shrink-0 font-extrabold text-[#16141b]">
                                {(youShareBps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%
                              </span>
                            </li>
                          )}
                          {addedReceivers.map((row, index) => (
                            <li
                              key={`${row.account}-${index}`}
                              className="flex items-center justify-between gap-2 rounded-xl bg-[#fbfbfd] px-3 py-2 text-[12px]"
                            >
                              <span className="min-w-0 truncate font-mono text-[11.5px] text-[#16141b]">{shortAddress(row.account)}</span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <span className="font-extrabold text-[#16141b]">
                                  {row.share.toLocaleString('en-US', { maximumFractionDigits: 2 })}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setAddedReceivers((rows) => rows.filter((_, position) => position !== index))}
                                  className="rounded-full p-1 text-black/35 hover:bg-black/5 hover:text-[#16141b]"
                                  aria-label={`Remove receiver ${shortAddress(row.account)}`}
                                >
                                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                        <span className={HINT}>
                          The first receiver is you; your share is whatever the others leave. Up to {limits.maxRecipients}{' '}
                          addresses, paid out in ETH.
                        </span>
                      </SectionCard>

                      <SectionCard
                        icon={<Flame className="h-4 w-4 text-[#d78a55]" aria-hidden="true" />}
                        title="Pool fee split (after graduation)"
                        aside={<span className="font-soft-display text-[18px] font-extrabold text-[#a35c1a]">{fmtPct(buybackShare)}%</span>}
                      >
                        <span className={LABEL}>Auto-buyback (% of your slice)</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={buybackPct}
                          onChange={(event) => setBuybackPct(event.target.value)}
                          className="w-full accent-[#d78a55]"
                          aria-label="Auto-buyback percentage of your pool fee share"
                        />
                        {/* Jeden pasek = 100% oplaty puli. Segment protokolu
                            stoi; suwak buybacku NA ZYWO zweza segment "you". */}
                        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-black/10">
                          <div className="h-full bg-black/35" style={{ width: `${protocolPoolPct}%` }} aria-hidden="true" />
                          <div className="h-full bg-soft-primary transition-[width]" style={{ width: `${youPoolPct}%` }} aria-hidden="true" />
                          <div className="h-full bg-[#d78a55] transition-[width]" style={{ width: `${buybackPoolPct}%` }} aria-hidden="true" />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold">
                          <span className="text-black/50">Protocol {fmtPct(protocolPoolPct)}% (fixed)</span>
                          <span className="text-soft-primary-deep">You {fmtPct(youPoolPct)}%</span>
                          <span className="text-[#a35c1a]">Buyback {fmtPct(buybackPoolPct)}%</span>
                        </div>
                        <span className={HINT}>
                          You keep {fmtPct(youPoolPct)}% of every pool fee, {fmtPct(buybackPoolPct)}% buys &amp; burns your
                          token. The buyback comes out of YOUR slice; the protocol&apos;s {fmtPct(protocolPoolPct)}% is
                          untouched.
                        </span>
                      </SectionCard>

                      <SectionCard
                        icon={<ShieldCheck className="h-4 w-4 text-soft-primary" aria-hidden="true" />}
                        title="Sniper protection"
                        aside={
                          <button
                            type="button"
                            role="switch"
                            aria-checked={sniperOn}
                            onClick={() => setSniperOn((current) => !current)}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${sniperOn ? 'bg-soft-primary' : 'bg-black/20'}`}
                            aria-label="Toggle sniper protection"
                          >
                            <span
                              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${sniperOn ? 'left-[22px]' : 'left-0.5'}`}
                              aria-hidden="true"
                            />
                          </button>
                        }
                      >
                        {sniperOn ? (
                          <>
                            <label className="block">
                              <span className={LABEL}>Per-wallet cap (tokens)</span>
                              <input
                                inputMode="numeric"
                                value={sniperCapTokens}
                                onChange={(event) => setSniperCapTokens(event.target.value)}
                                className={FIELD}
                              />
                            </label>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {capChips.map((value) => (
                                <button key={value} type="button" onClick={() => setSniperCapTokens(String(value))} className={CHIP}>
                                  {value / 1_000_000}M{value === limits.windowCapTokens ? ' (default)' : ''}
                                </button>
                              ))}
                            </div>
                            <span className={HINT}>
                              Applies only during the first {LAUNCH_WINDOW_LABEL} after launch: one wallet cannot buy more
                              than this. Default {limits.windowCapTokens.toLocaleString('en-US')}, up to{' '}
                              {curve.t0.toLocaleString('en-US')} tokens. Your pre-buy plays by the same rule.
                            </span>
                            {/* Wskaznik NA ZYWO: pre-buy vs cap. Cap obejmuje tworce,
                                wiec pre-buy ponad cap = rewert - pokazujemy to, ZANIM
                                ktos zaplaci za gaz (najwiekszy footgun launcha). */}
                            {preBuyPreview && (() => {
                              const capTokens = Number(sniperCapTokens) || 0;
                              const over = preBuyPreview.tokens > capTokens;
                              return (
                                <div className={`mt-2 rounded-xl border px-3 py-2.5 text-[11.5px] leading-[1.45] ${over ? 'border-[#f3c58a] bg-[#fff8ed] text-[#a34b08]' : 'border-black/10 bg-[#f8f7fc] text-black/60'}`}>
                                  <div className="flex items-center justify-between gap-2 font-bold">
                                    <span>Your pre-buy ≈ {Math.round(preBuyPreview.tokens).toLocaleString('en-US')} tokens</span>
                                    <span className="shrink-0">cap {capTokens.toLocaleString('en-US')}</span>
                                  </div>
                                  {over && (
                                    <p className="mt-1 font-bold">
                                      Above the per-wallet cap — the launch would revert. Raise the cap or lower the pre-buy.
                                    </p>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <p className="flex items-start gap-2 rounded-xl bg-[#d9628a]/10 p-3 text-[11.5px] font-bold leading-[1.45] text-[#8d2748]">
                            <Flame className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            Anyone, including you, can buy the whole curve at launch.
                          </p>
                        )}
                      </SectionCard>

                      <SectionCard
                        icon={<Layers3 className="h-4 w-4 text-black/45" aria-hidden="true" />}
                        title="Metadata override"
                      >
                        <input
                          value={launchMetadataUri}
                          onChange={(event) => setLaunchMetadataUri(event.target.value)}
                          className={FIELD}
                          placeholder="ipfs://... (overrides image, description and links)"
                        />
                        <span className={HINT}>
                          Leave empty to store the quick-launch fields onchain. A custom URI replaces them entirely.
                        </span>
                      </SectionCard>

                      <div className="rounded-2xl border border-black/10 bg-white p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-soft-primary-deep">
                          <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" /> What you earn
                        </p>
                        <table className="mt-2 w-full text-[12px]">
                          <thead>
                            <tr className="text-left text-[10.5px] uppercase tracking-[0.08em] text-black/40">
                              <th className="pb-1 font-bold">Volume</th>
                              <th className="pb-1 text-right font-bold">On curve</th>
                              <th className="pb-1 text-right font-bold">In pool</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* USD pod kwota w ETH, nie zamiast niej - ETH jest
                                wartoscia glowna, dolar tylko dopiskiem i znika,
                                gdy kurs jest niedostepny. */}
                            {estimate.map((row) => (
                              <tr key={row.volume} className="border-t border-black/5 align-top">
                                <td className="py-1.5 text-black/55">
                                  {row.volume} ETH
                                  {ethUsd !== null && (
                                    <span className="block text-[10px] font-bold text-black/35">{formatUsd(row.volume * ethUsd)}</span>
                                  )}
                                </td>
                                <td className="py-1.5 text-right font-extrabold text-[#16141b]">
                                  {row.curve.toFixed(3)} ETH
                                  {ethUsd !== null && (
                                    <span className="block text-[10px] font-bold text-black/40">{formatUsd(row.curve * ethUsd)}</span>
                                  )}
                                </td>
                                <td className="py-1.5 text-right font-extrabold text-[#16141b]">
                                  {row.pool.toFixed(3)} ETH
                                  {ethUsd !== null && (
                                    <span className="block text-[10px] font-bold text-black/40">{formatUsd(row.pool * ethUsd)}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="mt-2 text-[12px] font-extrabold text-[#0b9a51]">Creator earnings are paid in ETH, not tokens.</p>
                        <span className={HINT}>
                          Curve earnings are exact for the fee you picked. Pool earnings assume the hook&apos;s{' '}
                          {(hookSplit.feeBps / 100).toFixed(2)}% swap fee and your{' '}
                          {((10_000 - hookSplit.protocolShareBps) / 100).toFixed(0)}% share of it, after your{' '}
                          {Number(buybackPct) || 0}% buyback allocation.
                        </span>
                      </div>
                    </fieldset>

                    {advancedSupported === true && advanced.error && (
                      <p className="rounded-xl bg-[#d9628a]/12 px-3 py-2 text-[11.5px] font-bold text-[#8d2748]">{advanced.error}</p>
                    )}
                  </div>
                )}
              </div>

              {/* --------------------------- PRAWA SZYNA ---------------------------- */}
              <aside className="hidden lg:block">
                <div className="sticky top-0 space-y-4">
                  <BoardPreviewCard
                    name={launchName}
                    symbol={launchSymbol}
                    imageUrl={previewImage}
                    raised={previewRaised}
                    hasPreBuy={previewRaised > 0}
                  />
                  <div className="rounded-[18px] border border-black/10 bg-[#fbfbfd] p-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-black/40">How it works</p>
                    <ul className="mt-3 space-y-2.5 text-[11.5px] leading-[1.45] text-black/60">
                      <li className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-soft-primary" aria-hidden="true" />
                        One transaction creates the token and starts its curve. Graduates to a Uniswap v4 pool at{' '}
                        {CURVE_TARGET_ETH} ETH.
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-soft-primary" aria-hidden="true" />
                        Pre-buy is atomic: it fills in the launch transaction itself, before anyone else can trade.
                      </li>
                      <li className="flex items-start gap-2">
                        <CircleDollarSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0b9a51]" aria-hidden="true" />
                        Creator earnings are paid in ETH, not tokens. Claim them any time.
                      </li>
                    </ul>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>

        {/* -------------------------------- STOPKA ------------------------------- */}
        {phase === 'form' && (
          <footer className="shrink-0 border-t border-black/10 bg-white px-5 py-4">
            {notice && (
              <div
                className={`mb-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[12px] ${
                  notice.kind === 'success'
                    ? 'border-[#9de7bb] bg-[#f0fff5] text-[#08753d]'
                    : 'border-[#f3c58a] bg-[#fff8ed] text-[#a34b08]'
                }`}
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{notice.text}</span>
              </div>
            )}
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] leading-[1.4] text-black/45" aria-live="polite">
                {busy ? 'Waiting for the transaction to confirm...' : disabledReason ?? summaryText}
              </span>
              <button
                type="button"
                disabled={busy || disabledReason !== null}
                onClick={launch}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-soft-primary px-5 py-3 text-[13px] font-extrabold text-white shadow-[0_6px_16px_rgba(124,107,218,0.22)] transition-transform active:scale-[0.97] disabled:opacity-60 sm:w-auto"
              >
                {busy ? 'Launching...' : 'Launch on curve'}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
