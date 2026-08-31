/**
 * INDEKS TOKENOW - ksztalt listy startow trzymanej w bazie. Czysta logika,
 * bez Firestore i bez lancucha.
 *
 * ===========================================================================
 * PO CO BAZA, SKORO LISTA JEST NA LANCUCHU
 * ===========================================================================
 * Bo odczyt tej listy z przegladarki jest zawodny, a jej niekompletnosc
 * wyglada jak utrata pieniedzy. 13 sierpnia 2026 z tablicy znikal SAUSAGES -
 * najstarszy i najwiekszy token. Sonda pokazala dlaczego: lista powstawala ze
 * skanu zdarzen `Launched` oknami po 9500 blokow, a najstarszy start lezal w
 * NAJGLEBSZYM oknie. Cokolwiek uciela skan - limit publicznego RPC, padniete
 * okno, sufit okien - zabieralo najpierw wlasnie jego.
 *
 * Tak tego nie robi nikt, kto ma z tego zyc: pump.fun serwuje liste z
 * wlasnego API, Flaunch z subgrafu, a lancuch dowozi im wylacznie NOWOSCI.
 * Ten modul jest naszym odpowiednikiem, w skali, ktora mamy.
 *
 * ===========================================================================
 * JEDNA WLASNOSC, NA KTOREJ TO STOI
 * ===========================================================================
 * RAZ ZAPISANY TOKEN NIE MOZE WYPASC Z LISTY. Skan przynosi tylko to, co
 * zobaczyl w swoim zakresie; wszystko poza tym zakresem zostaje z bazy.
 * Dlatego `mergeIndex` NIGDY nie usuwa - umie wylacznie dokladac i odswiezac.
 */

export const TOKEN_INDEX_COLLECTION = 'launchpadTokenIndex';

/** Jeden dokument na siec. Ten sam launchpad na dwoch lancuchach to dwie listy. */
export function indexDocId(chainId: number): string {
  return String(chainId);
}

export type IndexedToken = {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  /** Blok zdarzenia `Launched`, jako string - Firestore nie zna bigintow. */
  launchBlock: string;
  startedAt: number;
};

const clean = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Zapisana lista + to, co zobaczyl skan. Kolejnosc: od NAJNOWSZEGO startu, bo
 * tak czyta sie tablice.
 *
 * Przy tym samym adresie wygrywa wpis ze skanu: nazwa albo symbol mogly dojsc
 * dopiero, gdy RPC zaczelo oddawac pelne zdarzenie.
 */
export function mergeIndex(stored: IndexedToken[], scanned: IndexedToken[]): IndexedToken[] {
  const byAddress = new Map<string, IndexedToken>();

  for (const token of [...stored, ...scanned]) {
    const address = clean(token?.address).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) continue;
    const previous = byAddress.get(address);
    byAddress.set(address, {
      address,
      // Puste pole ze skanu nie moze skasowac nazwy, ktora juz mamy.
      name: clean(token.name) || previous?.name || '',
      symbol: clean(token.symbol) || previous?.symbol || '',
      creator: clean(token.creator) || previous?.creator || '',
      launchBlock: clean(token.launchBlock) || previous?.launchBlock || '0',
      startedAt: Number(token.startedAt) || previous?.startedAt || 0,
    });
  }

  return [...byAddress.values()].sort((a, b) => {
    const left = BigInt(a.launchBlock || '0');
    const right = BigInt(b.launchBlock || '0');
    return left === right ? 0 : left < right ? 1 : -1;
  });
}
