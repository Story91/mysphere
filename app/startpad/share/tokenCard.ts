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
  SUPPLY_TOKENS,
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

/**
 * Kurs ETH/USD dla kapitalizacji na karcie.
 *
 * Prosto do zrodla, nie przez `/api/launchpad/eth-price`: ten kod biegnie w
 * generatorze obrazka, ktory nie zna wlasnego adresu bazowego, a wolanie
 * samego siebie po HTTP przy renderze karty to dodatkowy tor awarii tam, gdzie
 * i tak nie ma komu jej zobaczyc. To samo zrodlo, co tamta trasa.
 *
 * `null` znaczy "nie wiemy" i karta pokazuje wtedy kreske - nigdy "$0".
 * Krotki timeout, bo crawler nie czeka: lepsza karta bez jednej liczby niz
 * karta, ktora nie zdazyla powstac.
 */
async function ethUsdSpot(): Promise<number | null> {
  try {
    const response = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', {
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { amount?: unknown } };
    const value = Number(body?.data?.amount);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

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
  /** Kapitalizacja w dolarach. `null` = nie znamy kursu ETH, karta da kreske. */
  mcapUsd: number | null;
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

const LOGO_MAX_BYTES = 3_000_000;
const LOGO_TIMEOUT_MS = 3000;
/** Bok logo na karcie to 104 px; 128 daje zapas na ekrany o gestych pikselach. */
const LOGO_PX = 128;

/**
 * Logo POBRANE I PRZEROBIONE PRZEZ NAS, nie podane rendererowi jako adres.
 *
 * ===========================================================================
 * DLACZEGO PRZERABIAMY, A NIE PODAJEMY DALEJ
 * ===========================================================================
 * Karta $ELE poszla w swiat z glifem "EL" zamiast logo, mimo ze logo lezalo w
 * Blobie. Powod: nasz upload zapisuje je jako WEBP (app/startpad/logoUpload.ts
 * wybiera webp jako najmniejszy), a `resvg` wbudowany w @vercel/og nie ma
 * dekodera webp - w jego binarce nie wystepuje nawet takie slowo. Satori
 * rozpozna typ i wstawi obrazek, po czym rasteryzacja odda puste miejsce.
 *
 * Dlatego kazde logo przechodzi przez `sharp` i wychodzi PNG-iem 128 px. Przy
 * okazji zalatwia to trzy inne rzeczy: obcy `metadataURI` moze byc avif albo
 * svg i tez zadziala, dane sa przycinane do kwadratu (kadr karty ma staly
 * rozmiar), a wynik wazy kilkanascie kilobajtow zamiast megabajta z telefonu.
 *
 * ===========================================================================
 * DLACZEGO POBIERAMY SAMI
 * ===========================================================================
 * Satori pobiera obrazek sam i robi to bez limitu czasu, a logo tokena bywa na
 * cudzej bramie IPFS, ktora potrafi milczec. Jeden taki token zamienialby cala
 * karte w blad, czyli w brak podgladu linku. U siebie mamy limit czasu, limit
 * rozmiaru i `catch` - kazde niepowodzenie konczy sie glifem z inicjalami,
 * nigdy wywroconym obrazkiem.
 */
async function logoData(url: string | null): Promise<string | null> {
  if (!url) return null;

  try {
    let source: Buffer | null = null;

    if (url.startsWith('data:')) {
      const comma = url.indexOf(',');
      // Interesuje nas wylacznie base64 - `metadata.ts` innych data: nie
      // przepuszcza, a bez tego znacznika `Buffer.from` cicho zwroci smiec.
      if (comma < 0 || !url.slice(0, comma).includes('base64')) return null;
      source = Buffer.from(url.slice(comma + 1), 'base64');
    } else if (url.startsWith('https://')) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return null;
        if (!(response.headers.get('content-type') ?? '').startsWith('image/')) return null;
        source = Buffer.from(await response.arrayBuffer());
      } finally {
        clearTimeout(timer);
      }
    } else {
      return null;
    }

    if (!source || source.length === 0 || source.length > LOGO_MAX_BYTES) return null;

    // Import w srodku funkcji: `sharp` ciagnie za soba binarke, a wiekszosc
    // wywolan tego modulu (metadane strony) logo w ogole nie potrzebuje.
    const sharp = (await import('sharp')).default;
    const png = await sharp(source, { animated: false })
      .resize(LOGO_PX, LOGO_PX, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();

    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    // Nieczytelny plik, padnieta brama, format bez dekodera - karta ma wyjsc
    // z glifem, a nie nie wyjsc wcale.
    return null;
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

/**
 * `withLogo` domyslnie tak, ale metadane strony tokena wolaja z `false` - one
 * potrzebuja tytulu i liczb, a nie obrazka. Bez tego kazde wejscie na strone
 * ciagnelo logo z Bloba i uruchamialo `sharp` po to, zeby wynik wyrzucic.
 */
export async function loadTokenCard(
  address: string,
  chainHint: number | null,
  options: { withLogo?: boolean } = {}
): Promise<TokenCardData | null> {
  const withLogo = options.withLogo !== false;
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

  const [history, blobLogo, ethUsd] = await Promise.all([
    historyFrom(net.chain.id, token),
    withLogo ? logoFromBlob(net.chain.id, token) : Promise.resolve(null),
    ethUsdSpot(),
  ]);

  const first = history.prices[0] ?? 0;
  const last = history.prices[history.prices.length - 1] ?? 0;
  const logo = withLogo
    ? await logoData(pickTokenImage({ profileLogoUrl: blobLogo, metadataUri }).url)
    : null;

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
    // Kapitalizacja Z CALEJ PODAZY - ta sama regula, co `mcapWei` na stronie
    // tokena i w karcie pod postem, zeby trzy miejsca nie podawaly trzech
    // liczb. Bez kursu ETH zostaje `null`, a karta pokazuje kreske.
    mcapUsd: ethUsd === null ? null : priceEth * ethUsd * Number(SUPPLY_TOKENS),
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
