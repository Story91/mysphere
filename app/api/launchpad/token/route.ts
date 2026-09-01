import { NextResponse, type NextRequest } from 'next/server';
import { put } from '@vercel/blob';
import { createPublicClient, http, type Address } from 'viem';
import { ACTIVE_LAUNCHPAD_NETWORK, LAUNCHPAD_NETWORKS, launchpadAbi } from '../../../startpad/config';
import { sessionAddress } from '../../asks/identity';
import { resolveCreatorWithRetry } from '../launchOwnership';
import { getProfiles, isProfileStoreAvailable, saveProfile, tokenDocId } from '../profileStore';

/**
 * Profil tokena launchpada: logo, opis i linki.
 *
 * GET  /api/launchpad/token?addresses=0x..,0x..   publiczny odczyt
 * POST /api/launchpad/token                       zapis, tylko tworca tokena
 *
 * === CO TU NAPRAWDE PILNUJE WLASNOSCI ===
 * Adres z ciala zadania NIE JEST tozsamoscia (ta sama zasada, co w
 * /api/asks i /api/premium). Tozsamosc bierze sie z podpisanej sesji SIWE,
 * a prawo do tokena - z ODCZYTU `launchOf(token).creator` Z LANCUCHA.
 *
 * Dwa warunki, oba konieczne:
 *   1. jest sesja SIWE            -> wiemy, kto pisze;
 *   2. creator z lancucha == ten adres -> wiemy, ze to JEGO token.
 *
 * Samo (1) pozwalaloby kazdemu zalogowanemu podmienic logo cudzego tokena.
 * Samo (2) jest niesprawdzalne bez (1), bo adres tworcy jest publiczny.
 */

// firebase-admin i node:crypto nie dzialaja na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
/** Odczyt jest publiczny i zmienia sie rzadko - minuta cache to mniej odczytow Firestore. */
const PUBLIC_CACHE = { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } as const;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Route jest bezstanowy - nie wie, na ktorej sieci stoi klient (to localStorage
 * po stronie przegladarki). Wiec siec bierzemy z pola `chainId` w zadaniu; bez
 * niego padamy na domysl. Bez tego launch/edycja na Robinhoodzie sprawdzaly
 * `launchOf` na Base Sepolii, dostawaly state 0 -> 404, i logo NIGDY nie
 * trafialo do Bloba tej sieci (kubelek startpad/logos/4663 zostawal pusty).
 */
function resolveNetwork(chainId: unknown) {
  const id = typeof chainId === 'number' ? chainId : Number(chainId);
  return Number.isFinite(id) && LAUNCHPAD_NETWORKS[id] ? LAUNCHPAD_NETWORKS[id] : ACTIVE_LAUNCHPAD_NETWORK;
}

function readClient(net: typeof ACTIVE_LAUNCHPAD_NETWORK) {
  return createPublicClient({
    chain: net.chain,
    transport: http(),
  });
}

const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,(.+)$/;

/**
 * Logo -> Vercel Blob pod deterministyczna sciezka `startpad/logos/{chainId}/{token}`.
 * Firestore NIE trzyma juz obrazka (data-URL zabijal egress darmowego tieru);
 * tablica czyta logo przez /api/startpad/logos (list Bloba). Zwraca true, gdy
 * obrazek trafil do Bloba - niezaleznie od tego, czy Firestore w ogole odpowie.
 */
