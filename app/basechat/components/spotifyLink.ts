/**
 * UTWOR Z WKLEJONEGO LINKU SPOTIFY - czysta logika, bez sieci i DOM-u.
 *
 * ===========================================================================
 * DLACZEGO TEN PLIK ISTNIEJE
 * ===========================================================================
 * Jedynym zrodlem utworow w kompozytorze byl Camp Network (/api/camp/spotify).
 * Sprawdzone 2026-09-11 na zywym API Campa, na 40 portfelach z podpietym
 * Spotify: KAZDY ma `lastSynced: null`, "recently played" to pusta tablica,
 * "saved tracks" odpowiada 401, a "top" 500. Camp nie zaciagnal historii
 * nikomu, a Origin SDK 1.3.x nie ma juz w ogole klasy SpotifyAPI - Camp
 * zostawil sobie tylko samo podpinanie konta. Czyli "wybierz utwor z Twojego
 * Spotify" nie ma prawa zadzialac dla nikogo, niezaleznie od naszego kodu.
 *
 * Nowa droga nie potrzebuje ani Campa, ani klucza Spotify: czlowiek wkleja
 * link do utworu, a serwer (/api/spotify/track) czyta publiczna strone
 * osadzenia open.spotify.com/embed/track/<id>. Ta strona niesie nazwe,
 * wykonawcow, czas trwania, okladke, date wydania i - co najwazniejsze dla
 * odtwarzacza w feedzie - adres 30-sekundowego podgladu. Zapasem jest
 * oficjalne oEmbed (tytul + miniatura), gdy strona osadzenia zmieni ksztalt.
 *
 * Wynik ma DOKLADNIE ksztalt `musicTrack`, ktory od zawsze siedzi w postach
 * (preview_url, artists[].name, album.images[].url, external_urls.spotify),
 * wiec feed, karta utworu i odtwarzacz nie wymagaja zadnej zmiany.
 */

import type { SpotifyTrackData } from './SpotifyTrackCard';

export type SpotifyTrack = SpotifyTrackData['track'];

/** Identyfikator Spotify: 22 znaki base62. */
const TRACK_ID = /^[0-9A-Za-z]{22}$/;

/**
 * Wyciaga id utworu z tego, co ludzie naprawde wklejaja:
 *   https://open.spotify.com/track/ID?si=...
 *   https://open.spotify.com/intl-pl/track/ID
 *   https://open.spotify.com/embed/track/ID
 *   spotify:track:ID
 *   samo ID
 * Linki do albumow, playlist i artystow oddaja null - post nosi jeden utwor.
 */
export function parseSpotifyTrackId(input: string): string | null {
  const text = (input || '').trim();
  if (!text) return null;

  if (TRACK_ID.test(text)) return text;

  const uri = text.match(/^spotify:track:([0-9A-Za-z]{22})$/);
  if (uri) return uri[1];

  let url: URL;
  try {
    url = new URL(text.startsWith('http') ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!/(^|\.)spotify\.com$/i.test(url.hostname)) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  const at = segments.indexOf('track');
  if (at === -1) return null;
  const id = segments[at + 1];
  return id && TRACK_ID.test(id) ? id : null;
}

/** Fragment strony osadzenia, ktory nas interesuje (props.pageProps.state.data.entity). */
export interface EmbedEntity {
  id?: string;
  name?: string;
  title?: string;
  duration?: number;
  artists?: Array<{ name?: string; uri?: string }>;
  releaseDate?: { isoString?: string };
  audioPreview?: { url?: string } | null;
  visualIdentity?: { image?: Array<{ url?: string; maxHeight?: number; maxWidth?: number }> };
}

export interface OEmbedData {
  title?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

/** Wyciaga JSON __NEXT_DATA__ ze strony osadzenia; null, gdy strona zmienila ksztalt. */
export function extractEmbedEntity(html: string): EmbedEntity | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const json = JSON.parse(match[1]);
    const entity = json?.props?.pageProps?.state?.data?.entity;
    return entity && typeof entity === 'object' ? (entity as EmbedEntity) : null;
  } catch {
    return null;
  }
}

function artistUriToUrl(uri?: string): string | undefined {
  const match = (uri || '').match(/^spotify:artist:([0-9A-Za-z]{22})$/);
  return match ? `https://open.spotify.com/artist/${match[1]}` : undefined;
}

/**
 * Sklada utwor z dwoch zrodel. Strona osadzenia jest pierwsza (ma wszystko),
 * oEmbed lata dziury (tytul, okladka). Bez zadnego z nich - null: post nie
 * moze niesc utworu, o ktorym wiemy tylko tyle, ze ma id.
 */
export function buildTrackFromSources(
  id: string,
  entity: EmbedEntity | null,
  oembed: OEmbedData | null
): SpotifyTrack | null {
  const name = entity?.name || entity?.title || oembed?.title || '';
  if (!name) return null;

  const images = (entity?.visualIdentity?.image || [])
    .filter((image) => typeof image?.url === 'string' && image.url)
    .map((image) => ({ url: image.url as string, height: image.maxHeight ?? 0, width: image.maxWidth ?? 0 }))
    // Najwieksza pierwsza - tak uklada je Spotify Web API, a karta bierze [0].
    .sort((a, b) => b.width - a.width);
  if (images.length === 0 && oembed?.thumbnail_url) {
    images.push({
      url: oembed.thumbnail_url,
      height: oembed.thumbnail_height ?? 0,
      width: oembed.thumbnail_width ?? 0,
    });
  }

  const artists = (entity?.artists || [])
    .filter((artist) => typeof artist?.name === 'string' && artist.name)
    .map((artist) => {
      const url = artistUriToUrl(artist.uri);
      return url ? { name: artist.name as string, external_urls: { spotify: url } } : { name: artist.name as string };
    });

  const releaseDate = entity?.releaseDate?.isoString;

  return {
    id,
    name,
    artists,
    album: {
      // Strona osadzenia nie zdradza nazwy albumu. Puste pole, nie zmyslona
      // nazwa - karta i tak pokazuje "Unknown Album" tylko przy braku.
      name: '',
      images,
      ...(releaseDate ? { release_date: releaseDate.slice(0, 10), release_date_precision: 'day' } : {}),
    },
    duration_ms: typeof entity?.duration === 'number' ? entity.duration : 0,
    ...(entity?.audioPreview?.url ? { preview_url: entity.audioPreview.url } : {}),
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
  };
}
