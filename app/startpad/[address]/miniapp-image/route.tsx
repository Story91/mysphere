import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import {
  TokenShareCard,
  TokenShareFallback,
  TOKEN_OG_CACHE_HEADERS,
} from '../../../components/og/TokenShareCard';
import { chainHintFrom, loadTokenCard } from '../../share/tokenCard';

/**
 * Ta sama karta tokena w proporcji 3:2 - wylacznie dla embeddu miniappki.
 *
 * `fc:miniapp` (i stary `fc:frame`) oczekuja 3:2. Wskazanie w embedzie karty OG
 * (1200x630, czyli 1.91:1) oznaczaloby, ze Base App i klienci Farcastera
 * przycinaja ja samodzielnie - a przycinaja z gory i z dolu, czyli zabieraja
 * dokladnie mnoznik i wykres. Ta sama decyzja i ten sam powod, co przy
 * app/miniapp-image/route.tsx dla strony glownej.
 *
 * Route Handler, a nie plik metadanych: to nie jest karta zadnej strony, tylko
 * zasob wskazywany z JSON-a w tagu <meta>. Za to dostaje parametry zapytania,
 * ktorych konwencja plikowa nie widzi - wiec `?c=` z adresu udostepnienia
 * oszczedza tu pytania trzech sieci naraz.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIZE = { width: 1200, height: 800 };

export async function GET(request: NextRequest, { params }: { params: { address: string } }) {
  const hint = chainHintFrom(request.nextUrl.searchParams.get('c') ?? undefined);
  const data = await loadTokenCard(params.address, hint).catch(() => null);

  return new ImageResponse(
    data ? <TokenShareCard data={data} height={SIZE.height} /> : <TokenShareFallback />,
    { ...SIZE, headers: TOKEN_OG_CACHE_HEADERS }
  );
}