async function uploadLogoToBlob(token: string, chainId: number, input: unknown): Promise<boolean> {
  if (typeof input !== 'string' || input.trim() === '') return false;
  const value = input.trim();
  let bytes: Buffer | null = null;
  let contentType = 'image/png';

  const match = DATA_IMAGE_RE.exec(value);
  if (match) {
    contentType = `image/${match[1]}`;
    try { bytes = Buffer.from(match[2], 'base64'); } catch { return false; }
  } else if (value.startsWith('https://')) {
    try {
      const res = await fetch(value);
      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok || !ct.startsWith('image/')) return false;
      contentType = ct.split(';')[0];
      bytes = Buffer.from(await res.arrayBuffer());
    } catch { return false; }
  } else {
    return false; // ipfs:// itp. - pomijamy, nie ma czego wgrac do Bloba
  }

  if (!bytes || bytes.length === 0 || bytes.length > 2_000_000) return false;
  try {
    await put(`startpad/logos/${chainId}/${token.toLowerCase()}`, bytes, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('addresses');
  if (!raw) {
    return NextResponse.json({ error: 'Pass ?addresses=0x...,0x...' }, { status: 400, headers: NO_STORE });
  }
  const addresses = raw.split(',').map((value) => value.trim()).filter((value) => ADDRESS_RE.test(value));
  if (addresses.length === 0) {
    return NextResponse.json({ profiles: {} }, { headers: PUBLIC_CACHE });
  }

  const profiles = await getProfiles(addresses);
  return NextResponse.json({ profiles }, { headers: PUBLIC_CACHE });
}

export async function POST(request: NextRequest) {
  if (!(await isProfileStoreAvailable())) {
    // Bez konta uslugowego nie ma gdzie zapisac. Odmawiamy wprost, zamiast
    // udawac sukces - ta sama decyzja co w POST /api/asks/answers.
    return NextResponse.json(
      { error: 'Token profiles are not configured on this deployment.', code: 'store_unavailable' },
      { status: 503, headers: NO_STORE }
    );
  }

  const author = sessionAddress(request);
  if (!author) {
    return NextResponse.json(
      { error: 'Sign in with your wallet before editing a token profile.', code: 'no_session' },
      { status: 401, headers: NO_STORE }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400, headers: NO_STORE });
  }

  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (!ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: 'Field `address` must be a token address.' }, { status: 400, headers: NO_STORE });
  }

  const net = resolveNetwork(body.chainId);

  // Odczyt z RETRY: POST przychodzi sekundy po wykopaniu bloku startu, a
  // publiczny RPC oddaje wtedy nieswieze odczyty (state 0 dla tokena, ktory
  // JUZ istnieje). Pojedynczy odczyt zamienial ten wyscig w 404 i logo
  // przepadalo - swieze tokeny (B2026, CLAW, ELEGANT) zostawaly bez logo
  // w Blobie, widoczne tylko w localStorage tworcy.
  const client = readClient(net);
  const resolution = await resolveCreatorWithRetry(async () => {
    const launch = (await client.readContract({
      address: net.launchpad as Address,
      abi: launchpadAbi,
      functionName: 'launchOf',
      args: [address as Address],
    })) as readonly [Address, number, bigint, bigint, number, `0x${string}`];
    return { creator: launch[0], state: Number(launch[1]) };
  });
  if (!resolution.ok) {
    // `state == 0` po wyczerpaniu prob znaczy "ten launchpad nie zna tego
    // adresu" - nie "pusta krzywa". Profil dla nieznanego tokena nie ma
    // prawa powstac.
    if (resolution.reason === 'unknown_token') {
      return NextResponse.json({ error: 'This launchpad does not know that token.' }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json(
      { error: 'Could not read the token from chain right now.', code: 'chain_unavailable' },
      { status: 502, headers: NO_STORE }
    );
  }
  const creator = resolution.creator;

  if (tokenDocId(creator) !== tokenDocId(author)) {
    // Wzorzec escrow-as-creator (SPHERE, sekcja 8 tokenomiki): tworca
    // on-chain jest KONTRAKTEM, ktorym nikt nie podpisze sesji SIWE.
    // Prawo do profilu ma wtedy adres, ktory ten kontrakt sam deklaruje
    // jako LAUNCH_AUTHORITY() - odczyt z lancucha, nie pole z JSON-a.
    // Dla tworcy-EOA odczyt rewertuje i zostaje stare 403.
    let delegated: string | null = null;
    try {
      delegated = (await client.readContract({
        address: creator as Address,
        abi: [
          {
            type: 'function',
            name: 'LAUNCH_AUTHORITY',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ type: 'address' }],
          },
        ] as const,
        functionName: 'LAUNCH_AUTHORITY',
      })) as string;
    } catch {
      delegated = null;
    }
    if (!delegated || tokenDocId(delegated) !== tokenDocId(author)) {
      return NextResponse.json(
        { error: 'Only the creator of this token can edit its profile.', code: 'not_creator' },
        { status: 403, headers: NO_STORE }
      );
    }
  }

  // Logo -> Blob (CDN). Robimy to PRZED Firestore, bo obrazek ma sie zapisac
  // nawet gdy Firestore jest niedostepny (np. wyczerpany limit).
  const logoSaved = await uploadLogoToBlob(address, net.chain.id, body.logoUrl);

  // Firestore trzyma juz TYLKO opis i linki - bez data-URL. `logoUrl: null`
  // czysci ewentualny stary data-URL przy okazji edycji.
  const saved = await saveProfile({
    address,
    chainId: net.chain.id,
    creator,
    profile: {
      logoUrl: null,
      description: body.description,
      website: body.website,
      twitter: body.twitter,
      telegram: body.telegram,
    },
  });

  // Sukces, gdy cokolwiek sie zapisalo: logo w Blobie ALBO profil w Firestore.
  if (!saved && !logoSaved) {
    return NextResponse.json({ error: 'Saving the profile failed.' }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ profile: saved, logoSaved }, { headers: NO_STORE });
}
