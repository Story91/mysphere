/**
 * Straz trzech tras, ktore wolaja Camp Network NASZYM serwerowym kluczem:
 * app/api/camp/twitter, app/api/camp/spotify i app/api/camp-stats.
 *
 * PO CO ISTNIEJE. Te trasy nie mialy ani jednej wzmianki o sesji ani o
 * ksztalcie adresu. CAMP_API_KEY jest serwerowy i limit u Campa placimy my,
 * wiec kazdy z internetu mogl w petli wolac /api/camp/spotify?address=cokolwiek
 * i wypalac nasz budzet cudzym kosztem. Ten modul zbiera w jednym miejscu to,
 * czego brakowalo: twarda walidacje adresu, wspolne ksztalty odmow i
 * ograniczenie tempa.
 *
 * CZEGO TEN MODUL NIE ROBI - lepiej to wiedziec, niz sie pozniej zdziwic:
 * licznik tempa siedzi w pamieci procesu. Handler na Vercelu zyje w wielu
 * instancjach naraz, a uspiona instancja zeruje licznik razem z pamiecia, wiec
 * realny sufit to limit RAZY liczba zywych instancji. To jest prog zwalniajacy,
 * nie mur. Murem byloby ograniczenie na brzegu (Vercel WAF) albo wspolny
 * licznik w Redisie - projekt nie ma dzis ani jednego, ani drugiego. Nie
 * obiecujemy tego uzytkownikowi w zadnym komunikacie.
 *
 * UWAGA: getSessionFromCookies uzywa node:crypto, wiec kazda trasa, ktora
 * siega tutaj po sesje, MUSI deklarowac runtime = 'nodejs'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '../auth/session';

/** Ten sam ksztalt adresu, ktorego pilnuje monetyzacja (utils/monetization/types). */
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/* ------------------------------------------------------------------------- */
/* Sesja                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Adres z podpisanej sesji SIWE albo null - dokladnie ten sam wzorzec, co w
 * app/api/premium/route.ts i app/api/unlock/route.ts.
 *
 * Blad odczytu (najczesciej brak AUTH_SESSION_SECRET) traktujemy jak brak
 * sesji. Failujemy zamknieto: nieskonfigurowane podpisywanie ma znaczyc
 * "nie wiem, kto to", nigdy "wpusc jako kazdy".
 */
