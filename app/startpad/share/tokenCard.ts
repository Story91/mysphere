import 'server-only';
import { createPublicClient, formatEther, http, type Address } from 'viem';
import { list } from '@vercel/blob';
import { erc20Abi, LAUNCHPAD_NETWORKS, launchpadAbi, LAUNCH_STATE, type LaunchpadNetwork } from '../config';
import { pickTokenImage, tokenAccent } from '../metadata';
import { rpcCandidates } from '../../api/launchpad/historyRpc';
import { readHistory } from '../../api/launchpad/historyStore';
import {
  priceToNumber,
  priceWeiAfter,
  START_PRICE_WEI,
  TARGET_WEI,
  type TradeEntry,
} from '../[address]/detailShared';
import { formatMultiple } from '../shareText';

/**
 * Dane karty udostepniania tokena - jedno zrodlo dla obrazka OG, obrazka
 * miniappki i metadanych strony tokena.
 *
 * ===========================================================================
 * TO JEST KOD OGLADANY GLOWNIE PRZEZ ROBOTY
 * ===========================================================================
 * Wolaja go crawlery X-a, Farcastera, Telegrama i Facebooka - kazdy osobno, po
 * jednym wklejeniu linku. Stad dwie zasady, ktore rzadza calym plikiem:
 *
 *   1. NIC SIE NIE MOZE WYWALIC. Kazdy odczyt ma swoj `catch`, a brak danych
 *      konczy sie ubozsza karta, nigdy bledem. Podglad linku, ktory nie wstal,
 *      jest gorszy niz podglad bez wykresu.
 *   2. NIC SIE NIE SKANUJE. Wykres i liczba posiadaczy ida z GOTOWEGO cache'u
 *      historii (`readHistory`). Gdy cache jest pusty, karta pokazuje to, co
 *      wie z lancucha, a skan zostawia stronie tokena. Fala wejsc z jednego
 *      wirala nie moze uruchomic fali skanow.
 *
 * ===========================================================================
 * SKAD SIE BIERZE SIEC, SKORO ADRES JEJ NIE NIESIE
 * ===========================================================================
 * Sciezka /startpad/0x... nie ma miejsca na chainId, a launchpad stoi na
 * trzech lancuchach - ten sam adres kontraktu na kazdym z nich to inny token
 * (albo zaden). Link z naszego przycisku niesie `?c=`, ale wklejony recznie
 * albo skrocony przez cudzy serwis moze go zgubic. Dlatego przy braku
 * wskazowki PYTAMY WSZYSTKIE SIECI naraz i wygrywa ta, ktora zna ten token.
 */

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type TokenCardData = {
  chainId: number;
  networkLabel: string;
  address: string;
  name: string;
  symbol: string;
  state: 'Curve' | 'Locked' | 'Graduated';
  creator: string;
  /** Zebrane ETH na krzywej i prog graduacji. */
  raised: number;
  target: number;
  priceEth: number;
  /** Sformatowany mnozniki od startu, albo null gdy ceny nie znamy. */
  multiple: string | null;
  /** Liczeni tak samo jak w tablicy: rozne adresy, ktore kupily. */
  holders: number;
  /** Seria do wykresu - cena startowa krzywej i cena po kazdej transakcji. */
  prices: number[];
  up: boolean;
  /** Logo POBRANE i osadzone jako `data:` - patrz `logoData` nizej. */
  logoUrl: string | null;
  /** Kolor tokena bez logo - ten sam co glif w tablicy. */
  accent: string;
  startedAt: number;
  ageLabel: string;
};

type LaunchTuple = readonly [Address, number, bigint, bigint, number, `0x${string}`];

/**
 * Pierwszy odpowiadajacy RPC danej sieci. Ta sama kolejka co przy skanie
 * historii: wlasny endpoint, a za nim publiczny - zepsuta zmienna srodowiskowa
 * nie moze kasowac kart udostepniania.
 */
function clientFor(net: LaunchpadNetwork) {
  const url = rpcCandidates(net.chain.id, process.env)[0];
  return createPublicClient({ chain: net.chain, transport: http(url) });
}

/** Stan 0 znaczy "ten launchpad nie zna tego adresu", a nie "pusta krzywa". */
async function probe(net: LaunchpadNetwork, token: Address) {
  const launch = (await clientFor(net).readContract({
    address: net.launchpad as Address,
    abi: launchpadAbi,
    functionName: 'launchOf',
    args: [token],
  })) as LaunchTuple;
  if (Number(launch[1]) === 0) throw new Error('unknown token');
  return { net, launch };
}

/**
 * Siec, ktora zna ten token. Wskazowka z adresu ma pierwszenstwo, ale nie jest
 * wiazaca: gdy token pod nia nie istnieje, pytamy pozostale, zamiast oddawac
 * pusta karte na podstawie cudzego literowania parametru.
 */
async function resolveNetwork(token: Address, hint: number | null) {
  const hinted = hint !== null ? LAUNCHPAD_NETWORKS[hint] : undefined;
  if (hinted) {
    const found = await probe(hinted, token).catch(() => null);
    if (found) return found;
  }

  const rest = Object.values(LAUNCHPAD_NETWORKS).filter((net) => net.chain.id !== hinted?.chain.id);
  const results = await Promise.allSettled(rest.map((net) => probe(net, token)));
  for (const result of results) {
    if (result.status === 'fulfilled') return result.value;
  }
  return null;
}

