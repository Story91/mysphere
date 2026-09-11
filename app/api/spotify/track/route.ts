/**
 * GET /api/spotify/track?url=<link do utworu>
 *
 * Zamienia wklejony link Spotify na obiekt `musicTrack` posta. Nie potrzebuje
 * klucza Spotify ani Campa: czyta publiczna strone osadzenia
 * open.spotify.com/embed/track/<id> (nazwa, wykonawcy, czas, okladka, data,
 * adres 30-sekundowego podgladu) i oficjalne oEmbed jako zapas na tytul
 * i miniature. Tlo tej decyzji: app/basechat/components/spotifyLink.ts.
 *
 * BEZPIECZENSTWO. Serwer nigdy nie pobiera adresu podanego przez klienta -
 * z wejscia wyciaga wylacznie 22-znakowe id i sam buduje oba adresy na
 * open.spotify.com. Zly link konczy sie 400, nie zadaniem na zewnatrz.
 *
 * ODPOWIEDZI. Ten sam podzial, ktory kompozytor juz rozumie (spotifyState):
 *   - nie da sie odczytac linku      -> 400 { error, code: 'invalid_link' }
 *   - Spotify nie oddal danych       -> 502 { error, code: 'upstream_failed' }
 *   - powodzenie                     -> 200 { success: true, data: track }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  parseSpotifyTrackId,
  extractEmbedEntity,
  buildTrackFromSources,
  type EmbedEntity,
  type OEmbedData,
} from '../../../basechat/components/spotifyLink';

export const dynamic = 'force-dynamic';

/** Strona osadzenia i oEmbed to publiczne, powolne zrodla - 8 s to duzo zapasu. */
const UPSTREAM_TIMEOUT_MS = 8_000;

const BROWSER_HEADERS = {
  // Bez User-Agenta przegladarki Spotify oddaje strone bez __NEXT_DATA__.
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en',
};

async function fetchEmbedEntity(id: string): Promise<EmbedEntity | null> {
  try {
    const response = await fetch(`https://open.spotify.com/embed/track/${id}`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // Utwor sie nie zmienia - godzina w cache Next/Vercel odciaza Spotify.
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return extractEmbedEntity(await response.text());
  } catch {
    return null;
  }
}

async function fetchOEmbed(id: string): Promise<OEmbedData | null> {
  try {
    const target = encodeURIComponent(`https://open.spotify.com/track/${id}`);
    const response = await fetch(`https://open.spotify.com/oembed?url=${target}`, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return (await response.json()) as OEmbedData;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const id = parseSpotifyTrackId(request.nextUrl.searchParams.get('url') || '');
  if (!id) {
    return NextResponse.json(
      {
        success: false,
        code: 'invalid_link',
        error: 'That is not a Spotify track link. Paste a link like https://open.spotify.com/track/...',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const [entity, oembed] = await Promise.all([fetchEmbedEntity(id), fetchOEmbed(id)]);
  const track = buildTrackFromSources(id, entity, oembed);

  if (!track) {
    return NextResponse.json(
      {
        success: false,
        code: 'upstream_failed',
        error: 'Spotify did not return this track. Check the link and try again.',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { success: true, data: track, source: entity ? 'embed' : 'oembed' },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
