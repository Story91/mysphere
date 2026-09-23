import { NextResponse, type NextRequest } from 'next/server';
import { list } from '@vercel/blob';
import { createPublicClient, http, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { erc20Abi, LAUNCHPAD_NETWORKS, launchpadAbi } from '../../../startpad/config';
import { SUPPLY_TOKENS, WEI } from '../../../startpad/[address]/detailShared';
import { pickTokenImage } from '../../../startpad/metadata';
import { getProfiles, tokenDocId } from '../profileStore';
import { rpcCandidates } from '../historyRpc';

/**
 * GET /api/launchpad/card?address=0x... - czy startpad zna ten token, i czym on jest.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * Karta tokena pod postem na feedzie czytala dotad WYLACZNIE `/api/b20/token`,
 * a tamten bierze cene i obrazek z GeckoTerminala. Token na krzywej startpada
 * nie ma jeszcze puli na Uniswapie, wiec GeckoTerminal nie wie o nim nic - i
 * pod postem o dzialajacym tokenie stalo "no market yet" obok szarego glifu z
 * inicjalami zamiast logo.
 *
 * Ta trasa oddaje to, czego tamta nie ma: cene Z KRZYWEJ, stan launchpada i
 * logo z profilu tworcy. Odpowiedz `ok: false` znaczy "startpad tego tokena nie
 * zna" i wtedy karta wraca do dotychczasowej sciezki.
 *
 * ===========================================================================
 * KTORE SIECI SPRAWDZAMY
 * ===========================================================================
 * Base mainnet i Base Sepolie. Robinhooda tu NIE MA i to jest swiadome: jego
 * publiczny RPC bywa nieosiagalny (sprawdzone 2026-08-13), a kazdy nieznany
 * adres w feedzie kosztowalby wtedy pelen timeout. Post z Robinhooda dostanie
 * karte, gdy dopiszemy do adresu `chainId` - obsluga parametru juz tu jest.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Trasa eksportuje sam GET, wiec `force-dynamic` nie wylacza Data Cache
// Nexta 14: zapytania JSON-RPC viem (POST bez `cache`) szly do "auto cache"
// na rok (pelny opis: app/api/launchpad/pool-swaps/route.ts). Tu `revalidate
// = 0`, a nie `fetchCache = 'force-no-store'` jak w pozostalych trasach, bo
// kurs z `ethUsd()` ma swiadome `next: { revalidate: 60 }` - `revalidate = 0`
// zeruje tylko domyslne cache'owanie, jawna minuta zostaje.
export const revalidate = 0;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Kolejnosc ma znaczenie: produkcja pierwsza, zeby zwykly przypadek konczyl sie na jednym odczycie. */
const LOOKUP_CHAINS = [base.id, baseSepolia.id];

const STATE_LABEL = ['None', 'Curve', 'Locked', 'Graduated'] as const;

function clientFor(chainId: number) {
  const net = LAUNCHPAD_NETWORKS[chainId];
  const [preferred] = rpcCandidates(chainId, process.env);
  return createPublicClient({ chain: net.chain, transport: http(preferred) });
}

/**
 * Logo wgrane przez tworce. TRZECIE zrodlo obrazka i w praktyce najczestsze.
 *
 * Upload z modala startu lezy w Vercel Blob pod deterministyczna sciezka
 * `startpad/logos/{chainId}/{token}` - tam, gdzie zaglada tablica. Ani profil
 * w bazie, ani `metadataURI` z lancucha go nie widza: token GLIFE ma logo w
 * Blobie, pusty profil i metadane BEZ pola `image`, i wlasnie dlatego pod
 * postem stal szary glif "GL" zamiast obrazka.
 */
async function blobLogo(chainId: number, address: string): Promise<string | null> {
  try {
    const { blobs } = await list({
      prefix: `startpad/logos/${chainId}/${address.toLowerCase()}`,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      limit: 1,
    });
    return blobs[0]?.url ?? null;
  } catch {
    // Brak Bloba nie moze zabrac karty - zostaja pozostale zrodla i glif.
    return null;
  }
}

/** Kurs ETH/USD dla dopisku. `null` znaczy "bez dopisku", nigdy "zero". */
async function ethUsd(request: NextRequest): Promise<number | null> {
  try {
    const response = await fetch(new URL('/api/launchpad/eth-price', request.nextUrl.origin), {
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { usd?: unknown; price?: unknown };
    const value = typeof body.usd === 'number' ? body.usd : typeof body.price === 'number' ? body.price : null;
    return value !== null && Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const address = (request.nextUrl.searchParams.get('address') ?? '').trim();
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ ok: false, error: 'Bad address.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const asked = Number(request.nextUrl.searchParams.get('chainId'));
  const chains = Number.isFinite(asked) && LAUNCHPAD_NETWORKS[asked] ? [asked] : LOOKUP_CHAINS;
  const token = address as Address;

  for (const chainId of chains) {
    const net = LAUNCHPAD_NETWORKS[chainId];
    const client = clientFor(chainId);

    let creator: Address;
    let stateIndex: number;
    try {
      const launch = (await client.readContract({
        address: net.launchpad as Address,
        abi: launchpadAbi,
        functionName: 'launchOf',
        args: [token],
      })) as readonly [Address, number, bigint, bigint, number, `0x${string}`];
      creator = launch[0];
      stateIndex = Number(launch[1]);
    } catch {
      // Ten launchpad tokena nie zna albo odczyt padl - probujemy nastepna siec.
      continue;
    }
    if (stateIndex === 0) continue;

    // Nazwa i symbol Z LANCUCHA, nigdy z bazy: to jest tresc pokazywana obok
    // ceny, a baza jest warstwa edytowalna. Ta sama zasada, co w tokenliscie.
    const [name, symbol, spotPriceWei, metadataUri, profiles, uploaded] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }).catch(() => null),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }).catch(() => null),
      client
        .readContract({ address: net.launchpad as Address, abi: launchpadAbi, functionName: 'spotPriceWeiPerToken', args: [token] })
        .catch(() => null),
      // Logo moze siedziec takze W LANCUCHU, w `metadataURI` ustawionym przy
      // starcie. Sam profil z bazy nie wystarcza: tworca, ktory podal obrazek
      // przy launchu i nigdy nie wszedl w edycje profilu, dostawalby pod
      // postem szary glif z inicjalami mimo ze logo istnieje.
      // Starsze wdrozenie tego odczytu nie ma - stad `catch`.
      client
        .readContract({ address: net.launchpad as Address, abi: launchpadAbi, functionName: 'metadataURI', args: [token] })
        .catch(() => null),
      getProfiles([address]),
      blobLogo(chainId, address),
    ]);

    const priceWei = typeof spotPriceWei === 'bigint' ? spotPriceWei : null;
    const priceEth = priceWei === null ? null : Number(priceWei) / Number(WEI);
    // KURS ETH TYLKO DLA ETH. Na Arc jednostka natywna to USDC, wiec ten sam
    // kod mnozyl kwote w dolarach przez kurs etheru - karta pod postem
    // pokazywalaby setki tysiecy dolarow przy kilkudziesieciu na krzywej.
    // Siec rozliczana w dolarach ma kurs 1; jednostki, ktorej nie umiemy
    // wycenic, nie wyceniamy wcale.
    const native = net.chain.nativeCurrency.symbol;
    const usd =
      priceEth === null
        ? null
        : /^(USDC|USDT|USD)$/i.test(native)
          ? 1
          : /^(ETH|WETH)$/i.test(native)
            ? await ethUsd(request)
            : null;

    return NextResponse.json(
      {
        ok: true,
        chainId,
        address: address.toLowerCase(),
        name: typeof name === 'string' ? name : null,
        symbol: typeof symbol === 'string' ? symbol : null,
        creator,
        state: STATE_LABEL[stateIndex] ?? 'Curve',
        // Ta sama regula pierwszenstwa, co w naglowku strony tokena: profil
        // tworcy wygrywa z lancuchem, zeby jeden token nie mial dwoch logo.
        logoUrl:
          pickTokenImage({
            // Profil tworcy wygrywa - to jedyne zrodlo, ktore da sie poprawic
            // po starcie. Za nim upload z Bloba, na koncu lancuch.
            profileLogoUrl: profiles[tokenDocId(address)]?.logoUrl ?? uploaded,
            metadataUri: typeof metadataUri === 'string' ? metadataUri : null,
          }).url ?? uploaded,
        priceEth,
        priceUsd: usd !== null && priceEth !== null ? priceEth * usd : null,
        // Kapitalizacja liczona z CALEJ podazy - ta sama regula, co na stronie
        // tokena (`mcapWei`), zeby dwa miejsca nie podawaly dwoch liczb.
        mcapUsd: usd !== null && priceEth !== null ? priceEth * usd * Number(SUPPLY_TOKENS) : null,
        href: `/startpad/${address.toLowerCase()}/`,
      },
      {
        headers: {
          // Cena z krzywej rusza sie co transakcje, ale karta w feedzie nie
          // jest tickerem - minuta swiezosci wystarczy, a chroni RPC przed
          // odczytem na kazde przewiniecie listy.
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  }

  return NextResponse.json(
    { ok: false },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } }
  );
}
