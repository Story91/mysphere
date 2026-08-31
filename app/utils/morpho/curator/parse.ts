import type { CuratorChange, CuratorSnapshot, VaultSnapshotEntry } from './types';

/**
 * Czytanie tego, co lezy w bazie, z zalozeniem, ze moze byc zepsute.
 *
 * PO CO WALIDACJA WLASNYCH DANYCH: dokumenty pisze nasza trasa, ale czyta je
 * strona publiczna, a ksztalt zapisu zmieni sie kiedys szybciej niz ksztalt
 * odczytu. Dokument z poprzedniej wersji, ktoremu brakuje pola, ma tu ODPASC
 * jako jedna pozycja mniej - a nie wyrenderowac sie jako "undefined%" obok
 * nazwy prawdziwego kuratora.
 *
 * Funkcje sa czyste i nie importuja Firestore, wiec uzywa ich zarowno odczyt
 * serwerowy (admin SDK), jak i odczyt strony (klient publiczny).
 */

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Liczba skonczona albo `null`. NaN i Infinity traktujemy jak brak pomiaru. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Znacznik czasu MUSI byc liczba - bez niego wpis nie ma daty, czyli nie jest zapisem. */
function requiredTime(value: unknown): number | null {
  const parsed = num(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function parseEntry(raw: unknown): VaultSnapshotEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const address = str(row.address);
  const name = str(row.name);
  if (!address || !name) return null;

  return {
    address: address.toLowerCase(),
    name,
    assetSymbol: str(row.assetSymbol),
    curator: str(row.curator),
    feeBps: num(row.feeBps),
    totalAssetsUsd: num(row.totalAssetsUsd),
  };
}

/**
 * Migawka stanu. `null`, gdy dokumentu nie da sie uznac za migawke.
 *
 * Uwaga na roznice: migawka BEZ WPISOW jest poprawna (API moglo kiedys zwrocic
 * pusta liste notowanych), ale migawka bez `observedAt` nie jest - punkt
 * odniesienia bez daty nie pozwala powiedziec, czego dotyczy przedzial.
 */
export function parseSnapshot(raw: unknown): CuratorSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;

  const observedAt = requiredTime(doc.observedAt);
  if (observedAt === null) return null;

  const entries = Array.isArray(doc.entries)
    ? doc.entries.map(parseEntry).filter((entry): entry is VaultSnapshotEntry => entry !== null)
    : [];

  const checkCount = num(doc.checkCount);

  return {
    observedAt,
    // Starszy dokument bez tego pola: zakladamy, ze patrzymy od tej migawki.
    // To zaniza staz obserwacji, a nie zawyza - w te strone wolno sie mylic.
    firstObservedAt: requiredTime(doc.firstObservedAt) ?? observedAt,
    checkCount: checkCount !== null && checkCount > 0 ? Math.floor(checkCount) : 1,
    entries,
  };
}

/**
 * Jedna zmiana. `id` przychodzi Z DOKUMENTU (identyfikator w bazie), a nie
 * z jego pol - to ten sam napis, ale zrodlem prawdy jest sciezka dokumentu.
 */
export function parseChange(id: string, raw: unknown): CuratorChange | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;

  const observedAt = requiredTime(doc.observedAt);
  const windowStart = requiredTime(doc.windowStart);
  if (observedAt === null || windowStart === null) return null;

  const rawVault = doc.vault;
  if (!rawVault || typeof rawVault !== 'object') return null;
  const vaultRow = rawVault as Record<string, unknown>;

  const address = str(vaultRow.address);
  const name = str(vaultRow.name);
  if (!address || !name) return null;

  const vault = {
    address: address.toLowerCase(),
    name,
    assetSymbol: str(vaultRow.assetSymbol),
    totalAssetsUsd: num(vaultRow.totalAssetsUsd),
  };

  const base = { id, vault, windowStart, observedAt };

  switch (doc.kind) {
    case 'fee': {
      const fromBps = num(doc.fromBps);
      const toBps = num(doc.toBps);
      // Wpis o prowizji BEZ OBU LICZB nie mowi nic - a narysowany mowilby
      // "z ? na 15%", czyli sugerowalby podwyzke, ktorej nie zmierzylismy.
      if (fromBps === null || toBps === null) return null;
      return { ...base, kind: 'fee', curator: str(doc.curator), fromBps, toBps };
    }
    case 'curator': {
      const fromCurator = str(doc.fromCurator);
      const toCurator = str(doc.toCurator);
      if (!fromCurator || !toCurator) return null;
      return { ...base, kind: 'curator', fromCurator, toCurator };
    }
    case 'listing': {
      if (doc.state !== 'appeared' && doc.state !== 'removed') return null;
      return { ...base, kind: 'listing', curator: str(doc.curator), state: doc.state };
    }
    default:
      return null;
  }
}