export function campSessionAddress(request: NextRequest): string | null {
  try {
    return getSessionFromCookies(request.cookies)?.address ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------- */
/* Ograniczenie tempa                                                         */
/* ------------------------------------------------------------------------- */

/** Okno licznika. Krotkie, bo chodzi o tempo, nie o dzienny przydzial. */
const WINDOW_MS = 60_000;

/**
 * Ile odczytow na minute. Gosc liczony po adresie IP, zalogowany po adresie z
 * sesji - podpisany portfel jest drozszy do wyprodukowania niz nowe IP, wiec
 * dostaje wiekszy budzet.
 *
 * Skad te liczby: panel profilu (BuilderProfile) robi DWA zapytania na jeden
 * oglaydany profil (X + Spotify), wiec 20 to okolo dziesieciu profili na minute
 * dla niezalogowanego - wiecej, niz ktokolwiek przeczyta, i o rzad wielkosci
 * mniej, niz potrzeba do wypalenia limitu u Campa.
 */
export const CAMP_READ_LIMIT_ANONYMOUS = 20;
export const CAMP_READ_LIMIT_SIGNED_IN = 60;

/** Zapisy sa rzadkie: konektor wysyla je tylko przy realnej zmianie podpiec. */
export const CAMP_WRITE_LIMIT = 20;

interface CounterWindow {
  count: number;
  resetAt: number;
}

const counters = new Map<string, CounterWindow>();

/**
 * Gorna granica liczby kluczy. Bez niej mapa rosnie tak dlugo, jak dlugo zyje
 * instancja - a klucze robi z niej kazde obce IP, czyli dokladnie ten, przed
 * kim sie bronimy.
 */
const MAX_COUNTERS = 5000;

function pruneCounters(now: number): void {
  for (const [key, window] of counters) {
    if (window.resetAt <= now) counters.delete(key);
  }
  // Same wygasle wpisy nie wystarczyly - wolimy stracic wszystkie liczniki
  // (najgorszy skutek: jedno okno wiecej dla biezacych klientow) niz rosnac
  // bez konca w pamieci procesu.
  if (counters.size >= MAX_COUNTERS) counters.clear();
}

interface RateVerdict {
  allowed: boolean;
  /** Ile sekund do konca okna. Zero, gdy zadanie przeszlo. */
  retryAfterSeconds: number;
}

function countHit(key: string, limit: number, now: number): RateVerdict {
  const existing = counters.get(key);

  if (!existing || existing.resetAt <= now) {
    if (counters.size >= MAX_COUNTERS) pruneCounters(now);
    counters.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Adres klienta z naglowkow proxy. Da sie go podszyc, ale na Vercelu
 * x-forwarded-for dokleja brzeg i pierwszy wpis pochodzi od niego - dla
 * licznika tempa to wystarczy. Brak naglowka daje jeden wspolny kubelek
 * 'unknown': wolimy policzyc razem niz nie policzyc wcale.
 */
function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/* ------------------------------------------------------------------------- */
/* Odmowy                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Kazda odmowa niesie ZDANIE po angielsku i kod maszynowy. Kod jest po to, zeby
 * klient odroznil "nie wolno" od "nie wyszlo" i pokazal stan zamiast pustki -
 * awaria to nie jest brak podpietych kont.
 */
function deny(
  status: number,
  code: string,
  error: string,
  retryAfterSeconds?: number
): NextResponse {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (retryAfterSeconds !== undefined) headers['Retry-After'] = String(retryAfterSeconds);
  return NextResponse.json({ error, code, success: false }, { status, headers });
}

export type CampGuardResult =
  | { ok: true; address: string; viewer: string | null }
  | { ok: false; response: NextResponse };

/* ------------------------------------------------------------------------- */
/* Odczyt                                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Straz odczytu danych Campa po adresie portfela.
 *
 * DLACZEGO ODCZYT ZOSTAJE OTWARTY DLA NIEZALOGOWANYCH. Panel profilu w
 * /basechat czyta te trasy dla KAZDEGO ogladanego portfela, nie tylko dla
 * wlasnego, a profile sa publiczne. Zamkniecie odczytu za sesja wygasilo by
 * sekcje X i Spotify kazdemu gosciowi - czyli zepsulo dzialajaca funkcje w
 * imie bezpieczenstwa. Realna szkoda tutaj to palenie naszego limitu u Campa,
 * a nie wyciek: te same dane widac na publicznym profilu. Wiec zamiast sesji
 * dajemy dwie rzeczy, ktore uderzaja dokladnie w te szkode - twardy ksztalt
 * adresu (koniec z proxy na dowolny ciag znakow) i ograniczenie tempa, hojniej
 * odmierzone dla podpisanej sesji.
 */
export function guardCampRead(request: NextRequest, rawAddress: string | null): CampGuardResult {
  if (!rawAddress || rawAddress.trim() === '') {
    return {
      ok: false,
      response: deny(400, 'address_required', 'Provide a wallet address in the address parameter.'),
    };
  }

  const address = rawAddress.trim();
  if (!ADDRESS_REGEX.test(address)) {
    return {
      ok: false,
      response: deny(
        400,
        'invalid_address',
        'That is not a wallet address. Expected 0x followed by 40 hex characters.'
      ),
    };
  }

  const viewer = campSessionAddress(request);
  const limit = viewer ? CAMP_READ_LIMIT_SIGNED_IN : CAMP_READ_LIMIT_ANONYMOUS;
  const key = viewer ? `camp-read:session:${viewer.toLowerCase()}` : `camp-read:ip:${clientKey(request)}`;

  const verdict = countHit(key, limit, Date.now());
  if (!verdict.allowed) {
    return {
      ok: false,
      response: deny(
        429,
        'rate_limited',
        viewer
          ? 'Too many Camp lookups in a short time. Wait a moment and try again.'
          : 'Too many Camp lookups from this network. Wait a moment, or sign in with your wallet for a higher limit.',
        verdict.retryAfterSeconds
      ),
    };
  }

  return { ok: true, address, viewer };
}

/* ------------------------------------------------------------------------- */
/* Zapis                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Straz zapisu powiazan spolecznosciowych.
 *
 * Tu nie ma miejsca na kompromis, ktory zniosl odczyt: zapis dotyka kolekcji
 * mySphereUserSocials pod kluczem adresu, wiec bez sesji obcy podmienialby
 * cudze dane. Sesja jest wymagana ZAWSZE, a adres z ciala zadania musi zgadzac
 * sie z adresem z sesji - inaczej podpisany uzytkownik pisalby cudzy dokument.
 */
export function guardCampWrite(request: NextRequest, rawAddress: unknown): CampGuardResult {
  const viewer = campSessionAddress(request);
  if (!viewer) {
    return {
      ok: false,
      response: deny(
        401,
        'session_required',
        'Sign in with your wallet to save the accounts linked to it.'
      ),
    };
  }

  if (typeof rawAddress !== 'string' || !ADDRESS_REGEX.test(rawAddress.trim())) {
    return {
      ok: false,
      response: deny(
        400,
        'invalid_address',
        'That is not a wallet address. Expected 0x followed by 40 hex characters.'
      ),
    };
  }

  const address = rawAddress.trim();
  if (address.toLowerCase() !== viewer.toLowerCase()) {
    return {
      ok: false,
      response: deny(
        403,
        'address_mismatch',
        'You can only save linked accounts for the wallet you signed in with.'
      ),
    };
  }

  const verdict = countHit(`camp-write:${viewer.toLowerCase()}`, CAMP_WRITE_LIMIT, Date.now());
  if (!verdict.allowed) {
    return {
      ok: false,
      response: deny(
        429,
        'rate_limited',
        'Too many updates in a short time. Wait a moment and try again.',
        verdict.retryAfterSeconds
      ),
    };
  }

  return { ok: true, address, viewer };
}
