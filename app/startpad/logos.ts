/**
 * Logo tokenow z Vercel Blob (przez nasz /api/startpad/logos) - z pominieciem
 * Firestore. Klient trzyma mape token->URL w cache per siec, zeby nie odpytywac
 * przy kazdym renderze tablicy. Blad = pusta mapa; karty pokazuja wtedy glyph.
 */

const TTL_MS = 60 * 1000;
const cache = new Map<number, { at: number; value: Record<string, string> }>();
const inflight = new Map<number, Promise<Record<string, string>>>();

export async function fetchLogos(chainId: number): Promise<Record<string, string>> {
  const hit = cache.get(chainId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const pending = inflight.get(chainId);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res = await fetch(`/api/startpad/logos?chainId=${chainId}`, { headers: { accept: 'application/json' } });
      if (!res.ok) return hit?.value ?? {};
      const data = (await res.json()) as { logos?: Record<string, string> };
      const value = data.logos ?? {};
      cache.set(chainId, { at: Date.now(), value });
      return value;
    } catch {
      return hit?.value ?? {};
    } finally {
      inflight.delete(chainId);
    }
  })();

  inflight.set(chainId, task);
  return task;
}
