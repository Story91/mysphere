import type { VaultFacts } from '../types';
import type { CuratorSnapshot, VaultSnapshotEntry } from './types';

/**
 * `VaultFacts` z API -> migawka do porownania.
 *
 * Osobny plik, bo to jedyne miejsce, w ktorym warstwa zapisu dotyka kontraktu
 * `VaultFacts`. Gdy tamten ksztalt sie zmieni, kompilator wskaze TU, a nie
 * w piatym pliku z rzedu.
 */

/**
 * Adres na male litery. To jest klucz porownania miedzy migawkami, wiec jedna
 * zmiana zapisu po stronie API ("0xBeeF..." kontra "0xbeef...") bez tego
 * wyprodukowalaby wpis "skarbiec zszedl z listy" i obok "skarbiec sie pojawil"
 * o tym samym skarbcu.
 */
function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function toSnapshotEntries(vaults: VaultFacts[]): VaultSnapshotEntry[] {
  const entries = vaults.map((facts) => ({
    address: normalizeAddress(facts.address),
    name: facts.name,
    assetSymbol: facts.assetSymbol,
    curator: facts.curator,
    feeBps: facts.feeBps,
    totalAssetsUsd: facts.totalAssetsUsd,
  }));

  // Deduplikacja po adresie. API nie powinno zwrocic tego samego skarbca dwa
  // razy, ale gdyby zwrocilo, dwie pozycje o tym samym kluczu daja porownanie,
  // ktore zaleznie od kolejnosci widzi zmiane albo jej nie widzi.
  const unique = new Map<string, VaultSnapshotEntry>();
  for (const entry of entries) {
    if (!unique.has(entry.address)) unique.set(entry.address, entry);
  }

  // Stala kolejnosc (po adresie), zeby dokument stanu nie rozniil sie miedzy
  // dniami samym przetasowaniem tablicy.
  return Array.from(unique.values()).sort((a, b) => a.address.localeCompare(b.address));
}

/**
 * Zbudowanie migawki do zapisu.
 *
 * `firstObservedAt` przechodzi z poprzedniej migawki i NIGDY nie jest
 * nadpisywany biezacym czasem - to jedyne pole, ktore mowi, od kiedy w ogole
 * patrzymy. Bez niego pusty rejestr wygladalby po roku tak samo jak pierwszego
 * dnia, a to sa dwie zupelnie rozne informacje.
 */
export function buildSnapshot(
  vaults: VaultFacts[],
  now: number,
  previous: CuratorSnapshot | null
): CuratorSnapshot {
  return {
    observedAt: now,
    firstObservedAt: previous ? previous.firstObservedAt : now,
    checkCount: (previous ? previous.checkCount : 0) + 1,
    entries: toSnapshotEntries(vaults),
  };
}
