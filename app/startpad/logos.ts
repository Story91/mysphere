/**
 * Logo tokenow z Vercel Blob (przez nasz /api/startpad/logos) - z pominieciem
 * Firestore. Klient trzyma mape token->URL w cache per siec, zeby nie odpytywac
 * przy kazdym renderze tablicy. Blad = pusta mapa; karty pokazuja wtedy glyph.
 *
 * Dodatkowo trzymamy TRWALA pamiec logo w localStorage (per siec, adres->URL).
 * Raz zobaczone logo (z Bloba albo z data-URL swiezego startu) juz nie znika:
 * przezywa reload, wypadniecie tokena ze skanu i 60s TTL cache. To zdejmuje
 * "znikajace logo nowych tokenow" niezaleznie od tego, czy Blob zdazyl odpowiedziec.
 */

const TTL_MS = 60 * 1000;
const cache = new Map<number, { at: number; value: Record<string, string> }>();
const inflight = new Map<number, Promise<Record<string, string>>>();

const MEM_KEY = (chainId: number) => `startpad.logos.${chainId}`;

/** Trwala pamiec adres(lower)->URL z localStorage. Cisza gdy brak dostepu. */
export function recallLogos(chainId: number): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MEM_KEY(chainId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Dokłada wpisy do trwalej pamieci (nie nadpisuje istniejacych pustka). */
export function rememberLogos(chainId: number, entries: Record<string, string | undefined>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = recallLogos(chainId);
    let changed = false;
    for (const [addr, url] of Object.entries(entries)) {
      if (!url) continue;
      const key = addr.toLowerCase();
      if (current[key] !== url) {
        current[key] = url;
        changed = true;
      }
    }
    if (changed) window.localStorage.setItem(MEM_KEY(chainId), JSON.stringify(current));
  } catch {
    // Brak miejsca / tryb prywatny - pamiec to wygoda, nie dane. Cisza.
  }
}

/**
 * Pobiera mape logo z Bloba. `bust: true` pomija 60s cache - konieczne tuz po
 * dodaniu nowego logo, zeby nie czekac az TTL wygasnie. Wynik jest zawsze
 * dolaczany do trwalej pamieci.
 */
export async function fetchLogos(chainId: number, opts?: { bust?: boolean }): Promise<Record<string, string>> {
  const hit = cache.get(chainId);
  if (!opts?.bust && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  if (!opts?.bust) {
    const pending = inflight.get(chainId);
    if (pending) return pending;
  }

  const task = (async () => {
    try {
      const res = await fetch(`/api/startpad/logos?chainId=${chainId}`, { headers: { accept: 'application/json' } });
      if (!res.ok) return hit?.value ?? {};
      const data = (await res.json()) as { logos?: Record<string, string> };
      const value = data.logos ?? {};
      cache.set(chainId, { at: Date.now(), value });
      rememberLogos(chainId, value);
      return value;
    } catch {
      return hit?.value ?? {};
    } finally {
      inflight.delete(chainId);
    }
  })();

  if (!opts?.bust) inflight.set(chainId, task);
  return task;
}
