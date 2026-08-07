/**
 * Wspolna warstwa dla konektora Camp Network.
 *
 * DLACZEGO ISTNIEJE: mechanizm podpinania kont spolecznosciowych (X, Spotify,
 * TikTok) siedzial do tej pory wylacznie na /mycamp, a ta trasa jest wylaczona
 * w config/routeStatus.js. Same trasy API (app/api/camp/*) sa czynne - lista
 * DISABLED_ROUTES lapie tylko '/mycamp' i '/mycamp/:path*'. Ten modul wyciaga
 * konfiguracje i normalizacje odpowiedzi SDK z komponentu, zeby dalo sie ich
 * uzyc z panelu profilu w /basechat.
 *
 * CZEGO TU NIE MA: zadnego wlasnego magazynu stanu. Podpiete konta trzyma Camp
 * (zrodlo prawdy), a kopia do statystyk ladunku w Firestore idzie ta sama
 * droga co wczesniej z /mycamp: POST /api/camp-stats -> saveMySphereUserConnections
 * -> kolekcja `mySphereUserSocials`. Drugiego zapisu celowo nie zakladamy.
 */

/** Sieci, ktore Camp Origin SDK faktycznie obsluguje (constants.AVAILABLE_SOCIALS). */
export type CampSocialId = 'twitter' | 'spotify' | 'tiktok';

/**
 * Klucz klienta Camp. Jawny, bo SDK musi go miec w przegladarce - to
 * identyfikator aplikacji, a nie sekret. Sekret (CAMP_API_KEY) zostaje po
 * stronie serwera w app/api/camp/*.
 */
export const CAMP_CLIENT_ID = process.env.NEXT_PUBLIC_CAMP_CLIENT_ID || '';

export interface CampSocialDescriptor {
  id: CampSocialId;
  label: string;
  /**
   * 'oauth'  - SDK robi pelne przekierowanie na Camp i wraca na redirectUri.
   * 'handle' - SDK wysyla POST z nazwa uzytkownika, bez opuszczania strony.
   *
   * Rozroznienie jest istotne dla UI: przy 'oauth' strona zniknie uzytkownikowi
   * spod palca i trzeba go o tym uprzedzic.
   */
  flow: 'oauth' | 'handle';
  /**
   * Nazwy funkcji zwracanych przez useLinkSocials(). SDK bierze je z prototypu
   * klasy Auth, wiec licza sie DOKLADNE nazwy metod - `linkTikTok`, nie
   * `linkTiktok`. (app/mycamp/page.tsx destrukturyzuje `linkTiktok`, czyli
   * dostaje undefined; tam nikt tego nie wola, wiec bledu nie widac.)
   */
  linkFn: string;
  unlinkFn: string;
  /** Co uzytkownik ma zrobic - pokazywane pod nazwa sieci. */
  hint: string;
}

export const CAMP_SOCIALS: CampSocialDescriptor[] = [
  {
    id: 'twitter',
    label: 'X',
    flow: 'oauth',
    linkFn: 'linkTwitter',
    unlinkFn: 'unlinkTwitter',
    hint: 'Camp opens X and brings you back here.',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    flow: 'oauth',
    linkFn: 'linkSpotify',
    unlinkFn: 'unlinkSpotify',
    hint: 'Camp opens Spotify and brings you back here.',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    flow: 'handle',
    linkFn: 'linkTikTok',
    unlinkFn: 'unlinkTikTok',
    hint: 'Type your handle - TikTok has no redirect step here.',
  },
];

/**
 * Adres powrotu po OAuth. Camp dostaje go jako `redirect_url` i odsyla na niego
 * przegladarke.
 *
 * Domyslnie: origin + pathname biezacej strony (bez query) - uzytkownik wraca
 * tam, skad wyszedl, i nie ciagnie za soba starych parametrow. Wartosc czytana
 * jest RAZ, przy tworzeniu instancji Auth: CampProvider trzyma ja w useState,
 * wiec pozniejsze zmiany propsa nie maja juz znaczenia.
 *
 * NADPISANIE: jesli Camp waliduje `redirect_url` wzgledem listy dozwolonych
 * adresow dla danego clientId, nowa sciezka (/basechat/) musi tam byc dodana.
 * Do czasu, az to sie stanie, `NEXT_PUBLIC_CAMP_REDIRECT_URI` pozwala wskazac
 * adres, ktory juz jest dopuszczony - bez zmiany kodu.
 */
export function buildCampRedirectUri(): string {
  const override = process.env.NEXT_PUBLIC_CAMP_REDIRECT_URI;
  if (override) return override;
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Odpowiedz SDK to `Record<string, boolean>` z kluczami wyprowadzonymi z API
 * Campa (`twitterUser` -> `twitter`). Typy SDK deklaruja `Record<string, string>`,
 * co sie z realnym ksztaltem nie zgadza - stad wlasna normalizacja zamiast
 * ufania deklaracji.
 */
export function normalizeLinkedSocials(raw: unknown): Record<CampSocialId, boolean> {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    twitter: Boolean(source.twitter),
    spotify: Boolean(source.spotify),
    tiktok: Boolean(source.tiktok),
  };
}

/** Lista podpietych sieci w kolejnosci z CAMP_SOCIALS - stabilna, wiec porownywalna. */
export function connectedPlatformList(linked: Record<CampSocialId, boolean>): CampSocialId[] {
  return CAMP_SOCIALS.filter((social) => linked[social.id]).map((social) => social.id);
}

/**
 * Kopiuje stan podpiec do `mySphereUserSocials` - tym samym endpointem, ktorego
 * uzywalo /mycamp. Zwraca `false` zamiast rzucac: to zapis pomocniczy do
 * statystyk, a nie warunek dzialania panelu.
 */
export async function syncCampSocialsToProfile(
  address: string,
  connectedPlatforms: CampSocialId[]
): Promise<boolean> {
  if (!address) return false;

  try {
    const response = await fetch('/api/camp-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, connectedPlatforms }),
    });

    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.success);
  } catch (error) {
    console.error('Camp socials sync failed:', error);
    return false;
  }
}

/**
 * Wyciaga czytelny komunikat z bledu SDK. APIError niesie tresc w `message`,
 * ale czasem przylatuje goly string albo obiekt bez message - wtedy lepiej
 * powiedziec "nie wiadomo co", niz pokazac "[object Object]".
 */
export function describeCampError(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return 'Camp did not say why.';
}
