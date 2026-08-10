import { NextRequest, NextResponse } from 'next/server';

/**
 * PROXY DO BLOCKSCOUT (plan Builder) - klucz zyje TYLKO tutaj, na serwerze.
 *
 * ===========================================================================
 * DLACZEGO PROXY, A NIE FETCH Z PRZEGLADARKI
 * ===========================================================================
 * Klucz API Buildera (100M kredytow) jest sekretem. Wpuszczony do przegladarki
 * przez `NEXT_PUBLIC_` bylby do odczytania z bundla i kazdy moglby palic nasze
 * kredyty. Dlatego front NIGDY nie zna klucza - wola ten route, a route doklada
 * klucz i przekazuje zapytanie do `api.blockscout.com`.
 *
 * ===========================================================================
 * DLACZEGO ALLOWLISTA, A NIE OTWARTY PROXY
 * ===========================================================================
 * Otwarty proxy = ktokolwiek wysyla dowolne zapytanie na dowolny lancuch NASZYM
 * kluczem. Wiec twardo ograniczamy:
 *   - tylko GET (Blockscout v2 read),
 *   - tylko NASZE lancuchy (84532 Base Sepolia, 4663 Robinhood),
 *   - tylko sciezki odczytu, ktorych naprawde uzywamy (tokens/, addresses/, stats).
 * Wszystko inne dostaje 400/403 ZANIM dotknie klucza.
 */

const BLOCKSCOUT_BASE = 'https://api.blockscout.com';

// Lancuchy, ktore Startpad obsluguje. Spoza tej listy nie ruszamy klucza.
const ALLOWED_CHAINS = new Set(['84532', '4663']);

// Prefiksy sciezek, ktore realnie czytamy. Reszta odbija sie 403 - nie chcemy,
// zeby ktos przez nasz proxy indeksowal cala siec na nasz rachunek.
const ALLOWED_PREFIXES = ['tokens/', 'addresses/', 'stats'];

export async function GET(
  request: NextRequest,
  { params }: { params: { chainId: string; path: string[] } }
) {
  const { chainId, path } = params;

  if (!ALLOWED_CHAINS.has(chainId)) {
    return NextResponse.json({ error: `Chain ${chainId} is not served here.` }, { status: 400 });
  }

  const subPath = (path ?? []).join('/');
  if (!ALLOWED_PREFIXES.some((prefix) => subPath === prefix || subPath.startsWith(prefix))) {
    return NextResponse.json({ error: `Path "${subPath}" is not allowed.` }, { status: 403 });
  }

  const apiKey = process.env.BLOCKSCOUT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'BLOCKSCOUT_API_KEY is not set on the server.' }, { status: 503 });
  }

  // Przepisujemy TYLKO query stringu wolajacego, potem doklejamy klucz. Klucz
  // idzie ostatni, wiec nie da sie go nadpisac parametrem z zewnatrz.
  const incoming = new URL(request.url);
  const forward = new URL(`${BLOCKSCOUT_BASE}/${chainId}/api/v2/${subPath}`);
  incoming.searchParams.forEach((value, key) => {
    if (key !== 'apikey') forward.searchParams.set(key, value);
  });
  forward.searchParams.set('apikey', apiKey);

  try {
    const upstream = await fetch(forward.toString(), {
      headers: { accept: 'application/json' },
      // Liczniki (posiadacze, transfery) nie zmieniaja sie co sekunde. 60 s
      // cache tnie zuzycie kredytow i chroni limit 15 req/s przy wielu kartach,
      // a dane sa wciaz swieze.
      next: { revalidate: 60 },
    });

    const body = await upstream.text();
    // Bledu (402 wyczerpane kredyty, 429 limit) NIE cache'ujemy dlugo - chcemy
    // sprobowac ponownie, gdy kredyty wroca. Klient i tak ma wtedy fallback.
    const ok = upstream.ok;
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': ok
          ? 'public, max-age=30, stale-while-revalidate=60'
          : 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Upstream Blockscout request failed.', detail: String(error) },
      { status: 502 }
    );
  }
}