/**
 * Logo z Bloba. Jedno `list()` po dokladnym prefiksie - adresy Bloba niosa
 * losowy czlon, wiec nie da sie ich zlozyc ze sciezki.
 */
async function logoFromBlob(chainId: number, token: string): Promise<string | null> {
  try {
    const { blobs } = await list({
      prefix: `startpad/logos/${chainId}/${token.toLowerCase()}`,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      limit: 1,
    });
    return blobs[0]?.url ?? null;
  } catch {
    return null;
  }
}

/** Formaty, ktore rasteryzator kart na pewno rozumie. Reszta konczy sie glifem. */
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);
const LOGO_MAX_BYTES = 1_500_000;
const LOGO_TIMEOUT_MS = 2500;

/**
 * Logo POBRANE PRZEZ NAS, nie podane rendererowi jako adres.
 *
 * Satori pobiera obrazek sam i robi to bez limitu czasu - a logo tokena bywa
 * na cudzej bramie IPFS, ktora potrafi milczec. Jeden taki token zamienialby
 * cala karte w blad, czyli w brak podgladu linku. Pobranie u siebie daje limit
 * czasu, limit rozmiaru i sprawdzenie typu; kazda z tych trzech rzeczy konczy
 * sie glifem z inicjalami, a nie wywroceniem obrazka.
 */
async function logoData(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (!url.startsWith('https://')) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!LOGO_TYPES.has(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function ageLabelFrom(startedAt: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - startedAt);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m old`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h old`;
  return `${Math.floor(seconds / 86_400)}d old`;
}

/**
 * Historia z cache'u: seria cen do wykresu i liczba kupujacych. Brak bazy albo
 * brak wpisu to nie jest blad - to jest token, ktorego jeszcze nikt nie
 * ogladal na tyle dlugo, zeby powstal cache.
 */
async function historyFrom(chainId: number, token: string): Promise<{ prices: number[]; holders: number }> {
  const record = await readHistory(chainId, token).catch(() => null);
  const trades: TradeEntry[] = record?.trades ?? [];

  const buyers = new Set<string>();
  for (const trade of trades) {
    if (trade.kind === 'buy') buyers.add(trade.account.toLowerCase());
  }

  return {
    // Cena startowa krzywej jest stala kontraktu i obowiazuje od bloku startu,
    // wiec jest pelnoprawnym pierwszym punktem, a nie domysleniem.
    prices: [priceToNumber(START_PRICE_WEI), ...trades.map((trade) => priceToNumber(trade.priceWei))],
    holders: buyers.size,
  };
}

export async function loadTokenCard(address: string, chainHint: number | null): Promise<TokenCardData | null> {
  if (!ADDRESS_RE.test(address)) return null;

  const token = address as Address;
  const found = await resolveNetwork(token, chainHint).catch(() => null);
  if (!found) return null;

  const { net, launch } = found;
  const [creator, stateIndex, ethReserve, tokenReserve, startedAt] = launch;
  const client = clientFor(net);

  const [name, symbol, spotPrice, metadataUri] = await Promise.all([
    client
      .readContract({ address: token, abi: erc20Abi, functionName: 'name' })
      .catch(() => '') as Promise<string>,
    client
      .readContract({ address: token, abi: erc20Abi, functionName: 'symbol' })
      .catch(() => '') as Promise<string>,
    // Po graduacji ten odczyt rewertuje - cena zyje wtedy w puli v4.
    client
      .readContract({ address: net.launchpad as Address, abi: launchpadAbi, functionName: 'spotPriceWeiPerToken', args: [token] })
      .catch(() => 0n) as Promise<bigint>,
    client
      .readContract({ address: net.launchpad as Address, abi: launchpadAbi, functionName: 'metadataURI', args: [token] })
      .catch(() => '') as Promise<string>,
  ]);

  // Po graduacji zostaja ostatnie rezerwy krzywej i licza sie tym samym wzorem,
  // co w kontrakcie - inaczej karta tokena po graduacji nie mialaby ceny wcale.
  const priceWei = spotPrice > 0n ? spotPrice : priceWeiAfter(ethReserve, tokenReserve);
  const priceEth = priceToNumber(priceWei);

  const [history, blobLogo] = await Promise.all([
    historyFrom(net.chain.id, token),
    logoFromBlob(net.chain.id, token),
  ]);

  const first = history.prices[0] ?? 0;
  const last = history.prices[history.prices.length - 1] ?? 0;
  const logo = await logoData(pickTokenImage({ profileLogoUrl: blobLogo, metadataUri }).url);

  return {
    chainId: net.chain.id,
    networkLabel: net.label,
    address: token.toLowerCase(),
    name: name || 'Unknown token',
    symbol: symbol || '???',
    state: (LAUNCH_STATE[Number(stateIndex)] ?? 'Curve') as TokenCardData['state'],
    creator,
    raised: Number(formatEther(ethReserve)),
    target: Number(formatEther(TARGET_WEI)),
    priceEth,
    multiple: formatMultiple(priceEth, priceToNumber(START_PRICE_WEI)),
    holders: history.holders,
    prices: history.prices,
    up: last >= first,
    logoUrl: logo,
    accent: tokenAccent(token),
    startedAt: Number(startedAt),
    ageLabel: ageLabelFrom(Number(startedAt)),
  };
}

/** `?c=8453` z adresu udostepnienia. Smiec w parametrze znaczy "nie wiem". */
export function chainHintFrom(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const chainId = Number(raw);
  return LAUNCHPAD_NETWORKS[chainId] ? chainId : null;
}
