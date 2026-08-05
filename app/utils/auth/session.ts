/**
 * Fundament serwerowej sesji SIWE.
 *
 * PO CO: aplikacja do tej pory nie miala ZADNEJ serwerowej tozsamosci - adres
 * uzytkownika byl trzymany w localStorage po stronie klienta i nigdy nie byl
 * weryfikowany. Ten modul daje minimalny, bezstanowy token sesji podpisany
 * HMAC-SHA256, ktory po weryfikacji podpisu SIWE laduje w httpOnly cookie.
 *
 * CZEGO JESZCZE NIE ROBI:
 * - nie ma unieważniania (revocation) - token jest bezstanowy, do wylogowania
 *   sluzy skasowanie cookie; skradziony token dziala do expiresAt,
 * - nie ma rotacji sekretu ani wersjonowania formatu tokenu,
 * - nie jest jeszcze przez nic uzywany (patrz trasy w app/api/auth/*).
 *
 * UWAGA: dziala tylko na runtime 'nodejs' (node:crypto nie istnieje na edge).
 */

import crypto from 'node:crypto';

/** Nazwa cookie z podpisanym tokenem sesji. */
export const SESSION_COOKIE = 'mysphere_session';

/** Nazwa cookie z jednorazowym nonce uzywanym w wiadomosci SIWE. */
export const NONCE_COOKIE = 'mysphere_nonce';

/** Czas zycia sesji w sekundach (7 dni). */
/**
 * Zywotnosc sesji: 2 godziny, odnawiana przy aktywnosci (patrz
 * shouldRollSession + GET /api/auth/session).
 *
 * Dlaczego tak krotko: sesja jest BEZSTANOWA, wiec nie da sie jej uniewaznic
 * zdalnie - jedyne co dziala to skasowanie cookie w tej konkretnej przegladarce.
 * Przy 7 dniach cookie przezywalo odlaczenie portfela i na wspoldzielonym
 * urzadzeniu pozwalaloby dzialac w cudzym imieniu przez tydzien. Rollowanie
 * sprawia, ze aktywny uzytkownik nie odczuwa krotkiego TTL, a porzucona sesja
 * wygasa w godziny, nie w dni.
 */
export const SESSION_TTL_SECONDS = 60 * 60 * 2;

/**
 * Sesje odnawiamy, gdy zuzyla juz polowe swojego zycia. Nie przy kazdym
 * zadaniu - inaczej wysylalibysmy Set-Cookie bez przerwy.
 */
export const SESSION_ROLL_AFTER_SECONDS = SESSION_TTL_SECONDS / 2;

/**
 * Czy warto wystawic swiezy token dla tej sesji.
 */
export function shouldRollSession(session: SessionPayload, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return nowSeconds - session.issuedAt >= SESSION_ROLL_AFTER_SECONDS;
}

/**
 * Nowy token dla juz zweryfikowanej sesji, z przesunietym oknem waznosci.
 * Adres i chainId przenoszone bez zmian - rollowanie NIE jest ponownym
 * uwierzytelnieniem, tylko przedluzeniem waznosci.
 */
export function rollSession(session: SessionPayload, nowSeconds = Math.floor(Date.now() / 1000)): string {
  return createSession({
    address: session.address,
    chainId: session.chainId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + SESSION_TTL_SECONDS,
  });
}

/**
 * Zawartosc sesji. issuedAt / expiresAt sa w SEKUNDACH uniksowych,
 * zeby bez konwersji pasowaly do cookie maxAge.
 */
export interface SessionPayload {
  address: `0x${string}`;
  chainId: number;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Minimalny ksztalt magazynu cookies, jaki nam wystarcza.
 * Pasuje strukturalnie zarowno do wyniku cookies() z next/headers,
 * jak i do request.cookies z NextRequest - dzieki temu helper dziala
 * i w trasach API, i w komponentach serwerowych.
 */
export interface CookieStoreLike {
  get(name: string): { value: string } | undefined;
}

/**
 * Zwraca sekret do podpisywania sesji.
 * Celowo RZUCA, gdy sekret nie jest ustawiony - brak konfiguracji nie moze
 * oznaczac cichego przepuszczania sesji.
 */
function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'AUTH_SESSION_SECRET nie jest ustawiony. Ustaw go w zmiennych srodowiskowych ' +
        '(np. wynik `openssl rand -hex 32`), inaczej sesje nie moga byc podpisywane ani weryfikowane.'
    );
  }
  return secret;
}

/** base64url z surowego stringa UTF-8. */
function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Odwrotnosc encodeBase64Url. */
function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

/** HMAC-SHA256 z czesci danych, zwrocony jako base64url. */
function signBody(body: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
}

/** Porownanie podpisow w stalym czasie (odporne na timing attack). */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual rzuca przy roznych dlugosciach, wiec dlugosc sprawdzamy wczesniej.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Podstawowa walidacja ksztaltu payloadu po deserializacji JSON. */
function isValidPayload(value: unknown): value is SessionPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.address === 'string' &&
    /^0x[a-fA-F0-9]{40}$/.test(candidate.address) &&
    typeof candidate.chainId === 'number' &&
    Number.isFinite(candidate.chainId) &&
    typeof candidate.issuedAt === 'number' &&
    Number.isFinite(candidate.issuedAt) &&
    typeof candidate.expiresAt === 'number' &&
    Number.isFinite(candidate.expiresAt)
  );
}

/**
 * Tworzy token sesji w formacie: base64url(JSON) + '.' + base64url(HMAC-SHA256).
 * Rzuca, gdy brakuje AUTH_SESSION_SECRET.
 */
export function createSession(payload: SessionPayload): string {
  const body = encodeBase64Url(JSON.stringify(payload));
  return `${body}.${signBody(body)}`;
}

/**
 * Weryfikuje token sesji.
 * Zwraca null przy: zlym formacie, zlym podpisie, niepoprawnym JSON,
 * niepoprawnym ksztalcie payloadu ORAZ po uplynieciu expiresAt.
 * Rzuca tylko wtedy, gdy brakuje AUTH_SESSION_SECRET (blad konfiguracji,
 * ktory ma byc glosny, a nie zamieniony na "brak sesji").
 */
export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  if (!body || !signature) return null;

  if (!safeCompare(signature, signBody(body))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(body));
  } catch {
    return null;
  }

  if (!isValidPayload(parsed)) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (parsed.expiresAt <= nowSeconds) return null;

  return parsed;
}

/**
 * Wyciaga i weryfikuje sesje z magazynu cookies.
 * Przyjmuje wynik cookies() z next/headers (lub request.cookies z NextRequest),
 * zeby dalo sie go uzyc i w trasach API, i w komponentach serwerowych.
 */
export function getSessionFromCookies(cookieStore: CookieStoreLike): SessionPayload | null {
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
