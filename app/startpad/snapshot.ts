/**
 * Migawka tablicy w localStorage - zeby wejscie/odswiezenie pokazywalo od razu
 * ostatni znany stan (z logami), a nie czekalo na pelny skan lancucha. Skan i
 * eventy na zywo lecą dalej w tle i aktualizuja to, co widac.
 *
 * Trzymamy per SIEC (chainId). Zdarzenia na zywo (ticker) NIE sa cache'owane -
 * te maja byc swieze, zeby launchpad zyl.
 */

const KEY = (chainId: number) => `startpad.snapshot.${chainId}`;
// Po dobie migawka jest za stara nawet jako placeholder - i tak dociagnie ja
// skan, ale nie chcemy mignac tygodniowym stanem.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Zapisuje TYLKO to, co da sie zserializowac: `flash` (animacja) i
 * `creatorAccruedWei` (bigint, i tak przeliczany przez skan) sa odrzucane.
 */
export function saveSnapshot(chainId: number, tokens: unknown[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = tokens.map((token) => {
      const { flash, creatorAccruedWei, ...rest } = token as Record<string, unknown>;
      return rest;
    });
    window.localStorage.setItem(KEY(chainId), JSON.stringify({ savedAt: Date.now(), tokens: clean }));
  } catch {
    // Brak miejsca / prywatny tryb - migawka to wygoda, nie dane. Cisza.
  }
}

export function loadSnapshot<T>(chainId: number): T[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY(chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; tokens?: T[] };
    if (!parsed.tokens || !Array.isArray(parsed.tokens)) return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed.tokens;
  } catch {
    return null;
  }
}
