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

/**
 * Srodowisko Camp Origin. MUSI byc PRODUCTION i nie wolno tego pominac.
 *
 * ZMIERZONE 2026-09-11: SDK domyslnie ustawia "DEVELOPMENT" (tak stoi w jego
 * wlasnej dokumentacji: `[options.environment="DEVELOPMENT"]`). W tym trybie
 * cale Origin rozmawia z backendem TESTNETU
 * (origin-backend-iota.vercel.app) i testnetowymi kontraktami Basecamp
 * (123420001114), podczas gdy portfel czlowieka stoi na Camp mainnet (484).
 *
 * OBJAW, ktory to ujawnil: mint konczyl sie bledem o podpisie, a do portfela
 * NIE DOCHODZILA zadna transakcja. I nie mogla - backend testnetu nie wystawi
 * podpisu dla mintu, ktory ma wyladowac na mainnecie. To nie byl blad portfela
 * ani sieci, tylko jedno pominiete pole w konfiguracji.
 *
 * Kontrola zgodnosci: w trybie PRODUCTION SDK wskazuje DATANFT pod
 * 0x39EeE1C3989f0dD543Dee60f8582F7F81F522C38 - dokladnie ten adres, ktory mamy
 * w DEFAULT_IP_NFT_CONTRACT. Czyli jedno i drugie mowi o tej samej kolekcji.
 */
export const CAMP_ENVIRONMENT = 'PRODUCTION' as const;

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
 * Wynik kopiowania stanu podpiec do profilu.
 *
 * DLACZEGO NIE `boolean`. Zapis wymaga teraz podpisanej sesji (POST
 * /api/camp-stats), wiec "nie zapisano" ma co najmniej trzy rozne przyczyny i
 * trzy rozne wyjscia dla uzytkownika: podpisz portfel, poczekaj chwile, albo
 * sprobuj ponownie. Jedno `false` zwijalo je w milczenie - a milczenie tutaj
 * wyglada dokladnie tak samo jak "nic nie podpiales".
 */
export type CampSyncResult =
  | { state: 'saved' }
  /** Brak sesji SIWE - jedyne wyjscie to podpisanie portfela. */
  | { state: 'needs_sign_in'; message: string }
  /** Za szybko - to mija samo. */
  | { state: 'rate_limited'; message: string }
  /** Cokolwiek innego: siec, Firestore, zly ksztalt zadania. */
  | { state: 'failed'; message: string };

/** Domyslne zdanie, gdy serwer nie przyslal wlasnego. */
const SYNC_FALLBACK_MESSAGE = 'Your linked accounts could not be saved to this profile.';

/**
 * Kopiuje stan podpiec do `mySphereUserSocials` - tym samym endpointem, ktorego
 * uzywalo /mycamp. Nie rzuca: zrodlem prawdy o podpieciach jest Camp, a to
 * jest kopia do statystyk. Ale KAZDA nieudana proba wraca z wlasnym stanem i
 * wlasnym zdaniem, zeby panel mial co pokazac zamiast pustki.
 */
export async function syncCampSocialsToProfile(
  address: string,
  connectedPlatforms: CampSocialId[]
): Promise<CampSyncResult> {
  if (!address) {
    return { state: 'failed', message: SYNC_FALLBACK_MESSAGE };
  }

  try {
    const response = await fetch('/api/camp-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Cookie sesji leci tylko z jawnym credentials - bez tego serwer
      // zobaczylby kazde zadanie jako niepodpisane i odsylal 401.
      credentials: 'include',
      body: JSON.stringify({ address, connectedPlatforms }),
    });

    const data = await response.json().catch(() => null) as
      | { success?: unknown; error?: unknown; code?: unknown }
      | null;

    if (response.ok && data?.success) return { state: 'saved' };

    const message = typeof data?.error === 'string' && data.error.trim()
      ? data.error
      : SYNC_FALLBACK_MESSAGE;

    if (data?.code === 'session_required') return { state: 'needs_sign_in', message };
    if (data?.code === 'rate_limited') return { state: 'rate_limited', message };
    return { state: 'failed', message };
  } catch (error) {
    console.error('Camp socials sync failed:', error);
    return { state: 'failed', message: SYNC_FALLBACK_MESSAGE };
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
