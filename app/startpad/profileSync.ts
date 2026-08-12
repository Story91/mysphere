/**
 * Dogrywanie profilu tokena (logo + opis) na serwer - z ponawianiem i trwala
 * kolejka. Dotad byl jeden strzal fire-and-forget: 401 (brak sesji SIWE),
 * 404 (wyscig z RPC tuz po starcie) albo `logoSaved: false` (czkawka Bloba)
 * i logo zostawalo TYLKO w localStorage tworcy - tablica u wszystkich innych
 * pokazywala pusty glif, a tworca nie mial jak tego zauwazyc.
 *
 * Dwa filary naprawy:
 *  - `postProfileWithRetry` ponawia wysylke (404/5xx/siec/Blob), a 401/403
 *    zglasza od razu jako brak sesji - retry bez zalogowania nic nie da;
 *  - kolejka w localStorage pamieta wpisy, ktore NIE doszly, i board dogrywa
 *    je przy kolejnych wejsciach, az serwer potwierdzi zapis.
 *
 * Pamiec jest wstrzykiwana (StorageLike), wiec calosc testuje sie bez
 * przegladarki - patrz test/StartpadProfileSync.test.ts.
 */

export type ProfilePayload = {
  address: string;
  chainId: number;
  logoUrl: string | null;
  description: string;
};

export type PendingProfile = ProfilePayload & { savedAt: number };

export type ProfilePostOutcome = 'saved' | 'needs_session' | 'failed';

export type ProfileResponse = { status: number; ok: boolean; logoSaved?: boolean };

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Odstepy miedzy probami: szybka poprawka wyscigu z RPC, potem dluzszy oddech. */
const DEFAULT_DELAYS_MS = [4_000, 10_000, 20_000];

/** localStorage, gdy jest - null na serwerze i w trybach, ktore go blokuja. */
export function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Jedna wysylka profilu na serwer, znormalizowana do ksztaltu, ktory rozumie
 * `postProfileWithRetry`. `logoSaved` z ciala odpowiedzi odroznia "zapisal
 * i logo, i opis" od "zapisal opis, logo nie doszlo do Bloba".
 */
export async function sendTokenProfile(payload: ProfilePayload): Promise<ProfileResponse> {
  const response = await fetch('/api/launchpad/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let logoSaved: boolean | undefined;
  try {
    const data = (await response.json()) as { logoSaved?: boolean };
    logoSaved = typeof data.logoSaved === 'boolean' ? data.logoSaved : undefined;
  } catch {
    logoSaved = undefined;
  }
  return { status: response.status, ok: response.ok, logoSaved };
}

export async function postProfileWithRetry(
  send: () => Promise<ProfileResponse>,
  opts: {
    /** Czy payload niesie logo - wtedy sukces wymaga `logoSaved: true`. */
    expectLogo: boolean;
    attempts?: number;
    delaysMs?: number[];
    sleep?: (ms: number) => Promise<void>;
  }
): Promise<ProfilePostOutcome> {
  const attempts = opts.attempts ?? 4;
  const delays = opts.delaysMs ?? DEFAULT_DELAYS_MS;
  const sleep = opts.sleep ?? wait;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(delays[Math.min(attempt - 1, delays.length - 1)] ?? 0);
    try {
      const response = await send();
      // Brak sesji nie naprawi sie sam - kolejne proby tylko spamia serwer.
      if (response.status === 401 || response.status === 403) return 'needs_session';
      // 200 z `logoSaved: false` przy wyslanym logo to porazka Bloba, nie sukces.
      if (response.ok && (!opts.expectLogo || response.logoSaved === true)) return 'saved';
    } catch {
      // Blad sieci - liczy sie jak proba, przechodzimy do kolejnej.
    }
  }
  return 'failed';
}

const PENDING_KEY = (chainId: number) => `startpad.pendingProfiles.${chainId}`;
/** Po tygodniu wpis jest martwy - tworca i tak moze dograc logo na stronie tokena. */
const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Sufit wpisow per siec - data-URL-e sa ciezkie, localStorage ma limit. */
const PENDING_MAX_ENTRIES = 8;

function readAll(store: StorageLike | null, chainId: number): PendingProfile[] {
  if (!store) return [];
  try {
    const raw = store.getItem(PENDING_KEY(chainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingProfile[]) : [];
  } catch {
    return [];
  }
}

function writeAll(store: StorageLike | null, chainId: number, entries: PendingProfile[]): void {
  if (!store) return;
  try {
    if (entries.length === 0) store.removeItem(PENDING_KEY(chainId));
    else store.setItem(PENDING_KEY(chainId), JSON.stringify(entries));
  } catch {
    // Brak miejsca / tryb prywatny - kolejka to siatka bezpieczenstwa, nie dane.
  }
}

export function savePendingProfile(store: StorageLike | null, entry: ProfilePayload & { savedAt: number }): void {
  const key = entry.address.toLowerCase();
  const rest = readAll(store, entry.chainId).filter((item) => item.address.toLowerCase() !== key);
  const next = [...rest, { ...entry }].slice(-PENDING_MAX_ENTRIES);
  writeAll(store, entry.chainId, next);
}

export function loadPendingProfiles(store: StorageLike | null, chainId: number, now: number): PendingProfile[] {
  return readAll(store, chainId).filter(
    (entry) => typeof entry.savedAt === 'number' && now - entry.savedAt < PENDING_MAX_AGE_MS
  );
}

export function clearPendingProfile(store: StorageLike | null, chainId: number, address: string): void {
  const key = address.toLowerCase();
  const rest = readAll(store, chainId).filter((entry) => entry.address.toLowerCase() !== key);
  writeAll(store, chainId, rest);
}

/**
 * Dogrywa zaległe wpisy przy wejsciu na tablice. Sukces czysci wpis; porazka
 * zostawia go na nastepne wejscie; brak sesji PRZERYWA petle - kazdy kolejny
 * wpis dostalby to samo 401, a wpisy i tak czekaja na zalogowanie.
 */
export async function flushPendingProfiles(
  store: StorageLike | null,
  chainId: number,
  now: number,
  post: (entry: PendingProfile) => Promise<ProfilePostOutcome>
): Promise<{ saved: number; kept: number }> {
  const pending = loadPendingProfiles(store, chainId, now);
  let saved = 0;
  let kept = 0;
  for (let index = 0; index < pending.length; index += 1) {
    const outcome = await post(pending[index]);
    if (outcome === 'saved') {
      clearPendingProfile(store, chainId, pending[index].address);
      saved += 1;
    } else if (outcome === 'needs_session') {
      kept += pending.length - index;
      break;
    } else {
      kept += 1;
    }
  }
  return { saved, kept };
}
