import { NextRequest } from 'next/server';
import { parseIpfsRef, type IpfsRef } from '@/utils/ipfs';

/**
 * Proxy tresci IPFS z lancuchem bramek.
 *
 * DLACZEGO ISTNIEJE (zmierzone 2026-09-11): kazdy IP NFT Camp Origin ma
 * tokenURI na PRYWATNEJ bramce mintujacego, np.
 * `ivory-total-ox-210.mypinata.cloud`. Ta bramka przekroczyla darmowy limit i
 * oddaje 403 na metadane ORAZ na obrazy - stad "PREVIEW UNAVAILABLE" na
 * wszystkich kartach i seria 403 w konsoli. Publiczne bramki rowniez potrafia
 * odmowic (ipfs.io, dweb.link, w3s.link zwracaly 429 przy serii zadan).
 *
 * Tresc IPFS jest niezmienna i adresowana przez CID, wiec nie ma znaczenia,
 * KTORA bramka ja odda. Ten route bierze dowolny adres wskazujacy na CID,
 * odpytuje kilka bramek i oddaje pierwsza odpowiedz - z naglowkiem
 * `immutable`, wiec CDN Vercela trzyma ja na stale i kolejni ludzie nie placa
 * juz za zadne odpytanie.
 *
 * BEZPIECZENSTWO: nie pobieramy adresu podanego przez uzytkownika. Z wejscia
 * wyciagamy TYLKO CID i sciezke pod nim, sprawdzamy ich ksztalt, a zadanie
 * skladamy z wlasnej, zamknietej listy bramek. Nie da sie tym siegnac do
 * hosta spoza tej listy ani do sieci wewnetrznej.
 */

export const runtime = 'nodejs';

/** Bramki w kolejnosci uzycia. Pierwsza trojka startuje rownolegle. */
const GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://w3s.link/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://trustless-gateway.link/ipfs/',
];

/** Ile bramek pytamy naraz w pierwszej turze. */
const PARALLEL = 3;
/** Limit na pojedyncza bramke. Powyzej tego i tak czekalby tylko uzytkownik. */
const GATEWAY_TIMEOUT_MS = 9_000;
/** Gorny limit rozmiaru. Grafiki IP NFT mieszcza sie w tym z zapasem. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Ile zadan do bramek moze isc naraz z tego procesu.
 *
 * ZMIERZONE: strona otwiera 50 kart naraz, kazda z metadanymi i obrazem. Bez
 * tego limitu szlo w swiat ~150 polaczen w jednej chwili, publiczne bramki
 * odpowiadaly 429 i proxy oddawalo 502 - karta zapamietywala blad i zostawala
 * pusta na stale. Ta sama tresc pobrana chwile pozniej schodzila w 3 sekundy.
 * Kolejka zamienia szarze w rowny strumien.
 */
const MAX_CONCURRENT = 8;

let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Buduje adres na konkretnej bramce. */
function gatewayUrl(base: string, ref: IpfsRef): string {
  return base + ref.cid + (ref.path ? `/${ref.path}` : '');
}

async function fetchFrom(base: string, ref: IpfsRef): Promise<Response> {
  return withSlot(async () => {
    const res = await fetch(gatewayUrl(base, ref), {
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      headers: { accept: '*/*' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`${base} -> ${res.status}`);
    return res;
  });
}

/**
 * Pierwsza bramka, ktora odda 200. Najpierw trojka rownolegle, potem reszta po
 * kolei, a na koniec jeszcze jedno podejscie po krotkiej przerwie - 429 z
 * publicznej bramki mija sam, wiec jedna pauza ratuje wiekszosc przypadkow.
 */
async function race(ref: IpfsRef): Promise<Response> {
  const errors: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));

    try {
      return await Promise.any(GATEWAYS.slice(0, PARALLEL).map((g) => fetchFrom(g, ref)));
    } catch (err: any) {
      for (const e of err?.errors || [err]) errors.push(String(e?.message || e));
    }

    for (const g of GATEWAYS.slice(PARALLEL)) {
      try {
        return await fetchFrom(g, ref);
      } catch (e: any) {
        errors.push(String(e?.message || e));
      }
    }
  }

  throw new Error(errors.slice(-4).join('; '));
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('u') || '';
  const ref = parseIpfsRef(input);

  if (!ref) {
    return new Response(JSON.stringify({ error: 'Not an IPFS address' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  let upstream: Response;
  try {
    upstream = await race(ref);
  } catch (e: any) {
    // 502, bo zawiodla strona trzecia, nie ten serwer. Krotki cache negatywny,
    // zeby padnieta bramka nie zamienila jednej karty w petle zadan.
    return new Response(JSON.stringify({ error: 'No gateway served this CID', detail: String(e?.message || e) }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' },
    });
  }

  const declared = Number(upstream.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'Content too large' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }

  const buffer = await upstream.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'Content too large' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
      // CID = skrot tresci, wiec ta odpowiedz nie zdezaktualizuje sie nigdy.
      'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
    },
  });
}
