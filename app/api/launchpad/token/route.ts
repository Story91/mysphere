import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, http, type Address } from 'viem';
import { LAUNCHPAD_ADDRESS, LAUNCHPAD_CHAIN, launchpadAbi } from '../../../launchpad/config';
import { sessionAddress } from '../../asks/identity';
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

function readClient() {
  return createPublicClient({
    chain: LAUNCHPAD_CHAIN,
    transport: http(),
  });
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

  let creator: string;
  try {
    const launch = (await readClient().readContract({
      address: LAUNCHPAD_ADDRESS as Address,
      abi: launchpadAbi,
      functionName: 'launchOf',
      args: [address as Address],
    })) as readonly [Address, number, bigint, bigint, number, `0x${string}`];
    // `state == 0` znaczy "ten launchpad nie zna tego adresu" - nie "pusta
    // krzywa". Profil dla nieznanego tokena nie ma prawa powstac.
    if (Number(launch[1]) === 0) {
      return NextResponse.json({ error: 'This launchpad does not know that token.' }, { status: 404, headers: NO_STORE });
    }
    creator = launch[0];
  } catch {
    return NextResponse.json(
      { error: 'Could not read the token from chain right now.', code: 'chain_unavailable' },
      { status: 502, headers: NO_STORE }
    );
  }

  if (tokenDocId(creator) !== tokenDocId(author)) {
    return NextResponse.json(
      { error: 'Only the creator of this token can edit its profile.', code: 'not_creator' },
      { status: 403, headers: NO_STORE }
    );
  }

  const saved = await saveProfile({
    address,
    chainId: LAUNCHPAD_CHAIN.id,
    creator,
    profile: {
      logoUrl: body.logoUrl,
      description: body.description,
      website: body.website,
      twitter: body.twitter,
      telegram: body.telegram,
    },
  });

  if (!saved) {
    return NextResponse.json({ error: 'Saving the profile failed.' }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ profile: saved }, { headers: NO_STORE });
}
